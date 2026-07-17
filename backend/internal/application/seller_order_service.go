package application

import (
	"context"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/delivery"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/orders"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

const (
	sellerOrderDefaultPageSize = 20
	sellerOrderMaxPageSize     = 50
	sellerOrderMaxSearchLen    = 100
)

// SellerOrderService implements store-scoped order list/detail reads (SEL-250).
type SellerOrderService struct {
	Store SellerOrderStore
	Clock ports.Clock
	Log   ports.Logger
}

func (s *SellerOrderService) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now().UTC()
	}
	return time.Now().UTC()
}

// SellerOrderSummary is list-row DTO (no secrets).
type SellerOrderSummary struct {
	OrderID        string     `json:"orderId"`
	OrderNumber    string     `json:"orderNumber"`
	StoreID        string     `json:"storeId"`
	MerchantID     string     `json:"merchantId"`
	BuyerName      string     `json:"buyerName"`
	BuyerEmail     string     `json:"buyerEmail"`
	ProductTitle   string     `json:"productTitle"`
	PaymentStatus  string     `json:"paymentStatus"`
	Source         string     `json:"source"`
	Currency       string     `json:"currency"`
	GrossIDR       int64      `json:"grossIdr"`
	FeeIDR         int64      `json:"feeIdr"`
	MerchantNetIDR int64      `json:"merchantNetIdr"`
	DeliveryStatus string     `json:"deliveryStatus,omitempty"`
	PaidAt         *time.Time `json:"paidAt,omitempty"`
	CreatedAt      time.Time  `json:"createdAt"`
}

// SellerOrderItemView is an immutable line snapshot for detail.
type SellerOrderItemView struct {
	OrderItemID    string `json:"orderItemId"`
	ProductID      string `json:"productId"`
	ProductTitle   string `json:"productTitle"`
	ProductType    string `json:"productType"`
	ProductVersion string `json:"productVersion,omitempty"`
	UnitPriceIDR   int64  `json:"unitPriceIdr"`
	Quantity       int32  `json:"quantity"`
	LineTotalIDR   int64  `json:"lineTotalIdr"`
	DeliveryKind   string `json:"deliveryKind"`
}

// SellerOrderTimelineEvent is a derived display event (no secrets).
type SellerOrderTimelineEvent struct {
	Label string    `json:"label"`
	At    time.Time `json:"at"`
}

// SellerOrderDetail is the seller order aggregate (no raw delivery secret).
type SellerOrderDetail struct {
	OrderID        string                     `json:"orderId"`
	OrderNumber    string                     `json:"orderNumber"`
	StoreID        string                     `json:"storeId"`
	MerchantID     string                     `json:"merchantId"`
	BuyerName      string                     `json:"buyerName"`
	BuyerEmail     string                     `json:"buyerEmail"`
	PaymentStatus  string                     `json:"paymentStatus"`
	Source         string                     `json:"source"`
	Currency       string                     `json:"currency"`
	SubtotalIDR    int64                      `json:"subtotalIdr"`
	DiscountIDR    int64                      `json:"discountIdr"`
	TipIDR         int64                      `json:"tipIdr"`
	FeeIDR         int64                      `json:"feeIdr"`
	GrossIDR       int64                      `json:"grossIdr"`
	MerchantNetIDR int64                      `json:"merchantNetIdr"`
	PaidAt         *time.Time                 `json:"paidAt,omitempty"`
	CreatedAt      time.Time                  `json:"createdAt"`
	Items          []SellerOrderItemView      `json:"items"`
	Grants         []SellerOrderGrantDTO      `json:"grants"`
	Payment        *SellerOrderPaymentDTO     `json:"payment,omitempty"`
	Timeline       []SellerOrderTimelineEvent `json:"timeline"`
	ProductTitle   string                     `json:"productTitle,omitempty"`
}

// SellerOrderGrantDTO is grant metadata for detail.
type SellerOrderGrantDTO struct {
	GrantID        string     `json:"grantId"`
	OrderItemID    string     `json:"orderItemId"`
	ProductID      string     `json:"productId"`
	DeliveryKind   string     `json:"deliveryKind"`
	Status         string     `json:"status"`
	AccessCount    int32      `json:"accessCount"`
	MaxAccesses    int32      `json:"maxAccesses"`
	ActivatedAt    *time.Time `json:"activatedAt,omitempty"`
	RevokedAt      *time.Time `json:"revokedAt,omitempty"`
	FailedAt       *time.Time `json:"failedAt,omitempty"`
	FailReason     *string    `json:"failReason,omitempty"`
	LastAccessedAt *time.Time `json:"lastAccessedAt,omitempty"`
	CreatedAt      time.Time  `json:"createdAt"`
}

// SellerOrderPaymentDTO is payment intent summary for detail panels.
type SellerOrderPaymentDTO struct {
	PaymentIntentID   string `json:"paymentIntentId"`
	Provider          string `json:"provider"`
	ProviderReference string `json:"providerReference,omitempty"`
	Status            string `json:"status"`
	Source            string `json:"source,omitempty"`
	AmountIDR         int64  `json:"amountIdr"`
	PaidLate          bool   `json:"paidLate"`
}

// SellerOrderListResult is numbered-page list payload + status tallies.
type SellerOrderListResult struct {
	Items        []SellerOrderSummary `json:"items"`
	Page         int                  `json:"page"`
	PageSize     int                  `json:"pageSize"`
	TotalCount   int64                `json:"totalCount"`
	PageCount    int                  `json:"pageCount"`
	StatusCounts map[string]int64     `json:"statusCounts,omitempty"`
}

func (s *SellerOrderService) requireStoreAccess(ctx context.Context, userID, storeID string) error {
	if userID == "" {
		return apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required")
	}
	if storeID == "" {
		return delivery.ErrNotFound
	}
	if s.Store == nil {
		return apperr.Internal(apperr.CodeInternalError, "Orders unavailable")
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

func normalizeSellerOrderFilter(f SellerOrderListFilter) (SellerOrderListFilter, error) {
	f.StoreID = strings.TrimSpace(f.StoreID)
	f.Status = strings.TrimSpace(strings.ToUpper(f.Status))
	f.Source = strings.TrimSpace(strings.ToUpper(f.Source))
	f.Q = strings.TrimSpace(f.Q)
	if utf8.RuneCountInString(f.Q) > sellerOrderMaxSearchLen {
		f.Q = string([]rune(f.Q)[:sellerOrderMaxSearchLen])
	}
	if f.Page <= 0 {
		f.Page = 1
	}
	if f.PageSize <= 0 {
		f.PageSize = sellerOrderDefaultPageSize
	}
	if f.PageSize > sellerOrderMaxPageSize {
		f.PageSize = sellerOrderMaxPageSize
	}
	switch f.Status {
	case "", orders.PaymentUnpaid, orders.PaymentPending, orders.PaymentPaid,
		orders.PaymentFailed, orders.PaymentExpired, orders.PaymentCancelled:
	default:
		return f, apperr.Validation(apperr.CodeValidationFailed, "Invalid status filter")
	}
	switch f.Source {
	case "", orders.SourceStorefront, orders.SourceQRISAPI:
	default:
		return f, apperr.Validation(apperr.CodeValidationFailed, "Invalid source filter")
	}
	return f, nil
}

// ListOrders returns a numbered page of store orders.
func (s *SellerOrderService) ListOrders(ctx context.Context, userID string, f SellerOrderListFilter) (SellerOrderListResult, error) {
	var empty SellerOrderListResult
	f, err := normalizeSellerOrderFilter(f)
	if err != nil {
		return empty, err
	}
	if err := s.requireStoreAccess(ctx, userID, f.StoreID); err != nil {
		return empty, err
	}
	total, err := s.Store.CountOrders(ctx, f)
	if err != nil {
		return empty, apperr.Internal(apperr.CodeInternalError, "Order count failed")
	}
	pageCount := 0
	if total > 0 {
		pageCount = int((total + int64(f.PageSize) - 1) / int64(f.PageSize))
	}
	if pageCount > 0 && f.Page > pageCount {
		f.Page = pageCount
	}
	rows, err := s.Store.ListOrders(ctx, f)
	if err != nil {
		return empty, apperr.Internal(apperr.CodeInternalError, "Order list failed")
	}
	items := make([]SellerOrderSummary, 0, len(rows))
	for _, row := range rows {
		o := row.Order
		items = append(items, SellerOrderSummary{
			OrderID:        o.ID,
			OrderNumber:    o.OrderNumber,
			StoreID:        o.StoreID,
			MerchantID:     o.MerchantID,
			BuyerName:      o.BuyerName,
			BuyerEmail:     o.BuyerEmail,
			ProductTitle:   row.ProductTitle,
			PaymentStatus:  o.PaymentStatus,
			Source:         o.Source,
			Currency:       o.Currency,
			GrossIDR:       o.GrossIDR,
			FeeIDR:         o.FeeIDR,
			MerchantNetIDR: o.MerchantNetIDR,
			DeliveryStatus: row.DeliveryStatus,
			PaidAt:         o.PaidAt,
			CreatedAt:      o.CreatedAt,
		})
	}
	counts, _ := s.Store.StatusCounts(ctx, f.StoreID)
	return SellerOrderListResult{
		Items:        items,
		Page:         f.Page,
		PageSize:     f.PageSize,
		TotalCount:   total,
		PageCount:    pageCount,
		StatusCounts: counts,
	}, nil
}

// GetOrder returns store-scoped detail or safe 404 for foreign IDs.
func (s *SellerOrderService) GetOrder(ctx context.Context, userID, storeID, orderID string) (SellerOrderDetail, error) {
	var empty SellerOrderDetail
	storeID = strings.TrimSpace(storeID)
	orderID = strings.TrimSpace(orderID)
	if orderID == "" {
		return empty, delivery.ErrNotFound
	}
	if err := s.requireStoreAccess(ctx, userID, storeID); err != nil {
		return empty, err
	}
	o, err := s.Store.GetOrderByStore(ctx, storeID, orderID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return empty, delivery.ErrNotFound
		}
		return empty, apperr.Internal(apperr.CodeInternalError, "Order lookup failed")
	}
	// Defense in depth: never return cross-store.
	if o.StoreID != storeID {
		return empty, delivery.ErrNotFound
	}
	items, err := s.Store.ListOrderItems(ctx, o.ID)
	if err != nil {
		return empty, apperr.Internal(apperr.CodeInternalError, "Order items lookup failed")
	}
	grants, _ := s.Store.ListGrants(ctx, o.ID)
	pay, _ := s.Store.GetPaymentIntent(ctx, o.ID)

	itemViews := make([]SellerOrderItemView, 0, len(items))
	productTitle := ""
	for i, it := range items {
		itemViews = append(itemViews, SellerOrderItemView{
			OrderItemID:    it.ID,
			ProductID:      it.ProductID,
			ProductTitle:   it.ProductTitle,
			ProductType:    it.ProductType,
			ProductVersion: it.ProductVersion,
			UnitPriceIDR:   it.UnitPriceIDR,
			Quantity:       it.Quantity,
			LineTotalIDR:   it.LineTotalIDR,
			DeliveryKind:   it.DeliveryKind,
		})
		if i == 0 {
			productTitle = it.ProductTitle
		}
	}
	grantDTOs := make([]SellerOrderGrantDTO, 0, len(grants))
	for _, g := range grants {
		grantDTOs = append(grantDTOs, SellerOrderGrantDTO{
			GrantID:        g.ID,
			OrderItemID:    g.OrderItemID,
			ProductID:      g.ProductID,
			DeliveryKind:   g.DeliveryKind,
			Status:         g.Status,
			AccessCount:    g.AccessCount,
			MaxAccesses:    g.MaxAccesses,
			ActivatedAt:    g.ActivatedAt,
			RevokedAt:      g.RevokedAt,
			FailedAt:       g.FailedAt,
			FailReason:     g.FailReason,
			LastAccessedAt: g.LastAccessedAt,
			CreatedAt:      g.CreatedAt,
		})
	}
	var payDTO *SellerOrderPaymentDTO
	if pay != nil {
		payDTO = &SellerOrderPaymentDTO{
			PaymentIntentID:   pay.ID,
			Provider:          pay.Provider,
			ProviderReference: pay.ProviderReference,
			Status:            pay.Status,
			Source:            pay.Source,
			AmountIDR:         pay.AmountIDR,
			PaidLate:          pay.PaidLate,
		}
	}
	return SellerOrderDetail{
		OrderID:        o.ID,
		OrderNumber:    o.OrderNumber,
		StoreID:        o.StoreID,
		MerchantID:     o.MerchantID,
		BuyerName:      o.BuyerName,
		BuyerEmail:     o.BuyerEmail,
		PaymentStatus:  o.PaymentStatus,
		Source:         o.Source,
		Currency:       o.Currency,
		SubtotalIDR:    o.SubtotalIDR,
		DiscountIDR:    o.DiscountIDR,
		TipIDR:         o.TipIDR,
		FeeIDR:         o.FeeIDR,
		GrossIDR:       o.GrossIDR,
		MerchantNetIDR: o.MerchantNetIDR,
		PaidAt:         o.PaidAt,
		CreatedAt:      o.CreatedAt,
		Items:          itemViews,
		Grants:         grantDTOs,
		Payment:        payDTO,
		Timeline:       buildSellerOrderTimeline(o, grants, pay),
		ProductTitle:   productTitle,
	}, nil
}

func buildSellerOrderTimeline(o orders.Order, grants []SellerOrderGrantView, pay *SellerOrderPaymentSummary) []SellerOrderTimelineEvent {
	out := []SellerOrderTimelineEvent{
		{Label: "Pesanan dibuat", At: o.CreatedAt.UTC()},
	}
	if pay != nil && !pay.CreatedAt.IsZero() {
		out = append(out, SellerOrderTimelineEvent{Label: "Pembayaran dibuat", At: pay.CreatedAt.UTC()})
	}
	if o.PaidAt != nil {
		out = append(out, SellerOrderTimelineEvent{Label: "Pembayaran terkonfirmasi", At: o.PaidAt.UTC()})
	}
	for _, g := range grants {
		if g.ActivatedAt != nil {
			out = append(out, SellerOrderTimelineEvent{Label: "Delivery berhasil", At: g.ActivatedAt.UTC()})
		} else if g.FailedAt != nil {
			out = append(out, SellerOrderTimelineEvent{Label: "Delivery gagal", At: g.FailedAt.UTC()})
		} else if g.RevokedAt != nil {
			out = append(out, SellerOrderTimelineEvent{Label: "Delivery dicabut", At: g.RevokedAt.UTC()})
		}
	}
	return out
}
