package auth_test

import (
	"testing"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
)

func TestHashAndVerifyPassword(t *testing.T) {
	hash, err := auth.HashPassword("correct-horse-battery")
	if err != nil {
		t.Fatal(err)
	}
	if hash == "" || hash == "correct-horse-battery" {
		t.Fatal("hash must not equal raw password")
	}
	ok, rehash, err := auth.VerifyPassword(hash, "correct-horse-battery")
	if err != nil {
		t.Fatal(err)
	}
	if !ok {
		t.Fatal("expected verify ok")
	}
	if rehash {
		t.Fatal("current params should not need rehash")
	}
	ok, _, err = auth.VerifyPassword(hash, "wrong-password-xx")
	if err != nil {
		t.Fatal(err)
	}
	if ok {
		t.Fatal("wrong password must fail")
	}
}

func TestHashPasswordRejectsShort(t *testing.T) {
	if _, err := auth.HashPassword("short"); err == nil {
		t.Fatal("expected error")
	}
}

func TestTokenHashStable(t *testing.T) {
	tok, err := auth.GenerateToken(32)
	if err != nil {
		t.Fatal(err)
	}
	h1 := auth.HashToken(tok)
	h2 := auth.HashToken(tok)
	if h1 != h2 || len(h1) != 64 {
		t.Fatalf("hash mismatch %s %s", h1, h2)
	}
	if auth.EqualHash(h1, auth.HashToken("other")) {
		t.Fatal("different tokens must not equal")
	}
}

func TestNormalizeEmail(t *testing.T) {
	if got := auth.NormalizeEmail("  Alice@Example.COM "); got != "alice@example.com" {
		t.Fatalf("got %q", got)
	}
	if auth.NormalizeEmail("not-an-email") != "" {
		t.Fatal("expected empty")
	}
}

