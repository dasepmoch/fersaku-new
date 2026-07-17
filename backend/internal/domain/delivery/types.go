package delivery

import (
	"encoding/json"
	"time"
)

// Grant status machine: PENDING_FULFILLMENT -> ACTIVE -> EXPIRED|REVOKED
// ACTIVE -> DELIVERY_FAILED -> ACTIVE (safe retry).
const (
	StatusPendingFulfillment = "PENDING_FULFILLMENT"
	StatusActive             = "ACTIVE"
	StatusDeliveryFailed     = "DELIVERY_FAILED"
	StatusExpired            = "EXPIRED"
	StatusRevoked            = "REVOKED"
)

// Delivery kinds.
const (
	KindDownload      = "DOWNLOAD"
	KindProtectedLink = "PROTECTED_LINK"
	KindCredential    = "CREDENTIAL"
	KindCode          = "CODE"
)

// Attempt channels / results.
const (
	ChannelPortal       = "PORTAL"
	ChannelEmail        = "EMAIL"
	ChannelResend       = "RESEND"
	ChannelRetry        = "RETRY"
	ChannelForceFulfill = "FORCE_FULFILL"
	ChannelRevoke       = "REVOKE"
	ChannelAccess       = "ACCESS"

	ResultQueued    = "QUEUED"
	ResultSent      = "SENT"
	ResultDelivered = "DELIVERED"
	ResultFailed    = "FAILED"
	ResultSkipped   = "SKIPPED"
	ResultRevoked   = "REVOKED"

	ActorSystem = "SYSTEM"
	ActorBuyer  = "BUYER"
	ActorSeller = "SELLER"
	ActorAdmin  = "ADMIN"
)

// Outbox topics for idempotent delivery jobs.
const (
	TopicDeliveryResend = "delivery.resend"
	TopicDeliveryRetry  = "delivery.retry"
	TopicInvoiceRender  = "invoice.render"
)

// DefaultAccessTTL is the default access token lifetime.
const DefaultAccessTTL = 7 * 24 * time.Hour

// DefaultMaxAccesses bounds portal/token reveals.
const DefaultMaxAccesses = 20

// Grant is one versioned fulfillment entitlement for a paid order item.
type Grant struct {
	ID                   string
	OrderID              string
	OrderItemID          string
	StoreID              string
	MerchantID           string
	ProductID            string
	BuyerUserID          *string
	BuyerEmail           string
	DeliveryKind         string
	Status               string
	StockItemID          *string
	StockReservationID   *string
	ObjectID             *string
	FulfillmentEffectKey string
	AccessTokenHash      *string
	AccessTokenExpiresAt *time.Time
	MaxAccesses          int32
	AccessCount          int32
	RecipientSnapshot    json.RawMessage
	ProductSnapshot      json.RawMessage
	RevokedAt            *time.Time
	RevokeReason         *string
	ExpiresAt            *time.Time
	LastAccessedAt       *time.Time
	ActivatedAt          *time.Time
	FailedAt             *time.Time
	FailReason           *string
	Version              int32
	CreatedAt            time.Time
	UpdatedAt            time.Time
}

// Attempt is a channel delivery/access attempt without secrets.
type Attempt struct {
	ID             string
	GrantID        string
	OrderID        string
	StoreID        string
	Channel        string
	Result         string
	SafeErrorCode  *string
	RetryCount     int32
	ActorUserID    *string
	ActorKind      string
	Reason         string
	IdempotencyKey *string
	CreatedAt      time.Time
}

// GrantPatch is a partial status update applied under optimistic from-status.
type GrantPatch struct {
	RevokedAt            *time.Time
	RevokeReason         *string
	FailedAt             *time.Time
	FailReason           *string
	ActivatedAt          *time.Time
	StockItemID          *string
	StockReservationID   *string
	AccessTokenHash      *string
	AccessTokenExpiresAt *time.Time
	LastAccessedAt       *time.Time
	AccessCount          *int32
}

// AccessResult is buyer-facing delivery payload (secrets only for owner).
type AccessResult struct {
	GrantID      string
	OrderID      string
	OrderItemID  string
	DeliveryKind string
	Status       string
	AccessCount  int32
	MaxAccesses  int32
	// Secrets populated only for CODE/CREDENTIAL when authorized buyer.
	Secrets map[string]string
	// DownloadObjectID for DOWNLOAD/PROTECTED_LINK (no raw R2 key).
	DownloadObjectID *string
	// AccessToken returned once on mint/resend exchange (never stored raw).
	AccessToken string
	ExpiresAt   *time.Time
}
