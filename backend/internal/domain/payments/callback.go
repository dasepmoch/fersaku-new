package payments

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"time"
)

// Callback processing states (payment_provider_events.processing_state).
const (
	CallbackAccepted    = "ACCEPTED"
	CallbackProcessing  = "PROCESSING"
	CallbackProcessed   = "PROCESSED"
	CallbackFailed      = "FAILED"
	CallbackQuarantined = "QUARANTINED"
)

// Normalized event types after Xendit envelope parse.
const (
	NormalizedPaid      = "PAID"
	NormalizedExpired   = "EXPIRED"
	NormalizedCancelled = "CANCELLED"
	NormalizedFailed    = "FAILED"
	NormalizedPending   = "PENDING"
	NormalizedUnknown   = "UNKNOWN"
	NormalizedReversal  = "REVERSAL"
)

// Rejection reasons (provider_callback_rejections only; no business queue).
const (
	RejectInvalidToken     = "INVALID_TOKEN"
	RejectMissingToken     = "MISSING_TOKEN"
	RejectOversizeBody     = "OVERSIZE_BODY"
	RejectBadContentType   = "BAD_CONTENT_TYPE"
	RejectMalformedJSON    = "MALFORMED_ENVELOPE"
	RejectEmptyBody        = "EMPTY_BODY"
	RejectAmbiguousScope   = "AMBIGUOUS_SCOPE"
	RejectInvalidSignature = "INVALID_SIGNATURE"
	RejectMissingSignature = "MISSING_SIGNATURE"
	RejectMerchantMismatch = "MERCHANT_MISMATCH"
)

// Mismatch / alert codes (quarantine or operational).
const (
	MismatchAmount       = "AMOUNT_MISMATCH"
	MismatchCurrency     = "CURRENCY_MISMATCH"
	MismatchReference    = "REFERENCE_MISMATCH"
	MismatchNoPayment    = "PAYMENT_NOT_FOUND"
	MismatchAmbiguous    = "AMBIGUOUS_PAYMENT"
	AlertLatePaid        = "LATE_PAID_AFTER_TERMINAL"
	AlertProviderPending = "PROVIDER_PAID_LOCAL_PENDING" // reserved for integrity scan
	AlertUnknownEvent    = "UNKNOWN_EVENT_TYPE"
	AlertReversalHeld    = "PROVIDER_REVERSAL_HELD"
)

// Outbox topics for inbound callback pipeline.
const (
	TopicProviderCallbackProcess = "provider_callback.process"
	TopicFulfillmentExecute      = "fulfillment.execute"
	TopicPaymentPaidNotify       = "payment.paid.notify"
)

// MaxCallbackBodyBytes is the bounded HTTP body limit for inbound Xendit callbacks.
const MaxCallbackBodyBytes = 256 * 1024

// JournalReferencePaid returns the unique ledger/settlement reference for a paid capture.
func JournalReferencePaid(paymentIntentID string) string {
	return "PAYMENT_CAPTURE:" + paymentIntentID
}

// ProviderEvent is a durable accepted inbound callback row.
type ProviderEvent struct {
	CallbackID        string
	Provider          string
	AccountScope      string
	PaymentMode       string
	ProviderEventID   string
	ReceivedAt        time.Time
	NormalizedType    *string
	ProcessingState   string
	FailureCode       *string
	AttemptCount      int32
	LeaseOwner        *string
	LeaseUntil        *time.Time
	NextRetryAt       *time.Time
	ProcessedAt       *time.Time
	PaymentIntentID   *string
	PayloadDigest     *string
	EncryptedPayload  []byte
	RawEventType      *string
	ProviderReference *string
	ExternalID        *string
	AmountIDR         *int64
	Currency          *string
	MismatchCode      *string
	AlertCode         *string
	ReplayCount       int32
	LastReplayAt      *time.Time
	LastReplayReason  *string
	QuarantineReason  *string
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

// CallbackRejection is evidence-only (no replay).
type CallbackRejection struct {
	ID           string
	Provider     string
	AccountScope *string
	PaymentMode  *string
	Reason       string
	HTTPStatus   int32
	ContentType  *string
	BodyBytes    int32
	BodyDigest   *string
	ClientIP     *string
	RequestID    *string
	ReceivedAt   time.Time
	CreatedAt    time.Time
}

// Settlement is the minimal exactly-once paid credit stub (full COA in BE-340).
type Settlement struct {
	ID                string
	PaymentIntentID   string
	OrderID           string
	MerchantID        string
	StoreID           *string
	PaymentMode       string
	Source            string
	Provider          string
	AccountScope      string
	ProviderReference *string
	ProviderEventID   *string
	JournalReference  string
	GrossIDR          int64
	FeeIDR            int64
	MerchantNetIDR    int64
	Currency          string
	PaidLate          bool
	PrecedingStatus   *string
	Status            string
	PostedAt          time.Time
	CreatedAt         time.Time
}

// NormalizedCallback is the result of parsing a verified Xendit body.
type NormalizedCallback struct {
	ProviderEventID   string
	RawEventType      string
	NormalizedType    string
	ProviderReference string
	ExternalID        string
	AmountIDR         int64
	Currency          string
	// Status is the mapped local payment status evidence.
	Status string
}

// FingerprintEventID derives fp_... when provider omits an event id.
func FingerprintEventID(accountScope, paymentMode, providerRef, rawType string, bodyDigest string) string {
	return FingerprintEventIDForProvider(ProviderXendit, accountScope, paymentMode, providerRef, rawType, bodyDigest)
}

// FingerprintEventIDForProvider derives fp_... scoped by provider name.
func FingerprintEventIDForProvider(provider, accountScope, paymentMode, providerRef, rawType, bodyDigest string) string {
	p := strings.ToLower(strings.TrimSpace(provider))
	if p == "" {
		p = "xendit"
	}
	h := sha256.Sum256([]byte(strings.Join([]string{
		p, accountScope, paymentMode, providerRef, rawType, bodyDigest,
	}, "|")))
	return "fp_" + hex.EncodeToString(h[:16])
}

// DigestBody returns hex SHA-256 of raw body (no secrets logged as body).
func DigestBody(body []byte) string {
	h := sha256.Sum256(body)
	return hex.EncodeToString(h[:])
}

// CanonicalEventKey is the four-part uniqueness key.
func CanonicalEventKey(provider, accountScope, paymentMode, providerEventID string) string {
	return fmt.Sprintf("%s|%s|%s|%s", provider, accountScope, paymentMode, providerEventID)
}
