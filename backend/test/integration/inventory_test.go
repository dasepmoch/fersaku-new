//go:build integration

package integration_test

import (
	"fmt"
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
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

func newInventoryStack(t *testing.T) (http.Handler, *application.InventoryService, *mail.Capture) {
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
	inv := &application.InventoryService{
		Store:         postgres.NewInventoryRepo(pool.Pool()),
		IDs:           ids,
		Clock:         observability.SystemClock{},
		Log:           observability.NewSlogLogger("error", "test"),
		EncryptionKey: "test-stock-encryption-key-32bytes!",
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
		InventoryService:  inv,
		RateLimiter:       nil,
		RequestTimeout:    30 * time.Second,
	})
	return h, inv, capture
}

func createCodeProduct(t *testing.T, h http.Handler, cookie *http.Cookie, storeID string) string {
	t.Helper()
	slug := fmt.Sprintf("code-%d", time.Now().UnixNano()%1_000_000_000)
	rr := jsonPOST(t, h, "/v1/stores/"+storeID+"/products", map[string]any{
		"title": "Code Product",
		"slug":  slug,
		"price": 25000,
		"type":  "code",
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusCreated {
		t.Fatalf("create product %d %s", rr.Code, rr.Body.String())
	}
	prod := envelopeData(t, rr)
	productID, _ := prod["id"].(string)
	rr = jsonPOST(t, h, "/v1/stores/"+storeID+"/products/"+productID+"/publish", map[string]any{}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("publish %d %s", rr.Code, rr.Body.String())
	}
	return productID
}

func putSchemaV1(t *testing.T, h http.Handler, cookie *http.Cookie, storeID, productID string) int32 {
	t.Helper()
	rr := jsonPUT(t, h, "/v1/stores/"+storeID+"/inventory/products/"+productID+"/schema", map[string]any{
		"fields": []map[string]any{
			{"key": "code", "label": "Code", "secret": true, "required": true, "unique": true, "buyerCopyable": true},
			{"key": "note", "label": "Note", "secret": false, "required": false},
		},
		"delimiter": ",",
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("put schema %d %s", rr.Code, rr.Body.String())
	}
	data := envelopeData(t, rr)
	ver := int32(data["version"].(float64))
	if ver != 1 {
		t.Fatalf("version=%v", data["version"])
	}
	return ver
}

func TestInventory_SchemaImportListRevealMask(t *testing.T) {
	h, _, capture := newInventoryStack(t)
	cookie, storeID, _ := onboardSellerStore(t, h, capture)
	productID := createCodeProduct(t, h, cookie, storeID)
	ver := putSchemaV1(t, h, cookie, storeID, productID)

	// Schema conflict: expected missing when version already active
	rr := jsonPUT(t, h, "/v1/stores/"+storeID+"/inventory/products/"+productID+"/schema", map[string]any{
		"fields": []map[string]any{
			{"key": "code", "label": "Code", "secret": true, "required": true},
		},
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusConflict {
		t.Fatalf("schema conflict want 409 got %d %s", rr.Code, rr.Body.String())
	}

	// Import with wrong schema version rejected
	rr = jsonPOST(t, h, "/v1/stores/"+storeID+"/inventory/products/"+productID+"/items", map[string]any{
		"expectedSchemaVersion": ver + 1,
		"items":                 []map[string]string{{"code": "SECRET-A", "note": "n1"}},
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusConflict {
		t.Fatalf("stale import want 409 got %d %s", rr.Code, rr.Body.String())
	}

	// Import one unit
	rr = jsonPOST(t, h, "/v1/stores/"+storeID+"/inventory/products/"+productID+"/items", map[string]any{
		"expectedSchemaVersion": ver,
		"items": []map[string]string{
			{"code": "SECRET-ABC-999", "note": "buyer note"},
		},
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusCreated {
		t.Fatalf("import %d %s", rr.Code, rr.Body.String())
	}
	imp := envelopeData(t, rr)
	ids, _ := imp["itemIds"].([]any)
	if len(ids) != 1 {
		t.Fatalf("itemIds=%v", ids)
	}
	itemID, _ := ids[0].(string)

	// List product inventory — secrets masked
	rr = jsonGET(t, h, "/v1/stores/"+storeID+"/inventory/products/"+productID, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("get product inv %d %s", rr.Code, rr.Body.String())
	}
	body := rr.Body.String()
	if strings.Contains(body, "SECRET-ABC-999") {
		t.Fatalf("list leaked secret: %s", body)
	}
	detail := envelopeData(t, rr)
	items, _ := detail["items"].([]any)
	if len(items) != 1 {
		t.Fatalf("items=%v", items)
	}
	item0, _ := items[0].(map[string]any)
	masked, _ := item0["masked"].(map[string]any)
	if masked["code"] != "***" {
		t.Fatalf("masked code=%v", masked["code"])
	}
	if masked["note"] != "buyer note" {
		t.Fatalf("masked note=%v", masked["note"])
	}

	// Reveal returns secret once with no-store
	rr = jsonPOST(t, h, "/v1/stores/"+storeID+"/inventory/items/"+itemID+"/reveal", map[string]any{
		"reason":      "seller support ticket #1",
		"mfaVerified": true,
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("reveal %d %s", rr.Code, rr.Body.String())
	}
	cc := rr.Header().Get("Cache-Control")
	if !strings.Contains(cc, "no-store") {
		t.Fatalf("Cache-Control=%q want no-store", cc)
	}
	rev := envelopeData(t, rr)
	secrets, _ := rev["secrets"].(map[string]any)
	if secrets["code"] != "SECRET-ABC-999" {
		t.Fatalf("secrets=%v", secrets)
	}

	// List still masked after reveal
	rr = jsonGET(t, h, "/v1/stores/"+storeID+"/inventory/products/"+productID, []*http.Cookie{cookie})
	if strings.Contains(rr.Body.String(), "SECRET-ABC-999") {
		t.Fatal("list leaked secret after reveal")
	}
}

func TestInventory_ConcurrentReserveLastUnit(t *testing.T) {
	h, inv, capture := newInventoryStack(t)
	cookie, storeID, _ := onboardSellerStore(t, h, capture)
	productID := createCodeProduct(t, h, cookie, storeID)
	ver := putSchemaV1(t, h, cookie, storeID, productID)

	rr := jsonPOST(t, h, "/v1/stores/"+storeID+"/inventory/products/"+productID+"/items", map[string]any{
		"expectedSchemaVersion": ver,
		"items":                 []map[string]string{{"code": "ONLY-ONE", "note": "x"}},
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusCreated {
		t.Fatalf("import %d %s", rr.Code, rr.Body.String())
	}

	const n = 8
	var okCount, failCount atomic.Int64
	var wg sync.WaitGroup
	wg.Add(n)
	for i := 0; i < n; i++ {
		i := i
		go func() {
			defer wg.Done()
			orderID := fmt.Sprintf("ord-%d-%d", time.Now().UnixNano(), i)
			idem := fmt.Sprintf("idem-%d-%d", time.Now().UnixNano(), i)
			req := httptest.NewRequest(http.MethodPost, "/v1/checkout/stock-reservations", mustJSON(t, map[string]any{
				"storeId":    storeID,
				"productId":  productID,
				"orderId":    orderID,
				"checkoutId": "chk-" + orderID,
			}))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Idempotency-Key", idem)
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if rec.Code == http.StatusCreated || rec.Code == http.StatusOK {
				okCount.Add(1)
			} else {
				failCount.Add(1)
			}
		}()
	}
	wg.Wait()
	if okCount.Load() != 1 {
		t.Fatalf("winners=%d losers=%d want 1 winner", okCount.Load(), failCount.Load())
	}
	if failCount.Load() != n-1 {
		t.Fatalf("losers=%d want %d", failCount.Load(), n-1)
	}

	// Service-level further reserve fails
	_, err := inv.ReserveStock(t.Context(), application.ReserveStockRequest{
		StoreID:        storeID,
		ProductID:      productID,
		OrderID:        "ord-extra",
		IdempotencyKey: "idem-extra",
	})
	if err == nil {
		t.Fatal("expected out of stock")
	}
	if ae, ok := apperr.AsAppError(err); !ok || ae.Code != apperr.CodeInventoryOutOfStock {
		t.Fatalf("err=%v", err)
	}
}

func TestInventory_AllocateOnFulfillmentAndRevoke(t *testing.T) {
	h, inv, capture := newInventoryStack(t)
	cookie, storeID, _ := onboardSellerStore(t, h, capture)
	productID := createCodeProduct(t, h, cookie, storeID)
	ver := putSchemaV1(t, h, cookie, storeID, productID)

	rr := jsonPOST(t, h, "/v1/stores/"+storeID+"/inventory/products/"+productID+"/items", map[string]any{
		"expectedSchemaVersion": ver,
		"items":                 []map[string]string{{"code": "DELIVER-ME", "note": "n"}},
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusCreated {
		t.Fatalf("import %d %s", rr.Code, rr.Body.String())
	}
	itemID := envelopeData(t, rr)["itemIds"].([]any)[0].(string)

	res, err := inv.ReserveStock(t.Context(), application.ReserveStockRequest{
		StoreID:        storeID,
		ProductID:      productID,
		OrderID:        "ord-fulfill-1",
		IdempotencyKey: "idem-fulfill-1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Item.ID != itemID {
		t.Fatalf("item=%s want %s", res.Item.ID, itemID)
	}
	_, item, err := inv.AllocateOnFulfillment(t.Context(), res.Reservation.ID)
	if err != nil {
		t.Fatal(err)
	}
	if item.Status != "DELIVERED" {
		t.Fatalf("status=%s", item.Status)
	}
	// Idempotent allocate
	_, item2, err := inv.AllocateOnFulfillment(t.Context(), res.Reservation.ID)
	if err != nil {
		t.Fatal(err)
	}
	if item2.Status != "DELIVERED" {
		t.Fatalf("status2=%s", item2.Status)
	}

	// New unit for revoke
	rr = jsonPOST(t, h, "/v1/stores/"+storeID+"/inventory/products/"+productID+"/items", map[string]any{
		"expectedSchemaVersion": ver,
		"items":                 []map[string]string{{"code": "REVOKE-ME", "note": "n"}},
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusCreated {
		t.Fatalf("import2 %d %s", rr.Code, rr.Body.String())
	}
	item2ID := envelopeData(t, rr)["itemIds"].([]any)[0].(string)
	rr = jsonPOST(t, h, "/v1/stores/"+storeID+"/inventory/items/"+item2ID+"/revoke", map[string]any{
		"reason": "compromised",
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("revoke %d %s", rr.Code, rr.Body.String())
	}
	if envelopeData(t, rr)["status"] != "REVOKED" {
		t.Fatalf("status=%v", envelopeData(t, rr)["status"])
	}
	// Reveal revoked denied
	rr = jsonPOST(t, h, "/v1/stores/"+storeID+"/inventory/items/"+item2ID+"/reveal", map[string]any{
		"reason": "should fail",
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusForbidden {
		t.Fatalf("reveal revoked want 403 got %d %s", rr.Code, rr.Body.String())
	}
}

func TestInventory_SchemaVersionBump(t *testing.T) {
	h, _, capture := newInventoryStack(t)
	cookie, storeID, _ := onboardSellerStore(t, h, capture)
	productID := createCodeProduct(t, h, cookie, storeID)
	ver := putSchemaV1(t, h, cookie, storeID, productID)

	rr := jsonPUT(t, h, "/v1/stores/"+storeID+"/inventory/products/"+productID+"/schema", map[string]any{
		"expectedVersion": ver,
		"fields": []map[string]any{
			{"key": "code", "label": "Code", "secret": true, "required": true, "unique": true},
			{"key": "pin", "label": "PIN", "secret": true, "required": true},
		},
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("put schema v2 %d %s", rr.Code, rr.Body.String())
	}
	if envelopeData(t, rr)["version"].(float64) != 2 {
		t.Fatalf("version=%v", envelopeData(t, rr)["version"])
	}
	// Stale expected
	rr = jsonPUT(t, h, "/v1/stores/"+storeID+"/inventory/products/"+productID+"/schema", map[string]any{
		"expectedVersion": ver,
		"fields": []map[string]any{
			{"key": "code", "label": "Code", "secret": true, "required": true},
		},
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusConflict {
		t.Fatalf("stale expected want 409 got %d", rr.Code)
	}
}


