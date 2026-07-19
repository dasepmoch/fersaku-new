package xendit

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

func TestNewReal_RequiresSecret(t *testing.T) {
	_, err := NewReal("xendit-primary", "", "")
	if err == nil {
		t.Fatal("expected error without secret")
	}
}

func TestReal_CreateQRIS_MapsResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/qr_codes" {
			t.Fatalf("unexpected %s %s", r.Method, r.URL.Path)
		}
		if u, p, ok := r.BasicAuth(); !ok || u != "test-secret" || p != "" {
			t.Fatalf("basic auth missing/wrong")
		}
		if r.Header.Get("Idempotency-key") != "idem-1" {
			t.Fatalf("idempotency header missing")
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id":         "qr_abc",
			"external_id": "ext-1",
			"amount":     10000,
			"currency":   "IDR",
			"status":     "ACTIVE",
			"qr_string":  "000201FAKE",
			"expires_at": time.Now().UTC().Add(time.Hour).Format(time.RFC3339),
		})
	}))
	defer srv.Close()

	r, err := NewReal("xendit-primary", "test-secret", srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	r.HTTPClient = srv.Client()

	out, err := r.CreateQRIS(context.Background(), ports.CreateQRISInput{
		ExternalID:     "ext-1",
		AmountIDR:      10000,
		Currency:       "IDR",
		IdempotencyKey: "idem-1",
		PaymentMode:    "SANDBOX",
	})
	if err != nil {
		t.Fatal(err)
	}
	if out.ProviderReference != "qr_abc" || out.Status != "PENDING" || out.QRString == "" {
		t.Fatalf("unexpected result %+v", out)
	}
}

func TestReal_ClassifiesTimeout(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(50 * time.Millisecond)
		w.WriteHeader(200)
	}))
	defer srv.Close()

	r, err := NewReal("xendit-primary", "test-secret", srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	r.HTTPClient = &http.Client{Timeout: 5 * time.Millisecond}

	_, err = r.GetPayment(context.Background(), "qr_x")
	if err == nil {
		t.Fatal("expected timeout error")
	}
	pe, ok := err.(*ports.ProviderError)
	if !ok || pe.Class != ports.ProviderTimeout {
		t.Fatalf("expected TIMEOUT, got %T %v", err, err)
	}
	if !pe.RequestSent {
		t.Fatal("timeout after send should set RequestSent")
	}
}

func TestReal_ClassifiesRateLimit(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = io.WriteString(w, `{"error":"rate"}`)
	}))
	defer srv.Close()

	r, err := NewReal("xendit-primary", "test-secret", srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	r.HTTPClient = srv.Client()

	_, err = r.GetPayment(context.Background(), "qr_x")
	pe, ok := err.(*ports.ProviderError)
	if !ok || pe.Class != ports.ProviderRateLimited {
		t.Fatalf("expected RATE_LIMITED, got %v", err)
	}
}

func TestReal_CreateDisbursement_IdempotencyHeader(t *testing.T) {
	var sawIdem string
	var sawXIdem string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sawIdem = r.Header.Get("Idempotency-key")
		sawXIdem = r.Header.Get("X-Idempotency-Key")
		if strings.Contains(r.URL.Path, "payouts") {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"id":          "po_1",
				"external_id": "wd_1",
				"amount":      50000,
				"status":      "ACCEPTED",
				"fee":         2500,
			})
			return
		}
		w.WriteHeader(404)
	}))
	defer srv.Close()

	r, err := NewReal("xendit-primary", "test-secret", srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	r.HTTPClient = srv.Client()

	out, err := r.CreateDisbursement(context.Background(), ports.CreateDisbursementInput{
		ExternalID:        "wd_1",
		NetAmountIDR:      50000,
		BankCode:          "BCA",
		AccountHolderName: "A",
		AccountNumber:     "1234567890",
		IdempotencyKey:    "idem-disb",
	})
	if err != nil {
		t.Fatal(err)
	}
	if sawIdem != "idem-disb" || sawXIdem != "idem-disb" {
		t.Fatalf("idempotency key=%q x=%q", sawIdem, sawXIdem)
	}
	if out.ProviderReference != "po_1" || out.Status != "PENDING" {
		t.Fatalf("%+v", out)
	}
	if out.ProviderFeeIDR == nil || *out.ProviderFeeIDR != 2500 {
		t.Fatalf("fee %+v", out.ProviderFeeIDR)
	}
}

func TestMapDisburseStatus(t *testing.T) {
	cases := map[string]string{
		"ACCEPTED":   "PENDING",
		"pending":    "PENDING",
		"LOCKED":     "PENDING",
		"REQUESTED":  "PENDING",
		"PROCESSING": "PROCESSING",
		"SENDING":    "PROCESSING",
		"COMPLETED":  "COMPLETED",
		"SUCCEEDED":  "COMPLETED",
		"SUCCESS":    "COMPLETED",
		"PAID":       "COMPLETED",
		"FAILED":     "FAILED",
		"REJECTED":   "FAILED",
		"CANCELLED":  "FAILED",
		"CANCELED":   "FAILED",
		"REVERSED":   "FAILED",
		"NOT_FOUND":  "NOT_FOUND",
		"":           "UNKNOWN",
		"weird":      "WEIRD",
	}
	for in, want := range cases {
		if got := MapDisburseStatus(in); got != want {
			t.Fatalf("MapDisburseStatus(%q)=%q want %q", in, got, want)
		}
	}
}

func TestReal_QuoteDisbursement(t *testing.T) {
	r, err := NewReal("xendit-primary", "test-secret", "https://api.xendit.co")
	if err != nil {
		t.Fatal(err)
	}
	q, err := r.QuoteDisbursement(context.Background(), ports.DisbursementQuoteInput{
		AmountIDR: 100_000,
		Currency:  "IDR",
		BankCode:  "BCA",
	})
	if err != nil {
		t.Fatal(err)
	}
	if q.ProviderFeeIDR != 2500 || q.Evidence == "" || q.ProviderReference == "" {
		t.Fatalf("%+v", q)
	}
}

func TestReal_CreateDisbursement_FallsBackToV1(t *testing.T) {
	var paths []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		if r.URL.Path == "/v2/payouts" {
			w.WriteHeader(http.StatusNotFound)
			_, _ = io.WriteString(w, `{"error":"not found"}`)
			return
		}
		if r.URL.Path == "/disbursements" {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"id":          "disb_v1",
				"external_id": "wd_v1",
				"amount":      94500,
				"status":      "COMPLETED",
				"fee":         2500,
			})
			return
		}
		w.WriteHeader(500)
	}))
	defer srv.Close()

	r, err := NewReal("xendit-primary", "test-secret", srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	r.HTTPClient = srv.Client()

	out, err := r.CreateDisbursement(context.Background(), ports.CreateDisbursementInput{
		ExternalID:        "wd_v1",
		NetAmountIDR:      94500,
		BankCode:          "BCA",
		AccountHolderName: "A",
		AccountNumber:     "1234567890",
		IdempotencyKey:    "idem-v1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if out.ProviderReference != "disb_v1" || out.Status != "COMPLETED" {
		t.Fatalf("%+v", out)
	}
	if len(paths) < 2 || paths[0] != "/v2/payouts" || paths[1] != "/disbursements" {
		t.Fatalf("paths=%v", paths)
	}
}

func TestReal_GetDisbursement_PayoutsThenV1(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v2/payouts/po_done" {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"id":          "po_done",
				"external_id": "wd_done",
				"amount":      94500,
				"status":      "SUCCEEDED",
				"fee":         2500,
				"bank_code":   "BCA",
			})
			return
		}
		w.WriteHeader(404)
	}))
	defer srv.Close()

	r, err := NewReal("xendit-primary", "test-secret", srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	r.HTTPClient = srv.Client()

	out, err := r.GetDisbursement(context.Background(), "po_done")
	if err != nil {
		t.Fatal(err)
	}
	if out.Status != "COMPLETED" || out.ProviderReference != "po_done" {
		t.Fatalf("%+v", out)
	}
}

func TestReal_CreateDisbursement_RejectsInvalidAmount(t *testing.T) {
	r, err := NewReal("xendit-primary", "test-secret", "https://api.xendit.co")
	if err != nil {
		t.Fatal(err)
	}
	_, err = r.CreateDisbursement(context.Background(), ports.CreateDisbursementInput{NetAmountIDR: 0})
	pe, ok := err.(*ports.ProviderError)
	if !ok || pe.Class != ports.ProviderRejected {
		t.Fatalf("got %v", err)
	}
}

func TestReal_CreateDisbursement_ClassifiesAuthFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()
	r, err := NewReal("xendit-primary", "test-secret", srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	r.HTTPClient = srv.Client()
	_, err = r.CreateDisbursement(context.Background(), ports.CreateDisbursementInput{
		ExternalID:   "wd_auth",
		NetAmountIDR: 1000,
		BankCode:     "BCA",
	})
	pe, ok := err.(*ports.ProviderError)
	if !ok || pe.Class != ports.ProviderAuthFailure {
		t.Fatalf("got %v", err)
	}
}

func TestReal_GetDisbursement_EmptyRef(t *testing.T) {
	r, err := NewReal("xendit-primary", "test-secret", "https://api.xendit.co")
	if err != nil {
		t.Fatal(err)
	}
	_, err = r.GetDisbursement(context.Background(), "  ")
	pe, ok := err.(*ports.ProviderError)
	if !ok || pe.Class != ports.ProviderRejected {
		t.Fatalf("got %v", err)
	}
}

func TestReal_NameDoesNotLeakSecret(t *testing.T) {
	r, err := NewReal("xendit-primary", "super-secret-key-value", "")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(r.Name(), "super-secret") {
		t.Fatalf("name leaked secret: %s", r.Name())
	}
	if r.IsFake() {
		t.Fatal("real must not report IsFake")
	}
}

func TestRedactPath(t *testing.T) {
	if got := redactPath("/qr_codes/secret-id-xyz"); got == "/qr_codes/secret-id-xyz" {
		t.Fatalf("expected redacted path, got %q", got)
	}
}
