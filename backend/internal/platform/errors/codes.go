package errors

// Stable problem codes from BACKEND_PRODUCTION_TASKS §6.3.
// Transport maps these to HTTP status; messages must never leak secrets/PII.
const (
	CodeAuthRequired           = "AUTH_REQUIRED"
	CodeAuthInvalidCredentials = "AUTH_INVALID_CREDENTIALS"
	CodeAuthSessionExpired     = "AUTH_SESSION_EXPIRED"
	CodeAuthMFARequired        = "AUTH_MFA_REQUIRED"
	CodeAuthCSRFInvalid        = "AUTH_CSRF_INVALID"
	CodeForbidden              = "FORBIDDEN"
	CodeResourceNotFound       = "RESOURCE_NOT_FOUND"
	CodeValidationFailed       = "VALIDATION_FAILED"
	CodeConflict               = "CONFLICT"
	CodeIdempotencyReplay      = "IDEMPOTENCY_REPLAY"
	CodeIdempotencyConflict    = "IDEMPOTENCY_CONFLICT"
	CodeRateLimited            = "RATE_LIMITED"
	CodeInternalError          = "INTERNAL_ERROR"
	CodeMethodNotAllowed       = "METHOD_NOT_ALLOWED"
	CodeNotAcceptable          = "NOT_ACCEPTABLE"
	// BE-210 storefront optimistic concurrency.
	CodeStorefrontRevisionConflict = "STOREFRONT_REVISION_CONFLICT"
	// BE-215 coupon checkout (generic; no enumeration).
	CodeCouponUnavailable   = "COUPON_UNAVAILABLE"
	CodeCouponLimitExceeded = "COUPON_LIMIT_EXCEEDED"
	// BE-230 inventory / stock.
	CodeInventorySchemaConflict = "INVENTORY_SCHEMA_CONFLICT"
	CodeInventoryImportStale    = "INVENTORY_IMPORT_STALE"
	CodeInventoryOutOfStock     = "INVENTORY_OUT_OF_STOCK"
	CodeInventoryRevealDenied   = "INVENTORY_REVEAL_DENIED"
	// BE-235 delivery / invoices.
	CodeDeliveryUnpaid       = "DELIVERY_UNPAID"
	CodeDeliveryRevoked      = "DELIVERY_REVOKED"
	CodeDeliveryExpired      = "DELIVERY_EXPIRED"
	CodeDeliveryAccessDenied = "DELIVERY_ACCESS_DENIED"
	// BE-240 custom domains.
	CodeDomainHostnameInvalid  = "DOMAIN_HOSTNAME_INVALID"
	CodeDomainHostnameTaken    = "DOMAIN_HOSTNAME_TAKEN"
	CodeDomainVersionConflict  = "DOMAIN_VERSION_CONFLICT"
	CodeDomainVerifyFailed     = "DOMAIN_VERIFY_FAILED"
	CodeDomainStaleToken       = "DOMAIN_STALE_TOKEN"
	CodeDomainHostUnresolved   = "DOMAIN_HOST_UNRESOLVED"
	// BE-320 QRIS gateway.
	CodeKYCRequiredForLiveAPI  = "KYC_REQUIRED_FOR_LIVE_API"
	CodeAPIAccessSuspended     = "API_ACCESS_SUSPENDED"
	CodeMerchantSuspended      = "MERCHANT_SUSPENDED"
	CodeLiveCredentialRequired = "LIVE_CREDENTIAL_REQUIRED"
	// BE-400 KYC live API.
	CodeKYCNotApproved        = "KYC_NOT_APPROVED"
	CodeKYCNeedsClarification = "KYC_NEEDS_CLARIFICATION"
	CodeKYCExpired            = "KYC_EXPIRED"
	CodeKYCInvalidTransition  = "KYC_INVALID_TRANSITION"
	CodeKYCReasonRequired     = "KYC_REASON_REQUIRED"
	CodeKYCDocumentNotReady   = "KYC_DOCUMENT_NOT_READY"
	CodeKYCPresignForbidden   = "KYC_PRESIGN_FORBIDDEN"
	// BE-350 withdrawals / bank.
	CodeWithdrawalLocked         = "WITHDRAWAL_LOCKED"
	CodeWithdrawalInsufficient   = "WITHDRAWAL_INSUFFICIENT_BALANCE"
	CodeWithdrawalQuoteExpired   = "WITHDRAWAL_QUOTE_EXPIRED"
	CodeWithdrawalQuoteInvalid   = "WITHDRAWAL_QUOTE_INVALID"
	CodeWithdrawalQuoteConsumed  = "WITHDRAWAL_QUOTE_CONSUMED"
	CodeBankNotVerified          = "BANK_NOT_VERIFIED"
	CodeBankVersionConflict      = "BANK_VERSION_CONFLICT"
	CodeBankPrimaryRequired      = "BANK_PRIMARY_REQUIRED"
	CodeBankInUse                = "BANK_IN_USE"
	CodeWithdrawalInvalidStatus  = "WITHDRAWAL_INVALID_STATUS"
	CodeWithdrawalUnknownOutcome = "WITHDRAWAL_UNKNOWN_OUTCOME"
	CodeWithdrawalFrozen         = "WITHDRAWAL_FROZEN"
	CodeDisbursementMismatch     = "DISBURSEMENT_MISMATCH"
	// BE-420 outbound seller webhooks.
	CodeWebhookURLPrivateNetwork   = "WEBHOOK_URL_PRIVATE_NETWORK"
	CodeWebhookEndpointUnavailable = "WEBHOOK_ENDPOINT_UNAVAILABLE"
	CodeWebhookSecretPending       = "WEBHOOK_SECRET_PENDING"
	// BE-430 buyer reviews.
	CodeReviewNotEligible = "REVIEW_NOT_ELIGIBLE"
	// BE-530 audit chain integrity.
	CodeAuditChainBroken = "AUDIT_CHAIN_BROKEN"
)
