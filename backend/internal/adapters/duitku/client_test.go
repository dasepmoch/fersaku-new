package duitku

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

func TestNewReal_RequiresCredentials(t *testing.T) {
	if _, err := NewReal("", "key", "", "", "", "", ""); err == nil {
		t.Fatal("expected error without merchant code")
	}
	if _, err := NewReal("DXXXX", "", "", "", "", "", ""); err == nil {
		t.Fatal("expected error without api key")
	}
}

func TestInquirySignature_KnownFixture(t *testing.T) {
	// MD5(merchantCode + merchantOrderId + paymentAmount + apiKey) lowercase hex
	got := InquirySignature("DXXXX", "order-1", "10000", "fake-api-key")
	want := md5Hex("DXXXXorder-110000fake-api-key")
	if got != want {
		t.Fatalf("signature=%q want %q", got, want)
	}
	if got != strings.ToLower(got) {
		t.Fatal("signature must be lowercase hex")
	}
	if len(got) != 32 {
		t.Fatalf("md5 hex length=%d", len(got))
	}
}

func TestStatusSignature_KnownFixture(t *testing.T) {
	got := StatusSignature("DXXXX", "order-1", "fake-api-key")
	want := md5Hex("DXXXXorder-1fake-api-key")
	if got != want {
		t.Fatalf("signature=%q want %q", got, want)
	}
}

func TestCallbackSignature_KnownFixture(t *testing.T) {
	// MD5(merchantCode + amount + merchantOrderId + apiKey) lowercase hex
	got := CallbackSignature("DXXXX", "10000", "order-1", "fake-api-key")
	want := md5Hex("DXXXX10000order-1fake-api-key")
	if got != want {
		t.Fatalf("signature=%q want %q", got, want)
	}
	if got != strings.ToLower(got) || len(got) != 32 {
		t.Fatalf("signature must be lowercase 32-hex, got %q", got)
	}
	if !VerifyCallbackSignature("DXXXX", "10000", "order-1", "fake-api-key", got) {
		t.Fatal("verify should accept matching signature")
	}
	if !VerifyCallbackSignature("DXXXX", "10000", "order-1", "fake-api-key", strings.ToUpper(got)) {
		t.Fatal("verify should accept uppercase hex")
	}
	if VerifyCallbackSignature("DXXXX", "10000", "order-1", "fake-api-key", "deadbeef") {
		t.Fatal("verify should reject bad signature")
	}
	if VerifyCallbackSignature("DXXXX", "10000", "order-1", "fake-api-key", "") {
		t.Fatal("verify should reject empty signature")
	}
}

func TestMerchantCodeEqual(t *testing.T) {
	if !MerchantCodeEqual("DXXXX", "DXXXX") {
		t.Fatal("same")
	}
	if MerchantCodeEqual("DXXXX", "DYYYY") {
		t.Fatal("different")
	}
	if MerchantCodeEqual("DXXXX", "") {
		t.Fatal("empty want")
	}
	if MerchantCodeEqual("short", "longer-code") {
		t.Fatal("length mismatch")
	}
}

func TestMapStatus_Table(t *testing.T) {
	cases := []struct {
		code, msg, want string
	}{
		{"00", "Success", "PAID"},
		{"00", "paid", "PAID"},
		{"01", "process", "PENDING"},
		{"01", "pending", "PENDING"},
		{"02", "canceled", "CANCELLED"},
		{"02", "failed", "FAILED"},
		{"", "expired", "EXPIRED"},
		{"", "Success", "PAID"},
		{"", "process", "PENDING"},
		{"99", "weird", "UNKNOWN"},
		{"", "", "UNKNOWN"},
	}
	for _, tc := range cases {
		if got := MapStatus(tc.code, tc.msg); got != tc.want {
			t.Errorf("MapStatus(%q,%q)=%q want %q", tc.code, tc.msg, got, tc.want)
		}
	}
}

func TestReal_CreateQRIS_MapsResponse(t *testing.T) {
	var sawSig string
	var sawOrder string
	var sawMethod string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != pathInquiry {
			t.Fatalf("unexpected %s %s", r.Method, r.URL.Path)
		}
		raw, _ := io.ReadAll(r.Body)
		var body map[string]any
		if err := json.Unmarshal(raw, &body); err != nil {
			t.Fatalf("body: %v", err)
		}
		sawSig, _ = body["signature"].(string)
		sawOrder, _ = body["merchantOrderId"].(string)
		sawMethod, _ = body["paymentMethod"].(string)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"merchantCode":    "DXXXX",
			"reference":       "DXXXXABC123",
			"paymentUrl":      "https://sandbox.duitku.com/topayment/qr/xxx",
			"amount":          "10000",
			"statusCode":      "00",
			"statusMessage":   "SUCCESS",
			"qrString":        "00020101021226650016ID.CO.QRIS.WWW0118936000000000000000",
			"qrUrl":           "https://sandbox.duitku.com/qr/img/xxx.png",
			"merchantOrderId": "ext-1",
		})
	}))
	defer srv.Close()

	r, err := NewReal("DXXXX", "fake-api-key", srv.URL, "https://api.example/cb", "https://app.example/return", "SP", "duitku-primary")
	if err != nil {
		t.Fatal(err)
	}
	r.HTTPClient = srv.Client()

	out, err := r.CreateQRIS(context.Background(), ports.CreateQRISInput{
		ExternalID:     "ext-1",
		AmountIDR:      10000,
		Currency:       "IDR",
		Description:    "Test QRIS",
		IdempotencyKey: "ext-1",
		PaymentMode:    "SANDBOX",
		ExpiresAt:      time.Now().UTC().Add(30 * time.Minute),
	})
	if err != nil {
		t.Fatal(err)
	}
	if out.ProviderReference != "DXXXXABC123" {
		t.Fatalf("ProviderReference=%q", out.ProviderReference)
	}
	if out.Status != "PENDING" {
		t.Fatalf("create success should be PENDING, got %q", out.Status)
	}
	if out.QRString == "" {
		t.Fatal("expected QRString")
	}
	if out.QRImageURL == "" {
		t.Fatal("expected QRImageURL")
	}
	if sawOrder != "ext-1" {
		t.Fatalf("merchantOrderId=%q", sawOrder)
	}
	if sawMethod != "SP" {
		t.Fatalf("paymentMethod=%q", sawMethod)
	}
	wantSig := InquirySignature("DXXXX", "ext-1", "10000", "fake-api-key")
	if sawSig != wantSig {
		t.Fatalf("signature=%q want %q", sawSig, wantSig)
	}
}

func TestReal_CreateQRIS_AuthFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = io.WriteString(w, `{"statusCode":"01","statusMessage":"Wrong signature"}`)
	}))
	defer srv.Close()

	r, err := NewReal("DXXXX", "bad-key", srv.URL, "", "", "SP", "")
	if err != nil {
		t.Fatal(err)
	}
	r.HTTPClient = srv.Client()

	_, err = r.CreateQRIS(context.Background(), ports.CreateQRISInput{
		ExternalID: "ext-auth",
		AmountIDR:  10000,
	})
	pe, ok := err.(*ports.ProviderError)
	if !ok || pe.Class != ports.ProviderAuthFailure {
		t.Fatalf("expected AUTH_FAILURE, got %T %v", err, err)
	}
}

func TestReal_CreateQRIS_BadSignatureBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"statusCode":    "01",
			"statusMessage": "Wrong Signature key",
		})
	}))
	defer srv.Close()

	r, err := NewReal("DXXXX", "bad-key", srv.URL, "", "", "SP", "")
	if err != nil {
		t.Fatal(err)
	}
	r.HTTPClient = srv.Client()

	_, err = r.CreateQRIS(context.Background(), ports.CreateQRISInput{
		ExternalID: "ext-sig",
		AmountIDR:  5000,
	})
	pe, ok := err.(*ports.ProviderError)
	if !ok {
		t.Fatalf("expected ProviderError, got %T %v", err, err)
	}
	if pe.Class != ports.ProviderAuthFailure && pe.Class != ports.ProviderRejected {
		t.Fatalf("expected AUTH_FAILURE or REJECTED, got %s", pe.Class)
	}
}

func TestReal_ClassifiesTimeout(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(50 * time.Millisecond)
		w.WriteHeader(200)
	}))
	defer srv.Close()

	r, err := NewReal("DXXXX", "fake-api-key", srv.URL, "", "", "SP", "")
	if err != nil {
		t.Fatal(err)
	}
	r.HTTPClient = &http.Client{Timeout: 5 * time.Millisecond}

	_, err = r.GetPayment(context.Background(), "order-timeout")
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

func TestReal_ClassifiesUnavailable(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		_, _ = io.WriteString(w, `error`)
	}))
	defer srv.Close()

	r, err := NewReal("DXXXX", "fake-api-key", srv.URL, "", "", "SP", "")
	if err != nil {
		t.Fatal(err)
	}
	r.HTTPClient = srv.Client()

	_, err = r.GetPayment(context.Background(), "order-5xx")
	pe, ok := err.(*ports.ProviderError)
	if !ok || pe.Class != ports.ProviderUnavailable {
		t.Fatalf("expected UNAVAILABLE, got %v", err)
	}
}

func TestReal_GetPayment_StatusMapping(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != pathTransactionStatus {
			t.Fatalf("path %s", r.URL.Path)
		}
		raw, _ := io.ReadAll(r.Body)
		var body map[string]any
		_ = json.Unmarshal(raw, &body)
		wantSig := StatusSignature("DXXXX", "order-paid", "fake-api-key")
		if body["signature"] != wantSig {
			t.Fatalf("status signature=%v want %s", body["signature"], wantSig)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"merchantOrderId": "order-paid",
			"reference":       "REF-1",
			"amount":          15000,
			"statusCode":      "00",
			"statusMessage":   "Success",
			"settlementDate":  "2026-07-19 10:00:00",
		})
	}))
	defer srv.Close()

	r, err := NewReal("DXXXX", "fake-api-key", srv.URL, "", "", "SP", "")
	if err != nil {
		t.Fatal(err)
	}
	r.HTTPClient = srv.Client()

	p, err := r.GetPayment(context.Background(), "order-paid")
	if err != nil {
		t.Fatal(err)
	}
	if p.Status != "PAID" || p.AmountIDR != 15000 || p.ExternalID != "order-paid" {
		t.Fatalf("%+v", p)
	}
	if p.PaidAt == nil {
		t.Fatal("expected PaidAt")
	}
}

func TestReal_CancelAndExpire_Refetch(t *testing.T) {
	n := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n++
		_ = json.NewEncoder(w).Encode(map[string]any{
			"merchantOrderId": "order-x",
			"reference":       "REF-X",
			"amount":          1000,
			"statusCode":      "01",
			"statusMessage":   "process",
		})
	}))
	defer srv.Close()

	r, err := NewReal("DXXXX", "fake-api-key", srv.URL, "", "", "SP", "")
	if err != nil {
		t.Fatal(err)
	}
	r.HTTPClient = srv.Client()

	c, err := r.CancelPayment(context.Background(), "order-x")
	if err != nil {
		t.Fatal(err)
	}
	if c.Status != "PENDING" {
		t.Fatalf("cancel refetch status=%q", c.Status)
	}
	e, err := r.ExpirePayment(context.Background(), "order-x")
	if err != nil {
		t.Fatal(err)
	}
	if e.Status != "PENDING" {
		t.Fatalf("expire refetch status=%q", e.Status)
	}
	if n < 2 {
		t.Fatalf("expected at least 2 status calls, got %d", n)
	}
}

func TestReal_NameDoesNotLeakSecret(t *testing.T) {
	r, err := NewReal("DXXXX", "super-secret-api-key-value", "", "", "", "SP", "duitku-primary")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(r.Name(), "super-secret") {
		t.Fatalf("name leaked secret: %s", r.Name())
	}
	if r.IsFake() {
		t.Fatal("real must not report IsFake")
	}
	if r.BaseURL != defaultSandboxBaseURL {
		t.Fatalf("default BaseURL=%q", r.BaseURL)
	}
}
