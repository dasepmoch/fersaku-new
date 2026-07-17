package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"strings"
)

// GenerateToken returns a URL-safe high-entropy token (default 32 bytes = 256-bit).
func GenerateToken(nbytes int) (string, error) {
	if nbytes < 16 {
		nbytes = 32
	}
	b := make([]byte, nbytes)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("auth: token entropy: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// HashToken returns a hex SHA-256 of the raw token (never store raw).
func HashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// HashTokenKeyed returns hex HMAC-SHA256 when a secret is configured.
func HashTokenKeyed(raw, secret string) string {
	if secret == "" {
		return HashToken(raw)
	}
	m := hmac.New(sha256.New, []byte(secret))
	_, _ = m.Write([]byte(raw))
	return hex.EncodeToString(m.Sum(nil))
}

// EqualHash compares two hex hashes in constant time.
func EqualHash(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

// HashIPUA is a privacy-preserving fingerprint (not reversible identity).
func HashIPUA(value string) string {
	if value == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

// NormalizeEmail lowercases and trims; empty if invalid bare form.
func NormalizeEmail(email string) string {
	e := strings.TrimSpace(strings.ToLower(email))
	if e == "" || !strings.Contains(e, "@") || strings.Contains(e, " ") {
		return ""
	}
	parts := strings.SplitN(e, "@", 2)
	if parts[0] == "" || parts[1] == "" || !strings.Contains(parts[1], ".") {
		return ""
	}
	return e
}
