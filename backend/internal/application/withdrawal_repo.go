package application

import (
	"context"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/withdrawals"
)

// WithdrawalStore is the persistence port for BE-350.
type WithdrawalStore interface {
	// Bank accounts
	InsertBankAccount(ctx context.Context, a withdrawals.BankAccount) (withdrawals.BankAccount, error)
	GetBankAccount(ctx context.Context, id string) (withdrawals.BankAccount, error)
	ListBankAccounts(ctx context.Context, merchantID string) ([]withdrawals.BankAccount, error)
	UpdateBankAccount(ctx context.Context, a withdrawals.BankAccount, expectedVersion int64) (withdrawals.BankAccount, error)
	SetBankVerified(ctx context.Context, id string, at time.Time) (withdrawals.BankAccount, error)
	ClearPrimary(ctx context.Context, merchantID string, at time.Time) error
	MakePrimary(ctx context.Context, id, merchantID string, at time.Time) (withdrawals.BankAccount, error)
	ArchiveBankAccount(ctx context.Context, id string, at time.Time) (withdrawals.BankAccount, error)
	CountVerifiedBanks(ctx context.Context, merchantID string) (int64, error)
	CountActiveWithdrawalsForBank(ctx context.Context, bankID string) (int64, error)
	CountActiveQuotesForBank(ctx context.Context, bankID string) (int64, error)

	// Security lock
	UpsertWithdrawalLock(ctx context.Context, l withdrawals.WithdrawalLock) (withdrawals.WithdrawalLock, error)
	GetWithdrawalLock(ctx context.Context, merchantID string) (withdrawals.WithdrawalLock, error)

	// Quotes
	InsertQuote(ctx context.Context, q withdrawals.Quote) (withdrawals.Quote, error)
	GetQuote(ctx context.Context, id string) (withdrawals.Quote, error)
	GetQuoteByIdempotency(ctx context.Context, merchantID, mode, keyHash string) (withdrawals.Quote, error)
	MarkQuoteConsumed(ctx context.Context, quoteID, withdrawalID string, at time.Time) (withdrawals.Quote, error)
	InvalidateQuotesForBank(ctx context.Context, bankID string, at time.Time) error
	InvalidateQuotesForMerchant(ctx context.Context, merchantID string, at time.Time) error

	// Withdrawals
	InsertWithdrawal(ctx context.Context, w withdrawals.Withdrawal) (withdrawals.Withdrawal, error)
	GetWithdrawal(ctx context.Context, id string) (withdrawals.Withdrawal, error)
	GetWithdrawalByIdempotency(ctx context.Context, merchantID, mode, keyHash string) (withdrawals.Withdrawal, error)
	GetWithdrawalByProviderRef(ctx context.Context, provider, scope, mode, ref string) (withdrawals.Withdrawal, error)
	LockWithdrawal(ctx context.Context, id string) (withdrawals.Withdrawal, error)
	SaveWithdrawal(ctx context.Context, w withdrawals.Withdrawal) (withdrawals.Withdrawal, error)
	ListWithdrawalsByMerchant(ctx context.Context, merchantID, mode string, cursorAt *time.Time, cursorID *string, limit int32) ([]withdrawals.Withdrawal, error)
	ListWithdrawalsAdmin(ctx context.Context, status *string, cursorAt *time.Time, cursorID *string, limit int32) ([]withdrawals.Withdrawal, error)
	ListUnknownDue(ctx context.Context, asOf time.Time, limit int32) ([]withdrawals.Withdrawal, error)

	InsertAllocation(ctx context.Context, a withdrawals.Allocation) (withdrawals.Allocation, error)
	ListAllocations(ctx context.Context, withdrawalID string) ([]withdrawals.Allocation, error)

	SchemaMetaInt(ctx context.Context, key string, fallback int64) (int64, error)
	SchemaMetaBool(ctx context.Context, key string, fallback bool) (bool, error)
	GetStoreMerchant(ctx context.Context, storeID string) (id string, merchantID string, err error)

	WithTx(ctx context.Context, fn func(ctx context.Context) error) error
	IsNotFound(err error) bool
}
