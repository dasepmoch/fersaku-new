//go:build integration

package integration_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
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

const testWebhookToken = "test-xendit-webhook-token-be330"

func newCallbackStack(t *testing.T) (http.Handler, *application.CallbackService, *application.CheckoutService, *xendit.Fake, *postgres.Pool, *mail.Capture) {
	t.Helper()
	_ = databaseURL(t)
	runMigrate(t, "up")
	pool := openPool(t)
	ids := observability.NewULIDGenerator()
	capture := mail.NewCapture()
	xd := xendit.NewFake()
	log := observability.NewSlogLogger("error", "test")
	authzSvc := &application.AuthzService{
		Store: postgres.NewAuthzRepo(pool.Pool()),
		IDs:   ids,
		Clock: observability.SystemClock{},
		Log:   log,
	}
	authSvc := &application.AuthService{
		Store: postgres.IdentityStore{Repo: postgres.NewIdentityRepo(pool.Pool())},
		IDs:   ids,
		Clock: observability.SystemClock{},
		Mail:  capture,
		Log:   log,
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
		Log:   log,
	}
	catalog := &application.CatalogService{
		Store: postgres.NewCatalogRepo(pool.Pool()),
		IDs:   ids,
		Clock: observability.SystemClock{},
		Log:   log,
	}
	coupons := &application.CouponService{
		Store: postgres.NewCouponRepo(pool.Pool()),
		IDs:   ids,
		Clock: observability.SystemClock{},
		Log:   log,
	}
	inv := &application.InventoryService{
		Store:         postgres.NewInventoryRepo(pool.Pool()),
		IDs:           ids,
		Clock:         observability.SystemClock{},
		Log:           log,
		EncryptionKey: "test-stock-encryption-key-32bytes!",
	}
	delivery := &application.DeliveryService{
		Store:         postgres.NewDeliveryRepo(pool.Pool()),
		IDs:           ids,
		Clock:         observability.SystemClock{},
		Log:           log,
		EncryptionKey: "test-stock-encryption-key-32bytes!",
		TokenSecret:   "test-session-secret-not-for-prod",
	}
	fees := &application.FeeService{
		Store: postgres.NewFeeRepo(pool.Pool()),
		IDs:   ids,
		Clock: observability.SystemClock{},
		Log:   log,
	}
	checkout := &application.CheckoutService{
		Store:           postgres.NewCheckoutRepo(pool.Pool()),
		Fees:            fees,
		Coupons:         coupons,
		Inventory:       inv,
		QRIS:            xd,
		IDs:             ids,
		Clock:           observability.SystemClock{},
		Log:             log,
		PaymentMode:     payments.PaymentModeSandbox,
		AccountScope:    xd.AccountScope,
		SimulateEnabled: true,
		TokenSecret:     "test-session-secret-not-for-prod",
	}
	ledgerSvc := &application.LedgerService{
		Store:                 postgres.NewLedgerRepo(pool.Pool()),
		IDs:                   ids,
		Clock:                 observability.SystemClock{},
		Log:                   log,
		ForceImmediateRelease: true,
		DefaultPaymentMode:    payments.PaymentModeSandbox,
	}
	callbacks := &application.CallbackService{
		Store:              postgres.NewCallbackRepo(pool.Pool()),
		Coupons:            coupons,
		Delivery:           delivery,
		Inventory:          inv,
		DeliveryStore:      postgres.NewDeliveryRepo(pool.Pool()),
		Ledger:             ledgerSvc,
		IDs:                ids,
		Clock:              observability.SystemClock{},
		Log:                log,
		WebhookToken:       testWebhookToken,
		AccountScope:       xd.AccountScope,
		DefaultPaymentMode: payments.PaymentModeSandbox,
		TokenSecret:        "test-session-secret-not-for-prod",
	}
	h := httpadapter.NewRouterWith(httpadapter.RouterDeps{
		Log:               log,
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
		DeliveryService:   delivery,
		FeeService:        fees,
		CheckoutService:   checkout,
		CallbackService:   callbacks,
		LedgerService:     ledgerSvc,
		RateLimiter:       nil,
		RequestTimeout:    60 * time.Second,
	})
	return h, callbacks, checkout, xd, pool, capture
}

func createCheckoutIntent(t *testing.T, h http.Handler, storeID, productID string) (intentID, orderID, providerRef string, amount int64) {
	t.Helper()
	body := map[string]any{
		"storeId":    storeID,
		"productId":  productID,
		"buyerEmail": "buyer-cb@example.test",
		"tip":        0,
	}
	idem := fmt.Sprintf("idem-cb-%d", time.Now().UnixNano())
	req := httptest.NewRequest(http.MethodPost, "/v1/checkout/intents", mustJSON(t, body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", idem)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusCreated && rr.Code != http.StatusOK {
		t.Fatalf("create intent %d %s", rr.Code, rr.Body.String())
	}
	var env map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &env); err != nil {
		t.Fatal(err)
	}
	data := env["data"].(map[string]any)
	intentID = data["paymentIntentId"].(string)
	orderID = data["orderId"].(string)
	amount = int64(data["amount"].(float64))
	if pr, ok := data["providerReference"].(string); ok {
		providerRef = pr
	}
	if providerRef == "" {
		// GET intent
		rrG := httptest.NewRecorder()
		h.ServeHTTP(rrG, httptest.NewRequest(http.MethodGet, "/v1/checkout/intents/"+intentID, nil))
		var envG map[string]any
		_ = json.Unmarshal(rrG.Body.Bytes(), &envG)
		if d, ok := envG["data"].(map[string]any); ok {
			if pr, ok := d["providerReference"].(string); ok {
				providerRef = pr
			}
		}
	}
	if providerRef == "" {
		t.Fatal("missing providerReference")
	}
	return intentID, orderID, providerRef, amount
}

func xenditPaidBody(eventID, providerRef, externalID string, amount int64) []byte {
	return []byte(fmt.Sprintf(`{
		"id": %q,
		"event": "qr.payment",
		"data": {
			"id": %q,
			"external_id": %q,
			"status": "SUCCEEDED",
			"amount": %d,
			"currency": "IDR"
		}
	}`, eventID, providerRef, externalID, amount))
}

func postXenditWebhook(t *testing.T, h http.Handler, token string, body []byte) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/v1/webhooks/xendit", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("X-Callback-Token", token)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func TestCallback_InvalidToken_RejectionOnly(t *testing.T) {
	h, callbacks, _, _, pool, capture := newCallbackStack(t)
	cookie, storeID, _ := onboardSellerStore(t, h, capture)
	productID := createPublishedProduct(t, h, cookie, storeID, 100_000)
	intentID, _, providerRef, amount := createCheckoutIntent(t, h, storeID, productID)

	body := xenditPaidBody("evt-bad-token", providerRef, "ext-x", amount)
	rr := postXenditWebhook(t, h, "wrong-token", body)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status %d body %s", rr.Code, rr.Body.String())
	}

	n, err := callbacks.Store.CountRejections(t.Context(), payments.RejectInvalidToken)
	if err != nil || n < 1 {
		t.Fatalf("rejections n=%d err=%v", n, err)
	}
	// No provider event for bad token
	var evtCount int
	_ = pool.Pool().QueryRow(t.Context(), `SELECT count(*) FROM payment_provider_events WHERE provider_event_id=$1`, "evt-bad-token").Scan(&evtCount)
	if evtCount != 0 {
		t.Fatalf("provider events should be 0 got %d", evtCount)
	}
	// Payment unchanged
	var status string
	_ = pool.Pool().QueryRow(t.Context(), `SELECT status FROM payment_intents WHERE id=$1`, intentID).Scan(&status)
	if status == payments.StatusPaid {
		t.Fatal("payment must not be paid after invalid token")
	}
}

func TestCallback_DuplicatePaid_SingleEffect(t *testing.T) {
	h, callbacks, _, _, pool, capture := newCallbackStack(t)
	cookie, storeID, _ := onboardSellerStore(t, h, capture)
	productID := createPublishedProduct(t, h, cookie, storeID, 100_000)
	intentID, orderID, providerRef, amount := createCheckoutIntent(t, h, storeID, productID)

	// Load external_id for body
	var externalID string
	_ = pool.Pool().QueryRow(t.Context(), `SELECT external_id FROM payment_intents WHERE id=$1`, intentID).Scan(&externalID)

	eventID := fmt.Sprintf("evt-dup-%d", time.Now().UnixNano())
	body := xenditPaidBody(eventID, providerRef, externalID, amount)

	const N = 80
	var wg sync.WaitGroup
	var ok200 atomic.Int64
	for i := 0; i < N; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			rr := postXenditWebhook(t, h, testWebhookToken, body)
			if rr.Code == http.StatusOK {
				ok200.Add(1)
			}
		}()
	}
	wg.Wait()
	if ok200.Load() < 1 {
		t.Fatalf("expected at least one 200, got %d", ok200.Load())
	}

	// Exactly one provider event row
	n, err := callbacks.Store.CountProviderEventsByCanonical(t.Context(),
		payments.ProviderXendit, "xendit-primary", payments.PaymentModeSandbox, eventID)
	if err != nil || n != 1 {
		t.Fatalf("provider events n=%d err=%v", n, err)
	}
	// Exactly one settlement
	sn, err := callbacks.Store.CountSettlementsByIntent(t.Context(), intentID)
	if err != nil || sn != 1 {
		t.Fatalf("settlements n=%d err=%v", sn, err)
	}
	// Paid once
	var status string
	var paidLate bool
	_ = pool.Pool().QueryRow(t.Context(), `SELECT status, paid_late FROM payment_intents WHERE id=$1`, intentID).Scan(&status, &paidLate)
	if status != payments.StatusPaid {
		t.Fatalf("status %s", status)
	}
	// One grant
	var grants int
	_ = pool.Pool().QueryRow(t.Context(), `SELECT count(*) FROM delivery_grants WHERE order_id=$1`, orderID).Scan(&grants)
	if grants != 1 {
		t.Fatalf("grants %d want 1", grants)
	}
	// Journal unique
	var journals int
	_ = pool.Pool().QueryRow(t.Context(), `SELECT count(*) FROM payment_settlements WHERE journal_reference=$1`,
		payments.JournalReferencePaid(intentID)).Scan(&journals)
	if journals != 1 {
		t.Fatalf("journals %d", journals)
	}
}

func TestCallback_LatePaidAfterExpire(t *testing.T) {
	h, _, checkout, xd, pool, capture := newCallbackStack(t)
	cookie, storeID, _ := onboardSellerStore(t, h, capture)
	productID := createPublishedProduct(t, h, cookie, storeID, 100_000)
	intentID, orderID, providerRef, amount := createCheckoutIntent(t, h, storeID, productID)

	// Force expire verified
	xd.ForceTimeoutExpire = false
	// Mark provider expired then expire intent
	if _, err := xd.ExpirePayment(t.Context(), providerRef); err != nil {
		_ = err
	}
	// Directly set local EXPIRED for late-paid path
	_, err := pool.Pool().Exec(t.Context(), `
		UPDATE payment_intents SET status='EXPIRED', preceding_status='PENDING', updated_at=now() WHERE id=$1`, intentID)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = pool.Pool().Exec(t.Context(), `
		UPDATE orders SET payment_status='EXPIRED', order_status='EXPIRED', updated_at=now() WHERE id=$1`, orderID)

	var externalID string
	_ = pool.Pool().QueryRow(t.Context(), `SELECT external_id FROM payment_intents WHERE id=$1`, intentID).Scan(&externalID)

	// Ensure fake provider shows PAID for reference
	_ = xd.SimulatePay(providerRef)

	eventID := fmt.Sprintf("evt-late-%d", time.Now().UnixNano())
	body := xenditPaidBody(eventID, providerRef, externalID, amount)
	rr := postXenditWebhook(t, h, testWebhookToken, body)
	if rr.Code != http.StatusOK {
		t.Fatalf("status %d %s", rr.Code, rr.Body.String())
	}

	var status string
	var paidLate bool
	_ = pool.Pool().QueryRow(t.Context(), `SELECT status, paid_late FROM payment_intents WHERE id=$1`, intentID).Scan(&status, &paidLate)
	if status != payments.StatusPaid {
		t.Fatalf("status %s", status)
	}
	if !paidLate {
		t.Fatal("expected paid_late")
	}
	var sn int
	_ = pool.Pool().QueryRow(t.Context(), `SELECT count(*) FROM payment_settlements WHERE payment_intent_id=$1`, intentID).Scan(&sn)
	if sn != 1 {
		t.Fatalf("settlements %d", sn)
	}
	_ = checkout // silence if unused path
}

func TestCallback_CrossPaymentMode_NoCollision(t *testing.T) {
	h, callbacks, _, _, pool, capture := newCallbackStack(t)
	cookie, storeID, _ := onboardSellerStore(t, h, capture)
	productID := createPublishedProduct(t, h, cookie, storeID, 50_000)
	intentID, _, providerRef, amount := createCheckoutIntent(t, h, storeID, productID)

	var externalID string
	_ = pool.Pool().QueryRow(t.Context(), `SELECT external_id FROM payment_intents WHERE id=$1`, intentID).Scan(&externalID)

	// Same provider_event_id accepted under SANDBOX (intent mode)
	eventID := "shared-event-id-mode-test"
	body := xenditPaidBody(eventID, providerRef, externalID, amount)
	rr := postXenditWebhook(t, h, testWebhookToken, body)
	if rr.Code != http.StatusOK {
		t.Fatalf("sandbox %d %s", rr.Code, rr.Body.String())
	}

	// Insert a LIVE-mode event with same provider_event_id (different payment_mode) — must not collide.
	// Use service with LIVE mode override via direct store insert path: POST /live path
	req := httptest.NewRequest(http.MethodPost, "/v1/webhooks/xendit/live", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Callback-Token", testWebhookToken)
	rr2 := httptest.NewRecorder()
	h.ServeHTTP(rr2, req)
	// LIVE may quarantine (no LIVE intent) but must accept a second canonical row
	if rr2.Code != http.StatusOK && rr2.Code != http.StatusUnauthorized {
		// 200 expected when token valid
		if rr2.Code >= 500 {
			t.Fatalf("live webhook %d %s", rr2.Code, rr2.Body.String())
		}
	}

	// Count rows with same event id across modes
	var modes int
	_ = pool.Pool().QueryRow(t.Context(), `
		SELECT count(DISTINCT payment_mode) FROM payment_provider_events
		WHERE provider_event_id=$1`, eventID).Scan(&modes)
	// At least SANDBOX present; LIVE may also insert
	nSand, _ := callbacks.Store.CountProviderEventsByCanonical(t.Context(),
		payments.ProviderXendit, "xendit-primary", payments.PaymentModeSandbox, eventID)
	if nSand != 1 {
		t.Fatalf("sandbox events %d", nSand)
	}
	// LIVE insert if 200
	if rr2.Code == http.StatusOK {
		nLive, _ := callbacks.Store.CountProviderEventsByCanonical(t.Context(),
			payments.ProviderXendit, "xendit-primary", payments.PaymentModeLive, eventID)
		if nLive != 1 {
			t.Fatalf("live events %d (cross-mode must not collide)", nLive)
		}
	}
}

func TestCallback_MissingToken_Rejection(t *testing.T) {
	h, callbacks, _, _, _, capture := newCallbackStack(t)
	_ = capture
	body := []byte(`{"id":"e1","data":{"status":"PAID","amount":1000}}`)
	rr := postXenditWebhook(t, h, "", body)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status %d", rr.Code)
	}
	n, _ := callbacks.Store.CountRejections(t.Context(), payments.RejectMissingToken)
	if n < 1 {
		t.Fatalf("missing token rejections %d", n)
	}
}
