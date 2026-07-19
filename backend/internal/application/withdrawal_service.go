package application

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/ledger"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/platform"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/withdrawals"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
	"github.com/dasepmoch/fersaku-new/backend/internal/security"
)

// WithdrawalService owns bank accounts, quotes, reserve, disburse, and outcome resolution (BE-350).
type WithdrawalService struct {
	Store         WithdrawalStore
	Ledger        *LedgerService
	Fees          *FeeService
	Disburse      ports.DisbursementProvider
	IDs           ports.IDGenerator
	Clock         ports.Clock
	Log           ports.Logger
	EncryptionKey string
	AccountScope  string
	// DefaultPaymentMode for seller ops (SANDBOX local / LIVE prod).
	DefaultPaymentMode string
	// AutoApprove when true (local/test): REQUESTED → APPROVED → disburse without admin.
	// Nil means read schema_meta withdrawal_auto_approve.
	ForceAutoApprove *bool
	// EmergencyDisabled when set consults platform_emergency_controls (BE-510).
	EmergencyDisabled func(ctx context.Context, switchName string) (bool, error)
}

func (s *WithdrawalService) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now().UTC()
	}
	return time.Now().UTC()
}

func (s *WithdrawalService) mode(raw string) string {
	m := NormalizePaymentMode(raw)
	if m == "" {
		if s.DefaultPaymentMode != "" {
			return s.DefaultPaymentMode
		}
		return withdrawals.ModeSandbox
	}
	return m
}

func (s *WithdrawalService) scope() string {
	if s.AccountScope != "" {
		return s.AccountScope
	}
	return "xendit-primary"
}

func (s *WithdrawalService) hashKey(raw string) string {
	h := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(h[:])
}

func (s *WithdrawalService) resolveMerchant(ctx context.Context, storeID string) (merchantID string, err error) {
	if s.Store == nil {
		return "", apperr.Internal(apperr.CodeInternalError, "Withdrawal store unavailable")
	}
	_, merchantID, err = s.Store.GetStoreMerchant(ctx, storeID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return "", apperr.NotFound(apperr.CodeResourceNotFound, "Store not found")
		}
		return "", err
	}
	return merchantID, nil
}

// ---------- Bank accounts ----------

// CreateBankAccount encrypts the number and stores a masked list DTO.
func (s *WithdrawalService) CreateBankAccount(ctx context.Context, storeID, bankCode, bankName, holder, accountNumber string, makePrimary bool) (withdrawals.BankAccount, error) {
	merchantID, err := s.resolveMerchant(ctx, storeID)
	if err != nil {
		return withdrawals.BankAccount{}, err
	}
	digits := withdrawals.NormalizeAccountNumber(accountNumber)
	if !withdrawals.ValidAccountNumber(digits) {
		return withdrawals.BankAccount{}, apperr.Validation(apperr.CodeValidationFailed, "Invalid bank account number")
	}
	if strings.TrimSpace(bankCode) == "" || strings.TrimSpace(holder) == "" {
		return withdrawals.BankAccount{}, apperr.Validation(apperr.CodeValidationFailed, "bankCode and accountHolderName required")
	}
	if s.EncryptionKey == "" {
		return withdrawals.BankAccount{}, apperr.Internal(apperr.CodeInternalError, "Encryption key unavailable")
	}
	kv, cipher, err := security.EncryptString(s.EncryptionKey, digits)
	if err != nil {
		return withdrawals.BankAccount{}, apperr.Internal(apperr.CodeInternalError, "Encrypt failed")
	}
	now := s.now()
	acc := withdrawals.BankAccount{
		ID:                   "bank_" + s.IDs.New(),
		MerchantID:           merchantID,
		BankCode:             strings.ToUpper(strings.TrimSpace(bankCode)),
		BankName:             strings.TrimSpace(bankName),
		AccountHolderName:    strings.TrimSpace(holder),
		AccountNumberCipher:  cipher,
		EncryptionKeyVersion: kv,
		AccountNumberMasked:  withdrawals.MaskAccountNumber(digits),
		AccountNumberLast4:   withdrawals.Last4(digits),
		Status:               withdrawals.BankPendingVerification,
		IsPrimary:            false,
		Version:              1,
		CreatedAt:            now,
		UpdatedAt:            now,
	}
	created, err := s.Store.InsertBankAccount(ctx, acc)
	if err != nil {
		return withdrawals.BankAccount{}, err
	}
	if makePrimary {
		// verify first then primary in local path is separate
	}
	return created, nil
}

// ListBankAccounts returns masked bank accounts (no full number).
func (s *WithdrawalService) ListBankAccounts(ctx context.Context, storeID string) ([]withdrawals.BankAccount, error) {
	merchantID, err := s.resolveMerchant(ctx, storeID)
	if err != nil {
		return nil, err
	}
	return s.Store.ListBankAccounts(ctx, merchantID)
}

// VerifyBankAccount marks verified (local auto-verify; production may use name check later).
func (s *WithdrawalService) VerifyBankAccount(ctx context.Context, storeID, bankID string) (withdrawals.BankAccount, error) {
	merchantID, err := s.resolveMerchant(ctx, storeID)
	if err != nil {
		return withdrawals.BankAccount{}, err
	}
	acc, err := s.Store.GetBankAccount(ctx, bankID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return withdrawals.BankAccount{}, apperr.NotFound(apperr.CodeResourceNotFound, "Bank account not found")
		}
		return withdrawals.BankAccount{}, err
	}
	if acc.MerchantID != merchantID {
		return withdrawals.BankAccount{}, apperr.NotFound(apperr.CodeResourceNotFound, "Bank account not found")
	}
	if acc.Status == withdrawals.BankVerified {
		return acc, nil
	}
	if acc.Status != withdrawals.BankPendingVerification {
		return withdrawals.BankAccount{}, apperr.Conflict(apperr.CodeConflict, "Bank account cannot be verified")
	}
	now := s.now()
	verified, err := s.Store.SetBankVerified(ctx, bankID, now)
	if err != nil {
		return withdrawals.BankAccount{}, err
	}
	// First verified becomes primary.
	n, _ := s.Store.CountVerifiedBanks(ctx, merchantID)
	if n == 1 || !verified.IsPrimary {
		_ = s.Store.ClearPrimary(ctx, merchantID, now)
		verified, err = s.Store.MakePrimary(ctx, bankID, merchantID, now)
		if err != nil {
			return withdrawals.BankAccount{}, err
		}
	}
	return verified, nil
}

// MakePrimaryBank sets primary verified account and invalidates outstanding quotes.
func (s *WithdrawalService) MakePrimaryBank(ctx context.Context, storeID, bankID string) (withdrawals.BankAccount, error) {
	merchantID, err := s.resolveMerchant(ctx, storeID)
	if err != nil {
		return withdrawals.BankAccount{}, err
	}
	acc, err := s.Store.GetBankAccount(ctx, bankID)
	if err != nil || acc.MerchantID != merchantID {
		return withdrawals.BankAccount{}, apperr.NotFound(apperr.CodeResourceNotFound, "Bank account not found")
	}
	if acc.Status != withdrawals.BankVerified {
		return withdrawals.BankAccount{}, withdrawals.ErrBankNotVerified
	}
	now := s.now()
	if err := s.Store.ClearPrimary(ctx, merchantID, now); err != nil {
		return withdrawals.BankAccount{}, err
	}
	primary, err := s.Store.MakePrimary(ctx, bankID, merchantID, now)
	if err != nil {
		return withdrawals.BankAccount{}, err
	}
	_ = s.Store.InvalidateQuotesForMerchant(ctx, merchantID, now)
	return primary, nil
}

// UpdateBankAccount creates a new version (optimistic) and applies security lock.
func (s *WithdrawalService) UpdateBankAccount(ctx context.Context, storeID, bankID string, expectedVersion int64, bankCode, bankName, holder, accountNumber string) (withdrawals.BankAccount, error) {
	merchantID, err := s.resolveMerchant(ctx, storeID)
	if err != nil {
		return withdrawals.BankAccount{}, err
	}
	acc, err := s.Store.GetBankAccount(ctx, bankID)
	if err != nil || acc.MerchantID != merchantID {
		return withdrawals.BankAccount{}, apperr.NotFound(apperr.CodeResourceNotFound, "Bank account not found")
	}
	if expectedVersion > 0 && acc.Version != expectedVersion {
		return withdrawals.BankAccount{}, withdrawals.ErrBankVersionConflict
	}
	digits := withdrawals.NormalizeAccountNumber(accountNumber)
	if accountNumber != "" {
		if !withdrawals.ValidAccountNumber(digits) {
			return withdrawals.BankAccount{}, apperr.Validation(apperr.CodeValidationFailed, "Invalid bank account number")
		}
		kv, cipher, eerr := security.EncryptString(s.EncryptionKey, digits)
		if eerr != nil {
			return withdrawals.BankAccount{}, apperr.Internal(apperr.CodeInternalError, "Encrypt failed")
		}
		acc.AccountNumberCipher = cipher
		acc.EncryptionKeyVersion = kv
		acc.AccountNumberMasked = withdrawals.MaskAccountNumber(digits)
		acc.AccountNumberLast4 = withdrawals.Last4(digits)
	}
	if bankCode != "" {
		acc.BankCode = strings.ToUpper(strings.TrimSpace(bankCode))
	}
	if bankName != "" {
		acc.BankName = strings.TrimSpace(bankName)
	}
	if holder != "" {
		acc.AccountHolderName = strings.TrimSpace(holder)
	}
	now := s.now()
	acc.UpdatedAt = now
	updated, err := s.Store.UpdateBankAccount(ctx, acc, acc.Version)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return withdrawals.BankAccount{}, withdrawals.ErrBankVersionConflict
		}
		return withdrawals.BankAccount{}, err
	}
	// Security lock + invalidate quotes
	lockSec, _ := s.Store.SchemaMetaInt(ctx, "bank_change_lock_seconds", withdrawals.DefaultBankChangeLockSeconds)
	bid := updated.ID
	_, _ = s.Store.UpsertWithdrawalLock(ctx, withdrawals.WithdrawalLock{
		MerchantID:    merchantID,
		LockedUntil:   now.Add(time.Duration(lockSec) * time.Second),
		Reason:        "BANK_CHANGE",
		BankAccountID: &bid,
		CreatedAt:     now,
		UpdatedAt:     now,
	})
	_ = s.Store.InvalidateQuotesForBank(ctx, bankID, now)
	_ = s.Store.InvalidateQuotesForMerchant(ctx, merchantID, now)
	return updated, nil
}

// ArchiveBankAccount archives when not in use and not sole primary.
func (s *WithdrawalService) ArchiveBankAccount(ctx context.Context, storeID, bankID string) (withdrawals.BankAccount, error) {
	merchantID, err := s.resolveMerchant(ctx, storeID)
	if err != nil {
		return withdrawals.BankAccount{}, err
	}
	acc, err := s.Store.GetBankAccount(ctx, bankID)
	if err != nil || acc.MerchantID != merchantID {
		return withdrawals.BankAccount{}, apperr.NotFound(apperr.CodeResourceNotFound, "Bank account not found")
	}
	activeW, _ := s.Store.CountActiveWithdrawalsForBank(ctx, bankID)
	activeQ, _ := s.Store.CountActiveQuotesForBank(ctx, bankID)
	if activeW > 0 || activeQ > 0 {
		return withdrawals.BankAccount{}, withdrawals.ErrBankInUse
	}
	if acc.IsPrimary && acc.Status == withdrawals.BankVerified {
		n, _ := s.Store.CountVerifiedBanks(ctx, merchantID)
		if n <= 1 {
			return withdrawals.BankAccount{}, withdrawals.ErrBankPrimaryRequired
		}
	}
	return s.Store.ArchiveBankAccount(ctx, bankID, s.now())
}

// GetWithdrawalLock returns lock status for the merchant.
func (s *WithdrawalService) GetWithdrawalLock(ctx context.Context, storeID string) (withdrawals.WithdrawalLock, bool, error) {
	merchantID, err := s.resolveMerchant(ctx, storeID)
	if err != nil {
		return withdrawals.WithdrawalLock{}, false, err
	}
	lock, err := s.Store.GetWithdrawalLock(ctx, merchantID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return withdrawals.WithdrawalLock{}, false, nil
		}
		return withdrawals.WithdrawalLock{}, false, err
	}
	return lock, lock.IsLocked(s.now()), nil
}

// ---------- Quotes ----------

// CreateQuote is idempotent on Idempotency-Key + amount + bankAccountId.
func (s *WithdrawalService) CreateQuote(ctx context.Context, storeID, idempotencyKey string, amountIDR int64, bankAccountID, paymentMode string) (withdrawals.Quote, error) {
	if s.EmergencyDisabled != nil {
		if off, err := s.EmergencyDisabled(ctx, "WITHDRAWALS"); err == nil && off {
			return withdrawals.Quote{}, apperr.Forbidden(apperr.CodeForbidden, "Withdrawals are temporarily disabled")
		}
	}
	if strings.TrimSpace(idempotencyKey) == "" {
		return withdrawals.Quote{}, apperr.Validation(apperr.CodeValidationFailed, "Idempotency-Key is required")
	}
	if strings.TrimSpace(bankAccountID) == "" {
		return withdrawals.Quote{}, apperr.Validation(apperr.CodeValidationFailed, "bankAccountId is required")
	}
	merchantID, err := s.resolveMerchant(ctx, storeID)
	if err != nil {
		return withdrawals.Quote{}, err
	}
	mode := s.mode(paymentMode)
	now := s.now()

	// Frozen / security lock
	if frozen, _ := s.merchantFrozen(ctx, merchantID); frozen {
		return withdrawals.Quote{}, withdrawals.ErrFrozen
	}
	if lock, lerr := s.Store.GetWithdrawalLock(ctx, merchantID); lerr == nil && lock.IsLocked(now) {
		return withdrawals.Quote{}, withdrawals.ErrLocked
	}

	keyHash := s.hashKey(idempotencyKey)
	reqHash := s.hashKey(fmt.Sprintf("%d|%s", amountIDR, bankAccountID))

	if existing, gerr := s.Store.GetQuoteByIdempotency(ctx, merchantID, mode, keyHash); gerr == nil {
		if existing.RequestHash != reqHash {
			return withdrawals.Quote{}, apperr.Conflict(apperr.CodeIdempotencyConflict, "Idempotency-Key reused with different request")
		}
		return existing, nil
	} else if !s.Store.IsNotFound(gerr) {
		return withdrawals.Quote{}, gerr
	}

	bank, err := s.Store.GetBankAccount(ctx, bankAccountID)
	if err != nil || bank.MerchantID != merchantID {
		return withdrawals.Quote{}, apperr.NotFound(apperr.CodeResourceNotFound, "Bank account not found")
	}
	if bank.Status != withdrawals.BankVerified {
		return withdrawals.Quote{}, withdrawals.ErrBankNotVerified
	}

	// Provider processing fee quote
	providerFee := withdrawals.DefaultProviderFeeIDR
	var provRef *string
	evidence := "fallback-schedule-v1"
	if s.Disburse != nil {
		dq, qerr := s.Disburse.QuoteDisbursement(ctx, ports.DisbursementQuoteInput{
			AmountIDR:      amountIDR,
			Currency:       "IDR",
			BankCode:       bank.BankCode,
			AccountScope:   s.scope(),
			PaymentMode:    mode,
			IdempotencyKey: idempotencyKey,
		})
		if qerr == nil {
			providerFee = dq.ProviderFeeIDR
			if dq.ProviderReference != "" {
				r := dq.ProviderReference
				provRef = &r
			}
			if dq.Evidence != "" {
				evidence = dq.Evidence
			}
		} else {
			// Fallback versioned schedule from schema_meta
			if fee, ferr := s.Store.SchemaMetaInt(ctx, "withdrawal_default_provider_fee_idr", withdrawals.DefaultProviderFeeIDR); ferr == nil {
				providerFee = fee
			}
			evidence = "versioned-fallback-schedule"
		}
	} else if fee, ferr := s.Store.SchemaMetaInt(ctx, "withdrawal_default_provider_fee_idr", withdrawals.DefaultProviderFeeIDR); ferr == nil {
		providerFee = fee
	}

	feeRes, policy, err := s.Fees.CalculateWithdrawal(ctx, amountIDR, providerFee)
	if err != nil {
		return withdrawals.Quote{}, err
	}

	// Available check (preview allocation)
	if s.Ledger != nil {
		if _, aerr := s.Ledger.PreviewWithdrawalAllocation(ctx, merchantID, mode, amountIDR); aerr != nil {
			return withdrawals.Quote{}, withdrawals.ErrInsufficient
		}
		bal, berr := s.Ledger.Store.GetBalance(ctx, merchantID, mode)
		if berr == nil && bal.AvailableIDR < amountIDR {
			return withdrawals.Quote{}, withdrawals.ErrInsufficient
		}
	}

	var snapID *string
	if s.Fees != nil && s.Fees.Store != nil {
		if snap, serr := s.Fees.SnapshotWithdrawal(ctx, feeRes, policy); serr == nil && snap.ID != "" {
			id := snap.ID
			snapID = &id
		}
	}

	ttl, _ := s.Store.SchemaMetaInt(ctx, "withdrawal_quote_ttl_seconds", withdrawals.DefaultQuoteTTLSeconds)
	sid := storeID
	q := withdrawals.Quote{
		ID:                     "wq_" + s.IDs.New(),
		MerchantID:             merchantID,
		StoreID:                &sid,
		PaymentMode:            mode,
		AmountIDR:              feeRes.AmountIDR,
		PlatformFeeIDR:         feeRes.PlatformFeeIDR,
		ProviderFeeIDR:         feeRes.ProviderFeeIDR,
		TotalFeeIDR:            feeRes.TotalFeeIDR,
		NetDisbursementIDR:     feeRes.NetDisbursementIDR,
		Currency:               withdrawals.CurrencyIDR,
		PolicyVersionID:        policy.VersionID,
		FeeSnapshotID:          snapID,
		BankAccountID:          bank.ID,
		BankAccountVersion:     bank.Version,
		BankCode:               bank.BankCode,
		BankName:               bank.BankName,
		AccountHolderName:      bank.AccountHolderName,
		AccountNumberMasked:    bank.AccountNumberMasked,
		ProviderQuoteReference: provRef,
		ProviderQuoteEvidence:  evidence,
		Status:                 withdrawals.QuoteActive,
		IdempotencyKeyHash:     keyHash,
		RequestHash:            reqHash,
		ExpiresAt:              now.Add(time.Duration(ttl) * time.Second),
		CreatedAt:              now,
		UpdatedAt:              now,
	}
	created, err := s.Store.InsertQuote(ctx, q)
	if err != nil {
		// Race: replay
		if existing, gerr := s.Store.GetQuoteByIdempotency(ctx, merchantID, mode, keyHash); gerr == nil {
			if existing.RequestHash != reqHash {
				return withdrawals.Quote{}, apperr.Conflict(apperr.CodeIdempotencyConflict, "Idempotency-Key reused with different request")
			}
			return existing, nil
		}
		return withdrawals.Quote{}, err
	}
	return created, nil
}

// ---------- Request withdrawal ----------

// RequestWithdrawal consumes a quote once, reserves balance, allocates FIFO, auto-approves or PENDING_REVIEW.
func (s *WithdrawalService) RequestWithdrawal(ctx context.Context, storeID, quoteID, idempotencyKey, paymentMode string) (withdrawals.Withdrawal, error) {
	if strings.TrimSpace(idempotencyKey) == "" {
		return withdrawals.Withdrawal{}, apperr.Validation(apperr.CodeValidationFailed, "Idempotency-Key is required")
	}
	if strings.TrimSpace(quoteID) == "" {
		return withdrawals.Withdrawal{}, apperr.Validation(apperr.CodeValidationFailed, "quoteId is required")
	}
	if s.EmergencyDisabled != nil {
		if off, err := s.EmergencyDisabled(ctx, "WITHDRAWALS"); err == nil && off {
			return withdrawals.Withdrawal{}, apperr.Forbidden(apperr.CodeForbidden, "Withdrawals are temporarily disabled")
		}
	}
	merchantID, err := s.resolveMerchant(ctx, storeID)
	if err != nil {
		return withdrawals.Withdrawal{}, err
	}
	mode := s.mode(paymentMode)
	now := s.now()
	keyHash := s.hashKey(idempotencyKey)

	if existing, gerr := s.Store.GetWithdrawalByIdempotency(ctx, merchantID, mode, keyHash); gerr == nil {
		return s.withAllocations(ctx, existing)
	}

	if frozen, _ := s.merchantFrozen(ctx, merchantID); frozen {
		return withdrawals.Withdrawal{}, withdrawals.ErrFrozen
	}
	if lock, lerr := s.Store.GetWithdrawalLock(ctx, merchantID); lerr == nil && lock.IsLocked(now) {
		return withdrawals.Withdrawal{}, withdrawals.ErrLocked
	}

	quote, err := s.Store.GetQuote(ctx, quoteID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return withdrawals.Withdrawal{}, withdrawals.ErrQuoteInvalid
		}
		return withdrawals.Withdrawal{}, err
	}
	if quote.MerchantID != merchantID || quote.PaymentMode != mode {
		return withdrawals.Withdrawal{}, withdrawals.ErrQuoteInvalid
	}
	if quote.Status == withdrawals.QuoteConsumed {
		return withdrawals.Withdrawal{}, withdrawals.ErrQuoteConsumed
	}
	if quote.Status != withdrawals.QuoteActive {
		return withdrawals.Withdrawal{}, withdrawals.ErrQuoteInvalid
	}
	if !quote.ExpiresAt.After(now) {
		return withdrawals.Withdrawal{}, withdrawals.ErrQuoteExpired
	}

	bank, err := s.Store.GetBankAccount(ctx, quote.BankAccountID)
	if err != nil || bank.Version != quote.BankAccountVersion || bank.Status != withdrawals.BankVerified {
		return withdrawals.Withdrawal{}, withdrawals.ErrQuoteInvalid
	}

	auto := s.autoApprove(ctx)
	status := withdrawals.StatusUnderReview
	if auto {
		status = withdrawals.StatusApproved
	}

	var result withdrawals.Withdrawal
	err = s.Store.WithTx(ctx, func(txCtx context.Context) error {
		// Lock wallet + allocate FIFO under merchant balance lock
		if s.Ledger == nil || s.Ledger.Store == nil {
			return apperr.Internal(apperr.CodeInternalError, "Ledger unavailable")
		}
		_ = s.Ledger.Store.EnsureBalance(txCtx, merchantID, mode, now)
		bal, lerr := s.Ledger.Store.LockBalance(txCtx, merchantID, mode)
		if lerr != nil {
			return lerr
		}
		if bal.AvailableIDR < quote.AmountIDR {
			return withdrawals.ErrInsufficient
		}
		lots, lerr := s.Ledger.Store.ListAvailableLots(txCtx, merchantID, mode)
		if lerr != nil {
			return lerr
		}
		alloc, aerr := ledger.AllocateWithdrawalFIFO(quote.AmountIDR, lots)
		if aerr != nil {
			return withdrawals.ErrInsufficient
		}

		wid := "wd_" + s.IDs.New()
		// Consume quote exactly once bound to withdrawal id
		if _, cerr := s.Store.MarkQuoteConsumed(txCtx, quote.ID, wid, now); cerr != nil {
			if s.Store.IsNotFound(cerr) {
				return withdrawals.ErrQuoteConsumed
			}
			return cerr
		}

		// Post reserve journal
		legs, lerr := ledger.BuildWithdrawalReserveLegs(quote.AmountIDR)
		if lerr != nil {
			return lerr
		}
		jref := ledger.JournalReferenceWithdrawalReserve(wid)
		jid := "lj_" + s.IDs.New()
		sid := storeID
		_, perr := s.Ledger.Store.PostJournal(txCtx, PostJournalParams{
			JournalID:        jid,
			MerchantID:       merchantID,
			StoreID:          storeID,
			PaymentMode:      mode,
			Source:           alloc.Source,
			TemplateCode:     ledger.TemplateWithdrawalReserve,
			ReferenceType:    "WITHDRAWAL",
			ReferenceID:      wid,
			JournalReference: jref,
			IdempotencyKey:   jref,
			Description:      "Withdrawal reserve " + wid,
			MerchantNetIDR:   &quote.AmountIDR,
			PostedAt:         now,
			Legs:             legs,
		})
		if perr != nil {
			return perr
		}

		// Consume lots
		for _, slice := range alloc.Allocations {
			if err := s.Ledger.Store.ConsumeLotRemaining(txCtx, slice.SettlementLotID, slice.AmountIDR, now); err != nil {
				return err
			}
		}

		// Insert withdrawal
		w := withdrawals.Withdrawal{
			ID:                   wid,
			MerchantID:           merchantID,
			StoreID:              &sid,
			PaymentMode:          mode,
			Source:               alloc.Source,
			QuoteID:              quote.ID,
			AmountIDR:            quote.AmountIDR,
			PlatformFeeIDR:       quote.PlatformFeeIDR,
			ProviderFeeQuotedIDR: quote.ProviderFeeIDR,
			TotalFeeIDR:          quote.TotalFeeIDR,
			NetDisbursementIDR:   quote.NetDisbursementIDR,
			Currency:             withdrawals.CurrencyIDR,
			PolicyVersionID:      quote.PolicyVersionID,
			FeeSnapshotID:        quote.FeeSnapshotID,
			BankAccountID:        quote.BankAccountID,
			BankAccountVersion:   quote.BankAccountVersion,
			BankCode:             quote.BankCode,
			BankName:             quote.BankName,
			AccountHolderName:    quote.AccountHolderName,
			AccountNumberMasked:  quote.AccountNumberMasked,
			Status:               status,
			Provider:             withdrawals.ProviderXendit,
			AccountScope:         s.scope(),
			ReserveJournalID:     &jid,
			ReserveReleased:      false,
			IdempotencyKeyHash:   keyHash,
			SubmittedAt:          &now,
			CreatedAt:            now,
			UpdatedAt:            now,
		}
		if auto {
			w.ReviewedAt = &now
			w.ReviewReason = "auto_approve_local"
		}
		inserted, ierr := s.Store.InsertWithdrawal(txCtx, w)
		if ierr != nil {
			if existing, gerr := s.Store.GetWithdrawalByIdempotency(txCtx, merchantID, mode, keyHash); gerr == nil {
				result = existing
				return nil
			}
			return ierr
		}

		for i, slice := range alloc.Allocations {
			_, _ = s.Store.InsertAllocation(txCtx, withdrawals.Allocation{
				ID:              "wa_" + s.IDs.New(),
				WithdrawalID:    wid,
				SettlementLotID: slice.SettlementLotID,
				Source:          slice.Source,
				AmountIDR:       slice.AmountIDR,
				AvailableAt:     slice.AvailableAt,
				LineNo:          int32(i + 1),
				CreatedAt:       now,
			})
		}
		result = inserted
		return nil
	})
	if err != nil {
		return withdrawals.Withdrawal{}, err
	}
	if result.ID == "" {
		return withdrawals.Withdrawal{}, apperr.Internal(apperr.CodeInternalError, "Withdrawal create failed")
	}

	// Auto-disburse when approved
	if result.Status == withdrawals.StatusApproved {
		if derr := s.DisburseWithdrawal(ctx, result.ID); derr != nil {
			// Leave APPROVED / UNKNOWN as set by DisburseWithdrawal
			if s.Log != nil {
				s.Log.Info("disburse after request", "withdrawal_id", result.ID, "err", derr.Error())
			}
		}
		refreshed, gerr := s.Store.GetWithdrawal(ctx, result.ID)
		if gerr == nil {
			result = refreshed
		}
	}
	return s.withAllocations(ctx, result)
}

func (s *WithdrawalService) withAllocations(ctx context.Context, w withdrawals.Withdrawal) (withdrawals.Withdrawal, error) {
	allocs, err := s.Store.ListAllocations(ctx, w.ID)
	if err == nil {
		w.Allocations = allocs
	}
	return w, nil
}

func (s *WithdrawalService) autoApprove(ctx context.Context) bool {
	if s.ForceAutoApprove != nil {
		return *s.ForceAutoApprove
	}
	v, err := s.Store.SchemaMetaBool(ctx, "withdrawal_auto_approve", true)
	if err != nil {
		return true
	}
	return v
}

func (s *WithdrawalService) merchantFrozen(ctx context.Context, merchantID string) (bool, error) {
	// Any completed-with-freeze or open recovery — scan recent admin list is heavy;
	// use schema-less check: list merchant withdrawals with withdrawal_frozen.
	// Lightweight: try get lock reason FROZEN via held withdrawals.
	list, err := s.Store.ListWithdrawalsByMerchant(ctx, merchantID, s.mode(""), nil, nil, 20)
	if err != nil {
		return false, nil
	}
	for _, w := range list {
		if w.WithdrawalFrozen {
			return true, nil
		}
	}
	return false, nil
}

// ---------- Disburse ----------

// DisburseWithdrawal submits to provider once. Timeout → UNKNOWN_OUTCOME, no second payout.
func (s *WithdrawalService) DisburseWithdrawal(ctx context.Context, withdrawalID string) error {
	if s.Disburse == nil {
		return apperr.Internal(apperr.CodeInternalError, "Disbursement provider unavailable")
	}
	now := s.now()
	var w withdrawals.Withdrawal
	err := s.Store.WithTx(ctx, func(txCtx context.Context) error {
		var lerr error
		w, lerr = s.Store.LockWithdrawal(txCtx, withdrawalID)
		if lerr != nil {
			return lerr
		}
		if w.Status == withdrawals.StatusProcessing || w.Status == withdrawals.StatusCompleted ||
			w.Status == withdrawals.StatusUnknownOutcome {
			// Already submitted — do not create second payout
			return nil
		}
		if w.Status != withdrawals.StatusApproved {
			return withdrawals.ErrInvalidStatus
		}
		// Transition APPROVED → PROCESSING before provider call
		if err := withdrawals.AssertTransition(w.Status, withdrawals.StatusProcessing); err != nil {
			return withdrawals.ErrInvalidStatus
		}
		w.Status = withdrawals.StatusProcessing
		w.ProcessingAt = &now
		w.UpdatedAt = now
		ext := "fersaku_wd_" + w.ID
		w.ProviderExternalID = &ext
		_, err := s.Store.SaveWithdrawal(txCtx, w)
		return err
	})
	if err != nil {
		return err
	}
	if w.Status != withdrawals.StatusProcessing {
		return nil // already in flight
	}

	// Decrypt account number only for provider call
	bank, err := s.Store.GetBankAccount(ctx, w.BankAccountID)
	if err != nil {
		return err
	}
	plain, err := security.DecryptString(s.EncryptionKey, bank.AccountNumberCipher)
	if err != nil {
		return apperr.Internal(apperr.CodeInternalError, "Decrypt bank failed")
	}
	ext := ""
	if w.ProviderExternalID != nil {
		ext = *w.ProviderExternalID
	} else {
		ext = "fersaku_wd_" + w.ID
	}

	res, derr := s.Disburse.CreateDisbursement(ctx, ports.CreateDisbursementInput{
		ExternalID:        ext,
		NetAmountIDR:      w.NetDisbursementIDR,
		Currency:          "IDR",
		BankCode:          w.BankCode,
		AccountHolderName: w.AccountHolderName,
		AccountNumber:     plain,
		AccountNumberMask: w.AccountNumberMasked,
		Description:       "Fersaku withdrawal " + w.ID,
		AccountScope:      s.scope(),
		PaymentMode:       w.PaymentMode,
		IdempotencyKey:    ext,
	})
	// Clear plaintext
	plain = ""

	if derr != nil {
		var pe *ports.ProviderError
		if errors.As(derr, &pe) && pe.IsUnknownOutcome() {
			return s.markUnknown(ctx, w.ID, ext, now)
		}
		// Definitive rejection before accept → fail + release reserve
		return s.failAndRelease(ctx, w.ID, derr.Error())
	}

	// Bind provider reference and resolve status
	return s.applyProviderCreateResult(ctx, w.ID, res)
}

func (s *WithdrawalService) markUnknown(ctx context.Context, withdrawalID, externalID string, now time.Time) error {
	return s.Store.WithTx(ctx, func(txCtx context.Context) error {
		w, err := s.Store.LockWithdrawal(txCtx, withdrawalID)
		if err != nil {
			return err
		}
		if w.Status == withdrawals.StatusCompleted || w.Status == withdrawals.StatusFailed {
			return nil
		}
		w.Status = withdrawals.StatusUnknownOutcome
		w.UnknownOutcomeAt = &now
		next := now.Add(30 * time.Second)
		w.NextLookupAt = &next
		w.LookupAttempts++
		if externalID != "" {
			w.ProviderExternalID = &externalID
		}
		// Deterministic ref for timeout path (same external)
		if w.ProviderDisbursementReference == nil {
			// Try get from provider by external via fake helper later in ResolveUnknown
			ref := "pending:" + externalID
			w.ProviderDisbursementReference = &ref
		}
		w.UpdatedAt = now
		_, err = s.Store.SaveWithdrawal(txCtx, w)
		return err
	})
}

func (s *WithdrawalService) applyProviderCreateResult(ctx context.Context, withdrawalID string, res ports.CreateDisbursementResult) error {
	now := s.now()
	switch strings.ToUpper(res.Status) {
	case "COMPLETED", "SUCCEEDED", "SUCCESS":
		return s.completeWithdrawal(ctx, withdrawalID, res.ProviderReference, res.ProviderFeeIDR, now)
	case "FAILED", "REJECTED", "CANCELLED":
		_ = s.bindProviderRef(ctx, withdrawalID, res.ProviderReference, res.ExternalID)
		return s.failAndRelease(ctx, withdrawalID, "provider_"+strings.ToLower(res.Status))
	default:
		// PENDING / PROCESSING
		return s.Store.WithTx(ctx, func(txCtx context.Context) error {
			w, err := s.Store.LockWithdrawal(txCtx, withdrawalID)
			if err != nil {
				return err
			}
			ref := res.ProviderReference
			w.ProviderDisbursementReference = &ref
			ext := res.ExternalID
			if ext != "" {
				w.ProviderExternalID = &ext
			}
			w.Status = withdrawals.StatusProcessing
			w.UpdatedAt = now
			_, err = s.Store.SaveWithdrawal(txCtx, w)
			return err
		})
	}
}

func (s *WithdrawalService) bindProviderRef(ctx context.Context, withdrawalID, ref, externalID string) error {
	return s.Store.WithTx(ctx, func(txCtx context.Context) error {
		w, err := s.Store.LockWithdrawal(txCtx, withdrawalID)
		if err != nil {
			return err
		}
		if ref != "" {
			w.ProviderDisbursementReference = &ref
		}
		if externalID != "" {
			w.ProviderExternalID = &externalID
		}
		w.UpdatedAt = s.now()
		_, err = s.Store.SaveWithdrawal(txCtx, w)
		return err
	})
}

// completeWithdrawal posts complete + fee settle journals exactly once.
func (s *WithdrawalService) completeWithdrawal(ctx context.Context, withdrawalID, providerRef string, actualFee *int64, now time.Time) error {
	return s.Store.WithTx(ctx, func(txCtx context.Context) error {
		w, err := s.Store.LockWithdrawal(txCtx, withdrawalID)
		if err != nil {
			return err
		}
		if w.Status == withdrawals.StatusCompleted {
			return nil // exactly once
		}
		// Late success after fail/cancel needs recapture first
		if (w.Status == withdrawals.StatusFailed || w.Status == withdrawals.StatusCancelled) && w.ReserveReleased {
			if err := s.recaptureReserve(txCtx, &w, now); err != nil {
				return err
			}
		}
		if w.Status != withdrawals.StatusProcessing && w.Status != withdrawals.StatusUnknownOutcome &&
			w.Status != withdrawals.StatusApproved && w.Status != withdrawals.StatusFailed &&
			w.Status != withdrawals.StatusCancelled {
			if !withdrawals.CanTransition(w.Status, withdrawals.StatusCompleted) {
				return withdrawals.ErrInvalidStatus
			}
		}

		// Complete journal (if not already)
		if w.CompleteJournalID == nil {
			legs, lerr := ledger.BuildWithdrawalCompleteLegs(w.AmountIDR, w.PlatformFeeIDR, w.ProviderFeeQuotedIDR, w.NetDisbursementIDR)
			if lerr != nil {
				return lerr
			}
			jref := ledger.JournalReferenceWithdrawalComplete(w.ID)
			jid := "lj_" + s.IDs.New()
			storeID := ""
			if w.StoreID != nil {
				storeID = *w.StoreID
			}
			_, perr := s.Ledger.Store.PostJournal(txCtx, PostJournalParams{
				JournalID:        jid,
				MerchantID:       w.MerchantID,
				StoreID:          storeID,
				PaymentMode:      w.PaymentMode,
				Source:           w.Source,
				TemplateCode:     ledger.TemplateWithdrawalComplete,
				ReferenceType:    "WITHDRAWAL",
				ReferenceID:      w.ID,
				JournalReference: jref,
				IdempotencyKey:   jref,
				Description:      "Withdrawal complete " + w.ID,
				MerchantNetIDR:   &w.AmountIDR,
				PostedAt:         now,
				Legs:             legs,
			})
			if perr != nil {
				return perr
			}
			w.CompleteJournalID = &jid
		}

		// Fee settle variance
		q := w.ProviderFeeQuotedIDR
		a := q
		if actualFee != nil {
			a = *actualFee
		}
		if w.FeeSettleJournalID == nil && q > 0 {
			var feeLegs []ledger.EntryLeg
			var ferr error
			switch {
			case a == q:
				feeLegs, ferr = ledger.BuildProviderFeeSettleEqualLegs(q)
			case a > q:
				feeLegs, ferr = ledger.BuildProviderFeeSettleHigherLegs(q, a)
			default:
				feeLegs, ferr = ledger.BuildProviderFeeSettleLowerLegs(q, a)
			}
			if ferr != nil {
				return ferr
			}
			fref := ledger.JournalReferenceWithdrawalFeeSettle(w.ID)
			fjid := "lj_" + s.IDs.New()
			storeID := ""
			if w.StoreID != nil {
				storeID = *w.StoreID
			}
			_, perr := s.Ledger.Store.PostJournal(txCtx, PostJournalParams{
				JournalID:        fjid,
				MerchantID:       w.MerchantID,
				StoreID:          storeID,
				PaymentMode:      w.PaymentMode,
				Source:           w.Source,
				TemplateCode:     "WITHDRAWAL_FEE_SETTLE",
				ReferenceType:    "WITHDRAWAL",
				ReferenceID:      w.ID,
				JournalReference: fref,
				IdempotencyKey:   fref,
				Description:      "Provider fee settle " + w.ID,
				PostedAt:         now,
				Legs:             feeLegs,
			})
			if perr != nil {
				return perr
			}
			w.FeeSettleJournalID = &fjid
		}

		if providerRef != "" {
			w.ProviderDisbursementReference = &providerRef
		}
		w.ProviderFeeActualIDR = &a
		w.Status = withdrawals.StatusCompleted
		w.CompletedAt = &now
		w.UpdatedAt = now
		_, err = s.Store.SaveWithdrawal(txCtx, w)
		return err
	})
}

func (s *WithdrawalService) recaptureReserve(txCtx context.Context, w *withdrawals.Withdrawal, now time.Time) error {
	// a = min(available, W); r = W - a
	bal, err := s.Ledger.Store.LockBalance(txCtx, w.MerchantID, w.PaymentMode)
	if err != nil {
		return err
	}
	a := bal.AvailableIDR
	if a > w.AmountIDR {
		a = w.AmountIDR
	}
	if a < 0 {
		a = 0
	}
	r := w.AmountIDR - a
	legs, err := ledger.BuildWithdrawalRecaptureLegs(a, r, w.AmountIDR)
	if err != nil {
		return err
	}
	jref := ledger.JournalReferenceWithdrawalRecapture(w.ID)
	jid := "lj_" + s.IDs.New()
	storeID := ""
	if w.StoreID != nil {
		storeID = *w.StoreID
	}
	_, err = s.Ledger.Store.PostJournal(txCtx, PostJournalParams{
		JournalID:        jid,
		MerchantID:       w.MerchantID,
		StoreID:          storeID,
		PaymentMode:      w.PaymentMode,
		Source:           w.Source,
		TemplateCode:     ledger.TemplateWithdrawalRecapture,
		ReferenceType:    "WITHDRAWAL",
		ReferenceID:      w.ID,
		JournalReference: jref,
		IdempotencyKey:   jref,
		Description:      "Withdrawal recapture " + w.ID,
		PostedAt:         now,
		Legs:             legs,
	})
	if err != nil {
		return err
	}
	w.RecaptureJournalID = &jid
	w.ReserveReleased = false
	w.RecoveryReceivableIDR = r
	if r > 0 {
		w.WithdrawalFrozen = true
	}
	return nil
}

func (s *WithdrawalService) failAndRelease(ctx context.Context, withdrawalID, reason string) error {
	now := s.now()
	return s.Store.WithTx(ctx, func(txCtx context.Context) error {
		w, err := s.Store.LockWithdrawal(txCtx, withdrawalID)
		if err != nil {
			return err
		}
		if w.Status == withdrawals.StatusFailed || w.Status == withdrawals.StatusCompleted {
			return nil
		}
		if !w.ReserveReleased {
			if err := s.releaseReserve(txCtx, &w, now); err != nil {
				return err
			}
		}
		w.Status = withdrawals.StatusFailed
		w.FailedAt = &now
		w.RejectReason = reason
		w.UpdatedAt = now
		_, err = s.Store.SaveWithdrawal(txCtx, w)
		return err
	})
}

func (s *WithdrawalService) releaseReserve(txCtx context.Context, w *withdrawals.Withdrawal, now time.Time) error {
	if w.ReserveReleased {
		return nil
	}
	legs, err := ledger.BuildWithdrawalReleaseLegs(w.AmountIDR)
	if err != nil {
		return err
	}
	jref := ledger.JournalReferenceWithdrawalRelease(w.ID)
	jid := "lj_" + s.IDs.New()
	storeID := ""
	if w.StoreID != nil {
		storeID = *w.StoreID
	}
	_, err = s.Ledger.Store.PostJournal(txCtx, PostJournalParams{
		JournalID:        jid,
		MerchantID:       w.MerchantID,
		StoreID:          storeID,
		PaymentMode:      w.PaymentMode,
		Source:           w.Source,
		TemplateCode:     ledger.TemplateWithdrawalRelease,
		ReferenceType:    "WITHDRAWAL",
		ReferenceID:      w.ID,
		JournalReference: jref,
		IdempotencyKey:   jref,
		Description:      "Withdrawal release " + w.ID,
		MerchantNetIDR:   &w.AmountIDR,
		PostedAt:         now,
		Legs:             legs,
	})
	if err != nil {
		return err
	}
	// Restore lots
	allocs, _ := s.Store.ListAllocations(txCtx, w.ID)
	for _, a := range allocs {
		_ = s.Ledger.Store.RestoreLotRemaining(txCtx, a.SettlementLotID, a.AmountIDR, now)
	}
	w.ReleaseJournalID = &jid
	w.ReserveReleased = true
	return nil
}

// ResolveUnknownOutcome looks up the same provider reference; never creates a second payout.
func (s *WithdrawalService) ResolveUnknownOutcome(ctx context.Context, withdrawalID string) error {
	w, err := s.Store.GetWithdrawal(ctx, withdrawalID)
	if err != nil {
		return err
	}
	if w.Status != withdrawals.StatusUnknownOutcome && w.Status != withdrawals.StatusProcessing {
		return nil
	}
	ref := ""
	if w.ProviderDisbursementReference != nil {
		ref = *w.ProviderDisbursementReference
		if strings.HasPrefix(ref, "pending:") {
			// Resolve via external id on fake
			ext := strings.TrimPrefix(ref, "pending:")
			if getter, ok := s.Disburse.(interface {
				GetDisbursementByExternal(string) (ports.ProviderDisbursement, bool)
			}); ok {
				if d, found := getter.GetDisbursementByExternal(ext); found {
					ref = d.ProviderReference
					return s.applyLookup(ctx, w.ID, d)
				}
			}
			// Still unknown — schedule next lookup
			return s.scheduleLookup(ctx, w.ID)
		}
	}
	if ref == "" && w.ProviderExternalID != nil {
		if getter, ok := s.Disburse.(interface {
			GetDisbursementByExternal(string) (ports.ProviderDisbursement, bool)
		}); ok {
			if d, found := getter.GetDisbursementByExternal(*w.ProviderExternalID); found {
				return s.applyLookup(ctx, w.ID, d)
			}
		}
		return s.scheduleLookup(ctx, w.ID)
	}
	if ref == "" || s.Disburse == nil {
		return s.scheduleLookup(ctx, w.ID)
	}
	d, err := s.Disburse.GetDisbursement(ctx, ref)
	if err != nil {
		return s.scheduleLookup(ctx, w.ID)
	}
	return s.applyLookup(ctx, w.ID, d)
}

func (s *WithdrawalService) applyLookup(ctx context.Context, withdrawalID string, d ports.ProviderDisbursement) error {
	now := s.now()
	// Amount/currency mismatch → quarantine
	w, err := s.Store.GetWithdrawal(ctx, withdrawalID)
	if err != nil {
		return err
	}
	if d.NetAmountIDR > 0 && d.NetAmountIDR != w.NetDisbursementIDR {
		if s.Log != nil {
			s.Log.Info("disbursement mismatch quarantined", "withdrawal_id", withdrawalID)
		}
		return withdrawals.ErrDisbursementMismatch
	}
	switch strings.ToUpper(d.Status) {
	case "COMPLETED", "SUCCEEDED", "SUCCESS":
		return s.completeWithdrawal(ctx, withdrawalID, d.ProviderReference, d.ProviderFeeIDR, now)
	case "FAILED", "REJECTED", "CANCELLED":
		_ = s.bindProviderRef(ctx, withdrawalID, d.ProviderReference, d.ExternalID)
		return s.failAndRelease(ctx, withdrawalID, "provider_"+strings.ToLower(d.Status))
	case "NOT_FOUND":
		// Authoritative not-created only after horizon — keep unknown
		return s.scheduleLookup(ctx, withdrawalID)
	default:
		// PENDING
		return s.Store.WithTx(ctx, func(txCtx context.Context) error {
			w, err := s.Store.LockWithdrawal(txCtx, withdrawalID)
			if err != nil {
				return err
			}
			ref := d.ProviderReference
			if ref != "" {
				w.ProviderDisbursementReference = &ref
			}
			w.Status = withdrawals.StatusProcessing
			w.UpdatedAt = now
			_, err = s.Store.SaveWithdrawal(txCtx, w)
			return err
		})
	}
}

func (s *WithdrawalService) scheduleLookup(ctx context.Context, withdrawalID string) error {
	now := s.now()
	return s.Store.WithTx(ctx, func(txCtx context.Context) error {
		w, err := s.Store.LockWithdrawal(txCtx, withdrawalID)
		if err != nil {
			return err
		}
		w.Status = withdrawals.StatusUnknownOutcome
		w.LookupAttempts++
		// bounded exponential: 30s * 2^min(attempts,6)
		shift := w.LookupAttempts
		if shift > 6 {
			shift = 6
		}
		delay := 30 * time.Second * time.Duration(1<<uint(shift))
		next := now.Add(delay)
		w.NextLookupAt = &next
		w.UpdatedAt = now
		_, err = s.Store.SaveWithdrawal(txCtx, w)
		return err
	})
}

// ResolveDueUnknowns processes bounded unknown-outcome lookups.
func (s *WithdrawalService) ResolveDueUnknowns(ctx context.Context, limit int32) (int, error) {
	if limit <= 0 {
		limit = 20
	}
	list, err := s.Store.ListUnknownDue(ctx, s.now(), limit)
	if err != nil {
		return 0, err
	}
	n := 0
	for _, w := range list {
		if err := s.ResolveUnknownOutcome(ctx, w.ID); err == nil {
			n++
		}
	}
	return n, nil
}

// ---------- Admin review ----------

// AdminReview applies approve/hold/reject (permission at HTTP; reason required; no MFA).
// Approve is safe to retry: already-approved / in-flight statuses skip double disbursement.
func (s *WithdrawalService) AdminReview(ctx context.Context, withdrawalID, action, reason, actorID string) (withdrawals.Withdrawal, error) {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return withdrawals.Withdrawal{}, apperr.Validation(apperr.CodeValidationFailed, "reason is required")
	}
	if strings.TrimSpace(actorID) == "" {
		return withdrawals.Withdrawal{}, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required")
	}
	now := s.now()
	var out withdrawals.Withdrawal
	err := s.Store.WithTx(ctx, func(txCtx context.Context) error {
		w, err := s.Store.LockWithdrawal(txCtx, withdrawalID)
		if err != nil {
			return err
		}
		// Idempotent approve: already past review → return current row (disburse path is separately idempotent).
		act := strings.ToLower(strings.TrimSpace(action))
		if act == "approve" {
			switch w.Status {
			case withdrawals.StatusApproved, withdrawals.StatusProcessing,
				withdrawals.StatusCompleted, withdrawals.StatusUnknownOutcome,
				withdrawals.StatusFailed:
				out = w
				return nil
			}
		}
		switch act {
		case "approve":
			if !withdrawals.CanTransition(w.Status, withdrawals.StatusApproved) {
				return withdrawals.ErrInvalidStatus
			}
			w.Status = withdrawals.StatusApproved
			w.ReviewReason = reason
			w.ReviewedBy = &actorID
			w.ReviewedAt = &now
		case "hold":
			if !withdrawals.CanTransition(w.Status, withdrawals.StatusHeld) {
				return withdrawals.ErrInvalidStatus
			}
			w.Status = withdrawals.StatusHeld
			w.HoldReason = reason
			w.ReviewedBy = &actorID
			w.ReviewedAt = &now
		case "reject":
			if !withdrawals.CanTransition(w.Status, withdrawals.StatusRejected) {
				return withdrawals.ErrInvalidStatus
			}
			if !w.ReserveReleased {
				if err := s.releaseReserve(txCtx, &w, now); err != nil {
					return err
				}
			}
			w.Status = withdrawals.StatusRejected
			w.RejectReason = reason
			w.ReviewedBy = &actorID
			w.ReviewedAt = &now
		default:
			return apperr.Validation(apperr.CodeValidationFailed, "action must be approve|hold|reject")
		}
		w.UpdatedAt = now
		saved, err := s.Store.SaveWithdrawal(txCtx, w)
		out = saved
		return err
	})
	if err != nil {
		return withdrawals.Withdrawal{}, err
	}
	if out.Status == withdrawals.StatusApproved {
		_ = s.DisburseWithdrawal(ctx, out.ID)
		refreshed, gerr := s.Store.GetWithdrawal(ctx, out.ID)
		if gerr == nil {
			out = refreshed
		}
	}
	return s.withAllocations(ctx, out)
}

// GetWithdrawal returns one withdrawal with allocations.
func (s *WithdrawalService) GetWithdrawal(ctx context.Context, storeID, withdrawalID string) (withdrawals.Withdrawal, error) {
	merchantID, err := s.resolveMerchant(ctx, storeID)
	if err != nil {
		return withdrawals.Withdrawal{}, err
	}
	w, err := s.Store.GetWithdrawal(ctx, withdrawalID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return withdrawals.Withdrawal{}, apperr.NotFound(apperr.CodeResourceNotFound, "Withdrawal not found")
		}
		return withdrawals.Withdrawal{}, err
	}
	if w.MerchantID != merchantID {
		return withdrawals.Withdrawal{}, apperr.NotFound(apperr.CodeResourceNotFound, "Withdrawal not found")
	}
	return s.withAllocations(ctx, w)
}

// ListWithdrawals lists merchant withdrawals.
func (s *WithdrawalService) ListWithdrawals(ctx context.Context, storeID, paymentMode string, cursorAt *time.Time, cursorID *string, limit int32) ([]withdrawals.Withdrawal, error) {
	merchantID, err := s.resolveMerchant(ctx, storeID)
	if err != nil {
		return nil, err
	}
	return s.Store.ListWithdrawalsByMerchant(ctx, merchantID, s.mode(paymentMode), cursorAt, cursorID, limit)
}

// ListAdminWithdrawals is the minimal admin queue.
func (s *WithdrawalService) ListAdminWithdrawals(ctx context.Context, status *string, cursorAt *time.Time, cursorID *string, limit int32) ([]withdrawals.Withdrawal, error) {
	return s.Store.ListWithdrawalsAdmin(ctx, status, cursorAt, cursorID, limit)
}

// AdminGetWithdrawal returns any withdrawal by id.
func (s *WithdrawalService) AdminGetWithdrawal(ctx context.Context, withdrawalID string) (withdrawals.Withdrawal, error) {
	w, err := s.Store.GetWithdrawal(ctx, withdrawalID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return withdrawals.Withdrawal{}, apperr.NotFound(apperr.CodeResourceNotFound, "Withdrawal not found")
		}
		return withdrawals.Withdrawal{}, err
	}
	return s.withAllocations(ctx, w)
}

// HandleDisbursementCallback resolves status from provider webhook payload fields.
// Status should already be normalized (xendit.MapDisburseStatus); applyLookup is
// idempotent for COMPLETED/FAILED (exactly-once journals / reserve release).
//
// Mapping (provider raw or normalized → withdrawal effect):
//
//	COMPLETED | SUCCEEDED | SUCCESS → completeWithdrawal (ledger complete + fee settle)
//	FAILED | REJECTED | CANCELLED   → failAndRelease (release reserve once)
//	PENDING / PROCESSING / UNKNOWN  → bind ref, stay PROCESSING or schedule lookup
//	NOT_FOUND                       → scheduleLookup (no silent balance change)
func (s *WithdrawalService) HandleDisbursementCallback(ctx context.Context, providerRef string, status string, actualFee *int64, netAmount int64) error {
	if providerRef == "" {
		return apperr.Validation(apperr.CodeValidationFailed, "provider reference required")
	}
	if s.Store == nil {
		return apperr.Internal(apperr.CodeInternalError, "Withdrawal store unavailable")
	}
	w, err := s.Store.GetWithdrawalByProviderRef(ctx, withdrawals.ProviderXendit, s.scope(), s.mode(""), providerRef)
	if err != nil {
		// try both modes
		w, err = s.Store.GetWithdrawalByProviderRef(ctx, withdrawals.ProviderXendit, s.scope(), withdrawals.ModeSandbox, providerRef)
		if err != nil {
			w, err = s.Store.GetWithdrawalByProviderRef(ctx, withdrawals.ProviderXendit, s.scope(), withdrawals.ModeLive, providerRef)
			if err != nil {
				return apperr.NotFound(apperr.CodeResourceNotFound, "Withdrawal not found for provider reference")
			}
		}
	}
	d := ports.ProviderDisbursement{
		ProviderReference: providerRef,
		Status:            status,
		NetAmountIDR:      netAmount,
		ProviderFeeIDR:    actualFee,
		Currency:          "IDR",
	}
	if d.NetAmountIDR == 0 {
		d.NetAmountIDR = w.NetDisbursementIDR
	}
	return s.applyLookup(ctx, w.ID, d)
}

// Ensure fee calculator path used for tests.
var _ = platform.CalculateWithdrawalFee
