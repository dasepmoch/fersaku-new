package objects

import apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"

var (
	ErrNotFound = apperr.NotFound(apperr.CodeResourceNotFound, "Object not found")

	ErrInvalidPurpose = apperr.Validation(apperr.CodeValidationFailed, "Invalid object purpose")

	// ErrKYCPresignForbidden: KYC must never use browser-to-R2 presigned URLs (BE-400).
	ErrKYCPresignForbidden = apperr.Validation(apperr.CodeValidationFailed,
		"KYC documents cannot use browser upload; use the server-mediated KYC path")

	ErrInvalidChecksum = apperr.Validation(apperr.CodeValidationFailed, "Invalid checksum")

	ErrUploadExpired = apperr.Conflict(apperr.CodeConflict, "Upload intent expired")

	ErrUploadIncomplete = apperr.Validation(apperr.CodeValidationFailed, "Upload incomplete or object missing")

	ErrChecksumMismatch = apperr.Validation(apperr.CodeValidationFailed, "Checksum mismatch")

	ErrSizeMismatch = apperr.Validation(apperr.CodeValidationFailed, "Object size mismatch")

	ErrContentTypeMismatch = apperr.Validation(apperr.CodeValidationFailed, "Content type mismatch")

	ErrNotReady = apperr.Conflict(apperr.CodeConflict, "Object is not ready for download")

	ErrQuotaExceeded = apperr.Validation(apperr.CodeValidationFailed, "Object storage quota exceeded")

	ErrInvalidState = apperr.Conflict(apperr.CodeConflict, "Object is not in a valid state for this action")

	ErrGrantDenied = apperr.NotFound(apperr.CodeResourceNotFound, "Object not found")
)
