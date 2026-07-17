package kyc

import apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"

const (
	CodeKYCNotApproved         = "KYC_NOT_APPROVED"
	CodeKYCNeedsClarification  = "KYC_NEEDS_CLARIFICATION"
	CodeKYCExpired             = "KYC_EXPIRED"
	CodeKYCInvalidTransition   = "KYC_INVALID_TRANSITION"
	CodeKYCReasonRequired      = "KYC_REASON_REQUIRED"
	CodeKYCDocumentNotReady    = "KYC_DOCUMENT_NOT_READY"
	CodeKYCDocumentInvalid     = "KYC_DOCUMENT_INVALID"
	CodeKYCCaseImmutable       = "KYC_CASE_IMMUTABLE"
	CodeKYCOpenCaseExists      = "KYC_OPEN_CASE_EXISTS"
	CodeKYCPresignForbidden    = "KYC_PRESIGN_FORBIDDEN"
	CodeLiveKeyClaimRequired   = "LIVE_KEY_CLAIM_REQUIRED"
)

var (
	ErrNotApproved = apperr.Forbidden(CodeKYCNotApproved, "KYC is not approved for live QRIS API")
	ErrNeedsClarification = apperr.Conflict(CodeKYCNeedsClarification, "KYC case needs clarification before resubmit completes")
	ErrExpired = apperr.Forbidden(CodeKYCExpired, "KYC case has expired")
	ErrInvalidTransition = apperr.Conflict(CodeKYCInvalidTransition, "Invalid KYC status transition")
	ErrReasonRequired = apperr.Validation(CodeKYCReasonRequired, "Rejection or clarification reason is required")
	ErrDocumentNotReady = apperr.Conflict(CodeKYCDocumentNotReady, "Mandatory KYC documents are not READY")
	ErrDocumentInvalid = apperr.Validation(CodeKYCDocumentInvalid, "Invalid KYC document upload")
	ErrCaseImmutable = apperr.Conflict(CodeKYCCaseImmutable, "KYC case is immutable after terminal status")
	ErrOpenCaseExists = apperr.Conflict(CodeKYCOpenCaseExists, "An open KYC case already exists for this merchant")
	ErrPresignForbidden = apperr.Validation(CodeKYCPresignForbidden, "KYC documents cannot use browser-to-R2 presigned upload")
	ErrLiveKeyClaimRequired = apperr.Forbidden(CodeLiveKeyClaimRequired, "Live API key requires seller claim after KYC approval")
)
