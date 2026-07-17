package cursor_test

import (
	"testing"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/platform/cursor"
)

func TestEncodeDecodeRoundTrip(t *testing.T) {
	t.Parallel()
	ts := time.Date(2026, 7, 17, 12, 0, 0, 123456789, time.UTC)
	k := cursor.Key{CreatedAt: ts, ID: "01HZXEXAMPLEULID000000001"}
	enc, err := cursor.Encode(k)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	if enc == "" {
		t.Fatal("expected non-empty cursor")
	}
	got, err := cursor.Decode(enc)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !got.CreatedAt.Equal(ts.UTC()) {
		t.Fatalf("created_at: got %v want %v", got.CreatedAt, ts.UTC())
	}
	if got.ID != k.ID {
		t.Fatalf("id: got %q want %q", got.ID, k.ID)
	}
}

func TestDecodeRejectsGarbage(t *testing.T) {
	t.Parallel()
	cases := []string{"", "not-base64!!!", "e30", "~~~~"}
	for _, c := range cases {
		if _, err := cursor.Decode(c); err == nil {
			t.Fatalf("expected error for %q", c)
		}
	}
}

func TestEncodeRejectsEmpty(t *testing.T) {
	t.Parallel()
	if _, err := cursor.Encode(cursor.Key{}); err == nil {
		t.Fatal("expected error for empty key")
	}
	if _, err := cursor.Encode(cursor.Key{ID: "x"}); err == nil {
		t.Fatal("expected error for zero time")
	}
}

func TestLessDescOrder(t *testing.T) {
	t.Parallel()
	t1 := time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC)
	t0 := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	newer := cursor.Key{CreatedAt: t1, ID: "01AAA"}
	older := cursor.Key{CreatedAt: t0, ID: "01ZZZ"}
	if !cursor.LessDesc(newer, older) {
		t.Fatal("newer should sort before older in DESC order")
	}
	if cursor.LessDesc(older, newer) {
		t.Fatal("older should not sort before newer")
	}
	// Same timestamp: higher id first in DESC
	a := cursor.Key{CreatedAt: t1, ID: "01BBB"}
	b := cursor.Key{CreatedAt: t1, ID: "01AAA"}
	if !cursor.LessDesc(a, b) {
		t.Fatal("higher id should come first when times equal")
	}
}

func TestOpaqueNotPlainJSON(t *testing.T) {
	t.Parallel()
	enc, err := cursor.Encode(cursor.Key{
		CreatedAt: time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC),
		ID:        "01TEST",
	})
	if err != nil {
		t.Fatal(err)
	}
	if enc[0] == '{' {
		t.Fatal("cursor must be opaque, not raw JSON")
	}
}
