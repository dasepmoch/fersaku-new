package inventory

import apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"

// Domain sentinel errors mapped to stable problem codes.
var (
	ErrNotFound           = apperr.NotFound(apperr.CodeResourceNotFound, "Resource not found")
	ErrSchemaInvalid      = apperr.Validation(apperr.CodeValidationFailed, "Invalid inventory schema")
	ErrSchemaConflict     = apperr.Conflict(apperr.CodeInventorySchemaConflict, "Inventory schema version conflict")
	ErrImportInvalid      = apperr.Validation(apperr.CodeValidationFailed, "Stock import validation failed")
	ErrImportStaleSchema  = apperr.Conflict(apperr.CodeInventoryImportStale, "Stock import schema version is stale")
	ErrOutOfStock         = apperr.Conflict(apperr.CodeInventoryOutOfStock, "No available stock units")
	ErrItemState          = apperr.Conflict(apperr.CodeConflict, "Stock item state conflict")
	ErrReservationState   = apperr.Conflict(apperr.CodeConflict, "Stock reservation state conflict")
	ErrReservationExpired = apperr.Validation(apperr.CodeInventoryOutOfStock, "Stock reservation expired")
	ErrRevealDenied       = apperr.Forbidden(apperr.CodeInventoryRevealDenied, "Credential reveal denied")
	ErrEncryptionConfig   = apperr.Internal(apperr.CodeInternalError, "Stock encryption is not configured")
	ErrProductType        = apperr.Validation(apperr.CodeValidationFailed, "Inventory requires a code product")
)
