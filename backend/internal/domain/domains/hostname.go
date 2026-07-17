package domains

import (
	"net"
	"net/netip"
	"strings"
	"unicode"

	"golang.org/x/net/idna"
)

// Reserved host labels/suffixes that cannot be claimed as custom domains.
var reservedExact = map[string]struct{}{
	"localhost": {}, "local": {}, "invalid": {}, "test": {}, "example": {},
	"fersaku.com": {}, "fersaku.id": {}, "fersaku.app": {}, "fersaku.dev": {},
	"fersaku.local": {}, "www.fersaku.com": {}, "api.fersaku.com": {},
	"app.fersaku.com": {}, "admin.fersaku.com": {},
}

// publicSuffixOnly is a minimal public-suffix denylist (not a full PSL).
// Reject bare suffixes that would be a public registry zone.
var publicSuffixOnly = map[string]struct{}{
	"com": {}, "net": {}, "org": {}, "io": {}, "co": {}, "id": {},
	"co.id": {}, "or.id": {}, "go.id": {}, "ac.id": {}, "sch.id": {},
	"my.id": {}, "web.id": {}, "biz.id": {}, "dev": {}, "app": {},
	"xyz": {}, "info": {}, "biz": {}, "name": {}, "pro": {},
	"online": {}, "site": {}, "store": {}, "shop": {}, "cloud": {},
	"localhost": {}, "local": {}, "internal": {}, "intranet": {},
	"private": {}, "lan": {}, "home": {}, "corp": {}, "localdomain": {},
}

// NormalizeHostname applies strict IDNA/ASCII normalization for create, Host,
// edge routing, and uniqueness. Rejects IP, wildcard, public-suffix-only,
// reserved, userinfo/path/port, and malformed inputs.
func NormalizeHostname(raw string) (normalized string, display string, err error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", "", ErrHostnameInvalid
	}
	// Reject schemes, userinfo, path, query, fragment.
	if strings.ContainsAny(s, "/\\?#@[] ") {
		return "", "", ErrHostnameInvalid
	}
	// Strip trailing dot (FQDN form) but reject empty result.
	s = strings.TrimSuffix(s, ".")
	if s == "" {
		return "", "", ErrHostnameInvalid
	}
	// Explicit port is forbidden on create/normalize input (Host header uses NormalizeRequestHost).
	if strings.Contains(s, ":") {
		return "", "", ErrHostnameInvalid
	}
	// Wildcard forbidden.
	if strings.Contains(s, "*") {
		return "", "", ErrHostnameInvalid
	}
	// IP literals (v4/v6) forbidden.
	if ip := net.ParseIP(s); ip != nil {
		return "", "", ErrHostnameInvalid
	}
	if addr, parseErr := netip.ParseAddr(s); parseErr == nil && addr.IsValid() {
		return "", "", ErrHostnameInvalid
	}

	// Reject control characters and mixed whitespace.
	for _, r := range s {
		if r < 0x20 || r == 0x7f || unicode.IsSpace(r) {
			return "", "", ErrHostnameInvalid
		}
	}

	// IDNA2008 ToASCII (UTS #46 Lookup profile).
	ascii, idnaErr := idna.Lookup.ToASCII(s)
	if idnaErr != nil || ascii == "" {
		return "", "", ErrHostnameInvalid
	}
	ascii = strings.ToLower(strings.TrimSuffix(ascii, "."))
	if ascii == "" || len(ascii) > 253 {
		return "", "", ErrHostnameInvalid
	}

	// Basic label shape: labels 1-63, alnum/hyphen, no leading/trailing hyphen.
	labels := strings.Split(ascii, ".")
	if len(labels) < 2 {
		// Single-label hostnames rejected — custom domains need a zone.
		return "", "", ErrHostnameInvalid
	}
	for _, lab := range labels {
		if lab == "" || len(lab) > 63 {
			return "", "", ErrHostnameInvalid
		}
		if lab[0] == '-' || lab[len(lab)-1] == '-' {
			return "", "", ErrHostnameInvalid
		}
		for i := 0; i < len(lab); i++ {
			c := lab[i]
			ok := (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-'
			if !ok {
				return "", "", ErrHostnameInvalid
			}
		}
	}

	// Reject public-suffix-only (e.g. "com", "co.id").
	if _, bad := publicSuffixOnly[ascii]; bad {
		return "", "", ErrHostnameInvalid
	}

	// Reserved platform hostnames.
	if _, bad := reservedExact[ascii]; bad {
		return "", "", ErrHostnameInvalid
	}
	// Reject *.fersaku.com / *.fersaku.id platform zones.
	if strings.HasSuffix(ascii, ".fersaku.com") || strings.HasSuffix(ascii, ".fersaku.id") ||
		strings.HasSuffix(ascii, ".fersaku.app") || strings.HasSuffix(ascii, ".fersaku.dev") {
		return "", "", ErrHostnameInvalid
	}

	// Reject obvious private/special-use suffixes.
	if strings.HasSuffix(ascii, ".localhost") || strings.HasSuffix(ascii, ".local") ||
		strings.HasSuffix(ascii, ".internal") || strings.HasSuffix(ascii, ".intranet") ||
		strings.HasSuffix(ascii, ".lan") || strings.HasSuffix(ascii, ".home") ||
		strings.HasSuffix(ascii, ".corp") || strings.HasSuffix(ascii, ".private") {
		return "", "", ErrHostnameInvalid
	}

	// Display form: prefer Unicode when input was Unicode and round-trips.
	display = ascii
	if hasNonASCII(s) {
		if u, uerr := idna.Lookup.ToUnicode(ascii); uerr == nil && u != "" {
			display = u
		}
	}

	return ascii, display, nil
}

// NormalizeRequestHost normalizes an HTTP Host header value (may include port).
func NormalizeRequestHost(hostHeader string) (string, error) {
	h := strings.TrimSpace(hostHeader)
	if h == "" {
		return "", ErrHostnameInvalid
	}
	// Strip port if present before hostname validation.
	if strings.HasPrefix(h, "[") {
		// [ipv6]:port — reject IPs via NormalizeHostname after strip
		if end := strings.LastIndex(h, "]"); end > 0 {
			inner := h[1:end]
			rest := h[end+1:]
			if rest != "" && !strings.HasPrefix(rest, ":") {
				return "", ErrHostnameInvalid
			}
			h = inner
		}
	} else if host, _, err := net.SplitHostPort(h); err == nil {
		h = host
	} else if strings.Count(h, ":") == 1 {
		// host:port without brackets
		if i := strings.LastIndex(h, ":"); i > 0 {
			h = h[:i]
		}
	}
	norm, _, err := NormalizeHostname(h)
	return norm, err
}

func hasNonASCII(s string) bool {
	for _, r := range s {
		if r > 127 {
			return true
		}
	}
	return false
}
