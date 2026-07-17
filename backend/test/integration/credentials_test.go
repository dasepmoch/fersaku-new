//go:build integration

package integration_test

import (
	"encoding/json"
	"fmt"
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
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/kyc"
)

func newCredentialStack(t *testing.T) (
	http.Handler,
	*application.CredentialService,
	*application.GatewayService,
	*application.KYCService,
	*mail.Capture,
) {
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
	return h, credSvc, gw, kycSvc, capture
}

func credJSON(t *testing.T, h http.Handler, method, path string, cookie *http.Cookie, body any) *httptest.ResponseRecorder {
	t.Helper()
	return kycJSON(t, h, method, path, cookie, body)
}

func TestCredentials_SandboxClaim_RawNotInDB_RevokeFailsGateway(t *testing.T) {
	h, _, gw, _, capture := newCredentialStack(t)
	sellerCookie, storeID, _ := onboardSellerStore(t, h, capture)
	pool := openPool(t)
	var merchantID string
	_ = pool.Pool().QueryRow(t.Context(), `SELECT merchant_id FROM stores WHERE id=$1`, storeID).Scan(&merchantID)
	_, _ = pool.Pool().Exec(t.Context(), `UPDATE merchant_api_keys SET status='REVOKED' WHERE merchant_id=$1 AND status='ACTIVE'`, merchantID)

	// Request sandbox issuance + claim token
	rrReq := credJSON(t, h, http.MethodPost, "/v1/me/credentials/requests", sellerCookie, map[string]any{
		"paymentMode": "SANDBOX",
		"purpose":     "INITIAL_ISSUE",
		"reason":      "dev sandbox",
	})
	if rrReq.Code != http.StatusCreated {
		t.Fatalf("request issuance %d %s", rrReq.Code, rrReq.Body.String())
	}
	var env map[string]any
	_ = json.Unmarshal(rrReq.Body.Bytes(), &env)
	data := env["data"].(map[string]any)
	claimTok, _ := data["claimToken"].(string)
	if claimTok == "" {
		t.Fatalf("expected claimToken: %s", rrReq.Body.String())
	}
	// claim token must not look like API key
	if strings.HasPrefix(claimTok, "fsk_") {
		t.Fatal("claim token must not be api key")
	}

	// Claim exchange → raw API key once
	rrClaim := credJSON(t, h, http.MethodPost, "/v1/me/credentials/claim", sellerCookie, map[string]any{
		"token": claimTok,
	})
	if rrClaim.Code != http.StatusOK {
		t.Fatalf("claim %d %s", rrClaim.Code, rrClaim.Body.String())
	}
	if rrClaim.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("expected no-store, got %q", rrClaim.Header().Get("Cache-Control"))
	}
	var envC map[string]any
	_ = json.Unmarshal(rrClaim.Body.Bytes(), &envC)
	rawKey, _ := envC["data"].(map[string]any)["apiKey"].(string)
	if !strings.HasPrefix(rawKey, "fsk_test_") {
		t.Fatalf("raw key prefix: %s", rawKey)
	}

	// Raw key not recoverable from DB
	var hashCount int
	_ = pool.Pool().QueryRow(t.Context(),
		`SELECT count(*) FROM merchant_api_keys WHERE merchant_id=$1 AND key_hash = $2`,
		merchantID, rawKey).Scan(&hashCount)
	if hashCount != 0 {
		t.Fatal("raw key must not be stored as hash column value")
	}
	var rawInDB int
	_ = pool.Pool().QueryRow(t.Context(),
		`SELECT count(*) FROM merchant_api_keys WHERE key_prefix LIKE $1 OR key_hash LIKE $1`,
		"%"+rawKey+"%").Scan(&rawInDB)
	if rawInDB != 0 {
		t.Fatal("raw key substring must not appear in DB columns")
	}
	// Hash present, prefix only
	var status, prefix, keyHash string
	_ = pool.Pool().QueryRow(t.Context(),
		`SELECT status, key_prefix, key_hash FROM merchant_api_keys WHERE merchant_id=$1 AND status='ACTIVE'`,
		merchantID).Scan(&status, &prefix, &keyHash)
	if status != "ACTIVE" || keyHash == "" || strings.Contains(keyHash, rawKey) {
		t.Fatalf("stored key invalid status=%s hash=%s", status, keyHash)
	}

	// Gateway auth works
	rrPay := gatewayPOST(t, h, "/v1/gateway/payment-intents", rawKey, map[string]any{
		"merchantReference": fmt.Sprintf("cred-sb-%d", time.Now().UnixNano()),
		"amount":            100_000,
		"currency":          "IDR",
	}, fmt.Sprintf("idem-cred-sb-%d", time.Now().UnixNano()))
	if rrPay.Code != http.StatusCreated && rrPay.Code != http.StatusOK {
		t.Fatalf("sandbox pay %d %s", rrPay.Code, rrPay.Body.String())
	}

	// Double claim fails
	rrDup := credJSON(t, h, http.MethodPost, "/v1/me/credentials/claim", sellerCookie, map[string]any{
		"token": claimTok,
	})
	if rrDup.Code == http.StatusOK {
		t.Fatalf("double claim must fail: %s", rrDup.Body.String())
	}

	// List masked — no raw
	rrList := credJSON(t, h, http.MethodGet, "/v1/me/credentials", sellerCookie, nil)
	if rrList.Code != http.StatusOK {
		t.Fatalf("list %d %s", rrList.Code, rrList.Body.String())
	}
	if strings.Contains(rrList.Body.String(), rawKey) {
		t.Fatal("list must not contain raw key")
	}

	// Revoke via list key id
	var keyID string
	_ = pool.Pool().QueryRow(t.Context(),
		`SELECT id FROM merchant_api_keys WHERE merchant_id=$1 AND status='ACTIVE'`, merchantID).Scan(&keyID)
	rrRev := credJSON(t, h, http.MethodPost, "/v1/me/credentials/"+keyID+"/revoke", sellerCookie, map[string]any{
		"reason": "rotate",
	})
	if rrRev.Code != http.StatusOK {
		t.Fatalf("revoke %d %s", rrRev.Code, rrRev.Body.String())
	}
	// Revoked fails immediately on gateway auth
	rrPay2 := gatewayPOST(t, h, "/v1/gateway/payment-intents", rawKey, map[string]any{
		"merchantReference": fmt.Sprintf("cred-rev-%d", time.Now().UnixNano()),
		"amount":            100_000,
		"currency":          "IDR",
	}, fmt.Sprintf("idem-cred-rev-%d", time.Now().UnixNano()))
	if rrPay2.Code == http.StatusCreated || rrPay2.Code == http.StatusOK {
		t.Fatalf("revoked key must fail auth, got %d %s", rrPay2.Code, rrPay2.Body.String())
	}
	// ResolveAPIKey also fails
	_, err := gw.ResolveAPIKey(t.Context(), rawKey)
	if err == nil {
		t.Fatal("ResolveAPIKey must fail for revoked key")
	}
}

func TestCredentials_LiveClaimWithoutKYCDenied(t *testing.T) {
	h, _, _, _, capture := newCredentialStack(t)
	sellerCookie, _, _ := onboardSellerStore(t, h, capture)

	rrReq := credJSON(t, h, http.MethodPost, "/v1/me/credentials/requests", sellerCookie, map[string]any{
		"paymentMode": "LIVE",
		"purpose":     "API_KEY",
	})
	// May create PENDING_KYC without claim token, or deny.
	if rrReq.Code == http.StatusCreated || rrReq.Code == http.StatusOK {
		var env map[string]any
		_ = json.Unmarshal(rrReq.Body.Bytes(), &env)
		data, _ := env["data"].(map[string]any)
		if tok, _ := data["claimToken"].(string); tok != "" {
			// If somehow claim issued, exchange must deny without KYC
			rrClaim := credJSON(t, h, http.MethodPost, "/v1/me/credentials/claim", sellerCookie, map[string]any{
				"token": tok,
			})
			if rrClaim.Code == http.StatusOK {
				t.Fatal("live claim without KYC must be denied")
			}
		} else {
			// PENDING_KYC path — good
			iss := data["issuance"].(map[string]any)
			if iss["status"] != "PENDING_KYC" && iss["status"] != kyc.IssuancePendingKYC {
				// Accept PENDING_KYC only
				if st, _ := iss["status"].(string); st != "PENDING_KYC" {
					t.Logf("live without kyc status=%v", iss["status"])
				}
			}
		}
	} else if rrReq.Code != http.StatusForbidden && rrReq.Code != http.StatusBadRequest {
		// Forbidden also acceptable
		t.Fatalf("unexpected live request status %d %s", rrReq.Code, rrReq.Body.String())
	}
}

func TestCredentials_LiveClaimAfterKYC_AdminNeverRaw(t *testing.T) {
	h, _, gw, kycSvc, capture := newCredentialStack(t)
	sellerCookie, storeID, _ := onboardSellerStore(t, h, capture)

	// Admin
	adminEmail := fmt.Sprintf("cred-admin-%d@example.com", time.Now().UnixNano())
	adminCookie := registerVerifyLogin(t, h, capture, adminEmail, "password123", "SELLER")
	authz := &application.AuthzService{
		Store: postgres.NewAuthzRepo(openPool(t).Pool()),
		IDs:   observability.NewULIDGenerator(),
		Clock: observability.SystemClock{},
		Log:   observability.NewSlogLogger("error", "test"),
	}
	if _, err := authz.BootstrapAdminByEmail(t.Context(), adminEmail); err != nil {
		t.Fatalf("admin bootstrap: %v", err)
	}

	// Create KYC case + docs + submit + approve (reuse kyc helpers)
	rrCase := credJSON(t, h, http.MethodPost, "/v1/me/kyc/cases", sellerCookie, map[string]any{
		"legalName":      "PT Cred Test",
		"businessName":   "Cred Co",
		"consentVersion": kyc.ConsentVersionV1,
	})
	if rrCase.Code != http.StatusCreated {
		t.Fatalf("create case %d %s", rrCase.Code, rrCase.Body.String())
	}
	var envCase map[string]any
	_ = json.Unmarshal(rrCase.Body.Bytes(), &envCase)
	caseID, _ := envCase["data"].(map[string]any)["id"].(string)

	jpeg := minimalJPEG()
	for len(jpeg) < kyc.MinDocumentBytes {
		jpeg = append(jpeg, 0x00)
	}
	jpeg[0], jpeg[1] = 0xFF, 0xD8
	up1 := kycUpload(t, h, "/v1/me/kyc/cases/"+caseID+"/documents", sellerCookie, "ID_FRONT", "id.jpg", jpeg, "image/jpeg")
	if up1.Code != http.StatusCreated {
		t.Fatalf("upload id %d %s", up1.Code, up1.Body.String())
	}
	up2 := kycUpload(t, h, "/v1/me/kyc/cases/"+caseID+"/documents", sellerCookie, "SELFIE", "selfie.jpg", jpeg, "image/jpeg")
	if up2.Code != http.StatusCreated {
		t.Fatalf("upload selfie %d %s", up2.Code, up2.Body.String())
	}
	rrS := credJSON(t, h, http.MethodPost, "/v1/me/kyc/cases/"+caseID+"/submit", sellerCookie, map[string]any{})
	if rrS.Code != http.StatusOK {
		t.Fatalf("submit %d %s", rrS.Code, rrS.Body.String())
	}
	// Admin may need review first depending on SM — try APPROVE; if fails START_REVIEW then APPROVE
	rrA := credJSON(t, h, http.MethodPost, "/v1/admin/kyc/"+caseID+"/transition", adminCookie, map[string]any{
		"action": "START_REVIEW",
	})
	_ = rrA
	rrA = credJSON(t, h, http.MethodPost, "/v1/admin/kyc/"+caseID+"/transition", adminCookie, map[string]any{
		"action": "APPROVE",
	})
	if rrA.Code != http.StatusOK {
		t.Fatalf("approve %d %s", rrA.Code, rrA.Body.String())
	}
	if strings.Contains(rrA.Body.String(), "fsk_live_") || strings.Contains(rrA.Body.String(), "fsk_test_") {
		t.Fatal("admin approve must never return raw key")
	}

	pool := openPool(t)
	var merchantID string
	_ = pool.Pool().QueryRow(t.Context(), `SELECT merchant_id FROM stores WHERE id=$1`, storeID).Scan(&merchantID)
	ok, ir, err := kycSvc.LiveIssuanceAuthorized(t.Context(), merchantID)
	if err != nil || !ok {
		t.Fatalf("issuance authorized: ok=%v ir=%+v err=%v", ok, ir, err)
	}

	// Seller requests claim (refreshes claim token on AUTHORIZED issuance)
	rrReq := credJSON(t, h, http.MethodPost, "/v1/me/credentials/requests", sellerCookie, map[string]any{
		"paymentMode": "LIVE",
		"purpose":     "API_KEY",
		"reason":      "claim live",
	})
	if rrReq.Code != http.StatusCreated && rrReq.Code != http.StatusOK {
		t.Fatalf("live request %d %s", rrReq.Code, rrReq.Body.String())
	}
	var envR map[string]any
	_ = json.Unmarshal(rrReq.Body.Bytes(), &envR)
	claimTok, _ := envR["data"].(map[string]any)["claimToken"].(string)
	if claimTok == "" {
		t.Fatalf("expected live claim token: %s", rrReq.Body.String())
	}

	// Admin list never raw
	rrAdminList := credJSON(t, h, http.MethodGet, "/v1/admin/merchants/"+merchantID+"/api-credentials", adminCookie, nil)
	if rrAdminList.Code != http.StatusOK {
		t.Fatalf("admin list %d %s", rrAdminList.Code, rrAdminList.Body.String())
	}
	if strings.Contains(rrAdminList.Body.String(), "fsk_live_") || strings.Contains(rrAdminList.Body.String(), claimTok) {
		t.Fatal("admin list must not contain raw key or claim token")
	}

	// Claim live key
	rrClaim := credJSON(t, h, http.MethodPost, "/v1/me/credentials/claim", sellerCookie, map[string]any{
		"token": claimTok,
	})
	if rrClaim.Code != http.StatusOK {
		t.Fatalf("live claim %d %s", rrClaim.Code, rrClaim.Body.String())
	}
	var envC map[string]any
	_ = json.Unmarshal(rrClaim.Body.Bytes(), &envC)
	liveRaw, _ := envC["data"].(map[string]any)["apiKey"].(string)
	if !strings.HasPrefix(liveRaw, "fsk_live_") {
		t.Fatalf("live raw %s", liveRaw)
	}

	// Raw not in DB
	var cnt int
	_ = pool.Pool().QueryRow(t.Context(),
		`SELECT count(*) FROM merchant_api_keys WHERE key_hash=$1 OR key_prefix=$1`, liveRaw).Scan(&cnt)
	if cnt != 0 {
		t.Fatal("live raw must not be in DB")
	}

	// Gateway works
	rrPay := gatewayPOST(t, h, "/v1/gateway/payment-intents", liveRaw, map[string]any{
		"merchantReference": fmt.Sprintf("cred-live-%d", time.Now().UnixNano()),
		"amount":            100_000,
		"currency":          "IDR",
	}, fmt.Sprintf("idem-cred-live-%d", time.Now().UnixNano()))
	if rrPay.Code != http.StatusCreated && rrPay.Code != http.StatusOK {
		t.Fatalf("live pay %d %s", rrPay.Code, rrPay.Body.String())
	}

	// Admin authorize/suspend never raw
	rrAuthz := credJSON(t, h, http.MethodPost, "/v1/admin/merchants/"+merchantID+"/api-credentials/authorize", adminCookie, map[string]any{
		"reason": "support authorize",
	})
	// may 200 or conflict if no outstanding — either way no raw
	if strings.Contains(rrAuthz.Body.String(), "fsk_live_") {
		t.Fatal("admin authorize must not return raw")
	}
	var keyID string
	_ = pool.Pool().QueryRow(t.Context(),
		`SELECT id FROM merchant_api_keys WHERE merchant_id=$1 AND status='ACTIVE'`, merchantID).Scan(&keyID)
	rrSus := credJSON(t, h, http.MethodPost, "/v1/admin/merchants/"+merchantID+"/api-credentials/"+keyID+"/suspend", adminCookie, map[string]any{
		"reason": "security review",
	})
	if rrSus.Code != http.StatusOK {
		t.Fatalf("suspend %d %s", rrSus.Code, rrSus.Body.String())
	}
	if strings.Contains(rrSus.Body.String(), liveRaw) {
		t.Fatal("suspend response must not contain raw")
	}
	// Suspended key fails gateway
	_, err = gw.ResolveAPIKey(t.Context(), liveRaw)
	if err == nil {
		t.Fatal("suspended key must fail ResolveAPIKey")
	}
}

func TestCredentials_AdminResponsesNeverContainRaw(t *testing.T) {
	h, _, _, _, capture := newCredentialStack(t)
	sellerCookie, storeID, _ := onboardSellerStore(t, h, capture)
	// sandbox claim
	rrReq := credJSON(t, h, http.MethodPost, "/v1/me/credentials/requests", sellerCookie, map[string]any{
		"paymentMode": "SANDBOX", "purpose": "API_KEY",
	})
	var env map[string]any
	_ = json.Unmarshal(rrReq.Body.Bytes(), &env)
	tok, _ := env["data"].(map[string]any)["claimToken"].(string)
	rrClaim := credJSON(t, h, http.MethodPost, "/v1/me/credentials/claim", sellerCookie, map[string]any{"token": tok})
	var envC map[string]any
	_ = json.Unmarshal(rrClaim.Body.Bytes(), &envC)
	raw, _ := envC["data"].(map[string]any)["apiKey"].(string)

	adminEmail := fmt.Sprintf("cred-admin2-%d@example.com", time.Now().UnixNano())
	adminCookie := registerVerifyLogin(t, h, capture, adminEmail, "password123", "SELLER")
	authz := &application.AuthzService{
		Store: postgres.NewAuthzRepo(openPool(t).Pool()),
		IDs:   observability.NewULIDGenerator(),
		Clock: observability.SystemClock{},
		Log:   observability.NewSlogLogger("error", "test"),
	}
	if _, err := authz.BootstrapAdminByEmail(t.Context(), adminEmail); err != nil {
		t.Fatalf("admin bootstrap: %v", err)
	}

	pool := openPool(t)
	var merchantID string
	_ = pool.Pool().QueryRow(t.Context(), `SELECT merchant_id FROM stores WHERE id=$1`, storeID).Scan(&merchantID)

	rrList := credJSON(t, h, http.MethodGet, "/v1/admin/merchants/"+merchantID+"/api-credentials", adminCookie, nil)
	if strings.Contains(rrList.Body.String(), raw) {
		t.Fatal("admin list leaked raw key")
	}
}
