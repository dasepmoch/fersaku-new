package webhooks

import (
	"testing"
)

func TestSignPayload_StableBodyFreshTimestamp(t *testing.T) {
	secret := "whsec_test_secret"
	body := []byte(`{"eventId":"evt_1","type":"payment.paid"}`)
	s1 := SignPayload(secret, 1000, "evt_1", body)
	s2 := SignPayload(secret, 1000, "evt_1", body)
	if s1 != s2 {
		t.Fatalf("same inputs must match: %s vs %s", s1, s2)
	}
	s3 := SignPayload(secret, 1001, "evt_1", body)
	if s1 == s3 {
		t.Fatal("fresh timestamp must change signature")
	}
	// Retry preserves event + body; only timestamp/signature change.
	s4 := SignPayload(secret, 2000, "evt_1", body)
	if s4 == s1 {
		t.Fatal("retry timestamp must change signature")
	}
	// Body change must change signature at same timestamp.
	s5 := SignPayload(secret, 1000, "evt_1", []byte(`{"other":true}`))
	if s5 == s1 {
		t.Fatal("body change must change signature")
	}
}

func TestStablePaymentPaidEventID(t *testing.T) {
	a := StablePaymentPaidEventID("pi_1")
	b := StablePaymentPaidEventID("pi_1")
	if a != b || a != "evt_payment.paid:pi_1" {
		t.Fatalf("got %s", a)
	}
}
