package platform

import (
	"math"
)

// CurrencyIDR is the only launch currency (whole rupiah, zero fractional digits).
const CurrencyIDR = "IDR"

// Money is a whole-rupiah IDR amount (int64). Never use float for money decisions.
type Money int64

// Int64 returns the raw whole-rupiah value.
func (m Money) Int64() int64 { return int64(m) }

// IsPositive reports m > 0.
func (m Money) IsPositive() bool { return m > 0 }

// IsNonNegative reports m >= 0.
func (m Money) IsNonNegative() bool { return m >= 0 }

// Add returns m+o or ErrMoneyOverflow.
func (m Money) Add(o Money) (Money, error) {
	a, b := int64(m), int64(o)
	if b > 0 && a > math.MaxInt64-b {
		return 0, ErrMoneyOverflow
	}
	if b < 0 && a < math.MinInt64-b {
		return 0, ErrMoneyOverflow
	}
	return Money(a + b), nil
}

// Sub returns m-o or ErrMoneyOverflow.
func (m Money) Sub(o Money) (Money, error) {
	a, b := int64(m), int64(o)
	if b > 0 && a < math.MinInt64+b {
		return 0, ErrMoneyOverflow
	}
	if b < 0 && a > math.MaxInt64+b {
		return 0, ErrMoneyOverflow
	}
	return Money(a - b), nil
}

// MulNonNeg multiplies non-negative a*b with overflow check.
func MulNonNeg(a, b int64) (int64, error) {
	if a < 0 || b < 0 {
		return 0, ErrNegativeMoney
	}
	if a == 0 || b == 0 {
		return 0, nil
	}
	if a > math.MaxInt64/b {
		return 0, ErrMoneyOverflow
	}
	return a * b, nil
}

// RoundHalfUpBps computes round_half_up(amount * bps / 10_000) for non-negative integers.
// Equivalent checked form: (amount*bps + 5_000) / 10_000.
func RoundHalfUpBps(amount, bps int64) (int64, error) {
	if amount < 0 || bps < 0 {
		return 0, ErrNegativeMoney
	}
	if amount == 0 || bps == 0 {
		return 0, nil
	}
	prod, err := MulNonNeg(amount, bps)
	if err != nil {
		return 0, err
	}
	// prod + 5000 overflow check
	const half = int64(5_000)
	if prod > math.MaxInt64-half {
		return 0, ErrMoneyOverflow
	}
	return (prod + half) / 10_000, nil
}
