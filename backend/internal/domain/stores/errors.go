package stores

import apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"

var (
	ErrSlugInvalid  = apperr.Validation(apperr.CodeValidationFailed, "Invalid store slug")
	ErrSlugReserved = apperr.Validation(apperr.CodeValidationFailed, "Store slug is reserved")
	ErrSlugTaken    = apperr.Conflict(apperr.CodeConflict, "Store slug is already taken")

	ErrStoreRequired = apperr.Validation("ONBOARDING_STORE_REQUIRED", "Canonical store is required to complete onboarding")
	ErrIdentityRequired = apperr.Validation(apperr.CodeValidationFailed, "Store name and bio are required to complete onboarding")
	ErrSlugRequired     = apperr.Validation(apperr.CodeValidationFailed, "Valid store slug is required to complete onboarding")
	ErrAlreadyComplete  = apperr.Conflict(apperr.CodeConflict, "Onboarding already completed")
	ErrCannotDeleteLast = apperr.Conflict(apperr.CodeConflict, "Cannot delete the last store for a merchant")
	ErrOrphanMerchant   = apperr.Internal(apperr.CodeInternalError, "Merchant is missing a canonical store")
)
