package security

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"strings"
)

// Envelope encrypts small secret payloads with AES-256-GCM.
// Key material is derived via SHA-256 from the configured secret string.
// Ciphertext layout: version(1) || nonce(12) || sealed.
const (
	KeyVersionV1    = "v1"
	aeadVersionByte = 0x01
	aeadNonceSize   = 12
	aeadOverheadMin = 1 + aeadNonceSize + 16
)

// ErrEmptyKey is returned when no encryption key is configured.
var ErrEmptyKey = errors.New("security: encryption key is empty")

// ErrCiphertextInvalid is returned when ciphertext cannot be opened.
var ErrCiphertextInvalid = errors.New("security: ciphertext invalid")

// DeriveKey32 returns a 32-byte AES key from arbitrary secret material.
func DeriveKey32(secret string) ([]byte, error) {
	s := strings.TrimSpace(secret)
	if s == "" {
		return nil, ErrEmptyKey
	}
	sum := sha256.Sum256([]byte(s))
	return sum[:], nil
}

// EncryptAEAD encrypts plaintext with AES-256-GCM. Returns key version and ciphertext.
func EncryptAEAD(secret string, plaintext []byte) (keyVersion string, ciphertext []byte, err error) {
	key, err := DeriveKey32(secret)
	if err != nil {
		return "", nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", nil, fmt.Errorf("security: aes: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", nil, fmt.Errorf("security: gcm: %w", err)
	}
	nonce := make([]byte, aeadNonceSize)
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", nil, fmt.Errorf("security: nonce: %w", err)
	}
	sealed := gcm.Seal(nil, nonce, plaintext, nil)
	out := make([]byte, 0, 1+len(nonce)+len(sealed))
	out = append(out, aeadVersionByte)
	out = append(out, nonce...)
	out = append(out, sealed...)
	return KeyVersionV1, out, nil
}

// DecryptAEAD opens ciphertext produced by EncryptAEAD.
func DecryptAEAD(secret string, ciphertext []byte) ([]byte, error) {
	key, err := DeriveKey32(secret)
	if err != nil {
		return nil, err
	}
	if len(ciphertext) < aeadOverheadMin {
		return nil, ErrCiphertextInvalid
	}
	if ciphertext[0] != aeadVersionByte {
		return nil, ErrCiphertextInvalid
	}
	nonce := ciphertext[1 : 1+aeadNonceSize]
	sealed := ciphertext[1+aeadNonceSize:]
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("security: aes: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("security: gcm: %w", err)
	}
	plain, err := gcm.Open(nil, nonce, sealed, nil)
	if err != nil {
		return nil, ErrCiphertextInvalid
	}
	return plain, nil
}

// EncryptString is a convenience for UTF-8 secrets; ciphertext is raw bytes (store as bytea).
func EncryptString(secret, plaintext string) (keyVersion string, ciphertext []byte, err error) {
	return EncryptAEAD(secret, []byte(plaintext))
}

// DecryptString opens an EncryptString payload.
func DecryptString(secret string, ciphertext []byte) (string, error) {
	b, err := DecryptAEAD(secret, ciphertext)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// CiphertextB64 encodes ciphertext for tests/debug only (never log plaintext).
func CiphertextB64(ciphertext []byte) string {
	return base64.StdEncoding.EncodeToString(ciphertext)
}
