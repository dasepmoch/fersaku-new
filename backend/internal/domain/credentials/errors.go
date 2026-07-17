package credentials

import apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"

var (
	ErrClaimInvalid = apperr.Forbidden("CREDENTIAL_CLAIM_INVALID",
		"Claim token is invalid, expired, or already used")
	ErrClaimExpired = apperr.Forbidden("CREDENTIAL_CLAIM_EXPIRED",
		"Claim token has expired; request a new claim")
	ErrClaimConsumed = apperr.Conflict("CREDENTIAL_CLAIM_CONSUMED",
		"Claim already consumed")
	ErrLiveKYCRequired = apperr.Forbidden("KYC_REQUIRED_FOR_LIVE_API",
		"Live API credentials require approved KYC")
	ErrIssuanceNotAuthorized = apperr.Forbidden("ISSUANCE_NOT_AUTHORIZED",
		"No authorized issuance request for this mode")
	ErrIssuanceOutstanding = apperr.Conflict("ISSUANCE_OUTSTANDING",
		"An outstanding issuance request already exists")
	ErrMFARequired = apperr.Forbidden("MFA_REQUIRED",
		"Recent MFA verification is required for this action")
	ErrKeyNotFound = apperr.NotFound("RESOURCE_NOT_FOUND",
		"API credential not found")
	ErrKeyNotActive = apperr.Conflict("CREDENTIAL_NOT_ACTIVE",
		"API credential is not active")
	ErrAdminNoRaw = apperr.Forbidden("ADMIN_RAW_KEY_FORBIDDEN",
		"Admin and support cannot receive or reveal raw API keys")
)
