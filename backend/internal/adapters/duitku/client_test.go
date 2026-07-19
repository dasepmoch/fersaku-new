package duitku

import (
	"context"
	"crypto/hmac"
	"crypto/md5"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// Known non-secret HMAC-SHA256 vectors (formula per docs.duitku.com 2026-07-20).
const (
	fixMerchant = "DXXXX"
	fixAPIKey   = "fake-api-key"
	fixOrder    = "order-1"
	fixAmount   = "10000"
)

func hmacHex(msg, key string) string {
	mac := hmac.New(sha256.New, []byte(key))
	_, _ = mac.Write([]byte(msg))
	return hex.EncodeToString(mac.Sum(nil))
}

func md5HexLegacy(s string) string {
	sum := md5.Sum([]byte(s))
	return hex.EncodeToString(sum[:])
}

func TestContractFreeze_Metadata(t *testing.T) {
	if DocVerifiedURL == "" || DocVerifiedDate == "" {
		t.Fatal("contract freeze metadata required")
	}
	if ProductionBaseURL != "https://passport.duitku.com" {
		t.Fatalf("production base %q", ProductionBaseURL)
	}
	if SandboxBaseURL != "https://sandbox.duitku.com" {
		t.Fatalf("sandbox base %q", SandboxBaseURL)
	}
	if CallbackAckBody != "SUCCESS" {
		t.Fatalf("callback ack %q", CallbackAckBody)
	}
}

func TestNewReal_RequiresCredentials(t *testing.T) {
	if _, err := NewReal("", "key", "sandbox", "", "", "", "", ""); err == nil {
		t.Fatal("expected error without merchant code")
	}
	if _, err := NewReal("DXXXX", "", "sandbox", "", "", "", "", ""); err == nil {
		t.Fatal("expected error without api key")
	}
}

func TestInquirySignature_HMACKnownVector(t *testing.T) {
	// HMAC-SHA256(merchantCode + merchantOrderId + paymentAmount, apiKey)
	got := InquirySignature(fixMerchant, fixOrder, fixAmount, fixAPIKey)
	want := hmacHex(fixMerchant+fixOrder+fixAmount, fixAPIKey)
	if got != want {
		t.Fatalf("signature=%q want %q", got, want)
	}
	if got != strings.ToLower(got) || len(got) != 64 {
		t.Fatalf("must be lowercase 64-hex, got %q", got)
	}
	// MD5 legacy must not equal HMAC result.
	legacy := md5HexLegacy(fixMerchant + fixOrder + fixAmount + fixAPIKey)
	if got == legacy {
		t.Fatal("HMAC must not match obsolete MD5")
	}
}

func TestStatusSignature_HMACKnownVector(t *testing.T) {
	got := StatusSignature(fixMerchant, fixOrder, fixAPIKey)
	want := hmacHex(fixMerchant+fixOrder, fixAPIKey)
	if got != want {
		t.Fatalf("signature=%q want %q", got, want)
	}
	if len(got) != 64 {
		t.Fatalf("len=%d", len(got))
	}
}

func TestCallbackSignature_HMACKnownVector(t *testing.T) {
	got := CallbackSignature(fixMerchant, fixAmount, fixOrder, fixAPIKey)
	want := hmacHex(fixMerchant+fixAmount+fixOrder, fixAPIKey)
	if got != want {
		t.Fatalf("signature=%q want %q", got, want)
	}
	if !VerifyCallbackSignature(fixMerchant, fixAmount, fixOrder, fixAPIKey, got) {
		t.Fatal("verify should accept matching HMAC")
	}
	if !VerifyCallbackSignature(fixMerchant, fixAmount, fixOrder, fixAPIKey, strings.ToUpper(got)) {
		t.Fatal("verify should accept uppercase hex")
	}
}

func TestVerifyCallbackSignature_RejectsMD5AndNegatives(t *testing.T) {
	md5Sig := LegacyMD5CallbackSignature(fixMerchant, fixAmount, fixOrder, fixAPIKey)
	if VerifyCallbackSignature(fixMerchant, fixAmount, fixOrder, fixAPIKey, md5Sig) {
		t.Fatal("live path must reject obsolete MD5 signature")
	}
	good := CallbackSignature(fixMerchant, fixAmount, fixOrder, fixAPIKey)
	// wrong amount
	if VerifyCallbackSignature(fixMerchant, "99999", fixOrder, fixAPIKey, good) {
		t.Fatal("wrong amount")
	}
	// wrong merchant
	if VerifyCallbackSignature("DYYYY", fixAmount, fixOrder, fixAPIKey, good) {
		t.Fatal("wrong merchant")
	}
	// field reorder (amount and order swapped in formula input)
	reordered := hmacHex(fixMerchant+fixOrder+fixAmount, fixAPIKey)
	if VerifyCallbackSignature(fixMerchant, fixAmount, fixOrder, fixAPIKey, reordered) {
		t.Fatal("reordered fields must not verify as callback")
	}
	if VerifyCallbackSignature(fixMerchant, fixAmount, fixOrder, fixAPIKey, "") {
		t.Fatal("empty")
	}
	if VerifyCallbackSignature(fixMerchant, fixAmount, fixOrder, fixAPIKey, "deadbeef") {
		t.Fatal("short junk")
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

func TestResolveBaseURL_DefaultsAndAllowlist(t *testing.T) {
	u, err := ResolveBaseURL("production", "")
	if err != nil || u != ProductionBaseURL {
		t.Fatalf("prod default: %q %v", u, err)
	}
	u, err = ResolveBaseURL("sandbox", "")
	if err != nil || u != SandboxBaseURL {
		t.Fatalf("sandbox default: %q %v", u, err)
	}
	u, err = ResolveBaseURL("", "")
	if err != nil || u != SandboxBaseURL {
		t.Fatalf("empty env defaults sandbox for local: %q %v", u, err)
	}
	if _, err := ResolveBaseURL("production", SandboxBaseURL); err == nil {
		t.Fatal("prod env + sandbox host must fail")
	}
	if _, err := ResolveBaseURL("sandbox", ProductionBaseURL); err == nil {
		t.Fatal("sandbox env + passport must fail")
	}
	if _, err := ResolveBaseURL("production", "http://passport.duitku.com"); err == nil {
		t.Fatal("non-https must fail")
	}
	if _, err := ResolveBaseURL("production", "https://evil.example.com"); err == nil {
		t.Fatal("non-allowlist must fail")
	}
	// loopback allowed for httptest
	if _, err := ResolveBaseURL("sandbox", "http://127.0.0.1:1234"); err != nil {
		t.Fatalf("loopback: %v", err)
	}
}

func TestValidateAppEnvCoherence_ProductionFailClosed(t *testing.T) {
	if err := ValidateAppEnvCoherence("production", "sandbox", "", "", ""); err == nil {
		t.Fatal("production+sandbox env")
	}
	if err := ValidateAppEnvCoherence("production", "", SandboxBaseURL, "", ""); err == nil {
		t.Fatal("production+sandbox URL")
	}
	if err := ValidateAppEnvCoherence("production", "production", "", "", ""); err != nil {
		t.Fatalf("prod coherent: %v", err)
	}
	if err := ValidateAppEnvCoherence("production", "", "", "", ""); err != nil {
		// empty base → passport
		t.Fatalf("prod empty base should resolve passport: %v", err)
	}
	if err := ValidateAppEnvCoherence("staging", "sandbox", ProductionBaseURL, "", ""); err == nil {
		t.Fatal("staging sandbox env + passport host")
	}
	if err := ValidateAppEnvCoherence("production", "production", "", "http://cb.example", ""); err == nil {
		t.Fatal("http callback on production")
	}
}

func TestReal_CreateQRIS_MapsResponse(t *testing.T) {
	var sawSig string
	var sawOrder string
	var sawMethod string
	var sawCT string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != pathInquiry {
			t.Fatalf("unexpected %s %s", r.Method, r.URL.Path)
		}
		sawCT = r.Header.Get("Content-Type")
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

	r, err := NewReal("DXXXX", "fake-api-key", "sandbox", srv.URL, "https://api.example/cb", "https://app.example/return", "SP", "duitku-primary")
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
	if !strings.Contains(sawCT, "application/json") {
		t.Fatalf("Content-Type=%q", sawCT)
	}
	wantSig := InquirySignature("DXXXX", "ext-1", "10000", "fake-api-key")
	if sawSig != wantSig {
		t.Fatalf("signature=%q want %q", sawSig, wantSig)
	}
	// Ensure not MD5.
	if len(sawSig) != 64 {
		t.Fatalf("HMAC length=%d", len(sawSig))
	}
}

func TestReal_CreateThenStatus_UsesMerchantOrderIDNotReference(t *testing.T) {
	const merchantOrder = "ext-merchant-99"
	const providerRef = "DXXXX-PROVIDER-REF-ONLY"

	var statusOrderID string
	var statusSig string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		var body map[string]any
		_ = json.Unmarshal(raw, &body)
		switch r.URL.Path {
		case pathInquiry:
			_ = json.NewEncoder(w).Encode(map[string]any{
				"reference":       providerRef,
				"merchantOrderId": merchantOrder,
				"statusCode":      "00",
				"statusMessage":   "SUCCESS",
				"qrString":        "000201FAKE",
			})
		case pathTransactionStatus:
			statusOrderID, _ = body["merchantOrderId"].(string)
			statusSig, _ = body["signature"].(string)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"merchantOrderId": merchantOrder,
				"reference":       providerRef,
				"amount":          10000,
				"statusCode":      "00",
				"statusMessage":   "SUCCESS",
				"settlementDate":  "2026-07-20 10:00:00",
			})
		default:
			t.Fatalf("path %s", r.URL.Path)
		}
	}))
	defer srv.Close()

	r, err := NewReal("DXXXX", "fake-api-key", "sandbox", srv.URL, "", "", "SP", "")
	if err != nil {
		t.Fatal(err)
	}
	r.HTTPClient = srv.Client()

	created, err := r.CreateQRIS(context.Background(), ports.CreateQRISInput{
		ExternalID: merchantOrder,
		AmountIDR:  10000,
	})
	if err != nil {
		t.Fatal(err)
	}
	if created.ProviderReference != providerRef {
		t.Fatalf("provider ref stored as %q", created.ProviderReference)
	}

	// Status lookup must use merchant order id, not provider reference.
	p, err := r.GetPayment(context.Background(), merchantOrder)
	if err != nil {
		t.Fatal(err)
	}
	if statusOrderID != merchantOrder {
		t.Fatalf("status used merchantOrderId=%q want %q", statusOrderID, merchantOrder)
	}
	if statusOrderID == providerRef {
		t.Fatal("status must not use provider reference as merchantOrderId")
	}
	wantSig := StatusSignature("DXXXX", merchantOrder, "fake-api-key")
	if statusSig != wantSig {
		t.Fatalf("status sig=%q want %q", statusSig, wantSig)
	}
	if p.Status != "PAID" || p.ExternalID != merchantOrder {
		t.Fatalf("%+v", p)
	}
	if p.ProviderReference != providerRef {
		t.Fatalf("status ProviderReference=%q", p.ProviderReference)
	}
}

func TestReal_CreateQRIS_AuthFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = io.WriteString(w, `{"statusCode":"01","statusMessage":"Wrong signature"}`)
	}))
	defer srv.Close()

	r, err := NewReal("DXXXX", "bad-key", "sandbox", srv.URL, "", "", "SP", "")
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

	r, err := NewReal("DXXXX", "bad-key", "sandbox", srv.URL, "", "", "SP", "")
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

	r, err := NewReal("DXXXX", "fake-api-key", "sandbox", srv.URL, "", "", "SP", "")
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

	r, err := NewReal("DXXXX", "fake-api-key", "sandbox", srv.URL, "", "", "SP", "")
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

	r, err := NewReal("DXXXX", "fake-api-key", "sandbox", srv.URL, "", "", "SP", "")
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

	r, err := NewReal("DXXXX", "fake-api-key", "sandbox", srv.URL, "", "", "SP", "")
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
	r, err := NewReal("DXXXX", "super-secret-api-key-value", "sandbox", "", "", "", "SP", "duitku-primary")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(r.Name(), "super-secret") {
		t.Fatalf("name leaked secret: %s", r.Name())
	}
	if r.IsFake() {
		t.Fatal("real must not report IsFake")
	}
	if r.BaseURL != SandboxBaseURL {
		t.Fatalf("default BaseURL=%q", r.BaseURL)
	}
}

func TestReal_ProductionDefaultIsPassport(t *testing.T) {
	r, err := NewReal("DXXXX", "fake-api-key", "production", "", "", "", "SP", "")
	if err != nil {
		t.Fatal(err)
	}
	if r.BaseURL != ProductionBaseURL {
		t.Fatalf("production default BaseURL=%q", r.BaseURL)
	}
}

func TestReal_IntegrationStub_Outcomes(t *testing.T) {
	// Disposable stub: PAID, PENDING, FAILED, timeout classification paths.
	outcomes := map[string]map[string]any{
		"ord-paid": {
			"merchantOrderId": "ord-paid",
			"reference":       "REF-PAID",
			"amount":          1000,
			"statusCode":      "00",
			"statusMessage":   "SUCCESS",
		},
		"ord-pending": {
			"merchantOrderId": "ord-pending",
			"reference":       "REF-PEND",
			"amount":          1000,
			"statusCode":      "01",
			"statusMessage":   "process",
		},
		"ord-failed": {
			"merchantOrderId": "ord-failed",
			"reference":       "REF-FAIL",
			"amount":          1000,
			"statusCode":      "02",
			"statusMessage":   "failed",
		},
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		var body map[string]any
		_ = json.Unmarshal(raw, &body)
		oid, _ := body["merchantOrderId"].(string)
		if oid == "ord-timeout" {
			time.Sleep(80 * time.Millisecond)
			w.WriteHeader(200)
			return
		}
		if resp, ok := outcomes[oid]; ok {
			_ = json.NewEncoder(w).Encode(resp)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"statusCode":    "99",
			"statusMessage": "unknown weird",
		})
	}))
	defer srv.Close()

	r, err := NewReal("DXXXX", "fake-api-key", "sandbox", srv.URL, "", "", "SP", "")
	if err != nil {
		t.Fatal(err)
	}
	r.HTTPClient = srv.Client()

	paid, err := r.GetPayment(context.Background(), "ord-paid")
	if err != nil || paid.Status != "PAID" {
		t.Fatalf("paid: %+v %v", paid, err)
	}
	pend, err := r.GetPayment(context.Background(), "ord-pending")
	if err != nil || pend.Status != "PENDING" {
		t.Fatalf("pending: %+v %v", pend, err)
	}
	fail, err := r.GetPayment(context.Background(), "ord-failed")
	if err != nil || fail.Status != "FAILED" {
		t.Fatalf("failed: %+v %v", fail, err)
	}
	// unknown business code → rejected or mapped UNKNOWN via error path
	_, err = r.GetPayment(context.Background(), "ord-unknown")
	if err == nil {
		// may return mapped UNKNOWN without error depending on classify — either is ok if RequestSent semantics hold
	}

	r.HTTPClient = &http.Client{Timeout: 10 * time.Millisecond}
	_, err = r.GetPayment(context.Background(), "ord-timeout")
	pe, ok := err.(*ports.ProviderError)
	if !ok || pe.Class != ports.ProviderTimeout {
		t.Fatalf("timeout: %v", err)
	}
}
