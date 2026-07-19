package application

import (
	"context"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/delivery"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

const (
	sellerCustomerDefaultPageSize = 20
	sellerCustomerMaxPageSize     = 50
	sellerCustomerMaxSearchLen    = 100
	sellerCustomerHistoryLimit    = 20
	sellerCustomerNoteMaxLen      = 4000
)

// SellerCustomerService implements store-scoped customer list/detail/notes (SEL-260).
type SellerCustomerService struct {
	Store SellerCustomerStore
	IDs   ports.IDGenerator
	Clock ports.Clock
	Log   ports.Logger
}

func (s *SellerCustomerService) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now().UTC()
	}
	return time.Now().UTC()
}

// SellerCustomerSummary is list-row DTO.
type SellerCustomerSummary struct {
	CustomerID        string    `json:"customerId"`
	StoreID           string    `json:"storeId"`
	DisplayName       string    `json:"displayName"`
	DisplayEmail      string    `json:"displayEmail"`
	OrderCount        int64     `json:"orderCount"`
	SpentIDR          int64     `json:"spentIdr"`
	LastPurchaseAt    time.Time `json:"lastPurchaseAt"`
	FirstSeenAt       time.Time `json:"firstSeenAt,omitempty"`
	LastProductTitle  string    `json:"lastProductTitle,omitempty"`
	LastOrderGrossIDR int64     `json:"lastOrderGrossIdr,omitempty"`
	LastPaymentStatus string    `json:"lastPaymentStatus,omitempty"`
}

// SellerCustomerOrderHistoryItem is a purchase history line for detail.
type SellerCustomerOrderHistoryItem struct {
	OrderID       string     `json:"orderId"`
	OrderNumber   string     `json:"orderNumber"`
	ProductTitle  string     `json:"productTitle"`
	PaymentStatus string     `json:"paymentStatus"`
	GrossIDR      int64      `json:"grossIdr"`
	PaidAt        *time.Time `json:"paidAt,omitempty"`
	CreatedAt     time.Time  `json:"createdAt"`
}

// SellerCustomerNoteDTO is internal note payload.
type SellerCustomerNoteDTO struct {
	Body      string    `json:"body"`
	Version   int32     `json:"version"`
	UpdatedAt time.Time `json:"updatedAt"`
	CreatedAt time.Time `json:"createdAt,omitempty"`
}

// SellerCustomerDetail is the seller customer aggregate.
type SellerCustomerDetail struct {
	CustomerID       string                           `json:"customerId"`
	StoreID          string                           `json:"storeId"`
	DisplayName      string                           `json:"displayName"`
	DisplayEmail     string                           `json:"displayEmail"`
	OrderCount       int64                            `json:"orderCount"`
	SpentIDR         int64                            `json:"spentIdr"`
	AvgOrderIDR      int64                            `json:"avgOrderIdr"`
	ProductCount     int64                            `json:"productCount"`
	LastPurchaseAt   time.Time                        `json:"lastPurchaseAt"`
	FirstSeenAt      time.Time                        `json:"firstSeenAt"`
	MarketingConsent *SellerCustomerConsentDTO        `json:"marketingConsent,omitempty"`
	Note             *SellerCustomerNoteDTO           `json:"note,omitempty"`
	Orders           []SellerCustomerOrderHistoryItem `json:"orders"`
}

// SellerCustomerConsentDTO is a best-effort consent display (no invented channel).
type SellerCustomerConsentDTO struct {
	Status    string     `json:"status"`
	Label     string     `json:"label"`
	UpdatedAt *time.Time `json:"updatedAt,omitempty"`
}

// SellerCustomerListResult is numbered-page list + optional store tallies.
type SellerCustomerListResult struct {
	Items          []SellerCustomerSummary `json:"items"`
	Page           int                     `json:"page"`
	PageSize       int                     `json:"pageSize"`
	TotalCount     int64                   `json:"totalCount"`
	PageCount      int                     `json:"pageCount"`
	TotalCustomers int64                   `json:"totalCustomers,omitempty"`
	RepeatBuyers   int64                   `json:"repeatBuyers,omitempty"`
	AvgSpendIDR    int64                   `json:"avgSpendIdr,omitempty"`
}

// UpsertSellerCustomerNoteInput is the notes command body.
type UpsertSellerCustomerNoteInput struct {
	Body            string
	ExpectedVersion *int32
}

func (s *SellerCustomerService) requireStoreAccess(ctx context.Context, userID, storeID string) error {
	if userID == "" {
		return apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required")
	}
	if storeID == "" {
		return delivery.ErrNotFound
	}
	if s.Store == nil {
		return apperr.Internal(apperr.CodeInternalError, "Customers unavailable")
	}
	admin, err := s.Store.UserIsPlatformAdmin(ctx, userID)
	if err != nil {
		return apperr.Internal(apperr.CodeInternalError, "Authorization check failed")
	}
	if admin {
		return nil
	}
	ok, err := s.Store.UserCanAccessStore(ctx, userID, storeID)
	if err != nil {
		return apperr.Internal(apperr.CodeInternalError, "Authorization check failed")
	}
	if !ok {
		return delivery.ErrNotFound
	}
	return nil
}

func normalizeSellerCustomerFilter(f SellerCustomerListFilter) (SellerCustomerListFilter, error) {
	f.StoreID = strings.TrimSpace(f.StoreID)
	f.Q = strings.TrimSpace(f.Q)
	if utf8.RuneCountInString(f.Q) > sellerCustomerMaxSearchLen {
		f.Q = string([]rune(f.Q)[:sellerCustomerMaxSearchLen])
	}
	if f.Page <= 0 {
		f.Page = 1
	}
	if f.PageSize <= 0 {
		f.PageSize = sellerCustomerDefaultPageSize
	}
	if f.PageSize > sellerCustomerMaxPageSize {
		f.PageSize = sellerCustomerMaxPageSize
	}
	return f, nil
}

// ListCustomers returns a numbered page of store customers (purchase-derived).
func (s *SellerCustomerService) ListCustomers(ctx context.Context, userID string, f SellerCustomerListFilter) (SellerCustomerListResult, error) {
	var empty SellerCustomerListResult
	f, err := normalizeSellerCustomerFilter(f)
	if err != nil {
		return empty, err
	}
	if err := s.requireStoreAccess(ctx, userID, f.StoreID); err != nil {
		return empty, err
	}
	total, err := s.Store.CountCustomers(ctx, f)
	if err != nil {
		return empty, apperr.Internal(apperr.CodeInternalError, "Customer count failed")
	}
	pageCount := 0
	if total > 0 {
		pageCount = int((total + int64(f.PageSize) - 1) / int64(f.PageSize))
	}
	if pageCount > 0 && f.Page > pageCount {
		f.Page = pageCount
	}
	rows, err := s.Store.ListCustomers(ctx, f)
	if err != nil {
		return empty, apperr.Internal(apperr.CodeInternalError, "Customer list failed")
	}
	items := make([]SellerCustomerSummary, 0, len(rows))
	for _, row := range rows {
		items = append(items, SellerCustomerSummary{
			CustomerID:        row.CustomerID,
			StoreID:           f.StoreID,
			DisplayName:       row.DisplayName,
			DisplayEmail:      row.DisplayEmail,
			OrderCount:        row.OrderCount,
			SpentIDR:          row.SpentIDR,
			LastPurchaseAt:    row.LastPurchaseAt,
			FirstSeenAt:       row.FirstSeenAt,
			LastProductTitle:  row.LastProductTitle,
			LastOrderGrossIDR: row.LastOrderGrossIDR,
			LastPaymentStatus: row.LastPaymentStatus,
		})
	}
	summary, _ := s.Store.StoreSummary(ctx, f.StoreID)
	return SellerCustomerListResult{
		Items:          items,
		Page:           f.Page,
		PageSize:       f.PageSize,
		TotalCount:     total,
		PageCount:      pageCount,
		TotalCustomers: summary.TotalCustomers,
		RepeatBuyers:   summary.RepeatBuyers,
		AvgSpendIDR:    summary.AvgSpendIDR,
	}, nil
}

// GetCustomer returns store-scoped detail or safe 404 for foreign IDs.
func (s *SellerCustomerService) GetCustomer(ctx context.Context, userID, storeID, customerID string) (SellerCustomerDetail, error) {
	var empty SellerCustomerDetail
	storeID = strings.TrimSpace(storeID)
	customerID = strings.TrimSpace(strings.ToLower(customerID))
	if customerID == "" {
		return empty, delivery.ErrNotFound
	}
	if err := s.requireStoreAccess(ctx, userID, storeID); err != nil {
		return empty, err
	}
	agg, err := s.Store.GetCustomer(ctx, storeID, customerID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return empty, delivery.ErrNotFound
		}
		return empty, apperr.Internal(apperr.CodeInternalError, "Customer lookup failed")
	}
	history, err := s.Store.ListOrderHistory(ctx, storeID, customerID, sellerCustomerHistoryLimit)
	if err != nil {
		return empty, apperr.Internal(apperr.CodeInternalError, "Customer history failed")
	}
	orders := make([]SellerCustomerOrderHistoryItem, 0, len(history))
	for _, h := range history {
		orders = append(orders, SellerCustomerOrderHistoryItem{
			OrderID:       h.OrderID,
			OrderNumber:   h.OrderNumber,
			ProductTitle:  h.ProductTitle,
			PaymentStatus: h.PaymentStatus,
			GrossIDR:      h.GrossIDR,
			PaidAt:        h.PaidAt,
			CreatedAt:     h.CreatedAt,
		})
	}
	var noteDTO *SellerCustomerNoteDTO
	note, err := s.Store.GetNote(ctx, storeID, customerID)
	if err != nil && !s.Store.IsNotFound(err) {
		return empty, apperr.Internal(apperr.CodeInternalError, "Customer note lookup failed")
	}
	if note != nil {
		noteDTO = &SellerCustomerNoteDTO{
			Body:      note.Body,
			Version:   note.Version,
			UpdatedAt: note.UpdatedAt,
			CreatedAt: note.CreatedAt,
		}
	}
	avg := int64(0)
	if agg.OrderCount > 0 {
		avg = agg.SpentIDR / agg.OrderCount
	}
	// Consent: no dedicated marketing store yet — report unknown without inventing channel.
	consent := &SellerCustomerConsentDTO{
		Status: "UNKNOWN",
		Label:  "Consent status not recorded",
	}
	return SellerCustomerDetail{
		CustomerID:       agg.CustomerID,
		StoreID:          storeID,
		DisplayName:      agg.DisplayName,
		DisplayEmail:     agg.DisplayEmail,
		OrderCount:       agg.OrderCount,
		SpentIDR:         agg.SpentIDR,
		AvgOrderIDR:      avg,
		ProductCount:     agg.ProductCount,
		LastPurchaseAt:   agg.LastPurchaseAt,
		FirstSeenAt:      agg.FirstSeenAt,
		MarketingConsent: consent,
		Note:             noteDTO,
		Orders:           orders,
	}, nil
}

// UpsertNote creates or version-updates the internal note for a store customer.
func (s *SellerCustomerService) UpsertNote(ctx context.Context, userID, storeID, customerID string, in UpsertSellerCustomerNoteInput) (SellerCustomerNoteDTO, error) {
	var empty SellerCustomerNoteDTO
	storeID = strings.TrimSpace(storeID)
	customerID = strings.TrimSpace(strings.ToLower(customerID))
	if customerID == "" {
		return empty, delivery.ErrNotFound
	}
	if err := s.requireStoreAccess(ctx, userID, storeID); err != nil {
		return empty, err
	}
	// Ensure customer exists in this store (purchase-derived).
	if _, err := s.Store.GetCustomer(ctx, storeID, customerID); err != nil {
		if s.Store.IsNotFound(err) {
			return empty, delivery.ErrNotFound
		}
		return empty, apperr.Internal(apperr.CodeInternalError, "Customer lookup failed")
	}
	body := strings.TrimSpace(in.Body)
	if utf8.RuneCountInString(body) > sellerCustomerNoteMaxLen {
		return empty, apperr.Validation(apperr.CodeValidationFailed, "Note exceeds maximum length")
	}
	now := s.now()
	existing, err := s.Store.GetNote(ctx, storeID, customerID)
	if err != nil && !s.Store.IsNotFound(err) {
		return empty, apperr.Internal(apperr.CodeInternalError, "Customer note lookup failed")
	}
	if existing == nil {
		if in.ExpectedVersion != nil && *in.ExpectedVersion != 0 {
			return empty, apperr.Conflict(apperr.CodeConflict, "Note version conflict")
		}
		if s.IDs == nil {
			return empty, apperr.Internal(apperr.CodeInternalError, "ID generator unavailable")
		}
		row, err := s.Store.InsertNote(ctx, SellerCustomerNoteRow{
			ID:           s.IDs.New(),
			StoreID:      storeID,
			CustomerID:   customerID,
			Body:         body,
			Version:      1,
			AuthorUserID: &userID,
			CreatedAt:    now,
			UpdatedAt:    now,
		})
		if err != nil {
			return empty, apperr.Internal(apperr.CodeInternalError, "Customer note create failed")
		}
		return SellerCustomerNoteDTO{
			Body:      row.Body,
			Version:   row.Version,
			UpdatedAt: row.UpdatedAt,
			CreatedAt: row.CreatedAt,
		}, nil
	}
	expected := existing.Version
	if in.ExpectedVersion != nil {
		expected = *in.ExpectedVersion
	}
	if expected != existing.Version {
		return empty, apperr.Conflict(apperr.CodeConflict, "Note version conflict")
	}
	row, err := s.Store.UpdateNote(ctx, storeID, customerID, body, userID, expected, now)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return empty, apperr.Conflict(apperr.CodeConflict, "Note version conflict")
		}
		return empty, apperr.Internal(apperr.CodeInternalError, "Customer note update failed")
	}
	return SellerCustomerNoteDTO{
		Body:      row.Body,
		Version:   row.Version,
		UpdatedAt: row.UpdatedAt,
		CreatedAt: row.CreatedAt,
	}, nil
}
