package platform

// TransactionFeeResult is the pure breakdown for a successful payment
// (STOREFRONT and QRIS_API share this global rule).
type TransactionFeeResult struct {
	GrossIDR            int64
	PercentBps          int64
	PercentComponentIDR int64
	FixedComponentIDR   int64
	TotalFeeIDR         int64
	NetIDR              int64
	Currency            string
	PolicyVersionID     string
}

// WithdrawalFeeResult is the pure breakdown for a wallet debit withdrawal.
// amount is merchant wallet debit, not target net received.
type WithdrawalFeeResult struct {
	AmountIDR           int64
	PercentBps          int64
	PlatformFeeIDR      int64
	ProviderFeeIDR      int64
	TotalFeeIDR         int64
	NetDisbursementIDR  int64
	MinimumAmountIDR    int64
	Currency            string
	PolicyVersionID     string
}

// CalculateTransactionFee applies:
//
//	percent = round_half_up(gross * bps / 10_000)
//	fee = percent + fixed
//	net = gross - fee
//
// Rejects non-positive gross, overflow, out-of-bounds (when policy bounds set),
// negative fee components, or non-positive net. Identical for STOREFRONT and QRIS_API.
func CalculateTransactionFee(grossIDR int64, policy FeePolicy) (TransactionFeeResult, error) {
	if grossIDR <= 0 {
		return TransactionFeeResult{}, ErrInvalidAmount
	}
	if policy.TransactionPercentBps < 0 || policy.TransactionFixedIDR < 0 {
		return TransactionFeeResult{}, ErrNegativeMoney
	}
	if policy.MinimumPaymentIDR > 0 && grossIDR < policy.MinimumPaymentIDR {
		return TransactionFeeResult{}, ErrPaymentOutOfBounds
	}
	if policy.MaximumPaymentIDR > 0 && grossIDR > policy.MaximumPaymentIDR {
		return TransactionFeeResult{}, ErrPaymentOutOfBounds
	}

	percent, err := RoundHalfUpBps(grossIDR, policy.TransactionPercentBps)
	if err != nil {
		return TransactionFeeResult{}, err
	}
	fixed := policy.TransactionFixedIDR
	total, err := Money(percent).Add(Money(fixed))
	if err != nil {
		return TransactionFeeResult{}, err
	}
	if total < 0 {
		return TransactionFeeResult{}, ErrNegativeMoney
	}
	net, err := Money(grossIDR).Sub(total)
	if err != nil {
		return TransactionFeeResult{}, err
	}
	if net <= 0 {
		return TransactionFeeResult{}, ErrNonPositiveNet
	}
	return TransactionFeeResult{
		GrossIDR:            grossIDR,
		PercentBps:          policy.TransactionPercentBps,
		PercentComponentIDR: percent,
		FixedComponentIDR:   fixed,
		TotalFeeIDR:         total.Int64(),
		NetIDR:              net.Int64(),
		Currency:            CurrencyIDR,
		PolicyVersionID:     policy.VersionID,
	}, nil
}

// CalculateWithdrawalFee applies:
//
//	platform = round_half_up(amount * bps / 10_000)
//	fee = platform + providerFee
//	net = amount - fee
//
// amount is wallet debit. Rejects amount below minimum, non-positive amount,
// negative provider fee, overflow, or non-positive net disbursement.
func CalculateWithdrawalFee(amountIDR, providerFeeIDR int64, policy FeePolicy) (WithdrawalFeeResult, error) {
	if amountIDR <= 0 {
		return WithdrawalFeeResult{}, ErrInvalidAmount
	}
	if providerFeeIDR < 0 {
		return WithdrawalFeeResult{}, ErrNegativeMoney
	}
	if policy.WithdrawalPercentBps < 0 {
		return WithdrawalFeeResult{}, ErrNegativeMoney
	}
	minWD := policy.MinimumWithdrawalIDR
	if minWD <= 0 {
		minWD = LaunchMinimumWithdrawalIDR
	}
	if amountIDR < minWD {
		return WithdrawalFeeResult{}, ErrBelowMinWithdrawal
	}

	platform, err := RoundHalfUpBps(amountIDR, policy.WithdrawalPercentBps)
	if err != nil {
		return WithdrawalFeeResult{}, err
	}
	total, err := Money(platform).Add(Money(providerFeeIDR))
	if err != nil {
		return WithdrawalFeeResult{}, err
	}
	if total < 0 {
		return WithdrawalFeeResult{}, ErrNegativeMoney
	}
	net, err := Money(amountIDR).Sub(total)
	if err != nil {
		return WithdrawalFeeResult{}, err
	}
	if net <= 0 {
		return WithdrawalFeeResult{}, ErrNonPositiveNet
	}
	return WithdrawalFeeResult{
		AmountIDR:          amountIDR,
		PercentBps:         policy.WithdrawalPercentBps,
		PlatformFeeIDR:     platform,
		ProviderFeeIDR:     providerFeeIDR,
		TotalFeeIDR:        total.Int64(),
		NetDisbursementIDR: net.Int64(),
		MinimumAmountIDR:   minWD,
		Currency:           CurrencyIDR,
		PolicyVersionID:    policy.VersionID,
	}, nil
}

// SameGlobalRuleForSources documents launch invariant: no merchant override.
func SameGlobalRuleForSources(a, b PaymentSource) bool {
	_ = a
	_ = b
	return true
}
