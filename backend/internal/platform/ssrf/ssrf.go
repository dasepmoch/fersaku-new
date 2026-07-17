// Package ssrf validates server-fetched HTTPS URLs (outbound webhooks only).
// Browser-only redirects must not use this package.
package ssrf

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// MaxURLBytes is the UTF-8 byte limit for webhook URLs.
const MaxURLBytes = 2048

// ValidationError is a non-retryable URL rejection.
type ValidationError struct {
	Reason string
}

func (e *ValidationError) Error() string {
	if e == nil {
		return "ssrf: invalid url"
	}
	return "ssrf: " + e.Reason
}

// IsPrivate reports whether err is a private-network rejection.
func IsPrivate(err error) bool {
	if err == nil {
		return false
	}
	ve, ok := err.(*ValidationError)
	return ok && (ve.Reason == "private_network" || strings.Contains(ve.Reason, "private"))
}

// ValidateHTTPSURL checks scheme/host/userinfo/length without DNS.
func ValidateHTTPSURL(raw string) (*url.URL, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, &ValidationError{Reason: "empty"}
	}
	if len(raw) > MaxURLBytes {
		return nil, &ValidationError{Reason: "too_long"}
	}
	if strings.ContainsAny(raw, " \t\r\n") {
		return nil, &ValidationError{Reason: "whitespace"}
	}
	u, err := url.Parse(raw)
	if err != nil {
		return nil, &ValidationError{Reason: "parse"}
	}
	if u.Scheme != "https" {
		return nil, &ValidationError{Reason: "https_required"}
	}
	if u.Host == "" || u.User != nil {
		return nil, &ValidationError{Reason: "host_or_userinfo"}
	}
	if u.Fragment != "" {
		return nil, &ValidationError{Reason: "fragment"}
	}
	host := u.Hostname()
	if host == "" {
		return nil, &ValidationError{Reason: "empty_host"}
	}
	// Reject IP literals that are private without DNS.
	if ip := net.ParseIP(host); ip != nil {
		if isBlockedIP(ip) {
			return nil, &ValidationError{Reason: "private_network"}
		}
	}
	// Block obvious metadata hostnames.
	lh := strings.ToLower(host)
	if lh == "localhost" || strings.HasSuffix(lh, ".localhost") ||
		lh == "metadata.google.internal" || lh == "metadata" {
		return nil, &ValidationError{Reason: "private_network"}
	}
	return u, nil
}

// ResolveAndValidate performs DNS lookup and rejects blocked A/AAAA answers.
// Call at registration and every delivery (anti rebinding).
func ResolveAndValidate(ctx context.Context, raw string) (*url.URL, []net.IP, error) {
	u, err := ValidateHTTPSURL(raw)
	if err != nil {
		return nil, nil, err
	}
	host := u.Hostname()
	if ip := net.ParseIP(host); ip != nil {
		if isBlockedIP(ip) {
			return nil, nil, &ValidationError{Reason: "private_network"}
		}
		return u, []net.IP{ip}, nil
	}
	resolver := &net.Resolver{}
	addrs, err := resolver.LookupIPAddr(ctx, host)
	if err != nil {
		return nil, nil, &ValidationError{Reason: "dns_failed"}
	}
	if len(addrs) == 0 {
		return nil, nil, &ValidationError{Reason: "dns_empty"}
	}
	ips := make([]net.IP, 0, len(addrs))
	for _, a := range addrs {
		if isBlockedIP(a.IP) {
			return nil, nil, &ValidationError{Reason: "private_network"}
		}
		ips = append(ips, a.IP)
	}
	return u, ips, nil
}

// DialContext returns a dialer that only connects to pre-validated IPs (rebinding-safe).
func DialContext(ips []net.IP, timeout time.Duration) func(ctx context.Context, network, addr string) (net.Conn, error) {
	d := &net.Dialer{Timeout: timeout}
	return func(ctx context.Context, network, addr string) (net.Conn, error) {
		_, port, err := net.SplitHostPort(addr)
		if err != nil {
			return nil, err
		}
		var last error
		for _, ip := range ips {
			if isBlockedIP(ip) {
				return nil, &ValidationError{Reason: "private_network"}
			}
			target := net.JoinHostPort(ip.String(), port)
			c, err := d.DialContext(ctx, network, target)
			if err == nil {
				return c, nil
			}
			last = err
		}
		if last == nil {
			last = fmt.Errorf("ssrf: no dial targets")
		}
		return nil, last
	}
}

// SafeHTTPClient builds a client that re-resolves and blocks private IPs / redirects.
func SafeHTTPClient(timeout time.Duration) *http.Client {
	if timeout <= 0 {
		timeout = 10 * time.Second
	}
	return &http.Client{
		Timeout: timeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return &ValidationError{Reason: "too_many_redirects"}
			}
			// Revalidate redirect target (scheme + DNS + private).
			ctx, cancel := context.WithTimeout(req.Context(), 3*time.Second)
			defer cancel()
			_, _, err := ResolveAndValidate(ctx, req.URL.String())
			if err != nil {
				return err
			}
			return nil
		},
		Transport: &http.Transport{
			Proxy: nil, // never honor proxy env for server-fetched webhooks
			DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
				host, port, err := net.SplitHostPort(addr)
				if err != nil {
					return nil, err
				}
				// Re-resolve at dial time against rebinding.
				if ip := net.ParseIP(host); ip != nil {
					if isBlockedIP(ip) {
						return nil, &ValidationError{Reason: "private_network"}
					}
					d := &net.Dialer{Timeout: timeout}
					return d.DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
				}
				ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
				if err != nil {
					return nil, &ValidationError{Reason: "dns_failed"}
				}
				var last error
				d := &net.Dialer{Timeout: timeout}
				for _, a := range ips {
					if isBlockedIP(a.IP) {
						return nil, &ValidationError{Reason: "private_network"}
					}
					c, err := d.DialContext(ctx, network, net.JoinHostPort(a.IP.String(), port))
					if err == nil {
						return c, nil
					}
					last = err
				}
				if last == nil {
					last = &ValidationError{Reason: "dns_empty"}
				}
				return nil, last
			},
			// Disable HTTP/2 cleartext quirks; TLS only via https URL.
			ForceAttemptHTTP2: true,
		},
	}
}

func isBlockedIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() || ip.IsMulticast() || ip.IsUnspecified() {
		return true
	}
	// IPv4 metadata / CGNAT / broadcast-ish.
	if v4 := ip.To4(); v4 != nil {
		// 169.254.0.0/16 link-local already covered; 169.254.169.254 metadata.
		if v4[0] == 169 && v4[1] == 254 {
			return true
		}
		// 100.64.0.0/10 CGNAT
		if v4[0] == 100 && v4[1] >= 64 && v4[1] <= 127 {
			return true
		}
		// 0.0.0.0/8
		if v4[0] == 0 {
			return true
		}
	}
	// IPv6 unique local fc00::/7
	if len(ip) == net.IPv6len {
		if ip[0]&0xfe == 0xfc {
			return true
		}
	}
	return false
}
