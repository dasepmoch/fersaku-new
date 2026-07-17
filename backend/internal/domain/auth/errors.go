package auth

import apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"

// Domain-level auth errors (stable codes for problem mapping).
// Login/register/forgot/magic-link public messages stay generic (no enumeration).
var (
	ErrUnauthenticated = apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required")
	ErrForbidden       = apperr.Forbidden(apperr.CodeForbidden, "Forbidden")
	ErrSessionExpired  = apperr.Unauthorized(apperr.CodeAuthSessionExpired, "Session expired")
	ErrInvalidToken    = apperr.Unauthorized(apperr.CodeAuthInvalidCredentials, "Token is invalid or has expired")
	ErrInvalidCredentials = apperr.Unauthorized(apperr.CodeAuthInvalidCredentials, "Invalid email or password")
	ErrMFARequired     = apperr.Unauthorized(apperr.CodeAuthMFARequired, "Multi-factor authentication required")
	ErrMFAInvalid      = apperr.Unauthorized(apperr.CodeAuthInvalidCredentials, "Invalid multi-factor code")
	ErrAccountInactive = apperr.Forbidden(apperr.CodeForbidden, "Account is not active")
	ErrEmailNotVerified = apperr.Forbidden(apperr.CodeForbidden, "Email verification required")
	ErrValidation      = apperr.Validation(apperr.CodeValidationFailed, "Validation failed")
	ErrConflict        = apperr.Conflict(apperr.CodeConflict, "Resource version conflict")
	ErrPasswordReuse   = apperr.Validation(apperr.CodeValidationFailed, "New password must differ from the current password")
	ErrMFAFreshRequired = apperr.Unauthorized(apperr.CodeAuthMFARequired, "Fresh multi-factor proof required")
	ErrMandatoryPref   = apperr.Validation(apperr.CodeValidationFailed, "Mandatory notification preferences cannot be disabled")
	ErrEmailChangeBusy = apperr.Conflict(apperr.CodeConflict, "An email change is already pending")
	ErrEmailInUse      = apperr.Conflict(apperr.CodeConflict, "Email is not available")
	ErrEmailChangeInvalid = apperr.Validation(apperr.CodeValidationFailed, "Email change proof is invalid or expired")
)

// Generic public messages for anti-enumeration endpoints.
const (
	MsgRegisterGeneric   = "If the email is eligible, a verification message has been sent"
	MsgForgotGeneric     = "If an account exists for that email, a reset message has been sent"
	MsgMagicLinkGeneric  = "If an account exists for that email, a sign-in link has been sent"
	MsgVerifyGeneric     = "If the token is valid, the email has been verified"
	MsgResetGeneric      = "If the token is valid, the password has been updated"
	MsgLogoutOK          = "Signed out"
	MsgPasswordChanged   = "Password updated"
	MsgEmailChangeRequested = "If eligible, confirmation messages have been sent"
	MsgEmailChangePartial   = "Proof recorded"
	MsgEmailChangeComplete  = "Email updated"
	MsgMFADisabled          = "Multi-factor authentication disabled"
	MsgSecurityNotify       = "security_notice"
)
