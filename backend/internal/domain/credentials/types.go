package credentials

import "time"

// Issuance purposes (normalize INITIAL_ISSUE→API_KEY, ROTATE→ROTATION at app boundary).
const (
	PurposeAPIKey       = "API_KEY"
	PurposeRotation     = "ROTATION"
	PurposeInitialIssue = "INITIAL_ISSUE"
	PurposeRotate       = "ROTATE"
)

// Claim kinds.
const (
	ClaimKindAPIKey                = "API_KEY"
	ClaimKindWebhookEndpointSecret = "WEBHOOK_ENDPOINT_SECRET"
)

// Claim statuses.
const (
	ClaimStatusActive   = "ACTIVE"
	ClaimStatusConsumed = "CONSUMED"
	ClaimStatusExpired  = "EXPIRED"
	ClaimStatusRevoked  = "REVOKED"
)

// Claim TTL and bounds.
const (
	ClaimTTL         = 15 * time.Minute
	IssuanceAuthTTL  = 7 * 24 * time.Hour
	MaxClaimAttempts = 5
	ClaimTokenBytes  = 32
)

// Outbox topics (no raw secrets in payload).
const (
	TopicCredentialClaimed   = "credential.claimed"
	TopicCredentialRevoked   = "credential.revoked"
	TopicCredentialSuspended = "credential.suspended"
	TopicIssuanceRequested   = "credential.issuance.requested"
)

// NormalizePurpose maps UI purpose strings to stored values.
func NormalizePurpose(p string) string {
	switch p {
	case PurposeInitialIssue, PurposeAPIKey, "":
		return PurposeAPIKey
	case PurposeRotate, PurposeRotation:
		return PurposeRotation
	default:
		return p
	}
}

// MaskedCredential is safe for list/GET responses (never raw key).
type MaskedCredential struct {
	ID          string
	MerchantID  string
	KeyPrefix   string
	Fingerprint string
	PaymentMode string
	Status      string
	Name        string
	KeyVersion  int32
	LastUsedAt  *time.Time
	RevokedAt   *time.Time
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// IssuanceView is safe issuance metadata for seller (no claim hash).
type IssuanceView struct {
	ID              string
	MerchantID      string
	PaymentMode     string
	Purpose         string
	Status          string
	ClaimExpiresAt  *time.Time
	HasPendingClaim bool
	AuthorizedAt    *time.Time
	ClaimedAt       *time.Time
	ExpiresAt       *time.Time
	CreatedAt       time.Time
}

// SecretClaim is a one-time claim row (hash only).
type SecretClaim struct {
	ID                  string
	Kind                string
	ResourceType        string
	ResourceID          string
	ResourceVersion     int32
	MerchantID          string
	RecipientUserID     string
	ClaimTokenHash      string
	Status              string
	Attempts            int32
	MaxAttempts         int32
	ExpiresAt           time.Time
	ConsumedAt          *time.Time
	MFABindingSessionID *string
	IssuanceRequestID   *string
	CreatedAt           time.Time
	UpdatedAt           time.Time
}
