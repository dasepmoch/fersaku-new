package postgres

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres/gen"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/withdrawals"
)

type withdrawalTxKey struct{}

// WithdrawalRepo implements application.WithdrawalStore.
type WithdrawalRepo struct {
	pool *pgxpool.Pool
	q    *gen.Queries
}

// NewWithdrawalRepo constructs a withdrawal repository.
func NewWithdrawalRepo(pool *pgxpool.Pool) *WithdrawalRepo {
	return &WithdrawalRepo{pool: pool, q: gen.New(pool)}
}

func (r *WithdrawalRepo) queries(ctx context.Context) *gen.Queries {
	if tx, ok := ctx.Value(withdrawalTxKey{}).(pgx.Tx); ok && tx != nil {
		return r.q.WithTx(tx)
	}
	return r.q
}

func (r *WithdrawalRepo) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	if _, ok := ctx.Value(withdrawalTxKey{}).(pgx.Tx); ok {
		return fn(ctx)
	}
	// Share ledger tx when nested under ledgerTxKey
	if tx, ok := ctx.Value(ledgerTxKey{}).(pgx.Tx); ok && tx != nil {
		txCtx := context.WithValue(ctx, withdrawalTxKey{}, tx)
		return fn(txCtx)
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("withdrawal: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	txCtx := context.WithValue(ctx, withdrawalTxKey{}, tx)
	txCtx = context.WithValue(txCtx, ledgerTxKey{}, tx)
	if err := fn(txCtx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *WithdrawalRepo) IsNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func (r *WithdrawalRepo) InsertBankAccount(ctx context.Context, a withdrawals.BankAccount) (withdrawals.BankAccount, error) {
	row, err := r.queries(ctx).BankAccountInsert(ctx, gen.BankAccountInsertParams{
		ID:                      a.ID,
		MerchantID:              a.MerchantID,
		BankCode:                a.BankCode,
		BankName:                a.BankName,
		AccountHolderName:       a.AccountHolderName,
		AccountNumberCiphertext: a.AccountNumberCipher,
		EncryptionKeyVersion:    a.EncryptionKeyVersion,
		AccountNumberMasked:     a.AccountNumberMasked,
		AccountNumberLast4:      a.AccountNumberLast4,
		Status:                  a.Status,
		IsPrimary:               a.IsPrimary,
		Version:                 a.Version,
		VerifiedAt:              timeToPgTimestamptz(a.VerifiedAt),
		ArchivedAt:              timeToPgTimestamptz(a.ArchivedAt),
		CreatedAt:               a.CreatedAt,
		UpdatedAt:               a.UpdatedAt,
	})
	if err != nil {
		return withdrawals.BankAccount{}, err
	}
	return mapBankAccount(row), nil
}

func (r *WithdrawalRepo) GetBankAccount(ctx context.Context, id string) (withdrawals.BankAccount, error) {
	row, err := r.queries(ctx).BankAccountGetByID(ctx, id)
	if err != nil {
		return withdrawals.BankAccount{}, err
	}
	return mapBankAccount(row), nil
}

func (r *WithdrawalRepo) ListBankAccounts(ctx context.Context, merchantID string) ([]withdrawals.BankAccount, error) {
	rows, err := r.queries(ctx).BankAccountListByMerchant(ctx, merchantID)
	if err != nil {
		return nil, err
	}
	out := make([]withdrawals.BankAccount, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapBankAccount(row))
	}
	return out, nil
}

func (r *WithdrawalRepo) UpdateBankAccount(ctx context.Context, a withdrawals.BankAccount, expectedVersion int64) (withdrawals.BankAccount, error) {
	row, err := r.queries(ctx).BankAccountUpdate(ctx, gen.BankAccountUpdateParams{
		ID:                      a.ID,
		BankCode:                a.BankCode,
		BankName:                a.BankName,
		AccountHolderName:       a.AccountHolderName,
		AccountNumberCiphertext: a.AccountNumberCipher,
		EncryptionKeyVersion:    a.EncryptionKeyVersion,
		AccountNumberMasked:     a.AccountNumberMasked,
		AccountNumberLast4:      a.AccountNumberLast4,
		UpdatedAt:               a.UpdatedAt,
		Version:                 expectedVersion,
	})
	if err != nil {
		return withdrawals.BankAccount{}, err
	}
	return mapBankAccount(row), nil
}

func (r *WithdrawalRepo) SetBankVerified(ctx context.Context, id string, at time.Time) (withdrawals.BankAccount, error) {
	row, err := r.queries(ctx).BankAccountSetVerified(ctx, gen.BankAccountSetVerifiedParams{
		ID:         id,
		VerifiedAt: timeToPgTimestamptz(&at),
	})
	if err != nil {
		return withdrawals.BankAccount{}, err
	}
	return mapBankAccount(row), nil
}

func (r *WithdrawalRepo) ClearPrimary(ctx context.Context, merchantID string, at time.Time) error {
	return r.queries(ctx).BankAccountClearPrimary(ctx, gen.BankAccountClearPrimaryParams{
		MerchantID: merchantID,
		UpdatedAt:  at,
	})
}

func (r *WithdrawalRepo) MakePrimary(ctx context.Context, id, merchantID string, at time.Time) (withdrawals.BankAccount, error) {
	row, err := r.queries(ctx).BankAccountMakePrimary(ctx, gen.BankAccountMakePrimaryParams{
		ID:         id,
		UpdatedAt:  at,
		MerchantID: merchantID,
	})
	if err != nil {
		return withdrawals.BankAccount{}, err
	}
	return mapBankAccount(row), nil
}

func (r *WithdrawalRepo) ArchiveBankAccount(ctx context.Context, id string, at time.Time) (withdrawals.BankAccount, error) {
	row, err := r.queries(ctx).BankAccountArchive(ctx, gen.BankAccountArchiveParams{
		ID:         id,
		ArchivedAt: timeToPgTimestamptz(&at),
	})
	if err != nil {
		return withdrawals.BankAccount{}, err
	}
	return mapBankAccount(row), nil
}

func (r *WithdrawalRepo) CountVerifiedBanks(ctx context.Context, merchantID string) (int64, error) {
	return r.queries(ctx).BankAccountCountVerified(ctx, merchantID)
}

func (r *WithdrawalRepo) CountActiveWithdrawalsForBank(ctx context.Context, bankID string) (int64, error) {
	return r.queries(ctx).WithdrawalCountActiveForBank(ctx, bankID)
}

func (r *WithdrawalRepo) CountActiveQuotesForBank(ctx context.Context, bankID string) (int64, error) {
	return r.queries(ctx).WithdrawalQuoteCountActiveForBank(ctx, bankID)
}

func (r *WithdrawalRepo) UpsertWithdrawalLock(ctx context.Context, l withdrawals.WithdrawalLock) (withdrawals.WithdrawalLock, error) {
	row, err := r.queries(ctx).WithdrawalLockUpsert(ctx, gen.WithdrawalLockUpsertParams{
		MerchantID:    l.MerchantID,
		LockedUntil:   l.LockedUntil,
		Reason:        l.Reason,
		BankAccountID: l.BankAccountID,
		CreatedAt:     l.CreatedAt,
	})
	if err != nil {
		return withdrawals.WithdrawalLock{}, err
	}
	return mapLock(row), nil
}

func (r *WithdrawalRepo) GetWithdrawalLock(ctx context.Context, merchantID string) (withdrawals.WithdrawalLock, error) {
	row, err := r.queries(ctx).WithdrawalLockGet(ctx, merchantID)
	if err != nil {
		return withdrawals.WithdrawalLock{}, err
	}
	return mapLock(row), nil
}

func (r *WithdrawalRepo) InsertQuote(ctx context.Context, q withdrawals.Quote) (withdrawals.Quote, error) {
	row, err := r.queries(ctx).WithdrawalQuoteInsert(ctx, gen.WithdrawalQuoteInsertParams{
		ID:                     q.ID,
		MerchantID:             q.MerchantID,
		StoreID:                q.StoreID,
		PaymentMode:            q.PaymentMode,
		AmountIdr:              q.AmountIDR,
		PlatformFeeIdr:         q.PlatformFeeIDR,
		ProviderFeeIdr:         q.ProviderFeeIDR,
		TotalFeeIdr:            q.TotalFeeIDR,
		NetDisbursementIdr:     q.NetDisbursementIDR,
		Currency:               q.Currency,
		PolicyVersionID:        q.PolicyVersionID,
		FeeSnapshotID:          q.FeeSnapshotID,
		BankAccountID:          q.BankAccountID,
		BankAccountVersion:     q.BankAccountVersion,
		BankCode:               q.BankCode,
		BankName:               q.BankName,
		AccountHolderName:      q.AccountHolderName,
		AccountNumberMasked:    q.AccountNumberMasked,
		ProviderQuoteReference: q.ProviderQuoteReference,
		ProviderQuoteEvidence:  q.ProviderQuoteEvidence,
		Status:                 q.Status,
		IdempotencyKeyHash:     q.IdempotencyKeyHash,
		RequestHash:            q.RequestHash,
		ExpiresAt:              q.ExpiresAt,
		ConsumedWithdrawalID:   q.ConsumedWithdrawalID,
		CreatedAt:              q.CreatedAt,
		UpdatedAt:              q.UpdatedAt,
	})
	if err != nil {
		return withdrawals.Quote{}, err
	}
	return mapQuote(row), nil
}

func (r *WithdrawalRepo) GetQuote(ctx context.Context, id string) (withdrawals.Quote, error) {
	row, err := r.queries(ctx).WithdrawalQuoteGetByID(ctx, id)
	if err != nil {
		return withdrawals.Quote{}, err
	}
	return mapQuote(row), nil
}

func (r *WithdrawalRepo) GetQuoteByIdempotency(ctx context.Context, merchantID, mode, keyHash string) (withdrawals.Quote, error) {
	row, err := r.queries(ctx).WithdrawalQuoteGetByIdempotency(ctx, gen.WithdrawalQuoteGetByIdempotencyParams{
		MerchantID:         merchantID,
		PaymentMode:        mode,
		IdempotencyKeyHash: keyHash,
	})
	if err != nil {
		return withdrawals.Quote{}, err
	}
	return mapQuote(row), nil
}

func (r *WithdrawalRepo) MarkQuoteConsumed(ctx context.Context, quoteID, withdrawalID string, at time.Time) (withdrawals.Quote, error) {
	row, err := r.queries(ctx).WithdrawalQuoteMarkConsumed(ctx, gen.WithdrawalQuoteMarkConsumedParams{
		ID:                   quoteID,
		ConsumedWithdrawalID: &withdrawalID,
		UpdatedAt:            at,
	})
	if err != nil {
		return withdrawals.Quote{}, err
	}
	return mapQuote(row), nil
}

func (r *WithdrawalRepo) InvalidateQuotesForBank(ctx context.Context, bankID string, at time.Time) error {
	return r.queries(ctx).WithdrawalQuoteInvalidateActiveForBank(ctx, gen.WithdrawalQuoteInvalidateActiveForBankParams{
		BankAccountID: bankID,
		UpdatedAt:     at,
	})
}

func (r *WithdrawalRepo) InvalidateQuotesForMerchant(ctx context.Context, merchantID string, at time.Time) error {
	return r.queries(ctx).WithdrawalQuoteInvalidateActiveForMerchant(ctx, gen.WithdrawalQuoteInvalidateActiveForMerchantParams{
		MerchantID: merchantID,
		UpdatedAt:  at,
	})
}

func (r *WithdrawalRepo) InsertWithdrawal(ctx context.Context, w withdrawals.Withdrawal) (withdrawals.Withdrawal, error) {
	row, err := r.queries(ctx).WithdrawalInsert(ctx, gen.WithdrawalInsertParams{
		ID:                            w.ID,
		MerchantID:                    w.MerchantID,
		StoreID:                       w.StoreID,
		PaymentMode:                   w.PaymentMode,
		Source:                        w.Source,
		QuoteID:                       w.QuoteID,
		AmountIdr:                     w.AmountIDR,
		PlatformFeeIdr:                w.PlatformFeeIDR,
		ProviderFeeQuotedIdr:          w.ProviderFeeQuotedIDR,
		ProviderFeeActualIdr:          w.ProviderFeeActualIDR,
		TotalFeeIdr:                   w.TotalFeeIDR,
		NetDisbursementIdr:            w.NetDisbursementIDR,
		Currency:                      w.Currency,
		PolicyVersionID:               w.PolicyVersionID,
		FeeSnapshotID:                 w.FeeSnapshotID,
		BankAccountID:                 w.BankAccountID,
		BankAccountVersion:            w.BankAccountVersion,
		BankCode:                      w.BankCode,
		BankName:                      w.BankName,
		AccountHolderName:             w.AccountHolderName,
		AccountNumberMasked:           w.AccountNumberMasked,
		Status:                        w.Status,
		Provider:                      w.Provider,
		AccountScope:                  w.AccountScope,
		ProviderDisbursementReference: w.ProviderDisbursementReference,
		ProviderExternalID:            w.ProviderExternalID,
		ReserveJournalID:              w.ReserveJournalID,
		ReleaseJournalID:              w.ReleaseJournalID,
		CompleteJournalID:             w.CompleteJournalID,
		FeeSettleJournalID:            w.FeeSettleJournalID,
		RecaptureJournalID:            w.RecaptureJournalID,
		ReserveReleased:               w.ReserveReleased,
		ReviewReason:                  w.ReviewReason,
		RejectReason:                  w.RejectReason,
		HoldReason:                    w.HoldReason,
		ReviewedBy:                    w.ReviewedBy,
		ReviewedAt:                    timeToPgTimestamptz(w.ReviewedAt),
		SubmittedAt:                   timeToPgTimestamptz(w.SubmittedAt),
		ProcessingAt:                  timeToPgTimestamptz(w.ProcessingAt),
		CompletedAt:                   timeToPgTimestamptz(w.CompletedAt),
		FailedAt:                      timeToPgTimestamptz(w.FailedAt),
		UnknownOutcomeAt:              timeToPgTimestamptz(w.UnknownOutcomeAt),
		NextLookupAt:                  timeToPgTimestamptz(w.NextLookupAt),
		LookupAttempts:                w.LookupAttempts,
		IdempotencyKeyHash:            w.IdempotencyKeyHash,
		RecoveryReceivableIdr:         w.RecoveryReceivableIDR,
		WithdrawalFrozen:              w.WithdrawalFrozen,
		CreatedAt:                     w.CreatedAt,
		UpdatedAt:                     w.UpdatedAt,
	})
	if err != nil {
		return withdrawals.Withdrawal{}, err
	}
	return mapWithdrawal(row), nil
}

func (r *WithdrawalRepo) GetWithdrawal(ctx context.Context, id string) (withdrawals.Withdrawal, error) {
	row, err := r.queries(ctx).WithdrawalGetByID(ctx, id)
	if err != nil {
		return withdrawals.Withdrawal{}, err
	}
	return mapWithdrawal(row), nil
}

func (r *WithdrawalRepo) GetWithdrawalByIdempotency(ctx context.Context, merchantID, mode, keyHash string) (withdrawals.Withdrawal, error) {
	row, err := r.queries(ctx).WithdrawalGetByIdempotency(ctx, gen.WithdrawalGetByIdempotencyParams{
		MerchantID:         merchantID,
		PaymentMode:        mode,
		IdempotencyKeyHash: keyHash,
	})
	if err != nil {
		return withdrawals.Withdrawal{}, err
	}
	return mapWithdrawal(row), nil
}

func (r *WithdrawalRepo) GetWithdrawalByProviderRef(ctx context.Context, provider, scope, mode, ref string) (withdrawals.Withdrawal, error) {
	row, err := r.queries(ctx).WithdrawalGetByProviderRef(ctx, gen.WithdrawalGetByProviderRefParams{
		Provider:                      provider,
		AccountScope:                  scope,
		PaymentMode:                   mode,
		ProviderDisbursementReference: &ref,
	})
	if err != nil {
		return withdrawals.Withdrawal{}, err
	}
	return mapWithdrawal(row), nil
}

func (r *WithdrawalRepo) LockWithdrawal(ctx context.Context, id string) (withdrawals.Withdrawal, error) {
	row, err := r.queries(ctx).WithdrawalLockForUpdate(ctx, id)
	if err != nil {
		return withdrawals.Withdrawal{}, err
	}
	return mapWithdrawal(row), nil
}

func (r *WithdrawalRepo) SaveWithdrawal(ctx context.Context, w withdrawals.Withdrawal) (withdrawals.Withdrawal, error) {
	row, err := r.queries(ctx).WithdrawalSave(ctx, gen.WithdrawalSaveParams{
		ID:                            w.ID,
		Status:                        w.Status,
		ReserveJournalID:              w.ReserveJournalID,
		ReleaseJournalID:              w.ReleaseJournalID,
		CompleteJournalID:             w.CompleteJournalID,
		FeeSettleJournalID:            w.FeeSettleJournalID,
		RecaptureJournalID:            w.RecaptureJournalID,
		ProviderDisbursementReference: w.ProviderDisbursementReference,
		ProviderExternalID:            w.ProviderExternalID,
		ProviderFeeActualIdr:          w.ProviderFeeActualIDR,
		ReserveReleased:               w.ReserveReleased,
		ReviewReason:                  w.ReviewReason,
		RejectReason:                  w.RejectReason,
		HoldReason:                    w.HoldReason,
		ReviewedBy:                    w.ReviewedBy,
		ReviewedAt:                    timeToPgTimestamptz(w.ReviewedAt),
		SubmittedAt:                   timeToPgTimestamptz(w.SubmittedAt),
		ProcessingAt:                  timeToPgTimestamptz(w.ProcessingAt),
		CompletedAt:                   timeToPgTimestamptz(w.CompletedAt),
		FailedAt:                      timeToPgTimestamptz(w.FailedAt),
		UnknownOutcomeAt:              timeToPgTimestamptz(w.UnknownOutcomeAt),
		NextLookupAt:                  timeToPgTimestamptz(w.NextLookupAt),
		LookupAttempts:                w.LookupAttempts,
		RecoveryReceivableIdr:         w.RecoveryReceivableIDR,
		WithdrawalFrozen:              w.WithdrawalFrozen,
		UpdatedAt:                     w.UpdatedAt,
	})
	if err != nil {
		return withdrawals.Withdrawal{}, err
	}
	return mapWithdrawal(row), nil
}

func (r *WithdrawalRepo) ListWithdrawalsByMerchant(ctx context.Context, merchantID, mode string, cursorAt *time.Time, cursorID *string, limit int32) ([]withdrawals.Withdrawal, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := r.queries(ctx).WithdrawalListByMerchant(ctx, gen.WithdrawalListByMerchantParams{
		MerchantID:      merchantID,
		PaymentMode:     mode,
		CursorCreatedAt: timeToPgTimestamptz(cursorAt),
		CursorID:        cursorID,
		Limit:           limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]withdrawals.Withdrawal, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapWithdrawal(row))
	}
	return out, nil
}

func (r *WithdrawalRepo) ListWithdrawalsAdmin(ctx context.Context, status *string, cursorAt *time.Time, cursorID *string, limit int32) ([]withdrawals.Withdrawal, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := r.queries(ctx).WithdrawalListAdmin(ctx, gen.WithdrawalListAdminParams{
		Limit:           limit,
		Status:          status,
		CursorCreatedAt: timeToPgTimestamptz(cursorAt),
		CursorID:        cursorID,
	})
	if err != nil {
		return nil, err
	}
	out := make([]withdrawals.Withdrawal, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapWithdrawal(row))
	}
	return out, nil
}

func (r *WithdrawalRepo) ListUnknownDue(ctx context.Context, asOf time.Time, limit int32) ([]withdrawals.Withdrawal, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := r.queries(ctx).WithdrawalListUnknownDue(ctx, gen.WithdrawalListUnknownDueParams{
		NextLookupAt: timeToPgTimestamptz(&asOf),
		Limit:        limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]withdrawals.Withdrawal, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapWithdrawal(row))
	}
	return out, nil
}

func (r *WithdrawalRepo) InsertAllocation(ctx context.Context, a withdrawals.Allocation) (withdrawals.Allocation, error) {
	row, err := r.queries(ctx).WithdrawalAllocationInsert(ctx, gen.WithdrawalAllocationInsertParams{
		ID:              a.ID,
		WithdrawalID:    a.WithdrawalID,
		SettlementLotID: a.SettlementLotID,
		Source:          a.Source,
		AmountIdr:       a.AmountIDR,
		AvailableAt:     a.AvailableAt,
		LineNo:          a.LineNo,
		CreatedAt:       a.CreatedAt,
	})
	if err != nil {
		return withdrawals.Allocation{}, err
	}
	return mapAlloc(row), nil
}

func (r *WithdrawalRepo) ListAllocations(ctx context.Context, withdrawalID string) ([]withdrawals.Allocation, error) {
	rows, err := r.queries(ctx).WithdrawalAllocationList(ctx, withdrawalID)
	if err != nil {
		return nil, err
	}
	out := make([]withdrawals.Allocation, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapAlloc(row))
	}
	return out, nil
}

func (r *WithdrawalRepo) SchemaMetaInt(ctx context.Context, key string, fallback int64) (int64, error) {
	val, err := r.queries(ctx).WithdrawalSchemaMeta(ctx, key)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return fallback, nil
		}
		return fallback, err
	}
	n, err := strconv.ParseInt(val, 10, 64)
	if err != nil {
		return fallback, nil
	}
	return n, nil
}

func (r *WithdrawalRepo) SchemaMetaBool(ctx context.Context, key string, fallback bool) (bool, error) {
	val, err := r.queries(ctx).WithdrawalSchemaMeta(ctx, key)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return fallback, nil
		}
		return fallback, err
	}
	switch val {
	case "true", "1", "TRUE", "yes":
		return true, nil
	case "false", "0", "FALSE", "no":
		return false, nil
	default:
		return fallback, nil
	}
}

func (r *WithdrawalRepo) GetStoreMerchant(ctx context.Context, storeID string) (string, string, error) {
	row, err := r.queries(ctx).LedgerGetStoreMerchant(ctx, storeID)
	if err != nil {
		return "", "", err
	}
	return row.ID, row.MerchantID, nil
}

func mapBankAccount(row gen.BankAccount) withdrawals.BankAccount {
	return withdrawals.BankAccount{
		ID:                   row.ID,
		MerchantID:           row.MerchantID,
		BankCode:             row.BankCode,
		BankName:             row.BankName,
		AccountHolderName:    row.AccountHolderName,
		AccountNumberCipher:  row.AccountNumberCiphertext,
		EncryptionKeyVersion: row.EncryptionKeyVersion,
		AccountNumberMasked:  row.AccountNumberMasked,
		AccountNumberLast4:   row.AccountNumberLast4,
		Status:               row.Status,
		IsPrimary:            row.IsPrimary,
		Version:              row.Version,
		VerifiedAt:           pgTimestamptzToTimePtr(row.VerifiedAt),
		ArchivedAt:           pgTimestamptzToTimePtr(row.ArchivedAt),
		CreatedAt:            row.CreatedAt,
		UpdatedAt:            row.UpdatedAt,
	}
}

func mapLock(row gen.MerchantWithdrawalLock) withdrawals.WithdrawalLock {
	return withdrawals.WithdrawalLock{
		MerchantID:    row.MerchantID,
		LockedUntil:   row.LockedUntil,
		Reason:        row.Reason,
		BankAccountID: row.BankAccountID,
		CreatedAt:     row.CreatedAt,
		UpdatedAt:     row.UpdatedAt,
	}
}

func mapQuote(row gen.WithdrawalQuote) withdrawals.Quote {
	return withdrawals.Quote{
		ID:                     row.ID,
		MerchantID:             row.MerchantID,
		StoreID:                row.StoreID,
		PaymentMode:            row.PaymentMode,
		AmountIDR:              row.AmountIdr,
		PlatformFeeIDR:         row.PlatformFeeIdr,
		ProviderFeeIDR:         row.ProviderFeeIdr,
		TotalFeeIDR:            row.TotalFeeIdr,
		NetDisbursementIDR:     row.NetDisbursementIdr,
		Currency:               row.Currency,
		PolicyVersionID:        row.PolicyVersionID,
		FeeSnapshotID:          row.FeeSnapshotID,
		BankAccountID:          row.BankAccountID,
		BankAccountVersion:     row.BankAccountVersion,
		BankCode:               row.BankCode,
		BankName:               row.BankName,
		AccountHolderName:      row.AccountHolderName,
		AccountNumberMasked:    row.AccountNumberMasked,
		ProviderQuoteReference: row.ProviderQuoteReference,
		ProviderQuoteEvidence:  row.ProviderQuoteEvidence,
		Status:                 row.Status,
		IdempotencyKeyHash:     row.IdempotencyKeyHash,
		RequestHash:            row.RequestHash,
		ExpiresAt:              row.ExpiresAt,
		ConsumedWithdrawalID:   row.ConsumedWithdrawalID,
		CreatedAt:              row.CreatedAt,
		UpdatedAt:              row.UpdatedAt,
	}
}

func mapWithdrawal(row gen.Withdrawal) withdrawals.Withdrawal {
	return withdrawals.Withdrawal{
		ID:                            row.ID,
		MerchantID:                    row.MerchantID,
		StoreID:                       row.StoreID,
		PaymentMode:                   row.PaymentMode,
		Source:                        row.Source,
		QuoteID:                       row.QuoteID,
		AmountIDR:                     row.AmountIdr,
		PlatformFeeIDR:                row.PlatformFeeIdr,
		ProviderFeeQuotedIDR:          row.ProviderFeeQuotedIdr,
		ProviderFeeActualIDR:          row.ProviderFeeActualIdr,
		TotalFeeIDR:                   row.TotalFeeIdr,
		NetDisbursementIDR:            row.NetDisbursementIdr,
		Currency:                      row.Currency,
		PolicyVersionID:               row.PolicyVersionID,
		FeeSnapshotID:                 row.FeeSnapshotID,
		BankAccountID:                 row.BankAccountID,
		BankAccountVersion:            row.BankAccountVersion,
		BankCode:                      row.BankCode,
		BankName:                      row.BankName,
		AccountHolderName:             row.AccountHolderName,
		AccountNumberMasked:           row.AccountNumberMasked,
		Status:                        row.Status,
		Provider:                      row.Provider,
		AccountScope:                  row.AccountScope,
		ProviderDisbursementReference: row.ProviderDisbursementReference,
		ProviderExternalID:            row.ProviderExternalID,
		ReserveJournalID:              row.ReserveJournalID,
		ReleaseJournalID:              row.ReleaseJournalID,
		CompleteJournalID:             row.CompleteJournalID,
		FeeSettleJournalID:            row.FeeSettleJournalID,
		RecaptureJournalID:            row.RecaptureJournalID,
		ReserveReleased:               row.ReserveReleased,
		ReviewReason:                  row.ReviewReason,
		RejectReason:                  row.RejectReason,
		HoldReason:                    row.HoldReason,
		ReviewedBy:                    row.ReviewedBy,
		ReviewedAt:                    pgTimestamptzToTimePtr(row.ReviewedAt),
		SubmittedAt:                   pgTimestamptzToTimePtr(row.SubmittedAt),
		ProcessingAt:                  pgTimestamptzToTimePtr(row.ProcessingAt),
		CompletedAt:                   pgTimestamptzToTimePtr(row.CompletedAt),
		FailedAt:                      pgTimestamptzToTimePtr(row.FailedAt),
		UnknownOutcomeAt:              pgTimestamptzToTimePtr(row.UnknownOutcomeAt),
		NextLookupAt:                  pgTimestamptzToTimePtr(row.NextLookupAt),
		LookupAttempts:                row.LookupAttempts,
		IdempotencyKeyHash:            row.IdempotencyKeyHash,
		RecoveryReceivableIDR:         row.RecoveryReceivableIdr,
		WithdrawalFrozen:              row.WithdrawalFrozen,
		CreatedAt:                     row.CreatedAt,
		UpdatedAt:                     row.UpdatedAt,
	}
}

func mapAlloc(row gen.WithdrawalAllocation) withdrawals.Allocation {
	return withdrawals.Allocation{
		ID:              row.ID,
		WithdrawalID:    row.WithdrawalID,
		SettlementLotID: row.SettlementLotID,
		Source:          row.Source,
		AmountIDR:       row.AmountIdr,
		AvailableAt:     row.AvailableAt,
		LineNo:          row.LineNo,
		CreatedAt:       row.CreatedAt,
	}
}

// Ensure interface compliance.
var _ application.WithdrawalStore = (*WithdrawalRepo)(nil)
