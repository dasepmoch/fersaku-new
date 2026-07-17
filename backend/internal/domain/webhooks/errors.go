package webhooks

import apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"

var (
	ErrEndpointNotFound = apperr.NotFound(apperr.CodeResourceNotFound, "Webhook endpoint not found")
	ErrDeliveryNotFound = apperr.NotFound(apperr.CodeResourceNotFound, "Webhook delivery not found")
	ErrURLRejected = apperr.Validation(apperr.CodeValidationFailed, "Webhook URL rejected")
	ErrPrivateNetwork = apperr.Validation(apperr.CodeWebhookURLPrivateNetwork,
		"Webhook URL must not target private, loopback, link-local, or metadata networks")
	ErrHTTPSRequired = apperr.Validation(apperr.CodeValidationFailed, "Webhook URL must be HTTPS")
	ErrEndpointUnavailable = apperr.Conflict(apperr.CodeWebhookEndpointUnavailable,
		"Webhook endpoint is not active")
	ErrSecretPending = apperr.Conflict(apperr.CodeWebhookSecretPending,
		"Webhook signing secret must be claimed before the endpoint is active")
	ErrClaimInvalid = apperr.Forbidden("SECRET_CLAIM_INVALID",
		"Webhook secret claim token is invalid, expired, or already used")
	ErrClaimConsumed = apperr.Conflict("SECRET_CLAIM_CONSUMED", "Claim already consumed")
	ErrWrongNamespace = apperr.NotFound(apperr.CodeResourceNotFound,
		"Resource not found") // non-enumerating for inbound IDs on outbound paths
	ErrAllowlistEmpty = apperr.Validation(apperr.CodeValidationFailed, "Event allowlist is required")
	ErrModeInvalid = apperr.Validation(apperr.CodeValidationFailed, "Invalid payment mode")
	ErrActiveExists = apperr.Conflict(apperr.CodeConflict,
		"An active webhook endpoint already exists for this merchant and mode")
)
