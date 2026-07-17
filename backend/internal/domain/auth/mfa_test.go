package auth_test

import (
	"testing"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
)

func TestTOTPVerifyWindow(t *testing.T) {
	secret, err := auth.GenerateTOTPSecret()
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 7, 17, 12, 0, 0, 0, time.UTC)
	code, err := auth.TOTPCode(secret, now)
	if err != nil {
		t.Fatal(err)
	}
	if !auth.VerifyTOTP(secret, code, now) {
		t.Fatal("current window should verify")
	}
	if auth.VerifyTOTP(secret, "000000", now) {
		t.Fatal("wrong code must fail")
	}
}

func TestRecoveryCodesUniqueHashes(t *testing.T) {
	plain, hashes, err := auth.GenerateRecoveryCodes(8)
	if err != nil {
		t.Fatal(err)
	}
	if len(plain) != 8 || len(hashes) != 8 {
		t.Fatal("length")
	}
	seen := map[string]bool{}
	for i, h := range hashes {
		if seen[h] {
			t.Fatal("duplicate hash")
		}
		seen[h] = true
		if auth.RecoveryCodeHash(plain[i]) != h {
			t.Fatalf("hash mismatch for %s", plain[i])
		}
	}
}
