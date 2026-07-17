//go:build integration

package integration_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	httpadapter "github.com/dasepmoch/fersaku-new/backend/internal/adapters/http"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/mail"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/observability"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/config"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/authz"
)

func newAdminReadsStack(t *testing.T) (http.Handler, *application.AuthService, *application.AuthzService, *mail.Capture) {
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
	adminReads := &application.AdminReadService{
		Store: postgres.NewAdminRepo(pool.Pool()),
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
		SessionCookieName: "fersaku_session",
		CSRFSoftDisable:   true,
		AuthService:       authSvc,
		AuthzService:      authzSvc,
		AdminReadService:  adminReads,
		RateLimiter:       nil,
		RequestTimeout:    30 * time.Second,
	})
	return h, authSvc, authzSvc, capture
}

func TestAdminReads_PermissionDeniedWithoutAdmin(t *testing.T) {
	h, _, _, capture := newAdminReadsStack(t)
	email := fmt.Sprintf("seller-noadmin-%d@example.com", time.Now().UnixNano())
	cookie := registerVerifyLogin(t, h, capture, email, "password123", "SELLER")

	paths := []string{
		"/v1/admin/overview",
		"/v1/admin/merchants",
		"/v1/admin/buyers",
		"/v1/admin/orders",
		"/v1/admin/payments",
		"/v1/admin/inventory",
		"/v1/admin/fulfillments",
		"/v1/admin/reviews",
		"/v1/admin/users",
		"/v1/admin/overview/platform-volume",
		"/v1/admin/withdrawals",
	}
	for _, p := range paths {
		rr := jsonGET(t, h, p, []*http.Cookie{cookie})
		if rr.Code != http.StatusForbidden {
			t.Fatalf("%s want 403 got %d %s", p, rr.Code, rr.Body.String())
		}
		if code := problemCode(t, rr); code != "FORBIDDEN" {
			t.Fatalf("%s code=%s", p, code)
		}
	}
}

func TestAdminReads_AdminCanListAndNoSecrets(t *testing.T) {
	h, _, authzSvc, capture := newAdminReadsStack(t)
	cookie, _ := bootstrapAdminCookie(t, h, authzSvc, capture)

	rr := jsonGET(t, h, "/v1/admin/overview", []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("overview %d %s", rr.Code, rr.Body.String())
	}
	body := rr.Body.String()
	for _, bad := range []string{"encrypted_payload", "password_hash", "token_hash", "key_hash", "account_number_ciphertext"} {
		if strings.Contains(body, bad) {
			t.Fatalf("response leaked %s: %s", bad, body)
		}
	}

	rr = jsonGET(t, h, "/v1/admin/merchants", []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("merchants %d %s", rr.Code, rr.Body.String())
	}

	rr = jsonGET(t, h, "/v1/admin/inventory", []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("inventory %d %s", rr.Code, rr.Body.String())
	}
	if strings.Contains(rr.Body.String(), "encrypted_payload") {
		t.Fatal("inventory leaked encrypted_payload")
	}
	if cc := rr.Header().Get("Cache-Control"); !strings.Contains(cc, "no-store") {
		t.Fatalf("inventory Cache-Control=%q", cc)
	}

	// Inbound/outbound queues are separate namespaces (mounted with Callback/Webhook services).
	// Here we only assert FE read routes under admin reads.
	for _, p := range []string{
		"/v1/admin/buyers",
		"/v1/admin/orders",
		"/v1/admin/payments",
		"/v1/admin/withdrawals",
		"/v1/admin/fulfillments",
		"/v1/admin/reviews",
		"/v1/admin/users",
	} {
		rr = jsonGET(t, h, p, []*http.Cookie{cookie})
		if rr.Code != http.StatusOK {
			t.Fatalf("%s %d %s", p, rr.Code, rr.Body.String())
		}
		if strings.Contains(rr.Body.String(), "encrypted_payload") || strings.Contains(rr.Body.String(), "password_hash") {
			t.Fatalf("%s leaked secrets", p)
		}
	}
}

func TestAdminReads_PaymentSourceFilter(t *testing.T) {
	h, _, authzSvc, capture := newAdminReadsStack(t)
	cookie, _ := bootstrapAdminCookie(t, h, authzSvc, capture)

	rr := jsonGET(t, h, "/v1/admin/payments?source=MIXED", []*http.Cookie{cookie})
	if rr.Code == http.StatusOK {
		t.Fatalf("MIXED must not succeed on payments: %s", rr.Body.String())
	}
	if code := problemCode(t, rr); code != "VALIDATION_FAILED" {
		t.Fatalf("want VALIDATION_FAILED got %s body=%s", code, rr.Body.String())
	}

	rr = jsonGET(t, h, "/v1/admin/payments?source=STOREFRONT", []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("STOREFRONT %d %s", rr.Code, rr.Body.String())
	}
	rr = jsonGET(t, h, "/v1/admin/payments?source=QRIS_API", []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("QRIS_API %d %s", rr.Code, rr.Body.String())
	}

	// Withdrawals allow MIXED filter
	rr = jsonGET(t, h, "/v1/admin/withdrawals?source=MIXED", []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("withdrawal MIXED %d %s", rr.Code, rr.Body.String())
	}
}

func TestAdminReads_OverviewAndPlatformVolume(t *testing.T) {
	h, authSvc, authzSvc, capture := newAdminReadsStack(t)
	cookie, email := bootstrapAdminCookie(t, h, authzSvc, capture)

	p, _, err := authSvc.ResolveSession(context.Background(), cookie.Value)
	if err != nil {
		t.Fatal(err)
	}
	if !authz.HasPermission(authz.PermissionSet(p.Permissions), authz.PermAdminDashboardRead) {
		t.Fatalf("missing admin.dashboard.read: %v", p.Permissions)
	}

	rr := jsonGET(t, h, "/v1/admin/overview", []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("overview %d %s", rr.Code, rr.Body.String())
	}
	var env struct {
		Data map[string]any `json:"data"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &env); err != nil {
		t.Fatal(err)
	}
	for _, k := range []string{"merchantCount", "orderCount", "paymentCount", "grossVolumePaidIdr"} {
		if _, ok := env.Data[k]; !ok {
			t.Fatalf("missing %s in %v", k, env.Data)
		}
	}

	rr = jsonGET(t, h, "/v1/admin/overview/platform-volume", []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("platform-volume %d %s", rr.Code, rr.Body.String())
	}
	var volEnv struct {
		Data []any `json:"data"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &volEnv); err != nil {
		t.Fatal(err)
	}
	if len(volEnv.Data) != 24 {
		t.Fatalf("want 24 hourly buckets got %d", len(volEnv.Data))
	}

	rr = jsonGET(t, h, "/v1/admin/users?q="+email, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("users %d %s", rr.Code, rr.Body.String())
	}
}

func TestAdminReads_NoDeletedDomains(t *testing.T) {
	h, _, _, capture := newAdminReadsStack(t)
	email := fmt.Sprintf("admin-neg-%d@example.com", time.Now().UnixNano())
	cookie := registerVerifyLogin(t, h, capture, email, "password123", "SELLER")
	for _, p := range []string{
		"/v1/admin/risk",
		"/v1/admin/disputes",
		"/v1/admin/reconciliation",
		"/v1/admin/security",
	} {
		rr := jsonGET(t, h, p, []*http.Cookie{cookie})
		if rr.Code != http.StatusNotFound {
			t.Fatalf("%s want 404 got %d", p, rr.Code)
		}
	}
}
