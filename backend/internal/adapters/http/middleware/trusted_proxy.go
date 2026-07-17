package middleware

import (
	"context"
	"net"
	"net/http"
	"strings"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
)

// TrustedProxyConfig controls client IP extraction behind reverse proxies.
// When TrustedProxies is empty, RemoteAddr is used as-is (no X-Forwarded-For trust).
type TrustedProxyConfig struct {
	// TrustedProxies are CIDRs or IPs of reverse proxies allowed to set X-Forwarded-For.
	TrustedProxies []string
}

// TrustedProxy records the client IP on the context for rate limiting / logs.
// Only trusts X-Forwarded-For / X-Real-IP when the immediate peer is in TrustedProxies.
func TrustedProxy(cfg TrustedProxyConfig) func(http.Handler) http.Handler {
	nets := parseCIDRs(cfg.TrustedProxies)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := clientIP(r, nets)
			ctx := reqctx.WithClientIP(r.Context(), ip)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// ClientIPFromContext returns the resolved client IP, or empty string.
func ClientIPFromContext(ctx context.Context) string {
	return reqctx.ClientIP(ctx)
}

func clientIP(r *http.Request, trusted []*net.IPNet) string {
	remoteHost, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		remoteHost = r.RemoteAddr
	}
	remoteIP := net.ParseIP(remoteHost)
	if remoteIP == nil {
		return remoteHost
	}

	if !ipInNets(remoteIP, trusted) {
		return remoteIP.String()
	}

	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		for _, p := range parts {
			p = strings.TrimSpace(p)
			if ip := net.ParseIP(p); ip != nil {
				return ip.String()
			}
		}
	}
	if xri := strings.TrimSpace(r.Header.Get("X-Real-IP")); xri != "" {
		if ip := net.ParseIP(xri); ip != nil {
			return ip.String()
		}
	}
	return remoteIP.String()
}

func parseCIDRs(list []string) []*net.IPNet {
	var out []*net.IPNet
	for _, s := range list {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if !strings.Contains(s, "/") {
			if ip := net.ParseIP(s); ip != nil {
				if ip.To4() != nil {
					s = s + "/32"
				} else {
					s = s + "/128"
				}
			}
		}
		_, n, err := net.ParseCIDR(s)
		if err == nil {
			out = append(out, n)
		}
	}
	return out
}

func ipInNets(ip net.IP, nets []*net.IPNet) bool {
	for _, n := range nets {
		if n.Contains(ip) {
			return true
		}
	}
	return false
}
