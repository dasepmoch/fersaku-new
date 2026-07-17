package seed

import (
	"testing"
)

func TestGuardNonProduction_RefusesProduction(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	err := GuardNonProduction()
	if err == nil {
		t.Fatal("expected refuse on production")
	}
}

func TestGuardNonProduction_AllowsLocalStagingTest(t *testing.T) {
	for _, env := range []string{"", "local", "staging", "test", "dev"} {
		t.Setenv("APP_ENV", env)
		if err := GuardNonProduction(); err != nil {
			t.Fatalf("APP_ENV=%q should allow seed: %v", env, err)
		}
	}
}

func TestIDsDeterministic(t *testing.T) {
	if ID(1) != ID(1) || ID(1) == ID(2) {
		t.Fatal("IDs must be stable and unique")
	}
	if len(ID(1)) != 26 {
		t.Fatalf("ULID-shaped length want 26 got %d", len(ID(1)))
	}
	if PasswordHash() != PasswordHash() {
		t.Fatal("password hash must be deterministic")
	}
}

func TestPersonasTableComplete(t *testing.T) {
	want := []string{
		PersonaBuyerA, PersonaBuyerB, PersonaSellerOwnerA, PersonaSellerMemberRead,
		PersonaSellerB, PersonaAdminSuper, PersonaAdminSupport, PersonaAdminFinance,
		PersonaAdminNoAccess,
	}
	got := Personas()
	if len(got) != len(want) {
		t.Fatalf("personas len %d want %d", len(got), len(want))
	}
	seen := map[string]bool{}
	for _, p := range got {
		if p.UserID == "" || p.Email == "" {
			t.Fatalf("persona %s missing id/email", p.Key)
		}
		if seen[p.Key] {
			t.Fatalf("duplicate persona key %s", p.Key)
		}
		seen[p.Key] = true
	}
	for _, k := range want {
		if !seen[k] {
			t.Fatalf("missing persona %s", k)
		}
	}
}
