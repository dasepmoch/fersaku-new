package application

import (
	"context"
	"encoding/json"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/credentials"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/gateway"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/kyc"
)

// CredentialStore is persistence for BE-410 credential lifecycle.
type CredentialStore interface {
	WithTx(ctx context.Context, fn func(ctx context.Context) error) error

	ListAPIKeysByMerchant(ctx context.Context, merchantID string, limit int32) ([]gateway.APIKey, error)
	GetAPIKeyByID(ctx context.Context, id string) (gateway.APIKey, error)
	GetActiveAPIKey(ctx context.Context, merchantID string) (gateway.APIKey, error)
	InsertAPIKey(ctx context.Context, k gateway.APIKey) error
	RevokeAPIKey(ctx context.Context, id string, at time.Time) error
	SuspendAPIKey(ctx context.Context, id string, at time.Time) error
	ReactivateAPIKey(ctx context.Context, id string, at time.Time) error
	RevokeAllActiveKeys(ctx context.Context, merchantID string, at time.Time) error

	InsertIssuance(ctx context.Context, r kyc.IssuanceRequest) error
	GetIssuanceByID(ctx context.Context, id string) (kyc.IssuanceRequest, error)
	GetIssuanceByClaimHash(ctx context.Context, hash string) (kyc.IssuanceRequest, error)
	GetOutstandingIssuance(ctx context.Context, merchantID, mode string) (kyc.IssuanceRequest, error)
	ListIssuancesByMerchant(ctx context.Context, merchantID string, limit int32) ([]kyc.IssuanceRequest, error)
	MarkIssuanceClaimed(ctx context.Context, id string, at time.Time, apiKeyID string) error
	UpdateIssuanceClaimToken(ctx context.Context, p UpdateIssuanceClaimParams) error
	RevokeIssuance(ctx context.Context, id string, at time.Time, reason string) error
	BumpClaimAttempts(ctx context.Context, id string, at time.Time) error

	InsertSecretClaim(ctx context.Context, c credentials.SecretClaim) error
	GetSecretClaimByHash(ctx context.Context, hash string) (credentials.SecretClaim, error)
	ConsumeSecretClaim(ctx context.Context, id string, at time.Time) error
	RevokeSecretClaimsForIssuance(ctx context.Context, issuanceID string, at time.Time) error

	GetCapability(ctx context.Context, merchantID, mode, capability string) (gateway.Capability, error)
	GetMerchantOwner(ctx context.Context, merchantID string) (ownerUserID, status string, err error)
	GetMerchantByOwner(ctx context.Context, ownerUserID string) (merchantID, status string, err error)
	MerchantMemberActive(ctx context.Context, merchantID, userID string) (role string, err error)
	GetStoreMerchant(ctx context.Context, storeID string) (merchantID, status string, err error)

	InsertOutbox(ctx context.Context, id, topic string, payload []byte, dedupeKey *string, paymentMode *string, availableAt time.Time) error
	InsertAudit(ctx context.Context, id string, payloadHash []byte, at time.Time) error

	TryInsertIdempotency(ctx context.Context, rec IdempotencyRecord) (IdempotencyRecord, bool, error)
	GetIdempotency(ctx context.Context, subjectType, subjectID, operation string, paymentMode *string, keyHash string) (IdempotencyRecord, error)
	CompleteIdempotency(ctx context.Context, id, status string, resourceType, resourceID *string, responseStatus int32, body json.RawMessage) (IdempotencyRecord, error)

	IsNotFound(err error) bool
	IsUniqueViolation(err error) bool
}

// UpdateIssuanceClaimParams sets claim token hash on an issuance request.
type UpdateIssuanceClaimParams struct {
	ID                   string
	ClaimTokenHash       string
	ClaimExpiresAt       time.Time
	ClaimRecipientUserID string
	MFABindingSessionID  *string
	Status               string // optional override (e.g. AUTHORIZED)
	AuthorizerUserID     *string
	AuthorizedAt         *time.Time
	ExpiresAt            *time.Time
	Reason               string
	UpdatedAt            time.Time
}
