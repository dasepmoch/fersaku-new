package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/analytics"
)

type analyticsTxKey struct{}

// AnalyticsRepo is the Postgres adapter for BE-360.
type AnalyticsRepo struct {
	pool *pgxpool.Pool
}

func NewAnalyticsRepo(pool *pgxpool.Pool) *AnalyticsRepo {
	return &AnalyticsRepo{pool: pool}
}

func (r *AnalyticsRepo) conn(ctx context.Context) queryRower {
	if tx, ok := ctx.Value(analyticsTxKey{}).(pgx.Tx); ok && tx != nil {
		return tx
	}
	return r.pool
}

type queryRower interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
}

func (r *AnalyticsRepo) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	if _, ok := ctx.Value(analyticsTxKey{}).(pgx.Tx); ok {
		return fn(ctx)
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("analytics: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	txCtx := context.WithValue(ctx, analyticsTxKey{}, tx)
	if err := fn(txCtx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *AnalyticsRepo) IsNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func (r *AnalyticsRepo) IsUniqueViolation(err error) bool {
	var pe *pgconn.PgError
	return errors.As(err, &pe) && pe.Code == "23505"
}

func (r *AnalyticsRepo) GetActivePolicy(ctx context.Context) (analytics.CollectionPolicy, error) {
	const q = `
SELECT version_id, consent_notice_version, collection_version, reporting_timezone,
       raw_retention_days, aggregate_retention_days, last_non_direct_window_days,
       min_cohort_size, bot_filter_enabled, late_event_policy, anonymize_on_delete,
       checksum_sha256, is_active, effective_from, created_at
FROM analytics_collection_policies WHERE is_active = true LIMIT 1`
	var p analytics.CollectionPolicy
	err := r.conn(ctx).QueryRow(ctx, q).Scan(
		&p.VersionID, &p.ConsentNoticeVersion, &p.CollectionVersion, &p.ReportingTimezone,
		&p.RawRetentionDays, &p.AggregateRetentionDays, &p.LastNonDirectWindowDays,
		&p.MinCohortSize, &p.BotFilterEnabled, &p.LateEventPolicy, &p.AnonymizeOnDelete,
		&p.ChecksumSHA256, &p.IsActive, &p.EffectiveFrom, &p.CreatedAt,
	)
	return p, err
}

func (r *AnalyticsRepo) GetStore(ctx context.Context, storeID string) (string, string, string, string, error) {
	const q = `SELECT id, merchant_id, name, status FROM stores WHERE id = $1`
	var id, mid, name, status string
	err := r.conn(ctx).QueryRow(ctx, q, storeID).Scan(&id, &mid, &name, &status)
	return id, mid, name, status, err
}

func (r *AnalyticsRepo) UpsertSession(ctx context.Context, s analytics.Session) (analytics.Session, error) {
	const q = `
INSERT INTO storefront_sessions (
    id, store_id, merchant_id, visitor_hash, session_hash, hash_key_version,
    landing_path, referrer_origin, utm_source, utm_medium, utm_campaign,
    utm_content, utm_term, channel, is_bot, collection_version,
    consent_notice_version, policy_version_id, first_seen_at, last_seen_at, created_at
) VALUES (
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
)
ON CONFLICT (store_id, session_hash) DO UPDATE SET
    last_seen_at = EXCLUDED.last_seen_at,
    landing_path = CASE WHEN storefront_sessions.landing_path = '/' THEN EXCLUDED.landing_path ELSE storefront_sessions.landing_path END
RETURNING
    id, store_id, merchant_id, visitor_hash, session_hash, hash_key_version,
    landing_path, referrer_origin, utm_source, utm_medium, utm_campaign,
    utm_content, utm_term, channel, is_bot, collection_version,
    consent_notice_version, policy_version_id, first_seen_at, last_seen_at, created_at`
	var out analytics.Session
	err := r.conn(ctx).QueryRow(ctx, q,
		s.ID, s.StoreID, s.MerchantID, s.VisitorHash, s.SessionHash, s.HashKeyVersion,
		s.LandingPath, s.ReferrerOrigin, s.UTMSource, s.UTMMedium, s.UTMCampaign,
		s.UTMContent, s.UTMTerm, s.Channel, s.IsBot, s.CollectionVersion,
		s.ConsentNoticeVersion, s.PolicyVersionID, s.FirstSeenAt, s.LastSeenAt, s.CreatedAt,
	).Scan(
		&out.ID, &out.StoreID, &out.MerchantID, &out.VisitorHash, &out.SessionHash, &out.HashKeyVersion,
		&out.LandingPath, &out.ReferrerOrigin, &out.UTMSource, &out.UTMMedium, &out.UTMCampaign,
		&out.UTMContent, &out.UTMTerm, &out.Channel, &out.IsBot, &out.CollectionVersion,
		&out.ConsentNoticeVersion, &out.PolicyVersionID, &out.FirstSeenAt, &out.LastSeenAt, &out.CreatedAt,
	)
	return out, err
}

func (r *AnalyticsRepo) GetSessionByHash(ctx context.Context, storeID, sessionHash string) (analytics.Session, error) {
	const q = `
SELECT id, store_id, merchant_id, visitor_hash, session_hash, hash_key_version,
       landing_path, referrer_origin, utm_source, utm_medium, utm_campaign,
       utm_content, utm_term, channel, is_bot, collection_version,
       consent_notice_version, policy_version_id, first_seen_at, last_seen_at, created_at
FROM storefront_sessions WHERE store_id = $1 AND session_hash = $2`
	var out analytics.Session
	err := r.conn(ctx).QueryRow(ctx, q, storeID, sessionHash).Scan(
		&out.ID, &out.StoreID, &out.MerchantID, &out.VisitorHash, &out.SessionHash, &out.HashKeyVersion,
		&out.LandingPath, &out.ReferrerOrigin, &out.UTMSource, &out.UTMMedium, &out.UTMCampaign,
		&out.UTMContent, &out.UTMTerm, &out.Channel, &out.IsBot, &out.CollectionVersion,
		&out.ConsentNoticeVersion, &out.PolicyVersionID, &out.FirstSeenAt, &out.LastSeenAt, &out.CreatedAt,
	)
	return out, err
}

func (r *AnalyticsRepo) InsertEvent(ctx context.Context, e analytics.Event) (analytics.Event, error) {
	const q = `
INSERT INTO attribution_events (
    id, store_id, merchant_id, session_id, product_id, visitor_hash, session_hash,
    hash_key_version, event_type, landing_path, referrer_origin, utm_source,
    utm_medium, utm_campaign, utm_content, utm_term, channel, is_bot, is_direct,
    collection_version, consent_notice_version, policy_version_id, occurred_at, created_at
) VALUES (
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24
)
RETURNING
    id, store_id, merchant_id, session_id, product_id, visitor_hash, session_hash,
    hash_key_version, event_type, landing_path, referrer_origin, utm_source,
    utm_medium, utm_campaign, utm_content, utm_term, channel, is_bot, is_direct,
    collection_version, consent_notice_version, policy_version_id, occurred_at, created_at`
	var out analytics.Event
	err := r.conn(ctx).QueryRow(ctx, q,
		e.ID, e.StoreID, e.MerchantID, e.SessionID, e.ProductID, e.VisitorHash, e.SessionHash,
		e.HashKeyVersion, e.EventType, e.LandingPath, e.ReferrerOrigin, e.UTMSource,
		e.UTMMedium, e.UTMCampaign, e.UTMContent, e.UTMTerm, e.Channel, e.IsBot, e.IsDirect,
		e.CollectionVersion, e.ConsentNoticeVersion, e.PolicyVersionID, e.OccurredAt, e.CreatedAt,
	).Scan(
		&out.ID, &out.StoreID, &out.MerchantID, &out.SessionID, &out.ProductID, &out.VisitorHash, &out.SessionHash,
		&out.HashKeyVersion, &out.EventType, &out.LandingPath, &out.ReferrerOrigin, &out.UTMSource,
		&out.UTMMedium, &out.UTMCampaign, &out.UTMContent, &out.UTMTerm, &out.Channel, &out.IsBot, &out.IsDirect,
		&out.CollectionVersion, &out.ConsentNoticeVersion, &out.PolicyVersionID, &out.OccurredAt, &out.CreatedAt,
	)
	return out, err
}

func (r *AnalyticsRepo) ListNonDirectEvents(ctx context.Context, storeID, visitorHash string, from, to time.Time) ([]analytics.Event, error) {
	const q = `
SELECT id, store_id, merchant_id, session_id, product_id, visitor_hash, session_hash,
       hash_key_version, event_type, landing_path, referrer_origin, utm_source,
       utm_medium, utm_campaign, utm_content, utm_term, channel, is_bot, is_direct,
       collection_version, consent_notice_version, policy_version_id, occurred_at, created_at
FROM attribution_events
WHERE store_id = $1 AND visitor_hash = $2 AND is_bot = false AND is_direct = false
  AND occurred_at >= $3 AND occurred_at <= $4
ORDER BY occurred_at DESC, id DESC
LIMIT 100`
	rows, err := r.conn(ctx).Query(ctx, q, storeID, visitorHash, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []analytics.Event
	for rows.Next() {
		var e analytics.Event
		if err := rows.Scan(
			&e.ID, &e.StoreID, &e.MerchantID, &e.SessionID, &e.ProductID, &e.VisitorHash, &e.SessionHash,
			&e.HashKeyVersion, &e.EventType, &e.LandingPath, &e.ReferrerOrigin, &e.UTMSource,
			&e.UTMMedium, &e.UTMCampaign, &e.UTMContent, &e.UTMTerm, &e.Channel, &e.IsBot, &e.IsDirect,
			&e.CollectionVersion, &e.ConsentNoticeVersion, &e.PolicyVersionID, &e.OccurredAt, &e.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (r *AnalyticsRepo) InsertOrderSnapshot(ctx context.Context, snap analytics.OrderSnapshot) (analytics.OrderSnapshot, bool, error) {
	const q = `
INSERT INTO order_attribution_snapshots (
    id, order_id, payment_intent_id, store_id, merchant_id, product_id, source,
    visitor_hash, session_hash, hash_key_version, landing_path, referrer_origin,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, channel,
    attribution_model, attributed_event_id, collection_version, consent_notice_version,
    policy_version_id, converted, converted_at, paid_late, gross_idr, captured_at, created_at
) VALUES (
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29
)
ON CONFLICT (order_id) DO NOTHING
RETURNING
    id, order_id, payment_intent_id, store_id, merchant_id, product_id, source,
    visitor_hash, session_hash, hash_key_version, landing_path, referrer_origin,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, channel,
    attribution_model, attributed_event_id, collection_version, consent_notice_version,
    policy_version_id, converted, converted_at, paid_late, gross_idr, captured_at, created_at`
	var out analytics.OrderSnapshot
	err := r.conn(ctx).QueryRow(ctx, q,
		snap.ID, snap.OrderID, snap.PaymentIntentID, snap.StoreID, snap.MerchantID, snap.ProductID, snap.Source,
		snap.VisitorHash, snap.SessionHash, snap.HashKeyVersion, snap.LandingPath, snap.ReferrerOrigin,
		snap.UTMSource, snap.UTMMedium, snap.UTMCampaign, snap.UTMContent, snap.UTMTerm, snap.Channel,
		snap.AttributionModel, snap.AttributedEventID, snap.CollectionVersion, snap.ConsentNoticeVersion,
		snap.PolicyVersionID, snap.Converted, snap.ConvertedAt, snap.PaidLate, snap.GrossIDR, snap.CapturedAt, snap.CreatedAt,
	).Scan(
		&out.ID, &out.OrderID, &out.PaymentIntentID, &out.StoreID, &out.MerchantID, &out.ProductID, &out.Source,
		&out.VisitorHash, &out.SessionHash, &out.HashKeyVersion, &out.LandingPath, &out.ReferrerOrigin,
		&out.UTMSource, &out.UTMMedium, &out.UTMCampaign, &out.UTMContent, &out.UTMTerm, &out.Channel,
		&out.AttributionModel, &out.AttributedEventID, &out.CollectionVersion, &out.ConsentNoticeVersion,
		&out.PolicyVersionID, &out.Converted, &out.ConvertedAt, &out.PaidLate, &out.GrossIDR, &out.CapturedAt, &out.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		// conflict — not inserted
		existing, gerr := r.GetOrderSnapshot(ctx, snap.OrderID)
		return existing, false, gerr
	}
	if err != nil {
		return analytics.OrderSnapshot{}, false, err
	}
	return out, true, nil
}

func (r *AnalyticsRepo) GetOrderSnapshot(ctx context.Context, orderID string) (analytics.OrderSnapshot, error) {
	return r.scanSnapshot(ctx, `SELECT id, order_id, payment_intent_id, store_id, merchant_id, product_id, source,
    visitor_hash, session_hash, hash_key_version, landing_path, referrer_origin,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, channel,
    attribution_model, attributed_event_id, collection_version, consent_notice_version,
    policy_version_id, converted, converted_at, paid_late, gross_idr, captured_at, created_at
FROM order_attribution_snapshots WHERE order_id = $1`, orderID)
}

func (r *AnalyticsRepo) GetOrderSnapshotByIntent(ctx context.Context, intentID string) (analytics.OrderSnapshot, error) {
	return r.scanSnapshot(ctx, `SELECT id, order_id, payment_intent_id, store_id, merchant_id, product_id, source,
    visitor_hash, session_hash, hash_key_version, landing_path, referrer_origin,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, channel,
    attribution_model, attributed_event_id, collection_version, consent_notice_version,
    policy_version_id, converted, converted_at, paid_late, gross_idr, captured_at, created_at
FROM order_attribution_snapshots WHERE payment_intent_id = $1`, intentID)
}

func (r *AnalyticsRepo) scanSnapshot(ctx context.Context, q string, arg any) (analytics.OrderSnapshot, error) {
	var out analytics.OrderSnapshot
	err := r.conn(ctx).QueryRow(ctx, q, arg).Scan(
		&out.ID, &out.OrderID, &out.PaymentIntentID, &out.StoreID, &out.MerchantID, &out.ProductID, &out.Source,
		&out.VisitorHash, &out.SessionHash, &out.HashKeyVersion, &out.LandingPath, &out.ReferrerOrigin,
		&out.UTMSource, &out.UTMMedium, &out.UTMCampaign, &out.UTMContent, &out.UTMTerm, &out.Channel,
		&out.AttributionModel, &out.AttributedEventID, &out.CollectionVersion, &out.ConsentNoticeVersion,
		&out.PolicyVersionID, &out.Converted, &out.ConvertedAt, &out.PaidLate, &out.GrossIDR, &out.CapturedAt, &out.CreatedAt,
	)
	return out, err
}

func (r *AnalyticsRepo) MarkConverted(ctx context.Context, orderID string, at time.Time, paidLate bool, grossIDR int64) (analytics.OrderSnapshot, error) {
	const q = `
UPDATE order_attribution_snapshots
SET converted = true,
    converted_at = $2,
    paid_late = $3,
    gross_idr = CASE WHEN $4::bigint > 0 THEN $4::bigint ELSE gross_idr END
WHERE order_id = $1 AND converted = false
RETURNING
    id, order_id, payment_intent_id, store_id, merchant_id, product_id, source,
    visitor_hash, session_hash, hash_key_version, landing_path, referrer_origin,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, channel,
    attribution_model, attributed_event_id, collection_version, consent_notice_version,
    policy_version_id, converted, converted_at, paid_late, gross_idr, captured_at, created_at`
	var out analytics.OrderSnapshot
	err := r.conn(ctx).QueryRow(ctx, q, orderID, at, paidLate, grossIDR).Scan(
		&out.ID, &out.OrderID, &out.PaymentIntentID, &out.StoreID, &out.MerchantID, &out.ProductID, &out.Source,
		&out.VisitorHash, &out.SessionHash, &out.HashKeyVersion, &out.LandingPath, &out.ReferrerOrigin,
		&out.UTMSource, &out.UTMMedium, &out.UTMCampaign, &out.UTMContent, &out.UTMTerm, &out.Channel,
		&out.AttributionModel, &out.AttributedEventID, &out.CollectionVersion, &out.ConsentNoticeVersion,
		&out.PolicyVersionID, &out.Converted, &out.ConvertedAt, &out.PaidLate, &out.GrossIDR, &out.CapturedAt, &out.CreatedAt,
	)
	return out, err
}

func (r *AnalyticsRepo) CountConverted(ctx context.Context, orderID string) (int64, error) {
	var n int64
	err := r.conn(ctx).QueryRow(ctx, `SELECT COUNT(*) FROM order_attribution_snapshots WHERE order_id = $1 AND converted = true`, orderID).Scan(&n)
	return n, err
}

func (r *AnalyticsRepo) DeleteDailyRange(ctx context.Context, storeID string, fromDay, toDay time.Time, tz, aggVersion string) error {
	_, err := r.conn(ctx).Exec(ctx, `
DELETE FROM store_traffic_daily
WHERE store_id = $1 AND day >= $2::date AND day <= $3::date AND timezone = $4 AND aggregation_version = $5`,
		storeID, fromDay, toDay, tz, aggVersion)
	return err
}

func (r *AnalyticsRepo) UpsertDaily(ctx context.Context, row analytics.DailyAggregate) (analytics.DailyAggregate, error) {
	const q = `
INSERT INTO store_traffic_daily (
    id, store_id, merchant_id, day, timezone, channel, product_id,
    sessions, page_views, checkouts, orders, gross_idr,
    policy_version_id, aggregation_version, rebuilt_at, created_at, updated_at
) VALUES (
    $1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
)
ON CONFLICT (store_id, day, timezone, channel, product_id, aggregation_version) DO UPDATE SET
    sessions = EXCLUDED.sessions,
    page_views = EXCLUDED.page_views,
    checkouts = EXCLUDED.checkouts,
    orders = EXCLUDED.orders,
    gross_idr = EXCLUDED.gross_idr,
    policy_version_id = EXCLUDED.policy_version_id,
    rebuilt_at = EXCLUDED.rebuilt_at,
    updated_at = EXCLUDED.updated_at
RETURNING
    id, store_id, merchant_id, day, timezone, channel, product_id,
    sessions, page_views, checkouts, orders, gross_idr,
    policy_version_id, aggregation_version, rebuilt_at, created_at, updated_at`
	var out analytics.DailyAggregate
	err := r.conn(ctx).QueryRow(ctx, q,
		row.ID, row.StoreID, row.MerchantID, row.Day, row.Timezone, row.Channel, row.ProductID,
		row.Sessions, row.PageViews, row.Checkouts, row.Orders, row.GrossIDR,
		row.PolicyVersionID, row.AggregationVersion, row.RebuiltAt, row.CreatedAt, row.UpdatedAt,
	).Scan(
		&out.ID, &out.StoreID, &out.MerchantID, &out.Day, &out.Timezone, &out.Channel, &out.ProductID,
		&out.Sessions, &out.PageViews, &out.Checkouts, &out.Orders, &out.GrossIDR,
		&out.PolicyVersionID, &out.AggregationVersion, &out.RebuiltAt, &out.CreatedAt, &out.UpdatedAt,
	)
	return out, err
}

func (r *AnalyticsRepo) ListDaily(ctx context.Context, storeID string, fromDay, toDay time.Time, tz, aggVersion string, channel *string, cursorDay *time.Time, cursorID *string, limit int32) ([]analytics.DailyAggregate, error) {
	const q = `
SELECT id, store_id, merchant_id, day, timezone, channel, product_id,
       sessions, page_views, checkouts, orders, gross_idr,
       policy_version_id, aggregation_version, rebuilt_at, created_at, updated_at
FROM store_traffic_daily
WHERE store_id = $1
  AND day >= $2::date AND day <= $3::date
  AND timezone = $4 AND aggregation_version = $5
  AND ($6::text IS NULL OR channel = $6)
  AND ($7::date IS NULL OR (day, id) < ($7::date, $8::text))
ORDER BY day DESC, id DESC
LIMIT $9`
	var ch any
	if channel != nil {
		ch = *channel
	}
	var cDay any
	var cID any
	if cursorDay != nil {
		cDay = *cursorDay
	}
	if cursorID != nil {
		cID = *cursorID
	}
	rows, err := r.conn(ctx).Query(ctx, q, storeID, fromDay, toDay, tz, aggVersion, ch, cDay, cID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []analytics.DailyAggregate
	for rows.Next() {
		var d analytics.DailyAggregate
		if err := rows.Scan(
			&d.ID, &d.StoreID, &d.MerchantID, &d.Day, &d.Timezone, &d.Channel, &d.ProductID,
			&d.Sessions, &d.PageViews, &d.Checkouts, &d.Orders, &d.GrossIDR,
			&d.PolicyVersionID, &d.AggregationVersion, &d.RebuiltAt, &d.CreatedAt, &d.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (r *AnalyticsRepo) SumDaily(ctx context.Context, storeID string, fromDay, toDay time.Time, tz, aggVersion string) (int64, int64, int64, int64, int64, error) {
	const q = `
SELECT COALESCE(SUM(sessions),0)::bigint, COALESCE(SUM(page_views),0)::bigint,
       COALESCE(SUM(checkouts),0)::bigint, COALESCE(SUM(orders),0)::bigint,
       COALESCE(SUM(gross_idr),0)::bigint
FROM store_traffic_daily
WHERE store_id = $1 AND day >= $2::date AND day <= $3::date
  AND timezone = $4 AND aggregation_version = $5
  AND channel = 'all' AND product_id = ''`
	var s, p, c, o, g int64
	err := r.conn(ctx).QueryRow(ctx, q, storeID, fromDay, toDay, tz, aggVersion).Scan(&s, &p, &c, &o, &g)
	return s, p, c, o, g, err
}

func (r *AnalyticsRepo) SumByChannel(ctx context.Context, storeID string, fromDay, toDay time.Time, tz, aggVersion string) ([]analytics.ChannelBreakdown, error) {
	const q = `
SELECT channel, COALESCE(SUM(sessions),0)::bigint, COALESCE(SUM(orders),0)::bigint, COALESCE(SUM(gross_idr),0)::bigint
FROM store_traffic_daily
WHERE store_id = $1 AND day >= $2::date AND day <= $3::date
  AND timezone = $4 AND aggregation_version = $5
  AND channel <> 'all' AND product_id = ''
GROUP BY channel ORDER BY channel ASC`
	rows, err := r.conn(ctx).Query(ctx, q, storeID, fromDay, toDay, tz, aggVersion)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []analytics.ChannelBreakdown
	for rows.Next() {
		var b analytics.ChannelBreakdown
		if err := rows.Scan(&b.Channel, &b.Sessions, &b.Orders, &b.GrossIDR); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func (r *AnalyticsRepo) CountSessionsByDayChannel(ctx context.Context, storeID, tz string, fromDay, toDay time.Time) ([]application.DayChannelCount, error) {
	const q = `
SELECT (first_seen_at AT TIME ZONE $2)::date AS day, channel, COUNT(*)::bigint
FROM storefront_sessions
WHERE store_id = $1 AND is_bot = false
  AND (first_seen_at AT TIME ZONE $2)::date >= $3::date
  AND (first_seen_at AT TIME ZONE $2)::date <= $4::date
GROUP BY 1, 2 ORDER BY 1, 2`
	rows, err := r.conn(ctx).Query(ctx, q, storeID, tz, fromDay, toDay)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []application.DayChannelCount
	for rows.Next() {
		var c application.DayChannelCount
		if err := rows.Scan(&c.Day, &c.Channel, &c.Sessions); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *AnalyticsRepo) CountEventsByDayChannel(ctx context.Context, storeID, tz string, fromDay, toDay time.Time) ([]application.DayChannelEventCount, error) {
	const q = `
SELECT (occurred_at AT TIME ZONE $2)::date AS day, channel, event_type, COUNT(*)::bigint
FROM attribution_events
WHERE store_id = $1 AND is_bot = false
  AND (occurred_at AT TIME ZONE $2)::date >= $3::date
  AND (occurred_at AT TIME ZONE $2)::date <= $4::date
GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`
	rows, err := r.conn(ctx).Query(ctx, q, storeID, tz, fromDay, toDay)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []application.DayChannelEventCount
	for rows.Next() {
		var c application.DayChannelEventCount
		if err := rows.Scan(&c.Day, &c.Channel, &c.EventType, &c.Count); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *AnalyticsRepo) CountConversionsByDayChannel(ctx context.Context, storeID, tz string, fromDay, toDay time.Time) ([]application.DayChannelConversion, error) {
	const q = `
SELECT (converted_at AT TIME ZONE $2)::date AS day, channel, COALESCE(product_id, ''),
       COUNT(*)::bigint, COALESCE(SUM(gross_idr),0)::bigint
FROM order_attribution_snapshots
WHERE store_id = $1 AND source = 'STOREFRONT' AND converted = true AND converted_at IS NOT NULL
  AND (converted_at AT TIME ZONE $2)::date >= $3::date
  AND (converted_at AT TIME ZONE $2)::date <= $4::date
GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`
	rows, err := r.conn(ctx).Query(ctx, q, storeID, tz, fromDay, toDay)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []application.DayChannelConversion
	for rows.Next() {
		var c application.DayChannelConversion
		if err := rows.Scan(&c.Day, &c.Channel, &c.ProductID, &c.Orders, &c.GrossIDR); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *AnalyticsRepo) DeleteEventsBefore(ctx context.Context, cutoff time.Time) (int64, error) {
	tag, err := r.conn(ctx).Exec(ctx, `DELETE FROM attribution_events WHERE occurred_at < $1`, cutoff)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func (r *AnalyticsRepo) AnonymizeSessionsBefore(ctx context.Context, cutoff time.Time) (int64, error) {
	tag, err := r.conn(ctx).Exec(ctx, `
UPDATE storefront_sessions
SET visitor_hash = 'anon', session_hash = id
WHERE first_seen_at < $1 AND visitor_hash <> 'anon'`, cutoff)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func (r *AnalyticsRepo) InsertRetentionRun(ctx context.Context, id, policyVersionID string, cutoff time.Time, eventsDeleted, sessionsAnon int64, status string, started, finished time.Time) error {
	_, err := r.conn(ctx).Exec(ctx, `
INSERT INTO analytics_retention_runs (
    id, policy_version_id, cutoff_at, events_deleted, sessions_anonymized,
    status, started_at, finished_at, created_at
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		id, policyVersionID, cutoff, eventsDeleted, sessionsAnon, status, started, finished, finished)
	return err
}
