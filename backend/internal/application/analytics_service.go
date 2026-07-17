package application

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/analytics"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/payments"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// AnalyticsService implements storefront attribution + aggregates (BE-360).
// Cannot authorize or affect payment, ledger, delivery, KYC, or withdrawal.
type AnalyticsService struct {
	Store       AnalyticsStore
	IDs         ports.IDGenerator
	Clock       ports.Clock
	Log         ports.Logger
	// HashSecret for rotatable visitor/session hashes (never exposed in reads).
	HashSecret string
	// HashKeyVersion labels the current secret generation.
	HashKeyVersion string
}

func (s *AnalyticsService) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now().UTC()
	}
	return time.Now().UTC()
}

func (s *AnalyticsService) hashKeyVersion() string {
	if s.HashKeyVersion != "" {
		return s.HashKeyVersion
	}
	return analytics.HashKeyVersionV1
}

func (s *AnalyticsService) hashVisitor(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	// Keyed hash; never return raw to callers of seller/admin reads.
	return "vh_" + auth.HashTokenKeyed(raw, s.HashSecret+":visitor:"+s.hashKeyVersion())
}

func (s *AnalyticsService) hashSession(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	return "sh_" + auth.HashTokenKeyed(raw, s.HashSecret+":session:"+s.hashKeyVersion())
}

// CaptureCheckoutAttribution binds immutable snapshot at hosted checkout create.
// QRIS_API source is rejected for traffic capture (use EnsureQRISNoAttribution).
func (s *AnalyticsService) CaptureCheckoutAttribution(ctx context.Context, in analytics.CaptureInput) (analytics.OrderSnapshot, error) {
	if s == nil || s.Store == nil {
		return analytics.OrderSnapshot{}, nil
	}
	if in.Source == analytics.SourceQRISAPI || in.Source == payments.SourceQRISAPI {
		return s.EnsureQRISNoAttribution(ctx, in)
	}
	if in.StoreID == "" || in.OrderID == "" {
		return analytics.OrderSnapshot{}, apperr.Validation(apperr.CodeValidationFailed, "storeId and orderId required")
	}
	// Idempotent: existing snapshot
	if existing, err := s.Store.GetOrderSnapshot(ctx, in.OrderID); err == nil && existing.ID != "" {
		return existing, nil
	} else if err != nil && !s.Store.IsNotFound(err) {
		return analytics.OrderSnapshot{}, apperr.Internal(apperr.CodeInternalError, "Attribution lookup failed")
	}

	policy, err := s.Store.GetActivePolicy(ctx)
	if err != nil {
		return analytics.OrderSnapshot{}, apperr.Internal(apperr.CodeInternalError, "Analytics policy unavailable")
	}
	_, merchantID, _, status, err := s.Store.GetStore(ctx, in.StoreID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return analytics.OrderSnapshot{}, apperr.NotFound(apperr.CodeResourceNotFound, "Store not found")
		}
		return analytics.OrderSnapshot{}, apperr.Internal(apperr.CodeInternalError, "Store lookup failed")
	}
	if in.MerchantID != "" && in.MerchantID != merchantID {
		return analytics.OrderSnapshot{}, apperr.NotFound(apperr.CodeResourceNotFound, "Store not found")
	}
	_ = status
	if in.MerchantID == "" {
		in.MerchantID = merchantID
	}

	now := in.OccurredAt
	if now.IsZero() {
		now = s.now()
	}
	dims := analytics.StripAndNormalizeDimensions(
		in.LandingURL, in.ReferrerURL,
		in.UTMSource, in.UTMMedium, in.UTMCampaign, in.UTMContent, in.UTMTerm,
	)
	isBot := in.IsBot
	if policy.BotFilterEnabled && !isBot {
		isBot = analytics.IsBotUserAgent(in.UserAgent)
	}

	visitorHash := s.hashVisitor(in.VisitorRaw)
	sessionHash := s.hashSession(in.SessionRaw)
	if sessionHash == "" && visitorHash != "" {
		// Derive ephemeral session from visitor+order for bind (still hashed).
		sessionHash = s.hashSession(in.VisitorRaw + ":" + in.OrderID)
	}
	if visitorHash == "" {
		visitorHash = s.hashVisitor("anon:" + in.OrderID)
	}
	if sessionHash == "" {
		sessionHash = s.hashSession("anon-sess:" + in.OrderID)
	}

	// Session + checkout event (storefront only).
	sessID := s.IDs.New()
	if !strings.HasPrefix(sessID, "ss_") {
		sessID = "ss_" + sessID
	}
	sess := analytics.Session{
		ID:                   sessID,
		StoreID:              in.StoreID,
		MerchantID:           in.MerchantID,
		VisitorHash:          visitorHash,
		SessionHash:          sessionHash,
		HashKeyVersion:       s.hashKeyVersion(),
		LandingPath:          dims.LandingPath,
		ReferrerOrigin:       dims.ReferrerOrigin,
		UTMSource:            dims.UTMSource,
		UTMMedium:            dims.UTMMedium,
		UTMCampaign:          dims.UTMCampaign,
		UTMContent:           dims.UTMContent,
		UTMTerm:              dims.UTMTerm,
		Channel:              dims.Channel,
		IsBot:                isBot,
		CollectionVersion:    policy.CollectionVersion,
		ConsentNoticeVersion: policy.ConsentNoticeVersion,
		PolicyVersionID:      policy.VersionID,
		FirstSeenAt:          now,
		LastSeenAt:           now,
		CreatedAt:            now,
	}
	sess, err = s.Store.UpsertSession(ctx, sess)
	if err != nil {
		return analytics.OrderSnapshot{}, apperr.Internal(apperr.CodeInternalError, "Session upsert failed")
	}

	evID := s.IDs.New()
	if !strings.HasPrefix(evID, "ae_") {
		evID = "ae_" + evID
	}
	var productID *string
	if in.ProductID != "" {
		p := in.ProductID
		productID = &p
	}
	sid := sess.ID
	ev := analytics.Event{
		ID:                   evID,
		StoreID:              in.StoreID,
		MerchantID:           in.MerchantID,
		SessionID:            &sid,
		ProductID:            productID,
		VisitorHash:          visitorHash,
		SessionHash:          sessionHash,
		HashKeyVersion:       s.hashKeyVersion(),
		EventType:            analytics.EventCheckoutStart,
		LandingPath:          dims.LandingPath,
		ReferrerOrigin:       dims.ReferrerOrigin,
		UTMSource:            dims.UTMSource,
		UTMMedium:            dims.UTMMedium,
		UTMCampaign:          dims.UTMCampaign,
		UTMContent:           dims.UTMContent,
		UTMTerm:              dims.UTMTerm,
		Channel:              dims.Channel,
		IsBot:                isBot,
		IsDirect:             dims.IsDirect,
		CollectionVersion:    policy.CollectionVersion,
		ConsentNoticeVersion: policy.ConsentNoticeVersion,
		PolicyVersionID:      policy.VersionID,
		OccurredAt:           now,
		CreatedAt:            now,
	}
	if _, err := s.Store.InsertEvent(ctx, ev); err != nil {
		return analytics.OrderSnapshot{}, apperr.Internal(apperr.CodeInternalError, "Event insert failed")
	}

	// Last-non-direct 30d selection.
	windowDays := policy.LastNonDirectWindowDays
	if windowDays <= 0 {
		windowDays = analytics.LastNonDirectWindowDays
	}
	cutoff := now.AddDate(0, 0, -windowDays)
	prior, _ := s.Store.ListNonDirectEvents(ctx, in.StoreID, visitorHash, cutoff, now)
	// Include current if non-direct
	if !dims.IsDirect && !isBot {
		prior = append([]analytics.Event{ev}, prior...)
	}
	chosen := analytics.SelectLastNonDirect(prior, now, windowDays)

	snapChannel := dims.Channel
	snapModel := analytics.ModelDirect
	var attrEventID *string
	snapDims := dims
	if chosen != nil {
		snapChannel = chosen.Channel
		snapModel = analytics.ModelLastNonDirect30D
		id := chosen.ID
		attrEventID = &id
		snapDims = analytics.Dimensions{
			LandingPath:    chosen.LandingPath,
			ReferrerOrigin: chosen.ReferrerOrigin,
			UTMSource:      chosen.UTMSource,
			UTMMedium:      chosen.UTMMedium,
			UTMCampaign:    chosen.UTMCampaign,
			UTMContent:     chosen.UTMContent,
			UTMTerm:        chosen.UTMTerm,
			Channel:        chosen.Channel,
			IsDirect:       false,
		}
	}

	snapID := s.IDs.New()
	if !strings.HasPrefix(snapID, "oas_") {
		snapID = "oas_" + snapID
	}
	var piID *string
	if in.PaymentIntentID != "" {
		p := in.PaymentIntentID
		piID = &p
	}
	snap := analytics.OrderSnapshot{
		ID:                   snapID,
		OrderID:              in.OrderID,
		PaymentIntentID:      piID,
		StoreID:              in.StoreID,
		MerchantID:           in.MerchantID,
		ProductID:            productID,
		Source:               analytics.SourceStorefront,
		VisitorHash:          visitorHash,
		SessionHash:          sessionHash,
		HashKeyVersion:       s.hashKeyVersion(),
		LandingPath:          snapDims.LandingPath,
		ReferrerOrigin:       snapDims.ReferrerOrigin,
		UTMSource:            snapDims.UTMSource,
		UTMMedium:            snapDims.UTMMedium,
		UTMCampaign:          snapDims.UTMCampaign,
		UTMContent:           snapDims.UTMContent,
		UTMTerm:              snapDims.UTMTerm,
		Channel:              snapChannel,
		AttributionModel:     snapModel,
		AttributedEventID:    attrEventID,
		CollectionVersion:    policy.CollectionVersion,
		ConsentNoticeVersion: policy.ConsentNoticeVersion,
		PolicyVersionID:      policy.VersionID,
		Converted:            false,
		GrossIDR:             in.GrossIDR,
		CapturedAt:           now,
		CreatedAt:            now,
	}
	out, inserted, err := s.Store.InsertOrderSnapshot(ctx, snap)
	if err != nil {
		return analytics.OrderSnapshot{}, apperr.Internal(apperr.CodeInternalError, "Snapshot insert failed")
	}
	if !inserted {
		// Concurrent winner
		if existing, gerr := s.Store.GetOrderSnapshot(ctx, in.OrderID); gerr == nil {
			return existing, nil
		}
	}
	return out, nil
}

// EnsureQRISNoAttribution records a NONE snapshot so gateway never invents storefront traffic.
func (s *AnalyticsService) EnsureQRISNoAttribution(ctx context.Context, in analytics.CaptureInput) (analytics.OrderSnapshot, error) {
	if s == nil || s.Store == nil {
		return analytics.OrderSnapshot{}, nil
	}
	if in.OrderID == "" {
		return analytics.OrderSnapshot{}, nil
	}
	if existing, err := s.Store.GetOrderSnapshot(ctx, in.OrderID); err == nil && existing.ID != "" {
		return existing, nil
	}
	policy, err := s.Store.GetActivePolicy(ctx)
	if err != nil {
		return analytics.OrderSnapshot{}, nil // non-blocking for gateway path
	}
	merchantID := in.MerchantID
	storeID := in.StoreID
	if storeID != "" {
		if _, mid, _, _, gerr := s.Store.GetStore(ctx, storeID); gerr == nil {
			merchantID = mid
		}
	}
	now := in.OccurredAt
	if now.IsZero() {
		now = s.now()
	}
	snapID := s.IDs.New()
	if !strings.HasPrefix(snapID, "oas_") {
		snapID = "oas_" + snapID
	}
	var piID *string
	if in.PaymentIntentID != "" {
		p := in.PaymentIntentID
		piID = &p
	}
	snap := analytics.OrderSnapshot{
		ID:                   snapID,
		OrderID:              in.OrderID,
		PaymentIntentID:      piID,
		StoreID:              storeID,
		MerchantID:           merchantID,
		Source:               analytics.SourceQRISAPI,
		VisitorHash:          "",
		SessionHash:          "",
		HashKeyVersion:       s.hashKeyVersion(),
		LandingPath:          "/",
		Channel:              analytics.ChannelDirect,
		AttributionModel:     analytics.ModelNone,
		CollectionVersion:    policy.CollectionVersion,
		ConsentNoticeVersion: policy.ConsentNoticeVersion,
		PolicyVersionID:      policy.VersionID,
		GrossIDR:             in.GrossIDR,
		CapturedAt:           now,
		CreatedAt:            now,
	}
	out, _, err := s.Store.InsertOrderSnapshot(ctx, snap)
	if err != nil {
		if s.Log != nil {
			s.Log.Warn("qris analytics snapshot", "order_id", in.OrderID, "err", err.Error())
		}
		return analytics.OrderSnapshot{}, nil
	}
	return out, nil
}

// MarkConversionOnPaid marks conversion once on verified PAID (including late-paid).
// Idempotent: second call is a no-op. QRIS_API snapshots convert without traffic.
func (s *AnalyticsService) MarkConversionOnPaid(ctx context.Context, orderID string, paidLate bool, grossIDR int64) error {
	if s == nil || s.Store == nil || orderID == "" {
		return nil
	}
	now := s.now()
	// Ensure snapshot exists for storefront orders that somehow lack one.
	if _, err := s.Store.GetOrderSnapshot(ctx, orderID); err != nil {
		if s.Store.IsNotFound(err) {
			// No snapshot — do not invent traffic; skip quietly.
			return nil
		}
		return err
	}
	_, err := s.Store.MarkConverted(ctx, orderID, now, paidLate, grossIDR)
	if err != nil {
		if s.Store.IsNotFound(err) {
			// Already converted (UPDATE ... AND converted=false)
			return nil
		}
		return err
	}
	return nil
}

// RebuildDailyAggregates rebuilds store_traffic_daily for [fromDay, toDay] inclusive.
// Deterministic: delete range then re-aggregate from raw snapshots/events.
func (s *AnalyticsService) RebuildDailyAggregates(ctx context.Context, storeID string, fromDay, toDay time.Time, tz string) error {
	if storeID == "" {
		return apperr.Validation(apperr.CodeValidationFailed, "storeId required")
	}
	if !analytics.ValidTimezone(tz) {
		return apperr.Validation(apperr.CodeValidationFailed, "invalid timezone")
	}
	if tz == "" {
		tz = analytics.DefaultTimezone
	}
	policy, err := s.Store.GetActivePolicy(ctx)
	if err != nil {
		return apperr.Internal(apperr.CodeInternalError, "Analytics policy unavailable")
	}
	_, merchantID, _, _, err := s.Store.GetStore(ctx, storeID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return apperr.NotFound(apperr.CodeResourceNotFound, "Store not found")
		}
		return apperr.Internal(apperr.CodeInternalError, "Store lookup failed")
	}
	fromDay = truncateDay(fromDay)
	toDay = truncateDay(toDay)
	if toDay.Before(fromDay) {
		return apperr.Validation(apperr.CodeValidationFailed, "toDay before fromDay")
	}
	// Bound range: max 366 days
	if toDay.Sub(fromDay) > 366*24*time.Hour {
		return apperr.Validation(apperr.CodeValidationFailed, "date range too large (max 366 days)")
	}

	aggVersion := analytics.AggregationV1
	if err := s.Store.DeleteDailyRange(ctx, storeID, fromDay, toDay, tz, aggVersion); err != nil {
		return apperr.Internal(apperr.CodeInternalError, "Delete daily range failed")
	}

	// key: day|channel|product
	type key struct {
		day, channel, product string
	}
	type acc struct {
		sessions, pageViews, checkouts, orders, gross int64
	}
	m := map[key]*acc{}
	ensure := func(day time.Time, ch, prod string) *acc {
		k := key{day: day.Format("2006-01-02"), channel: ch, product: prod}
		if a, ok := m[k]; ok {
			return a
		}
		a := &acc{}
		m[k] = a
		return a
	}

	sessRows, err := s.Store.CountSessionsByDayChannel(ctx, storeID, tz, fromDay, toDay)
	if err != nil {
		return apperr.Internal(apperr.CodeInternalError, "Session aggregate failed")
	}
	for _, r := range sessRows {
		d := truncateDay(r.Day)
		ensure(d, r.Channel, "").sessions += r.Sessions
		ensure(d, analytics.ChannelAll, "").sessions += r.Sessions
	}

	evRows, err := s.Store.CountEventsByDayChannel(ctx, storeID, tz, fromDay, toDay)
	if err != nil {
		return apperr.Internal(apperr.CodeInternalError, "Event aggregate failed")
	}
	for _, r := range evRows {
		d := truncateDay(r.Day)
		switch r.EventType {
		case analytics.EventPageView, analytics.EventProductView:
			ensure(d, r.Channel, "").pageViews += r.Count
			ensure(d, analytics.ChannelAll, "").pageViews += r.Count
		case analytics.EventCheckoutStart:
			ensure(d, r.Channel, "").checkouts += r.Count
			ensure(d, analytics.ChannelAll, "").checkouts += r.Count
		case analytics.EventSessionStart:
			// sessions counted from storefront_sessions
		}
	}

	convRows, err := s.Store.CountConversionsByDayChannel(ctx, storeID, tz, fromDay, toDay)
	if err != nil {
		return apperr.Internal(apperr.CodeInternalError, "Conversion aggregate failed")
	}
	for _, r := range convRows {
		d := truncateDay(r.Day)
		ensure(d, r.Channel, "").orders += r.Orders
		ensure(d, r.Channel, "").gross += r.GrossIDR
		ensure(d, analytics.ChannelAll, "").orders += r.Orders
		ensure(d, analytics.ChannelAll, "").gross += r.GrossIDR
		if r.ProductID != "" {
			ensure(d, analytics.ChannelAll, r.ProductID).orders += r.Orders
			ensure(d, analytics.ChannelAll, r.ProductID).gross += r.GrossIDR
		}
	}

	now := s.now()
	for k, a := range m {
		day, _ := time.Parse("2006-01-02", k.day)
		id := s.IDs.New()
		if !strings.HasPrefix(id, "std_") {
			id = "std_" + id
		}
		row := analytics.DailyAggregate{
			ID:                 id,
			StoreID:            storeID,
			MerchantID:         merchantID,
			Day:                day,
			Timezone:           tz,
			Channel:            k.channel,
			ProductID:          k.product,
			Sessions:           a.sessions,
			PageViews:          a.pageViews,
			Checkouts:          a.checkouts,
			Orders:             a.orders,
			GrossIDR:           a.gross,
			PolicyVersionID:    policy.VersionID,
			AggregationVersion: aggVersion,
			RebuiltAt:          now,
			CreatedAt:          now,
			UpdatedAt:          now,
		}
		if _, err := s.Store.UpsertDaily(ctx, row); err != nil {
			return apperr.Internal(apperr.CodeInternalError, "Upsert daily failed")
		}
	}
	return nil
}

// OverviewQuery is GET analytics/overview params.
type OverviewQuery struct {
	ActorUserID string
	StoreID     string
	FromDay     string // YYYY-MM-DD
	ToDay       string
	Timezone    string
}

// GetOverview returns store-scoped overview aggregates (no raw hashes).
func (s *AnalyticsService) GetOverview(ctx context.Context, q OverviewQuery) (analytics.Overview, error) {
	if q.StoreID == "" {
		return analytics.Overview{}, apperr.Validation(apperr.CodeValidationFailed, "storeId required")
	}
	// Scope store exists (tenant isolation via permission middleware + store membership elsewhere).
	if _, _, _, _, err := s.Store.GetStore(ctx, q.StoreID); err != nil {
		if s.Store.IsNotFound(err) {
			return analytics.Overview{}, apperr.NotFound(apperr.CodeResourceNotFound, "Store not found")
		}
		return analytics.Overview{}, apperr.Internal(apperr.CodeInternalError, "Store lookup failed")
	}
	tz := q.Timezone
	if tz == "" {
		tz = analytics.DefaultTimezone
	}
	if !analytics.ValidTimezone(tz) {
		return analytics.Overview{}, apperr.Validation(apperr.CodeValidationFailed, "invalid timezone")
	}
	from, to, err := parseBoundedRange(q.FromDay, q.ToDay, 90)
	if err != nil {
		return analytics.Overview{}, err
	}
	// Ensure aggregates exist (rebuild if empty for range).
	sess, pv, co, ord, gross, err := s.Store.SumDaily(ctx, q.StoreID, from, to, tz, analytics.AggregationV1)
	if err != nil {
		return analytics.Overview{}, apperr.Internal(apperr.CodeInternalError, "Sum daily failed")
	}
	if sess == 0 && pv == 0 && co == 0 && ord == 0 {
		_ = s.RebuildDailyAggregates(ctx, q.StoreID, from, to, tz)
		sess, pv, co, ord, gross, err = s.Store.SumDaily(ctx, q.StoreID, from, to, tz, analytics.AggregationV1)
		if err != nil {
			return analytics.Overview{}, apperr.Internal(apperr.CodeInternalError, "Sum daily failed")
		}
	}
	channels, err := s.Store.SumByChannel(ctx, q.StoreID, from, to, tz, analytics.AggregationV1)
	if err != nil {
		return analytics.Overview{}, apperr.Internal(apperr.CodeInternalError, "Channel sum failed")
	}
	var bps int64
	if sess > 0 {
		bps = (ord * 10000) / sess
	}
	policy, _ := s.Store.GetActivePolicy(ctx)
	return analytics.Overview{
		StoreID:            q.StoreID,
		Timezone:           tz,
		FromDay:            from.Format("2006-01-02"),
		ToDay:              to.Format("2006-01-02"),
		Sessions:           sess,
		PageViews:          pv,
		Checkouts:          co,
		Orders:             ord,
		GrossIDR:           gross,
		ConversionRateBps:  bps,
		Channels:           channels,
		PolicyVersionID:    policy.VersionID,
		AggregationVersion: analytics.AggregationV1,
	}, nil
}

// TrafficQuery is GET analytics/traffic params.
type TrafficQuery struct {
	ActorUserID string
	StoreID     string
	FromDay     string
	ToDay       string
	Timezone    string
	Channel     string
	Cursor      string // opaque day+id
	Limit       int32
}

// TrafficResult is a page of traffic rows (no hashes).
type TrafficResult struct {
	Items      []analytics.TrafficRow
	NextCursor *string
	HasMore    bool
	Timezone   string
	FromDay    string
	ToDay      string
}

// GetTraffic returns cursor-paginated daily traffic rows.
func (s *AnalyticsService) GetTraffic(ctx context.Context, q TrafficQuery) (TrafficResult, error) {
	if q.StoreID == "" {
		return TrafficResult{}, apperr.Validation(apperr.CodeValidationFailed, "storeId required")
	}
	if _, _, _, _, err := s.Store.GetStore(ctx, q.StoreID); err != nil {
		if s.Store.IsNotFound(err) {
			return TrafficResult{}, apperr.NotFound(apperr.CodeResourceNotFound, "Store not found")
		}
		return TrafficResult{}, apperr.Internal(apperr.CodeInternalError, "Store lookup failed")
	}
	tz := q.Timezone
	if tz == "" {
		tz = analytics.DefaultTimezone
	}
	if !analytics.ValidTimezone(tz) {
		return TrafficResult{}, apperr.Validation(apperr.CodeValidationFailed, "invalid timezone")
	}
	ch := q.Channel
	if ch == "" {
		ch = analytics.ChannelAll
	}
	if !analytics.ValidChannel(ch) {
		return TrafficResult{}, apperr.Validation(apperr.CodeValidationFailed, "invalid channel")
	}
	from, to, err := parseBoundedRange(q.FromDay, q.ToDay, 90)
	if err != nil {
		return TrafficResult{}, err
	}
	limit := q.Limit
	if limit <= 0 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}
	// Ensure data
	_ = s.RebuildDailyAggregates(ctx, q.StoreID, from, to, tz)

	var cursorDay *time.Time
	var cursorID *string
	if q.Cursor != "" {
		// Format: YYYY-MM-DD|id
		parts := strings.SplitN(q.Cursor, "|", 2)
		if len(parts) != 2 {
			return TrafficResult{}, apperr.Validation(apperr.CodeValidationFailed, "invalid cursor")
		}
		d, perr := time.Parse("2006-01-02", parts[0])
		if perr != nil || parts[1] == "" {
			return TrafficResult{}, apperr.Validation(apperr.CodeValidationFailed, "invalid cursor")
		}
		cursorDay = &d
		id := parts[1]
		cursorID = &id
	}
	chPtr := &ch
	rows, err := s.Store.ListDaily(ctx, q.StoreID, from, to, tz, analytics.AggregationV1, chPtr, cursorDay, cursorID, limit+1)
	if err != nil {
		return TrafficResult{}, apperr.Internal(apperr.CodeInternalError, "List traffic failed")
	}
	hasMore := int32(len(rows)) > limit
	if hasMore {
		rows = rows[:limit]
	}
	items := make([]analytics.TrafficRow, 0, len(rows))
	for _, r := range rows {
		items = append(items, analytics.TrafficRow{
			Day:       r.Day.Format("2006-01-02"),
			Channel:   r.Channel,
			ProductID: r.ProductID,
			Sessions:  r.Sessions,
			PageViews: r.PageViews,
			Checkouts: r.Checkouts,
			Orders:    r.Orders,
			GrossIDR:  r.GrossIDR,
		})
	}
	var next *string
	if hasMore && len(rows) > 0 {
		last := rows[len(rows)-1]
		c := last.Day.Format("2006-01-02") + "|" + last.ID
		next = &c
	}
	return TrafficResult{
		Items:      items,
		NextCursor: next,
		HasMore:    hasMore,
		Timezone:   tz,
		FromDay:    from.Format("2006-01-02"),
		ToDay:      to.Format("2006-01-02"),
	}, nil
}

// ExportTrafficCSV returns formula-escaped CSV without visitor hashes.
func (s *AnalyticsService) ExportTrafficCSV(ctx context.Context, q TrafficQuery) (string, error) {
	q.Limit = 100
	res, err := s.GetTraffic(ctx, q)
	if err != nil {
		return "", err
	}
	var b strings.Builder
	b.WriteString("day,channel,productId,sessions,pageViews,checkouts,orders,grossIdr\n")
	for _, r := range res.Items {
		fmt.Fprintf(&b, "%s,%s,%s,%d,%d,%d,%d,%d\n",
			analytics.EscapeCSVCell(r.Day),
			analytics.EscapeCSVCell(r.Channel),
			analytics.EscapeCSVCell(r.ProductID),
			r.Sessions, r.PageViews, r.Checkouts, r.Orders, r.GrossIDR,
		)
	}
	return b.String(), nil
}

// RunRetentionDeletion deletes raw events past retention and anonymizes sessions.
func (s *AnalyticsService) RunRetentionDeletion(ctx context.Context) error {
	policy, err := s.Store.GetActivePolicy(ctx)
	if err != nil {
		return err
	}
	now := s.now()
	cutoff := now.AddDate(0, 0, -policy.RawRetentionDays)
	started := now
	nEv, err := s.Store.DeleteEventsBefore(ctx, cutoff)
	if err != nil {
		return err
	}
	var nSess int64
	if policy.AnonymizeOnDelete {
		nSess, err = s.Store.AnonymizeSessionsBefore(ctx, cutoff)
		if err != nil {
			return err
		}
	}
	id := s.IDs.New()
	return s.Store.InsertRetentionRun(ctx, id, policy.VersionID, cutoff, nEv, nSess, "COMPLETED", started, s.now())
}

func parseBoundedRange(fromS, toS string, maxDays int) (time.Time, time.Time, error) {
	now := time.Now().UTC()
	var from, to time.Time
	var err error
	if toS == "" {
		to = truncateDay(now)
	} else {
		to, err = time.Parse("2006-01-02", toS)
		if err != nil {
			return time.Time{}, time.Time{}, apperr.Validation(apperr.CodeValidationFailed, "invalid toDay")
		}
	}
	if fromS == "" {
		from = to.AddDate(0, 0, -(maxDays - 1))
	} else {
		from, err = time.Parse("2006-01-02", fromS)
		if err != nil {
			return time.Time{}, time.Time{}, apperr.Validation(apperr.CodeValidationFailed, "invalid fromDay")
		}
	}
	from = truncateDay(from)
	to = truncateDay(to)
	if to.Before(from) {
		return time.Time{}, time.Time{}, apperr.Validation(apperr.CodeValidationFailed, "toDay before fromDay")
	}
	if int(to.Sub(from).Hours()/24) > maxDays {
		return time.Time{}, time.Time{}, apperr.Validation(apperr.CodeValidationFailed, fmt.Sprintf("date range exceeds %d days", maxDays))
	}
	return from, to, nil
}

func truncateDay(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}
