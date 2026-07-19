package webhooks

import "time"

// Endpoint statuses (seller_webhook_endpoints).
const (
	StatusPendingVerification = "PENDING_VERIFICATION"
	StatusPendingSecretClaim  = "PENDING_SECRET_CLAIM"
	StatusActive              = "ACTIVE"
	StatusSuspended           = "SUSPENDED"
	StatusRevoked             = "REVOKED"
)

// Secret version statuses.
const (
	SecretPendingClaim = "PENDING_CLAIM"
	SecretActive       = "ACTIVE"
	SecretPrevious     = "PREVIOUS"
	SecretRevoked      = "REVOKED"
)

// Delivery statuses.
const (
	DeliveryQueued     = "QUEUED"
	DeliveryDelivered  = "DELIVERED"
	DeliveryRetrying   = "RETRYING"
	DeliveryDeadLetter = "DEAD_LETTER"
	DeliveryCancelled  = "CANCELLED"
)

// Source kinds (outbound only — never provider callback).
const (
	SourcePayment    = "PAYMENT"
	SourceWithdrawal = "WITHDRAWAL"
	SourceTest       = "TEST"
	SourceGateway    = "GATEWAY"
)

// Payload / signing contract.
const (
	PayloadVersionV1   = "fersaku.webhook.v1"
	TopicDeliver       = "seller_webhook.deliver"
	HeaderSignature    = "X-Fersaku-Signature"
	HeaderTimestamp    = "X-Fersaku-Timestamp"
	HeaderEventID      = "X-Fersaku-Event-Id"
	HeaderEventType    = "X-Fersaku-Event-Type"
	HeaderPayloadVer   = "X-Fersaku-Payload-Version"
	DefaultMaxAttempts = 8
	SecretOverlapTTL   = 24 * time.Hour
	DeliveryTimeout    = 10 * time.Second
	MaxResponseBytes   = 4096
	MaxURLBytes        = 2048
)

// Event types (allowlist values).
const (
	EventPaymentPaid      = "payment.paid"
	EventPaymentCreated   = "payment_intent.created"
	EventPaymentCancelled = "payment_intent.cancelled"
	EventTest             = "webhook.test"
)

// Endpoint is a merchant-owned outbound HTTPS target.
type Endpoint struct {
	ID                     string
	MerchantID             string
	StoreID                *string
	PaymentMode            string
	URL                    string
	URLHost                string
	Status                 string
	ConfigVersion          int32
	EventAllowlist         []string
	CurrentSecretVersion   *int32
	PreviousSecretVersion  *int32
	SecretOverlapExpiresAt *time.Time
	FailureCount           int32
	LastSuccessAt          *time.Time
	LastFailureAt          *time.Time
	DisabledAt             *time.Time
	DisabledReason         string
	CreatedAt              time.Time
	UpdatedAt              time.Time
}

// SecretVersion holds envelope-encrypted signing material (server retains for sign).
type SecretVersion struct {
	ID               string
	EndpointID       string
	MerchantID       string
	Version          int32
	Status           string
	SecretCiphertext []byte
	SecretKeyVersion string
	Fingerprint      string
	ActivatedAt      *time.Time
	SupersededAt     *time.Time
	OverlapExpiresAt *time.Time
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

// Delivery is one outbound event→endpoint row (retries share event_id + body).
type Delivery struct {
	ID               string
	EndpointID       string
	MerchantID       string
	StoreID          *string
	PaymentMode      string
	EventID          string
	EventType        string
	PayloadVersion   string
	PayloadBody      []byte
	PayloadHash      string
	SourceKind       string
	PaymentIntentID  *string
	OrderID          *string
	WithdrawalID     *string
	IsTest           bool
	Status           string
	AttemptCount     int32
	MaxAttempts      int32
	NextRetryAt      *time.Time
	LastHTTPStatus   *int32
	LastLatencyMs    *int32
	LastErrorClass   *string
	DeadLetterReason *string
	DeliveredAt      *time.Time
	CancelledAt      *time.Time
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

// Attempt is one HTTP POST (fresh timestamp/signature).
type Attempt struct {
	ID              string
	DeliveryID      string
	AttemptNo       int32
	SignedTimestamp string
	SignatureHeader string
	RequestURL      string
	HTTPStatus      *int32
	LatencyMs       *int32
	ErrorClass      *string
	ErrorDetail     *string
	ResponseSnippet *string
	StartedAt       time.Time
	FinishedAt      time.Time
}

// DeadLetter is a terminal outbound failure for admin recovery.
type DeadLetter struct {
	ID             string
	DeliveryID     string
	EndpointID     string
	MerchantID     string
	EventID        string
	EventType      string
	Reason         string
	LastHTTPStatus *int32
	AttemptCount   int32
	CreatedAt      time.Time
	ResolvedAt     *time.Time
	ResolvedBy     *string
	ResolveReason  *string
}

// AdminDeliveryView is the outbound-only admin projection (never provider IDs).
type AdminDeliveryView struct {
	DeliveryID       string
	Kind             string // always SELLER_DELIVERY
	EndpointID       string
	EndpointHost     string
	MerchantID       string
	StoreID          *string
	PaymentMode      string
	EventID          string
	EventType        string
	Status           string
	AttemptCount     int32
	NextRetryAt      *time.Time
	LastHTTPClass    *string
	LastLatencyMs    *int32
	DeadLetterReason *string
	IsTest           bool
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

// OutboxDeliverPayload is the seller_webhook.deliver job body.
type OutboxDeliverPayload struct {
	DeliveryID string `json:"deliveryId"`
	EndpointID string `json:"endpointId"`
	EventID    string `json:"eventId"`
	Version    int    `json:"v"`
}
