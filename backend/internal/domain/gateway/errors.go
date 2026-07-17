package gateway

import (
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

var (
	ErrAuthRequired = apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required")
	ErrAuthInvalid  = apperr.Unauthorized(apperr.CodeAuthInvalidCredentials, "Invalid API key")

	ErrKYCRequiredForLive = apperr.Forbidden(apperr.CodeKYCRequiredForLiveAPI, "Live QRIS API access requires approved KYC.")
	ErrAPIAccessSuspended = apperr.Forbidden(apperr.CodeAPIAccessSuspended, "API access is suspended")
	ErrMerchantSuspended  = apperr.Forbidden(apperr.CodeMerchantSuspended, "Merchant is suspended")
	ErrLiveCredentialReq  = apperr.Forbidden(apperr.CodeLiveCredentialRequired, "Live credential required")
	ErrQRISCheckoutOff    = apperr.Forbidden(apperr.CodeForbidden, "QRIS checkout is temporarily unavailable")

	ErrNotFound              = apperr.NotFound(apperr.CodeResourceNotFound, "Payment intent not found")
	ErrEventNotFound         = apperr.NotFound(apperr.CodeResourceNotFound, "Event not found")
	ErrWebhookEndpointInvalid = apperr.Validation(apperr.CodeValidationFailed, "Invalid webhook endpoint")
	ErrRedirectOriginRejected = apperr.Validation(apperr.CodeValidationFailed, "Redirect URL origin is not registered")
	ErrWebhookURLRejected     = apperr.Validation(apperr.CodeValidationFailed, "webhookUrl is not accepted; use webhookEndpointId")
	ErrIdempotencyConflict    = apperr.Conflict(apperr.CodeIdempotencyConflict, "Idempotency key conflict")
	ErrInvalidAmount          = apperr.Validation(apperr.CodeValidationFailed, "Invalid payment amount")
	ErrMetadataTooLarge       = apperr.Validation(apperr.CodeValidationFailed, "Metadata exceeds bounds")
	ErrCheckoutClosed         = apperr.Conflict(apperr.CodeConflict, "Payment is no longer cancellable")
)
