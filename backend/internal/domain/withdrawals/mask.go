package withdrawals

import (
	"strings"
	"unicode"
)

// NormalizeAccountNumber strips spaces/dashes; keeps digits only.
func NormalizeAccountNumber(raw string) string {
	var b strings.Builder
	for _, r := range raw {
		if unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// MaskAccountNumber returns e.g. ****1234 for list/DTO (never full number).
func MaskAccountNumber(digits string) string {
	d := NormalizeAccountNumber(digits)
	if len(d) < 4 {
		return "****"
	}
	last4 := d[len(d)-4:]
	return "****" + last4
}

// Last4 returns the last four digits.
func Last4(digits string) string {
	d := NormalizeAccountNumber(digits)
	if len(d) < 4 {
		return strings.Repeat("0", 4-len(d)) + d
	}
	return d[len(d)-4:]
}

// ValidAccountNumber checks length bounds for IDR bank accounts.
func ValidAccountNumber(digits string) bool {
	d := NormalizeAccountNumber(digits)
	return len(d) >= 8 && len(d) <= 20
}
