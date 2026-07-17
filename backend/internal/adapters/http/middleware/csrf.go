package middleware

import (
	"crypto/subtle"
	"net/http"
	"strings"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// CSRFHeader is the double-submit token header (BACKEND_HANDOFF).
const CSRFHeader = "X-CSRF-Token"

// CSRFConfig controls CSRF middleware.
//
// Behavior (BE-120 complete):
//   - SoftDisable=true: no-op (tests may force enable).
//   - SoftDisable=false: for unsafe methods, if session cookie present:
//     require X-CSRF-Token and constant-time compare to session csrf_token_hash
//     (via SessionMeta + TokenHasher). If SessionMeta missing but cookie present
//     and no hasher, reject when header empty (fail closed).
//   - Safe methods never checked.
//
// Cookie policy: HttpOnly session cookie + header double-submit (not a second cookie).
// SameSite=Lax default; Strict optional via config for admin deployments.
type CSRFConfig struct {
	SoftDisable       bool
	SessionCookieName string
	// TokenHasher hashes the header token for compare; required when SoftDisable=false.
	TokenHasher func(raw string) string
}

// CSRF enforces double-submit CSRF for cookie-auth mutations.
func CSRF(cfg CSRFConfig) func(http.Handler) http.Handler {
	cookieName := cfg.SessionCookieName
	if cookieName == "" {
		cookieName = "fersaku_session"
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if cfg.SoftDisable {
				next.ServeHTTP(w, r)
				return
			}
			if isSafeMethod(r.Method) {
				next.ServeHTTP(w, r)
				return
			}
			if _, err := r.Cookie(cookieName); err != nil {
				next.ServeHTTP(w, r)
				return
			}
			token := strings.TrimSpace(r.Header.Get(CSRFHeader))
			if token == "" {
				presenters.WriteProblem(w, r, http.StatusForbidden,
					apperr.CodeAuthCSRFInvalid, "Invalid or missing CSRF token", nil)
				return
			}
			meta, ok := reqctx.SessionMetaFrom(r.Context())
			if !ok || meta.CSRFTokenHash == "" {
				presenters.WriteProblem(w, r, http.StatusForbidden,
					apperr.CodeAuthCSRFInvalid, "Invalid or missing CSRF token", nil)
				return
			}
			var gotHash string
			if cfg.TokenHasher != nil {
				gotHash = cfg.TokenHasher(token)
			} else {
				gotHash = auth.HashToken(token)
			}
			if !constantTimeEqual(gotHash, meta.CSRFTokenHash) {
				presenters.WriteProblem(w, r, http.StatusForbidden,
					apperr.CodeAuthCSRFInvalid, "Invalid or missing CSRF token", nil)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func constantTimeEqual(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

func isSafeMethod(m string) bool {
	switch m {
	case http.MethodGet, http.MethodHead, http.MethodOptions, http.MethodTrace:
		return true
	default:
		return false
	}
}
