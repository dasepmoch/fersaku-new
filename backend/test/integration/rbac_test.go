//go:build integration

package integration_test

import (
	"context"
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
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/config"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/authz"
)

func newRBACStack(t *testing.T) (http.Handler, *application.AuthService, *application.AuthzService, *mail.Capture) {
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
		RateLimiter:       nil,
		RequestTimeout:    10 * time.Second,
	})
	return h, authSvc, authzSvc, capture
}

func registerVerifyLogin(t *testing.T, h http.Handler, capture *mail.Capture, email, password, surface string) *http.Cookie {
	t.Helper()
	rr := jsonPOST(t, h, "/v1/auth/register", map[string]any{
		"email": email, "password": password, "name": "T", "surface": surface,
	}, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("register %d %s", rr.Code, rr.Body.String())
	}
	tok := extractTokenFromMail(t, capture)
	rr = jsonPOST(t, h, "/v1/auth/verify-email", map[string]any{"token": tok}, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("verify %d %s", rr.Code, rr.Body.String())
	}
	rr = jsonPOST(t, h, "/v1/auth/login", map[string]any{
		"email": email, "password": password, "surface": surface,
	}, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("login %d %s", rr.Code, rr.Body.String())
	}
	c := sessionCookie(rr)
	if c == nil {
		t.Fatal("missing session cookie")
	}
	return c
}

func problemCode(t *testing.T, rr *httptest.ResponseRecorder) string {
	t.Helper()
	var env struct {
		Problem *struct {
			Code string `json:"code"`
		} `json:"problem"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &env); err != nil {
		t.Fatalf("json: %v body %s", err, rr.Body.String())
	}
	if env.Problem == nil {
		t.Fatalf("no problem in body %s", rr.Body.String())
	}
	return env.Problem.Code
}

func TestRBAC_BootstrapAdminHasPermission(t *testing.T) {
	h, authSvc, authzSvc, capture := newRBACStack(t)
	email := fmt.Sprintf("admin-%d@example.com", time.Now().UnixNano())
	cookie := registerVerifyLogin(t, h, capture, email, "password123", "SELLER")

	// Resolve user via session then bootstrap SUPER_ADMIN
	p, _, err := authSvc.ResolveSession(context.Background(), cookie.Value)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := authzSvc.BootstrapAdminByEmail(context.Background(), email); err != nil {
		t.Fatalf("bootstrap: %v", err)
	}

	// Fresh resolve loads permission cache
	p2, _, err := authSvc.ResolveSession(context.Background(), cookie.Value)
	if err != nil {
		t.Fatal(err)
	}
	if !authz.HasPermission(authz.PermissionSet(p2.Permissions), authz.PermAdminPing) {
		t.Fatalf("bootstrap admin missing admin.ping; perms=%v user=%s prior=%v", p2.Permissions, p.UserID, p.Permissions)
	}

	rr := jsonGET(t, h, "/v1/admin/ping", []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("admin ping %d %s", rr.Code, rr.Body.String())
	}
}

func TestRBAC_UserWithoutPermissionForbidden(t *testing.T) {
	h, _, _, capture := newRBACStack(t)
	email := fmt.Sprintf("plain-%d@example.com", time.Now().UnixNano())
	cookie := registerVerifyLogin(t, h, capture, email, "password123", "SELLER")

	rr := jsonGET(t, h, "/v1/admin/ping", []*http.Cookie{cookie})
	if rr.Code != http.StatusForbidden {
		t.Fatalf("want 403 got %d %s", rr.Code, rr.Body.String())
	}
	if code := problemCode(t, rr); code != "FORBIDDEN" {
		t.Fatalf("code=%s", code)
	}
}

func TestRBAC_CrossMerchantStoreAccessDenied(t *testing.T) {
	h, authSvc, authzSvc, capture := newRBACStack(t)
	emailA := fmt.Sprintf("seller-a-%d@example.com", time.Now().UnixNano())
	emailB := fmt.Sprintf("seller-b-%d@example.com", time.Now().UnixNano())
	cookieA := registerVerifyLogin(t, h, capture, emailA, "password123", "SELLER")
	cookieB := registerVerifyLogin(t, h, capture, emailB, "password123", "SELLER")

	pA, _, err := authSvc.ResolveSession(context.Background(), cookieA.Value)
	if err != nil {
		t.Fatal(err)
	}
	pB, _, err := authSvc.ResolveSession(context.Background(), cookieB.Value)
	if err != nil {
		t.Fatal(err)
	}
	_, storeA, err := authzSvc.CreateMerchantWithCanonicalStore(context.Background(), pA.UserID, "A Shop", "shop-a-"+strings.ReplaceAll(pA.UserID, "/", ""), "A")
	if err != nil {
		t.Fatal(err)
	}
	_, storeB, err := authzSvc.CreateMerchantWithCanonicalStore(context.Background(), pB.UserID, "B Shop", "shop-b-"+strings.ReplaceAll(pB.UserID, "/", ""), "B")
	if err != nil {
		t.Fatal(err)
	}

	// A can read own store
	rr := jsonGET(t, h, "/v1/seller/stores/"+storeA.ID, []*http.Cookie{cookieA})
	if rr.Code != http.StatusOK {
		t.Fatalf("own store %d %s", rr.Code, rr.Body.String())
	}
	// A cannot read B's store → 404
	rr = jsonGET(t, h, "/v1/seller/stores/"+storeB.ID, []*http.Cookie{cookieA})
	if rr.Code != http.StatusNotFound {
		t.Fatalf("cross-tenant want 404 got %d %s", rr.Code, rr.Body.String())
	}
	if code := problemCode(t, rr); code != "RESOURCE_NOT_FOUND" {
		t.Fatalf("code=%s", code)
	}
}

func TestRBAC_UnscopedListRejected(t *testing.T) {
	h, _, _, capture := newRBACStack(t)
	email := fmt.Sprintf("noscope-%d@example.com", time.Now().UnixNano())
	cookie := registerVerifyLogin(t, h, capture, email, "password123", "SELLER")

	rr := jsonGET(t, h, "/v1/admin/merchants", []*http.Cookie{cookie})
	if rr.Code != http.StatusForbidden {
		t.Fatalf("want 403 got %d %s", rr.Code, rr.Body.String())
	}
	if code := problemCode(t, rr); code != "FORBIDDEN" {
		t.Fatalf("code=%s", code)
	}
}

func TestRBAC_SellerMeMerchantRequiresMembership(t *testing.T) {
	h, authSvc, authzSvc, capture := newRBACStack(t)
	email := fmt.Sprintf("seller-m-%d@example.com", time.Now().UnixNano())
	cookie := registerVerifyLogin(t, h, capture, email, "password123", "SELLER")

	rr := jsonGET(t, h, "/v1/seller/me/merchant", []*http.Cookie{cookie})
	if rr.Code != http.StatusForbidden {
		t.Fatalf("no membership want 403 got %d %s", rr.Code, rr.Body.String())
	}

	p, _, err := authSvc.ResolveSession(context.Background(), cookie.Value)
	if err != nil {
		t.Fatal(err)
	}
	_, store, err := authzSvc.CreateMerchantWithCanonicalStore(context.Background(), p.UserID, "Mine", "mine-"+p.UserID, "Mine")
	if err != nil {
		t.Fatal(err)
	}
	rr = jsonGET(t, h, "/v1/seller/me/merchant", []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("with membership %d %s", rr.Code, rr.Body.String())
	}
	// INT-150 bootstrap fields
	var env struct {
		Data map[string]any `json:"data"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &env); err != nil {
		t.Fatal(err)
	}
	if env.Data["canonicalStoreId"] != store.ID && env.Data["currentStoreId"] != store.ID {
		// either field may be string
	}
	cur, _ := env.Data["currentStoreId"].(string)
	can, _ := env.Data["canonicalStoreId"].(string)
	if cur == "" || can == "" {
		t.Fatalf("bootstrap missing store ids: %+v", env.Data)
	}
	if cur != store.ID || can != store.ID {
		t.Fatalf("want store %s current=%s canonical=%s", store.ID, cur, can)
	}
	if _, ok := env.Data["memberships"]; !ok {
		t.Fatalf("memberships missing: %+v", env.Data)
	}
}

func TestRBAC_BuyerOwnership404(t *testing.T) {
	h, authSvc, _, capture := newRBACStack(t)
	email := fmt.Sprintf("buyer-%d@example.com", time.Now().UnixNano())
	cookie := registerVerifyLogin(t, h, capture, email, "password123", "BUYER")
	p, _, err := authSvc.ResolveSession(context.Background(), cookie.Value)
	if err != nil {
		t.Fatal(err)
	}
	rr := jsonGET(t, h, "/v1/buyer/resources/"+p.UserID, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("own resource %d %s", rr.Code, rr.Body.String())
	}
	rr = jsonGET(t, h, "/v1/buyer/resources/other-user-id", []*http.Cookie{cookie})
	if rr.Code != http.StatusNotFound {
		t.Fatalf("foreign resource want 404 got %d %s", rr.Code, rr.Body.String())
	}
}

func TestRBAC_SystemRolesSeeded(t *testing.T) {
	_ = databaseURL(t)
	runMigrate(t, "up")
	pool := openPool(t)
	ctx := context.Background()
	var nPerm, nRole int64
	if err := pool.Pool().QueryRow(ctx, `SELECT COUNT(*) FROM permissions`).Scan(&nPerm); err != nil {
		t.Fatal(err)
	}
	if nPerm < 10 {
		t.Fatalf("permissions=%d", nPerm)
	}
	if err := pool.Pool().QueryRow(ctx, `SELECT COUNT(*) FROM roles WHERE is_system = true`).Scan(&nRole); err != nil {
		t.Fatal(err)
	}
	if nRole != 5 {
		t.Fatalf("system roles=%d want 5", nRole)
	}
	var isSystem bool
	if err := pool.Pool().QueryRow(ctx, `SELECT is_system FROM roles WHERE code = 'SUPER_ADMIN'`).Scan(&isSystem); err != nil {
		t.Fatal(err)
	}
	if !isSystem {
		t.Fatal("SUPER_ADMIN must be system")
	}
	_ = auth.SurfaceSeller
}
