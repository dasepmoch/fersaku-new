package middleware

import (
	"net/http"
	"regexp"
	"strings"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// TraceparentHeader is the W3C Trace Context header (optional).
const TraceparentHeader = "traceparent"

// TracestateHeader is the optional W3C tracestate header (propagated only).
const TracestateHeader = "tracestate"

// TraceIDHeader is a convenience response/request header for operators.
const TraceIDHeader = "X-Trace-ID"

// W3C version-00 traceparent: version-traceid-parentid-flags
// https://www.w3.org/TR/trace-context/
var traceparentRE = regexp.MustCompile(`(?i)^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$`)

// Trace injects/propagates W3C traceparent and correlates with X-Request-ID.
//
// Behavior:
//   - If valid traceparent present: use its trace-id; echo traceparent + X-Trace-ID.
//   - Else: derive a 32-hex trace-id from request_id (when available) or new ID;
//     set response traceparent and X-Trace-ID.
//   - Never logs or stores raw payloads; attributes stay ID-only.
//
// Must run after RequestID so request_id is available for correlation.
func Trace(ids ports.IDGenerator) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tp := strings.TrimSpace(r.Header.Get(TraceparentHeader))
			traceID, parentID, flags, ok := parseTraceparent(tp)
			if !ok {
				traceID = deriveTraceID(reqctx.RequestID(r.Context()), ids)
				parentID = "0000000000000001"
				flags = "01"
			}
			// Build outgoing traceparent (we are a hop: parent becomes our span id loosely).
			outParent := parentID
			if outParent == "" || outParent == "0000000000000000" {
				outParent = "0000000000000001"
			}
			outTP := "00-" + traceID + "-" + outParent + "-" + flags
			w.Header().Set(TraceparentHeader, outTP)
			w.Header().Set(TraceIDHeader, traceID)
			if ts := strings.TrimSpace(r.Header.Get(TracestateHeader)); ts != "" && len(ts) <= 512 {
				w.Header().Set(TracestateHeader, ts)
			}

			ctx := reqctx.WithTraceID(r.Context(), traceID)
			ctx = reqctx.WithTraceparent(ctx, outTP)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func parseTraceparent(v string) (traceID, parentID, flags string, ok bool) {
	m := traceparentRE.FindStringSubmatch(v)
	if m == nil {
		return "", "", "", false
	}
	// Reject all-zero trace-id per W3C.
	if m[2] == "00000000000000000000000000000000" {
		return "", "", "", false
	}
	if m[3] == "0000000000000000" {
		return "", "", "", false
	}
	return strings.ToLower(m[2]), strings.ToLower(m[3]), strings.ToLower(m[4]), true
}

func deriveTraceID(requestID string, ids ports.IDGenerator) string {
	// Prefer deterministic hex from request id bytes when it already looks like hex.
	hexish := strings.ToLower(strings.ReplaceAll(requestID, "-", ""))
	var b strings.Builder
	b.Grow(32)
	for _, r := range hexish {
		if (r >= '0' && r <= '9') || (r >= 'a' && r <= 'f') {
			b.WriteRune(r)
			if b.Len() == 32 {
				return b.String()
			}
		}
	}
	// Pad with zeros or generate.
	if b.Len() > 0 {
		for b.Len() < 32 {
			b.WriteByte('0')
		}
		return b.String()
	}
	raw := "unknown"
	if ids != nil {
		raw = ids.New()
	}
	// Hash-like: take alphanumerics and pad to 32 hex chars.
	var h strings.Builder
	h.Grow(32)
	for _, r := range strings.ToLower(raw) {
		if (r >= '0' && r <= '9') || (r >= 'a' && r <= 'f') {
			h.WriteRune(r)
		} else if r >= 'g' && r <= 'z' {
			// map g-z into hex nibble-ish
			h.WriteByte(byte('a' + (r-'g')%6))
		}
		if h.Len() == 32 {
			return h.String()
		}
	}
	for h.Len() < 32 {
		h.WriteByte('0')
	}
	return h.String()
}
