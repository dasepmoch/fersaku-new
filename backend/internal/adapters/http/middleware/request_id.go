// Package middleware holds the BE-110 HTTP middleware stack.
//
// Order (outer → inner), documented and enforced in router:
//
//	recovery → request ID → trace → trusted proxy → logging → metrics → timeout →
//	auth → CSRF → rate limit → handler
package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// RequestIDHeader is the correlation header used by frontend handoff.
const RequestIDHeader = "X-Request-ID"

const maxRequestIDLen = 128

// RequestID injects/propagates X-Request-ID using the ID generator when missing.
// The header is set on every response.
func RequestID(ids ports.IDGenerator) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			rid := sanitizeRequestID(r.Header.Get(RequestIDHeader))
			if rid == "" {
				if ids != nil {
					rid = ids.New()
				} else {
					rid = "unknown"
				}
			}
			w.Header().Set(RequestIDHeader, rid)
			ctx := reqctx.WithRequestID(r.Context(), rid)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequestIDFromContext returns the request ID if present.
func RequestIDFromContext(ctx context.Context) string {
	return reqctx.RequestID(ctx)
}

func sanitizeRequestID(v string) string {
	v = strings.TrimSpace(v)
	if v == "" {
		return ""
	}
	var b strings.Builder
	b.Grow(len(v))
	for _, r := range v {
		if r < 0x20 || r == 0x7f {
			continue
		}
		b.WriteRune(r)
	}
	out := b.String()
	if len(out) > maxRequestIDLen {
		out = out[:maxRequestIDLen]
	}
	return out
}
