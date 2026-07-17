package middleware

import (
	"context"
	"net/http"
	"time"
)

// Timeout cancels the request context after d.
// Default: 30s when d <= 0.
// Note: does not forcibly abort the ResponseWriter; handlers should respect ctx.
func Timeout(d time.Duration) func(http.Handler) http.Handler {
	if d <= 0 {
		d = 30 * time.Second
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx, cancel := context.WithTimeout(r.Context(), d)
			defer cancel()
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
