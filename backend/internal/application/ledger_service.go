package application

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/ledger"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/platform"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// LedgerService owns unified wallet posting, balance reads, and rebuild (BE-340).
type LedgerService struct {
	Store       LedgerStore
	IDs         ports.IDGenerator
	Clock       ports.Clock
	Log         ports.Logger
	// ForceImmediateRelease when true (local/test) posts capture+release with delay 0.
	ForceImmediateRelease bool
	// DefaultPaymentMode for seller reads when not specified (SANDBOX|LIVE).
	DefaultPaymentMode string
}

// PostPaymentCapture posts PAYMENT_CAPTURE (+ optional SETTLEMENT_RELEASE) and settlement lot.
// Idempotent on journal_reference PAYMENT_CAPTURE:{payment_intent_id}.
func (s *LedgerService) PostPaymentCapture(ctx context.Context, in ledger.PaymentCaptureInput) (captureJournalID string, lotID string, err error) {
	if s.Store == nil {
		return "", "", apperr.Internal(apperr.CodeInternalError, "Ledger unavailable")
	}
	if in.MerchantID == "" || in.PaymentIntentID == "" {
		return "", "", apperr.Validation(apperr.CodeValidationFailed, "merchant and payment intent required")
	}
	if in.GrossIDR <= 0 || in.MerchantNetIDR <= 0 {
		return "", "", apperr.Validation(apperr.CodeValidationFailed, "gross and net must be positive")
	}
	if in.Source != ledger.SourceStorefront && in.Source != ledger.SourceQRISAPI {
		return "", "", apperr.Validation(apperr.CodeValidationFailed, "source must be STOREFRONT or QRIS_API")
	}
	if in.PaymentMode != ledger.ModeSandbox && in.PaymentMode != ledger.ModeLive {
		return "", "", apperr.Validation(apperr.CodeValidationFailed, "payment_mode must be SANDBOX or LIVE")
	}

	now := in.PostedAt
	if now.IsZero() {
		now = s.now()
	}
	ref := in.JournalReference
	if ref == "" {
		ref = ledger.JournalReferencePaymentCapture(in.PaymentIntentID)
	}
	// Idempotent: already posted
	if existing, gerr := s.Store.GetJournalByReference(ctx, ref); gerr == nil && existing.ID != "" {
		lotID = ""
		if existing.SettlementLotID != nil {
			lotID = *existing.SettlementLotID
		}
		return existing.ID, lotID, nil
	}

	feeP, feeF := in.FeePercentIDR, in.FeeFixedIDR
	if feeP+feeF != in.GrossIDR-in.MerchantNetIDR {
		feeP, feeF = ledger.SplitFeeComponents(in.GrossIDR-in.MerchantNetIDR, feeP, feeF)
	}

	delay, _ := s.Store.SettlementDelaySeconds(ctx)
	immediate := in.ImmediateRelease || s.ForceImmediateRelease || delay <= 0
	if immediate {
		delay = 0
	}
	availableAt := in.AvailableAt
	if availableAt.IsZero() {
		availableAt = ledger.ComputeAvailableAt(now, delay)
	}

	journalID := in.JournalID
	if journalID == "" {
		journalID = "lj_" + s.IDs.New()
	}
	lotID = in.LotID
	if lotID == "" {
		lotID = "lot_" + s.IDs.New()
	}
	releaseID := in.ReleaseJournalID
	if releaseID == "" && immediate {
		releaseID = "lj_" + s.IDs.New()
	}

	legs, err := ledger.BuildPaymentCaptureLegs(in.GrossIDR, feeP, feeF, in.MerchantNetIDR, lotID, availableAt)
	if err != nil {
		return "", "", apperr.Validation(apperr.CodeValidationFailed, err.Error())
	}

	idem := in.IdempotencyKey
	if idem == "" {
		idem = ref
	}
	desc := in.Description
	if desc == "" {
		desc = "Payment capture " + in.PaymentIntentID
	}

	var storePtr *string
	if in.StoreID != "" {
		storePtr = &in.StoreID
	}
	intentID := in.PaymentIntentID
	orderID := in.OrderID

	err = s.Store.WithTx(ctx, func(ctx context.Context) error {
		// Create lot first (PENDING or AVAILABLE)
		status := ledger.LotPending
		remaining := int64(0) // pending not withdrawable until release
		if immediate {
			status = ledger.LotAvailable
			remaining = in.MerchantNetIDR
		}
		_, ierr := s.Store.InsertSettlementLot(ctx, ledger.SettlementLot{
			ID:                 lotID,
			MerchantID:         in.MerchantID,
			StoreID:            storePtr,
			PaymentMode:        in.PaymentMode,
			Source:             in.Source,
			PaymentIntentID:    &intentID,
			OrderID:            strPtr(orderID),
			OriginalAmountIDR:  in.MerchantNetIDR,
			RemainingAmountIDR: remaining,
			Currency:           ledger.CurrencyIDR,
			Status:             status,
			AvailableAt:        availableAt,
			CreatedAt:          now,
			UpdatedAt:          now,
		})
		if ierr != nil {
			// concurrent insert of same intent lot
			if lot, gerr := s.Store.GetLotByIntent(ctx, intentID); gerr == nil {
				lotID = lot.ID
			} else {
				return ierr
			}
			// rebuild legs with actual lot id
			legs, ierr = ledger.BuildPaymentCaptureLegs(in.GrossIDR, feeP, feeF, in.MerchantNetIDR, lotID, availableAt)
			if ierr != nil {
				return ierr
			}
		}

		gross, fp, ff, net := in.GrossIDR, feeP, feeF, in.MerchantNetIDR
		jid, perr := s.Store.PostJournal(ctx, PostJournalParams{
			JournalID:        journalID,
			MerchantID:       in.MerchantID,
			StoreID:          in.StoreID,
			PaymentMode:      in.PaymentMode,
			Source:           in.Source,
			TemplateCode:     ledger.TemplatePaymentCapture,
			ReferenceType:    "PAYMENT_INTENT",
			ReferenceID:      in.PaymentIntentID,
			JournalReference: ref,
			IdempotencyKey:   idem,
			Description:      desc,
			PaymentIntentID:  in.PaymentIntentID,
			OrderID:          in.OrderID,
			SettlementLotID:  lotID,
			FeeSnapshotID:    in.FeeSnapshotID,
			GrossIDR:         &gross,
			FeePercentIDR:    &fp,
			FeeFixedIDR:      &ff,
			MerchantNetIDR:   &net,
			PostedAt:         now,
			Legs:             legs,
		})
		if perr != nil {
			return perr
		}
		captureJournalID = jid

		capStatus := ledger.LotPending
		capRemaining := int64(0)
		if immediate {
			capStatus = ledger.LotAvailable
			capRemaining = in.MerchantNetIDR
		}
		if err := s.Store.UpdateLotAfterCapture(ctx, lotID, jid, capStatus, capRemaining, now); err != nil {
			return err
		}

		if immediate {
			relLegs, rerr := ledger.BuildSettlementReleaseLegs(in.MerchantNetIDR, lotID, availableAt)
			if rerr != nil {
				return rerr
			}
			relRef := ledger.JournalReferenceSettlementRelease(in.PaymentIntentID)
			_, rerr = s.Store.PostJournal(ctx, PostJournalParams{
				JournalID:        releaseID,
				MerchantID:       in.MerchantID,
				StoreID:          in.StoreID,
				PaymentMode:      in.PaymentMode,
				Source:           in.Source,
				TemplateCode:     ledger.TemplateSettlementRelease,
				ReferenceType:    "PAYMENT_INTENT",
				ReferenceID:      in.PaymentIntentID,
				JournalReference: relRef,
				IdempotencyKey:   relRef,
				Description:      "Settlement release " + in.PaymentIntentID,
				PaymentIntentID:  in.PaymentIntentID,
				OrderID:          in.OrderID,
				SettlementLotID:  lotID,
				MerchantNetIDR:   &net,
				PostedAt:         now,
				Legs:             relLegs,
			})
			if rerr != nil {
				return rerr
			}
			if err := s.Store.UpdateLotAfterRelease(ctx, lotID, releaseID, ledger.LotAvailable, in.MerchantNetIDR, now); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		// race: already captured
		if existing, gerr := s.Store.GetJournalByReference(ctx, ref); gerr == nil {
			if existing.SettlementLotID != nil {
				return existing.ID, *existing.SettlementLotID, nil
			}
			return existing.ID, lotID, nil
		}
		return "", "", err
	}
	return captureJournalID, lotID, nil
}

// ReleaseDueSettlements posts SETTLEMENT_RELEASE for pending lots whose available_at has passed.
func (s *LedgerService) ReleaseDueSettlements(ctx context.Context, limit int32) (int, error) {
	if s.Store == nil {
		return 0, nil
	}
	now := s.now()
	lots, err := s.Store.ListDuePendingLots(ctx, now, limit)
	if err != nil {
		return 0, err
	}
	n := 0
	for _, lot := range lots {
		if err := s.releaseLot(ctx, lot, now); err != nil {
			if s.Log != nil {
				s.Log.Warn("settlement release failed", "lot_id", lot.ID, "err", err.Error())
			}
			continue
		}
		n++
	}
	return n, nil
}

func (s *LedgerService) releaseLot(ctx context.Context, lot ledger.SettlementLot, now time.Time) error {
	if lot.PaymentIntentID == nil {
		return fmt.Errorf("lot missing payment intent")
	}
	relRef := ledger.JournalReferenceSettlementRelease(*lot.PaymentIntentID)
	if existing, err := s.Store.GetJournalByReference(ctx, relRef); err == nil && existing.ID != "" {
		return s.Store.UpdateLotAfterRelease(ctx, lot.ID, existing.ID, ledger.LotAvailable, lot.OriginalAmountIDR, now)
	}
	releaseID := "lj_" + s.IDs.New()
	legs, err := ledger.BuildSettlementReleaseLegs(lot.OriginalAmountIDR, lot.ID, lot.AvailableAt)
	if err != nil {
		return err
	}
	net := lot.OriginalAmountIDR
	storeID := ""
	if lot.StoreID != nil {
		storeID = *lot.StoreID
	}
	orderID := ""
	if lot.OrderID != nil {
		orderID = *lot.OrderID
	}
	return s.Store.WithTx(ctx, func(ctx context.Context) error {
		jid, err := s.Store.PostJournal(ctx, PostJournalParams{
			JournalID:        releaseID,
			MerchantID:       lot.MerchantID,
			StoreID:          storeID,
			PaymentMode:      lot.PaymentMode,
			Source:           lot.Source,
			TemplateCode:     ledger.TemplateSettlementRelease,
			ReferenceType:    "PAYMENT_INTENT",
			ReferenceID:      *lot.PaymentIntentID,
			JournalReference: relRef,
			IdempotencyKey:   relRef,
			Description:      "Settlement release " + *lot.PaymentIntentID,
			PaymentIntentID:  *lot.PaymentIntentID,
			OrderID:          orderID,
			SettlementLotID:  lot.ID,
			MerchantNetIDR:   &net,
			PostedAt:         now,
			Legs:             legs,
		})
		if err != nil {
			return err
		}
		return s.Store.UpdateLotAfterRelease(ctx, lot.ID, jid, ledger.LotAvailable, lot.OriginalAmountIDR, now)
	})
}

// GetFinanceSummary returns unified balance + source breakdown for a store.
func (s *LedgerService) GetFinanceSummary(ctx context.Context, actorUserID, storeID, paymentMode string) (ledger.FinanceSummary, error) {
	if paymentMode == "" {
		paymentMode = s.defaultMode()
	}
	_, merchantID, err := s.Store.GetStoreMerchant(ctx, storeID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return ledger.FinanceSummary{}, apperr.NotFound(apperr.CodeResourceNotFound, "Store not found")
		}
		return ledger.FinanceSummary{}, err
	}
	_ = actorUserID // membership enforced by route permission + store scope in handlers later

	bal, err := s.Store.GetBalance(ctx, merchantID, paymentMode)
	if err != nil {
		return ledger.FinanceSummary{}, err
	}
	sources, err := s.Store.ListSourceBalances(ctx, merchantID, paymentMode)
	if err != nil {
		return ledger.FinanceSummary{}, err
	}
	srcMap := map[string]ledger.SourceAmounts{
		ledger.SourceStorefront: {},
		ledger.SourceQRISAPI:    {},
	}
	for _, sb := range sources {
		srcMap[sb.Source] = ledger.SourceAmounts{
			AvailableAmount: sb.AvailableIDR,
			PendingAmount:   sb.PendingIDR,
		}
	}
	policy := platform.LaunchFeePolicy()
	return ledger.FinanceSummary{
		StoreID:                storeID,
		MerchantID:             merchantID,
		PaymentMode:            paymentMode,
		AvailableAmount:        bal.AvailableIDR,
		PendingAmount:          bal.PendingIDR,
		HeldAmount:             bal.HeldIDR,
		LifetimeGrossAmount:    bal.LifetimeGrossIDR,
		MonthGrossAmount:       bal.MonthGrossIDR,
		MonthPlatformFeeAmount: bal.MonthFeePercentIDR,
		MonthProviderFeeAmount: bal.MonthFeeFixedIDR,
		MonthNetAmount:         bal.MonthNetIDR,
		Sources:                srcMap,
		Currency:               ledger.CurrencyIDR,
		AsOf:                   s.now(),
		FeePolicy: ledger.FeePolicyView{
			TransactionPercentBps: policy.TransactionPercentBps,
			TransactionFixedIDR:   policy.TransactionFixedIDR,
			WithdrawalPercentBps:  policy.WithdrawalPercentBps,
			MinimumWithdrawalIDR:  policy.MinimumWithdrawalIDR,
		},
		WithdrawalAllocationPolicy: "FIFO_AVAILABLE_AT",
	}, nil
}

// ListLedger returns cursor-paginated seller ledger items (merchant-level journals).
func (s *LedgerService) ListLedger(ctx context.Context, storeID, paymentMode string, source *string, cursorAt *time.Time, cursorID *string, limit int32) ([]ledger.LedgerListItem, *time.Time, *string, bool, error) {
	if paymentMode == "" {
		paymentMode = s.defaultMode()
	}
	_, merchantID, err := s.Store.GetStoreMerchant(ctx, storeID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return nil, nil, nil, false, apperr.NotFound(apperr.CodeResourceNotFound, "Store not found")
		}
		return nil, nil, nil, false, err
	}
	if limit <= 0 {
		limit = 50
	}
	fetch := limit + 1
	journals, err := s.Store.ListJournals(ctx, LedgerListFilter{
		MerchantID:  merchantID,
		PaymentMode: paymentMode,
		Source:      source,
		CursorAt:    cursorAt,
		CursorID:    cursorID,
		Limit:       fetch,
	})
	if err != nil {
		return nil, nil, nil, false, err
	}
	hasMore := int32(len(journals)) > limit
	if hasMore {
		journals = journals[:limit]
	}
	items := make([]ledger.LedgerListItem, 0, len(journals))
	for _, j := range journals {
		items = append(items, journalToListItem(j, storeID))
	}
	var nextAt *time.Time
	var nextID *string
	if hasMore && len(journals) > 0 {
		last := journals[len(journals)-1]
		t := last.PostedAt
		nextAt = &t
		id := last.ID
		nextID = &id
	}
	return items, nextAt, nextID, hasMore, nil
}

// ListRevenue returns daily revenue points for the store merchant.
func (s *LedgerService) ListRevenue(ctx context.Context, storeID, paymentMode string, days int) ([]ledger.RevenuePoint, error) {
	if paymentMode == "" {
		paymentMode = s.defaultMode()
	}
	if days <= 0 {
		days = 30
	}
	if days > 90 {
		days = 90
	}
	_, merchantID, err := s.Store.GetStoreMerchant(ctx, storeID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return nil, apperr.NotFound(apperr.CodeResourceNotFound, "Store not found")
		}
		return nil, err
	}
	now := s.now()
	from := now.AddDate(0, 0, -days).UTC().Truncate(24 * time.Hour)
	return s.Store.RevenueByDay(ctx, merchantID, paymentMode, from, now.Add(24*time.Hour))
}

// RebuildBalances rebuilds projection from journals and returns whether it matches.
func (s *LedgerService) RebuildBalances(ctx context.Context, merchantID, paymentMode string) (ledger.Balance, ledger.Balance, bool, error) {
	before, err := s.Store.GetBalance(ctx, merchantID, paymentMode)
	if err != nil {
		return ledger.Balance{}, ledger.Balance{}, false, err
	}
	if err := s.Store.RebuildBalances(ctx, merchantID, paymentMode); err != nil {
		return before, ledger.Balance{}, false, err
	}
	after, err := s.Store.GetBalance(ctx, merchantID, paymentMode)
	if err != nil {
		return before, ledger.Balance{}, false, err
	}
	match := before.AvailableIDR == after.AvailableIDR &&
		before.PendingIDR == after.PendingIDR &&
		before.HeldIDR == after.HeldIDR &&
		before.LifetimeNetIDR == after.LifetimeNetIDR
	return before, after, match, nil
}

// PreviewWithdrawalAllocation is a BE-350 helper: FIFO snapshot without debit.
func (s *LedgerService) PreviewWithdrawalAllocation(ctx context.Context, merchantID, paymentMode string, amountIDR int64) (ledger.WithdrawalAllocation, error) {
	lots, err := s.Store.ListAvailableLots(ctx, merchantID, paymentMode)
	if err != nil {
		return ledger.WithdrawalAllocation{}, err
	}
	return ledger.AllocateWithdrawalFIFO(amountIDR, lots)
}

// VerifySourceTotalsSum checks STOREFRONT+QRIS_API sum to unified.
func (s *LedgerService) VerifySourceTotalsSum(ctx context.Context, merchantID, paymentMode string) (bool, error) {
	bal, err := s.Store.GetBalance(ctx, merchantID, paymentMode)
	if err != nil {
		return false, err
	}
	sources, err := s.Store.ListSourceBalances(ctx, merchantID, paymentMode)
	if err != nil {
		return false, err
	}
	return ledger.SourceTotalsSumEqual(bal, sources), nil
}

func (s *LedgerService) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now().UTC()
	}
	return time.Now().UTC()
}

func (s *LedgerService) defaultMode() string {
	if s.DefaultPaymentMode != "" {
		return s.DefaultPaymentMode
	}
	return ledger.ModeSandbox
}

func journalToListItem(j ledger.Journal, storeID string) ledger.LedgerListItem {
	typ := ledger.ItemTypeAdjustment
	dir := ledger.DirectionCredit
	amount := int64(0)
	if j.MerchantNetIDR != nil {
		amount = *j.MerchantNetIDR
	}
	switch j.TemplateCode {
	case ledger.TemplatePaymentCapture:
		typ = ledger.ItemTypeSale
		dir = ledger.DirectionCredit
	case ledger.TemplateSettlementRelease:
		typ = ledger.ItemTypeRelease
		dir = ledger.DirectionCredit
	case ledger.TemplateWithdrawalReserve, ledger.TemplateWithdrawalComplete:
		typ = ledger.ItemTypeWithdrawal
		dir = ledger.DirectionDebit
	}
	desc := j.Description
	if desc == "" {
		desc = j.TemplateCode
	}
	sid := storeID
	if j.StoreID != nil && *j.StoreID != "" {
		sid = *j.StoreID
	}
	return ledger.LedgerListItem{
		ID:           j.ID,
		StoreID:      sid,
		Type:         typ,
		Description:  desc,
		Amount:       amount,
		Direction:    dir,
		Source:       j.Source,
		OccurredAt:   j.PostedAt,
		OrderID:      j.OrderID,
		JournalID:    j.ID,
		TemplateCode: j.TemplateCode,
	}
}

// NormalizePaymentMode maps query values.
func NormalizePaymentMode(raw string) string {
	switch strings.ToUpper(strings.TrimSpace(raw)) {
	case ledger.ModeLive:
		return ledger.ModeLive
	default:
		return ledger.ModeSandbox
	}
}
