package middleware

import (
	"context"
	"net/http"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
)

// HeaderRecentMFAProof is the canonical step-up header (INT-140 / OpenAPI).
const HeaderRecentMFAProof = "X-Recent-MFA-Proof"

// RecentMFAProofValidator consumes and validates an opaque recent proof.
type RecentMFAProofValidator interface {
	ConsumeRecentMFAProof(ctx context.Context, userID, sessionID, purpose, rawProof string) error
}

// RequireRecentMFAProof returns middleware that requires a valid
// X-Recent-MFA-Proof for the given purpose (single-use consume).
// Body boolean mfaVerified is never accepted as authority.
func RequireRecentMFAProof(purpose string, v RecentMFAProofValidator) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if v == nil {
				presenters.WriteAppError(w, r, auth.ErrMFAProofRequired)
				return
			}
			p, ok := reqctx.PrincipalFrom(r.Context())
			if !ok {
				presenters.WriteAppError(w, r, auth.ErrUnauthenticated)
				return
			}
			if p.MFAEnabled && !p.MFAVerified {
				presenters.WriteAppError(w, r, auth.ErrMFARequired)
				return
			}
			raw := r.Header.Get(HeaderRecentMFAProof)
			if raw == "" {
				presenters.WriteAppError(w, r, auth.ErrMFAProofRequired)
				return
			}
			if err := v.ConsumeRecentMFAProof(r.Context(), p.SubjectID, p.SessionID, purpose, raw); err != nil {
				presenters.WriteAppError(w, r, err)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
