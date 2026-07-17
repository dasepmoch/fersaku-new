package middleware

import (
	"net/http"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/authz"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// RequirePermission rejects authenticated principals lacking the given permission code.
// Unauthenticated callers receive AUTH_REQUIRED; missing permission → FORBIDDEN.
// Deny by default when the principal has no permission cache.
func RequirePermission(code string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			p, ok := reqctx.PrincipalFrom(r.Context())
			if !ok {
				presenters.WriteProblem(w, r, http.StatusUnauthorized,
					apperr.CodeAuthRequired, "Authentication required", nil)
				return
			}
			if !p.HasPermission(code) {
				presenters.WriteAppError(w, r, authz.DenyMissingPermission(code))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
