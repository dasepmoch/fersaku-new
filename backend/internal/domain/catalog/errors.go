package catalog

import apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"

// Domain sentinel errors mapped to stable problem codes.
var (
	ErrNotFound        = apperr.NotFound(apperr.CodeResourceNotFound, "Resource not found")
	ErrSlugInvalid     = apperr.Validation(apperr.CodeValidationFailed, "Invalid product slug")
	ErrSlugConflict    = apperr.Conflict(apperr.CodeConflict, "Product slug already exists in this store")
	ErrTitleInvalid    = apperr.Validation(apperr.CodeValidationFailed, "Product title is required")
	ErrTypeInvalid     = apperr.Validation(apperr.CodeValidationFailed, "Invalid product type")
	ErrStatusInvalid   = apperr.Validation(apperr.CodeValidationFailed, "Invalid product status")
	ErrPriceInvalid    = apperr.Validation(apperr.CodeValidationFailed, "Price must be a whole non-negative IDR integer within allowed range")
	ErrFieldTooLong    = apperr.Validation(apperr.CodeValidationFailed, "Field exceeds maximum length")
	ErrCannotPublish   = apperr.Validation(apperr.CodeValidationFailed, "Product cannot be published")
	ErrConfigInvalid   = apperr.Validation(apperr.CodeValidationFailed, "Invalid storefront config")
	ErrRevisionConflict = apperr.Conflict(apperr.CodeStorefrontRevisionConflict, "Storefront revision conflict")
)
