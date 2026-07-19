package payments

import (
	"net/url"
	"testing"
)

func TestParseDuitkuEnvelope_JSONPaid(t *testing.T) {
	body := []byte(`{
		"merchantCode": "DXXXX",
		"amount": "10000",
		"merchantOrderId": "ext-order-1",
		"productDetail": "Test",
		"paymentCode": "SP",
		"resultCode": "00",
		"merchantUserId": "",
		"reference": "DXXXXREF001",
		"signature": "abc",
		"publisherOrderId": "pub1",
		"settlementDate": "2026-07-19",
		"issuerCode": "QRIS"
	}`)
	n, err := ParseDuitkuEnvelope(body)
	if err != nil {
		t.Fatal(err)
	}
	if n.NormalizedType != NormalizedPaid || n.Status != StatusPaid {
		t.Fatalf("normalized=%q status=%q", n.NormalizedType, n.Status)
	}
	if n.ExternalID != "ext-order-1" {
		t.Fatalf("external %q", n.ExternalID)
	}
	if n.ProviderReference != "DXXXXREF001" {
		t.Fatalf("ref %q", n.ProviderReference)
	}
	if n.ProviderEventID != "DXXXXREF001:00" {
		t.Fatalf("event id %q", n.ProviderEventID)
	}
	if n.AmountIDR != 10000 {
		t.Fatalf("amount %d", n.AmountIDR)
	}
	if n.Currency != CurrencyIDR {
		t.Fatalf("currency %q", n.Currency)
	}
}

func TestParseDuitkuEnvelope_FormPending(t *testing.T) {
	form := url.Values{}
	form.Set("merchantCode", "DXXXX")
	form.Set("paymentAmount", "25000")
	form.Set("merchantOrderId", "ord-2")
	form.Set("resultCode", "01")
	form.Set("reference", "REF2")
	form.Set("signature", "sig")
	n, err := ParseDuitkuEnvelope([]byte(form.Encode()))
	if err != nil {
		t.Fatal(err)
	}
	if n.NormalizedType != NormalizedPending || n.Status != StatusPending {
		t.Fatalf("normalized=%q status=%q", n.NormalizedType, n.Status)
	}
	if n.AmountIDR != 25000 {
		t.Fatalf("amount %d", n.AmountIDR)
	}
	if n.ProviderEventID != "REF2:01" {
		t.Fatalf("event id %q", n.ProviderEventID)
	}
}

func TestParseDuitkuEnvelope_FailedCancelled(t *testing.T) {
	body := []byte(`{"merchantOrderId":"o1","resultCode":"02","reference":"R1","amount":1000,"statusMessage":"canceled by user"}`)
	n, err := ParseDuitkuEnvelope(body)
	if err != nil {
		t.Fatal(err)
	}
	if n.NormalizedType != NormalizedCancelled {
		t.Fatalf("want CANCELLED got %q", n.NormalizedType)
	}
	body2 := []byte(`{"merchantOrderId":"o2","resultCode":"02","reference":"R2","amount":1000}`)
	n2, err := ParseDuitkuEnvelope(body2)
	if err != nil {
		t.Fatal(err)
	}
	if n2.NormalizedType != NormalizedFailed {
		t.Fatalf("want FAILED got %q", n2.NormalizedType)
	}
}

func TestParseDuitkuEnvelope_ExpiredMessage(t *testing.T) {
	body := []byte(`{"merchantOrderId":"o3","resultCode":"","reference":"R3","amount":1000,"statusMessage":"Transaction expired"}`)
	n, err := ParseDuitkuEnvelope(body)
	if err != nil {
		t.Fatal(err)
	}
	if n.NormalizedType != NormalizedExpired {
		t.Fatalf("want EXPIRED got %q", n.NormalizedType)
	}
}

func TestParseDuitkuEnvelope_JSONNumericAmount(t *testing.T) {
	body := []byte(`{"merchantOrderId":"o4","resultCode":"00","reference":"R4","amount":15000}`)
	n, err := ParseDuitkuEnvelope(body)
	if err != nil {
		t.Fatal(err)
	}
	if n.AmountIDR != 15000 {
		t.Fatalf("amount %d", n.AmountIDR)
	}
}

func TestParseDuitkuEnvelope_Malformed(t *testing.T) {
	_, err := ParseDuitkuEnvelope([]byte(`not-json-or-form===`))
	if err == nil {
		// ParseQuery may succeed on garbage; empty-ish is still an error path for {}.
		t.Log("parse may accept odd form strings")
	}
	_, err = ParseDuitkuEnvelope([]byte(`{bad`))
	if err == nil {
		t.Fatal("expected json error")
	}
	_, err = ParseDuitkuEnvelope(nil)
	if err == nil {
		t.Fatal("expected empty error")
	}
}

func TestParseDuitkuCallbackFields_SignatureInputs(t *testing.T) {
	body := []byte(`{"merchantCode":"DXXXX","amount":"10000","merchantOrderId":"ord","signature":"deadbeef","resultCode":"00","reference":"REF"}`)
	f, err := ParseDuitkuCallbackFields(body)
	if err != nil {
		t.Fatal(err)
	}
	if f.MerchantCode != "DXXXX" || f.Amount != "10000" || f.MerchantOrderID != "ord" || f.Signature != "deadbeef" {
		t.Fatalf("%+v", f)
	}
}

func TestMapDuitkuResultCode_Table(t *testing.T) {
	cases := []struct {
		code, msg, wantNorm, wantStatus string
	}{
		{"00", "", NormalizedPaid, StatusPaid},
		{"01", "process", NormalizedPending, StatusPending},
		{"02", "failed", NormalizedFailed, StatusFailed},
		{"02", "canceled", NormalizedCancelled, StatusCancelled},
		{"", "expired", NormalizedExpired, StatusExpired},
	}
	for _, c := range cases {
		n, s := mapDuitkuResultCode(c.code, c.msg)
		if n != c.wantNorm || s != c.wantStatus {
			t.Fatalf("code=%q msg=%q → %q/%q want %q/%q", c.code, c.msg, n, s, c.wantNorm, c.wantStatus)
		}
	}
}
