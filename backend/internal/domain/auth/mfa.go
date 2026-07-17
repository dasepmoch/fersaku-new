package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"strings"
	"time"
)

// GenerateTOTPSecret returns a base32-encoded 20-byte secret for authenticator apps.
func GenerateTOTPSecret() (string, error) {
	b := make([]byte, 20)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("auth: totp secret: %w", err)
	}
	return base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b), nil
}

// TOTPCode computes a 6-digit TOTP for secret at unix time (30s step, SHA1, 6 digits).
func TOTPCode(secretBase32 string, t time.Time) (string, error) {
	secret, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(strings.ToUpper(secretBase32))
	if err != nil {
		secret, err = base32.StdEncoding.DecodeString(strings.ToUpper(secretBase32))
		if err != nil {
			return "", fmt.Errorf("auth: invalid totp secret")
		}
	}
	counter := uint64(t.UTC().Unix() / 30)
	var buf [8]byte
	binary.BigEndian.PutUint64(buf[:], counter)
	mac := hmac.New(sha1.New, secret)
	_, _ = mac.Write(buf[:])
	sum := mac.Sum(nil)
	offset := sum[len(sum)-1] & 0x0f
	code := (int(sum[offset]&0x7f)<<24 | int(sum[offset+1])<<16 | int(sum[offset+2])<<8 | int(sum[offset+3])) % 1_000_000
	return fmt.Sprintf("%06d", code), nil
}

// VerifyTOTP accepts current ±1 window.
func VerifyTOTP(secretBase32, code string, now time.Time) bool {
	code = strings.TrimSpace(code)
	if len(code) != 6 {
		return false
	}
	for _, delta := range []time.Duration{0, -30 * time.Second, 30 * time.Second} {
		want, err := TOTPCode(secretBase32, now.Add(delta))
		if err != nil {
			return false
		}
		if subtleEqualString(want, code) {
			return true
		}
	}
	return false
}

func subtleEqualString(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	var v byte
	for i := 0; i < len(a); i++ {
		v |= a[i] ^ b[i]
	}
	return v == 0
}

// GenerateRecoveryCodes returns n plaintext codes (shown once) and their hashes for storage.
func GenerateRecoveryCodes(n int) (plain []string, hashes []string, err error) {
	if n <= 0 {
		n = 10
	}
	plain = make([]string, 0, n)
	hashes = make([]string, 0, n)
	for i := 0; i < n; i++ {
		raw, err := GenerateToken(10)
		if err != nil {
			return nil, nil, err
		}
		code := strings.ToUpper(raw[:8]) + "-" + strings.ToUpper(raw[8:16])
		plain = append(plain, code)
		hashes = append(hashes, HashToken(strings.ToUpper(code)))
	}
	return plain, hashes, nil
}

// RecoveryCodeHash normalizes then hashes a recovery code.
func RecoveryCodeHash(code string) string {
	c := strings.ToUpper(strings.TrimSpace(code))
	c = strings.ReplaceAll(c, " ", "")
	return HashToken(c)
}
