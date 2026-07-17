package observability_test

import (
	"testing"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/observability"
)

func TestULIDLengthAndCharset(t *testing.T) {
	g := observability.NewULIDGenerator()
	id := g.New()
	if len(id) != 26 {
		t.Fatalf("len = %d, want 26, got %q", len(id), id)
	}
	const crockford = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
	for _, c := range id {
		if !containsRune(crockford, c) {
			t.Fatalf("invalid char %q in %q", c, id)
		}
	}
	// uniqueness smoke
	seen := map[string]struct{}{}
	for i := 0; i < 100; i++ {
		x := g.New()
		if _, ok := seen[x]; ok {
			t.Fatalf("duplicate ULID %q", x)
		}
		seen[x] = struct{}{}
	}
}

func containsRune(s string, r rune) bool {
	for _, c := range s {
		if c == r {
			return true
		}
	}
	return false
}
