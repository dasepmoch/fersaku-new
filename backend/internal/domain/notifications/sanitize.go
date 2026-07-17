package notifications

import (
	"net/url"
	"strings"
	"unicode/utf8"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
)

// SanitizeCTAPath accepts only relative internal application paths.
// Rejects external URLs, javascript:/data:/vbscript:, protocol-relative, and open-redirect tricks.
// Empty path is allowed (no CTA).
func SanitizeCTAPath(raw string) (string, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", nil
	}
	if utf8.RuneCountInString(s) > MaxCTARunes {
		return "", ErrUnsafeCTA
	}
	// No scheme-like prefix and no protocol-relative.
	lower := strings.ToLower(s)
	if strings.Contains(lower, "javascript:") ||
		strings.Contains(lower, "data:") ||
		strings.Contains(lower, "vbscript:") ||
		strings.HasPrefix(s, "//") ||
		strings.Contains(s, "\\") {
		return "", ErrUnsafeCTA
	}
	// Absolute URL with scheme.
	if strings.Contains(s, "://") {
		return "", ErrUnsafeCTA
	}
	// Must be root-relative application path.
	if !strings.HasPrefix(s, "/") {
		return "", ErrUnsafeCTA
	}
	// Disallow second leading slash after normalize (//evil).
	if strings.HasPrefix(s, "//") {
		return "", ErrUnsafeCTA
	}
	u, err := url.Parse(s)
	if err != nil {
		return "", ErrUnsafeCTA
	}
	if u.Scheme != "" || u.Host != "" || u.User != nil {
		return "", ErrUnsafeCTA
	}
	if u.Path == "" || !strings.HasPrefix(u.Path, "/") {
		return "", ErrUnsafeCTA
	}
	// Path must not escape to absolute URL via odd encoding.
	if strings.Contains(strings.ToLower(u.Path), "javascript:") {
		return "", ErrUnsafeCTA
	}
	// Rebuild: path + optional query + fragment (fragment kept only if safe chars).
	out := u.EscapedPath()
	if out == "" {
		out = u.Path
	}
	if !strings.HasPrefix(out, "/") || strings.HasPrefix(out, "//") {
		return "", ErrUnsafeCTA
	}
	if u.RawQuery != "" {
		out += "?" + u.RawQuery
	}
	// Drop fragment for safety (client can deep-link via path/query only).
	return out, nil
}

// SanitizeTitle trims and bounds title; rejects empty after trim.
func SanitizeTitle(raw string) (string, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", ErrValidation
	}
	if utf8.RuneCountInString(s) > MaxTitleRunes {
		return "", ErrValidation
	}
	// Strip control chars except newline/tab (title should be single-line).
	s = stripControls(s, false)
	if s == "" {
		return "", ErrValidation
	}
	return s, nil
}

// SanitizeBody trims and bounds body (may be empty).
func SanitizeBody(raw string) (string, error) {
	s := strings.TrimSpace(raw)
	if utf8.RuneCountInString(s) > MaxBodyRunes {
		return "", ErrValidation
	}
	return stripControls(s, true), nil
}

func stripControls(s string, allowNL bool) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		if r == '\n' || r == '\r' || r == '\t' {
			if allowNL {
				b.WriteRune(r)
			}
			continue
		}
		if r < 32 || r == 127 {
			continue
		}
		b.WriteRune(r)
	}
	return strings.TrimSpace(b.String())
}

// ValidSurface reports closed surface membership.
func ValidSurface(s string) bool {
	switch Surface(s) {
	case SurfaceSeller, SurfaceBuyer, SurfaceAdmin:
		return true
	default:
		return false
	}
}

// DefaultPriorityForEvent maps event to default priority.
func DefaultPriorityForEvent(code auth.NotificationEventCode) Priority {
	switch code {
	case auth.EventSecurityAlert:
		return PriorityCritical
	case auth.EventPaymentReceipt, auth.EventWithdrawalUpdate:
		return PriorityWarning
	case auth.EventKYCUpdate:
		return PriorityCompliance
	default:
		return PriorityInfo
	}
}

// DefaultRetentionForEvent maps event to retention class.
func DefaultRetentionForEvent(code auth.NotificationEventCode) RetentionClass {
	switch code {
	case auth.EventSecurityAlert:
		return RetentionSecurity
	case auth.EventKYCUpdate:
		return RetentionCompliance
	default:
		return RetentionStandard
	}
}
