//go:build integration

package integration_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
)

func jsonPATCH(t *testing.T, h http.Handler, path string, body any, cookies []*http.Cookie) *httptest.ResponseRecorder {
	t.Helper()
	b, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPatch, path, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	for _, c := range cookies {
		req.AddCookie(c)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func tokenFromBody(body string) string {
	for _, line := range strings.Split(body, "\n") {
		if strings.HasPrefix(line, "token=") {
			return strings.TrimPrefix(line, "token=")
		}
	}
	return ""
}

func TestProfileReadAndOptimisticConflict(t *testing.T) {
	h, _, capture, _ := newAuthStack(t)
	email := fmt.Sprintf("prof_%d@example.com", time.Now().UnixNano())
	password := "correct-horse-battery-9"
	_ = jsonPOST(t, h, "/v1/auth/register", map[string]any{
		"email": email, "password": password, "name": "Profile User", "surface": "SELLER",
	}, nil)
	_ = jsonPOST(t, h, "/v1/auth/verify-email", map[string]any{"token": extractTokenFromMail(t, capture)}, nil)
	rr := jsonPOST(t, h, "/v1/auth/login", map[string]any{
		"email": email, "password": password, "surface": "SELLER",
	}, nil)
	ck := sessionCookie(rr)
	if ck == nil {
		t.Fatal("cookie")
	}

	rr = jsonGET(t, h, "/v1/me/profile", []*http.Cookie{ck})
	if rr.Code != http.StatusOK {
		t.Fatalf("get profile %d %s", rr.Code, rr.Body.String())
	}
	data := parseEnvelope(t, rr)
	ver := int64(data["version"].(float64))
	if ver < 1 {
		t.Fatalf("version %#v", data["version"])
	}
	if data["locale"] != "id-ID" {
		t.Fatalf("locale %#v", data["locale"])
	}

	rr = jsonPATCH(t, h, "/v1/me/profile", map[string]any{
		"expectedVersion": ver,
		"displayName":     "Ada Lovelace",
		"locale":          "en-US",
		"timezone":        "UTC",
	}, []*http.Cookie{ck})
	if rr.Code != http.StatusOK {
		t.Fatalf("patch %d %s", rr.Code, rr.Body.String())
	}
	data2 := parseEnvelope(t, rr)
	if data2["displayName"] != "Ada Lovelace" {
		t.Fatalf("name %#v", data2["displayName"])
	}
	if int64(data2["version"].(float64)) != ver+1 {
		t.Fatalf("version not bumped %#v", data2["version"])
	}

	rr = jsonPATCH(t, h, "/v1/me/profile", map[string]any{
		"expectedVersion": ver,
		"displayName":     "Stale",
	}, []*http.Cookie{ck})
	if rr.Code != http.StatusConflict {
		t.Fatalf("expected 409 got %d %s", rr.Code, rr.Body.String())
	}
}

func TestPasswordChangeRotatesSessions(t *testing.T) {
	h, _, capture, _ := newAuthStack(t)
	email := fmt.Sprintf("pwch_%d@example.com", time.Now().UnixNano())
	password := "correct-horse-battery-9"
	_ = jsonPOST(t, h, "/v1/auth/register", map[string]any{
		"email": email, "password": password, "name": "PW", "surface": "SELLER",
	}, nil)
	_ = jsonPOST(t, h, "/v1/auth/verify-email", map[string]any{"token": extractTokenFromMail(t, capture)}, nil)
	capture.Reset()

	rr1 := jsonPOST(t, h, "/v1/auth/login", map[string]any{
		"email": email, "password": password, "surface": "SELLER",
	}, nil)
	ck1 := sessionCookie(rr1)
	rr2 := jsonPOST(t, h, "/v1/auth/login", map[string]any{
		"email": email, "password": password, "surface": "SELLER",
	}, nil)
	ck2 := sessionCookie(rr2)

	_ = jsonPOST(t, h, "/v1/auth/password/forgot", map[string]any{"email": email}, nil)
	resetTok := extractTokenFromMail(t, capture)
	capture.Reset()

	newPass := "brand-new-password-42"
	rr := jsonPOST(t, h, "/v1/auth/password/change", map[string]any{
		"currentPassword": password,
		"newPassword":     newPass,
	}, []*http.Cookie{ck2})
	if rr.Code != http.StatusOK {
		t.Fatalf("change %d %s", rr.Code, rr.Body.String())
	}
	ckNew := sessionCookie(rr)
	if ckNew == nil || ckNew.Value == ck2.Value {
		t.Fatal("expected rotated session cookie")
	}
	if jsonGET(t, h, "/v1/auth/session", []*http.Cookie{ck1}).Code != http.StatusUnauthorized {
		t.Fatal("ck1 should be revoked")
	}
	if jsonGET(t, h, "/v1/auth/session", []*http.Cookie{ckNew}).Code != http.StatusOK {
		t.Fatal("new session should work")
	}

	_ = jsonPOST(t, h, "/v1/auth/password/reset", map[string]any{
		"token": resetTok, "newPassword": "another-password-99",
	}, nil)
	rr = jsonPOST(t, h, "/v1/auth/login", map[string]any{
		"email": email, "password": "another-password-99", "surface": "SELLER",
	}, nil)
	if rr.Code == http.StatusOK {
		t.Fatal("reset token should have been invalidated")
	}
	rr = jsonPOST(t, h, "/v1/auth/login", map[string]any{
		"email": email, "password": newPass, "surface": "SELLER",
	}, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("new pass login %d %s", rr.Code, rr.Body.String())
	}
}

func TestDualEmailChangeOrderAndRace(t *testing.T) {
	h, _, capture, _ := newAuthStack(t)
	email := fmt.Sprintf("old_%d@example.com", time.Now().UnixNano())
	newEmail := fmt.Sprintf("new_%d@example.com", time.Now().UnixNano())
	password := "correct-horse-battery-9"
	_ = jsonPOST(t, h, "/v1/auth/register", map[string]any{
		"email": email, "password": password, "name": "EC", "surface": "SELLER",
	}, nil)
	_ = jsonPOST(t, h, "/v1/auth/verify-email", map[string]any{"token": extractTokenFromMail(t, capture)}, nil)
	capture.Reset()
	rr := jsonPOST(t, h, "/v1/auth/login", map[string]any{
		"email": email, "password": password, "surface": "SELLER",
	}, nil)
	ck := sessionCookie(rr)

	rr = jsonPOST(t, h, "/v1/auth/email-change/request", map[string]any{
		"newEmail": newEmail,
	}, []*http.Cookie{ck})
	if rr.Code != http.StatusOK {
		t.Fatalf("request %d %s", rr.Code, rr.Body.String())
	}
	msgs := capture.Messages()
	if len(msgs) < 2 {
		t.Fatalf("expected 2 mails got %d", len(msgs))
	}
	var currentTok, newTok string
	for _, m := range msgs {
		tok := tokenFromBody(m.Body)
		if strings.Contains(m.Body, string(auth.PurposeEmailChangeCurrent)) {
			currentTok = tok
		}
		if strings.Contains(m.Body, string(auth.PurposeEmailChangeNew)) {
			newTok = tok
		}
	}
	if currentTok == "" || newTok == "" {
		currentTok = tokenFromBody(msgs[0].Body)
		newTok = tokenFromBody(msgs[1].Body)
	}
	if currentTok == "" || newTok == "" || currentTok == newTok {
		t.Fatalf("bad tokens current=%q new=%q", currentTok, newTok)
	}

	rr = jsonPOST(t, h, "/v1/auth/email-change/confirm-current", map[string]any{"token": currentTok}, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("confirm current %d %s", rr.Code, rr.Body.String())
	}
	if parseEnvelope(t, rr)["complete"] == true {
		t.Fatal("must not complete with one proof")
	}

	// wrong purpose token on current endpoint
	rr = jsonPOST(t, h, "/v1/auth/email-change/confirm-current", map[string]any{"token": newTok}, nil)
	if rr.Code == http.StatusOK {
		if parseEnvelope(t, rr)["complete"] == true {
			t.Fatal("wrong endpoint must not complete")
		}
	}

	rr = jsonPOST(t, h, "/v1/auth/email-change/confirm-new", map[string]any{"token": newTok}, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("confirm new %d %s", rr.Code, rr.Body.String())
	}
	if parseEnvelope(t, rr)["complete"] != true {
		t.Fatalf("expected complete %s", rr.Body.String())
	}

	if jsonGET(t, h, "/v1/auth/session", []*http.Cookie{ck}).Code != http.StatusUnauthorized {
		t.Fatal("session should be revoked after email change")
	}
	rr = jsonPOST(t, h, "/v1/auth/login", map[string]any{
		"email": newEmail, "password": password, "surface": "SELLER",
	}, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("new email login %d %s", rr.Code, rr.Body.String())
	}
	rr = jsonPOST(t, h, "/v1/auth/login", map[string]any{
		"email": email, "password": password, "surface": "SELLER",
	}, nil)
	if rr.Code == http.StatusOK {
		t.Fatal("old email must not login")
	}

	// replay cannot re-hijack
	rr = jsonPOST(t, h, "/v1/auth/email-change/confirm-current", map[string]any{"token": currentTok}, nil)
	if rr.Code == http.StatusOK && parseEnvelope(t, rr)["complete"] == true {
		t.Fatal("replay must not re-complete")
	}
}

func TestMFADisableRequiresFreshProof(t *testing.T) {
	h, _, capture, _ := newAuthStack(t)
	email := fmt.Sprintf("mfadis_%d@example.com", time.Now().UnixNano())
	password := "correct-horse-battery-9"
	_ = jsonPOST(t, h, "/v1/auth/register", map[string]any{
		"email": email, "password": password, "name": "M", "surface": "SELLER",
	}, nil)
	_ = jsonPOST(t, h, "/v1/auth/verify-email", map[string]any{"token": extractTokenFromMail(t, capture)}, nil)
	rr := jsonPOST(t, h, "/v1/auth/login", map[string]any{
		"email": email, "password": password, "surface": "SELLER",
	}, nil)
	ck := sessionCookie(rr)

	rr = jsonPOST(t, h, "/v1/auth/mfa/enroll", map[string]any{}, []*http.Cookie{ck})
	secret := fmt.Sprint(parseEnvelope(t, rr)["secret"])
	code, err := auth.TOTPCode(secret, time.Now().UTC())
	if err != nil {
		t.Fatal(err)
	}
	rr = jsonPOST(t, h, "/v1/auth/mfa/confirm", map[string]any{"code": code}, []*http.Cookie{ck})
	if rr.Code != http.StatusOK {
		t.Fatalf("confirm %d %s", rr.Code, rr.Body.String())
	}

	rr = jsonPOST(t, h, "/v1/auth/login", map[string]any{
		"email": email, "password": password, "surface": "SELLER",
	}, nil)
	ck2 := sessionCookie(rr)
	rr = jsonPOST(t, h, "/v1/auth/mfa/disable", map[string]any{}, []*http.Cookie{ck2})
	if rr.Code == http.StatusOK {
		t.Fatal("disable without proof must fail")
	}
	code2, _ := auth.TOTPCode(secret, time.Now().UTC())
	rr = jsonPOST(t, h, "/v1/auth/mfa/disable", map[string]any{"code": code2}, []*http.Cookie{ck2})
	if rr.Code != http.StatusOK {
		t.Fatalf("disable %d %s", rr.Code, rr.Body.String())
	}
	rr = jsonPOST(t, h, "/v1/auth/login", map[string]any{
		"email": email, "password": password, "surface": "SELLER",
	}, nil)
	if parseEnvelope(t, rr)["mfaRequired"] == true {
		t.Fatal("MFA should be off")
	}
}

func TestNotificationPrefsRejectMandatoryDisable(t *testing.T) {
	h, _, capture, _ := newAuthStack(t)
	email := fmt.Sprintf("prefs_%d@example.com", time.Now().UnixNano())
	password := "correct-horse-battery-9"
	_ = jsonPOST(t, h, "/v1/auth/register", map[string]any{
		"email": email, "password": password, "name": "P", "surface": "SELLER",
	}, nil)
	_ = jsonPOST(t, h, "/v1/auth/verify-email", map[string]any{"token": extractTokenFromMail(t, capture)}, nil)
	rr := jsonPOST(t, h, "/v1/auth/login", map[string]any{
		"email": email, "password": password, "surface": "SELLER",
	}, nil)
	ck := sessionCookie(rr)

	rr = jsonGET(t, h, "/v1/me/notification-preferences", []*http.Cookie{ck})
	if rr.Code != http.StatusOK {
		t.Fatalf("get prefs %d %s", rr.Code, rr.Body.String())
	}
	if parseEnvelope(t, rr)["preferences"] == nil {
		t.Fatal("expected preferences")
	}

	rr = jsonPATCH(t, h, "/v1/me/notification-preferences", map[string]any{
		"preferences": []map[string]any{
			{"eventCode": "MARKETING_NEWSLETTER", "channel": "EMAIL", "enabled": true},
		},
	}, []*http.Cookie{ck})
	if rr.Code != http.StatusOK {
		t.Fatalf("patch marketing %d %s", rr.Code, rr.Body.String())
	}

	rr = jsonPATCH(t, h, "/v1/me/notification-preferences", map[string]any{
		"preferences": []map[string]any{
			{"eventCode": "SECURITY_ALERT", "channel": "EMAIL", "enabled": false},
		},
	}, []*http.Cookie{ck})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 got %d %s", rr.Code, rr.Body.String())
	}
}
