package payments

import "testing"

func TestParseXenditEnvelope_PaidQR(t *testing.T) {
	body := []byte(`{
		"event": "qr.payment",
		"id": "evt_paid_1",
		"data": {
			"id": "xendit_qr_abc",
			"external_id": "ext-order-1",
			"status": "SUCCEEDED",
			"amount": 100000,
			"currency": "IDR"
		}
	}`)
	n, err := ParseXenditEnvelope(body)
	if err != nil {
		t.Fatal(err)
	}
	if n.ProviderEventID != "evt_paid_1" {
		t.Fatalf("event id %q", n.ProviderEventID)
	}
	if n.NormalizedType != NormalizedPaid {
		t.Fatalf("normalized %q", n.NormalizedType)
	}
	if n.ProviderReference != "xendit_qr_abc" {
		t.Fatalf("ref %q", n.ProviderReference)
	}
	if n.AmountIDR != 100000 {
		t.Fatalf("amount %d", n.AmountIDR)
	}
	if n.ExternalID != "ext-order-1" {
		t.Fatalf("external %q", n.ExternalID)
	}
}

func TestParseXenditEnvelope_Malformed(t *testing.T) {
	_, err := ParseXenditEnvelope([]byte(`not-json`))
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestFingerprintEventID_Stable(t *testing.T) {
	a := FingerprintEventID("xendit-primary", "SANDBOX", "ref1", "PAID", "digest")
	b := FingerprintEventID("xendit-primary", "SANDBOX", "ref1", "PAID", "digest")
	if a != b || a[:3] != "fp_" {
		t.Fatalf("fingerprint %q %q", a, b)
	}
}

func TestJournalReferencePaid(t *testing.T) {
	if JournalReferencePaid("pi_1") != "PAYMENT_CAPTURE:pi_1" {
		t.Fatal(JournalReferencePaid("pi_1"))
	}
}
