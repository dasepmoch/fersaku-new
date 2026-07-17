package application

import (
	"context"
	"strings"
	"time"
	"unicode"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/admin"
	"github.com/dasepmoch/fersaku-new/backend/internal/platform/cursor"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// AdminReadService is the BE-500 permissioned admin read surface.
type AdminReadService struct {
	Store AdminReadStore
	Clock ports.Clock
	Log   ports.Logger
}

func (s *AdminReadService) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now().UTC()
	}
	return time.Now().UTC()
}

func clampLimit(n int32, export bool) int32 {
	max := admin.MaxListLimit
	if export {
		max = admin.ExportMaxLimit
	}
	if n <= 0 {
		return admin.DefaultListLimit
	}
	if n > max {
		return max
	}
	return n
}

func decodeCursor(raw string) (*time.Time, *string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil, nil
	}
	k, err := cursor.Decode(raw)
	if err != nil {
		return nil, nil, apperr.Validation(apperr.CodeValidationFailed, "Invalid cursor")
	}
	t := k.CreatedAt.UTC()
	id := k.ID
	return &t, &id, nil
}

func nextCursorFrom(createdAt time.Time, id string, hasMore bool) *cursor.Key {
	if !hasMore || id == "" {
		return nil
	}
	return &cursor.Key{CreatedAt: createdAt.UTC(), ID: id}
}

// Overview returns safe command-center KPIs.
func (s *AdminReadService) Overview(ctx context.Context) (admin.Overview, error) {
	if s.Store == nil {
		return admin.Overview{}, apperr.Internal(apperr.CodeInternalError, "Admin reads unavailable")
	}
	o, err := s.Store.OverviewCounts(ctx)
	if err != nil {
		return admin.Overview{}, err
	}
	vol, err := s.Store.PlatformVolumeHours(ctx)
	if err != nil {
		return admin.Overview{}, err
	}
	o.PlatformVolume = vol
	return o, nil
}

// PlatformVolume returns 24 hourly gross buckets.
func (s *AdminReadService) PlatformVolume(ctx context.Context) ([]int64, error) {
	if s.Store == nil {
		return nil, apperr.Internal(apperr.CodeInternalError, "Admin reads unavailable")
	}
	return s.Store.PlatformVolumeHours(ctx)
}

// ListMerchants returns FE AdminMerchant list.
func (s *AdminReadService) ListMerchants(ctx context.Context, f admin.ListFilter) ([]admin.Merchant, *cursor.Key, bool, error) {
	if s.Store == nil {
		return nil, nil, false, apperr.Internal(apperr.CodeInternalError, "Admin reads unavailable")
	}
	f.Limit = clampLimit(f.Limit, false)
	cat, cid, err := decodeCursor(f.Cursor)
	if err != nil {
		return nil, nil, false, err
	}
	rows, err := s.Store.ListMerchants(ctx, f, cat, cid)
	if err != nil {
		return nil, nil, false, err
	}
	hasMore := int32(len(rows)) > f.Limit
	if hasMore {
		rows = rows[:f.Limit]
	}
	out := make([]admin.Merchant, 0, len(rows))
	var lastAt time.Time
	var lastID string
	for _, r := range rows {
		out = append(out, r.Merchant)
		lastAt, lastID = r.CreatedAt, r.ID
	}
	return out, nextCursorFrom(lastAt, lastID, hasMore), hasMore, nil
}

// GetMerchant returns one merchant or not found.
func (s *AdminReadService) GetMerchant(ctx context.Context, id string) (admin.Merchant, error) {
	if s.Store == nil {
		return admin.Merchant{}, apperr.Internal(apperr.CodeInternalError, "Admin reads unavailable")
	}
	row, err := s.Store.GetMerchant(ctx, strings.TrimSpace(id))
	if err != nil {
		if s.Store.IsNotFound(err) {
			return admin.Merchant{}, apperr.NotFound(apperr.CodeResourceNotFound, "Merchant not found")
		}
		return admin.Merchant{}, err
	}
	return row.Merchant, nil
}


// ListBuyers returns FE AdminBuyer list.
func (s *AdminReadService) ListBuyers(ctx context.Context, f admin.ListFilter) ([]admin.Buyer, *cursor.Key, bool, error) {
	if s.Store == nil {
		return nil, nil, false, apperr.Internal(apperr.CodeInternalError, "Admin reads unavailable")
	}
	f.Limit = clampLimit(f.Limit, false)
	cat, cid, err := decodeCursor(f.Cursor)
	if err != nil {
		return nil, nil, false, err
	}
	rows, err := s.Store.ListBuyers(ctx, f, cat, cid)
	if err != nil {
		return nil, nil, false, err
	}
	hasMore := int32(len(rows)) > f.Limit
	if hasMore {
		rows = rows[:f.Limit]
	}
	out := make([]admin.Buyer, 0, len(rows))
	var lastAt time.Time
	var lastID string
	for _, r := range rows {
		out = append(out, r.Buyer)
		lastAt, lastID = r.CreatedAt, r.ID
	}
	return out, nextCursorFrom(lastAt, lastID, hasMore), hasMore, nil
}

// GetBuyer returns one buyer.
func (s *AdminReadService) GetBuyer(ctx context.Context, id string) (admin.Buyer, error) {
	if s.Store == nil {
		return admin.Buyer{}, apperr.Internal(apperr.CodeInternalError, "Admin reads unavailable")
	}
	row, err := s.Store.GetBuyer(ctx, strings.TrimSpace(id))
	if err != nil {
		if s.Store.IsNotFound(err) {
			return admin.Buyer{}, apperr.NotFound(apperr.CodeResourceNotFound, "Buyer not found")
		}
		return admin.Buyer{}, err
	}
	return row.Buyer, nil
}

// ListBuyerPurchases returns purchases without delivery secrets.
func (s *AdminReadService) ListBuyerPurchases(ctx context.Context, buyerID string, limit int32) ([]admin.BuyerPurchase, error) {
	if s.Store == nil {
		return nil, apperr.Internal(apperr.CodeInternalError, "Admin reads unavailable")
	}
	if _, err := s.GetBuyer(ctx, buyerID); err != nil {
		return nil, err
	}
	return s.Store.ListBuyerPurchases(ctx, buyerID, clampLimit(limit, false))
}

// ListBuyerSessions returns buyer sessions (hashed IP only).
func (s *AdminReadService) ListBuyerSessions(ctx context.Context, buyerID string, limit int32) ([]admin.BuyerSession, error) {
	if s.Store == nil {
		return nil, apperr.Internal(apperr.CodeInternalError, "Admin reads unavailable")
	}
	if _, err := s.GetBuyer(ctx, buyerID); err != nil {
		return nil, err
	}
	return s.Store.ListBuyerSessions(ctx, buyerID, clampLimit(limit, false))
}

// ListOrders returns FE AdminOrder list.
func (s *AdminReadService) ListOrders(ctx context.Context, f admin.ListFilter) ([]admin.Order, *cursor.Key, bool, error) {
	if s.Store == nil {
		return nil, nil, false, apperr.Internal(apperr.CodeInternalError, "Admin reads unavailable")
	}
	if src := strings.TrimSpace(f.Source); src != "" && src != "STOREFRONT" && src != "QRIS_API" {
		return nil, nil, false, apperr.Validation(apperr.CodeValidationFailed, "source must be STOREFRONT or QRIS_API")
	}
	f.Limit = clampLimit(f.Limit, false)
	cat, cid, err := decodeCursor(f.Cursor)
	if err != nil {
		return nil, nil, false, err
	}
	rows, err := s.Store.ListOrders(ctx, f, cat, cid)
	if err != nil {
		return nil, nil, false, err
	}
	hasMore := int32(len(rows)) > f.Limit
	if hasMore {
		rows = rows[:f.Limit]
	}
	out := make([]admin.Order, 0, len(rows))
	var lastAt time.Time
	var lastID string
	for _, r := range rows {
		out = append(out, r.Order)
		lastAt, lastID = r.CreatedAt, r.ID
	}
	return out, nextCursorFrom(lastAt, lastID, hasMore), hasMore, nil
}

// GetOrder returns one order.
func (s *AdminReadService) GetOrder(ctx context.Context, id string) (admin.Order, error) {
	if s.Store == nil {
		return admin.Order{}, apperr.Internal(apperr.CodeInternalError, "Admin reads unavailable")
	}
	row, err := s.Store.GetOrder(ctx, strings.TrimSpace(id))
	if err != nil {
		if s.Store.IsNotFound(err) {
			return admin.Order{}, apperr.NotFound(apperr.CodeResourceNotFound, "Order not found")
		}
		return admin.Order{}, err
	}
	return row.Order, nil
}

// ListPayments returns FE AdminPaymentIntent list (STOREFRONT|QRIS_API only).
func (s *AdminReadService) ListPayments(ctx context.Context, f admin.ListFilter) ([]admin.Payment, *cursor.Key, bool, error) {
	if s.Store == nil {
		return nil, nil, false, apperr.Internal(apperr.CodeInternalError, "Admin reads unavailable")
	}
	if src := strings.TrimSpace(f.Source); src != "" {
		if src != "STOREFRONT" && src != "QRIS_API" {
			return nil, nil, false, apperr.Validation(apperr.CodeValidationFailed, "payment source must be STOREFRONT or QRIS_API")
		}
	}
	f.Limit = clampLimit(f.Limit, false)
	cat, cid, err := decodeCursor(f.Cursor)
	if err != nil {
		return nil, nil, false, err
	}
	rows, err := s.Store.ListPayments(ctx, f, cat, cid)
	if err != nil {
		return nil, nil, false, err
	}
	hasMore := int32(len(rows)) > f.Limit
	if hasMore {
		rows = rows[:f.Limit]
	}
	out := make([]admin.Payment, 0, len(rows))
	var lastAt time.Time
	var lastID string
	for _, r := range rows {
		out = append(out, r.Payment)
		lastAt, lastID = r.CreatedAt, r.ID
	}
	return out, nextCursorFrom(lastAt, lastID, hasMore), hasMore, nil
}

// GetPayment returns one payment intent.
func (s *AdminReadService) GetPayment(ctx context.Context, id string) (admin.Payment, error) {
	if s.Store == nil {
		return admin.Payment{}, apperr.Internal(apperr.CodeInternalError, "Admin reads unavailable")
	}
	row, err := s.Store.GetPayment(ctx, strings.TrimSpace(id))
	if err != nil {
		if s.Store.IsNotFound(err) {
			return admin.Payment{}, apperr.NotFound(apperr.CodeResourceNotFound, "Payment not found")
		}
		return admin.Payment{}, err
	}
	return row.Payment, nil
}

// ListWithdrawals returns FE AdminWithdrawal list (source may be MIXED).
func (s *AdminReadService) ListWithdrawals(ctx context.Context, f admin.ListFilter) ([]admin.Withdrawal, *cursor.Key, bool, error) {
	if s.Store == nil {
		return nil, nil, false, apperr.Internal(apperr.CodeInternalError, "Admin reads unavailable")
	}
	if src := strings.TrimSpace(f.Source); src != "" {
		if src != "STOREFRONT" && src != "QRIS_API" && src != "MIXED" {
			return nil, nil, false, apperr.Validation(apperr.CodeValidationFailed, "withdrawal source must be STOREFRONT, QRIS_API, or MIXED")
		}
	}
	// Map FE status labels to domain statuses when provided.
	f.Status = mapWithdrawalStatusFilter(f.Status)
	f.Limit = clampLimit(f.Limit, false)
	cat, cid, err := decodeCursor(f.Cursor)
	if err != nil {
		return nil, nil, false, err
	}
	rows, err := s.Store.ListWithdrawals(ctx, f, cat, cid)
	if err != nil {
		return nil, nil, false, err
	}
	hasMore := int32(len(rows)) > f.Limit
	if hasMore {
		rows = rows[:f.Limit]
	}
	out := make([]admin.Withdrawal, 0, len(rows))
	var lastAt time.Time
	var lastID string
	for _, r := range rows {
		out = append(out, r.Withdrawal)
		lastAt, lastID = r.CreatedAt, r.ID
	}
	return out, nextCursorFrom(lastAt, lastID, hasMore), hasMore, nil
}

// GetWithdrawal returns one withdrawal in FE shape.
func (s *AdminReadService) GetWithdrawal(ctx context.Context, id string) (admin.Withdrawal, error) {
	if s.Store == nil {
		return admin.Withdrawal{}, apperr.Internal(apperr.CodeInternalError, "Admin reads unavailable")
	}
	row, err := s.Store.GetWithdrawal(ctx, strings.TrimSpace(id))
	if err != nil {
		if s.Store.IsNotFound(err) {
			return admin.Withdrawal{}, apperr.NotFound(apperr.CodeResourceNotFound, "Withdrawal not found")
		}
		return admin.Withdrawal{}, err
	}
	return row.Withdrawal, nil
}

// GetInventory returns redacted inventory snapshot (no secrets).
func (s *AdminReadService) GetInventory(ctx context.Context) (admin.InventorySnapshot, error) {
	if s.Store == nil {
		return admin.InventorySnapshot{}, apperr.Internal(apperr.CodeInternalError, "Admin reads unavailable")
	}
	products, err := s.Store.InventoryProducts(ctx, 100)
	if err != nil {
		return admin.InventorySnapshot{}, err
	}
	items, err := s.Store.InventoryItems(ctx, 100)
	if err != nil {
		return admin.InventorySnapshot{}, err
	}
	schema, err := s.Store.InventorySchema(ctx)
	if err != nil {
		return admin.InventorySnapshot{}, err
	}
	// Defense: never pass through secret-looking values in list.
	for i := range items {
		items[i].SchemaPreview = redactSchemaPreview(items[i].SchemaPreview)
	}
	return admin.InventorySnapshot{Products: products, Items: items, Schema: schema}, nil
}

// ListFulfillments returns delivery grant projections.
func (s *AdminReadService) ListFulfillments(ctx context.Context, f admin.ListFilter) ([]admin.Fulfillment, *cursor.Key, bool, error) {
	if s.Store == nil {
		return nil, nil, false, apperr.Internal(apperr.CodeInternalError, "Admin reads unavailable")
	}
	f.Limit = clampLimit(f.Limit, false)
	cat, cid, err := decodeCursor(f.Cursor)
	if err != nil {
		return nil, nil, false, err
	}
	rows, err := s.Store.ListFulfillments(ctx, f, cat, cid)
	if err != nil {
		return nil, nil, false, err
	}
	hasMore := int32(len(rows)) > f.Limit
	if hasMore {
		rows = rows[:f.Limit]
	}
	out := make([]admin.Fulfillment, 0, len(rows))
	var lastAt time.Time
	var lastID string
	for _, r := range rows {
		out = append(out, r.Fulfillment)
		lastAt, lastID = r.CreatedAt, r.ID
	}
	return out, nextCursorFrom(lastAt, lastID, hasMore), hasMore, nil
}

// GetFulfillment returns one grant.
func (s *AdminReadService) GetFulfillment(ctx context.Context, id string) (admin.Fulfillment, error) {
	if s.Store == nil {
		return admin.Fulfillment{}, apperr.Internal(apperr.CodeInternalError, "Admin reads unavailable")
	}
	row, err := s.Store.GetFulfillment(ctx, strings.TrimSpace(id))
	if err != nil {
		if s.Store.IsNotFound(err) {
			return admin.Fulfillment{}, apperr.NotFound(apperr.CodeResourceNotFound, "Fulfillment not found")
		}
		return admin.Fulfillment{}, err
	}
	return row.Fulfillment, nil
}

// ListReviews returns moderation queue.
func (s *AdminReadService) ListReviews(ctx context.Context, f admin.ListFilter) ([]admin.Review, *cursor.Key, bool, error) {
	if s.Store == nil {
		return nil, nil, false, apperr.Internal(apperr.CodeInternalError, "Admin reads unavailable")
	}
	f.Limit = clampLimit(f.Limit, false)
	cat, cid, err := decodeCursor(f.Cursor)
	if err != nil {
		return nil, nil, false, err
	}
	rows, err := s.Store.ListReviews(ctx, f, cat, cid)
	if err != nil {
		return nil, nil, false, err
	}
	hasMore := int32(len(rows)) > f.Limit
	if hasMore {
		rows = rows[:f.Limit]
	}
	out := make([]admin.Review, 0, len(rows))
	var lastAt time.Time
	var lastID string
	for _, r := range rows {
		out = append(out, r.Review)
		lastAt, lastID = r.CreatedAt, r.ID
	}
	return out, nextCursorFrom(lastAt, lastID, hasMore), hasMore, nil
}

// GetReview returns one review.
func (s *AdminReadService) GetReview(ctx context.Context, id string) (admin.Review, error) {
	if s.Store == nil {
		return admin.Review{}, apperr.Internal(apperr.CodeInternalError, "Admin reads unavailable")
	}
	row, err := s.Store.GetReview(ctx, strings.TrimSpace(id))
	if err != nil {
		if s.Store.IsNotFound(err) {
			return admin.Review{}, apperr.NotFound(apperr.CodeResourceNotFound, "Review not found")
		}
		return admin.Review{}, err
	}
	return row, nil
}

// LookupUsers is read-only impersonation target search.
func (s *AdminReadService) LookupUsers(ctx context.Context, q string, limit int32) ([]admin.UserLookup, error) {
	if s.Store == nil {
		return nil, apperr.Internal(apperr.CodeInternalError, "Admin reads unavailable")
	}
	return s.Store.LookupUsers(ctx, strings.TrimSpace(q), clampLimit(limit, false))
}

// GetUser is read-only user detail for impersonation target.
func (s *AdminReadService) GetUser(ctx context.Context, id string) (admin.UserLookup, error) {
	if s.Store == nil {
		return admin.UserLookup{}, apperr.Internal(apperr.CodeInternalError, "Admin reads unavailable")
	}
	u, err := s.Store.GetUser(ctx, strings.TrimSpace(id))
	if err != nil {
		if s.Store.IsNotFound(err) {
			return admin.UserLookup{}, apperr.NotFound(apperr.CodeResourceNotFound, "User not found")
		}
		return admin.UserLookup{}, err
	}
	return u, nil
}

func mapWithdrawalStatusFilter(s string) string {
	switch strings.TrimSpace(s) {
	case "", "Pending", "REQUESTED", "UNDER_REVIEW":
		if s == "Pending" {
			return "REQUESTED"
		}
		return strings.TrimSpace(s)
	case "Processing", "PROCESSING", "APPROVED":
		if s == "Processing" {
			return "PROCESSING"
		}
		return s
	case "On hold", "HELD":
		return "HELD"
	case "Completed", "COMPLETED":
		return "COMPLETED"
	case "Failed", "FAILED", "UNKNOWN_OUTCOME":
		if s == "Failed" {
			return "FAILED"
		}
		return s
	case "Rejected", "REJECTED":
		return "REJECTED"
	default:
		return strings.TrimSpace(s)
	}
}

func redactSchemaPreview(s string) string {
	// List APIs must never include secret values — only field-name previews.
	// If a pipe-separated key list, keep as-is; strip anything that looks like a value.
	if strings.Contains(s, "=") || strings.Contains(s, ":") {
		parts := strings.FieldsFunc(s, func(r rune) bool {
			return r == '|' || r == ',' || r == ';'
		})
		keys := make([]string, 0, len(parts))
		for _, p := range parts {
			p = strings.TrimSpace(p)
			if i := strings.IndexAny(p, "=:"); i >= 0 {
				p = strings.TrimSpace(p[:i])
			}
			if p != "" {
				keys = append(keys, p)
			}
		}
		return strings.Join(keys, " | ")
	}
	return s
}

// InitialsFromName builds review initials.
func InitialsFromName(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return "?"
	}
	parts := strings.Fields(name)
	var b strings.Builder
	for _, p := range parts {
		for _, r := range p {
			if unicode.IsLetter(r) {
				b.WriteRune(unicode.ToUpper(r))
				break
			}
		}
		if b.Len() >= 2 {
			break
		}
	}
	if b.Len() == 0 {
		return "?"
	}
	return b.String()
}
