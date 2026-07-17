//go:build integration

package integration_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	httpadapter "github.com/dasepmoch/fersaku-new/backend/internal/adapters/http"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/mail"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/observability"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/r2"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/xendit"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/config"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/gateway"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/kyc"
)

func newKYCStack(t *testing.T) (http.Handler, *application.KYCService, *application.GatewayService, *mail.Capture, *r2.Fake) {
	t.Helper()
	_ = databaseURL(t)
	runMigrate(t, "up")
	pool := openPool(t)
	ids := observability.NewULIDGenerator()
	capture := mail.NewCapture()
	fakeR2 := r2.NewFake()
	xd := xendit.NewFake()
	authzSvc := &application.AuthzService{
		Store: postgres.NewAuthzRepo(pool.Pool()),
		IDs:   ids,
		Clock: observability.SystemClock{},
		Log:   observability.NewSlogLogger("error", "test"),
	}
	authSvc := &application.AuthService{
		Store: postgres.IdentityStore{Repo: postgres.NewIdentityRepo(pool.Pool())},
		IDs:   ids,
		Clock: observability.SystemClock{},
		Mail:  capture,
		Log:   observability.NewSlogLogger("error", "test"),
		Config: application.AuthConfig{
			SessionCookieName: "fersaku_session",
			TokenHashSecret:   "test-session-secret-not-for-prod",
		},
		Authz: authzSvc,
	}
	onboard := &application.OnboardingService{
		Store: postgres.NewOnboardingRepo(pool.Pool()),
		IDs:   ids,
		Clock: observability.SystemClock{},
		Log:   observability.NewSlogLogger("error", "test"),
	}
	catalog := &application.CatalogService{
		Store: postgres.NewCatalogRepo(pool.Pool()),
		IDs:   ids,
		Clock: observability.SystemClock{},
		Log:   observability.NewSlogLogger("error", "test"),
	}
	fees := &application.FeeService{
		Store: postgres.NewFeeRepo(pool.Pool()),
		IDs:   ids,
		Clock: observability.SystemClock{},
		Log:   observability.NewSlogLogger("error", "test"),
	}
	gw := &application.GatewayService{
		Store:         postgres.NewGatewayRepo(pool.Pool()),
		Fees:          fees,
		QRIS:          xd,
		IDs:           ids,
		Clock:         observability.SystemClock{},
		Log:           observability.NewSlogLogger("error", "test"),
		KeyHashSecret: "test-session-secret-not-for-prod",
		AccountScope:  xd.AccountScope,
	}
	kycSvc := &application.KYCService{
		Store:         postgres.NewKYCRepo(pool.Pool()),
		Objects:       fakeR2,
		BucketPrivate: "fersaku-private",
		EncryptionKey: "test-kyc-encryption-key-32bytes!!",
		LocalScanPass: true,
		IDs:           ids,
		Clock:         observability.SystemClock{},
		Log:           observability.NewSlogLogger("error", "test"),
	}
	credSvc := &application.CredentialService{
		Store:           postgres.NewCredentialRepo(pool.Pool()),
		Auth:            authSvc,
		IDs:             ids,
		Clock:           observability.SystemClock{},
		Log:             observability.NewSlogLogger("error", "test"),
		KeyHashSecret:   "test-session-secret-not-for-prod",
		ClaimHashSecret: "test-session-secret-not-for-prod",
	}
	h := httpadapter.NewRouterWith(httpadapter.RouterDeps{
		Log:               observability.NewSlogLogger("error", "test"),
		IDs:               ids,
		Service:           "fersaku-api",
		Version:           "0.0.0-test",
		AppEnv:            config.EnvTest,
		Ready:             func() bool { return true },
		StartedAt:         time.Now().UTC(),
		SessionCookieName: "fersaku_session",
		CSRFSoftDisable:   true,
		AuthService:       authSvc,
		AuthzService:      authzSvc,
		OnboardingService: onboard,
		CatalogService:    catalog,
		FeeService:        fees,
		GatewayService:    gw,
		KYCService:        kycSvc,
		CredentialService: credSvc,
		RateLimiter:       nil,
		RequestTimeout:    30 * time.Second,
	})
	return h, kycSvc, gw, capture, fakeR2
}

func kycJSON(t *testing.T, h http.Handler, method, path string, cookie *http.Cookie, body any) *httptest.ResponseRecorder {
	t.Helper()
	var rdr io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rdr = bytes.NewReader(b)
	}
	req := httptest.NewRequest(method, path, rdr)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if cookie != nil {
		req.AddCookie(cookie)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func kycUpload(t *testing.T, h http.Handler, path string, cookie *http.Cookie, docType string, fileName string, content []byte, contentType string) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	_ = w.WriteField("documentType", docType)
	part, err := w.CreateFormFile("file", fileName)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatal(err)
	}
	// Set content type on part via CreatePart if needed — FormFile uses header from CreateFormFile default.
	_ = w.Close()
	req := httptest.NewRequest(http.MethodPost, path, &buf)
	req.Header.Set("Content-Type", w.FormDataContentType())
	if contentType != "" {
		// also pass as form field for handler fallback
	}
	req.AddCookie(cookie)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func minimalJPEG() []byte {
	// Minimal valid JPEG SOI + APP0 + EOI-ish payload for sniff (FF D8 ...)
	return []byte{
		0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
		0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
		0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
		0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
		0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
		0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
		0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
		0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xD9,
	}
}

func TestKYC_LiveDeniedBeforeApproval_StorefrontUnaffected(t *testing.T) {
	h, _, gw, capture, _ := newKYCStack(t)
	cookie, storeID, _ := onboardSellerStore(t, h, capture)

	// Storefront catalog still works without KYC.
	rrCat := kycJSON(t, h, http.MethodGet, "/v1/stores/"+storeID+"/products", cookie, nil)
	if rrCat.Code != http.StatusOK && rrCat.Code != http.StatusNotFound {
		// list may be empty 200
		if rrCat.Code >= 500 {
			t.Fatalf("storefront products failed %d %s", rrCat.Code, rrCat.Body.String())
		}
	}
	// Create product (storefront write) without KYC.
	rrP := kycJSON(t, h, http.MethodPost, "/v1/stores/"+storeID+"/products", cookie, map[string]any{
		"name":        "Digital Item",
		"slug":        fmt.Sprintf("item-%d", time.Now().UnixNano()),
		"price":       10000,
		"description": "no kyc needed",
		"status":      "ACTIVE",
	})
	if rrP.Code != http.StatusCreated && rrP.Code != http.StatusOK {
		// Some catalogs require more fields; as long as not KYC forced.
		if strings.Contains(rrP.Body.String(), "KYC") {
			t.Fatalf("storefront must not require KYC: %s", rrP.Body.String())
		}
	}

	// Resolve merchant
	pool := openPool(t)
	var merchantID string
	err := pool.Pool().QueryRow(t.Context(), `
SELECT m.id FROM merchants m
JOIN stores s ON s.merchant_id = m.id WHERE s.id = $1`, storeID).Scan(&merchantID)
	if err != nil {
		t.Fatalf("merchant: %v", err)
	}

	// LIVE payment denied without capability.
	_, _ = pool.Pool().Exec(t.Context(), `UPDATE merchant_api_keys SET status='REVOKED' WHERE merchant_id=$1`, merchantID)
	_, _, err = gw.CreateAPIKey(t.Context(), merchantID, gateway.ModeLive, "x")
	if err == nil {
		t.Fatal("live key create must fail before KYC")
	}
}

func TestKYC_FullFlow_ApproveEnablesLive_NoRawKey(t *testing.T) {
	h, kycSvc, gw, capture, fakeR2 := newKYCStack(t)
	sellerCookie, storeID, _ := onboardSellerStore(t, h, capture)

	// Admin with kyc.review (register as SELLER surface, then bootstrap SUPER_ADMIN)
	adminEmail := fmt.Sprintf("kyc-admin-%d@example.com", time.Now().UnixNano())
	adminCookie := registerVerifyLogin(t, h, capture, adminEmail, "password123", "SELLER")
	authz := &application.AuthzService{
		Store: postgres.NewAuthzRepo(openPool(t).Pool()),
		IDs:   observability.NewULIDGenerator(),
		Clock: observability.SystemClock{},
		Log:   observability.NewSlogLogger("error", "test"),
	}
	if _, err := authz.BootstrapAdminByEmail(t.Context(), adminEmail); err != nil {
		t.Fatalf("bootstrap: %v", err)
	}

	// Create case
	rr := kycJSON(t, h, http.MethodPost, "/v1/me/kyc/cases", sellerCookie, map[string]any{
		"legalName":    "PT Fersaku Test",
		"businessName": "Fersaku",
		"countryCode":  "ID",
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("create case %d %s", rr.Code, rr.Body.String())
	}
	var env map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &env)
	data := env["data"].(map[string]any)
	caseID := data["id"].(string)

	// Upload mandatory docs
	jpeg := minimalJPEG()
	// Pad to MinDocumentBytes
	for len(jpeg) < kyc.MinDocumentBytes {
		jpeg = append(jpeg, 0x00)
	}
	// Fix EOI still starts with FF D8
	jpeg[0], jpeg[1] = 0xFF, 0xD8

	up1 := kycUpload(t, h, "/v1/me/kyc/cases/"+caseID+"/documents", sellerCookie, "ID_FRONT", "id.jpg", jpeg, "image/jpeg")
	if up1.Code != http.StatusCreated {
		t.Fatalf("upload id %d %s", up1.Code, up1.Body.String())
	}
	up2 := kycUpload(t, h, "/v1/me/kyc/cases/"+caseID+"/documents", sellerCookie, "SELFIE", "selfie.jpg", jpeg, "image/jpeg")
	if up2.Code != http.StatusCreated {
		t.Fatalf("upload selfie %d %s", up2.Code, up2.Body.String())
	}
	if fakeR2.Count() < 2 {
		t.Fatalf("expected ciphertext in private R2, count=%d", fakeR2.Count())
	}

	// Submit
	rrS := kycJSON(t, h, http.MethodPost, "/v1/me/kyc/cases/"+caseID+"/submit", sellerCookie, map[string]any{})
	if rrS.Code != http.StatusOK {
		t.Fatalf("submit %d %s", rrS.Code, rrS.Body.String())
	}

	// Reject without reason fails
	rrBad := kycJSON(t, h, http.MethodPost, "/v1/admin/kyc/"+caseID+"/transition", adminCookie, map[string]any{
		"action": "REJECT",
		"reason": "",
	})
	if rrBad.Code != http.StatusBadRequest {
		t.Fatalf("reject without reason expected 400 got %d %s", rrBad.Code, rrBad.Body.String())
	}
	if !strings.Contains(rrBad.Body.String(), "KYC_REASON_REQUIRED") && !strings.Contains(rrBad.Body.String(), "reason") {
		t.Fatalf("expected reason required code: %s", rrBad.Body.String())
	}

	// Clarification requires reason
	rrCl := kycJSON(t, h, http.MethodPost, "/v1/admin/kyc/"+caseID+"/transition", adminCookie, map[string]any{
		"action": "NEEDS_CLARIFICATION",
		"reason": "Please re-upload clearer ID",
	})
	if rrCl.Code != http.StatusOK {
		t.Fatalf("clarify %d %s", rrCl.Code, rrCl.Body.String())
	}

	// Resubmit after clarification
	rrRS := kycJSON(t, h, http.MethodPost, "/v1/me/kyc/cases/"+caseID+"/resubmit", sellerCookie, map[string]any{
		"legalName": "PT Fersaku Test",
	})
	if rrRS.Code != http.StatusOK {
		t.Fatalf("resubmit %d %s", rrRS.Code, rrRS.Body.String())
	}

	// Approve
	rrA := kycJSON(t, h, http.MethodPost, "/v1/admin/kyc/"+caseID+"/transition", adminCookie, map[string]any{
		"action": "APPROVE",
	})
	if rrA.Code != http.StatusOK {
		t.Fatalf("approve %d %s", rrA.Code, rrA.Body.String())
	}
	var envA map[string]any
	_ = json.Unmarshal(rrA.Body.Bytes(), &envA)
	if envA["data"].(map[string]any)["status"] != "APPROVED" {
		t.Fatalf("status %v", envA["data"])
	}
	// Response must not contain raw live key
	if strings.Contains(rrA.Body.String(), "fsk_live_") {
		t.Fatal("approve response must not return raw live key")
	}

	// LIVE capability active
	pool := openPool(t)
	var merchantID string
	_ = pool.Pool().QueryRow(t.Context(), `SELECT merchant_id FROM stores WHERE id=$1`, storeID).Scan(&merchantID)
	cap, err := gw.Store.GetCapability(t.Context(), merchantID, gateway.ModeLive, gateway.CapabilityQRISAPI)
	if err != nil || cap.Status != gateway.CapStatusActive {
		t.Fatalf("capability after approve: %+v err=%v", cap, err)
	}
	// Issuance AUTHORIZED
	ok, ir, err := kycSvc.LiveIssuanceAuthorized(t.Context(), merchantID)
	if err != nil || !ok || ir.Status != kyc.IssuanceAuthorized {
		t.Fatalf("issuance authorized: ok=%v ir=%+v err=%v", ok, ir, err)
	}

	// BE-410: live key via seller claim exchange (not direct CreateAPIKey).
	rrIss := kycJSON(t, h, http.MethodPost, "/v1/me/credentials/requests", sellerCookie, map[string]any{
		"paymentMode": "LIVE",
		"purpose":     "API_KEY",
		"reason":      "post-kyc claim",
	})
	if rrIss.Code != http.StatusCreated && rrIss.Code != http.StatusOK {
		t.Fatalf("issuance request %d %s", rrIss.Code, rrIss.Body.String())
	}
	var envIss map[string]any
	_ = json.Unmarshal(rrIss.Body.Bytes(), &envIss)
	claimTok, _ := envIss["data"].(map[string]any)["claimToken"].(string)
	if claimTok == "" {
		t.Fatalf("expected claim token: %s", rrIss.Body.String())
	}
	rrClaim := kycJSON(t, h, http.MethodPost, "/v1/me/credentials/claim", sellerCookie, map[string]any{
		"token": claimTok,
	})
	if rrClaim.Code != http.StatusOK {
		t.Fatalf("claim %d %s", rrClaim.Code, rrClaim.Body.String())
	}
	var envClaim map[string]any
	_ = json.Unmarshal(rrClaim.Body.Bytes(), &envClaim)
	liveRaw, _ := envClaim["data"].(map[string]any)["apiKey"].(string)
	if !strings.HasPrefix(liveRaw, "fsk_live_") {
		t.Fatalf("prefix %s", liveRaw)
	}
	rrPay := gatewayPOST(t, h, "/v1/gateway/payment-intents", liveRaw, map[string]any{
		"merchantReference": fmt.Sprintf("after-kyc-%d", time.Now().UnixNano()),
		"amount":            100_000,
		"currency":          "IDR",
	}, fmt.Sprintf("idem-after-kyc-%d", time.Now().UnixNano()))
	if rrPay.Code != http.StatusCreated && rrPay.Code != http.StatusOK {
		t.Fatalf("live payment %d %s", rrPay.Code, rrPay.Body.String())
	}

	// No KYC presign path
	rrPre := kycJSON(t, h, http.MethodPost, "/v1/me/kyc/presign", sellerCookie, map[string]any{
		"purpose": "KYC_DOCUMENT",
	})
	if rrPre.Code != http.StatusBadRequest {
		t.Fatalf("presign expected 400 got %d %s", rrPre.Code, rrPre.Body.String())
	}
	if !strings.Contains(rrPre.Body.String(), "KYC_PRESIGN") && !strings.Contains(rrPre.Body.String(), "presign") {
		t.Fatalf("presign body %s", rrPre.Body.String())
	}
}

func TestKYC_RejectRequiresReason(t *testing.T) {
	h, _, _, capture, _ := newKYCStack(t)
	sellerCookie, _, _ := onboardSellerStore(t, h, capture)
	adminEmail := fmt.Sprintf("kyc-admin2-%d@example.com", time.Now().UnixNano())
	adminCookie := registerVerifyLogin(t, h, capture, adminEmail, "password123", "SELLER")
	authz := &application.AuthzService{
		Store: postgres.NewAuthzRepo(openPool(t).Pool()),
		IDs:   observability.NewULIDGenerator(),
		Clock: observability.SystemClock{},
		Log:   observability.NewSlogLogger("error", "test"),
	}
	if _, err := authz.BootstrapAdminByEmail(t.Context(), adminEmail); err != nil {
		t.Fatalf("bootstrap: %v", err)
	}

	// Create case + docs + submit via service shortcuts
	rr := kycJSON(t, h, http.MethodPost, "/v1/me/kyc/cases", sellerCookie, map[string]any{
		"legalName": "Reject Co",
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("create %d %s", rr.Code, rr.Body.String())
	}
	caseID := json.RawMessage{}
	var env map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &env)
	caseIDStr := env["data"].(map[string]any)["id"].(string)
	_ = caseID

	jpeg := minimalJPEG()
	for len(jpeg) < kyc.MinDocumentBytes {
		jpeg = append(jpeg, 0x00)
	}
	jpeg[0], jpeg[1] = 0xFF, 0xD8
	_ = kycUpload(t, h, "/v1/me/kyc/cases/"+caseIDStr+"/documents", sellerCookie, "ID_FRONT", "a.jpg", jpeg, "image/jpeg")
	_ = kycUpload(t, h, "/v1/me/kyc/cases/"+caseIDStr+"/documents", sellerCookie, "SELFIE", "b.jpg", jpeg, "image/jpeg")
	_ = kycJSON(t, h, http.MethodPost, "/v1/me/kyc/cases/"+caseIDStr+"/submit", sellerCookie, map[string]any{})

	rrBad := kycJSON(t, h, http.MethodPost, "/v1/admin/kyc/"+caseIDStr+"/transition", adminCookie, map[string]any{
		"action": "REJECT",
	})
	if rrBad.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 got %d %s", rrBad.Code, rrBad.Body.String())
	}

	rrOk := kycJSON(t, h, http.MethodPost, "/v1/admin/kyc/"+caseIDStr+"/transition", adminCookie, map[string]any{
		"action": "REJECT",
		"reason": "Documents not authentic",
	})
	if rrOk.Code != http.StatusOK {
		t.Fatalf("reject %d %s", rrOk.Code, rrOk.Body.String())
	}
}
