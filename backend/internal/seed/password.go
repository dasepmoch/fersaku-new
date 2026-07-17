package seed

import (
	"crypto/sha256"
	"encoding/base64"
	"fmt"

	"golang.org/x/crypto/argon2"
)

// fixedSalt is deterministic 16-byte salt for SharedPassword (nonprod only).
var fixedSalt = []byte{
	0x51, 0x4c, 0x54, 0x31, 0x31, 0x30, 0x73, 0x65,
	0x65, 0x64, 0x73, 0x61, 0x6c, 0x74, 0x21, 0x00,
}

// PasswordHash returns a stable argon2id encoding for SharedPassword.
func PasswordHash() string {
	const (
		timeCost = 3
		memory   = 64 * 1024
		threads  = 4
		keyLen   = 32
	)
	hash := argon2.IDKey([]byte(SharedPassword), fixedSalt, timeCost, memory, threads, keyLen)
	b64Salt := base64.RawStdEncoding.EncodeToString(fixedSalt)
	b64Hash := base64.RawStdEncoding.EncodeToString(hash)
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, memory, timeCost, threads, b64Salt, b64Hash)
}

// TokenHash returns sha256 hex of a deterministic seed token label (never raw secret).
func TokenHash(label string) string {
	sum := sha256.Sum256([]byte("qlt110:" + label))
	return fmt.Sprintf("%x", sum[:])
}

// TokenHashBytes returns 32-byte sha256 of label.
func TokenHashBytes(label string) []byte {
	sum := sha256.Sum256([]byte("qlt110:" + label))
	return sum[:]
}

// FakeCiphertext returns non-empty deterministic bytea for encrypted columns
// (not decryptable production material).
func FakeCiphertext(label string) []byte {
	sum := sha256.Sum256([]byte("qlt110-cipher:" + label))
	out := make([]byte, 48)
	copy(out, sum[:])
	copy(out[32:], []byte("SEEDCIPHER"))
	return out
}
