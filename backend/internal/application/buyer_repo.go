package application

import (
	"context"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/delivery"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/orders"
)

// BuyerPurchaseStore is the persistence port for buyer purchase list/detail (BE-430).
type BuyerPurchaseStore interface {
	ListOrdersByBuyer(ctx context.Context, buyerUserID string, cursorCreatedAt *time.Time, cursorID *string, limit int32) ([]orders.Order, error)
	GetOrderByBuyer(ctx context.Context, orderID, buyerUserID string) (orders.Order, error)
	ListOrderItems(ctx context.Context, orderID string) ([]orders.OrderItem, error)
	ListGrantsByOrder(ctx context.Context, orderID string) ([]delivery.Grant, error)
	// GetStoreIdentity returns display name + public slug for store links.
	GetStoreIdentity(ctx context.Context, storeID string) (name string, slug string, err error)
	IsNotFound(err error) bool
}
