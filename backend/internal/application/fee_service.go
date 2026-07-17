package application

import (
	"context"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/platform"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// FeeService exposes active policy read and pure calculator preview (BE-300).
// There is no publish/mutate method — future policy versions require ADR + migration.
type FeeService struct {
	Store FeeStore
	IDs   ports.IDGenerator
	Clock ports.Clock
	Log   ports.Logger
}

// ActivePolicy returns the effective GLOBAL fee policy at now (or clock).
func (s *FeeService) ActivePolicy(ctx context.Context) (platform.FeePolicy, error) {
	at := s.now()
	if s.Store == nil {
		// Unit-test / no-DB path: launch constants only.
		p := platform.LaunchFeePolicy()
		if !p.IsEffectiveAt(at) {
			return platform.FeePolicy{}, platform.ErrPolicyNotFound
		}
		return p, nil
	}
	p, err := s.Store.GetActivePolicy(ctx, at)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return platform.FeePolicy{}, platform.ErrPolicyNotFound
		}
		return platform.FeePolicy{}, apperr.Wrap(apperr.KindInternal, apperr.CodeInternalError, "Failed to load fee policy", err)
	}
	return p, nil
}

// PreviewRequest is pure calculator input (admin preview; never persists).
type PreviewRequest struct {
	// Kind: "transaction" | "withdrawal" (required).
	Kind string
	// AmountIDR is gross for transaction, wallet debit for withdrawal.
	AmountIDR int64
	// ProviderFeeIDR required for withdrawal when Kind=withdrawal (may be 0).
	ProviderFeeIDR int64
	// Source optional for documentation; does not change math.
	Source platform.PaymentSource
}

// PreviewResult is the pure calculation under the active (launch) policy.
type PreviewResult struct {
	PolicyVersionID string
	Kind            string
	Source          string
	Transaction     *platform.TransactionFeeResult `json:"transaction,omitempty"`
	Withdrawal      *platform.WithdrawalFeeResult  `json:"withdrawal,omitempty"`
}

// Preview runs the production calculator without persisting or activating anything.
func (s *FeeService) Preview(ctx context.Context, req PreviewRequest) (PreviewResult, error) {
	policy, err := s.ActivePolicy(ctx)
	if err != nil {
		return PreviewResult{}, err
	}
	// Always report active version; launch is LAUNCH_FEE_POLICY_V1.
	switch req.Kind {
	case "transaction", "TRANSACTION", "payment", "PAYMENT":
		src := req.Source
		if src == "" {
			src = platform.SourceStorefront
		}
		res, err := platform.CalculateTransactionFee(req.AmountIDR, policy)
		if err != nil {
			return PreviewResult{}, err
		}
		return PreviewResult{
			PolicyVersionID: policy.VersionID,
			Kind:            "transaction",
			Source:          string(src),
			Transaction:     &res,
		}, nil
	case "withdrawal", "WITHDRAWAL":
		res, err := platform.CalculateWithdrawalFee(req.AmountIDR, req.ProviderFeeIDR, policy)
		if err != nil {
			return PreviewResult{}, err
		}
		return PreviewResult{
			PolicyVersionID: policy.VersionID,
			Kind:            "withdrawal",
			Withdrawal:      &res,
		}, nil
	default:
		return PreviewResult{}, apperr.Validation(apperr.CodeValidationFailed, "kind must be transaction or withdrawal")
	}
}

// CalculateTransaction is the single pure path for checkout/gateway/ledger (BE-310+).
func (s *FeeService) CalculateTransaction(ctx context.Context, grossIDR int64, source platform.PaymentSource) (platform.TransactionFeeResult, platform.FeePolicy, error) {
	policy, err := s.ActivePolicy(ctx)
	if err != nil {
		return platform.TransactionFeeResult{}, platform.FeePolicy{}, err
	}
	_ = source // global rule identical
	res, err := platform.CalculateTransactionFee(grossIDR, policy)
	return res, policy, err
}

// CalculateWithdrawal is the single pure path for withdrawal quotes (BE-350).
func (s *FeeService) CalculateWithdrawal(ctx context.Context, amountIDR, providerFeeIDR int64) (platform.WithdrawalFeeResult, platform.FeePolicy, error) {
	policy, err := s.ActivePolicy(ctx)
	if err != nil {
		return platform.WithdrawalFeeResult{}, platform.FeePolicy{}, err
	}
	res, err := platform.CalculateWithdrawalFee(amountIDR, providerFeeIDR, policy)
	return res, policy, err
}

// SnapshotTransaction freezes a transaction fee at creation time (append-only).
func (s *FeeService) SnapshotTransaction(ctx context.Context, source platform.PaymentSource, res platform.TransactionFeeResult, policy platform.FeePolicy) (platform.FeeSnapshot, error) {
	if s.Store == nil || s.IDs == nil {
		return platform.FeeSnapshot{}, apperr.Internal(apperr.CodeInternalError, "Fee store unavailable")
	}
	snap := platform.BuildTransactionSnapshot(policy, source, res, s.now())
	snap.ID = s.IDs.New()
	return s.Store.InsertSnapshot(ctx, snap)
}

// SnapshotWithdrawal freezes a withdrawal fee at quote/create time.
func (s *FeeService) SnapshotWithdrawal(ctx context.Context, res platform.WithdrawalFeeResult, policy platform.FeePolicy) (platform.FeeSnapshot, error) {
	if s.Store == nil || s.IDs == nil {
		return platform.FeeSnapshot{}, apperr.Internal(apperr.CodeInternalError, "Fee store unavailable")
	}
	snap := platform.BuildWithdrawalSnapshot(policy, res, s.now())
	snap.ID = s.IDs.New()
	return s.Store.InsertSnapshot(ctx, snap)
}

func (s *FeeService) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now().UTC()
	}
	return time.Now().UTC()
}
