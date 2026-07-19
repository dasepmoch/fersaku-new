package admin

import "time"

// Emergency switch names (exactly three; no fourth maintenance switch).
const (
	EmergencySellerRegistration = "SELLER_REGISTRATION"
	EmergencyQRISCheckout       = "QRIS_CHECKOUT"
	EmergencyWithdrawals        = "WITHDRAWALS"
)

// ValidEmergencySwitch reports whether name is one of the three launch switches.
func ValidEmergencySwitch(name string) bool {
	switch name {
	case EmergencySellerRegistration, EmergencyQRISCheckout, EmergencyWithdrawals:
		return true
	default:
		return false
	}
}

// PaymentSourceStorefront and PaymentSourceQRISAPI are the only payment sources.
// MIXED is never a payment create/import/filter value.
const (
	PaymentSourceStorefront = "STOREFRONT"
	PaymentSourceQRISAPI    = "QRIS_API"
	WithdrawalSourceMixed   = "MIXED"
)

// ValidatePaymentSource rejects anything other than STOREFRONT|QRIS_API (including MIXED).
func ValidatePaymentSource(src string) bool {
	return src == PaymentSourceStorefront || src == PaymentSourceQRISAPI
}

// ValidateWithdrawalSource allows STOREFRONT|QRIS_API|MIXED (derived reporting only).
func ValidateWithdrawalSource(src string) bool {
	return src == PaymentSourceStorefront || src == PaymentSourceQRISAPI || src == WithdrawalSourceMixed
}

// Merchant status values.
const (
	MerchantStatusActive    = "ACTIVE"
	MerchantStatusSuspended = "SUSPENDED"
	MerchantStatusClosed    = "CLOSED"
)

// ValidMerchantStatus reports whether status is a closed merchant lifecycle value.
func ValidMerchantStatus(s string) bool {
	switch s {
	case MerchantStatusActive, MerchantStatusSuspended, MerchantStatusClosed:
		return true
	default:
		return false
	}
}

// API access status values (capability axis; independent of merchant.status).
const (
	APIAccessActive    = "ACTIVE"
	APIAccessSuspended = "SUSPENDED"
)

// ValidAPIAccessStatus reports ACTIVE|SUSPENDED for admin api-access updates.
func ValidAPIAccessStatus(s string) bool {
	return s == APIAccessActive || s == APIAccessSuspended
}

// AdminAction names matching FE AdminActionInput.
const (
	ActionBuyerSessionsRevoke          = "buyer.sessions.revoke"
	ActionBuyerMagicLinkSend           = "buyer.magic_link.send"
	ActionBuyerEmailChangeStart        = "buyer.email_change.start"
	ActionReviewModerate               = "review.moderate"
	ActionMerchantStatusUpdate         = "merchant.status.update"
	ActionMerchantAPIAccessUpdate      = "merchant.api_access.update"
	ActionMerchantAPICredentialsRotate = "merchant.api_credentials.rotate"
	ActionOrderDeliveryResend          = "order.delivery.resend"
	ActionPaymentProviderVerify        = "payment.provider.verify"
	ActionWithdrawalReview             = "withdrawal.review"
)

// EmergencyControl is a platform emergency switch row.
type EmergencyControl struct {
	SwitchName     string    `json:"switchName"`
	Enabled        bool      `json:"enabled"`
	Version        int64     `json:"version"`
	Reason         string    `json:"reason"`
	IncidentTicket string    `json:"incidentTicket,omitempty"`
	UpdatedBy      *string   `json:"updatedBy,omitempty"`
	EffectiveAt    time.Time `json:"effectiveAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

// AuditEvent is a search/detail read model (chain integrity full write is BE-530).
type AuditEvent struct {
	ID           string         `json:"id"`
	SequenceNo   int64          `json:"sequenceNo"`
	PayloadHash  string         `json:"payloadHash"` // hex
	CreatedAt    time.Time      `json:"createdAt"`
	ActorUserID  *string        `json:"actorUserId,omitempty"`
	Action       *string        `json:"action,omitempty"`
	ResourceType *string        `json:"resourceType,omitempty"`
	ResourceID   *string        `json:"resourceId,omitempty"`
	Reason       *string        `json:"reason,omitempty"`
	RequestID    *string        `json:"requestId,omitempty"`
	MerchantID   *string        `json:"merchantId,omitempty"`
	Metadata     map[string]any `json:"metadata,omitempty"`
}

// AuditIntegrityMeta is chain head + streaming verifier status (BE-530).
type AuditIntegrityMeta struct {
	EventCount      int64      `json:"eventCount"`
	HeadSequence    int64      `json:"headSequence"`
	MinSequence     int64      `json:"minSequence"`
	HeadPayloadHash *string    `json:"headPayloadHash,omitempty"`
	HeadCreatedAt   *time.Time `json:"headCreatedAt,omitempty"`
	ChainMode       string     `json:"chainMode"` // JCS-1
	VerifierStatus  string     `json:"verifierStatus"`
}

// AuditExport is an async export job handle.
type AuditExport struct {
	ID              string     `json:"id"`
	Status          string     `json:"status"`
	RedactionPolicy string     `json:"redactionPolicy"`
	RequesterID     string     `json:"requesterId"`
	Reason          string     `json:"reason"`
	RowCount        *int64     `json:"rowCount,omitempty"`
	ErrorMessage    *string    `json:"errorMessage,omitempty"`
	ExpiresAt       *time.Time `json:"expiresAt,omitempty"`
	CompletedAt     *time.Time `json:"completedAt,omitempty"`
	CreatedAt       time.Time  `json:"createdAt"`
}

// PaymentMismatch is provider-paid / local-pending alert row.
type PaymentMismatch struct {
	ID                string    `json:"id"`
	PaymentIntentID   string    `json:"paymentIntentId"`
	OrderID           string    `json:"orderId"`
	MerchantID        string    `json:"merchantId"`
	Merchant          string    `json:"merchant"`
	Amount            int64     `json:"amount"`
	Provider          string    `json:"provider"`
	ProviderStatus    string    `json:"providerStatus"`
	LocalStatus       string    `json:"localStatus"`
	ProviderReference string    `json:"providerReference,omitempty"`
	ReplayCount       int32     `json:"attempts"`
	ObservedAt        time.Time `json:"observedAt"`
	AlertCode         string    `json:"alertCode,omitempty"`
	MismatchCode      string    `json:"mismatchCode,omitempty"`
}

// ProviderHealth is read-only Xendit health (no secrets).
type ProviderHealth struct {
	Provider     string `json:"provider"`
	Status       string `json:"status"`
	LatencyMs    *int64 `json:"latencyMs,omitempty"`
	AccountScope string `json:"accountScope"`
	CheckedAt    string `json:"checkedAt"`
	Message      string `json:"message,omitempty"`
}

// ComponentHealth is platform component health (Xendit/R2/Redis/mail) without secrets.
type ComponentHealth struct {
	Component string `json:"component"`
	Status    string `json:"status"`
	LatencyMs *int64 `json:"latencyMs,omitempty"`
	CheckedAt string `json:"checkedAt"`
	Message   string `json:"message,omitempty"`
}

// SystemSnapshot is GET /v1/admin/system (read-only release config + emergency).
type SystemSnapshot struct {
	EmergencyControls []EmergencyControl `json:"emergencyControls"`
	FeePolicyVersion  string             `json:"feePolicyVersion"`
	ComponentHealth   []ComponentHealth  `json:"componentHealth,omitempty"`
	Note              string             `json:"note"`
}

// AdminActionResult matches FE AdminActionResult.
type AdminActionResult struct {
	Accepted   bool   `json:"accepted"`
	Action     string `json:"action"`
	ResourceID string `json:"resourceId"`
	RequestID  string `json:"requestId"`
}
