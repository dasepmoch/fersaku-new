package ledger

import (
	"fmt"
	"time"
)

// BuildPaymentCaptureLegs builds §4.6 payment capture journal legs:
//
//	Dr XENDIT_RECEIVABLE                 G
//	Cr MERCHANT_PENDING                  N
//	Cr PLATFORM_FEE_REVENUE              F_percent
//	Cr PAYMENT_PROCESSING_REVENUE        F_fixed
//
// Zero-valued fee legs are omitted while preserving balance (N + F_percent + F_fixed = G).
func BuildPaymentCaptureLegs(gross, feePercent, feeFixed, merchantNet int64, lotID string, availableAt time.Time) ([]EntryLeg, error) {
	if gross <= 0 {
		return nil, fmt.Errorf("ledger: gross must be positive")
	}
	if merchantNet <= 0 {
		return nil, fmt.Errorf("ledger: merchant net must be positive")
	}
	if feePercent < 0 || feeFixed < 0 {
		return nil, fmt.Errorf("ledger: fee components cannot be negative")
	}
	if feePercent+feeFixed+merchantNet != gross {
		return nil, fmt.Errorf("ledger: fee+net must equal gross (%d+%d+%d != %d)", feePercent, feeFixed, merchantNet, gross)
	}
	legs := []EntryLeg{
		{AccountCode: AcctXenditReceivable, Side: SideDebit, AmountIDR: gross, FeeComponent: FeeGross},
		{
			AccountCode:     AcctMerchantPending,
			Side:            SideCredit,
			AmountIDR:       merchantNet,
			FeeComponent:    FeeMerchantNet,
			SettlementLotID: lotID,
			AvailableAt:     &availableAt,
		},
	}
	if feePercent > 0 {
		legs = append(legs, EntryLeg{
			AccountCode:  AcctPlatformFeeRevenue,
			Side:         SideCredit,
			AmountIDR:    feePercent,
			FeeComponent: FeePercent,
		})
	}
	if feeFixed > 0 {
		legs = append(legs, EntryLeg{
			AccountCode:  AcctPaymentProcessingRevenue,
			Side:         SideCredit,
			AmountIDR:    feeFixed,
			FeeComponent: FeeFixed,
		})
	}
	if err := AssertBalanced(legs); err != nil {
		return nil, err
	}
	return legs, nil
}

// BuildSettlementReleaseLegs moves N from pending to available:
//
//	Dr MERCHANT_PENDING                  N
//	Cr MERCHANT_AVAILABLE                N
func BuildSettlementReleaseLegs(net int64, lotID string, availableAt time.Time) ([]EntryLeg, error) {
	if net <= 0 {
		return nil, fmt.Errorf("ledger: release net must be positive")
	}
	legs := []EntryLeg{
		{
			AccountCode:     AcctMerchantPending,
			Side:            SideDebit,
			AmountIDR:       net,
			FeeComponent:    FeeMerchantNet,
			SettlementLotID: lotID,
		},
		{
			AccountCode:     AcctMerchantAvailable,
			Side:            SideCredit,
			AmountIDR:       net,
			FeeComponent:    FeeMerchantNet,
			SettlementLotID: lotID,
			AvailableAt:     &availableAt,
		},
	}
	return legs, AssertBalanced(legs)
}

// AssertBalanced checks sum(debit)==sum(credit), >=2 positive legs.
func AssertBalanced(legs []EntryLeg) error {
	if len(legs) < 2 {
		return fmt.Errorf("ledger: need at least two legs")
	}
	var d, c int64
	for i, leg := range legs {
		if leg.AmountIDR <= 0 {
			return fmt.Errorf("ledger: leg %d amount must be positive", i)
		}
		switch leg.Side {
		case SideDebit:
			d += leg.AmountIDR
		case SideCredit:
			c += leg.AmountIDR
		default:
			return fmt.Errorf("ledger: leg %d invalid side", i)
		}
	}
	if d != c {
		return fmt.Errorf("ledger: unbalanced debit=%d credit=%d", d, c)
	}
	return nil
}

// JournalReferencePaymentCapture is PAYMENT_CAPTURE:{payment_intent_id}.
func JournalReferencePaymentCapture(paymentIntentID string) string {
	return "PAYMENT_CAPTURE:" + paymentIntentID
}

// JournalReferenceSettlementRelease is SETTLEMENT_RELEASE:{payment_intent_id}.
func JournalReferenceSettlementRelease(paymentIntentID string) string {
	return "SETTLEMENT_RELEASE:" + paymentIntentID
}

// JournalReferenceWithdrawalReserve is WITHDRAWAL_RESERVE:{withdrawal_id}.
func JournalReferenceWithdrawalReserve(withdrawalID string) string {
	return "WITHDRAWAL_RESERVE:" + withdrawalID
}

// JournalReferenceWithdrawalRelease is WITHDRAWAL_RELEASE:{withdrawal_id}.
func JournalReferenceWithdrawalRelease(withdrawalID string) string {
	return "WITHDRAWAL_RELEASE:" + withdrawalID
}

// JournalReferenceWithdrawalComplete is WITHDRAWAL_COMPLETE:{withdrawal_id}.
func JournalReferenceWithdrawalComplete(withdrawalID string) string {
	return "WITHDRAWAL_COMPLETE:" + withdrawalID
}

// JournalReferenceWithdrawalFeeSettle is WITHDRAWAL_FEE_SETTLE:{withdrawal_id}.
func JournalReferenceWithdrawalFeeSettle(withdrawalID string) string {
	return "WITHDRAWAL_FEE_SETTLE:" + withdrawalID
}

// JournalReferenceWithdrawalRecapture is WITHDRAWAL_RECAPTURE:{withdrawal_id}.
func JournalReferenceWithdrawalRecapture(withdrawalID string) string {
	return "WITHDRAWAL_RECAPTURE:" + withdrawalID
}

// BuildWithdrawalReserveLegs moves W from available to clearing:
//
//	Dr MERCHANT_AVAILABLE                W
//	Cr WITHDRAWAL_CLEARING               W
func BuildWithdrawalReserveLegs(amountIDR int64) ([]EntryLeg, error) {
	if amountIDR <= 0 {
		return nil, fmt.Errorf("ledger: reserve amount must be positive")
	}
	legs := []EntryLeg{
		{AccountCode: AcctMerchantAvailable, Side: SideDebit, AmountIDR: amountIDR, FeeComponent: "WITHDRAWAL"},
		{AccountCode: AcctWithdrawalClearing, Side: SideCredit, AmountIDR: amountIDR, FeeComponent: "WITHDRAWAL"},
	}
	return legs, AssertBalanced(legs)
}

// BuildWithdrawalReleaseLegs releases reserve after definitive failure (once):
//
//	Dr WITHDRAWAL_CLEARING               W
//	Cr MERCHANT_AVAILABLE                W
func BuildWithdrawalReleaseLegs(amountIDR int64) ([]EntryLeg, error) {
	if amountIDR <= 0 {
		return nil, fmt.Errorf("ledger: release amount must be positive")
	}
	legs := []EntryLeg{
		{AccountCode: AcctWithdrawalClearing, Side: SideDebit, AmountIDR: amountIDR, FeeComponent: "WITHDRAWAL"},
		{AccountCode: AcctMerchantAvailable, Side: SideCredit, AmountIDR: amountIDR, FeeComponent: "WITHDRAWAL"},
	}
	return legs, AssertBalanced(legs)
}

// BuildWithdrawalCompleteLegs settles locked quote (W = P + Q + N):
//
//	Dr WITHDRAWAL_CLEARING               W
//	Cr PROVIDER_DISBURSEMENT_PAYABLE     Q
//	Cr PLATFORM_FEE_REVENUE              P
//	Cr XENDIT_CASH                       N
func BuildWithdrawalCompleteLegs(amountW, platformP, providerQ, netN int64) ([]EntryLeg, error) {
	if amountW <= 0 || netN <= 0 {
		return nil, fmt.Errorf("ledger: complete amount/net must be positive")
	}
	if platformP < 0 || providerQ < 0 {
		return nil, fmt.Errorf("ledger: fee components cannot be negative")
	}
	if platformP+providerQ+netN != amountW {
		return nil, fmt.Errorf("ledger: P+Q+N must equal W (%d+%d+%d != %d)", platformP, providerQ, netN, amountW)
	}
	legs := []EntryLeg{
		{AccountCode: AcctWithdrawalClearing, Side: SideDebit, AmountIDR: amountW, FeeComponent: "WITHDRAWAL"},
		{AccountCode: AcctXenditCash, Side: SideCredit, AmountIDR: netN, FeeComponent: "WITHDRAWAL"},
	}
	if platformP > 0 {
		legs = append(legs, EntryLeg{
			AccountCode: AcctPlatformFeeRevenue, Side: SideCredit, AmountIDR: platformP, FeeComponent: FeePlatform,
		})
	}
	if providerQ > 0 {
		legs = append(legs, EntryLeg{
			AccountCode: AcctProviderDisbursementPayable, Side: SideCredit, AmountIDR: providerQ, FeeComponent: FeeProvider,
		})
	}
	return legs, AssertBalanced(legs)
}

// BuildProviderFeeSettleEqualLegs when actual A equals quote Q:
//
//	Dr PROVIDER_DISBURSEMENT_PAYABLE     Q
//	Cr XENDIT_CASH                       A (= Q)
func BuildProviderFeeSettleEqualLegs(quoteQ int64) ([]EntryLeg, error) {
	if quoteQ <= 0 {
		return nil, fmt.Errorf("ledger: provider fee settle requires positive quote")
	}
	legs := []EntryLeg{
		{AccountCode: AcctProviderDisbursementPayable, Side: SideDebit, AmountIDR: quoteQ, FeeComponent: FeeProvider},
		{AccountCode: AcctXenditCash, Side: SideCredit, AmountIDR: quoteQ, FeeComponent: FeeProvider},
	}
	return legs, AssertBalanced(legs)
}

// BuildProviderFeeSettleHigherLegs when actual A > quote Q (platform absorbs D=A-Q):
//
//	Dr PROVIDER_DISBURSEMENT_PAYABLE     Q
//	Dr PLATFORM_PROVIDER_SUBSIDY         D
//	Cr XENDIT_CASH                       A
func BuildProviderFeeSettleHigherLegs(quoteQ, actualA int64) ([]EntryLeg, error) {
	if quoteQ <= 0 || actualA <= quoteQ {
		return nil, fmt.Errorf("ledger: higher settle requires actual > quote > 0")
	}
	delta := actualA - quoteQ
	legs := []EntryLeg{
		{AccountCode: AcctProviderDisbursementPayable, Side: SideDebit, AmountIDR: quoteQ, FeeComponent: FeeProvider},
		{AccountCode: AcctPlatformProviderSubsidy, Side: SideDebit, AmountIDR: delta, FeeComponent: "VARIANCE"},
		{AccountCode: AcctXenditCash, Side: SideCredit, AmountIDR: actualA, FeeComponent: FeeProvider},
	}
	return legs, AssertBalanced(legs)
}

// BuildProviderFeeSettleLowerLegs when actual A < quote Q (variance income D=Q-A):
//
//	Dr PROVIDER_DISBURSEMENT_PAYABLE     Q
//	Cr XENDIT_CASH                       A
//	Cr PROVIDER_FEE_VARIANCE_INCOME      D
func BuildProviderFeeSettleLowerLegs(quoteQ, actualA int64) ([]EntryLeg, error) {
	if quoteQ <= 0 || actualA < 0 || actualA >= quoteQ {
		return nil, fmt.Errorf("ledger: lower settle requires 0 <= actual < quote")
	}
	delta := quoteQ - actualA
	legs := []EntryLeg{
		{AccountCode: AcctProviderDisbursementPayable, Side: SideDebit, AmountIDR: quoteQ, FeeComponent: FeeProvider},
	}
	if actualA > 0 {
		legs = append(legs, EntryLeg{
			AccountCode: AcctXenditCash, Side: SideCredit, AmountIDR: actualA, FeeComponent: FeeProvider,
		})
	}
	legs = append(legs, EntryLeg{
		AccountCode: AcctProviderFeeVarianceIncome, Side: SideCredit, AmountIDR: delta, FeeComponent: "VARIANCE",
	})
	return legs, AssertBalanced(legs)
}

// BuildWithdrawalRecaptureLegs for late success after reserve was released (a+r=W):
//
//	Dr MERCHANT_AVAILABLE                a  (omit if 0)
//	Dr MERCHANT_RECOVERY_RECEIVABLE      r  (omit if 0)
//	Cr WITHDRAWAL_CLEARING               W
func BuildWithdrawalRecaptureLegs(availableA, recoveryR, amountW int64) ([]EntryLeg, error) {
	if amountW <= 0 {
		return nil, fmt.Errorf("ledger: recapture amount must be positive")
	}
	if availableA < 0 || recoveryR < 0 {
		return nil, fmt.Errorf("ledger: recapture legs cannot be negative")
	}
	if availableA+recoveryR != amountW {
		return nil, fmt.Errorf("ledger: a+r must equal W (%d+%d != %d)", availableA, recoveryR, amountW)
	}
	if availableA == 0 && recoveryR == 0 {
		return nil, fmt.Errorf("ledger: recapture needs at least one positive leg")
	}
	var legs []EntryLeg
	if availableA > 0 {
		legs = append(legs, EntryLeg{
			AccountCode: AcctMerchantAvailable, Side: SideDebit, AmountIDR: availableA, FeeComponent: "RECOVERY",
		})
	}
	if recoveryR > 0 {
		legs = append(legs, EntryLeg{
			AccountCode: AcctMerchantRecoveryReceivable, Side: SideDebit, AmountIDR: recoveryR, FeeComponent: "RECOVERY",
		})
	}
	legs = append(legs, EntryLeg{
		AccountCode: AcctWithdrawalClearing, Side: SideCredit, AmountIDR: amountW, FeeComponent: "WITHDRAWAL",
	})
	return legs, AssertBalanced(legs)
}

// SplitFeeComponents derives percent/fixed from total fee when snapshot components missing.
// Launch policy: fixed=700 when total>=700, else all percent; remainder is percent.
func SplitFeeComponents(totalFee, preferredPercent, preferredFixed int64) (percent, fixed int64) {
	if preferredPercent >= 0 && preferredFixed >= 0 && preferredPercent+preferredFixed == totalFee {
		return preferredPercent, preferredFixed
	}
	const launchFixed = 700
	if totalFee >= launchFixed {
		return totalFee - launchFixed, launchFixed
	}
	return totalFee, 0
}

// ComputeAvailableAt applies settlement delay (seconds). delay<=0 → immediate (postedAt).
func ComputeAvailableAt(postedAt time.Time, delaySeconds int64) time.Time {
	if delaySeconds <= 0 {
		return postedAt.UTC()
	}
	return postedAt.UTC().Add(time.Duration(delaySeconds) * time.Second)
}
