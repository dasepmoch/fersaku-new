package application

import (
	"context"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/orders"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/payments"
)

// CallbackStore is persistence for inbound Xendit callbacks (BE-330).
type CallbackStore interface {
	WithTx(ctx context.Context, fn func(ctx context.Context) error) error

	InsertRejection(ctx context.Context, r payments.CallbackRejection) error

	// InsertProviderEvent returns (event, inserted). On unique conflict, inserted=false and event is empty.
	InsertProviderEvent(ctx context.Context, e payments.ProviderEvent) (payments.ProviderEvent, bool, error)
	GetProviderEventByCanonical(ctx context.Context, provider, accountScope, paymentMode, eventID string) (payments.ProviderEvent, error)
	GetProviderEventByID(ctx context.Context, callbackID string) (payments.ProviderEvent, error)
	LockProviderEvent(ctx context.Context, callbackID string) (payments.ProviderEvent, error)
	UpdateProviderEventState(ctx context.Context, callbackID, state string, patch CallbackEventPatch, now time.Time) (payments.ProviderEvent, error)
	ListProviderEventsReady(ctx context.Context, now time.Time, limit int32) ([]payments.ProviderEvent, error)
	ListAdminProviderEvents(ctx context.Context, limit int32) ([]payments.ProviderEvent, error)

	// Payment lock/resolve (FOR UPDATE).
	GetPaymentIntentByProviderRefForUpdate(ctx context.Context, provider, accountScope, paymentMode, providerRef string) (payments.Intent, error)
	GetPaymentIntentByExternalIDForUpdate(ctx context.Context, paymentMode, externalID string) (payments.Intent, error)
	GetPaymentIntentByIDForUpdate(ctx context.Context, id string) (payments.Intent, error)
	GetPaymentIntentByID(ctx context.Context, id string) (payments.Intent, error)

	MarkPaymentPaid(ctx context.Context, id string, paidLate bool, precedingStatus string, now time.Time) (payments.Intent, error)
	MarkPaymentTerminal(ctx context.Context, id, toStatus string, preceding *string, now time.Time) (payments.Intent, error)
	SetFinancialState(ctx context.Context, id, state string, now time.Time) error

	MarkOrderPaid(ctx context.Context, orderID string, now time.Time) error
	MarkOrderTerminal(ctx context.Context, orderID, paymentStatus, orderStatus string, now time.Time) error
	GetOrderByID(ctx context.Context, id string) (CheckoutOrder, error)
	ListOrderItems(ctx context.Context, orderID string) ([]orders.OrderItem, error)

	InsertSettlement(ctx context.Context, s payments.Settlement) (payments.Settlement, bool, error)
	GetSettlementByIntent(ctx context.Context, paymentIntentID string) (payments.Settlement, error)

	InsertOutbox(ctx context.Context, id, topic string, payload []byte, dedupeKey *string, paymentMode *string, availableAt time.Time) error

	CountSettlementsByIntent(ctx context.Context, paymentIntentID string) (int64, error)
	CountProviderEventsByCanonical(ctx context.Context, provider, accountScope, paymentMode, eventID string) (int64, error)
	CountRejections(ctx context.Context, reason string) (int64, error)

	IsNotFound(err error) bool
	IsUniqueViolation(err error) bool
}

// CallbackEventPatch is partial update for provider events.
type CallbackEventPatch struct {
	FailureCode      *string
	AttemptCount     *int32
	LeaseOwner       *string
	LeaseUntil       *time.Time
	NextRetryAt      *time.Time
	ProcessedAt      *time.Time
	PaymentIntentID  *string
	NormalizedType   *string
	MismatchCode     *string
	AlertCode        *string
	QuarantineReason *string
	ReplayCount      *int32
	LastReplayAt     *time.Time
	LastReplayReason *string
	// ClearLease clears lease fields when true.
	ClearLease bool
}
