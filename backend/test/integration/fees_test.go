//go:build integration

package integration_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	httpadapter "github.com/dasepmoch/fersaku-new/backend/internal/adapters/http"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/mail"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/observability"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/config"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/platform"
)

func newFeeStack(t *testing.T) (http.Handler, *application.FeeService, *application.AuthzService, *mail.Capture) {
	t.Helper()
	_ = databaseURL(t)
	runMigrate(t, "up")
	pool := openPool(t)
	ids := observability.NewULIDGenerator()
	capture := mail.NewCapture()
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
	feeSvc := &application.FeeService{
		Store: postgres.NewFeeRepo(pool.Pool()),
		IDs:   ids,
		Clock: observability.SystemClock{},
		Log:   observability.NewSlogLogger("error", "test"),
	}
	h := httpadapter.NewRouterWith(httpadapter.RouterDeps{
		Log:               observability.NewSlogLogger("error", "test"),
		IDs:               ids,
		Service:           "fersaku-api",
		Version:           "0.0.0-test",
		AppEnv:            config.EnvTest,
		Ready:             func() bool { return true },
		StartedAt:         time.Now().UTC(),
		CSRFSoftDisable:   true,
		AuthService:       authSvc,
		AuthzService:      authzSvc,
		FeeService:        feeSvc,
		SessionCookieName: "fersaku_session",
		RateLimiter:       nil,
		RequestTimeout:    10 * time.Second,
	})
	return h, feeSvc, authzSvc, capture
}

func TestFeePolicySeedAndCalculator(t *testing.T) {
	h, feeSvc, _, _ := newFeeStack(t)

	p, err := feeSvc.ActivePolicy(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if !p.MatchesLaunchInvariant() {
		t.Fatalf("policy not launch invariant: %+v", p)
	}
	if p.Checksum != "74db3dc26f74c349ef49b7928e3b8151ed9d6e8555564bd01c46e8baba42eeeb" {
		t.Fatalf("checksum %s", p.Checksum)
	}

	// Acceptance: Rp100k → 3700 / 96300
	tx, err := platform.CalculateTransactionFee(100_000, p)
	if err != nil || tx.TotalFeeIDR != 3_700 || tx.NetIDR != 96_300 {
		t.Fatalf("100k fee=%d net=%d err=%v", tx.TotalFeeIDR, tx.NetIDR, err)
	}
	tx2, err := platform.CalculateTransactionFee(250_000, p)
	if err != nil || tx2.TotalFeeIDR != 8_200 || tx2.NetIDR != 241_800 {
		t.Fatalf("250k fee=%d net=%d err=%v", tx2.TotalFeeIDR, tx2.NetIDR, err)
	}
	_, err = platform.CalculateWithdrawalFee(49_999, 0, p)
	if err != platform.ErrBelowMinWithdrawal {
		t.Fatalf("below min err=%v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/v1/platform/fees", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rr.Code, rr.Body.String())
	}
	var env map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &env); err != nil {
		t.Fatal(err)
	}
	data := env["data"].(map[string]any)
	if data["policyVersion"] != platform.PolicyVersionLaunchV1 {
		t.Fatalf("version %v", data["policyVersion"])
	}

	snap, err := feeSvc.SnapshotTransaction(context.Background(), platform.SourceStorefront, tx, p)
	if err != nil {
		t.Fatal(err)
	}
	if snap.ID == "" || snap.TotalFeeIDR != 3_700 {
		t.Fatalf("snap %+v", snap)
	}
}

func TestFeeAdminPreviewAndRejectMutation(t *testing.T) {
	h, _, authzSvc, capture := newFeeStack(t)
	email := fmt.Sprintf("fee-admin-%d@example.com", time.Now().UnixNano())
	_ = registerVerifyLogin(t, h, capture, email, "password123", "SELLER")
	if _, err := authzSvc.BootstrapAdminByEmail(context.Background(), email); err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	rrLogin := jsonPOST(t, h, "/v1/auth/login", map[string]any{
		"email": email, "password": "password123", "surface": "ADMIN",
	}, nil)
	if rrLogin.Code != http.StatusOK {
		rrLogin = jsonPOST(t, h, "/v1/auth/login", map[string]any{
			"email": email, "password": "password123", "surface": "SELLER",
		}, nil)
	}
	if rrLogin.Code != http.StatusOK {
		t.Fatalf("relogin %d %s", rrLogin.Code, rrLogin.Body.String())
	}
	cookie := sessionCookie(rrLogin)
	if cookie == nil {
		t.Fatal("missing cookie")
	}

	body := map[string]any{"kind": "transaction", "amount": 100000, "source": "STOREFRONT"}
	raw, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/v1/admin/system/fees/preview", bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(cookie)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("preview status %d body %s", rr.Code, rr.Body.String())
	}
	var env map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &env)
	data := env["data"].(map[string]any)
	if int64(data["totalFee"].(float64)) != 3700 || int64(data["netAmount"].(float64)) != 96300 {
		t.Fatalf("preview data %+v", data)
	}

	req2 := httptest.NewRequest(http.MethodPost, "/v1/admin/system/fees", bytes.NewReader([]byte(`{"transactionPercentBps":1}`)))
	req2.Header.Set("Content-Type", "application/json")
	req2.AddCookie(cookie)
	rr2 := httptest.NewRecorder()
	h.ServeHTTP(rr2, req2)
	if rr2.Code != http.StatusMethodNotAllowed {
		t.Fatalf("mutate status %d body %s", rr2.Code, rr2.Body.String())
	}

	req3 := httptest.NewRequest(http.MethodPost, "/v1/admin/fees/publish", bytes.NewReader([]byte(`{}`)))
	req3.Header.Set("Content-Type", "application/json")
	req3.AddCookie(cookie)
	rr3 := httptest.NewRecorder()
	h.ServeHTTP(rr3, req3)
	if rr3.Code != http.StatusMethodNotAllowed {
		t.Fatalf("publish status %d", rr3.Code)
	}

	wbody, _ := json.Marshal(map[string]any{"kind": "withdrawal", "amount": 49999, "providerFee": 0})
	req4 := httptest.NewRequest(http.MethodPost, "/v1/admin/fees/preview", bytes.NewReader(wbody))
	req4.Header.Set("Content-Type", "application/json")
	req4.AddCookie(cookie)
	rr4 := httptest.NewRecorder()
	h.ServeHTTP(rr4, req4)
	if rr4.Code != http.StatusBadRequest {
		t.Fatalf("below min preview status %d body %s", rr4.Code, rr4.Body.String())
	}
}
