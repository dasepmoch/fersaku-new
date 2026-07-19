package payments

import (
	"encoding/json"
	"time"
)

// Provider identity (ADR-0002, ADR-0008).
const (
	ProviderXendit            = "XENDIT"
	ProviderDuitku            = "DUITKU"
	AccountScopePrimary       = "xendit-primary"
	AccountScopeDuitkuPrimary = "duitku-primary"
	CurrencyIDR               = "IDR"
	SourceStorefront          = "STOREFRONT"
	SourceQRISAPI             = "QRIS_API"
	PaymentModeSandbox        = "SANDBOX"
	PaymentModeLive           = "LIVE"
)

// Payment intent status machine (§5.3).
const (
	StatusRequiresPayment = "REQUIRES_PAYMENT"
	StatusPending         = "PENDING"
	StatusCancelPending   = "CANCEL_PENDING"
	StatusExpirePending   = "EXPIRE_PENDING"
	StatusUnknownOutcome  = "UNKNOWN_OUTCOME"
	StatusPaid            = "PAID"
	StatusFailed          = "FAILED"
	StatusExpired         = "EXPIRED"
	StatusCancelled       = "CANCELLED"
)

// Provider financial containment (not payment status).
const (
	FinancialNormal               = "NORMAL"
	FinancialProviderReversalHeld = "PROVIDER_REVERSAL_HELD"
	FinancialProviderReversalConf = "PROVIDER_REVERSAL_CONFIRMED"
)

// Order status values for checkout lifecycle.
const (
	OrderCreated        = "CREATED"
	OrderPendingPayment = "PENDING_PAYMENT"
	OrderPaid           = "PAID"
	OrderFulfilling     = "FULFILLING"
	OrderFulfilled      = "FULFILLED"
	OrderDeliveryFailed = "DELIVERY_FAILED"
	OrderFailed         = "FAILED"
	OrderExpired        = "EXPIRED"
	OrderCancelled      = "CANCELLED"
)

// Intent is a hosted checkout or gateway payment intent.
type Intent struct {
	ID                     string
	OrderID                string
	StoreID                string
	MerchantID             string
	PaymentMode            string
	Source                 string
	Provider               string
	AccountScope           string
	ProviderReference      *string
	ExternalID             string
	AmountIDR              int64
	Currency               string
	FeeSnapshotID          *string
	CouponReservationID    *string
	StockReservationID     *string
	Status                 string
	ProviderFinancialState string
	QRString               *string
	QRImageURL             *string
	ExpiresAt              time.Time
	CancelRequestedAt      *time.Time
	ExpireRequestedAt      *time.Time
	CancelReason           *string
	ExpireReason           *string
	UnknownOperation       *string
	LookupScheduledAt      *time.Time
	LookupAttempts         int32
	PaidLate               bool
	PrecedingStatus        *string
	BuyerUserID            *string
	BuyerEmail             string
	BuyerSessionID         *string
	PublicTokenHash        *string
	IdempotencyKeyHash     string
	RequestHash            string
	ProductSnapshot        json.RawMessage
	PriceSnapshot          json.RawMessage
	// Gateway-only fields (BE-320); empty for storefront.
	MerchantReference    *string
	Description          string
	SuccessURL           *string
	FailureURL           *string
	WebhookEndpointID    *string
	WebhookConfigVersion *int32
	Metadata             json.RawMessage
	Version              int32
	CreatedAt            time.Time
	UpdatedAt            time.Time
}

// CanRequestCancel reports whether cancel may be requested (gateway).
func (i Intent) CanRequestCancel() bool {
	switch i.Status {
	case StatusRequiresPayment, StatusPending, StatusUnknownOutcome:
		return true
	case StatusCancelPending:
		return true // idempotent replay
	default:
		return false
	}
}

// IsTerminalUnpaid reports unpaid terminal statuses.
func (i Intent) IsTerminalUnpaid() bool {
	switch i.Status {
	case StatusFailed, StatusExpired, StatusCancelled:
		return true
	default:
		return false
	}
}

// IsPaid reports verified paid.
func (i Intent) IsPaid() bool {
	return i.Status == StatusPaid
}

// CanRequestExpire reports whether expire may be requested.
func (i Intent) CanRequestExpire() bool {
	switch i.Status {
	case StatusRequiresPayment, StatusPending, StatusUnknownOutcome:
		return true
	case StatusExpirePending:
		return true // idempotent replay
	default:
		return false
	}
}

// DefaultCheckoutTTL is hosted QRIS hold duration.
const DefaultCheckoutTTL = 30 * time.Minute

// DefaultLookupDelay is when to schedule provider reference lookup after unknown outcome.
const DefaultLookupDelay = 30 * time.Second
