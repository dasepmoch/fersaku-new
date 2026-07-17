package application

import (
	"context"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/delivery"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/invoices"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/orders"
)

// DeliveryProductRow is a product price/title snapshot source.
type DeliveryProductRow struct {
	ID         string
	StoreID    string
	MerchantID string
	Slug       string
	Title      string
	Type       string
	Status     string
	Version    string
	PriceIDR   int64
}

// DeliveryStoreRow is store name for invoice issuer snapshot.
type DeliveryStoreRow struct {
	ID         string
	Name       string
	MerchantID string
}

// DeliveryStockPayload is encrypted stock for buyer reveal.
type DeliveryStockPayload struct {
	ID               string
	ProductID        string
	StoreID          string
	MerchantID       string
	SchemaVersion    int32
	Status           string
	EncryptedPayload []byte
	KeyVersion       string
	MaskedPreview    map[string]string
}

// DeliveryStore is the persistence port for BE-235.
type DeliveryStore interface {
	WithTx(ctx context.Context, fn func(ctx context.Context) error) error

	InsertOrder(ctx context.Context, o orders.Order) error
	InsertOrderItem(ctx context.Context, it orders.OrderItem) error
	GetOrderByID(ctx context.Context, id string) (orders.Order, error)
	GetOrderByNumber(ctx context.Context, orderNumber string) (orders.Order, error)
	ListOrderItems(ctx context.Context, orderID string) ([]orders.OrderItem, error)
	GetOrderItem(ctx context.Context, id string) (orders.OrderItem, error)

	InsertGrant(ctx context.Context, g delivery.Grant) error
	GetGrantByID(ctx context.Context, id string) (delivery.Grant, error)
	GetGrantByOrderItem(ctx context.Context, orderItemID string) (delivery.Grant, error)
	GetGrantByOrderID(ctx context.Context, orderID string) (delivery.Grant, error)
	ListGrantsByOrder(ctx context.Context, orderID string) ([]delivery.Grant, error)
	GetGrantByAccessTokenHash(ctx context.Context, hash string) (delivery.Grant, error)
	UpdateGrantStatus(ctx context.Context, id, from, to string, patch delivery.GrantPatch, now time.Time) (delivery.Grant, error)
	IncrementAccess(ctx context.Context, id string, now time.Time) (delivery.Grant, error)
	RotateAccessToken(ctx context.Context, id, tokenHash string, expiresAt, now time.Time) (delivery.Grant, error)

	InsertAttempt(ctx context.Context, a delivery.Attempt) error
	GetAttemptByIdem(ctx context.Context, grantID, idem string) (delivery.Attempt, error)
	ListAttemptsByGrant(ctx context.Context, grantID string, limit int32) ([]delivery.Attempt, error)

	InsertInvoice(ctx context.Context, inv invoices.Invoice) error
	InsertInvoiceVersion(ctx context.Context, v invoices.Version) error
	GetInvoiceByID(ctx context.Context, id string) (invoices.Invoice, error)
	GetInvoiceByOrder(ctx context.Context, orderID string) (invoices.Invoice, error)
	GetInvoiceByPublicCodeHash(ctx context.Context, hash string) (invoices.Invoice, error)
	GetInvoiceVersion(ctx context.Context, invoiceID string, version int32) (invoices.Version, error)
	UpdateInvoiceRenderStatus(ctx context.Context, invoiceID string, version int32, status string, objectID *string, errCode *string, renderedAt *time.Time) (invoices.Version, error)
	UpdateInvoiceStatus(ctx context.Context, id, status string, now time.Time) error

	GetStore(ctx context.Context, storeID string) (DeliveryStoreRow, error)
	GetProduct(ctx context.Context, storeID, productID string) (DeliveryProductRow, error)
	GetStockPayload(ctx context.Context, stockItemID string) (DeliveryStockPayload, error)
	UserCanAccessStore(ctx context.Context, userID, storeID string) (bool, error)
	UserIsPlatformAdmin(ctx context.Context, userID string) (bool, error)

	InsertOutbox(ctx context.Context, id, topic string, payload []byte, dedupeKey *string, availableAt time.Time) error

	IsNotFound(err error) bool
	IsUniqueViolation(err error) bool
}
