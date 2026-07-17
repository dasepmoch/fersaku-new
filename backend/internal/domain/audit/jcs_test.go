package audit

import (
	"bytes"
	"testing"
	"time"
)

func TestCanonicalizeLogicalEvent_StableKeys(t *testing.T) {
	at := time.Date(2026, 7, 17, 1, 2, 3, 456789000, time.UTC)
	e := LogicalEvent{
		EventID:      "aud_01",
		Action:       "platform.emergency.update",
		ResourceType: "emergency_control",
		ResourceID:   "QRIS_CHECKOUT",
		ActorUserID:  "user_1",
		Reason:       "incident",
		OccurredAt:   at,
		Before:       map[string]any{"enabled": true, "version": int64(1)},
		After:        map[string]any{"enabled": false, "version": int64(2)},
		Metadata:     map[string]any{"ticket": "INC-1"},
	}
	a, err := CanonicalizeLogicalEvent(e)
	if err != nil {
		t.Fatal(err)
	}
	b, err := CanonicalizeLogicalEvent(e)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(a, b) {
		t.Fatalf("not stable:\n%s\n%s", a, b)
	}
	// Keys must be sorted; action before actorUserId before eventId...
	if !bytes.Contains(a, []byte(`"action":"platform.emergency.update"`)) {
		t.Fatalf("missing action: %s", a)
	}
	if bytes.Contains(a, []byte(" ")) {
		t.Fatalf("JCS must not contain spaces: %s", a)
	}
}

func TestComputeRowHash_Genesis(t *testing.T) {
	payload := []byte(`{"action":"test","eventId":"e1"}`)
	h1 := ComputeRowHash(1, GenesisPrevHash(), CanonicalVersionLaunch, payload)
	if len(h1) != 32 {
		t.Fatalf("hash len %d", len(h1))
	}
	h2 := ComputeRowHash(1, GenesisPrevHash(), CanonicalVersionLaunch, payload)
	if !bytes.Equal(h1, h2) {
		t.Fatal("not deterministic")
	}
	h3 := ComputeRowHash(2, h1, CanonicalVersionLaunch, payload)
	if bytes.Equal(h1, h3) {
		t.Fatal("seq change must change hash")
	}
}
