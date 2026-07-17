package coupons

import apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"

// Domain sentinel errors mapped to stable problem codes.
var (
	ErrNotFound           = apperr.NotFound(apperr.CodeResourceNotFound, "Resource not found")
	ErrCodeInvalid        = apperr.Validation(apperr.CodeValidationFailed, "Invalid coupon code")
	ErrCodeConflict       = apperr.Conflict(apperr.CodeConflict, "Coupon code already exists in this store")
	ErrDiscountInvalid    = apperr.Validation(apperr.CodeValidationFailed, "Invalid discount value")
	ErrKindInvalid        = apperr.Validation(apperr.CodeValidationFailed, "Invalid discount kind")
	ErrScopeInvalid       = apperr.Validation(apperr.CodeValidationFailed, "Invalid product scope")
	ErrStateInvalid       = apperr.Validation(apperr.CodeValidationFailed, "Invalid coupon state transition")
	ErrVersionConflict    = apperr.Conflict(apperr.CodeConflict, "Coupon version conflict")
	ErrLimitInvalid       = apperr.Validation(apperr.CodeValidationFailed, "Invalid usage limit")
	ErrWindowInvalid      = apperr.Validation(apperr.CodeValidationFailed, "Invalid active window")
	ErrProductsRequired   = apperr.Validation(apperr.CodeValidationFailed, "Selected product scope requires product IDs")
	ErrProductNotInStore  = apperr.Validation(apperr.CodeValidationFailed, "Product is not owned by this store")
	ErrCannotActivate     = apperr.Validation(apperr.CodeValidationFailed, "Coupon cannot be activated")
	ErrCannotMutate       = apperr.Validation(apperr.CodeValidationFailed, "Coupon cannot be modified in its current state")
	// Checkout-facing: generic invalid/unavailable (no enumeration).
	ErrCouponUnavailable  = apperr.Validation(apperr.CodeCouponUnavailable, "Coupon is invalid or unavailable")
	ErrReservationLimit   = apperr.Conflict(apperr.CodeCouponLimitExceeded, "Coupon usage limit reached")
	ErrReservationExpired = apperr.Validation(apperr.CodeCouponUnavailable, "Coupon reservation expired")
	ErrReservationState   = apperr.Conflict(apperr.CodeConflict, "Coupon reservation state conflict")
)
