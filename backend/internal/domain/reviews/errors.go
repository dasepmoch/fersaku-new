package reviews

import apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"

var (
	ErrNotFound            = apperr.NotFound(apperr.CodeResourceNotFound, "Resource not found")
	ErrNotEligible         = apperr.Forbidden(apperr.CodeReviewNotEligible, "Review not eligible")
	ErrAlreadyExists       = apperr.Conflict(apperr.CodeConflict, "Review already exists for this purchase")
	ErrVersionConflict     = apperr.Conflict(apperr.CodeConflict, "Review version conflict")
	ErrInvalidRating       = apperr.Validation(apperr.CodeValidationFailed, "Rating must be 1..5")
	ErrInvalidContent      = apperr.Validation(apperr.CodeValidationFailed, "Invalid review content")
	ErrOrderItemMismatch   = apperr.Validation(apperr.CodeValidationFailed, "Order item does not match review binding")
)
