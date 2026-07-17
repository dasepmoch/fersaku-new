package stores

import "testing"

func TestNormalizeSlug(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"Asep AI Tools", "asep-ai-tools"},
		{"  Hello--World  ", "hello-world"},
		{"Foo_Bar", "foo-bar"},
		{"---ab---", "ab"},
		{"Admin", "admin"},
		{"", ""},
		{"Toko#1!", "toko-1"},
	}
	for _, tc := range cases {
		if got := NormalizeSlug(tc.in); got != tc.want {
			t.Fatalf("NormalizeSlug(%q)=%q want %q", tc.in, got, tc.want)
		}
	}
}

func TestValidateNormalizedSlug(t *testing.T) {
	if err := ValidateNormalizedSlug("ab"); err == nil {
		t.Fatal("expected too short")
	}
	if err := ValidateNormalizedSlug("admin"); err != ErrSlugReserved {
		t.Fatalf("admin reserved: %v", err)
	}
	if err := ValidateNormalizedSlug("fersaku"); err != ErrSlugReserved {
		t.Fatalf("fersaku reserved: %v", err)
	}
	if err := ValidateNormalizedSlug("asep-ai-tools"); err != nil {
		t.Fatal(err)
	}
	if _, err := NormalizeAndValidateSlug("My Cool Shop"); err != nil {
		t.Fatal(err)
	}
	if _, err := NormalizeAndValidateSlug("x"); err == nil {
		t.Fatal("expected invalid short")
	}
}

func TestHasIdentityAndCanComplete(t *testing.T) {
	if HasIdentity("ab", "short") {
		t.Fatal("expected false")
	}
	if !HasIdentity("Asep Tools", "Digital tools for creators and teams.") {
		t.Fatal("expected true")
	}
	st := &Store{
		Slug:        "asep-tools",
		Name:        "Asep Tools",
		Bio:         "Digital tools for creators and teams.",
		IsCanonical: true,
		Status:      "ACTIVE",
	}
	if !CanCompleteOnboarding(st) {
		t.Fatal("expected can complete")
	}
	st.Slug = "admin"
	if CanCompleteOnboarding(st) {
		t.Fatal("reserved slug cannot complete")
	}
	st.Slug = "asep-tools"
	st.IsCanonical = false
	if CanCompleteOnboarding(st) {
		t.Fatal("non-canonical cannot complete")
	}
}
