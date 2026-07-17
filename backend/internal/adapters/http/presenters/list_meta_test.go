package presenters_test

import (
	"testing"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/platform/cursor"
)

func TestListMetaCursor(t *testing.T) {
	k := cursor.Key{CreatedAt: time.Date(2026, 7, 16, 12, 0, 0, 0, time.UTC), ID: "01TESTID000000000000000000"}
	m := presenters.ListMeta("req_1", time.Now().UTC(), &k, true)
	if m.HasMore == nil || !*m.HasMore {
		t.Fatal("hasMore")
	}
	if m.NextCursor == nil || *m.NextCursor == "" {
		t.Fatal("nextCursor")
	}
	decoded, err := cursor.Decode(*m.NextCursor)
	if err != nil {
		t.Fatal(err)
	}
	if decoded.ID != k.ID {
		t.Fatalf("id %q", decoded.ID)
	}

	m2 := presenters.ListMeta("req_1", time.Now().UTC(), &k, false)
	if m2.HasMore == nil || *m2.HasMore {
		t.Fatal("hasMore should be false")
	}
	if m2.NextCursor != nil {
		t.Fatal("nextCursor should be omitted when !hasMore")
	}
}
