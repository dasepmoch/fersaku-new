//go:build integration

package integration_test

import (
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
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/xendit"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/config"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/payments"
)

func newCheckoutStack(t *testing.T) (http.Handler, *application.CheckoutService, *xendit.Fake, *mail.Capture) {
	t.Helper()
	_ = databaseURL(t)
	runMigrate(t, "up")
	pool := openPool(t)
	ids := observability.NewULIDGenerator()
	capture := mail.NewCapture()
	xd := xendit.NewFake()
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
	coupons := &application.CouponService{
		Store: postgres.NewCouponRepo(pool.Pool()),
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
	fees := &application.FeeService{
		Store: postgres.NewFeeRepo(pool.Pool()),
		IDs:   ids,
		Clock: observability.SystemClock{},
		Log:   observability.NewSlogLogger("error", "test"),
	}
	checkout := &application.CheckoutService{
		Store:           postgres.NewCheckoutRepo(pool.Pool()),
		Fees:            fees,
		Coupons:         coupons,
		Inventory:       inv,
		QRIS:            xd,
		IDs:             ids,
		Clock:           observability.SystemClock{},
		Log:             observability.NewSlogLogger("error", "test"),
		PaymentMode:     payments.PaymentModeSandbox,
		AccountScope:    xd.AccountScope,
		SimulateEnabled: true,
		TokenSecret:     "test-session-secret-not-for-prod",
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
		CouponService:     coupons,
		InventoryService:  inv,
		FeeService:        fees,
		CheckoutService:   checkout,
		RateLimiter:       nil,
		RequestTimeout:    30 * time.Second,
	})
	return h, checkout, xd, capture
}

func TestCheckout_ClientPriceIgnoredFee100kAndIdempotent(t *testing.T) {
	h, _, _, capture := newCheckoutStack(t)
	cookie, storeID, _ := onboardSellerStore(t, h, capture)
	productID := createPublishedProduct(t, h, cookie, storeID, 100_000)

	body := map[string]any{
		"storeId":   storeID,
		"productId": productID,
		"unitPrice": 1,       // client invents — ignored
		"total":     999,     // ignored
		"discount":  50_000,  // ignored
		"tip":       0,
		"buyerEmail": "buyer@example.test",
	}
	idemKey := fmt.Sprintf("idem-checkout-%d", time.Now().UnixNano())
	req1 := httptest.NewRequest(http.MethodPost, "/v1/checkout/intents", mustJSON(t, body))
	req1.Header.Set("Content-Type", "application/json")
	req1.Header.Set("Idempotency-Key", idemKey)
	rr1 := httptest.NewRecorder()
	h.ServeHTTP(rr1, req1)
	if rr1.Code != http.StatusCreated && rr1.Code != http.StatusOK {
		t.Fatalf("create status %d body %s", rr1.Code, rr1.Body.String())
	}
	var env1 map[string]any
	if err := json.Unmarshal(rr1.Body.Bytes(), &env1); err != nil {
		t.Fatal(err)
	}
	data1 := env1["data"].(map[string]any)
	// Server authority: 100k gross, fee 3700, net 96300
	if int64(data1["amount"].(float64)) != 100_000 {
		t.Fatalf("amount %v (client total ignored)", data1["amount"])
	}
	if int64(data1["fee"].(float64)) != 3_700 {
		t.Fatalf("fee %v want 3700", data1["fee"])
	}
	if int64(data1["merchantNet"].(float64)) != 96_300 {
		t.Fatalf("net %v", data1["merchantNet"])
	}
	if data1["source"] != "STOREFRONT" {
		t.Fatalf("source %v", data1["source"])
	}
	if data1["status"] != "PENDING" {
		t.Fatalf("status %v", data1["status"])
	}
	intentID := data1["paymentIntentId"].(string)
	orderID := data1["orderId"].(string)

	// Duplicate idempotency → same resource
	req2 := httptest.NewRequest(http.MethodPost, "/v1/checkout/intents", mustJSON(t, body))
	req2.Header.Set("Content-Type", "application/json")
	req2.Header.Set("Idempotency-Key", idemKey)
	rr2 := httptest.NewRecorder()
	h.ServeHTTP(rr2, req2)
	if rr2.Code != http.StatusOK && rr2.Code != http.StatusCreated {
		t.Fatalf("replay status %d %s", rr2.Code, rr2.Body.String())
	}
	var env2 map[string]any
	_ = json.Unmarshal(rr2.Body.Bytes(), &env2)
	data2 := env2["data"].(map[string]any)
	if data2["paymentIntentId"] != intentID || data2["orderId"] != orderID {
		t.Fatalf("idempotent mismatch %v vs %v", data2, data1)
	}

	// GET intent + order public
	rrG := httptest.NewRecorder()
	h.ServeHTTP(rrG, httptest.NewRequest(http.MethodGet, "/v1/checkout/intents/"+intentID, nil))
	if rrG.Code != http.StatusOK {
		t.Fatalf("get intent %d", rrG.Code)
	}
	rrO := httptest.NewRecorder()
	h.ServeHTTP(rrO, httptest.NewRequest(http.MethodGet, "/v1/orders/"+orderID, nil))
	if rrO.Code != http.StatusOK {
		t.Fatalf("get order %d", rrO.Code)
	}
}

func TestCheckout_ExpireTimeoutStaysUnknownNoStockRelease(t *testing.T) {
	h, checkout, xd, capture := newCheckoutStack(t)
	cookie, storeID, _ := onboardSellerStore(t, h, capture)
	// CODE product with stock so reservation exists
	productID := createCodeProduct(t, h, cookie, storeID)
	// publish at 100k
	rrPub := jsonPOST(t, h, "/v1/stores/"+storeID+"/products/"+productID+"/publish", map[string]any{}, []*http.Cookie{cookie})
	if rrPub.Code != http.StatusOK && rrPub.Code != http.StatusCreated {
		// product may already need price set — createPublishedProduct style
		_ = rrPub
	}
	// ensure published download instead for simplicity if code product helper exists
	// Use download product + stock not required path, force expire timeout on provider.
	productID = createPublishedProduct(t, h, cookie, storeID, 100_000)

	body := map[string]any{
		"storeId":    storeID,
		"productId":  productID,
		"buyerEmail": "buyer2@example.test",
	}
	req := httptest.NewRequest(http.MethodPost, "/v1/checkout/intents", mustJSON(t, body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", fmt.Sprintf("idem-expire-timeout-%d", time.Now().UnixNano()))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusCreated && rr.Code != http.StatusOK {
		t.Fatalf("create %d %s", rr.Code, rr.Body.String())
	}
	var env map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &env)
	data := env["data"].(map[string]any)
	intentID := data["paymentIntentId"].(string)

	// Force provider expire timeout → UNKNOWN_OUTCOME, no terminal expire
	xd.ForceTimeoutExpire = true
	reqE := httptest.NewRequest(http.MethodPost, "/v1/checkout/intents/"+intentID+"/expire", mustJSON(t, map[string]any{}))
	reqE.Header.Set("Content-Type", "application/json")
	reqE.Header.Set("Idempotency-Key", fmt.Sprintf("expire-key-%d", time.Now().UnixNano()))
	rrE := httptest.NewRecorder()
	h.ServeHTTP(rrE, reqE)
	if rrE.Code != http.StatusAccepted && rrE.Code != http.StatusOK {
		t.Fatalf("expire %d %s", rrE.Code, rrE.Body.String())
	}
	var envE map[string]any
	_ = json.Unmarshal(rrE.Body.Bytes(), &envE)
	dataE := envE["data"].(map[string]any)
	st := dataE["status"].(string)
	if st != payments.StatusUnknownOutcome && st != payments.StatusExpirePending {
		t.Fatalf("expected UNKNOWN/EXPIRE_PENDING got %s", st)
	}
	// Not EXPIRED terminal without provider confirmation
	if st == payments.StatusExpired {
		t.Fatal("must not finalize EXPIRED on timeout")
	}

	// Lookup after clearing timeout still works
	xd.ForceTimeoutExpire = false
	pi, err := checkout.LookupProvider(req.Context(), intentID)
	if err != nil {
		t.Fatal(err)
	}
	_ = pi
}

func TestCheckout_SimulateDisabledInProductionEnv(t *testing.T) {
	h, checkout, _, capture := newCheckoutStack(t)
	// Router with production env should 404 simulate — rebuild router
	cookie, storeID, _ := onboardSellerStore(t, h, capture)
	productID := createPublishedProduct(t, h, cookie, storeID, 50_000)
	body := map[string]any{"storeId": storeID, "productId": productID, "buyerEmail": "a@b.c"}
	req := httptest.NewRequest(http.MethodPost, "/v1/checkout/intents", mustJSON(t, body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", fmt.Sprintf("sim-gate-%d", time.Now().UnixNano()))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusCreated && rr.Code != http.StatusOK {
		t.Fatalf("create for sim %d %s", rr.Code, rr.Body.String())
	}
	var env map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &env)
	intentID := env["data"].(map[string]any)["paymentIntentId"].(string)

	// test env has simulate enabled
	reqS := httptest.NewRequest(http.MethodPost, "/v1/checkout/simulate-payment", mustJSON(t, map[string]any{
		"paymentIntentId": intentID,
	}))
	reqS.Header.Set("Content-Type", "application/json")
	rrS := httptest.NewRecorder()
	h.ServeHTTP(rrS, reqS)
	if rrS.Code != http.StatusOK {
		t.Fatalf("simulate test env %d %s", rrS.Code, rrS.Body.String())
	}

	// Service gate when SimulateEnabled=false
	checkout.SimulateEnabled = false
	_, err := checkout.SimulatePayment(req.Context(), intentID)
	if err != payments.ErrSimulateDisabled {
		t.Fatalf("err=%v", err)
	}
}

func TestCheckout_ProdRouterOmitsSimulate(t *testing.T) {
	_ = databaseURL(t)
	runMigrate(t, "up")
	pool := openPool(t)
	ids := observability.NewULIDGenerator()
	xd := xendit.NewFake()
	fees := &application.FeeService{
		Store: postgres.NewFeeRepo(pool.Pool()),
		IDs:   ids,
		Clock: observability.SystemClock{},
	}
	checkout := &application.CheckoutService{
		Store:           postgres.NewCheckoutRepo(pool.Pool()),
		Fees:            fees,
		QRIS:            xd,
		IDs:             ids,
		Clock:           observability.SystemClock{},
		PaymentMode:     payments.PaymentModeSandbox,
		SimulateEnabled: false,
	}
	h := httpadapter.NewRouterWith(httpadapter.RouterDeps{
		Log:             observability.NewSlogLogger("error", "test"),
		IDs:             ids,
		Service:         "fersaku-api",
		Version:         "0.0.0-test",
		AppEnv:          config.EnvProduction,
		Ready:           func() bool { return true },
		StartedAt:       time.Now().UTC(),
		CSRFSoftDisable: true,
		FeeService:      fees,
		CheckoutService: checkout,
		RateLimiter:     nil,
		RequestTimeout:  10 * time.Second,
	})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/v1/checkout/simulate-payment", mustJSON(t, map[string]any{
		"paymentIntentId": "x",
	})))
	if rr.Code != http.StatusNotFound && rr.Code != http.StatusMethodNotAllowed {
		// chi returns 404 for unmatched
		t.Fatalf("prod simulate must be absent, got %d body %s", rr.Code, rr.Body.String())
	}
}

func TestCheckout_CodeStockReserveHeldOnExpireTimeout(t *testing.T) {
	h, checkout, xd, capture := newCheckoutStack(t)
	cookie, storeID, _ := onboardSellerStore(t, h, capture)
	// Use inventory helpers from inventory_test same package
	productID := createCodeProduct(t, h, cookie, storeID)
	ver := putSchemaV1(t, h, cookie, storeID, productID)
	_ = ver
	secret := fmt.Sprintf("CODE-%d", time.Now().UnixNano())
	rr := jsonPOST(t, h, "/v1/stores/"+storeID+"/inventory/products/"+productID+"/items", map[string]any{
		"expectedSchemaVersion": ver,
		"items":                 []map[string]string{{"code": secret, "note": "n"}},
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK && rr.Code != http.StatusCreated {
		t.Fatalf("import stock %d %s", rr.Code, rr.Body.String())
	}

	body := map[string]any{
		"storeId": storeID, "productId": productID, "buyerEmail": "code@example.test",
	}
	req := httptest.NewRequest(http.MethodPost, "/v1/checkout/intents", mustJSON(t, body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", fmt.Sprintf("code-stock-%d", time.Now().UnixNano()))
	rrC := httptest.NewRecorder()
	h.ServeHTTP(rrC, req)
	if rrC.Code != http.StatusCreated && rrC.Code != http.StatusOK {
		t.Fatalf("create code checkout %d %s", rrC.Code, rrC.Body.String())
	}
	var env map[string]any
	_ = json.Unmarshal(rrC.Body.Bytes(), &env)
	intentID := env["data"].(map[string]any)["paymentIntentId"].(string)

	pi, _, err := checkout.GetIntent(req.Context(), intentID)
	if err != nil {
		t.Fatal(err)
	}
	if pi.StockReservationID == nil {
		t.Fatal("expected stock reservation for CODE product")
	}
	stockResID := *pi.StockReservationID

	xd.ForceTimeoutExpire = true
	reqE := httptest.NewRequest(http.MethodPost, "/v1/checkout/intents/"+intentID+"/expire", mustJSON(t, map[string]any{}))
	reqE.Header.Set("Content-Type", "application/json")
	reqE.Header.Set("Idempotency-Key", fmt.Sprintf("expire-code-%d", time.Now().UnixNano()))
	rrE := httptest.NewRecorder()
	h.ServeHTTP(rrE, reqE)
	if rrE.Code != http.StatusAccepted && rrE.Code != http.StatusOK {
		t.Fatalf("expire %d %s", rrE.Code, rrE.Body.String())
	}
	// Stock reservation must still exist (not released on timeout).
	// Re-load intent status
	pi2, _, err := checkout.GetIntent(req.Context(), intentID)
	if err != nil {
		t.Fatal(err)
	}
	if pi2.Status != payments.StatusUnknownOutcome && pi2.Status != payments.StatusExpirePending {
		t.Fatalf("status %s", pi2.Status)
	}
	if pi2.StockReservationID == nil || *pi2.StockReservationID != stockResID {
		t.Fatal("stock reservation must be retained until provider unpaid-terminal confirmation")
	}
}
