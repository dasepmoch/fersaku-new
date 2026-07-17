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
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/authz"
)

func newRolesStack(t *testing.T) (http.Handler, *application.AuthService, *application.AuthzService, *mail.Capture, *postgres.Pool) {
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
	return h, authSvc, authzSvc, capture, pool
}

func bootstrapAdminCookie(t *testing.T, h http.Handler, authzSvc *application.AuthzService, capture *mail.Capture) (*http.Cookie, string) {
	t.Helper()
	email := fmt.Sprintf("sa-%d@example.com", time.Now().UnixNano())
	_ = registerVerifyLogin(t, h, capture, email, "password123", "SELLER")
	if _, err := authzSvc.BootstrapAdminByEmail(context.Background(), email); err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	// re-login so session principal reloads permissions
	rr := jsonPOST(t, h, "/v1/auth/login", map[string]any{
		"email": email, "password": "password123", "surface": "ADMIN",
	}, nil)
	if rr.Code != http.StatusOK {
		// surface may not matter; try SELLER
		rr = jsonPOST(t, h, "/v1/auth/login", map[string]any{
			"email": email, "password": "password123", "surface": "SELLER",
		}, nil)
	}
	if rr.Code != http.StatusOK {
		t.Fatalf("relogin %d %s", rr.Code, rr.Body.String())
	}
	c := sessionCookie(rr)
	if c == nil {
		t.Fatal("missing cookie")
	}
	return c, email
}

func envelopeData(t *testing.T, rr *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var env struct {
		Data map[string]any `json:"data"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &env); err != nil {
		t.Fatalf("json: %v body=%s", err, rr.Body.String())
	}
	return env.Data
}

func TestRoles_CannotGrantUnheldPermission(t *testing.T) {
	h, _, authzSvc, capture, _ := newRolesStack(t)
	cookie, _ := bootstrapAdminCookie(t, h, authzSvc, capture)

	// Create a limited custom role as super admin
	code := fmt.Sprintf("LIMITED_%d", time.Now().UnixNano())
	rr := jsonPOST(t, h, "/v1/admin/roles", map[string]any{
		"code": code, "name": "Limited",
		"permissions": []string{authz.PermMerchantsRead, authz.PermRolesWrite, authz.PermRolesRead},
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusCreated {
		t.Fatalf("create limited role %d %s", rr.Code, rr.Body.String())
	}
	limitedID := envelopeData(t, rr)["id"].(string)

	// Assign limited role to another user
	email2 := fmt.Sprintf("lim-%d@example.com", time.Now().UnixNano())
	_ = registerVerifyLogin(t, h, capture, email2, "password123", "SELLER")
	uid2, err := authzSvc.Store.GetUserIDByEmailNormalized(context.Background(), strings.ToLower(email2))
	if err != nil {
		t.Fatal(err)
	}
	rr = jsonPOST(t, h, "/v1/admin/users/"+uid2+"/roles", map[string]any{
		"roleId": limitedID,
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("assign limited %d %s", rr.Code, rr.Body.String())
	}

	// limited user tries to create role with kyc.review (unheld)
	rr = jsonPOST(t, h, "/v1/auth/login", map[string]any{
		"email": email2, "password": "password123", "surface": "SELLER",
	}, nil)
	cookie2 := sessionCookie(rr)
	rr = jsonPOST(t, h, "/v1/admin/roles", map[string]any{
		"code": fmt.Sprintf("ESC_%d", time.Now().UnixNano()), "name": "Esc",
		"permissions": []string{authz.PermKYCReview},
	}, []*http.Cookie{cookie2})
	if rr.Code != http.StatusForbidden {
		t.Fatalf("want 403 unheld grant got %d %s", rr.Code, rr.Body.String())
	}
}

func TestRoles_SystemRoleUpdateRejected(t *testing.T) {
	h, _, authzSvc, capture, _ := newRolesStack(t)
	cookie, _ := bootstrapAdminCookie(t, h, authzSvc, capture)
	req, _ := http.NewRequest(http.MethodPatch, "/v1/admin/roles/role_super_admin", strings.NewReader(
		`{"expectedVersion":1,"name":"Hacked","permissions":["merchants.read"]}`,
	))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(cookie)
	rr := httptestDo(t, h, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("want 403 system role got %d %s", rr.Code, rr.Body.String())
	}
}

func TestRoles_CannotDeleteLastSuperAdmin(t *testing.T) {
	h, authSvc, authzSvc, capture, pool := newRolesStack(t)
	cookie, email := bootstrapAdminCookie(t, h, authzSvc, capture)
	p, _, err := authSvc.ResolveSession(context.Background(), cookie.Value)
	if err != nil {
		t.Fatal(err)
	}
	// Isolate: remove other SUPER_ADMIN holders so this user is the last protected admin.
	_, _ = pool.Pool().Exec(context.Background(),
		`DELETE FROM user_roles WHERE role_id = 'role_super_admin' AND user_id <> $1`, p.UserID)
	var n int64
	if err := pool.Pool().QueryRow(context.Background(),
		`SELECT COUNT(*) FROM user_roles WHERE role_id = 'role_super_admin'`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("expected single super admin, got %d email=%s", n, email)
	}
	rr := httptestDo(t, h, mustReq(t, http.MethodDelete, "/v1/admin/users/"+p.UserID+"/roles/role_super_admin", nil, cookie))
	if rr.Code != http.StatusForbidden {
		t.Fatalf("want 403 last super admin got %d %s email=%s", rr.Code, rr.Body.String(), email)
	}
}

func TestInvite_AcceptOnceExpiredRevokedMismatch(t *testing.T) {
	h, authSvc, authzSvc, capture, pool := newRolesStack(t)
	cookie, _ := bootstrapAdminCookie(t, h, authzSvc, capture)

	// custom role for invite
	rr := jsonPOST(t, h, "/v1/admin/roles", map[string]any{
		"code": fmt.Sprintf("INVITE_%d", time.Now().UnixNano()), "name": "Invite Role",
		"permissions": []string{authz.PermMerchantsRead, authz.PermAdminPing},
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusCreated {
		t.Fatalf("create role %d %s", rr.Code, rr.Body.String())
	}
	roleID := envelopeData(t, rr)["id"].(string)

	invitee := fmt.Sprintf("invitee-%d@example.com", time.Now().UnixNano())
	_ = registerVerifyLogin(t, h, capture, invitee, "password123", "SELLER")

	rr = jsonPOST(t, h, "/v1/admin/invitations/staff", map[string]any{
		"email": invitee, "roleId": roleID,
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusCreated {
		t.Fatalf("invite %d %s", rr.Code, rr.Body.String())
	}
	data := envelopeData(t, rr)
	rawToken, _ := data["token"].(string)
	invID, _ := data["id"].(string)
	if rawToken == "" {
		t.Fatal("raw token missing on create")
	}

	// Accept once
	rr = jsonPOST(t, h, "/v1/auth/invitations/accept", map[string]any{"token": rawToken}, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("accept %d %s", rr.Code, rr.Body.String())
	}
	// Accept again (idempotent accepted)
	rr = jsonPOST(t, h, "/v1/auth/invitations/accept", map[string]any{"token": rawToken}, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("accept replay %d %s", rr.Code, rr.Body.String())
	}

	// Revoked invite
	rr = jsonPOST(t, h, "/v1/admin/invitations/staff", map[string]any{
		"email": fmt.Sprintf("rev-%d@example.com", time.Now().UnixNano()), "roleId": roleID,
	}, []*http.Cookie{cookie})
	data = envelopeData(t, rr)
	raw2 := data["token"].(string)
	id2 := data["id"].(string)
	rr = jsonPOST(t, h, "/v1/admin/invitations/staff/"+id2+"/revoke", map[string]any{}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("revoke %d %s", rr.Code, rr.Body.String())
	}
	rr = jsonPOST(t, h, "/v1/auth/invitations/accept", map[string]any{"token": raw2}, nil)
	if rr.Code == http.StatusOK {
		t.Fatalf("revoked accept should fail: %s", rr.Body.String())
	}

	// Expired
	rr = jsonPOST(t, h, "/v1/admin/invitations/staff", map[string]any{
		"email": fmt.Sprintf("exp-%d@example.com", time.Now().UnixNano()), "roleId": roleID,
	}, []*http.Cookie{cookie})
	data = envelopeData(t, rr)
	raw3 := data["token"].(string)
	id3 := data["id"].(string)
	_, err := pool.Pool().Exec(context.Background(),
		`UPDATE staff_invitations SET expires_at = now() - interval '1 hour' WHERE id = $1`, id3)
	if err != nil {
		t.Fatal(err)
	}
	rr = jsonPOST(t, h, "/v1/auth/invitations/accept", map[string]any{"token": raw3}, nil)
	if rr.Code == http.StatusOK {
		t.Fatalf("expired accept should fail: %s", rr.Body.String())
	}

	// Email mismatch: invite bound to invitee, accept with different session
	other := fmt.Sprintf("other-%d@example.com", time.Now().UnixNano())
	otherCookie := registerVerifyLogin(t, h, capture, other, "password123", "SELLER")
	rr = jsonPOST(t, h, "/v1/admin/invitations/staff", map[string]any{
		"email": invitee, "roleId": roleID,
	}, []*http.Cookie{cookie})
	// may create second invite for same email
	if rr.Code == http.StatusCreated {
		raw4 := envelopeData(t, rr)["token"].(string)
		rr = jsonPOST(t, h, "/v1/auth/invitations/accept", map[string]any{"token": raw4}, []*http.Cookie{otherCookie})
		if rr.Code == http.StatusOK {
			t.Fatalf("mismatch email should fail: %s", rr.Body.String())
		}
	}

	_ = invID
	_ = authSvc
}

func TestInvite_GETDoesNotExistForConsume(t *testing.T) {
	h, _, authzSvc, capture, _ := newRolesStack(t)
	_, _ = bootstrapAdminCookie(t, h, authzSvc, capture)
	// GET accept path should be method not allowed or not found — never consume
	req, _ := http.NewRequest(http.MethodGet, "/v1/auth/invitations/accept?token=abc", nil)
	rr := httptestDo(t, h, req)
	if rr.Code == http.StatusOK {
		t.Fatal("GET must not succeed for invitation accept")
	}
}

func httptestDo(t *testing.T, h http.Handler, req *http.Request) *httptest.ResponseRecorder {
	t.Helper()
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func mustReq(t *testing.T, method, path string, body any, cookie *http.Cookie) *http.Request {
	t.Helper()
	var r *http.Request
	if body != nil {
		b, _ := json.Marshal(body)
		r, _ = http.NewRequest(method, path, strings.NewReader(string(b)))
		r.Header.Set("Content-Type", "application/json")
	} else {
		r, _ = http.NewRequest(method, path, nil)
	}
	if cookie != nil {
		r.AddCookie(cookie)
	}
	return r
}
