package ports

import (
	"context"
	"time"
)

// CreateQRISInput is the adapter-facing create request (no Xendit DTO leakage).
type CreateQRISInput struct {
	ExternalID     string
	AmountIDR      int64
	Currency       string // IDR
	Description    string
	ExpiresAt      time.Time
	PaymentMode    string // SANDBOX | LIVE
	AccountScope   string
	IdempotencyKey string
	Metadata       map[string]string
}

// CreateQRISResult is returned after a successful create call.
type CreateQRISResult struct {
	ProviderReference string
	QRString          string
	QRImageURL        string
	Status            string // PENDING, PAID, ...
	ExpiresAt         time.Time
}

// ProviderPayment is a provider status lookup result (evidence, not command success).
type ProviderPayment struct {
	ProviderReference string
	ExternalID        string
	AmountIDR         int64
	Currency          string
	Status            string // PENDING | PAID | EXPIRED | CANCELLED | FAILED | UNKNOWN
	PaidAt            *time.Time
	ExpiresAt         *time.Time
}

// QRISProvider is the QRIS capability port (ADR-0002, ADR-0008).
// Hosted checkout and gateway share this interface.
// Lookup argument semantics are adapter-specific:
//   - Xendit: provider QR id (ProviderReference)
//   - Duitku: merchantOrderId (ExternalID) — never Duitku reference
type QRISProvider interface {
	CreateQRIS(ctx context.Context, in CreateQRISInput) (CreateQRISResult, error)
	GetPayment(ctx context.Context, providerRef string) (ProviderPayment, error)
	CancelPayment(ctx context.Context, providerRef string) (ProviderPayment, error)
	ExpirePayment(ctx context.Context, providerRef string) (ProviderPayment, error)
}

// Provider error classes (adapters wrap these).
type ProviderErrorClass string

const (
	ProviderTimeout     ProviderErrorClass = "TIMEOUT"
	ProviderUnavailable ProviderErrorClass = "UNAVAILABLE"
	ProviderRejected    ProviderErrorClass = "REJECTED"
	ProviderInvalidResp ProviderErrorClass = "INVALID_RESPONSE"
	ProviderAuthFailure ProviderErrorClass = "AUTH_FAILURE"
	ProviderRateLimited ProviderErrorClass = "RATE_LIMITED"
	ProviderUnknown     ProviderErrorClass = "UNKNOWN_OUTCOME"
)

// ProviderError classifies adapter failures without leaking raw bodies.
type ProviderError struct {
	Class   ProviderErrorClass
	Message string
	// RequestSent is true when the HTTP request may have reached the provider
	// (timeout after send → do not retry create; schedule lookup).
	RequestSent bool
}

func (e *ProviderError) Error() string {
	if e == nil {
		return "provider error"
	}
	return string(e.Class) + ": " + e.Message
}

func (e *ProviderError) IsUnknownOutcome() bool {
	return e != nil && (e.Class == ProviderUnknown || e.Class == ProviderTimeout)
}
