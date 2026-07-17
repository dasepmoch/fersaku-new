package xendit

import (
	"context"
	"fmt"

	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// Real is a structural stub for the live Xendit HTTP client.
// Full network implementation is deferred; production must not call methods
// until credentials and HTTP mapping are wired (still BE-310 structure only).
type Real struct {
	AccountScope string
	// SecretKey must never be logged or returned to frontend.
	SecretKey string
	// BaseURL e.g. https://api.xendit.co
	BaseURL string
	// TimeoutSeconds per call (default 15).
	TimeoutSeconds int
}

// NewRealStub returns a non-functional real adapter shell behind QRISProvider.
func NewRealStub(accountScope, secretKey, baseURL string) *Real {
	if accountScope == "" {
		accountScope = "xendit-primary"
	}
	return &Real{
		AccountScope:   accountScope,
		SecretKey:      secretKey,
		BaseURL:        baseURL,
		TimeoutSeconds: 15,
	}
}

// CreateQRIS is not implemented in BE-310 (use Fake for local/sandbox).
func (r *Real) CreateQRIS(ctx context.Context, in ports.CreateQRISInput) (ports.CreateQRISResult, error) {
	_ = ctx
	_ = in
	return ports.CreateQRISResult{}, &ports.ProviderError{
		Class:   ports.ProviderUnavailable,
		Message: "real Xendit HTTP client not enabled",
	}
}

// GetPayment is not implemented.
func (r *Real) GetPayment(ctx context.Context, providerRef string) (ports.ProviderPayment, error) {
	_ = ctx
	_ = providerRef
	return ports.ProviderPayment{}, &ports.ProviderError{
		Class:   ports.ProviderUnavailable,
		Message: "real Xendit HTTP client not enabled",
	}
}

// CancelPayment is not implemented.
func (r *Real) CancelPayment(ctx context.Context, providerRef string) (ports.ProviderPayment, error) {
	_ = ctx
	_ = providerRef
	return ports.ProviderPayment{}, &ports.ProviderError{
		Class:   ports.ProviderUnavailable,
		Message: "real Xendit HTTP client not enabled",
	}
}

// ExpirePayment is not implemented.
func (r *Real) ExpirePayment(ctx context.Context, providerRef string) (ports.ProviderPayment, error) {
	_ = ctx
	_ = providerRef
	return ports.ProviderPayment{}, &ports.ProviderError{
		Class:   ports.ProviderUnavailable,
		Message: "real Xendit HTTP client not enabled",
	}
}

// Name for logging (never includes secret).
func (r *Real) Name() string {
	return fmt.Sprintf("xendit-real(%s)", r.AccountScope)
}

var _ ports.QRISProvider = (*Real)(nil)
