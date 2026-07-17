package domains

import apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"

var (
	ErrHostnameInvalid = apperr.Validation(apperr.CodeDomainHostnameInvalid, "Hostname is invalid")
	ErrHostnameTaken   = apperr.Conflict(apperr.CodeDomainHostnameTaken, "Hostname is already claimed")
	ErrDomainNotFound  = apperr.NotFound(apperr.CodeResourceNotFound, "Domain not found")
	ErrDomainConflict  = apperr.Conflict(apperr.CodeDomainVersionConflict, "Domain version conflict")
	ErrVerifyFailed    = apperr.Validation(apperr.CodeDomainVerifyFailed, "Domain verification failed")
	ErrNotPending      = apperr.Conflict(apperr.CodeConflict, "Domain is not in a verifiable state")
	ErrNotRemovable    = apperr.Conflict(apperr.CodeConflict, "Domain cannot be deleted in its current state")
	ErrStaleToken      = apperr.Validation(apperr.CodeDomainStaleToken, "Verification token is stale or invalid")
	ErrHostUnresolved  = apperr.NotFound(apperr.CodeDomainHostUnresolved, "Host does not resolve to an active store")
)
