package platform

import apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"

// Domain error codes for fee/money validation (map to VALIDATION_FAILED).
const (
	CodeFeeInvalidAmount      = "FEE_INVALID_AMOUNT"
	CodeFeeOverflow           = "FEE_OVERFLOW"
	CodeFeeNonPositiveNet     = "FEE_NON_POSITIVE_NET"
	CodeFeeBelowMinWithdrawal = "FEE_BELOW_MIN_WITHDRAWAL"
	CodeFeePaymentOutOfBounds = "FEE_PAYMENT_OUT_OF_BOUNDS"
	CodeFeeNegativeComponent  = "FEE_NEGATIVE_COMPONENT"
	CodeFeePolicyNotFound     = "FEE_POLICY_NOT_FOUND"
)

// Sentinel domain errors (wrapped as AppError at application boundary when needed).
var (
	ErrMoneyOverflow      = apperr.Validation(CodeFeeOverflow, "Money arithmetic overflow")
	ErrNegativeMoney      = apperr.Validation(CodeFeeNegativeComponent, "Negative money component is not allowed")
	ErrInvalidAmount      = apperr.Validation(CodeFeeInvalidAmount, "Amount must be a positive whole-rupiah integer")
	ErrNonPositiveNet     = apperr.Validation(CodeFeeNonPositiveNet, "Net amount must be positive after fees")
	ErrBelowMinWithdrawal = apperr.Validation(CodeFeeBelowMinWithdrawal, "Withdrawal amount is below the minimum")
	ErrPaymentOutOfBounds = apperr.Validation(CodeFeePaymentOutOfBounds, "Payment amount is outside allowed bounds")
	ErrFractionalInput    = apperr.Validation(apperr.CodeValidationFailed, "Amount must be a whole IDR integer")
	ErrPolicyNotFound     = apperr.NotFound(CodeFeePolicyNotFound, "Active fee policy not found")
)
