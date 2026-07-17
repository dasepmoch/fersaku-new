//go:build integration

package integration_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	httpadapter "github.com/dasepmoch/fersaku-new/backend/internal/adapters/http"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/mail"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/observability"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/config"
)

func newCatalogStack(t *testing.T) (http.Handler, *application.AuthService, *application.CatalogService, *mail.Capture, *postgres.Pool) {
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
	catalog := &application.CatalogService{
		Store: postgres.NewCatalogRepo(pool.Pool()),
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
		CatalogService:    catalog,
		RateLimiter:       nil,
		RequestTimeout:    10 * time.Second,
	})
	return h, authSvc, catalog, capture, pool
}

func jsonPUT(t *testing.T, h http.Handler, path string, body any, cookies []*http.Cookie) *httptest.ResponseRecorder {
	t.Helper()
	b, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPut, path, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	for _, c := range cookies {
		req.AddCookie(c)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func envelopeAny(t *testing.T, rr *httptest.ResponseRecorder) any {
	t.Helper()
	var env struct {
		Data any `json:"data"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &env); err != nil {
		t.Fatalf("json: %v body=%s", err, rr.Body.String())
	}
	return env.Data
}

func onboardSellerStore(t *testing.T, h http.Handler, capture *mail.Capture) (cookie *http.Cookie, storeID, slug string) {
	t.Helper()
	email := fmt.Sprintf("cat-seller-%d@example.com", time.Now().UnixNano())
	cookie = registerVerifyLogin(t, h, capture, email, "password123", "SELLER")
	slug = fmt.Sprintf("cat-%d", time.Now().UnixNano()%1_000_000)
	rr := jsonPOST(t, h, "/v1/onboarding/store", map[string]any{
		"name": "Catalog Shop",
		"bio":  "Digital products for catalog integration tests and storefront.",
		"slug": slug,
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("onboard store %d %s", rr.Code, rr.Body.String())
	}
	data := envelopeData(t, rr)
	storeID, _ = data["storeId"].(string)
	if storeID == "" {
		t.Fatalf("missing storeId: %v", data)
	}
	rr = jsonPOST(t, h, "/v1/onboarding/complete", map[string]any{"skipProduct": true}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("complete %d %s", rr.Code, rr.Body.String())
	}
	return cookie, storeID, slug
}

func TestCatalog_ProductCRUDPublishArchiveAndPublicVisibility(t *testing.T) {
	h, _, _, capture, _ := newCatalogStack(t)
	cookie, storeID, slug := onboardSellerStore(t, h, capture)

	// Reject float price
	rr := jsonPOST(t, h, "/v1/stores/"+storeID+"/products", map[string]any{
		"title": "Float Bad",
		"price": 12.5,
		"type":  "download",
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("float price want 400 got %d %s", rr.Code, rr.Body.String())
	}

	// Reject negative
	rr = jsonPOST(t, h, "/v1/stores/"+storeID+"/products", map[string]any{
		"title": "Neg",
		"price": -1000,
		"type":  "download",
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("negative price want 400 got %d %s", rr.Code, rr.Body.String())
	}

	// Create draft
	rr = jsonPOST(t, h, "/v1/stores/"+storeID+"/products", map[string]any{
		"title":       "Notion OS Pack",
		"slug":        "notion-os",
		"short":       "Starter templates",
		"description": "Full description for the product.",
		"price":       99000,
		"type":        "download",
		"palette":     "violet",
		"glyph":       "N",
		"includes":    []string{"Templates", "Guides"},
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusCreated {
		t.Fatalf("create %d %s", rr.Code, rr.Body.String())
	}
	prod := envelopeData(t, rr)
	productID, _ := prod["id"].(string)
	if productID == "" {
		t.Fatalf("no id: %v", prod)
	}
	// price must be JSON number (int)
	switch prod["price"].(type) {
	case float64:
		if prod["price"].(float64) != 99000 {
			t.Fatalf("price=%v", prod["price"])
		}
	default:
		t.Fatalf("price type %T", prod["price"])
	}
	if prod["status"] != "draft" {
		t.Fatalf("status=%v", prod["status"])
	}

	// Draft not on public storefront
	rr = jsonGET(t, h, "/v1/public/stores/"+slug, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("public store %d %s", rr.Code, rr.Body.String())
	}
	pub := envelopeData(t, rr)
	products, _ := pub["products"].([]any)
	if len(products) != 0 {
		t.Fatalf("public should hide draft, got %v", products)
	}

	// Publish
	rr = jsonPOST(t, h, "/v1/stores/"+storeID+"/products/"+productID+"/publish", map[string]any{}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("publish %d %s", rr.Code, rr.Body.String())
	}
	pubRes := envelopeData(t, rr)
	if pubRes["accepted"] != true {
		t.Fatalf("publish not accepted: %v", pubRes)
	}

	// Public sees product
	rr = jsonGET(t, h, "/v1/public/stores/"+slug, nil)
	pub = envelopeData(t, rr)
	products, _ = pub["products"].([]any)
	if len(products) != 1 {
		t.Fatalf("want 1 published product got %v", products)
	}
	rr = jsonGET(t, h, "/v1/public/products/notion-os", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("public by slug %d %s", rr.Code, rr.Body.String())
	}
	rr = jsonGET(t, h, "/v1/public/products/featured?limit=5", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("featured %d %s", rr.Code, rr.Body.String())
	}
	feat := envelopeAny(t, rr)
	featArr, ok := feat.([]any)
	if !ok || len(featArr) < 1 {
		t.Fatalf("featured empty: %v", feat)
	}

	// Slug uniqueness per store
	rr = jsonPOST(t, h, "/v1/stores/"+storeID+"/products", map[string]any{
		"title": "Dup",
		"slug":  "notion-os",
		"price": 5000,
		"type":  "link",
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusConflict {
		t.Fatalf("slug conflict want 409 got %d %s", rr.Code, rr.Body.String())
	}

	// Archive hides from public
	rr = jsonPOST(t, h, "/v1/stores/"+storeID+"/products/"+productID+"/archive", map[string]any{}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("archive %d %s", rr.Code, rr.Body.String())
	}
	rr = jsonGET(t, h, "/v1/public/products/"+productID, nil)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("archived public want 404 got %d %s", rr.Code, rr.Body.String())
	}
}

func TestCatalog_StorefrontRevisionConflict(t *testing.T) {
	h, _, _, capture, _ := newCatalogStack(t)
	cookie, storeID, slug := onboardSellerStore(t, h, capture)

	// Seed draft
	rr := jsonPUT(t, h, "/v1/stores/"+storeID+"/storefront/draft", map[string]any{
		"config": map[string]any{
			"layout":  "editorial",
			"tagline": "First draft",
			"accent":  "#112233",
		},
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("put draft %d %s", rr.Code, rr.Body.String())
	}
	draft := envelopeData(t, rr)
	revF, _ := draft["revision"].(float64)
	etag, _ := draft["etag"].(string)
	rev := int32(revF)
	if etag == "" || rev < 1 {
		t.Fatalf("draft meta: %v", draft)
	}

	// Publish with correct expected revision
	rr = jsonPOST(t, h, "/v1/stores/"+storeID+"/storefront/publish", map[string]any{
		"expectedRevision": rev,
		"expectedETag":     etag,
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("publish ok %d %s", rr.Code, rr.Body.String())
	}
	pub := envelopeData(t, rr)
	if pub["accepted"] != true {
		t.Fatalf("not accepted: %v", pub)
	}
	if int32(pub["revision"].(float64)) != rev {
		t.Fatalf("published revision=%v want %d", pub["revision"], rev)
	}

	// Stale publish → STOREFRONT_REVISION_CONFLICT
	rr = jsonPOST(t, h, "/v1/stores/"+storeID+"/storefront/publish", map[string]any{
		"expectedRevision": rev,
		"expectedETag":     etag,
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusConflict {
		t.Fatalf("stale publish want 409 got %d %s", rr.Code, rr.Body.String())
	}
	if code := problemCode(t, rr); code != "STOREFRONT_REVISION_CONFLICT" {
		t.Fatalf("code=%s", code)
	}

	// Public storefront reflects config
	rr = jsonGET(t, h, "/v1/public/stores/"+slug, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("public %d %s", rr.Code, rr.Body.String())
	}
	sf := envelopeData(t, rr)
	if sf["layout"] != "editorial" {
		t.Fatalf("layout=%v", sf["layout"])
	}
	if sf["tagline"] != "First draft" {
		t.Fatalf("tagline=%v", sf["tagline"])
	}
}

func TestCatalog_CrossTenantProductNotFound(t *testing.T) {
	h, _, _, capture, _ := newCatalogStack(t)
	cookieA, storeA, _ := onboardSellerStore(t, h, capture)
	cookieB, _, _ := onboardSellerStore(t, h, capture)

	rr := jsonPOST(t, h, "/v1/stores/"+storeA+"/products", map[string]any{
		"title": "Private",
		"slug":  "private-item",
		"price": 25000,
		"type":  "code",
	}, []*http.Cookie{cookieA})
	if rr.Code != http.StatusCreated {
		t.Fatalf("create %d %s", rr.Code, rr.Body.String())
	}
	prodID, _ := envelopeData(t, rr)["id"].(string)

	// Other seller cannot read
	rr = jsonGET(t, h, "/v1/stores/"+storeA+"/products/"+prodID, []*http.Cookie{cookieB})
	if rr.Code != http.StatusNotFound {
		t.Fatalf("cross-tenant want 404 got %d %s", rr.Code, rr.Body.String())
	}
}
