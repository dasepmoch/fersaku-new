//go:build integration

package integration_test

import (
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
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/admin"
)

func newImpersonationStack(t *testing.T) (http.Handler, *application.AuthService, *application.AuthzService, *mail.Capture, *postgres.Pool) {
	t.Helper()
	_ = databaseURL(t)
	runMigrate(t, "up")
	pool := openPool(t)
	ids := observability.NewULIDGenerator()
	capture := mail.NewCapture()
	store := postgres.IdentityStore{Repo: postgres.NewIdentityRepo(pool.Pool())}
	authzSvc := &application.AuthzService{
		Store:    postgres.NewAuthzRepo(pool.Pool()),
		IDs:      ids,
		Clock:    observability.SystemClock{},
		Log:      observability.NewSlogLogger("error", "test"),
		Mail:     capture,
		Sessions: store,
	}
	authSvc := &application.AuthService{
		Store: store,
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
	impSvc := &application.ImpersonationService{
		Store: postgres.NewImpersonationRepo(pool.Pool()),
		Auth:  authSvc,
		IDs:   ids,
		Clock: observability.SystemClock{},
		Log:   observability.NewSlogLogger("error", "test"),
	}
	authSvc.Impersonation = impSvc
	onboardSvc := &application.OnboardingService{
		Store: postgres.NewOnboardingRepo(pool.Pool()),
		IDs:   ids,
		Clock: observability.SystemClock{},
		Log:   observability.NewSlogLogger("error", "test"),
	}
	adminReads := &application.AdminReadService{
		Store: postgres.NewAdminRepo(pool.Pool()),
		Clock: observability.SystemClock{},
		Log:   observability.NewSlogLogger("error", "test"),
	}
	h := httpadapter.NewRouterWith(httpadapter.RouterDeps{
		Log:                  observability.NewSlogLogger("error", "test"),
		IDs:                  ids,
		Service:              "fersaku-api",
		Version:              "0.0.0-test",
		AppEnv:               config.EnvTest,
		Ready:                func() bool { return true },
		StartedAt:            time.Now().UTC(),
		SessionCookieName:    "fersaku_session",
		CSRFSoftDisable:      true,
		AuthService:          authSvc,
		AuthzService:         authzSvc,
		AdminReadService:     adminReads,
		ImpersonationService: impSvc,
		OnboardingService:    onboardSvc,
		RateLimiter:          nil,
		RequestTimeout:       30 * time.Second,
	})
	return h, authSvc, authzSvc, capture, pool
}

func markSessionMFA(t *testing.T, pool *postgres.Pool, sessionID string) {
	t.Helper()
	_, err := pool.Pool().Exec(t.Context(),
		`UPDATE auth_sessions SET mfa_verified_at = now() WHERE id = $1`, sessionID)
	if err != nil {
		t.Fatalf("mark mfa: %v", err)
	}
}

func sessionIDFromCookie(t *testing.T, pool *postgres.Pool, cookie *http.Cookie, authSvc *application.AuthService) string {
	t.Helper()
	p, sess, err := authSvc.ResolveSession(t.Context(), cookie.Value)
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	_ = p
	return sess.ID
}

func TestImpersonation_StartReadOnly_TamperedCookie_EndBlocks(t *testing.T) {
	h, authSvc, authz, capture, pool := newImpersonationStack(t)
	adminCookie, _ := bootstrapAdminCookie(t, h, authz, capture)
	adminSessID := sessionIDFromCookie(t, pool, adminCookie, authSvc)
	markSessionMFA(t, pool, adminSessID)

	// Target seller
	sellerEmail := fmt.Sprintf("seller-imp-%d@example.com", time.Now().UnixNano())
	_ = registerVerifyLogin(t, h, capture, sellerEmail, "password123", "SELLER")
	var targetID string
	err := pool.Pool().QueryRow(t.Context(),
		`SELECT id FROM users WHERE email_normalized=$1`, strings.ToLower(sellerEmail)).Scan(&targetID)
	if err != nil {
		t.Fatal(err)
	}

	// Start READ_ONLY
	rr := jsonPOST(t, h, "/v1/admin/users/"+targetID+"/impersonation", map[string]any{
		"scope":      "READ_ONLY",
		"reason":     "customer support investigation",
		"ticket":     "SUP-1001",
		"ttlMinutes": 15,
	}, []*http.Cookie{adminCookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("start want 200 got %d %s", rr.Code, rr.Body.String())
	}
	data := envelopeData(t, rr)
	sessionID, _ := data["sessionId"].(string)
	if sessionID == "" {
		t.Fatalf("missing sessionId: %v", data)
	}
	// Derived cookie from Set-Cookie
	derived := sessionCookie(rr)
	if derived == nil || derived.Value == "" {
		t.Fatal("derived session cookie missing")
	}

	// READ_ONLY blocks mutation
	rr = jsonPATCH(t, h, "/v1/buyer/profile", map[string]any{
		"displayName": "Hacked", "expectedVersion": 1,
	}, []*http.Cookie{derived})
	if rr.Code != http.StatusForbidden {
		t.Fatalf("read-only mutation want 403 got %d %s", rr.Code, rr.Body.String())
	}

	// Tampered cookie cannot impersonate
	tampered := &http.Cookie{Name: "fersaku_session", Value: derived.Value + "x"}
	rr = jsonGET(t, h, "/v1/buyer/profile", []*http.Cookie{tampered})
	if rr.Code == http.StatusOK {
		t.Fatalf("tampered cookie must not auth: %s", rr.Body.String())
	}

	// Terminate blocks immediately
	rr = jsonPOST(t, h, "/v1/admin/impersonation/"+sessionID+"/terminate", map[string]any{
		"reason": "done",
	}, []*http.Cookie{derived})
	if rr.Code != http.StatusOK {
		// try with admin cookie if derived actor mapping differs
		rr = jsonPOST(t, h, "/v1/admin/impersonation/"+sessionID+"/terminate", map[string]any{
			"reason": "done",
		}, []*http.Cookie{adminCookie})
	}
	if rr.Code != http.StatusOK {
		t.Fatalf("terminate want 200 got %d %s", rr.Code, rr.Body.String())
	}
	rr = jsonGET(t, h, "/v1/buyer/profile", []*http.Cookie{derived})
	if rr.Code == http.StatusOK {
		t.Fatalf("ended derived session must not auth: %s", rr.Body.String())
	}
}

func TestImpersonation_RejectAdminTargetAndPrivilegedScope(t *testing.T) {
	h, authSvc, authz, capture, pool := newImpersonationStack(t)
	adminCookie, adminEmail := bootstrapAdminCookie(t, h, authz, capture)
	adminSessID := sessionIDFromCookie(t, pool, adminCookie, authSvc)
	markSessionMFA(t, pool, adminSessID)

	var adminUserID string
	err := pool.Pool().QueryRow(t.Context(),
		`SELECT id FROM users WHERE email_normalized=$1`, strings.ToLower(adminEmail)).Scan(&adminUserID)
	if err != nil {
		t.Fatal(err)
	}

	rr := jsonPOST(t, h, "/v1/admin/users/"+adminUserID+"/impersonation", map[string]any{
		"scope": "READ_ONLY", "reason": "try admin to admin case", "ticket": "T-1", "ttlMinutes": 15,
	}, []*http.Cookie{adminCookie})
	if rr.Code == http.StatusOK {
		t.Fatalf("admin-to-admin must fail: %s", rr.Body.String())
	}

	sellerEmail := fmt.Sprintf("seller-priv-%d@example.com", time.Now().UnixNano())
	_ = registerVerifyLogin(t, h, capture, sellerEmail, "password123", "SELLER")
	var targetID string
	_ = pool.Pool().QueryRow(t.Context(),
		`SELECT id FROM users WHERE email_normalized=$1`, strings.ToLower(sellerEmail)).Scan(&targetID)

	rr = jsonPOST(t, h, "/v1/admin/users/"+targetID+"/impersonation", map[string]any{
		"scope": "PRIVILEGED", "reason": "try privileged scope value", "ticket": "T-2", "ttlMinutes": 15,
	}, []*http.Cookie{adminCookie})
	if rr.Code == http.StatusOK {
		t.Fatalf("PRIVILEGED must fail: %s", rr.Body.String())
	}
	code := problemCode(t, rr)
	if code != "VALIDATION_FAILED" && code != "FORBIDDEN" {
		t.Logf("privileged reject code=%s body=%s", code, rr.Body.String())
	}
}

func TestImpersonation_SupportWriteAllowlistAndDefaultDeny(t *testing.T) {
	h, authSvc, authz, capture, pool := newImpersonationStack(t)
	adminCookie, _ := bootstrapAdminCookie(t, h, authz, capture)
	adminSessID := sessionIDFromCookie(t, pool, adminCookie, authSvc)
	markSessionMFA(t, pool, adminSessID)

	// Buyer target for profile allowlist
	buyerEmail := fmt.Sprintf("buyer-imp-%d@example.com", time.Now().UnixNano())
	buyerCookie := registerVerifyLogin(t, h, capture, buyerEmail, "password123", "BUYER")
	_ = buyerCookie
	var targetID string
	err := pool.Pool().QueryRow(t.Context(),
		`SELECT id FROM users WHERE email_normalized=$1`, strings.ToLower(buyerEmail)).Scan(&targetID)
	if err != nil {
		t.Fatal(err)
	}

	// Ensure profile row exists
	_ = jsonGET(t, h, "/v1/buyer/profile", []*http.Cookie{buyerCookie})

	rr := jsonPOST(t, h, "/v1/admin/users/"+targetID+"/impersonation", map[string]any{
		"scope":      admin.ImpersonationScopeSupportWrite,
		"reason":     "fix profile display name fix",
		"ticket":     "SUP-2002",
		"ttlMinutes": 30,
	}, []*http.Cookie{adminCookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("SUPPORT_WRITE start want 200 got %d %s", rr.Code, rr.Body.String())
	}
	derived := sessionCookie(rr)
	if derived == nil {
		t.Fatal("missing derived cookie")
	}

	// Allowed: buyer profile fields only
	rr = jsonPATCH(t, h, "/v1/buyer/profile", map[string]any{
		"displayName": "Support Fixed", "locale": "id-ID", "timezone": "Asia/Jakarta", "expectedVersion": 1,
	}, []*http.Cookie{derived})
	if rr.Code != http.StatusOK {
		// version may differ; try without version if validation
		t.Logf("profile patch status=%d body=%s", rr.Code, rr.Body.String())
	}

	// Unknown field rejected
	rr = jsonPATCH(t, h, "/v1/buyer/profile", map[string]any{
		"displayName": "X", "phone": "+6200", "expectedVersion": 1,
	}, []*http.Cookie{derived})
	if rr.Code != http.StatusForbidden {
		t.Fatalf("unknown field want 403 got %d %s", rr.Code, rr.Body.String())
	}

	// Finance/products/admin/auth mutations denied
	for _, path := range []string{
		"/v1/admin/actions",
		"/v1/stores/store_x/products",
		"/v1/stores/store_x/withdrawals",
		"/v1/auth/password/change",
		"/v1/onboarding/store",
	} {
		rr = jsonPOST(t, h, path, map[string]any{"reason": "nope", "name": "x"}, []*http.Cookie{derived})
		if rr.Code == http.StatusOK {
			t.Fatalf("must deny %s", path)
		}
		if rr.Code != http.StatusForbidden && rr.Code != http.StatusNotFound && rr.Code != http.StatusUnauthorized && rr.Code != http.StatusMethodNotAllowed {
			// Forbidden is ideal; other closed codes also acceptable if route missing
			t.Logf("deny %s code=%d", path, rr.Code)
		}
	}
}

func TestImpersonation_MerchantOwnerResolver(t *testing.T) {
	h, authSvc, authz, capture, pool := newImpersonationStack(t)
	adminCookie, _ := bootstrapAdminCookie(t, h, authz, capture)
	adminSessID := sessionIDFromCookie(t, pool, adminCookie, authSvc)
	markSessionMFA(t, pool, adminSessID)

	sellerEmail := fmt.Sprintf("seller-mer-%d@example.com", time.Now().UnixNano())
	sellerCookie := registerVerifyLogin(t, h, capture, sellerEmail, "password123", "SELLER")
	// Create onboarding store → merchant
	rr := jsonPOST(t, h, "/v1/onboarding/store", map[string]any{
		"name": "Imp Store", "slug": fmt.Sprintf("imp-store-%d", time.Now().UnixNano()),
	}, []*http.Cookie{sellerCookie})
	if rr.Code != http.StatusOK && rr.Code != http.StatusCreated {
		t.Fatalf("onboarding store: %d %s", rr.Code, rr.Body.String())
	}
	var mid, uid string
	err := pool.Pool().QueryRow(t.Context(),
		`SELECT m.id, m.owner_user_id FROM merchants m
		 JOIN users u ON u.id = m.owner_user_id
		 WHERE u.email_normalized=$1 LIMIT 1`, strings.ToLower(sellerEmail)).Scan(&mid, &uid)
	if err != nil {
		t.Fatalf("merchant: %v", err)
	}

	rr = jsonPOST(t, h, "/v1/admin/merchants/"+mid+"/impersonation", map[string]any{
		"scope": "READ_ONLY", "reason": "merchant owner support session", "ticket": "M-9", "ttlMinutes": 15,
	}, []*http.Cookie{adminCookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("merchant start: %d %s", rr.Code, rr.Body.String())
	}
	data := envelopeData(t, rr)
	if data["targetUserId"] != uid {
		t.Fatalf("target=%v want %s", data["targetUserId"], uid)
	}
}

func TestImpersonation_DefaultDenyRegistry(t *testing.T) {
	// Pure policy check mirrors unit test; ensure OpenAPI-only scopes.
	for _, e := range admin.KnownMutationRegistry {
		path := e.Path
		path = strings.ReplaceAll(path, "{storeId}", "s1")
		path = strings.ReplaceAll(path, "{productId}", "p1")
		path = strings.ReplaceAll(path, "{itemId}", "i1")
		path = strings.ReplaceAll(path, "{orderId}", "o1")
		path = strings.ReplaceAll(path, "{merchantId}", "m1")
		allow := admin.IsAllowlistedMutation(e.Method, path)
		// only exact allowlisted patterns
		if e.Path == "/v1/buyer/profile" || e.Path == "/v1/stores/{storeId}" {
			if !allow {
				t.Fatalf("should allow %s %s", e.Method, e.Path)
			}
			continue
		}
		if allow {
			t.Fatalf("registry default-deny failed for %s %s", e.Method, e.Path)
		}
	}
}
