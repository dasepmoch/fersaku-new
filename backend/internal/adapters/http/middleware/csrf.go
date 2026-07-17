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
// Behavior (INT-130 / BE-120):
//   - SoftDisable=true: no-op (tests may force enable).
//   - SoftDisable=false: for unsafe methods, only when a valid session was loaded
//     (SessionMeta present): require X-CSRF-Token and constant-time compare to
//     session csrf_token_hash (via SessionMeta + TokenHasher).
//   - Cookie present but session not resolved (stale/expired/revoked): do not
//     enforce CSRF so anonymous login / magic-link / password / logout recovery
//     can clear or replace the cookie. A non-resolvable cookie cannot authorize.
//   - Safe methods never checked.
//
// Cookie policy: HttpOnly session cookie + header double-submit (not a second cookie).
// SameSite=Lax default; Strict optional via config for admin deployments.
// Defense-in-depth: Origin / Sec-Fetch-Site same-origin topology (INT-030).
type CSRFConfig struct {
	SoftDisable       bool
	SessionCookieName string
	// TokenHasher hashes the header token for compare; required when SoftDisable=false.
	TokenHasher func(raw string) string
}

// CSRF enforces double-submit CSRF for cookie-auth mutations.
// SessionCookieName is reserved for docs/config parity; enforcement keys off SessionMeta
// attached by Auth middleware (valid session only).
func CSRF(cfg CSRFConfig) func(http.Handler) http.Handler {
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
			// Only enforce when a live session was attached (auth middleware ran first).
			meta, ok := reqctx.SessionMetaFrom(r.Context())
			if !ok || meta.CSRFTokenHash == "" {
				// Stale cookie without resolvable session: allow anonymous recovery paths.
				next.ServeHTTP(w, r)
				return
			}
			// Valid session + unsafe method: double-submit required.
			token := strings.TrimSpace(r.Header.Get(CSRFHeader))
			if token == "" {
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
