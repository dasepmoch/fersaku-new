//go:build integration

package integration_test

import (
	"context"
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
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/stores"
)

func newOnboardingStack(t *testing.T) (http.Handler, *application.AuthService, *application.OnboardingService, *mail.Capture, *postgres.Pool) {
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
	onboard := &application.OnboardingService{
		Store: postgres.NewOnboardingRepo(pool.Pool()),
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
		SessionCookieName: "fersaku_session",
		CSRFSoftDisable:   true,
		AuthService:       authSvc,
		AuthzService:      authzSvc,
		OnboardingService: onboard,
		RateLimiter:       nil,
		RequestTimeout:    10 * time.Second,
	})
	return h, authSvc, onboard, capture, pool
}

func TestOnboarding_RegisterSellerCompleteWithoutProduct(t *testing.T) {
	h, _, _, capture, _ := newOnboardingStack(t)
	email := fmt.Sprintf("seller-ob-%d@example.com", time.Now().UnixNano())
	cookie := registerVerifyLogin(t, h, capture, email, "password123", "SELLER")

	// Not started
	rr := jsonGET(t, h, "/v1/onboarding", []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("get onboarding %d %s", rr.Code, rr.Body.String())
	}
	data := envelopeData(t, rr)
	if data["state"] != "NOT_STARTED" {
		t.Fatalf("state=%v", data["state"])
	}

	slug := fmt.Sprintf("toko-%d", time.Now().UnixNano()%1000000)
	rr = jsonPOST(t, h, "/v1/onboarding/store", map[string]any{
		"name": "Asep AI Tools",
		"bio":  "Digital tools for creators and small teams.",
		"slug": slug,
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("create store %d %s", rr.Code, rr.Body.String())
	}
	created := envelopeData(t, rr)
	storeID, _ := created["storeId"].(string)
	merchantID, _ := created["merchantId"].(string)
	if storeID == "" || merchantID == "" {
		t.Fatalf("missing ids: %v", created)
	}
	storeObj, _ := created["store"].(map[string]any)
	if storeObj["slug"] != slug {
		t.Fatalf("slug=%v want %s", storeObj["slug"], slug)
	}

	// Complete without product
	rr = jsonPOST(t, h, "/v1/onboarding/complete", map[string]any{"skipProduct": true}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("complete %d %s", rr.Code, rr.Body.String())
	}
	done := envelopeData(t, rr)
	if done["completed"] != true {
		t.Fatalf("not completed: %v", done)
	}
	if done["state"] != "COMPLETE" {
		t.Fatalf("state=%v", done["state"])
	}
	if done["storeId"] != storeID {
		t.Fatalf("store changed on complete")
	}
}

func TestOnboarding_RetryReturnsSameStore(t *testing.T) {
	h, _, _, capture, _ := newOnboardingStack(t)
	email := fmt.Sprintf("seller-retry-%d@example.com", time.Now().UnixNano())
	cookie := registerVerifyLogin(t, h, capture, email, "password123", "SELLER")
	slug := fmt.Sprintf("retry-%d", time.Now().UnixNano()%1000000)

	rr := jsonPOST(t, h, "/v1/onboarding/store", map[string]any{
		"name": "Retry Shop",
		"bio":  "This shop proves idempotent create returns the same store.",
		"slug": slug,
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("first create %d %s", rr.Code, rr.Body.String())
	}
	first := envelopeData(t, rr)
	storeID := first["storeId"]
	merchantID := first["merchantId"]

	rr = jsonPOST(t, h, "/v1/onboarding/store", map[string]any{
		"name": "Different Name",
		"bio":  "Should not create a second merchant or store at all.",
		"slug": "other-" + slug,
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("retry create %d %s", rr.Code, rr.Body.String())
	}
	second := envelopeData(t, rr)
	if second["storeId"] != storeID || second["merchantId"] != merchantID {
		t.Fatalf("retry must return same store; first=%v second=%v", first, second)
	}
	storeObj, _ := second["store"].(map[string]any)
	if storeObj["slug"] != slug {
		t.Fatalf("slug mutated on retry: %v", storeObj["slug"])
	}
}

func TestOnboarding_SlugConflictAndAvailability(t *testing.T) {
	h, _, _, capture, _ := newOnboardingStack(t)
	email1 := fmt.Sprintf("seller-s1-%d@example.com", time.Now().UnixNano())
	email2 := fmt.Sprintf("seller-s2-%d@example.com", time.Now().UnixNano())
	ck1 := registerVerifyLogin(t, h, capture, email1, "password123", "SELLER")
	ck2 := registerVerifyLogin(t, h, capture, email2, "password123", "SELLER")
	slug := fmt.Sprintf("taken-%d", time.Now().UnixNano()%1000000)

	rr := jsonPOST(t, h, "/v1/onboarding/store", map[string]any{
		"name": "First",
		"bio":  "First merchant claims this unique storefront slug now.",
		"slug": slug,
	}, []*http.Cookie{ck1})
	if rr.Code != http.StatusOK {
		t.Fatalf("create1 %d %s", rr.Code, rr.Body.String())
	}

	// Availability public endpoint
	rr = jsonGET(t, h, "/v1/stores/slug-availability?slug="+slug, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("availability %d %s", rr.Code, rr.Body.String())
	}
	av := envelopeData(t, rr)
	if av["available"] != false {
		t.Fatalf("expected unavailable: %v", av)
	}

	// Second seller cannot take same slug
	rr = jsonPOST(t, h, "/v1/onboarding/store", map[string]any{
		"name": "Second",
		"bio":  "Second merchant should hit slug conflict when claiming same slug.",
		"slug": slug,
	}, []*http.Cookie{ck2})
	if rr.Code != http.StatusConflict {
		t.Fatalf("want 409 got %d %s", rr.Code, rr.Body.String())
	}
	if code := problemCode(t, rr); code != "CONFLICT" {
		t.Fatalf("code=%s", code)
	}

	// Reserved slug
	rr = jsonGET(t, h, "/v1/stores/slug-availability?slug=admin", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("reserved check %d", rr.Code)
	}
	av = envelopeData(t, rr)
	if av["available"] != false {
		t.Fatalf("admin must be unavailable: %v", av)
	}
}

func TestOnboarding_CannotCompleteWithoutStore(t *testing.T) {
	h, _, _, capture, _ := newOnboardingStack(t)
	email := fmt.Sprintf("seller-nostore-%d@example.com", time.Now().UnixNano())
	cookie := registerVerifyLogin(t, h, capture, email, "password123", "SELLER")

	rr := jsonPOST(t, h, "/v1/onboarding/complete", map[string]any{"skipProduct": true}, []*http.Cookie{cookie})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("want 400 got %d %s", rr.Code, rr.Body.String())
	}
	code := problemCode(t, rr)
	if code != "ONBOARDING_STORE_REQUIRED" && code != "VALIDATION_FAILED" {
		t.Fatalf("code=%s", code)
	}
}

func TestOnboarding_PatchProgressThenComplete(t *testing.T) {
	h, _, _, capture, _ := newOnboardingStack(t)
	email := fmt.Sprintf("seller-patch-%d@example.com", time.Now().UnixNano())
	cookie := registerVerifyLogin(t, h, capture, email, "password123", "SELLER")
	slug := fmt.Sprintf("patch-%d", time.Now().UnixNano()%1000000)

	rr := jsonPOST(t, h, "/v1/onboarding/store", map[string]any{
		"name": "Patch Me",
		"bio":  "Initial bio that is long enough for identity validation rules.",
		"slug": slug,
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("create %d %s", rr.Code, rr.Body.String())
	}

	newSlug := slug + "-v2"
	rr = jsonPATCH(t, h, "/v1/onboarding/store", map[string]any{
		"name":        "Patched Shop",
		"bio":         "Updated bio still long enough for the identity requirement check.",
		"slug":        newSlug,
		"accentColor": "#d7ff64",
		"step":        "PRODUCT_OPTIONAL",
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("patch %d %s", rr.Code, rr.Body.String())
	}
	patched := envelopeData(t, rr)
	storeObj, _ := patched["store"].(map[string]any)
	if storeObj["slug"] != newSlug {
		t.Fatalf("slug not patched: %v", storeObj)
	}
	if storeObj["accentColor"] != "#d7ff64" {
		t.Fatalf("accent: %v", storeObj["accentColor"])
	}

	rr = jsonPOST(t, h, "/v1/onboarding/complete", map[string]any{}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("complete %d %s", rr.Code, rr.Body.String())
	}
}

func TestOnboarding_CannotDeleteLastStore(t *testing.T) {
	h, authSvc, onboard, capture, pool := newOnboardingStack(t)
	email := fmt.Sprintf("seller-del-%d@example.com", time.Now().UnixNano())
	cookie := registerVerifyLogin(t, h, capture, email, "password123", "SELLER")
	slug := fmt.Sprintf("del-%d", time.Now().UnixNano()%1000000)

	rr := jsonPOST(t, h, "/v1/onboarding/store", map[string]any{
		"name": "Only Store",
		"bio":  "This is the only store and must never be deleted by policy.",
		"slug": slug,
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("create %d %s", rr.Code, rr.Body.String())
	}
	data := envelopeData(t, rr)
	storeID, _ := data["storeId"].(string)
	p, _, err := authSvc.ResolveSession(context.Background(), cookie.Value)
	if err != nil {
		t.Fatal(err)
	}
	if err := onboard.DeleteStore(context.Background(), p.UserID, storeID); err == nil {
		t.Fatal("expected cannot delete last store")
	} else if err != stores.ErrCannotDeleteLast {
		// allow wrapped check
		if !strings.Contains(err.Error(), "last store") && !strings.Contains(err.Error(), "CONFLICT") {
			t.Fatalf("unexpected err: %v", err)
		}
	}

	// DB trigger also blocks raw DELETE
	_, err = pool.Pool().Exec(context.Background(), `DELETE FROM stores WHERE id = $1`, storeID)
	if err == nil {
		t.Fatal("expected DB to reject last store delete")
	}
}

func TestOnboarding_IntegrityScanOrphans(t *testing.T) {
	h, authSvc, onboard, capture, pool := newOnboardingStack(t)
	email := fmt.Sprintf("seller-orph-%d@example.com", time.Now().UnixNano())
	cookie := registerVerifyLogin(t, h, capture, email, "password123", "SELLER")
	p, _, err := authSvc.ResolveSession(context.Background(), cookie.Value)
	if err != nil {
		t.Fatal(err)
	}

	// Healthy path: no orphans after proper create
	rr := jsonPOST(t, h, "/v1/onboarding/store", map[string]any{
		"name": "Healthy",
		"bio":  "Healthy merchant has a canonical store after onboarding create.",
		"slug": fmt.Sprintf("healthy-%d", time.Now().UnixNano()%1000000),
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("create %d %s", rr.Code, rr.Body.String())
	}
	orphans, err := onboard.ScanOrphanMerchants(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	for _, o := range orphans {
		if o.OwnerUserID == p.UserID {
			t.Fatalf("healthy merchant listed as orphan: %+v", o)
		}
	}

	// Simulate legacy orphan: merchant without store (disable trigger temporarily not needed — insert merchant only)
	orphanID := fmt.Sprintf("orph_%d", time.Now().UnixNano())
	_, err = pool.Pool().Exec(context.Background(), `
		INSERT INTO merchants (id, owner_user_id, display_name, status, onboarding_state, onboarding_step, created_at, updated_at)
		VALUES ($1, $2, 'Orphan', 'ACTIVE', 'IDENTITY', 'IDENTITY', now(), now())
	`, orphanID, p.UserID)
	// owner already has a merchant — unique not on owner; may succeed as second merchant
	if err != nil {
		// create a fresh user for orphan owner
		email2 := fmt.Sprintf("orphan-owner-%d@example.com", time.Now().UnixNano())
		ck2 := registerVerifyLogin(t, h, capture, email2, "password123", "SELLER")
		p2, _, err2 := authSvc.ResolveSession(context.Background(), ck2.Value)
		if err2 != nil {
			t.Fatal(err2)
		}
		orphanID = fmt.Sprintf("orph_%d", time.Now().UnixNano())
		_, err = pool.Pool().Exec(context.Background(), `
			INSERT INTO merchants (id, owner_user_id, display_name, status, onboarding_state, onboarding_step, created_at, updated_at)
			VALUES ($1, $2, 'Orphan', 'ACTIVE', 'IDENTITY', 'IDENTITY', now(), now())
		`, orphanID, p2.UserID)
		if err != nil {
			t.Fatalf("insert orphan merchant: %v", err)
		}
	}

	orphans, err = onboard.ScanOrphanMerchants(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, o := range orphans {
		if o.ID == orphanID {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("orphan scan missed %s; got %+v", orphanID, orphans)
	}
}

func TestOnboarding_SellerMeMerchantAfterOnboard(t *testing.T) {
	h, _, _, capture, _ := newOnboardingStack(t)
	email := fmt.Sprintf("seller-me-%d@example.com", time.Now().UnixNano())
	cookie := registerVerifyLogin(t, h, capture, email, "password123", "SELLER")

	rr := jsonGET(t, h, "/v1/seller/me/merchant", []*http.Cookie{cookie})
	if rr.Code != http.StatusForbidden {
		t.Fatalf("pre-onboard want 403 got %d", rr.Code)
	}

	rr = jsonPOST(t, h, "/v1/onboarding/store", map[string]any{
		"name": "Me Shop",
		"bio":  "After onboarding seller me merchant should resolve membership.",
		"slug": fmt.Sprintf("me-shop-%d", time.Now().UnixNano()%1000000),
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("create %d %s", rr.Code, rr.Body.String())
	}

	rr = jsonGET(t, h, "/v1/seller/me/merchant", []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("post-onboard %d %s", rr.Code, rr.Body.String())
	}
}
