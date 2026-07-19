package gateway

import (
	"encoding/json"
	"time"
)

// Payment modes and capability codes.
const (
	ModeSandbox = "SANDBOX"
	ModeLive    = "LIVE"

	CapabilityQRISAPI = "QRIS_API"

	KeyStatusActive    = "ACTIVE"
	KeyStatusRevoked   = "REVOKED"
	KeyStatusSuspended = "SUSPENDED"
	KeyStatusExpired   = "EXPIRED"

	CapStatusInactive   = "INACTIVE"
	CapStatusPendingKYC = "PENDING_KYC"
	CapStatusActive     = "ACTIVE"
	CapStatusSuspended  = "SUSPENDED"
	CapStatusExpired    = "EXPIRED"
	CapStatusRevoked    = "REVOKED"

	OriginStatusActive  = "ACTIVE"
	OriginStatusRevoked = "REVOKED"

	WebhookStatusActive              = "ACTIVE"
	WebhookStatusPendingVerification = "PENDING_VERIFICATION"
	WebhookStatusPendingSecretClaim  = "PENDING_SECRET_CLAIM"
	WebhookStatusSuspended           = "SUSPENDED"
	WebhookStatusRevoked             = "REVOKED"

	// API key public prefixes (raw key never stored).
	KeyPrefixSandbox = "fsk_test_"
	KeyPrefixLive    = "fsk_live_"
)

// Bounds for create request.
const (
	MinExpiresMinutes = 5
	MaxExpiresMinutes = 60
	DefaultExpiresMin = 15
	MaxURLBytes       = 2048
	MaxMetadataBytes  = 8 * 1024
	MaxMetadataDepth  = 4
	MaxMetadataKeys   = 50
	MaxMetadataStr    = 1024
	MaxDescriptionLen = 500
	MaxMerchantRefLen = 128
	MaxCustomerRefLen = 128
)

// APIKey is a stored merchant credential (hash only).
type APIKey struct {
	ID                string
	MerchantID        string
	KeyPrefix         string
	KeyHash           string
	PaymentMode       string
	Status            string
	Name              string
	LastUsedAt        *time.Time
	RevokedAt         *time.Time
	ExpiresAt         *time.Time
	CreatedAt         time.Time
	UpdatedAt         time.Time
	KeyVersion        int32
	IssuanceRequestID *string
	Fingerprint       string
}

// Capability is LIVE/SANDBOX QRIS_API gate state.
type Capability struct {
	ID          string
	MerchantID  string
	PaymentMode string
	Capability  string
	Status      string
	KYCCaseID   *string
	KYCVersion  *int32
	EffectiveAt *time.Time
	ExpiresAt   *time.Time
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// RedirectOrigin is an allowlisted HTTPS origin for browser redirects.
type RedirectOrigin struct {
	ID          string
	MerchantID  string
	PaymentMode string
	Origin      string
	Status      string
	CreatedAt   time.Time
}

// WebhookEndpoint is a registered seller outbound endpoint (validation only in BE-320).
type WebhookEndpoint struct {
	ID            string
	MerchantID    string
	PaymentMode   string
	URL           string
	Status        string
	ConfigVersion int32
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

// PaymentEvent is a merchant-visible gateway lifecycle event.
type PaymentEvent struct {
	ID              string
	MerchantID      string
	PaymentMode     string
	PaymentIntentID string
	EventType       string
	Payload         json.RawMessage
	CreatedAt       time.Time
}

// AuthContext is resolved from Authorization: Bearer fsk_...
type AuthContext struct {
	KeyID       string
	MerchantID  string
	PaymentMode string
	KeyPrefix   string
}

// Event types emitted on create/cancel.
const (
	EventPaymentCreated         = "payment_intent.created"
	EventPaymentCancelRequested = "payment_intent.cancel_requested"
	EventPaymentCancelled       = "payment_intent.cancelled"
	EventPaymentStatus          = "payment_intent.status"
)
