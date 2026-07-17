package presenters

import (
	"errors"
	"net/http"

	"github.com/dasepmoch/fersaku-new/backend/internal/platform/cursor"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// MapError converts an error into HTTP status + stable problem fields.
// Messages never include stack traces, secrets, or internal cause chains.
func MapError(err error) (status int, code, message string, details map[string]any) {
	if err == nil {
		return http.StatusInternalServerError, apperr.CodeInternalError, "An unexpected error occurred", nil
	}

	if errors.Is(err, cursor.ErrInvalid) {
		return http.StatusBadRequest, apperr.CodeValidationFailed, "Invalid pagination cursor", nil
	}

	if ae, ok := apperr.AsAppError(err); ok {
		return mapAppError(ae)
	}

	return http.StatusInternalServerError, apperr.CodeInternalError, "An unexpected error occurred", nil
}

func mapAppError(ae *apperr.AppError) (status int, code, message string, details map[string]any) {
	code = ae.Code
	if code == "" {
		code = codeFromKind(ae.Kind)
	}
	message = ae.Message
	if message == "" {
		message = defaultMessage(code)
	}
	details = ae.Details
	status = statusFromCode(code, ae.Kind)
	return status, code, message, details
}

func codeFromKind(k apperr.Kind) string {
	switch k {
	case apperr.KindValidation:
		return apperr.CodeValidationFailed
	case apperr.KindNotFound:
		return apperr.CodeResourceNotFound
	case apperr.KindConflict:
		return apperr.CodeConflict
	case apperr.KindUnauthorized:
		return apperr.CodeAuthRequired
	case apperr.KindForbidden:
		return apperr.CodeForbidden
	case apperr.KindRateLimited:
		return apperr.CodeRateLimited
	case apperr.KindUnavailable:
		return apperr.CodeInternalError
	default:
		return apperr.CodeInternalError
	}
}

func statusFromCode(code string, kind apperr.Kind) int {
	switch code {
	case apperr.CodeAuthRequired, apperr.CodeAuthInvalidCredentials, apperr.CodeAuthSessionExpired:
		return http.StatusUnauthorized
	case apperr.CodeAuthMFARequired, apperr.CodeAuthMFAProofInvalid, apperr.CodeAuthMFAProofExpired:
		return http.StatusUnauthorized
	case apperr.CodeAuthCSRFInvalid:
		return http.StatusForbidden
	case apperr.CodeForbidden,
		apperr.CodeKYCRequiredForLiveAPI,
		apperr.CodeAPIAccessSuspended,
		apperr.CodeMerchantSuspended,
		apperr.CodeLiveCredentialRequired,
		"KYC_NOT_APPROVED", "KYC_EXPIRED", "LIVE_KEY_CLAIM_REQUIRED":
		return http.StatusForbidden
	case apperr.CodeResourceNotFound:
		return http.StatusNotFound
	case apperr.CodeValidationFailed,
		"FEE_INVALID_AMOUNT", "FEE_OVERFLOW", "FEE_NON_POSITIVE_NET",
		"FEE_BELOW_MIN_WITHDRAWAL", "FEE_PAYMENT_OUT_OF_BOUNDS", "FEE_NEGATIVE_COMPONENT",
		"BANK_NOT_VERIFIED", "KYC_REASON_REQUIRED", "KYC_DOCUMENT_INVALID", "KYC_PRESIGN_FORBIDDEN":
		return http.StatusBadRequest
	case "FEE_POLICY_NOT_FOUND":
		return http.StatusNotFound
	case apperr.CodeConflict, apperr.CodeIdempotencyConflict, apperr.CodeStorefrontRevisionConflict, apperr.CodeCouponLimitExceeded,
		apperr.CodeInventorySchemaConflict, apperr.CodeInventoryImportStale, apperr.CodeInventoryOutOfStock,
		apperr.CodeWithdrawalLocked, apperr.CodeWithdrawalInsufficient, apperr.CodeWithdrawalQuoteExpired,
		apperr.CodeWithdrawalQuoteInvalid, apperr.CodeWithdrawalQuoteConsumed, apperr.CodeBankVersionConflict,
		apperr.CodeBankPrimaryRequired, apperr.CodeBankInUse, apperr.CodeWithdrawalInvalidStatus,
		apperr.CodeWithdrawalFrozen, apperr.CodeDisbursementMismatch, apperr.CodeWithdrawalUnknownOutcome,
		"KYC_INVALID_TRANSITION", "KYC_DOCUMENT_NOT_READY", "KYC_CASE_IMMUTABLE", "KYC_OPEN_CASE_EXISTS",
		"KYC_NEEDS_CLARIFICATION":
		return http.StatusConflict
	case apperr.CodeCouponUnavailable:
		return http.StatusBadRequest
	case apperr.CodeInventoryRevealDenied, apperr.CodeDeliveryUnpaid,
		apperr.CodeDeliveryRevoked, apperr.CodeDeliveryExpired, apperr.CodeDeliveryAccessDenied,
		apperr.CodeReviewNotEligible:
		return http.StatusForbidden
	case apperr.CodeIdempotencyReplay:
		// Replay of a successful mutation may be 200 with stored body later;
		// when surfaced as error, use 409.
		return http.StatusConflict
	case apperr.CodeRateLimited:
		return http.StatusTooManyRequests
	case apperr.CodeMethodNotAllowed:
		return http.StatusMethodNotAllowed
	case apperr.CodeInternalError:
		return http.StatusInternalServerError
	}

	switch kind {
	case apperr.KindValidation:
		return http.StatusBadRequest
	case apperr.KindNotFound:
		return http.StatusNotFound
	case apperr.KindConflict:
		return http.StatusConflict
	case apperr.KindUnauthorized:
		return http.StatusUnauthorized
	case apperr.KindForbidden:
		return http.StatusForbidden
	case apperr.KindRateLimited:
		return http.StatusTooManyRequests
	case apperr.KindUnavailable:
		return http.StatusServiceUnavailable
	default:
		return http.StatusInternalServerError
	}
}

func defaultMessage(code string) string {
	switch code {
	case apperr.CodeAuthRequired:
		return "Authentication required"
	case apperr.CodeAuthCSRFInvalid:
		return "Invalid or missing CSRF token"
	case apperr.CodeForbidden:
		return "Forbidden"
	case apperr.CodeResourceNotFound:
		return "Resource not found"
	case apperr.CodeValidationFailed:
		return "Validation failed"
	case apperr.CodeConflict:
		return "Conflict"
	case apperr.CodeIdempotencyConflict:
		return "Idempotency key conflict"
	case apperr.CodeRateLimited:
		return "Too many requests"
	default:
		return "An unexpected error occurred"
	}
}
