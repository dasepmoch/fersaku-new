package middleware

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/dasepmoch/fersaku-new/backend/internal/platform/metrics"
)

// Metrics records HTTP request counters/latency on the process registry.
// Route labels use chi route patterns (templates), never raw path IDs.
func Metrics(reg *metrics.Metrics) func(http.Handler) http.Handler {
	if reg == nil {
		reg = metrics.Global
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			rec := &statusRecorder{ResponseWriter: w, status: 0}
			next.ServeHTTP(rec, r)
			if rec.status == 0 {
				rec.status = http.StatusOK
			}
			route := routeTemplate(r)
			reg.IncHTTP(r.Method, route, strconv.Itoa(rec.status), float64(time.Since(start).Milliseconds()))
		})
	}
}

// routeTemplate returns a low-cardinality route pattern for metrics labels.
func routeTemplate(r *http.Request) string {
	if rctx := chi.RouteContext(r.Context()); rctx != nil {
		if p := rctx.RoutePattern(); p != "" {
			return p
		}
	}
	// Fallback: collapse UUID/ULID-like segments.
	return collapsePath(r.URL.Path)
}

func collapsePath(path string) string {
	if path == "" {
		return "/"
	}
	parts := strings.Split(path, "/")
	for i, p := range parts {
		if p == "" {
			continue
		}
		if looksLikeID(p) {
			parts[i] = "{id}"
		}
	}
	out := strings.Join(parts, "/")
	if out == "" {
		return "/"
	}
	return out
}

func looksLikeID(s string) bool {
	if len(s) < 8 {
		return false
	}
	// ULID (26 Crockford) or UUID or long hex
	hex := 0
	alnum := 0
	for _, r := range s {
		switch {
		case r >= '0' && r <= '9', r >= 'a' && r <= 'f', r >= 'A' && r <= 'F':
			hex++
			alnum++
		case r >= 'g' && r <= 'z', r >= 'G' && r <= 'Z':
			alnum++
		case r == '-':
			// uuid dashes ok
		default:
			return false
		}
	}
	if strings.Count(s, "-") == 4 && len(s) >= 32 {
		return true
	}
	if len(s) >= 20 && alnum == len(strings.ReplaceAll(s, "-", "")) {
		return true
	}
	// pure long hex
	if hex >= 16 && hex == len(s) {
		return true
	}
	return false
}
