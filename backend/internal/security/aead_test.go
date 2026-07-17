package security_test

import (
	"bytes"
	"testing"

	"github.com/dasepmoch/fersaku-new/backend/internal/security"
)

func TestAEADRoundTrip(t *testing.T) {
	secret := "test-stock-encryption-key-32b!!!!"
	plain := []byte(`{"code":"SECRET-123","pin":"9999"}`)
	ver, ct, err := security.EncryptAEAD(secret, plain)
	if err != nil {
		t.Fatal(err)
	}
	if ver != security.KeyVersionV1 {
		t.Fatalf("ver=%s", ver)
	}
	if bytes.Contains(ct, plain) {
		t.Fatal("ciphertext contains plaintext")
	}
	got, err := security.DecryptAEAD(secret, ct)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, plain) {
		t.Fatalf("got %q want %q", got, plain)
	}
}

func TestAEADEmptyKey(t *testing.T) {
	_, _, err := security.EncryptAEAD("", []byte("x"))
	if err != security.ErrEmptyKey {
		t.Fatalf("err=%v", err)
	}
}

func TestAEADWrongKey(t *testing.T) {
	_, ct, err := security.EncryptAEAD("key-a-long-enough-secret!!!!!", []byte("secret"))
	if err != nil {
		t.Fatal(err)
	}
	_, err = security.DecryptAEAD("key-b-long-enough-secret!!!!!", ct)
	if err != security.ErrCiphertextInvalid {
		t.Fatalf("err=%v", err)
	}
}
