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
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/xendit"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/config"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/gateway"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/payments"
)

func newGatewayStack(t *testing.T) (http.Handler, *application.GatewayService, *xendit.Fake, *mail.Capture) {
	t.Helper()
	_ = databaseURL(t)
	runMigrate(t, "up")
	pool := openPool(t)
	ids := observability.NewULIDGenerator()
	capture := mail.NewCapture()
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
		RateLimiter:       nil,
		RequestTimeout:    30 * time.Second,
	})
	return h, gw, xd, capture
}

func provisionSandboxKey(t *testing.T, h http.Handler, gw *application.GatewayService, capture *mail.Capture) (rawKey, merchantID, storeID string) {
	t.Helper()
	cookie, storeID, _ := onboardSellerStore(t, h, capture)
	pool := openPool(t)
	var mid string
	err := pool.Pool().QueryRow(t.Context(), `SELECT merchant_id FROM stores WHERE id = $1`, storeID).Scan(&mid)
	if err != nil {
		t.Fatalf("merchant lookup: %v", err)
	}
	// At most one ACTIVE key — revoke any prior.
	_, _ = pool.Pool().Exec(t.Context(), `UPDATE merchant_api_keys SET status='REVOKED', updated_at=now() WHERE merchant_id=$1 AND status='ACTIVE'`, mid)
	raw, _, err := gw.CreateSandboxAPIKey(t.Context(), mid, "test-sandbox")
	if err != nil {
		t.Fatalf("create sandbox key: %v", err)
	}
	_ = cookie
	return raw, mid, storeID
}

func gatewayPOST(t *testing.T, h http.Handler, path, rawKey string, body any, idem string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, mustJSON(t, body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+rawKey)
	if idem != "" {
		req.Header.Set("Idempotency-Key", idem)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func gatewayGET(t *testing.T, h http.Handler, path, rawKey string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func gatewayProblemCode(body []byte) string {
	var env map[string]any
	if err := json.Unmarshal(body, &env); err != nil {
		return ""
	}
	if c, ok := env["code"].(string); ok {
		return c
	}
	if errObj, ok := env["error"].(map[string]any); ok {
		if c, ok := errObj["code"].(string); ok {
			return c
		}
	}
	return ""
}

func TestGateway_SandboxCreateWithoutKYC(t *testing.T) {
	h, gw, _, capture := newGatewayStack(t)
	rawKey, _, _ := provisionSandboxKey(t, h, gw, capture)

	rr := gatewayPOST(t, h, "/v1/gateway/payment-intents", rawKey, map[string]any{
		"merchantReference": fmt.Sprintf("inv-sandbox-%d", time.Now().UnixNano()),
		"amount":            100_000,
		"currency":          "IDR",
		"description":       "Sandbox payment",
		"expiresInMinutes":  15,
	}, fmt.Sprintf("idem-gw-%d", time.Now().UnixNano()))
	if rr.Code != http.StatusCreated && rr.Code != http.StatusOK {
		t.Fatalf("create %d %s", rr.Code, rr.Body.String())
	}
	var env map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &env); err != nil {
		t.Fatal(err)
	}
	data := env["data"].(map[string]any)
	if data["source"] != "QRIS_API" {
		t.Fatalf("source %v", data["source"])
	}
	if data["paymentMode"] != "SANDBOX" {
		t.Fatalf("mode %v", data["paymentMode"])
	}
	if int64(data["amount"].(float64)) != 100_000 {
		t.Fatalf("amount %v", data["amount"])
	}
	if int64(data["fee"].(float64)) != 3_700 {
		t.Fatalf("fee %v want 3700 (same as storefront)", data["fee"])
	}
	if data["status"] != "PENDING" {
		t.Fatalf("status %v", data["status"])
	}
	intentID := data["paymentIntentId"].(string)

	rrG := gatewayGET(t, h, "/v1/gateway/payment-intents/"+intentID, rawKey)
	if rrG.Code != http.StatusOK {
		t.Fatalf("get %d %s", rrG.Code, rrG.Body.String())
	}

	// Legacy alias with deprecation header
	rrL := gatewayPOST(t, h, "/v1/qris/payments", rawKey, map[string]any{
		"merchant_reference": fmt.Sprintf("inv-legacy-%d", time.Now().UnixNano()),
		"amount":             50_000,
		"currency":           "IDR",
		"expires_in_minutes": 15,
	}, fmt.Sprintf("idem-legacy-%d", time.Now().UnixNano()))
	if rrL.Code != http.StatusCreated && rrL.Code != http.StatusOK {
		t.Fatalf("legacy create %d %s", rrL.Code, rrL.Body.String())
	}
	if rrL.Header().Get("Deprecation") != "true" {
		t.Fatal("legacy must set Deprecation header")
	}

	rrC := gatewayPOST(t, h, "/v1/gateway/payment-intents/"+intentID+"/cancel", rawKey, map[string]any{
		"reason": "test_cancel",
	}, fmt.Sprintf("cancel-%d", time.Now().UnixNano()))
	if rrC.Code != http.StatusOK && rrC.Code != http.StatusAccepted {
		t.Fatalf("cancel %d %s", rrC.Code, rrC.Body.String())
	}

	rrE := gatewayGET(t, h, "/v1/gateway/payment-intents/"+intentID+"/events", rawKey)
	if rrE.Code != http.StatusOK {
		t.Fatalf("events %d %s", rrE.Code, rrE.Body.String())
	}
}

func TestGateway_LiveRejectedBeforeCapability(t *testing.T) {
	h, gw, _, capture := newGatewayStack(t)
	_, merchantID, _ := provisionSandboxKey(t, h, gw, capture)
	pool := openPool(t)
	// BE-400: LIVE key create is denied before KYC-approved capability.
	_, _ = pool.Pool().Exec(t.Context(), `UPDATE merchant_api_keys SET status='REVOKED', updated_at=now() WHERE merchant_id=$1 AND status='ACTIVE'`, merchantID)
	_, _, err := gw.CreateAPIKey(t.Context(), merchantID, gateway.ModeLive, "live-no-kyc")
	if err == nil {
		t.Fatal("expected LIVE key create denied before capability")
	}
	if !strings.Contains(err.Error(), "KYC") && !strings.Contains(err.Error(), "Live QRIS") {
		t.Fatalf("expected KYC error, got %v", err)
	}

	// Grant LIVE capability (KYC approved) → key create + payment works; same fee service.
	if err := gw.SetCapability(t.Context(), merchantID, gateway.ModeLive, gateway.CapStatusActive); err != nil {
		t.Fatal(err)
	}
	liveRaw, _, err := gw.CreateAPIKey(t.Context(), merchantID, gateway.ModeLive, "live-ok")
	if err != nil {
		t.Fatalf("live key after capability: %v", err)
	}
	rr2 := gatewayPOST(t, h, "/v1/gateway/payment-intents", liveRaw, map[string]any{
		"merchantReference": fmt.Sprintf("live-ok-%d", time.Now().UnixNano()),
		"amount":            100_000,
		"currency":          "IDR",
	}, fmt.Sprintf("idem-live-ok-%d", time.Now().UnixNano()))
	if rr2.Code != http.StatusCreated && rr2.Code != http.StatusOK {
		t.Fatalf("live create after capability %d %s", rr2.Code, rr2.Body.String())
	}
	var env2 map[string]any
	_ = json.Unmarshal(rr2.Body.Bytes(), &env2)
	data2 := env2["data"].(map[string]any)
	if data2["paymentMode"] != "LIVE" {
		t.Fatalf("mode %v", data2["paymentMode"])
	}
	if data2["source"] != "QRIS_API" {
		t.Fatalf("source %v", data2["source"])
	}
	if int64(data2["fee"].(float64)) != 3_700 {
		t.Fatalf("live fee %v", data2["fee"])
	}
}

func TestGateway_WebhookURLRejectedAndInactiveEndpoint(t *testing.T) {
	h, gw, _, capture := newGatewayStack(t)
	rawKey, merchantID, _ := provisionSandboxKey(t, h, gw, capture)

	rr := gatewayPOST(t, h, "/v1/gateway/payment-intents", rawKey, map[string]any{
		"merchantReference": fmt.Sprintf("wh-url-%d", time.Now().UnixNano()),
		"amount":            10_000,
		"currency":          "IDR",
		"webhookUrl":        "https://evil.example/hook",
	}, fmt.Sprintf("idem-whurl-%d", time.Now().UnixNano()))
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("webhookUrl expected 400 got %d %s", rr.Code, rr.Body.String())
	}

	// snake_case legacy also rejects webhook_url
	rrSnake := gatewayPOST(t, h, "/v1/qris/payments", rawKey, map[string]any{
		"merchant_reference": fmt.Sprintf("wh-url-snake-%d", time.Now().UnixNano()),
		"amount":             10_000,
		"currency":           "IDR",
		"webhook_url":        "https://evil.example/hook",
	}, fmt.Sprintf("idem-whurl-snake-%d", time.Now().UnixNano()))
	if rrSnake.Code != http.StatusBadRequest {
		t.Fatalf("webhook_url expected 400 got %d %s", rrSnake.Code, rrSnake.Body.String())
	}

	ep, err := gw.RegisterWebhookEndpoint(t.Context(), merchantID, payments.PaymentModeSandbox, "https://hooks.merchant.example/fsk")
	if err != nil {
		t.Fatal(err)
	}
	pool := openPool(t)
	_, _ = pool.Pool().Exec(t.Context(), `UPDATE seller_webhook_endpoints SET status='SUSPENDED' WHERE id=$1`, ep.ID)

	rr2 := gatewayPOST(t, h, "/v1/gateway/payment-intents", rawKey, map[string]any{
		"merchantReference": fmt.Sprintf("wh-id-%d", time.Now().UnixNano()),
		"amount":            10_000,
		"currency":          "IDR",
		"webhookEndpointId": ep.ID,
	}, fmt.Sprintf("idem-whep-%d", time.Now().UnixNano()))
	if rr2.Code != http.StatusBadRequest {
		t.Fatalf("inactive endpoint expected 400 got %d %s", rr2.Code, rr2.Body.String())
	}
}

func TestGateway_UnregisteredRedirectOriginRejectedNoFetch(t *testing.T) {
	h, gw, _, capture := newGatewayStack(t)
	rawKey, merchantID, _ := provisionSandboxKey(t, h, gw, capture)

	rr := gatewayPOST(t, h, "/v1/gateway/payment-intents", rawKey, map[string]any{
		"merchantReference": fmt.Sprintf("redir-%d", time.Now().UnixNano()),
		"amount":            10_000,
		"currency":          "IDR",
		"successUrl":        "https://not-registered.example/success",
		"failureUrl":        "https://not-registered.example/failure",
	}, fmt.Sprintf("idem-redir-%d", time.Now().UnixNano()))
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 unregistered origin, got %d %s", rr.Code, rr.Body.String())
	}

	_, err := gw.RegisterRedirectOrigin(t.Context(), merchantID, payments.PaymentModeSandbox, "https://merchant.example")
	if err != nil {
		t.Fatal(err)
	}
	rr2 := gatewayPOST(t, h, "/v1/gateway/payment-intents", rawKey, map[string]any{
		"merchantReference": fmt.Sprintf("redir-ok-%d", time.Now().UnixNano()),
		"amount":            10_000,
		"currency":          "IDR",
		"successUrl":        "https://merchant.example/success?order=1",
		"failureUrl":        "https://merchant.example/failure",
	}, fmt.Sprintf("idem-redir-ok-%d", time.Now().UnixNano()))
	if rr2.Code != http.StatusCreated && rr2.Code != http.StatusOK {
		t.Fatalf("registered origin create %d %s", rr2.Code, rr2.Body.String())
	}

	rr3 := gatewayPOST(t, h, "/v1/gateway/payment-intents", rawKey, map[string]any{
		"merchantReference": fmt.Sprintf("redir-http-%d", time.Now().UnixNano()),
		"amount":            10_000,
		"currency":          "IDR",
		"successUrl":        "http://merchant.example/success",
	}, fmt.Sprintf("idem-http-%d", time.Now().UnixNano()))
	if rr3.Code != http.StatusBadRequest {
		t.Fatalf("http successUrl expected 400 got %d", rr3.Code)
	}
}

func TestGateway_NoProductEndpoints(t *testing.T) {
	h, gw, _, capture := newGatewayStack(t)
	rawKey, _, _ := provisionSandboxKey(t, h, gw, capture)

	for _, path := range []string{
		"/v1/gateway/products",
		"/v1/gateway/catalog",
		"/v1/gateway/uploads",
		"/v1/qris/products",
	} {
		rr := gatewayGET(t, h, path, rawKey)
		if rr.Code != http.StatusNotFound {
			t.Fatalf("%s expected 404 got %d %s", path, rr.Code, rr.Body.String())
		}
		rrP := gatewayPOST(t, h, path, rawKey, map[string]any{"title": "x"}, "idem")
		if rrP.Code != http.StatusNotFound {
			t.Fatalf("POST %s expected 404 got %d", path, rrP.Code)
		}
	}
}

func TestGateway_AuthRequired(t *testing.T) {
	h, _, _, _ := newGatewayStack(t)
	req := httptest.NewRequest(http.MethodPost, "/v1/gateway/payment-intents", mustJSON(t, map[string]any{
		"merchantReference": "x",
		"amount":            1000,
	}))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", "no-auth")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 got %d %s", rr.Code, rr.Body.String())
	}
}
