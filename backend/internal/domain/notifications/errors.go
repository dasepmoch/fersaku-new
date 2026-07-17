package notifications

import apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"

var (
	ErrValidation = apperr.Validation(apperr.CodeValidationFailed, "Validation failed")
	ErrNotFound   = apperr.NotFound(apperr.CodeResourceNotFound, "Resource not found")
	ErrUnsafeCTA  = apperr.Validation(apperr.CodeValidationFailed, "CTA path is not an allowed internal route")
	ErrSuppressed = apperr.Validation(apperr.CodeValidationFailed, "Recipient channel is suppressed")
)
