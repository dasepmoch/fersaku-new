package application

import (
	"context"
	"encoding/json"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/orders"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/payments"
)

// CheckoutProduct is catalog snapshot for pricing.
type CheckoutProduct struct {
	ID              string
	StoreID         string
	MerchantID      string
	Slug            string
	Title           string
	Short           string
	Description     string
	PriceIDR        int64
	Type            string
	Status          string
	Version         string
	AllowPWYT       bool
	MinimumPriceIDR *int64
	PublishedAt     *time.Time
}

// CheckoutStoreRow is store attribution.
type CheckoutStoreRow struct {
	ID         string
	Name       string
	MerchantID string
}

// CheckoutOrder extends orders.Order with checkout columns.
type CheckoutOrder struct {
	orders.Order
	OrderStatus         string
	PaymentMode         string
	FeeSnapshotID       *string
	CouponReservationID *string
	PublicTokenHash     *string
	BuyerSessionID      *string
	ExpiresAt           *time.Time
	IdempotencyKeyHash  *string
}

// IdempotencyRecord is a durable idempotency row.
type IdempotencyRecord struct {
	ID             string
	SubjectType    string
	SubjectID      string
	Operation      string
	PaymentMode    *string
	KeyHash        string
	RequestHash    string
	Status         string
	ResourceType   *string
	ResourceID     *string
	ResponseStatus *int32
	ResponseBody   json.RawMessage
	RequestID      *string
	LeaseExpiresAt *time.Time
	ExpiresAt      time.Time
}

// CheckoutStore is persistence for hosted checkout (BE-310).
type CheckoutStore interface {
	WithTx(ctx context.Context, fn func(ctx context.Context) error) error

	GetProduct(ctx context.Context, storeID, productID string) (CheckoutProduct, error)
	GetStore(ctx context.Context, storeID string) (CheckoutStoreRow, error)

	InsertOrder(ctx context.Context, o CheckoutOrder) error
	GetOrderByID(ctx context.Context, id string) (CheckoutOrder, error)
	UpdateOrderStatus(ctx context.Context, id, paymentStatus, orderStatus string, now time.Time) error
	InsertOrderItem(ctx context.Context, it orders.OrderItem) error
	ListOrderItems(ctx context.Context, orderID string) ([]orders.OrderItem, error)

	InsertPaymentIntent(ctx context.Context, pi payments.Intent) error
	GetPaymentIntentByID(ctx context.Context, id string) (payments.Intent, error)
	GetPaymentIntentByOrder(ctx context.Context, orderID string) (payments.Intent, error)
	GetPaymentIntentByIdempotency(ctx context.Context, source, mode, keyHash string) (payments.Intent, error)
	UpdatePaymentIntentStatus(ctx context.Context, id, fromStatus, toStatus string, patch PaymentIntentPatch, now time.Time) (payments.Intent, error)
	ForceUpdatePaymentIntent(ctx context.Context, id, toStatus string, patch PaymentIntentPatch, now time.Time) (payments.Intent, error)

	TryInsertIdempotency(ctx context.Context, rec IdempotencyRecord) (IdempotencyRecord, bool, error)
	GetIdempotency(ctx context.Context, subjectType, subjectID, operation string, paymentMode *string, keyHash string) (IdempotencyRecord, error)
	CompleteIdempotency(ctx context.Context, id, status string, resourceType, resourceID *string, responseStatus int32, body json.RawMessage) (IdempotencyRecord, error)

	InsertOutbox(ctx context.Context, id, topic string, payload []byte, dedupeKey *string, paymentMode *string, availableAt time.Time) error

	IsNotFound(err error) bool
	IsUniqueViolation(err error) bool
}

// PaymentIntentPatch is partial update for status transitions.
type PaymentIntentPatch struct {
	ProviderReference *string
	QRString          *string
	QRImageURL        *string
	ExpireRequestedAt *time.Time
	ExpireReason      *string
	CancelRequestedAt *time.Time
	CancelReason      *string
	UnknownOperation  *string
	LookupScheduledAt *time.Time
	LookupAttempts    *int32
	PrecedingStatus   *string
	ClearUnknown      bool // when true, sets unknown_operation and lookup_scheduled_at to NULL via force update
}
