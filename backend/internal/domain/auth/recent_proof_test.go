package auth

import (
	"testing"
	"time"
)

func TestValidProofPurpose(t *testing.T) {
	t.Parallel()
	ok := []string{
		ProofPurposeInventoryReveal,
		ProofPurposeCredentialsRotate,
		ProofPurposeBankChange,
		ProofPurposeWithdrawalCreate,
		ProofPurposeAdminCommand,
		ProofPurposeKYCDocumentView,
	}
	for _, p := range ok {
		if !ValidProofPurpose(p) {
			t.Fatalf("expected valid purpose %q", p)
		}
	}
	if ValidProofPurpose("totp") || ValidProofPurpose("") || ValidProofPurpose("admin") {
		t.Fatal("invalid purposes must be rejected")
	}
}

func TestRecentMFAProofIsUsable(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 7, 17, 12, 0, 0, 0, time.UTC)
	p := RecentMFAProof{ExpiresAt: now.Add(time.Minute)}
	if !p.IsUsable(now) {
		t.Fatal("expected usable")
	}
	if p.IsUsable(now.Add(2 * time.Minute)) {
		t.Fatal("expected expired")
	}
	consumed := now
	p.ConsumedAt = &consumed
	if p.IsUsable(now) {
		t.Fatal("expected consumed unusable")
	}
}
