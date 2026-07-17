package application

import (
	"context"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/admin"
)

// AdminReadStore is the BE-500 admin read-model port.
type AdminReadStore interface {
	IsNotFound(err error) bool

	OverviewCounts(ctx context.Context) (admin.Overview, error)
	PlatformVolumeHours(ctx context.Context) ([]int64, error)

	ListMerchants(ctx context.Context, f admin.ListFilter, cursorAt *time.Time, cursorID *string) ([]AdminMerchantRow, error)
	GetMerchant(ctx context.Context, id string) (AdminMerchantRow, error)

	ListBuyers(ctx context.Context, f admin.ListFilter, cursorAt *time.Time, cursorID *string) ([]AdminBuyerRow, error)
	GetBuyer(ctx context.Context, id string) (AdminBuyerRow, error)
	ListBuyerPurchases(ctx context.Context, buyerID string, limit int32) ([]admin.BuyerPurchase, error)
	ListBuyerSessions(ctx context.Context, buyerID string, limit int32) ([]admin.BuyerSession, error)

	ListOrders(ctx context.Context, f admin.ListFilter, cursorAt *time.Time, cursorID *string) ([]AdminOrderRow, error)
	GetOrder(ctx context.Context, id string) (AdminOrderRow, error)

	ListPayments(ctx context.Context, f admin.ListFilter, cursorAt *time.Time, cursorID *string) ([]AdminPaymentRow, error)
	GetPayment(ctx context.Context, id string) (AdminPaymentRow, error)

	ListWithdrawals(ctx context.Context, f admin.ListFilter, cursorAt *time.Time, cursorID *string) ([]AdminWithdrawalRow, error)
	GetWithdrawal(ctx context.Context, id string) (AdminWithdrawalRow, error)

	InventoryProducts(ctx context.Context, limit int32) ([]admin.StockProduct, error)
	InventoryItems(ctx context.Context, limit int32) ([]admin.StockItem, error)
	InventorySchema(ctx context.Context) ([]admin.InventoryField, error)

	ListFulfillments(ctx context.Context, f admin.ListFilter, cursorAt *time.Time, cursorID *string) ([]AdminFulfillmentRow, error)
	GetFulfillment(ctx context.Context, id string) (AdminFulfillmentRow, error)

	ListReviews(ctx context.Context, f admin.ListFilter, cursorAt *time.Time, cursorID *string) ([]AdminReviewRow, error)
	GetReview(ctx context.Context, id string) (admin.Review, error)

	LookupUsers(ctx context.Context, q string, limit int32) ([]admin.UserLookup, error)
	GetUser(ctx context.Context, id string) (admin.UserLookup, error)
}

// Row carriers (created_at for cursors; mapped to FE DTOs in service).
type AdminMerchantRow struct {
	admin.Merchant
	CreatedAt time.Time
}

type AdminBuyerRow struct {
	admin.Buyer
	CreatedAt time.Time
	LastAt    *time.Time
}

type AdminOrderRow struct {
	admin.Order
	CreatedAt time.Time
}

type AdminPaymentRow struct {
	admin.Payment
	CreatedAt time.Time
	UpdatedAt time.Time
}

type AdminWithdrawalRow struct {
	admin.Withdrawal
	CreatedAt time.Time
}

type AdminFulfillmentRow struct {
	admin.Fulfillment
	CreatedAt time.Time
}

type AdminReviewRow struct {
	admin.Review
	CreatedAt time.Time
}
