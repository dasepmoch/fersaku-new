//go:build integration

package integration_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// INT-140: pre-MFA session cannot hit business APIs; allowlist only.
func TestINT140_MFAPendingGate_BypassClosed(t *testing.T) {
	h, svc, capture, _ := newAuthStack(t)

	email := fmt.Sprintf("mfa-pending-%d@example.com", time.Now().UnixNano())
	password := "Password1!mfa"

	rr := jsonPOST(t, h, "/v1/auth/register", map[string]any{
		"email": email, "password": password, "name": "MFA User", "surface": "SELLER",
	}, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("register %d %s", rr.Code, rr.Body.String())
	}
	tok := extractTokenFromMail(t, capture)
	rr = jsonPOST(t, h, "/v1/auth/verify-email", map[string]any{"token": tok}, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("verify-email %d %s", rr.Code, rr.Body.String())
	}

	rr = jsonPOST(t, h, "/v1/auth/login", map[string]any{
		"email": email, "password": password, "surface": "SELLER",
	}, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("login1 %d %s", rr.Code, rr.Body.String())
	}
	ck := sessionCookie(rr)
	if ck == nil {
		t.Fatal("missing cookie")
	}

	rr = jsonPOST(t, h, "/v1/auth/mfa/enroll", map[string]any{}, []*http.Cookie{ck})
	if rr.Code != http.StatusOK {
		t.Fatalf("enroll %d %s", rr.Code, rr.Body.String())
	}
	enroll := parseEnvelope(t, rr)
	secret, _ := enroll["secret"].(string)
	if secret == "" {
		t.Fatal("missing secret")
	}
	code, err := auth.TOTPCode(secret, time.Now().UTC())
	if err != nil {
		t.Fatal(err)
	}
	rr = jsonPOST(t, h, "/v1/auth/mfa/confirm", map[string]any{"code": code}, []*http.Cookie{ck})
	if rr.Code != http.StatusOK {
		t.Fatalf("confirm %d %s", rr.Code, rr.Body.String())
	}

	// Re-login: MFA required, session cookie issued but pending
	rr = jsonPOST(t, h, "/v1/auth/login", map[string]any{
		"email": email, "password": password, "surface": "SELLER",
	}, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("login2 %d %s", rr.Code, rr.Body.String())
	}
	loginData := parseEnvelope(t, rr)
	if loginData["mfaRequired"] != true {
		t.Fatalf("mfaRequired=%v", loginData["mfaRequired"])
	}
	ck = sessionCookie(rr)
	if ck == nil {
		t.Fatal("missing pending cookie")
	}

	// Session allowlisted; permissions stripped
	rr = jsonGET(t, h, "/v1/auth/session", []*http.Cookie{ck})
	if rr.Code != http.StatusOK {
		t.Fatalf("session %d %s", rr.Code, rr.Body.String())
	}
	sess := parseEnvelope(t, rr)
	if sess["sessionStatus"] != "MFA_PENDING" {
		t.Fatalf("sessionStatus=%v", sess["sessionStatus"])
	}
	if sess["mfaVerified"] != false {
		t.Fatalf("mfaVerified=%v", sess["mfaVerified"])
	}
	if perms, _ := sess["permissions"].([]any); len(perms) != 0 {
		t.Fatalf("permissions must be empty while pending: %v", perms)
	}

	// Business route blocked (list sessions not on allowlist)
	rr = jsonGET(t, h, "/v1/auth/sessions", []*http.Cookie{ck})
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("sessions want 401 got %d %s", rr.Code, rr.Body.String())
	}
	if !bodyHasProblemCode(rr.Body.Bytes(), apperr.CodeAuthMFARequired) {
		t.Fatalf("want AUTH_MFA_REQUIRED: %s", rr.Body.String())
	}

	// Enroll not allowlisted after MFA enabled (pending)
	rr = jsonPOST(t, h, "/v1/auth/mfa/enroll", map[string]any{}, []*http.Cookie{ck})
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("enroll pending want 401 got %d %s", rr.Code, rr.Body.String())
	}

	// Verify allowlisted
	code, err = auth.TOTPCode(secret, time.Now().UTC())
	if err != nil {
		t.Fatal(err)
	}
	rr = jsonPOST(t, h, "/v1/auth/mfa/verify", map[string]any{"code": code}, []*http.Cookie{ck})
	if rr.Code != http.StatusOK {
		t.Fatalf("verify %d %s", rr.Code, rr.Body.String())
	}

	// After verify, previously blocked route works
	rr = jsonGET(t, h, "/v1/auth/sessions", []*http.Cookie{ck})
	if rr.Code != http.StatusOK {
		t.Fatalf("sessions after verify %d %s", rr.Code, rr.Body.String())
	}

	// Step-up mint + consume (replay closed)
	rr = jsonPOST(t, h, "/v1/auth/mfa/step-up", map[string]any{
		"code":    mustTOTPCode(t, secret),
		"purpose": "inventory.reveal",
	}, []*http.Cookie{ck})
	if rr.Code != http.StatusOK {
		t.Fatalf("step-up %d %s", rr.Code, rr.Body.String())
	}
	proofData := parseEnvelope(t, rr)
	proof, _ := proofData["recentMfaProof"].(string)
	if proof == "" {
		t.Fatal("missing proof")
	}

	uid, _ := sess["userId"].(string)
	// re-fetch session for ids after verify
	rr = jsonGET(t, h, "/v1/auth/session", []*http.Cookie{ck})
	sess = parseEnvelope(t, rr)
	uid, _ = sess["userId"].(string)
	sid, _ := sess["sessionId"].(string)

	ctx := context.Background()
	if err := svc.ConsumeRecentMFAProof(ctx, uid, sid, "bank.change", proof); err == nil {
		t.Fatal("wrong purpose must fail")
	}
	if err := svc.ConsumeRecentMFAProof(ctx, uid, sid, "inventory.reveal", proof); err != nil {
		t.Fatalf("consume: %v", err)
	}
	if err := svc.ConsumeRecentMFAProof(ctx, uid, sid, "inventory.reveal", proof); err == nil {
		t.Fatal("replay must fail")
	}
	if err := svc.ConsumeRecentMFAProof(ctx, uid, sid, "inventory.reveal", "not-a-proof"); err == nil {
		t.Fatal("invalid must fail")
	}
}

func mustTOTPCode(t *testing.T, secret string) string {
	t.Helper()
	c, err := auth.TOTPCode(secret, time.Now().UTC())
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func bodyHasProblemCode(b []byte, code string) bool {
	var env map[string]any
	if err := json.Unmarshal(b, &env); err != nil {
		return false
	}
	if p, ok := env["problem"].(map[string]any); ok {
		return p["code"] == code
	}
	return false
}
