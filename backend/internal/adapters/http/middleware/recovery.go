package middleware

import (
	"net/http"
	"runtime/debug"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// Recovery recovers panics, logs them (stack only server-side), and returns
// INTERNAL_ERROR problem. X-Request-ID is preserved when already set.
//
// Note: RequestID middleware runs inside recovery so panics after RequestID still
// have a request ID. If panic happens before RequestID, header may be empty.
func Recovery(log ports.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if rec := recover(); rec != nil {
					rid := reqctx.RequestID(r.Context())
					if log != nil {
						log.Error("panic recovered",
							"panic", rec,
							"path", r.URL.Path,
							"method", r.Method,
							"request_id", rid,
							"stack", string(debug.Stack()),
						)
					}
					if rid != "" {
						w.Header().Set(RequestIDHeader, rid)
					}
					presenters.WriteProblem(w, r, http.StatusInternalServerError,
						apperr.CodeInternalError, "An unexpected error occurred", nil)
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}
