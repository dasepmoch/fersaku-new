package application

import (
	"context"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/orders"
)

// SellerOrderListFilter is store-scoped list query input (SEL-250).
type SellerOrderListFilter struct {
	StoreID  string
	Status   string // payment_status exact (PAID|PENDING|...)
	Source   string // STOREFRONT|QRIS_API
	Q        string // order number / buyer / product search
	From     *time.Time
	To       *time.Time
	Page     int
	PageSize int
}

// SellerOrderListRow is a denormalized list projection (no secrets).
type SellerOrderListRow struct {
	Order          orders.Order
	ProductTitle   string
	DeliveryStatus string
}

// SellerOrderPaymentSummary is optional payment intent display snapshot.
type SellerOrderPaymentSummary struct {
	ID                string
	Provider          string
	ProviderReference string
	Status            string
	Source            string
	AmountIDR         int64
	PaidLate          bool
	CreatedAt         time.Time
}

// SellerOrderGrantView is grant metadata without token/hash/secrets.
type SellerOrderGrantView struct {
	ID             string
	OrderItemID    string
	ProductID      string
	DeliveryKind   string
	Status         string
	AccessCount    int32
	MaxAccesses    int32
	ActivatedAt    *time.Time
	RevokedAt      *time.Time
	FailedAt       *time.Time
	FailReason     *string
	LastAccessedAt *time.Time
	CreatedAt      time.Time
}

// SellerOrderStore is the persistence port for seller order reads (SEL-250).
type SellerOrderStore interface {
	UserCanAccessStore(ctx context.Context, userID, storeID string) (bool, error)
	UserIsPlatformAdmin(ctx context.Context, userID string) (bool, error)
	CountOrders(ctx context.Context, f SellerOrderListFilter) (int64, error)
	ListOrders(ctx context.Context, f SellerOrderListFilter) ([]SellerOrderListRow, error)
	StatusCounts(ctx context.Context, storeID string) (map[string]int64, error)
	GetOrderByStore(ctx context.Context, storeID, orderIDOrNumber string) (orders.Order, error)
	ListOrderItems(ctx context.Context, orderID string) ([]orders.OrderItem, error)
	ListGrants(ctx context.Context, orderID string) ([]SellerOrderGrantView, error)
	GetPaymentIntent(ctx context.Context, orderID string) (*SellerOrderPaymentSummary, error)
	IsNotFound(err error) bool
}
