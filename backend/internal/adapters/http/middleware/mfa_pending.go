package middleware

import (
	"net/http"
	"strings"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// MFAPendingGate fail-closes sessions where MFA is enabled but not yet verified
// (MFA_PENDING). Only allowlisted auth recovery/introspect/verify routes pass.
// Roles/permissions on the principal must not open buyer/seller/admin business APIs.
func MFAPendingGate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p, ok := reqctx.PrincipalFrom(r.Context())
		if !ok {
			next.ServeHTTP(w, r)
			return
		}
		// Pending when account has MFA and this session has not completed verify.
		if !p.MFAEnabled || p.MFAVerified {
			next.ServeHTTP(w, r)
			return
		}
		if isMFAPendingAllowlisted(r.Method, r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}
		presenters.WriteAppError(w, r, auth.ErrMFARequired)
		_ = apperr.CodeAuthMFARequired // stable code via domain error
	})
}

// isMFAPendingAllowlisted is the fail-closed allowlist for MFA_PENDING sessions.
// Everything else (including list sessions, profile, commerce) is denied.
func isMFAPendingAllowlisted(method, path string) bool {
	method = strings.ToUpper(strings.TrimSpace(method))
	path = strings.TrimSuffix(path, "/")
	if path == "" {
		path = "/"
	}

	switch {
	case method == http.MethodGet && path == "/v1/auth/session":
		return true
	case method == http.MethodPost && path == "/v1/auth/mfa/verify":
		return true
	case method == http.MethodPost && path == "/v1/auth/logout":
		return true
	// Recovery: password reset is public; revoke-current/all helps escape stuck sessions.
	case method == http.MethodPost && path == "/v1/auth/sessions/revoke-all":
		return true
	case method == http.MethodPost && path == "/v1/auth/password/forgot":
		return true
	case method == http.MethodPost && path == "/v1/auth/password/reset":
		return true
	default:
		return false
	}
}

// MFAPendingAllowlisted reports allowlist membership (tests / diagnostics).
func MFAPendingAllowlisted(method, path string) bool {
	return isMFAPendingAllowlisted(method, path)
}
