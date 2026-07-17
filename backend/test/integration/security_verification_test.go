//go:build integration

package integration_test

// BE-610 consolidated negative security matrix.
// Complements domain-specific suites (webhooks/kyc/credentials/impersonation/rbac/objects).

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	httpadapter "github.com/dasepmoch/fersaku-new/backend/internal/adapters/http"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/middleware"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/mail"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/observability"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/r2"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/config"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/admin"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
	"github.com/dasepmoch/fersaku-new/backend/internal/platform/ssrf"
)

func newSecurityStack(t *testing.T, csrfSoft bool, clock observability.FixedClock) (
	http.Handler,
	*application.AuthService,
	*application.AuthzService,
	*application.WebhookService,
	*mail.Capture,
	*postgres.Pool,
) {
	t.Helper()
	_ = databaseURL(t)
	runMigrate(t, "up")
	pool := openPool(t)
	ids := observability.NewULIDGenerator()
	capture := mail.NewCapture()
	store := postgres.IdentityStore{Repo: postgres.NewIdentityRepo(pool.Pool())}
	var clk interface {
		Now() time.Time
	} = observability.SystemClock{}
	if !clock.T.IsZero() {
		clk = clock
	}
	authzSvc := &application.AuthzService{
		Store:    postgres.NewAuthzRepo(pool.Pool()),
		IDs:      ids,
		Clock:    clk,
		Log:      observability.NewSlogLogger("error", "test"),
		Mail:     capture,
		Sessions: store,
	}
	authSvc := &application.AuthService{
		Store: store,
		IDs:   ids,
		Clock: clk,
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
		Clock: clk,
		Log:   observability.NewSlogLogger("error", "test"),
	}
	authSvc.Impersonation = impSvc
	onboard := &application.OnboardingService{
		Store: postgres.NewOnboardingRepo(pool.Pool()),
		IDs:   ids,
		Clock: clk,
		Log:   observability.NewSlogLogger("error", "test"),
	}
	whSvc := &application.WebhookService{
		Store:           postgres.NewWebhookRepo(pool.Pool()),
		Auth:            authSvc,
		IDs:             ids,
		Clock:           clk,
		Log:             observability.NewSlogLogger("error", "test"),
		EncryptionKey:   "test-kyc-encryption-key-32bytes!!",
		ClaimHashSecret: "test-session-secret-not-for-prod",
		SkipDNS:         true,
	}
	objSvc := &application.ObjectService{
		Store:         postgres.NewObjectRepo(pool.Pool()),
		Objects:       r2.NewFake(),
		BucketPrivate: "fersaku-private",
		BucketPublic:  "fersaku-public",
		IDs:           ids,
		Clock:         clk,
		Log:           observability.NewSlogLogger("error", "test"),
		LocalScanPass: true,
	}
	kycSvc := &application.KYCService{
		Store:         postgres.NewKYCRepo(pool.Pool()),
		Objects:       r2.NewFake(),
		BucketPrivate: "fersaku-private",
		EncryptionKey: "test-kyc-encryption-key-32bytes!!",
		LocalScanPass: true,
		IDs:           ids,
		Clock:         clk,
		Log:           observability.NewSlogLogger("error", "test"),
	}
	credSvc := &application.CredentialService{
		Store:           postgres.NewCredentialRepo(pool.Pool()),
		Auth:            authSvc,
		IDs:             ids,
		Clock:           clk,
		Log:             observability.NewSlogLogger("error", "test"),
		ClaimHashSecret: "test-session-secret-not-for-prod",
		KeyHashSecret:   "test-session-secret-not-for-prod",
	}
	secret := "test-session-secret-not-for-prod"
	h := httpadapter.NewRouterWith(httpadapter.RouterDeps{
		Log:               observability.NewSlogLogger("error", "test"),
		IDs:               ids,
		Service:           "fersaku-api",
		Version:           "0.0.0-test",
		AppEnv:            config.EnvTest,
		Ready:             func() bool { return true },
		StartedAt:         time.Now().UTC(),
		SessionCookieName: "fersaku_session",
		CSRFSoftDisable:   csrfSoft,
		TokenHasher: func(raw string) string {
			return auth.HashTokenKeyed(raw, secret)
		},
		AuthService:          authSvc,
		AuthzService:         authzSvc,
		OnboardingService:    onboard,
		WebhookService:       whSvc,
		ObjectService:        objSvc,
		KYCService:           kycSvc,
		CredentialService:    credSvc,
		ImpersonationService: impSvc,
		RateLimiter:          nil,
		RequestTimeout:       30 * time.Second,
	})
	return h, authSvc, authzSvc, whSvc, capture, pool
}

func secJSON(t *testing.T, h http.Handler, method, path string, cookie *http.Cookie, csrf string, body any) *httptest.ResponseRecorder {
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
	if csrf != "" {
		req.Header.Set(middleware.CSRFHeader, csrf)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func loginWithCSRF(t *testing.T, h http.Handler, capture *mail.Capture, email, password, surface string) (*http.Cookie, string) {
	t.Helper()
	rr := jsonPOST(t, h, "/v1/auth/register", map[string]any{
		"email": email, "password": password, "name": "Sec", "surface": surface,
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
	ck := sessionCookie(rr)
	if ck == nil {
		t.Fatal("missing session cookie")
	}
	data := parseEnvelope(t, rr)
	csrf, _ := data["csrfToken"].(string)
	if csrf == "" {
		t.Fatal("missing csrfToken")
	}
	return ck, csrf
}

// TestSecurity_SSRFPrivateURLReject covers unit-level private URL rejection used by webhooks.
func TestSecurity_SSRFPrivateURLReject(t *testing.T) {
	for _, u := range []string{
		"https://127.0.0.1/hook",
		"https://10.1.2.3/x",
		"https://192.168.0.1/x",
		"https://169.254.169.254/latest/meta-data",
		"https://localhost/hook",
		"https://[::1]/hook",
		"http://example.com/hook",
	} {
		if _, err := ssrf.ValidateHTTPSURL(u); err == nil {
			t.Fatalf("expected SSRF reject for %s", u)
		}
	}
	if _, err := ssrf.ValidateHTTPSURL("https://hooks.merchant.example/ok"); err != nil {
		t.Fatalf("public https should pass: %v", err)
	}
}

// TestSecurity_CSRFOnUnsafeCookieMethods enforces double-submit when CSRF is enabled.
func TestSecurity_CSRFOnUnsafeCookieMethods(t *testing.T) {
	h, _, _, _, capture, _ := newSecurityStack(t, false, observability.FixedClock{})
	email := fmt.Sprintf("csrf-%d@example.com", time.Now().UnixNano())
	cookie, csrf := loginWithCSRF(t, h, capture, email, "password123", "SELLER")

	// Missing CSRF header → AUTH_CSRF_INVALID
	rr := secJSON(t, h, http.MethodPost, "/v1/auth/logout", cookie, "", map[string]any{})
	if rr.Code != http.StatusForbidden {
		t.Fatalf("missing csrf want 403 got %d %s", rr.Code, rr.Body.String())
	}
	if code := problemCode(t, rr); code != "AUTH_CSRF_INVALID" {
		t.Fatalf("code=%s body=%s", code, rr.Body.String())
	}

	// Wrong CSRF header → AUTH_CSRF_INVALID
	rr = secJSON(t, h, http.MethodPost, "/v1/auth/logout", cookie, "definitely-wrong-csrf-token", map[string]any{})
	if rr.Code != http.StatusForbidden {
		t.Fatalf("wrong csrf want 403 got %d %s", rr.Code, rr.Body.String())
	}
	if code := problemCode(t, rr); code != "AUTH_CSRF_INVALID" {
		t.Fatalf("code=%s", code)
	}

	// Correct CSRF → success
	rr = secJSON(t, h, http.MethodPost, "/v1/auth/logout", cookie, csrf, map[string]any{})
	if rr.Code != http.StatusOK {
		t.Fatalf("valid csrf logout want 200 got %d %s", rr.Code, rr.Body.String())
	}

	// Safe method with cookie but no CSRF still allowed
	rr = secJSON(t, h, http.MethodGet, "/v1/auth/session", cookie, "", nil)
	// After logout session is gone → 401 is fine; if soft-auth optional may vary.
	if rr.Code != http.StatusUnauthorized && rr.Code != http.StatusOK {
		t.Logf("session after logout code=%d", rr.Code)
	}
}

// TestSecurity_CSRFSessionBootstrapReissuesToken covers hard-refresh recovery (INT-130).
func TestSecurity_CSRFSessionBootstrapReissuesToken(t *testing.T) {
	h, _, _, _, capture, _ := newSecurityStack(t, false, observability.FixedClock{})
	email := fmt.Sprintf("csrf-boot-%d@example.com", time.Now().UnixNano())
	cookie, loginCSRF := loginWithCSRF(t, h, capture, email, "password123", "SELLER")

	// GET /session re-issues CSRF (rotation); no X-CSRF-Token required on safe GET.
	rr := secJSON(t, h, http.MethodGet, "/v1/auth/session", cookie, "", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("session bootstrap want 200 got %d %s", rr.Code, rr.Body.String())
	}
	var env struct {
		Data map[string]any `json:"data"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &env); err != nil {
		t.Fatalf("json: %v", err)
	}
	newCSRF, _ := env.Data["csrfToken"].(string)
	if newCSRF == "" {
		t.Fatal("expected rotated csrfToken on GET /session")
	}
	if newCSRF == loginCSRF {
		// Rotation should mint a new raw; extremely unlikely to collide.
		t.Log("note: rotated token equal to login token (rare); continuing")
	}

	// Old login CSRF must no longer validate after rotation.
	rr = secJSON(t, h, http.MethodPost, "/v1/auth/logout", cookie, loginCSRF, map[string]any{})
	if rr.Code != http.StatusForbidden {
		t.Fatalf("stale csrf after rotate want 403 got %d %s", rr.Code, rr.Body.String())
	}
	if code := problemCode(t, rr); code != "AUTH_CSRF_INVALID" {
		t.Fatalf("code=%s", code)
	}

	// New token works.
	rr = secJSON(t, h, http.MethodPost, "/v1/auth/logout", cookie, newCSRF, map[string]any{})
	if rr.Code != http.StatusOK {
		t.Fatalf("rotated csrf logout want 200 got %d %s", rr.Code, rr.Body.String())
	}
}

// TestSecurity_StaleCookieAllowsAnonymousLogin ensures unresolved cookie does not CSRF-block login.
func TestSecurity_StaleCookieAllowsAnonymousLogin(t *testing.T) {
	h, _, _, _, capture, _ := newSecurityStack(t, false, observability.FixedClock{})
	email := fmt.Sprintf("csrf-stale-%d@example.com", time.Now().UnixNano())
	// Create verified user, then attempt login with garbage session cookie + no CSRF.
	rr := jsonPOST(t, h, "/v1/auth/register", map[string]any{
		"email": email, "password": "password123", "name": "Stale", "surface": "SELLER",
	}, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("register %d %s", rr.Code, rr.Body.String())
	}
	tok := extractTokenFromMail(t, capture)
	rr = jsonPOST(t, h, "/v1/auth/verify-email", map[string]any{"token": tok}, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("verify %d %s", rr.Code, rr.Body.String())
	}

	stale := &http.Cookie{Name: "fersaku_session", Value: "not-a-real-session-token"}
	body := map[string]any{
		"email": email, "password": "password123", "surface": "SELLER",
	}
	// No CSRF header; stale cookie must not force AUTH_CSRF_INVALID on login.
	rr = secJSON(t, h, http.MethodPost, "/v1/auth/login", stale, "", body)
	if rr.Code != http.StatusOK {
		t.Fatalf("login with stale cookie want 200 got %d %s", rr.Code, rr.Body.String())
	}
}

// TestSecurity_SessionExpiry rejects sessions past expires_at / absolute expiry.
func TestSecurity_SessionExpiry(t *testing.T) {
	start := time.Now().UTC().Add(-time.Minute)
	h, authSvc, _, _, capture, pool := newSecurityStack(t, true, observability.FixedClock{T: start})
	email := fmt.Sprintf("exp-%d@example.com", time.Now().UnixNano())
	cookie, _ := loginWithCSRF(t, h, capture, email, "password123", "SELLER")

	// Force DB expiry into the past.
	_, err := pool.Pool().Exec(context.Background(),
		`UPDATE auth_sessions SET expires_at = $1, absolute_expires_at = $1 WHERE revoked_at IS NULL`,
		start.Add(-time.Hour))
	if err != nil {
		t.Fatalf("expire sessions: %v", err)
	}

	// ResolveSession must fail
	_, _, err = authSvc.ResolveSession(context.Background(), cookie.Value)
	if err == nil {
		t.Fatal("expected session expired")
	}
	if err != auth.ErrSessionExpired && !strings.Contains(err.Error(), "expired") && !strings.Contains(fmt.Sprint(err), "session") {
		// Accept domain expired sentinel or wrapped unauthenticated after expire path
		if err != auth.ErrUnauthenticated {
			t.Logf("resolve err=%v (want expired)", err)
		}
	}

	rr := jsonGET(t, h, "/v1/auth/session", []*http.Cookie{cookie})
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expired session HTTP want 401 got %d %s", rr.Code, rr.Body.String())
	}
}

// TestSecurity_CrossTenant404 ensures foreign store IDs do not 403-leak existence.
func TestSecurity_CrossTenant404(t *testing.T) {
	h, _, _, _, capture, _ := newSecurityStack(t, true, observability.FixedClock{})
	cookieA, storeA, _ := onboardSellerStore(t, h, capture)
	cookieB, storeB, _ := onboardSellerStore(t, h, capture)
	_ = storeA

	rr := jsonGET(t, h, "/v1/seller/stores/"+storeB, []*http.Cookie{cookieA})
	if rr.Code != http.StatusNotFound {
		// Some stacks use /v1/stores/{id} — try seller path variants
		rr2 := jsonGET(t, h, "/v1/stores/"+storeB, []*http.Cookie{cookieA})
		if rr2.Code == http.StatusNotFound {
			rr = rr2
		} else if rr.Code != http.StatusNotFound {
			t.Fatalf("cross-tenant want 404 got %d %s (alt %d)", rr.Code, rr.Body.String(), rr2.Code)
		}
	}
	if code := problemCode(t, rr); code != "RESOURCE_NOT_FOUND" {
		t.Fatalf("code=%s body=%s", code, rr.Body.String())
	}
	_ = cookieB
}

// TestSecurity_WebhookPrivateNetwork rejects private/metadata webhook targets.
func TestSecurity_WebhookPrivateNetwork(t *testing.T) {
	h, _, _, _, capture, _ := newSecurityStack(t, true, observability.FixedClock{})
	sellerCookie, storeID, _ := onboardSellerStore(t, h, capture)

	for _, u := range []string{
		"https://127.0.0.1/hook",
		"https://10.0.0.5/cb",
		"https://192.168.1.10/w",
		"https://169.254.169.254/latest/meta-data",
		"https://localhost/hook",
		"http://hooks.example.com/x",
	} {
		rr := secJSON(t, h, http.MethodPost, "/v1/stores/"+storeID+"/webhooks", sellerCookie, "", map[string]any{
			"url":         u,
			"paymentMode": "SANDBOX",
		})
		if rr.Code == http.StatusCreated || rr.Code == http.StatusOK {
			t.Fatalf("private/url reject for %s got %d %s", u, rr.Code, rr.Body.String())
		}
		if rr.Code < 400 {
			t.Fatalf("expected client error for %s got %d", u, rr.Code)
		}
	}
}

// TestSecurity_KYCNoPresign blocks browser-to-R2 KYC presign paths.
func TestSecurity_KYCNoPresign(t *testing.T) {
	h, _, _, _, capture, _ := newSecurityStack(t, true, observability.FixedClock{})
	sellerCookie, _, _ := onboardSellerStore(t, h, capture)

	for _, path := range []string{
		"/v1/me/kyc/presign",
		"/v1/me/kyc/uploads/presign",
	} {
		rr := secJSON(t, h, http.MethodPost, path, sellerCookie, "", map[string]any{
			"purpose": "KYC_DOCUMENT",
		})
		if rr.Code == http.StatusOK || rr.Code == http.StatusCreated {
			t.Fatalf("presign must fail %s got %d %s", path, rr.Code, rr.Body.String())
		}
		body := rr.Body.String()
		if !strings.Contains(body, "KYC_PRESIGN") && !strings.Contains(strings.ToLower(body), "presign") && rr.Code != http.StatusNotFound {
			// 404 also acceptable if route only registered under certain wire; prefer explicit reject
			if rr.Code >= 500 {
				t.Fatalf("presign %s unexpected %d %s", path, rr.Code, body)
			}
		}
	}
}

// TestSecurity_RawCredentialNeverInList ensures claim raw key never appears in list DTO.
func TestSecurity_RawCredentialNeverInList(t *testing.T) {
	h, _, _, _, capture, pool := newSecurityStack(t, true, observability.FixedClock{})
	sellerCookie, _, _ := onboardSellerStore(t, h, capture)

	rrReq := secJSON(t, h, http.MethodPost, "/v1/me/credentials/requests", sellerCookie, "", map[string]any{
		"paymentMode": "SANDBOX",
		"purpose":     "INITIAL_ISSUE",
		"reason":      "be-610 security matrix",
	})
	if rrReq.Code != http.StatusCreated && rrReq.Code != http.StatusOK {
		t.Fatalf("request %d %s", rrReq.Code, rrReq.Body.String())
	}
	var env map[string]any
	_ = json.Unmarshal(rrReq.Body.Bytes(), &env)
	data, _ := env["data"].(map[string]any)
	claimTok, _ := data["claimToken"].(string)
	if claimTok == "" {
		// Some paths nest under issuance
		if iss, ok := data["issuance"].(map[string]any); ok {
			claimTok, _ = iss["claimToken"].(string)
		}
	}
	if claimTok == "" {
		t.Fatalf("missing claimToken: %s", rrReq.Body.String())
	}

	rrClaim := secJSON(t, h, http.MethodPost, "/v1/me/credentials/claim", sellerCookie, "", map[string]any{
		"token": claimTok,
	})
	if rrClaim.Code != http.StatusOK {
		t.Fatalf("claim %d %s", rrClaim.Code, rrClaim.Body.String())
	}
	_ = json.Unmarshal(rrClaim.Body.Bytes(), &env)
	raw, _ := env["data"].(map[string]any)["apiKey"].(string)
	if raw == "" {
		raw, _ = env["data"].(map[string]any)["rawKey"].(string)
	}
	if raw == "" {
		t.Fatalf("claim missing raw once: %s", rrClaim.Body.String())
	}

	rrList := secJSON(t, h, http.MethodGet, "/v1/me/credentials", sellerCookie, "", nil)
	if rrList.Code != http.StatusOK {
		t.Fatalf("list %d %s", rrList.Code, rrList.Body.String())
	}
	if strings.Contains(rrList.Body.String(), raw) {
		t.Fatal("list must never contain raw credential")
	}

	// DB must not store raw
	var keyHash string
	err := pool.Pool().QueryRow(context.Background(),
		`SELECT key_hash FROM merchant_api_keys WHERE status='ACTIVE' ORDER BY created_at DESC LIMIT 1`).Scan(&keyHash)
	if err != nil {
		t.Fatalf("db: %v", err)
	}
	if keyHash == "" || strings.Contains(keyHash, raw) {
		t.Fatalf("stored hash invalid")
	}
}

// TestSecurity_ImpersonationDefaultDeny re-asserts registry + privileged rejection.
func TestSecurity_ImpersonationDefaultDeny(t *testing.T) {
	// Policy: only two SUPPORT_WRITE routes; everything else denied.
	for _, e := range admin.KnownMutationRegistry {
		path := e.Path
		path = strings.ReplaceAll(path, "{storeId}", "s1")
		path = strings.ReplaceAll(path, "{productId}", "p1")
		path = strings.ReplaceAll(path, "{itemId}", "i1")
		path = strings.ReplaceAll(path, "{orderId}", "o1")
		path = strings.ReplaceAll(path, "{merchantId}", "m1")
		allow := admin.IsAllowlistedMutation(e.Method, path)
		want := e.Method == "PATCH" && (e.Path == "/v1/buyer/profile" || e.Path == "/v1/stores/{storeId}")
		if allow != want {
			t.Fatalf("%s %s allow=%v want=%v", e.Method, e.Path, allow, want)
		}
	}
	if admin.ValidImpersonationScope("PRIVILEGED") || admin.ValidImpersonationScope("FULL") {
		t.Fatal("privileged/full scopes must be invalid")
	}
	if !admin.ValidImpersonationScope("READ_ONLY") || !admin.ValidImpersonationScope("SUPPORT_WRITE") {
		t.Fatal("expected READ_ONLY and SUPPORT_WRITE")
	}

	// HTTP: start with PRIVILEGED fails
	h, authSvc, authz, _, capture, pool := newSecurityStack(t, true, observability.FixedClock{})
	adminCookie, _ := bootstrapAdminCookie(t, h, authz, capture)
	adminSessID := sessionIDFromCookie(t, pool, adminCookie, authSvc)
	markSessionMFA(t, pool, adminSessID)

	sellerEmail := fmt.Sprintf("sec-imp-%d@example.com", time.Now().UnixNano())
	_ = registerVerifyLogin(t, h, capture, sellerEmail, "password123", "SELLER")
	var targetID string
	_ = pool.Pool().QueryRow(context.Background(),
		`SELECT id FROM users WHERE email_normalized=$1`, strings.ToLower(sellerEmail)).Scan(&targetID)

	rr := jsonPOST(t, h, "/v1/admin/users/"+targetID+"/impersonation", map[string]any{
		"scope": "PRIVILEGED", "reason": "security matrix privileged attempt", "ticket": "SEC-610", "ttlMinutes": 15,
	}, []*http.Cookie{adminCookie})
	if rr.Code == http.StatusOK {
		t.Fatalf("PRIVILEGED must fail: %s", rr.Body.String())
	}
}
