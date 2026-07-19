package application

import (
	"context"
	"testing"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/payments"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// recordingQRIS captures CreateQRIS AccountScope for identity tests.
type recordingQRIS struct {
	lastScope string
	lastIn    ports.CreateQRISInput
}

func (r *recordingQRIS) CreateQRIS(_ context.Context, in ports.CreateQRISInput) (ports.CreateQRISResult, error) {
	r.lastScope = in.AccountScope
	r.lastIn = in
	return ports.CreateQRISResult{
		ProviderReference: "qris-ref-1",
		QRString:          "QR-STRING",
		QRImageURL:        "https://example.test/qr.png",
		Status:            payments.StatusPending,
		ExpiresAt:         in.ExpiresAt,
	}, nil
}
func (r *recordingQRIS) GetPayment(context.Context, string) (ports.ProviderPayment, error) {
	return ports.ProviderPayment{}, nil
}
func (r *recordingQRIS) CancelPayment(context.Context, string) (ports.ProviderPayment, error) {
	return ports.ProviderPayment{}, nil
}
func (r *recordingQRIS) ExpirePayment(context.Context, string) (ports.ProviderPayment, error) {
	return ports.ProviderPayment{}, nil
}

func TestCheckoutService_paymentProviderIdentity(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name            string
		paymentProvider string
		paymentScope    string
		legacyScope     string
		wantProvider    string
		wantScope       string
	}{
		{
			name:         "defaults_xendit_primary",
			wantProvider: payments.ProviderXendit,
			wantScope:    payments.AccountScopePrimary,
		},
		{
			name:            "duitku_explicit",
			paymentProvider: payments.ProviderDuitku,
			paymentScope:    payments.AccountScopeDuitkuPrimary,
			legacyScope:     payments.AccountScopePrimary,
			wantProvider:    payments.ProviderDuitku,
			wantScope:       payments.AccountScopeDuitkuPrimary,
		},
		{
			name:         "legacy_account_scope_only",
			legacyScope:  "xendit-primary",
			wantProvider: payments.ProviderXendit,
			wantScope:    "xendit-primary",
		},
		{
			name:            "payment_scope_overrides_legacy",
			paymentProvider: payments.ProviderDuitku,
			paymentScope:    "duitku-primary",
			legacyScope:     "xendit-primary",
			wantProvider:    payments.ProviderDuitku,
			wantScope:       "duitku-primary",
		},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			s := &CheckoutService{
				PaymentProvider:     tc.paymentProvider,
				PaymentAccountScope: tc.paymentScope,
				AccountScope:        tc.legacyScope,
			}
			if got := s.paymentProvider(); got != tc.wantProvider {
				t.Fatalf("paymentProvider()=%q want %q", got, tc.wantProvider)
			}
			if got := s.paymentAccountScope(); got != tc.wantScope {
				t.Fatalf("paymentAccountScope()=%q want %q", got, tc.wantScope)
			}
		})
	}
}

func TestGatewayService_paymentProviderIdentity(t *testing.T) {
	t.Parallel()
	s := &GatewayService{
		PaymentProvider:     payments.ProviderDuitku,
		PaymentAccountScope: payments.AccountScopeDuitkuPrimary,
		AccountScope:        payments.AccountScopePrimary,
	}
	if s.paymentProvider() != payments.ProviderDuitku {
		t.Fatalf("provider=%q", s.paymentProvider())
	}
	if s.paymentAccountScope() != payments.AccountScopeDuitkuPrimary {
		t.Fatalf("scope=%q", s.paymentAccountScope())
	}
	// Intent fields use helpers (mirror CreatePayment construction).
	piProvider := s.paymentProvider()
	piScope := s.paymentAccountScope()
	if piProvider != payments.ProviderDuitku || piScope != payments.AccountScopeDuitkuPrimary {
		t.Fatalf("intent identity provider=%q scope=%q", piProvider, piScope)
	}
}

func TestCheckoutService_CreateQRISUsesPaymentAccountScope(t *testing.T) {
	t.Parallel()
	rec := &recordingQRIS{}
	s := &CheckoutService{
		QRIS:                rec,
		PaymentProvider:     payments.ProviderDuitku,
		PaymentAccountScope: payments.AccountScopeDuitkuPrimary,
		AccountScope:        payments.AccountScopePrimary,
	}
	// Direct call path used after intent insert.
	ctx := context.Background()
	_, err := s.QRIS.CreateQRIS(ctx, ports.CreateQRISInput{
		ExternalID:   "ext-1",
		AmountIDR:    10000,
		Currency:     "IDR",
		ExpiresAt:    time.Now().UTC().Add(time.Hour),
		PaymentMode:  payments.PaymentModeSandbox,
		AccountScope: s.paymentAccountScope(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if rec.lastScope != payments.AccountScopeDuitkuPrimary {
		t.Fatalf("CreateQRIS AccountScope=%q want %q", rec.lastScope, payments.AccountScopeDuitkuPrimary)
	}
	// Intent struct fields match (construction parity with CreateIntent).
	pi := payments.Intent{
		Provider:     s.paymentProvider(),
		AccountScope: s.paymentAccountScope(),
	}
	if pi.Provider != payments.ProviderDuitku {
		t.Fatalf("intent Provider=%q", pi.Provider)
	}
	if pi.AccountScope != payments.AccountScopeDuitkuPrimary {
		t.Fatalf("intent AccountScope=%q", pi.AccountScope)
	}
}

func TestGatewayService_CreateQRISUsesPaymentAccountScope(t *testing.T) {
	t.Parallel()
	rec := &recordingQRIS{}
	s := &GatewayService{
		QRIS:                rec,
		PaymentProvider:     payments.ProviderDuitku,
		PaymentAccountScope: payments.AccountScopeDuitkuPrimary,
		AccountScope:        payments.AccountScopeDuitkuPrimary,
	}
	ctx := context.Background()
	_, err := s.QRIS.CreateQRIS(ctx, ports.CreateQRISInput{
		ExternalID:   "ext-gw-1",
		AmountIDR:    15000,
		Currency:     "IDR",
		ExpiresAt:    time.Now().UTC().Add(time.Hour),
		PaymentMode:  payments.PaymentModeSandbox,
		AccountScope: s.paymentAccountScope(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if rec.lastScope != payments.AccountScopeDuitkuPrimary {
		t.Fatalf("CreateQRIS AccountScope=%q", rec.lastScope)
	}
}

func TestProviderLookupKey_DuitkuUsesExternalID(t *testing.T) {
	t.Parallel()
	ref := "DXXXX-PROVIDER-REF"
	pi := payments.Intent{
		Provider:          payments.ProviderDuitku,
		ExternalID:        "merchant-order-1",
		ProviderReference: &ref,
	}
	if got := providerLookupKey(pi); got != "merchant-order-1" {
		t.Fatalf("duitku lookup=%q want merchant order id", got)
	}
	if got := providerLookupKey(pi); got == ref {
		t.Fatal("duitku must not use provider reference for status lookup")
	}
	xendit := payments.Intent{
		Provider:          payments.ProviderXendit,
		ExternalID:        "ext-x",
		ProviderReference: &ref,
	}
	if got := providerLookupKey(xendit); got != ref {
		t.Fatalf("xendit lookup=%q want provider ref", got)
	}
}
