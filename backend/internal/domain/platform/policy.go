package platform

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"
)

// Launch policy identity (ADR-0003). Immutable via admin/runtime mutation.
const (
	PolicyVersionLaunchV1 = "LAUNCH_FEE_POLICY_V1"
	PolicyScopeGlobal     = "GLOBAL"

	LaunchTransactionPercentBps = int64(300) // 3%
	LaunchTransactionFixedIDR   = int64(700)
	LaunchWithdrawalPercentBps  = int64(300) // 3%
	LaunchMinimumWithdrawalIDR  = int64(50_000)
	LaunchMinimumPaymentIDR     = int64(1_000)
	LaunchMaximumPaymentIDR     = int64(100_000_000)
)

// PaymentSource is transaction origin; fee rule is identical for both at launch.
type PaymentSource string

const (
	SourceStorefront PaymentSource = "STOREFRONT"
	SourceQRISAPI    PaymentSource = "QRIS_API"
)

// FeePolicy is an immutable versioned schedule (GLOBAL scope at launch).
type FeePolicy struct {
	VersionID             string
	Scope                 string
	TransactionPercentBps int64
	TransactionFixedIDR   int64
	WithdrawalPercentBps  int64
	MinimumWithdrawalIDR  int64
	MinimumPaymentIDR     int64
	MaximumPaymentIDR     int64
	Checksum              string
	SourceADR             string
	ReleaseReason         string
	Immutable             bool
	EffectiveFrom         time.Time
	EffectiveTo           *time.Time // nil = open-ended
	CreatedAt             time.Time
}

// LaunchFeePolicy returns the canonical in-memory LAUNCH_FEE_POLICY_V1 values.
func LaunchFeePolicy() FeePolicy {
	return FeePolicy{
		VersionID:             PolicyVersionLaunchV1,
		Scope:                 PolicyScopeGlobal,
		TransactionPercentBps: LaunchTransactionPercentBps,
		TransactionFixedIDR:   LaunchTransactionFixedIDR,
		WithdrawalPercentBps:  LaunchWithdrawalPercentBps,
		MinimumWithdrawalIDR:  LaunchMinimumWithdrawalIDR,
		MinimumPaymentIDR:     LaunchMinimumPaymentIDR,
		MaximumPaymentIDR:     LaunchMaximumPaymentIDR,
		Checksum:              LaunchPolicyChecksum(),
		SourceADR:             "ADR-0003",
		ReleaseReason:         "launch immutable fee policy",
		Immutable:             true,
		EffectiveFrom:         time.Date(2026, 7, 16, 0, 0, 0, 0, time.UTC),
	}
}

// LaunchPolicyChecksum is the checksum-verified seed identity for migration.
// Canonical payload (pipe-separated, no spaces):
//
//	version|scope|tx_bps|tx_fixed|wd_bps|min_wd|min_pay|max_pay
func LaunchPolicyChecksum() string {
	payload := fmt.Sprintf("%s|%s|%d|%d|%d|%d|%d|%d",
		PolicyVersionLaunchV1,
		PolicyScopeGlobal,
		LaunchTransactionPercentBps,
		LaunchTransactionFixedIDR,
		LaunchWithdrawalPercentBps,
		LaunchMinimumWithdrawalIDR,
		LaunchMinimumPaymentIDR,
		LaunchMaximumPaymentIDR,
	)
	sum := sha256.Sum256([]byte(payload))
	return hex.EncodeToString(sum[:])
}

// MatchesLaunchInvariant reports whether p equals launch numeric invariants.
func (p FeePolicy) MatchesLaunchInvariant() bool {
	return p.VersionID == PolicyVersionLaunchV1 &&
		p.Scope == PolicyScopeGlobal &&
		p.TransactionPercentBps == LaunchTransactionPercentBps &&
		p.TransactionFixedIDR == LaunchTransactionFixedIDR &&
		p.WithdrawalPercentBps == LaunchWithdrawalPercentBps &&
		p.MinimumWithdrawalIDR == LaunchMinimumWithdrawalIDR &&
		p.MinimumPaymentIDR == LaunchMinimumPaymentIDR &&
		p.MaximumPaymentIDR == LaunchMaximumPaymentIDR &&
		p.Immutable &&
		p.Checksum == LaunchPolicyChecksum()
}

// IsEffectiveAt reports whether policy covers at (inclusive start, exclusive end when set).
func (p FeePolicy) IsEffectiveAt(at time.Time) bool {
	at = at.UTC()
	if at.Before(p.EffectiveFrom.UTC()) {
		return false
	}
	if p.EffectiveTo != nil && !at.Before(p.EffectiveTo.UTC()) {
		return false
	}
	return true
}

// FeeSnapshot is an immutable creation-time fee capture for payments/withdrawals.
// Selected at intent/order creation; travels unchanged through callback/ledger.
type FeeSnapshot struct {
	ID                  string
	PolicyVersionID     string
	Scope               string
	Kind                SnapshotKind
	Source              PaymentSource // empty for withdrawal
	GrossOrAmountIDR    int64
	PercentBps          int64
	PercentComponentIDR int64
	FixedComponentIDR   int64 // transaction fixed; 0 for withdrawal platform part
	ProviderFeeIDR      int64 // withdrawal provider processing; 0 for payment
	TotalFeeIDR         int64
	NetIDR              int64
	Currency            string
	Checksum            string
	CreatedAt           time.Time
}

// SnapshotKind distinguishes payment vs withdrawal snapshots.
type SnapshotKind string

const (
	SnapshotTransaction SnapshotKind = "TRANSACTION"
	SnapshotWithdrawal  SnapshotKind = "WITHDRAWAL"
)

// BuildTransactionSnapshot freezes calculator output under a policy version.
func BuildTransactionSnapshot(policy FeePolicy, source PaymentSource, res TransactionFeeResult, at time.Time) FeeSnapshot {
	return FeeSnapshot{
		PolicyVersionID:     policy.VersionID,
		Scope:               policy.Scope,
		Kind:                SnapshotTransaction,
		Source:              source,
		GrossOrAmountIDR:    res.GrossIDR,
		PercentBps:          res.PercentBps,
		PercentComponentIDR: res.PercentComponentIDR,
		FixedComponentIDR:   res.FixedComponentIDR,
		ProviderFeeIDR:      0,
		TotalFeeIDR:         res.TotalFeeIDR,
		NetIDR:              res.NetIDR,
		Currency:            CurrencyIDR,
		Checksum:            policy.Checksum,
		CreatedAt:           at.UTC(),
	}
}

// BuildWithdrawalSnapshot freezes withdrawal calculator output.
func BuildWithdrawalSnapshot(policy FeePolicy, res WithdrawalFeeResult, at time.Time) FeeSnapshot {
	return FeeSnapshot{
		PolicyVersionID:     policy.VersionID,
		Scope:               policy.Scope,
		Kind:                SnapshotWithdrawal,
		GrossOrAmountIDR:    res.AmountIDR,
		PercentBps:          res.PercentBps,
		PercentComponentIDR: res.PlatformFeeIDR,
		FixedComponentIDR:   0,
		ProviderFeeIDR:      res.ProviderFeeIDR,
		TotalFeeIDR:         res.TotalFeeIDR,
		NetIDR:              res.NetDisbursementIDR,
		Currency:            CurrencyIDR,
		Checksum:            policy.Checksum,
		CreatedAt:           at.UTC(),
	}
}
