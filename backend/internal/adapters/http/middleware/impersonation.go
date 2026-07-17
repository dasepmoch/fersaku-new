package middleware

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/admin"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// ImpersonationGate enforces READ_ONLY / SUPPORT_WRITE mutation policy (BE-520 §11.5).
// Must run after Auth middleware. Default-deny for all mutations not on the exact
// two-command SUPPORT_WRITE allowlist.
func ImpersonationGate(imp *application.ImpersonationService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			p, ok := reqctx.PrincipalFrom(r.Context())
			if !ok || !p.Impersonating {
				next.ServeHTTP(w, r)
				return
			}
			if !admin.IsMutationMethod(r.Method) {
				next.ServeHTTP(w, r)
				return
			}
			// Always block nested start while already impersonating.
			path := r.URL.Path
			if strings.Contains(path, "/impersonation") && r.Method == http.MethodPost {
				presenters.WriteProblem(w, r, http.StatusForbidden,
					apperr.CodeForbidden, "Nested impersonation is not allowed", nil)
				return
			}

			scope := p.ImpersonationScope
			if scope == admin.ImpersonationScopeReadOnly || scope == "" {
				presenters.WriteProblem(w, r, http.StatusForbidden,
					apperr.CodeForbidden, "Impersonation session is read-only", nil)
				return
			}
			if scope != admin.ImpersonationScopeSupportWrite {
				presenters.WriteProblem(w, r, http.StatusForbidden,
					apperr.CodeForbidden, "Impersonation scope denied", nil)
				return
			}

			cmd := admin.MatchSupportWrite(r.Method, path)
			if cmd == nil {
				presenters.WriteProblem(w, r, http.StatusForbidden,
					apperr.CodeForbidden, "Mutation not allowlisted under SUPPORT_WRITE", nil)
				return
			}

			// Parse JSON body for field allowlist (reject unknown fields).
			bodyBytes, err := io.ReadAll(r.Body)
			if err != nil {
				presenters.WriteProblem(w, r, http.StatusBadRequest,
					apperr.CodeValidationFailed, "Invalid body", nil)
				return
			}
			_ = r.Body.Close()
			r.Body = io.NopCloser(bytes.NewReader(bodyBytes))

			fields := map[string]any{}
			if len(bytes.TrimSpace(bodyBytes)) > 0 {
				dec := json.NewDecoder(bytes.NewReader(bodyBytes))
				dec.UseNumber()
				if err := dec.Decode(&fields); err != nil {
					presenters.WriteProblem(w, r, http.StatusBadRequest,
						apperr.CodeValidationFailed, "Invalid JSON body", nil)
					return
				}
			}
			if err := admin.ValidateSupportWriteFields(cmd, fields); err != nil {
				presenters.WriteProblem(w, r, http.StatusForbidden,
					apperr.CodeForbidden, err.Error(), nil)
				return
			}

			// Store presentation: target must already own/manage the store.
			if cmd.Command == admin.CommandStorePresentationSupportUpdate && imp != nil {
				storeID := admin.PathParamValue(cmd, path)
				if storeID == "" {
					presenters.WriteProblem(w, r, http.StatusForbidden,
						apperr.CodeForbidden, "Store not allowlisted", nil)
					return
				}
				if err := imp.AssertStoreOwnedByTarget(r.Context(), storeID, p.SubjectID); err != nil {
					presenters.WriteAppError(w, r, err)
					return
				}
			}

			next.ServeHTTP(w, r)
		})
	}
}
