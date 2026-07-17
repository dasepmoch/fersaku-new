package application

import (
	"context"
	"encoding/json"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/gateway"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/payments"
)

// GatewayStore is persistence for QRIS gateway API (BE-320).
type GatewayStore interface {
	WithTx(ctx context.Context, fn func(ctx context.Context) error) error

	GetAPIKeyByPrefix(ctx context.Context, prefix string) (gateway.APIKey, error)
	TouchAPIKeyLastUsed(ctx context.Context, id string, at time.Time) error
	InsertAPIKey(ctx context.Context, k gateway.APIKey) error

	GetCapability(ctx context.Context, merchantID, mode, capability string) (gateway.Capability, error)
	UpsertCapability(ctx context.Context, c gateway.Capability) error

	GetRedirectOrigin(ctx context.Context, merchantID, mode, origin string) (gateway.RedirectOrigin, error)
	InsertRedirectOrigin(ctx context.Context, o gateway.RedirectOrigin) error

	GetWebhookEndpoint(ctx context.Context, id string) (gateway.WebhookEndpoint, error)
	InsertWebhookEndpoint(ctx context.Context, e gateway.WebhookEndpoint) error

	GetCanonicalStore(ctx context.Context, merchantID string) (CheckoutStoreRow, error)
	GetMerchantStatus(ctx context.Context, merchantID string) (string, error)

	InsertOrder(ctx context.Context, o CheckoutOrder) error
	UpdateOrderStatus(ctx context.Context, id, paymentStatus, orderStatus string, now time.Time) error

	InsertPaymentIntent(ctx context.Context, pi payments.Intent) error
	GetPaymentIntentByID(ctx context.Context, id string) (payments.Intent, error)
	GetPaymentIntentByMerchantRef(ctx context.Context, merchantID, mode, ref string) (payments.Intent, error)
	GetPaymentIntentByIdempotency(ctx context.Context, merchantID, mode, keyHash string) (payments.Intent, error)
	UpdatePaymentIntentStatus(ctx context.Context, id, fromStatus, toStatus string, patch PaymentIntentPatch, now time.Time) (payments.Intent, error)
	ForceUpdatePaymentIntent(ctx context.Context, id, toStatus string, patch PaymentIntentPatch, now time.Time) (payments.Intent, error)

	InsertEvent(ctx context.Context, e gateway.PaymentEvent) error
	GetEventByID(ctx context.Context, id string) (gateway.PaymentEvent, error)
	ListEventsByIntent(ctx context.Context, intentID, merchantID string, limit int32) ([]gateway.PaymentEvent, error)

	TryInsertIdempotency(ctx context.Context, rec IdempotencyRecord) (IdempotencyRecord, bool, error)
	GetIdempotency(ctx context.Context, subjectType, subjectID, operation string, paymentMode *string, keyHash string) (IdempotencyRecord, error)
	CompleteIdempotency(ctx context.Context, id, status string, resourceType, resourceID *string, responseStatus int32, body json.RawMessage) (IdempotencyRecord, error)

	InsertOutbox(ctx context.Context, id, topic string, payload []byte, dedupeKey *string, paymentMode *string, availableAt time.Time) error

	IsNotFound(err error) bool
	IsUniqueViolation(err error) bool
}
