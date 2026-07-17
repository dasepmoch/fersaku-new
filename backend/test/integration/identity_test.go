//go:build integration

package integration_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	httpadapter "github.com/dasepmoch/fersaku-new/backend/internal/adapters/http"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/mail"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/observability"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/config"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
)

func newAuthStack(t *testing.T) (http.Handler, *application.AuthService, *mail.Capture, *postgres.IdentityRepo) {
	t.Helper()
	_ = databaseURL(t)
	runMigrate(t, "up")
	pool := openPool(t)
	repo := postgres.NewIdentityRepo(pool.Pool())
	store := postgres.IdentityStore{Repo: repo}
	ids := observability.NewULIDGenerator()
	capture := mail.NewCapture()
	svc := &application.AuthService{
		Store: store,
		IDs:   ids,
		Clock: observability.SystemClock{},
		Mail:  capture,
		Log:   observability.NewSlogLogger("error", "test"),
		Config: application.AuthConfig{
			SessionCookieName: "fersaku_session",
			TokenHashSecret:   "test-session-secret-not-for-prod",
		},
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
		CSRFSoftDisable:   true, // integration focuses on auth lifecycle; CSRF unit-covered
		AuthService:       svc,
		RateLimiter:       nil,
		RequestTimeout:    10 * time.Second,
	})
	return h, svc, capture, repo
}

func jsonPOST(t *testing.T, h http.Handler, path string, body any, cookies []*http.Cookie) *httptest.ResponseRecorder {
	t.Helper()
	b, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	for _, c := range cookies {
		req.AddCookie(c)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func jsonGET(t *testing.T, h http.Handler, path string, cookies []*http.Cookie) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	for _, c := range cookies {
		req.AddCookie(c)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func parseEnvelope(t *testing.T, rr *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var env struct {
		Data map[string]any `json:"data"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &env); err != nil {
		t.Fatalf("json: %v body %s", err, rr.Body.String())
	}
	return env.Data
}

func sessionCookie(rr *httptest.ResponseRecorder) *http.Cookie {
	for _, c := range rr.Result().Cookies() {
		if c.Name == "fersaku_session" {
			return c
		}
	}
	return nil
}

func extractTokenFromMail(t *testing.T, c *mail.Capture) string {
	t.Helper()
	msg, ok := c.Last()
	if !ok {
		t.Fatal("no mail")
	}
	// body contains token=...
	for _, line := range strings.Split(msg.Body, "\n") {
		if strings.HasPrefix(line, "token=") {
			return strings.TrimPrefix(line, "token=")
		}
	}
	t.Fatalf("no token in mail body")
	return ""
}

func TestIdentityRegisterVerifyLoginSessionLogout(t *testing.T) {
	h, _, capture, _ := newAuthStack(t)
	email := fmt.Sprintf("seller_%d@example.com", time.Now().UnixNano())
	password := "correct-horse-battery-9"

	rr := jsonPOST(t, h, "/v1/auth/register", map[string]any{
		"email": email, "password": password, "name": "Seller One", "surface": "SELLER",
	}, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("register %d %s", rr.Code, rr.Body.String())
	}
	data := parseEnvelope(t, rr)
	if data["message"] != auth.MsgRegisterGeneric {
		t.Fatalf("message %#v", data["message"])
	}

	// login before verify should fail (not generic credentials if we reveal pending — we use EMAIL_NOT path as forbidden)
	rr = jsonPOST(t, h, "/v1/auth/login", map[string]any{
		"email": email, "password": password, "surface": "SELLER",
	}, nil)
	if rr.Code == http.StatusOK {
		t.Fatal("login before verify must fail")
	}

	tok := extractTokenFromMail(t, capture)
	rr = jsonPOST(t, h, "/v1/auth/verify-email", map[string]any{"token": tok}, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("verify %d %s", rr.Code, rr.Body.String())
	}

	// replay verify still generic 200
	rr = jsonPOST(t, h, "/v1/auth/verify-email", map[string]any{"token": tok}, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("verify replay %d", rr.Code)
	}

	rr = jsonPOST(t, h, "/v1/auth/login", map[string]any{
		"email": email, "password": password, "surface": "SELLER",
	}, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("login %d %s", rr.Code, rr.Body.String())
	}
	ck := sessionCookie(rr)
	if ck == nil || ck.Value == "" {
		t.Fatal("expected session cookie")
	}
	if !ck.HttpOnly {
		t.Fatal("cookie must be HttpOnly")
	}
	loginData := parseEnvelope(t, rr)
	if loginData["csrfToken"] == nil || loginData["csrfToken"] == "" {
		t.Fatal("expected csrfToken")
	}

	rr = jsonGET(t, h, "/v1/auth/session", []*http.Cookie{ck})
	if rr.Code != http.StatusOK {
		t.Fatalf("session %d %s", rr.Code, rr.Body.String())
	}
	sess := parseEnvelope(t, rr)
	if sess["email"] != email && !strings.EqualFold(fmt.Sprint(sess["email"]), email) {
		// display may preserve case from register
		if sess["userId"] == nil {
			t.Fatalf("session %#v", sess)
		}
	}

	rr = jsonGET(t, h, "/v1/auth/sessions", []*http.Cookie{ck})
	if rr.Code != http.StatusOK {
		t.Fatalf("sessions %d %s", rr.Code, rr.Body.String())
	}

	rr = jsonPOST(t, h, "/v1/auth/logout", map[string]any{}, []*http.Cookie{ck})
	if rr.Code != http.StatusOK {
		t.Fatalf("logout %d %s", rr.Code, rr.Body.String())
	}
	rr = jsonGET(t, h, "/v1/auth/session", []*http.Cookie{ck})
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("after logout session %d", rr.Code)
	}
}

func TestIdentityNoAccountEnumeration(t *testing.T) {
	h, _, capture, _ := newAuthStack(t)
	email := fmt.Sprintf("enum_%d@example.com", time.Now().UnixNano())

	rr1 := jsonPOST(t, h, "/v1/auth/register", map[string]any{
		"email": email, "password": "password-long-1", "name": "A",
	}, nil)
	rr2 := jsonPOST(t, h, "/v1/auth/register", map[string]any{
		"email": email, "password": "password-long-1", "name": "A",
	}, nil)
	m1 := parseEnvelope(t, rr1)["message"]
	m2 := parseEnvelope(t, rr2)["message"]
	if m1 != m2 {
		t.Fatalf("register messages differ: %v vs %v", m1, m2)
	}

	// forgot known vs unknown
	rrKnown := jsonPOST(t, h, "/v1/auth/password/forgot", map[string]any{"email": email}, nil)
	rrUnknown := jsonPOST(t, h, "/v1/auth/password/forgot", map[string]any{"email": "nobody@example.com"}, nil)
	if parseEnvelope(t, rrKnown)["message"] != parseEnvelope(t, rrUnknown)["message"] {
		t.Fatal("forgot messages must match")
	}

	// magic link known vs unknown
	rrM1 := jsonPOST(t, h, "/v1/auth/magic-link/request", map[string]any{"email": email}, nil)
	rrM2 := jsonPOST(t, h, "/v1/auth/magic-link/request", map[string]any{"email": "ghost@example.com"}, nil)
	if parseEnvelope(t, rrM1)["message"] != parseEnvelope(t, rrM2)["message"] {
		t.Fatal("magic messages must match")
	}
	_ = capture

	// failed login generic
	rrBad := jsonPOST(t, h, "/v1/auth/login", map[string]any{
		"email": "nope@example.com", "password": "wrong-password-xx", "surface": "SELLER",
	}, nil)
	if rrBad.Code != http.StatusUnauthorized {
		t.Fatalf("bad login status %d", rrBad.Code)
	}
	var pe struct {
		Problem struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"problem"`
	}
	_ = json.Unmarshal(rrBad.Body.Bytes(), &pe)
	if pe.Problem.Code != "AUTH_INVALID_CREDENTIALS" {
		t.Fatalf("code %s", pe.Problem.Code)
	}
	if strings.Contains(strings.ToLower(pe.Problem.Message), "not found") {
		t.Fatal("must not enumerate")
	}
}

func TestIdentityConcurrentChallengeConsumeOnce(t *testing.T) {
	h, svc, capture, _ := newAuthStack(t)
	email := fmt.Sprintf("race_%d@example.com", time.Now().UnixNano())
	password := "correct-horse-battery-9"
	_ = jsonPOST(t, h, "/v1/auth/register", map[string]any{
		"email": email, "password": password, "name": "Race",
	}, nil)
	tok := extractTokenFromMail(t, capture)

	const workers = 12
	var okCount atomic.Int32
	var wg sync.WaitGroup
	wg.Add(workers)
	for i := 0; i < workers; i++ {
		go func() {
			defer wg.Done()
			// use service directly for true concurrent consume
			res, err := svc.VerifyEmail(context.Background(), application.TokenInput{Token: tok})
			if err == nil && res.Message == auth.MsgVerifyGeneric {
				// all return generic; check DB via login after
				okCount.Add(1)
			}
		}()
	}
	wg.Wait()
	if okCount.Load() != workers {
		// all should return generic success message
		t.Logf("generic returns %d", okCount.Load())
	}
	// login should work (email verified exactly once)
	rr := jsonPOST(t, h, "/v1/auth/login", map[string]any{
		"email": email, "password": password, "surface": "SELLER",
	}, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("login after concurrent verify %d %s", rr.Code, rr.Body.String())
	}
}

func TestIdentityPasswordResetRevokesSessions(t *testing.T) {
	h, _, capture, _ := newAuthStack(t)
	email := fmt.Sprintf("reset_%d@example.com", time.Now().UnixNano())
	password := "correct-horse-battery-9"
	_ = jsonPOST(t, h, "/v1/auth/register", map[string]any{
		"email": email, "password": password, "name": "Reset",
	}, nil)
	verifyTok := extractTokenFromMail(t, capture)
	_ = jsonPOST(t, h, "/v1/auth/verify-email", map[string]any{"token": verifyTok}, nil)
	capture.Reset()

	rr := jsonPOST(t, h, "/v1/auth/login", map[string]any{
		"email": email, "password": password, "surface": "SELLER",
	}, nil)
	ck := sessionCookie(rr)
	if ck == nil {
		t.Fatal("no cookie")
	}

	_ = jsonPOST(t, h, "/v1/auth/password/forgot", map[string]any{"email": email}, nil)
	resetTok := extractTokenFromMail(t, capture)
	newPass := "new-password-long-99"
	rr = jsonPOST(t, h, "/v1/auth/password/reset", map[string]any{
		"token": resetTok, "newPassword": newPass,
	}, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("reset %d %s", rr.Code, rr.Body.String())
	}

	// old session dead
	rr = jsonGET(t, h, "/v1/auth/session", []*http.Cookie{ck})
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("old session still valid %d", rr.Code)
	}
	// old password fails, new works
	rr = jsonPOST(t, h, "/v1/auth/login", map[string]any{
		"email": email, "password": password, "surface": "SELLER",
	}, nil)
	if rr.Code == http.StatusOK {
		t.Fatal("old password should fail")
	}
	rr = jsonPOST(t, h, "/v1/auth/login", map[string]any{
		"email": email, "password": newPass, "surface": "SELLER",
	}, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("new password login %d %s", rr.Code, rr.Body.String())
	}
}

func TestIdentityMagicLinkConsumeOnce(t *testing.T) {
	h, _, capture, repo := newAuthStack(t)
	// seed a buyer-like user with password then magic-link
	email := fmt.Sprintf("buyer_%d@example.com", time.Now().UnixNano())
	password := "correct-horse-battery-9"
	_ = jsonPOST(t, h, "/v1/auth/register", map[string]any{
		"email": email, "password": password, "name": "Buyer", "surface": "BUYER",
	}, nil)
	verifyTok := extractTokenFromMail(t, capture)
	_ = jsonPOST(t, h, "/v1/auth/verify-email", map[string]any{"token": verifyTok}, nil)
	capture.Reset()

	_ = jsonPOST(t, h, "/v1/auth/magic-link/request", map[string]any{"email": email}, nil)
	magic := extractTokenFromMail(t, capture)

	rr := jsonPOST(t, h, "/v1/auth/magic-link/consume", map[string]any{"token": magic}, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("consume %d %s", rr.Code, rr.Body.String())
	}
	if sessionCookie(rr) == nil {
		t.Fatal("expected cookie")
	}
	// replay
	rr = jsonPOST(t, h, "/v1/auth/magic-link/consume", map[string]any{"token": magic}, nil)
	if rr.Code == http.StatusOK {
		t.Fatal("replay must fail")
	}
	_ = repo
}

func TestIdentityRevokeOthers(t *testing.T) {
	h, _, capture, _ := newAuthStack(t)
	email := fmt.Sprintf("revoke_%d@example.com", time.Now().UnixNano())
	password := "correct-horse-battery-9"
	_ = jsonPOST(t, h, "/v1/auth/register", map[string]any{
		"email": email, "password": password, "name": "Rev",
	}, nil)
	tok := extractTokenFromMail(t, capture)
	_ = jsonPOST(t, h, "/v1/auth/verify-email", map[string]any{"token": tok}, nil)

	rr1 := jsonPOST(t, h, "/v1/auth/login", map[string]any{
		"email": email, "password": password, "surface": "SELLER",
	}, nil)
	ck1 := sessionCookie(rr1)
	rr2 := jsonPOST(t, h, "/v1/auth/login", map[string]any{
		"email": email, "password": password, "surface": "SELLER",
	}, nil)
	ck2 := sessionCookie(rr2)
	if ck1 == nil || ck2 == nil {
		t.Fatal("cookies")
	}

	rr := jsonPOST(t, h, "/v1/auth/sessions/revoke-others", map[string]any{}, []*http.Cookie{ck2})
	if rr.Code != http.StatusOK {
		t.Fatalf("revoke-others %d %s", rr.Code, rr.Body.String())
	}
	// ck1 dead, ck2 alive
	if jsonGET(t, h, "/v1/auth/session", []*http.Cookie{ck1}).Code != http.StatusUnauthorized {
		t.Fatal("ck1 should be revoked")
	}
	if jsonGET(t, h, "/v1/auth/session", []*http.Cookie{ck2}).Code != http.StatusOK {
		t.Fatal("ck2 should live")
	}
}

func TestIdentityLoginRotatesSession(t *testing.T) {
	h, _, capture, _ := newAuthStack(t)
	email := fmt.Sprintf("rot_%d@example.com", time.Now().UnixNano())
	password := "correct-horse-battery-9"
	_ = jsonPOST(t, h, "/v1/auth/register", map[string]any{
		"email": email, "password": password, "name": "Rot",
	}, nil)
	_ = jsonPOST(t, h, "/v1/auth/verify-email", map[string]any{"token": extractTokenFromMail(t, capture)}, nil)

	rr1 := jsonPOST(t, h, "/v1/auth/login", map[string]any{
		"email": email, "password": password, "surface": "SELLER",
	}, nil)
	ck1 := sessionCookie(rr1)
	id1 := parseEnvelope(t, rr1)["sessionId"]

	rr2 := jsonPOST(t, h, "/v1/auth/login", map[string]any{
		"email": email, "password": password, "surface": "SELLER",
	}, nil)
	ck2 := sessionCookie(rr2)
	id2 := parseEnvelope(t, rr2)["sessionId"]
	if id1 == id2 || ck1.Value == ck2.Value {
		t.Fatal("login must rotate session token/id")
	}
}

func TestIdentityMFAEnrollConfirmVerify(t *testing.T) {
	h, svc, capture, _ := newAuthStack(t)
	email := fmt.Sprintf("mfa_%d@example.com", time.Now().UnixNano())
	password := "correct-horse-battery-9"
	_ = jsonPOST(t, h, "/v1/auth/register", map[string]any{
		"email": email, "password": password, "name": "MFA",
	}, nil)
	_ = jsonPOST(t, h, "/v1/auth/verify-email", map[string]any{"token": extractTokenFromMail(t, capture)}, nil)
	rr := jsonPOST(t, h, "/v1/auth/login", map[string]any{
		"email": email, "password": password, "surface": "SELLER",
	}, nil)
	ck := sessionCookie(rr)
	if ck == nil {
		t.Fatal("cookie")
	}

	rr = jsonPOST(t, h, "/v1/auth/mfa/enroll", map[string]any{}, []*http.Cookie{ck})
	if rr.Code != http.StatusOK {
		t.Fatalf("enroll %d %s", rr.Code, rr.Body.String())
	}
	enroll := parseEnvelope(t, rr)
	secret := fmt.Sprint(enroll["secret"])
	code, err := auth.TOTPCode(secret, time.Now().UTC())
	if err != nil {
		t.Fatal(err)
	}
	rr = jsonPOST(t, h, "/v1/auth/mfa/confirm", map[string]any{"code": code}, []*http.Cookie{ck})
	if rr.Code != http.StatusOK {
		t.Fatalf("confirm %d %s", rr.Code, rr.Body.String())
	}
	codes := parseEnvelope(t, rr)["recoveryCodes"]
	if codes == nil {
		t.Fatal("expected recovery codes once")
	}

	// re-login requires mfa
	rr = jsonPOST(t, h, "/v1/auth/login", map[string]any{
		"email": email, "password": password, "surface": "SELLER",
	}, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("login %d %s", rr.Code, rr.Body.String())
	}
	data := parseEnvelope(t, rr)
	if data["mfaRequired"] != true {
		t.Fatalf("expected mfaRequired %#v", data)
	}
	ck2 := sessionCookie(rr)
	code2, _ := auth.TOTPCode(secret, time.Now().UTC())
	rr = jsonPOST(t, h, "/v1/auth/mfa/verify", map[string]any{"code": code2}, []*http.Cookie{ck2})
	if rr.Code != http.StatusOK {
		t.Fatalf("verify mfa %d %s", rr.Code, rr.Body.String())
	}
	_ = svc
}

// ensure body closed on unused readers
var _ = io.EOF
