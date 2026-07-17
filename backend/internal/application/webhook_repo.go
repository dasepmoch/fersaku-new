package application

import (
	"context"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/credentials"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/webhooks"
)

// WebhookStore is persistence for outbound seller webhooks (BE-420).
type WebhookStore interface {
	WithTx(ctx context.Context, fn func(ctx context.Context) error) error

	InsertEndpoint(ctx context.Context, e webhooks.Endpoint) error
	GetEndpoint(ctx context.Context, id string) (webhooks.Endpoint, error)
	ListEndpointsByMerchant(ctx context.Context, merchantID string, limit int32) ([]webhooks.Endpoint, error)
	UpdateEndpoint(ctx context.Context, e webhooks.Endpoint) error

	InsertSecretVersion(ctx context.Context, v webhooks.SecretVersion) error
	GetSecretVersion(ctx context.Context, endpointID string, version int32) (webhooks.SecretVersion, error)
	GetActiveSecret(ctx context.Context, endpointID string) (webhooks.SecretVersion, error)
	ListSecretVersions(ctx context.Context, endpointID string) ([]webhooks.SecretVersion, error)
	UpdateSecretVersion(ctx context.Context, v webhooks.SecretVersion) error

	InsertDelivery(ctx context.Context, d webhooks.Delivery) error
	GetDelivery(ctx context.Context, id string) (webhooks.Delivery, error)
	GetDeliveryByEndpointEvent(ctx context.Context, endpointID, eventID string) (webhooks.Delivery, error)
	UpdateDelivery(ctx context.Context, d webhooks.Delivery) error
	ListDeliveriesByMerchant(ctx context.Context, merchantID string, status *string, limit int32) ([]webhooks.Delivery, error)
	ListAdminDeliveries(ctx context.Context, status, merchantID *string, limit int32) ([]webhooks.AdminDeliveryView, error)

	InsertAttempt(ctx context.Context, a webhooks.Attempt) error
	ListAttempts(ctx context.Context, deliveryID string) ([]webhooks.Attempt, error)

	InsertDeadLetter(ctx context.Context, dl webhooks.DeadLetter) error
	ResolveDeadLetter(ctx context.Context, deliveryID, resolvedBy, reason string, at time.Time) error

	InsertSecretClaim(ctx context.Context, c credentials.SecretClaim) error
	GetSecretClaimByHash(ctx context.Context, hash string) (credentials.SecretClaim, error)
	ConsumeSecretClaim(ctx context.Context, id string, at time.Time) error
	RevokeActiveSecretClaimsForResource(ctx context.Context, kind, resourceType, resourceID string, at time.Time) error

	GetStoreMerchant(ctx context.Context, storeID string) (merchantID, status string, err error)
	MerchantMemberActive(ctx context.Context, merchantID, userID string) (role string, err error)
	GetMerchantByOwner(ctx context.Context, ownerUserID string) (merchantID, status string, err error)

	InsertOutbox(ctx context.Context, id, topic string, payload []byte, dedupeKey *string, paymentMode *string, availableAt time.Time) error

	IsNotFound(err error) bool
	IsUniqueViolation(err error) bool
}
