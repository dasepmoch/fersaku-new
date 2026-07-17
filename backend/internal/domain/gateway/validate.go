package gateway

import (
	"encoding/json"
	"net/url"
	"strings"
	"unicode"
	"unicode/utf8"
)

// NormalizeOrigin returns scheme://host[:port] for an absolute HTTPS URL origin.
// Never performs DNS or network I/O.
func NormalizeOrigin(raw string) (string, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" || utf8.RuneCountInString(raw) > MaxURLBytes {
		return "", false
	}
	for _, r := range raw {
		if r < 0x20 || r == 0x7f {
			return "", false
		}
	}
	if strings.Contains(raw, ":///") || strings.HasPrefix(raw, "//") {
		return "", false
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return "", false
	}
	if u.User != nil {
		return "", false
	}
	if u.Fragment != "" {
		return "", false
	}
	host := strings.ToLower(u.Hostname())
	if host == "" || strings.Contains(host, "*") {
		return "", false
	}
	// Reject bare public-suffix-ish single labels without a dot (except localhost for tests — still https only).
	if !strings.Contains(host, ".") && host != "localhost" {
		return "", false
	}
	port := u.Port()
	origin := "https://" + host
	if port != "" && port != "443" {
		origin += ":" + port
	}
	return origin, true
}

// ValidateBrowserRedirectURL checks success/failure URL shape without network fetch.
// Path and query may vary; origin must later match the allowlist.
func ValidateBrowserRedirectURL(raw string) (origin string, ok bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", true // optional
	}
	if utf8.RuneCountInString(raw) > MaxURLBytes {
		return "", false
	}
	for _, r := range raw {
		if r < 0x20 || r == 0x7f {
			return "", false
		}
	}
	if strings.HasPrefix(raw, "//") || strings.Contains(raw, "\\") {
		return "", false
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Host == "" || !u.IsAbs() {
		return "", false
	}
	if u.User != nil || u.Fragment != "" {
		return "", false
	}
	// Reject scheme-relative and non-https.
	origin, ok = NormalizeOrigin(raw)
	return origin, ok
}

// ValidateMetadata bounds opaque JSON without interpreting URL strings as fetch targets.
func ValidateMetadata(raw json.RawMessage) error {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	if len(raw) > MaxMetadataBytes {
		return ErrMetadataTooLarge
	}
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		return ErrMetadataTooLarge
	}
	if !walkMetadata(v, 0, 0) {
		return ErrMetadataTooLarge
	}
	return nil
}

func walkMetadata(v any, depth, keyCount int) bool {
	if depth > MaxMetadataDepth {
		return false
	}
	switch t := v.(type) {
	case map[string]any:
		if len(t) > MaxMetadataKeys || keyCount+len(t) > MaxMetadataKeys {
			return false
		}
		n := keyCount
		for k, child := range t {
			if utf8.RuneCountInString(k) > MaxMetadataStr {
				return false
			}
			n++
			if n > MaxMetadataKeys {
				return false
			}
			if !walkMetadata(child, depth+1, n) {
				return false
			}
		}
		return true
	case []any:
		if len(t) > MaxMetadataKeys {
			return false
		}
		for _, child := range t {
			if !walkMetadata(child, depth+1, keyCount) {
				return false
			}
		}
		return true
	case string:
		return utf8.RuneCountInString(t) <= MaxMetadataStr
	case float64, bool, nil:
		return true
	default:
		return false
	}
}

// SanitizeMerchantReference rejects control chars and bounds length.
func SanitizeMerchantReference(ref string) (string, bool) {
	ref = strings.TrimSpace(ref)
	if ref == "" || utf8.RuneCountInString(ref) > MaxMerchantRefLen {
		return "", false
	}
	for _, r := range ref {
		if r < 0x20 || r == 0x7f || unicode.IsControl(r) {
			return "", false
		}
	}
	return ref, true
}

// ParseAPIKeyPrefix extracts display prefix from a raw key (first 16 chars or fsk_*_xxxxxxxx).
func ParseAPIKeyPrefix(raw string) string {
	raw = strings.TrimSpace(raw)
	if len(raw) <= 16 {
		return raw
	}
	// Prefer fsk_test_xxxxxxxx / fsk_live_xxxxxxxx style (prefix + 8 of secret).
	if strings.HasPrefix(raw, KeyPrefixSandbox) || strings.HasPrefix(raw, KeyPrefixLive) {
		if len(raw) >= 20 {
			return raw[:20]
		}
	}
	return raw[:16]
}

// DetectPaymentModeFromKey infers mode from raw key prefix.
func DetectPaymentModeFromKey(raw string) string {
	if strings.HasPrefix(raw, KeyPrefixLive) {
		return ModeLive
	}
	return ModeSandbox
}
