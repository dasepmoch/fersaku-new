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
)

func newBuyerStack(t *testing.T) (http.Handler, *mail.Capture) {
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
	del := &application.DeliveryService{
		Store:         postgres.NewDeliveryRepo(pool.Pool()),
		IDs:           ids,
		Clock:         observability.SystemClock{},
		Log:           observability.NewSlogLogger("error", "test"),
		EncryptionKey: "test-stock-encryption-key-32bytes!",
		TokenSecret:   "test-session-secret-not-for-prod",
	}
	buyer := &application.BuyerService{
		Purchases: postgres.NewBuyerRepo(pool.Pool()),
		Auth:      authSvc,
		IDs:       ids,
		Clock:     observability.SystemClock{},
		Log:       observability.NewSlogLogger("error", "test"),
	}
	reviews := &application.ReviewService{
		Store: postgres.NewReviewRepo(pool.Pool()),
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
		InventoryService:  inv,
		DeliveryService:   del,
		BuyerService:      buyer,
		ReviewService:     reviews,
		RateLimiter:       nil,
		RequestTimeout:    30 * time.Second,
	})
	return h, capture
}

func buyerUserID(t *testing.T, h http.Handler, cookie *http.Cookie) string {
	t.Helper()
	rr := jsonGET(t, h, "/v1/auth/session", []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("session %d %s", rr.Code, rr.Body.String())
	}
	sess := envelopeData(t, rr)
	id, _ := sess["userId"].(string)
	if id == "" {
		if u, ok := sess["user"].(map[string]any); ok {
			id, _ = u["id"].(string)
		}
	}
	if id == "" {
		t.Fatalf("buyer id missing: %v", sess)
	}
	return id
}

func createPaidPurchase(t *testing.T, h http.Handler, sellerCookie *http.Cookie, storeID, productID, stockItemID, buyerID, buyerEmail string) (orderID, orderItemID, publicCode string) {
	t.Helper()
	rr := jsonPOST(t, h, "/v1/_test/paid-orders", map[string]any{
		"storeId":     storeID,
		"productId":   productID,
		"buyerUserId": buyerID,
		"buyerEmail":  buyerEmail,
		"buyerName":   "Buyer",
		"stockItemId": stockItemID,
		"quantity":    1,
	}, []*http.Cookie{sellerCookie})
	if rr.Code != http.StatusCreated {
		t.Fatalf("paid stub %d %s", rr.Code, rr.Body.String())
	}
	paid := envelopeData(t, rr)
	orderID, _ = paid["orderId"].(string)
	orderItemID, _ = paid["orderItemId"].(string)
	publicCode, _ = paid["publicCode"].(string)
	if orderID == "" || orderItemID == "" {
		t.Fatalf("paid incomplete: %v", paid)
	}
	return orderID, orderItemID, publicCode
}

func TestBuyer_OwnershipIsolationAndPublicInvoicePrivacy(t *testing.T) {
	h, capture := newBuyerStack(t)
	sellerCookie, storeID, _ := onboardSellerStore(t, h, capture)
	productID, stockItemID := setupCodeProductWithStock(t, h, sellerCookie, storeID)

	buyerACookie, buyerAEmail := createBuyer(t, h, capture)
	buyerAID := buyerUserID(t, h, buyerACookie)
	orderID, _, publicCode := createPaidPurchase(t, h, sellerCookie, storeID, productID, stockItemID, buyerAID, buyerAEmail)

	// Buyer A can list and get purchase
	rr := jsonGET(t, h, "/v1/buyer/purchases", []*http.Cookie{buyerACookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("list purchases A %d %s", rr.Code, rr.Body.String())
	}
	listItems, _ := parseListEnvelope(t, rr)
	found := false
	for _, it := range listItems {
		if it["orderId"] == orderID {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("order %s not in purchase list: %#v", orderID, listItems)
	}
	rr = jsonGET(t, h, "/v1/buyer/purchases/"+orderID, []*http.Cookie{buyerACookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("get purchase A %d %s", rr.Code, rr.Body.String())
	}
	detail := envelopeData(t, rr)
	if detail["orderId"] != orderID {
		t.Fatalf("detail orderId=%v", detail["orderId"])
	}

	// Buyer B cannot access buyer A order
	buyerBCookie, _ := createBuyer(t, h, capture)
	rr = jsonGET(t, h, "/v1/buyer/purchases/"+orderID, []*http.Cookie{buyerBCookie})
	if rr.Code != http.StatusNotFound {
		t.Fatalf("cross-buyer get want 404 got %d %s", rr.Code, rr.Body.String())
	}
	rr = jsonPOST(t, h, "/v1/buyer/purchases/"+orderID+"/delivery/access", map[string]any{}, []*http.Cookie{buyerBCookie})
	if rr.Code != http.StatusNotFound {
		t.Fatalf("cross-buyer access want 404 got %d %s", rr.Code, rr.Body.String())
	}
	rr = jsonGET(t, h, "/v1/buyer/purchases/"+orderID+"/invoice", []*http.Cookie{buyerBCookie})
	if rr.Code != http.StatusNotFound {
		t.Fatalf("cross-buyer invoice want 404 got %d %s", rr.Code, rr.Body.String())
	}

	// Public invoice verify: safe fields only
	rr = jsonGET(t, h, "/v1/invoices/verify/"+publicCode, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("public verify %d %s", rr.Code, rr.Body.String())
	}
	pub := envelopeData(t, rr)
	for _, leak := range []string{"buyerEmail", "buyerName", "buyerUserId", "secrets", "accessToken"} {
		if _, ok := pub[leak]; ok {
			t.Fatalf("public verify leaked %s: %v", leak, pub)
		}
	}
	if strings.Contains(rr.Body.String(), buyerAEmail) {
		t.Fatal("public verify body contains buyer email")
	}
	if pub["invoiceNumber"] == nil && pub["orderNumber"] == nil {
		t.Fatalf("public verify missing safe fields: %v", pub)
	}
}

func TestBuyer_ProfileAndSessionsAlias(t *testing.T) {
	h, capture := newBuyerStack(t)
	cookie, _ := createBuyer(t, h, capture)

	rr := jsonGET(t, h, "/v1/buyer/profile", []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("buyer profile %d %s", rr.Code, rr.Body.String())
	}
	prof := envelopeData(t, rr)
	ver := int64(prof["version"].(float64))
	name := fmt.Sprintf("Buyer-%d", time.Now().UnixNano())
	rr = jsonPATCH(t, h, "/v1/buyer/profile", map[string]any{
		"expectedVersion": ver,
		"displayName":     name,
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("patch profile %d %s", rr.Code, rr.Body.String())
	}
	if envelopeData(t, rr)["displayName"] != name {
		t.Fatalf("displayName not updated")
	}

	rr = jsonGET(t, h, "/v1/buyer/sessions", []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("buyer sessions %d %s", rr.Code, rr.Body.String())
	}
	sess := envelopeData(t, rr)
	sessions, _ := sess["sessions"].([]any)
	if len(sessions) < 1 {
		t.Fatalf("expected sessions: %v", sess)
	}
}

func TestBuyer_ReviewEligibilityPaidDeliveryOnly(t *testing.T) {
	h, capture := newBuyerStack(t)
	sellerCookie, storeID, _ := onboardSellerStore(t, h, capture)
	productID, stockItemID := setupCodeProductWithStock(t, h, sellerCookie, storeID)

	buyerCookie, buyerEmail := createBuyer(t, h, capture)
	buyerID := buyerUserID(t, h, buyerCookie)
	orderID, orderItemID, _ := createPaidPurchase(t, h, sellerCookie, storeID, productID, stockItemID, buyerID, buyerEmail)

	// Review without delivery eligibility path: use fake unpaid order item id
	rr := jsonPOST(t, h, "/v1/buyer/reviews", map[string]any{
		"orderItemId": "nonexistent-item",
		"rating":      5,
		"title":       "Great",
		"body":        "Works",
	}, []*http.Cookie{buyerCookie})
	if rr.Code != http.StatusNotFound {
		t.Fatalf("review missing item want 404 got %d %s", rr.Code, rr.Body.String())
	}

	// Eligible create after paid+delivered grant
	rr = jsonPOST(t, h, "/v1/buyer/reviews", map[string]any{
		"orderItemId": orderItemID,
		"rating":      5,
		"title":       "Verified",
		"body":        "Delivered product works",
	}, []*http.Cookie{buyerCookie})
	if rr.Code != http.StatusCreated {
		t.Fatalf("create review %d %s", rr.Code, rr.Body.String())
	}
	rev := envelopeData(t, rr)
	if rev["verifiedPurchase"] != true {
		t.Fatalf("verifiedPurchase=%v", rev["verifiedPurchase"])
	}
	if rev["productId"] != productID {
		t.Fatalf("productId=%v want %s", rev["productId"], productID)
	}
	reviewID, _ := rev["id"].(string)

	// Duplicate rejected
	rr = jsonPOST(t, h, "/v1/buyer/reviews", map[string]any{
		"orderItemId": orderItemID,
		"rating":      4,
		"title":       "Again",
		"body":        "No",
	}, []*http.Cookie{buyerCookie})
	if rr.Code != http.StatusConflict {
		t.Fatalf("dup review want 409 got %d %s", rr.Code, rr.Body.String())
	}

	// Public list includes published review
	rr = jsonGET(t, h, "/v1/public/products/"+productID+"/reviews", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("public reviews %d %s", rr.Code, rr.Body.String())
	}
	rr = jsonGET(t, h, "/v1/public/products/"+productID+"/reviews/summary", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("public summary %d %s", rr.Code, rr.Body.String())
	}
	sum := envelopeData(t, rr)
	if int64(sum["count"].(float64)) < 1 {
		t.Fatalf("summary count=%v", sum["count"])
	}

	// Patch own review
	ver := int32(rev["contentVersion"].(float64))
	rr = jsonPATCH(t, h, "/v1/buyer/reviews/"+reviewID, map[string]any{
		"expectedVersion": ver,
		"rating":          4,
		"body":            "Updated body",
	}, []*http.Cookie{buyerCookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("patch review %d %s", rr.Code, rr.Body.String())
	}

	// Other buyer cannot patch
	otherCookie, _ := createBuyer(t, h, capture)
	rr = jsonPATCH(t, h, "/v1/buyer/reviews/"+reviewID, map[string]any{
		"expectedVersion": ver + 1,
		"body":            "Hijack",
	}, []*http.Cookie{otherCookie})
	if rr.Code != http.StatusNotFound {
		t.Fatalf("cross patch want 404 got %d %s", rr.Code, rr.Body.String())
	}

	// Client product mismatch rejected
	productID2, stock2 := setupCodeProductWithStock(t, h, sellerCookie, storeID)
	_, orderItem2, _ := createPaidPurchase(t, h, sellerCookie, storeID, productID2, stock2, buyerID, buyerEmail)
	wrong := productID
	rr = jsonPOST(t, h, "/v1/buyer/reviews", map[string]any{
		"orderItemId": orderItem2,
		"productId":   wrong,
		"rating":      3,
		"body":        "Mismatch",
	}, []*http.Cookie{buyerCookie})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("product mismatch want 400 got %d %s", rr.Code, rr.Body.String())
	}

	_ = orderID
}

func TestBuyer_ReviewRejectedWithoutActiveDelivery(t *testing.T) {
	h, capture := newBuyerStack(t)
	sellerCookie, storeID, _ := onboardSellerStore(t, h, capture)
	productID, stockItemID := setupCodeProductWithStock(t, h, sellerCookie, storeID)
	buyerCookie, buyerEmail := createBuyer(t, h, capture)
	buyerID := buyerUserID(t, h, buyerCookie)
	orderID, orderItemID, _ := createPaidPurchase(t, h, sellerCookie, storeID, productID, stockItemID, buyerID, buyerEmail)

	// Revoke delivery grant
	rr := jsonPOST(t, h, "/v1/stores/"+storeID+"/orders/"+orderID+"/delivery/revoke", map[string]any{
		"reason": "fraud review",
	}, []*http.Cookie{sellerCookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("revoke %d %s", rr.Code, rr.Body.String())
	}

	rr = jsonPOST(t, h, "/v1/buyer/reviews", map[string]any{
		"orderItemId": orderItemID,
		"rating":      5,
		"body":        "Should fail after revoke",
	}, []*http.Cookie{buyerCookie})
	if rr.Code != http.StatusForbidden {
		t.Fatalf("review after revoke want 403 got %d %s", rr.Code, rr.Body.String())
	}
}
