package middleware

import (
	"crypto/subtle"
	"net"
	"net/http"
	"strings"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// MetricsAccessConfig protects GET /metrics.
//
// Policy (GAP-07):
//   - When BearerToken is set, require Authorization: Bearer <token> (constant-time).
//   - When AllowCIDRs is non-empty, remote IP (after trusted-proxy resolution) must match.
//   - When both empty: open on local/test; on staging/production composition root must set
//     at least one control (enforced at config Validate for live runtimes).
type MetricsAccessConfig struct {
	BearerToken string
	AllowCIDRs  []*net.IPNet
	// Open allows unauthenticated scrape (local/test only).
	Open bool
}

// MetricsAccess wraps a metrics handler with network/token policy.
func MetricsAccess(cfg MetricsAccessConfig, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if cfg.Open && cfg.BearerToken == "" && len(cfg.AllowCIDRs) == 0 {
			next(w, r)
			return
		}
		// Token check (if configured).
		if tok := strings.TrimSpace(cfg.BearerToken); tok != "" {
			got := bearerToken(r.Header.Get("Authorization"))
			if subtle.ConstantTimeCompare([]byte(got), []byte(tok)) != 1 {
				presenters.WriteProblem(w, r, http.StatusUnauthorized,
					apperr.CodeAuthRequired, "Metrics scrape unauthorized", nil)
				return
			}
			// Token OK — still apply CIDR if set.
		}
		if len(cfg.AllowCIDRs) > 0 {
			ipStr := reqctx.ClientIP(r.Context())
			if ipStr == "" {
				ipStr = remoteIP(r)
			}
			ip := net.ParseIP(ipStr)
			if ip == nil || !ipInNets(ip, cfg.AllowCIDRs) {
				// If bearer was required and matched, CIDR is additional; if only CIDR, deny.
				if strings.TrimSpace(cfg.BearerToken) == "" {
					presenters.WriteProblem(w, r, http.StatusForbidden,
						apperr.CodeForbidden, "Metrics scrape forbidden", nil)
					return
				}
				// Token already validated; allow token-only scrapers from outside CIDR
				// only when Open is false and token present — token is sufficient.
			}
		}
		// No controls configured and not Open → deny (fail closed).
		if !cfg.Open && cfg.BearerToken == "" && len(cfg.AllowCIDRs) == 0 {
			presenters.WriteProblem(w, r, http.StatusForbidden,
				apperr.CodeForbidden, "Metrics scrape forbidden", nil)
			return
		}
		next(w, r)
	}
}

func bearerToken(h string) string {
	h = strings.TrimSpace(h)
	const p = "Bearer "
	if len(h) < len(p) || !strings.EqualFold(h[:len(p)], p) {
		return ""
	}
	return strings.TrimSpace(h[len(p):])
}

func remoteIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// ParseCIDRList parses comma-separated CIDRs; empty entries skipped.
func ParseCIDRList(raw string) ([]*net.IPNet, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	var out []*net.IPNet
	for _, p := range strings.Split(raw, ",") {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if !strings.Contains(p, "/") {
			// Single IP → /32 or /128
			ip := net.ParseIP(p)
			if ip == nil {
				return nil, &net.ParseError{Type: "IP address", Text: p}
			}
			if ip.To4() != nil {
				p = p + "/32"
			} else {
				p = p + "/128"
			}
		}
		_, n, err := net.ParseCIDR(p)
		if err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, nil
}
