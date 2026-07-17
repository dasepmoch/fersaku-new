package xendit

import (
	"context"
	"testing"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

func TestFakeCreateGetExpireDeterministic(t *testing.T) {
	f := NewFake()
	ctx := context.Background()
	in := ports.CreateQRISInput{
		ExternalID:  "ext-1",
		AmountIDR:   100_000,
		Currency:    "IDR",
		ExpiresAt:   time.Now().UTC().Add(30 * time.Minute),
		PaymentMode: "SANDBOX",
	}
	a, err := f.CreateQRIS(ctx, in)
	if err != nil {
		t.Fatal(err)
	}
	b, err := f.CreateQRIS(ctx, in)
	if err != nil {
		t.Fatal(err)
	}
	if a.ProviderReference != b.ProviderReference || a.QRString != b.QRString {
		t.Fatalf("not deterministic: %+v vs %+v", a, b)
	}
	if a.Status != "PENDING" {
		t.Fatalf("status %s", a.Status)
	}
	got, err := f.GetPayment(ctx, a.ProviderReference)
	if err != nil || got.Status != "PENDING" || got.AmountIDR != 100_000 {
		t.Fatalf("get %+v err=%v", got, err)
	}
	exp, err := f.ExpirePayment(ctx, a.ProviderReference)
	if err != nil || exp.Status != "EXPIRED" {
		t.Fatalf("expire %+v err=%v", exp, err)
	}
}

func TestFakeTimeoutCreate(t *testing.T) {
	f := NewFake()
	f.ForceTimeoutCreate = true
	_, err := f.CreateQRIS(context.Background(), ports.CreateQRISInput{
		ExternalID: "x", AmountIDR: 1000, Currency: "IDR", PaymentMode: "SANDBOX",
	})
	pe, ok := err.(*ports.ProviderError)
	if !ok || !pe.IsUnknownOutcome() || !pe.RequestSent {
		t.Fatalf("err=%v", err)
	}
}
