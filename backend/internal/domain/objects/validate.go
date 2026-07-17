package objects

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

// ParsePurpose validates purpose string; rejects KYC (must use BE-400 path).
func ParsePurpose(raw string) (Purpose, error) {
	p := Purpose(strings.ToUpper(strings.TrimSpace(raw)))
	switch p {
	case PurposeProductFile, PurposePublicAsset, PurposeProfileAsset, PurposeInvoiceInput:
		return p, nil
	case "KYC", "KYC_DOCUMENT", "KYC_DOC":
		return "", ErrKYCPresignForbidden
	default:
		return "", ErrInvalidPurpose
	}
}

// ValidateChecksumHex ensures lowercase 64-char sha256 hex.
func ValidateChecksumHex(s string) (string, error) {
	s = strings.ToLower(strings.TrimSpace(s))
	if len(s) != 64 {
		return "", ErrInvalidChecksum
	}
	if _, err := hex.DecodeString(s); err != nil {
		return "", ErrInvalidChecksum
	}
	return s, nil
}

// SHA256Hex of bytes.
func SHA256Hex(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// IsTerminal reports whether status cannot transition via complete.
func IsTerminal(s Status) bool {
	switch s {
	case StatusReady, StatusRejected, StatusExpired:
		return true
	default:
		return false
	}
}
