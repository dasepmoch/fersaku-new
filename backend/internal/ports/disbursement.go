package ports

import (
	"context"
	"time"
)

// DisbursementQuoteInput is adapter-facing quote request (no Xendit DTO leakage).
type DisbursementQuoteInput struct {
	AmountIDR      int64 // wallet debit (gross withdrawal amount)
	Currency       string
	BankCode       string
	AccountScope   string
	PaymentMode    string
	IdempotencyKey string
}

// DisbursementQuote is verified provider processing fee evidence.
type DisbursementQuote struct {
	ProviderFeeIDR    int64
	ProviderReference string
	Evidence          string
	QuotedAt          time.Time
}

// CreateDisbursementInput is the irrevocable create request.
// NetAmountIDR is the amount sent to the beneficiary (N = W - P - Q).
type CreateDisbursementInput struct {
	ExternalID        string // stable idempotency reference
	NetAmountIDR      int64
	Currency          string
	BankCode          string
	AccountHolderName string
	AccountNumber     string // plaintext only inside adapter call path
	AccountNumberMask string
	Description       string
	AccountScope      string
	PaymentMode       string
	IdempotencyKey    string
	Metadata          map[string]string
}

// CreateDisbursementResult is returned after a successful create.
type CreateDisbursementResult struct {
	ProviderReference string
	ExternalID        string
	Status            string // PENDING | PROCESSING | COMPLETED | FAILED | UNKNOWN
	NetAmountIDR      int64
	ProviderFeeIDR    *int64 // actual fee if known at create
	CreatedAt         time.Time
}

// ProviderDisbursement is a status lookup result (evidence).
type ProviderDisbursement struct {
	ProviderReference string
	ExternalID        string
	Status            string // PENDING | PROCESSING | COMPLETED | FAILED | CANCELLED | NOT_FOUND | UNKNOWN
	NetAmountIDR      int64
	Currency          string
	ProviderFeeIDR    *int64
	FailureCode       string
	CompletedAt       *time.Time
	BankCode          string
	AccountNumberMask string
}

// DisbursementProvider is the Xendit disbursement capability port (ADR-0002, §8.1).
type DisbursementProvider interface {
	QuoteDisbursement(ctx context.Context, in DisbursementQuoteInput) (DisbursementQuote, error)
	CreateDisbursement(ctx context.Context, in CreateDisbursementInput) (CreateDisbursementResult, error)
	GetDisbursement(ctx context.Context, providerRef string) (ProviderDisbursement, error)
}
