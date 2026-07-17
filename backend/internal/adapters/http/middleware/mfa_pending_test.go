package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

func TestMFAPendingAllowlist(t *testing.T) {
	t.Parallel()
	cases := []struct {
		method, path string
		ok           bool
	}{
		{http.MethodGet, "/v1/auth/session", true},
		{http.MethodPost, "/v1/auth/mfa/verify", true},
		{http.MethodPost, "/v1/auth/logout", true},
		{http.MethodPost, "/v1/auth/sessions/revoke-all", true},
		{http.MethodPost, "/v1/auth/password/forgot", true},
		{http.MethodPost, "/v1/auth/password/reset", true},
		{http.MethodGet, "/v1/auth/sessions", false},
		{http.MethodPost, "/v1/auth/mfa/enroll", false},
		{http.MethodPost, "/v1/auth/mfa/disable", false},
		{http.MethodGet, "/v1/me/profile", false},
		{http.MethodPost, "/v1/seller/stores/x/inventory/items/y/reveal", false},
		{http.MethodGet, "/v1/admin/merchants", false},
	}
	for _, tc := range cases {
		if got := MFAPendingAllowlisted(tc.method, tc.path); got != tc.ok {
			t.Fatalf("%s %s: got %v want %v", tc.method, tc.path, got, tc.ok)
		}
	}
}

func TestMFAPendingGate_BypassClosed(t *testing.T) {
	t.Parallel()
	nextCalled := false
	h := MFAPendingGate(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
		w.WriteHeader(http.StatusNoContent)
	}))

	// Pending principal + business route → AUTH_MFA_REQUIRED
	req := httptest.NewRequest(http.MethodGet, "/v1/me/profile", nil)
	ctx := reqctx.WithPrincipal(req.Context(), reqctx.Principal{
		SubjectID:   "u1",
		SessionID:   "s1",
		MFAEnabled:  true,
		MFAVerified: false,
		Permissions: []string{"*"},
	})
	req = req.WithContext(ctx)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if nextCalled {
		t.Fatal("business route must not pass MFA_PENDING")
	}
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d want 401", rr.Code)
	}
	if !containsCode(rr.Body.String(), apperr.CodeAuthMFARequired) {
		t.Fatalf("body missing AUTH_MFA_REQUIRED: %s", rr.Body.String())
	}

	// Allowlisted verify
	nextCalled = false
	req2 := httptest.NewRequest(http.MethodPost, "/v1/auth/mfa/verify", nil)
	req2 = req2.WithContext(ctx)
	rr2 := httptest.NewRecorder()
	h.ServeHTTP(rr2, req2)
	if !nextCalled {
		t.Fatal("verify must be allowlisted")
	}

	// Verified principal may proceed
	nextCalled = false
	ctxOK := reqctx.WithPrincipal(context.Background(), reqctx.Principal{
		SubjectID: "u1", SessionID: "s1", MFAEnabled: true, MFAVerified: true,
	})
	req3 := httptest.NewRequest(http.MethodGet, "/v1/me/profile", nil).WithContext(ctxOK)
	rr3 := httptest.NewRecorder()
	h.ServeHTTP(rr3, req3)
	if !nextCalled {
		t.Fatal("verified session must pass")
	}
}

func containsCode(body, code string) bool {
	return len(body) > 0 && (stringIndex(body, code) >= 0)
}

func stringIndex(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
