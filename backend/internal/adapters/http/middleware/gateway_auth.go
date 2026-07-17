package middleware

import (
	"net/http"
	"strings"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/gateway"
)

// RequireGatewayAPIKey authenticates Authorization: Bearer fsk_... (never cookie).
func RequireGatewayAPIKey(svc *application.GatewayService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if svc == nil {
				presenters.WriteAppError(w, r, gateway.ErrAuthRequired)
				return
			}
			raw := extractBearer(r)
			if raw == "" {
				presenters.WriteAppError(w, r, gateway.ErrAuthRequired)
				return
			}
			// Never log raw key.
			auth, err := svc.ResolveAPIKey(r.Context(), raw)
			if err != nil {
				presenters.WriteAppError(w, r, err)
				return
			}
			ctx := reqctx.WithGatewayAuth(r.Context(), reqctx.GatewayAuth{
				KeyID:       auth.KeyID,
				MerchantID:  auth.MerchantID,
				PaymentMode: auth.PaymentMode,
				KeyPrefix:   auth.KeyPrefix,
			})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func extractBearer(r *http.Request) string {
	h := strings.TrimSpace(r.Header.Get("Authorization"))
	if h == "" {
		return ""
	}
	const p = "Bearer "
	if len(h) < len(p) || !strings.EqualFold(h[:len(p)], p) {
		return ""
	}
	return strings.TrimSpace(h[len(p):])
}
