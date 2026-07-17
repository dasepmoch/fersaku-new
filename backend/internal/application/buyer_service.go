package application

import (
	"context"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/delivery"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/orders"
	"github.com/dasepmoch/fersaku-new/backend/internal/platform/cursor"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// BuyerService implements buyer profile/session aliases + purchase ownership reads (BE-430).
type BuyerService struct {
	Purchases BuyerPurchaseStore
	Auth      *AuthService
	IDs       ports.IDGenerator
	Clock     ports.Clock
	Log       ports.Logger
}

func (s *BuyerService) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now().UTC()
	}
	return time.Now().UTC()
}

// PurchaseSummary is a buyer-facing order list row (no secrets).
type PurchaseSummary struct {
	OrderID          string     `json:"orderId"`
	OrderNumber      string     `json:"orderNumber"`
	StoreID          string     `json:"storeId"`
	StoreName        string     `json:"storeName,omitempty"`
	StoreSlug        string     `json:"storeSlug,omitempty"`
	PaymentStatus    string     `json:"paymentStatus"`
	Source           string     `json:"source"`
	Currency         string     `json:"currency"`
	GrossIDR         int64      `json:"grossIdr"`
	PaidAt           *time.Time `json:"paidAt,omitempty"`
	CreatedAt        time.Time  `json:"createdAt"`
	ItemCount        int        `json:"itemCount"`
	DeliveryStatus   string     `json:"deliveryStatus,omitempty"`
	// Primary line snapshot for list cards (no delivery secrets).
	ProductID        string `json:"productId,omitempty"`
	ProductTitle     string `json:"productTitle,omitempty"`
	ProductType      string `json:"productType,omitempty"`
	ProductVersion   string `json:"productVersion,omitempty"`
	DeliveryKind     string `json:"deliveryKind,omitempty"`
}

// PurchaseItemView is a safe line snapshot for buyer detail.
type PurchaseItemView struct {
	OrderItemID    string `json:"orderItemId"`
	ProductID      string `json:"productId"`
	ProductTitle   string `json:"productTitle"`
	ProductType    string `json:"productType"`
	ProductVersion string `json:"productVersion,omitempty"`
	UnitPriceIDR   int64  `json:"unitPriceIdr"`
	Quantity       int32  `json:"quantity"`
	LineTotalIDR   int64  `json:"lineTotalIdr"`
	DeliveryKind   string `json:"deliveryKind"`
	DeliveryStatus string `json:"deliveryStatus,omitempty"`
	GrantID        string `json:"grantId,omitempty"`
}

// PurchaseDetail is buyer-owned order detail (no delivery secrets).
type PurchaseDetail struct {
	OrderID       string             `json:"orderId"`
	OrderNumber   string             `json:"orderNumber"`
	StoreID       string             `json:"storeId"`
	StoreName     string             `json:"storeName,omitempty"`
	StoreSlug     string             `json:"storeSlug,omitempty"`
	MerchantID    string             `json:"merchantId"`
	PaymentStatus string             `json:"paymentStatus"`
	Source        string             `json:"source"`
	Currency      string             `json:"currency"`
	SubtotalIDR   int64              `json:"subtotalIdr"`
	DiscountIDR   int64              `json:"discountIdr"`
	TipIDR        int64              `json:"tipIdr"`
	FeeIDR        int64              `json:"feeIdr"`
	GrossIDR      int64              `json:"grossIdr"`
	PaidAt        *time.Time         `json:"paidAt,omitempty"`
	CreatedAt     time.Time          `json:"createdAt"`
	Items         []PurchaseItemView `json:"items"`
}

const buyerPurchaseDefaultLimit = 20
const buyerPurchaseMaxLimit = 50

// ListPurchases returns orders owned by the buyer (cursor DESC).
func (s *BuyerService) ListPurchases(ctx context.Context, buyerUserID, rawCursor string, limit int) ([]PurchaseSummary, *cursor.Key, bool, error) {
	if buyerUserID == "" {
		return nil, nil, false, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required")
	}
	if s.Purchases == nil {
		return nil, nil, false, apperr.Internal(apperr.CodeInternalError, "Purchases unavailable")
	}
	if limit <= 0 {
		limit = buyerPurchaseDefaultLimit
	}
	if limit > buyerPurchaseMaxLimit {
		limit = buyerPurchaseMaxLimit
	}
	var curAt *time.Time
	var curID *string
	if rawCursor != "" {
		k, err := cursor.Decode(rawCursor)
		if err != nil {
			return nil, nil, false, apperr.Validation(apperr.CodeValidationFailed, "Invalid cursor")
		}
		t := k.CreatedAt
		id := k.ID
		curAt = &t
		curID = &id
	}
	rows, err := s.Purchases.ListOrdersByBuyer(ctx, buyerUserID, curAt, curID, int32(limit+1))
	if err != nil {
		return nil, nil, false, apperr.Internal(apperr.CodeInternalError, "Purchase list failed")
	}
	hasMore := len(rows) > limit
	if hasMore {
		rows = rows[:limit]
	}
	out := make([]PurchaseSummary, 0, len(rows))
	for _, o := range rows {
		items, _ := s.Purchases.ListOrderItems(ctx, o.ID)
		grants, _ := s.Purchases.ListGrantsByOrder(ctx, o.ID)
		storeName, storeSlug, _ := s.Purchases.GetStoreIdentity(ctx, o.StoreID)
		sum := PurchaseSummary{
			OrderID:       o.ID,
			OrderNumber:   o.OrderNumber,
			StoreID:       o.StoreID,
			StoreName:     storeName,
			StoreSlug:     storeSlug,
			PaymentStatus: o.PaymentStatus,
			Source:        o.Source,
			Currency:      o.Currency,
			GrossIDR:      o.GrossIDR,
			PaidAt:        o.PaidAt,
			CreatedAt:     o.CreatedAt,
			ItemCount:     len(items),
		}
		if len(items) > 0 {
			it := items[0]
			sum.ProductID = it.ProductID
			sum.ProductTitle = it.ProductTitle
			sum.ProductType = it.ProductType
			sum.ProductVersion = it.ProductVersion
			sum.DeliveryKind = it.DeliveryKind
		}
		if len(grants) > 0 {
			sum.DeliveryStatus = grants[0].Status
		}
		out = append(out, sum)
	}
	var next *cursor.Key
	if hasMore && len(rows) > 0 {
		last := rows[len(rows)-1]
		next = &cursor.Key{CreatedAt: last.CreatedAt, ID: last.ID}
	}
	return out, next, hasMore, nil
}

// GetPurchase returns a single owned purchase or RESOURCE_NOT_FOUND.
func (s *BuyerService) GetPurchase(ctx context.Context, buyerUserID, orderID string) (PurchaseDetail, error) {
	if buyerUserID == "" {
		return PurchaseDetail{}, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required")
	}
	if orderID == "" {
		return PurchaseDetail{}, delivery.ErrNotFound
	}
	if s.Purchases == nil {
		return PurchaseDetail{}, apperr.Internal(apperr.CodeInternalError, "Purchases unavailable")
	}
	o, err := s.Purchases.GetOrderByBuyer(ctx, orderID, buyerUserID)
	if err != nil {
		if s.Purchases.IsNotFound(err) {
			return PurchaseDetail{}, delivery.ErrNotFound
		}
		return PurchaseDetail{}, apperr.Internal(apperr.CodeInternalError, "Order lookup failed")
	}
	// Defense in depth (query already scopes buyer_user_id).
	if o.BuyerUserID == nil || *o.BuyerUserID != buyerUserID {
		return PurchaseDetail{}, delivery.ErrNotFound
	}
	items, err := s.Purchases.ListOrderItems(ctx, o.ID)
	if err != nil {
		return PurchaseDetail{}, apperr.Internal(apperr.CodeInternalError, "Order items lookup failed")
	}
	grants, _ := s.Purchases.ListGrantsByOrder(ctx, o.ID)
	grantByItem := map[string]delivery.Grant{}
	for _, g := range grants {
		grantByItem[g.OrderItemID] = g
	}
	storeName, storeSlug, _ := s.Purchases.GetStoreIdentity(ctx, o.StoreID)
	views := make([]PurchaseItemView, 0, len(items))
	for _, it := range items {
		v := PurchaseItemView{
			OrderItemID:    it.ID,
			ProductID:      it.ProductID,
			ProductTitle:   it.ProductTitle,
			ProductType:    it.ProductType,
			ProductVersion: it.ProductVersion,
			UnitPriceIDR:   it.UnitPriceIDR,
			Quantity:       it.Quantity,
			LineTotalIDR:   it.LineTotalIDR,
			DeliveryKind:   it.DeliveryKind,
		}
		if g, ok := grantByItem[it.ID]; ok {
			v.DeliveryStatus = g.Status
			v.GrantID = g.ID
		}
		views = append(views, v)
	}
	return PurchaseDetail{
		OrderID:       o.ID,
		OrderNumber:   o.OrderNumber,
		StoreID:       o.StoreID,
		StoreName:     storeName,
		StoreSlug:     storeSlug,
		MerchantID:    o.MerchantID,
		PaymentStatus: o.PaymentStatus,
		Source:        o.Source,
		Currency:      o.Currency,
		SubtotalIDR:   o.SubtotalIDR,
		DiscountIDR:   o.DiscountIDR,
		TipIDR:        o.TipIDR,
		FeeIDR:        o.FeeIDR,
		GrossIDR:      o.GrossIDR,
		PaidAt:        o.PaidAt,
		CreatedAt:     o.CreatedAt,
		Items:         views,
	}, nil
}

// Ensure orders package referenced for clarity when mapping.
var _ = orders.PaymentPaid
