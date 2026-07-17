//go:build integration

package integration_test

import (
	"bytes"
	"encoding/json"
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

func newCouponStack(t *testing.T) (http.Handler, *application.CouponService, *mail.Capture) {
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
	coupons := &application.CouponService{
		Store: postgres.NewCouponRepo(pool.Pool()),
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
		CouponService:     coupons,
		RateLimiter:       nil,
		RequestTimeout:    30 * time.Second,
	})
	return h, coupons, capture
}

func createPublishedProduct(t *testing.T, h http.Handler, cookie *http.Cookie, storeID string, price int64) string {
	t.Helper()
	slug := fmt.Sprintf("cpn-prod-%d", time.Now().UnixNano()%1_000_000_000)
	rr := jsonPOST(t, h, "/v1/stores/"+storeID+"/products", map[string]any{
		"title": "Coupon Product",
		"slug":  slug,
		"price": price,
		"type":  "download",
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusCreated {
		t.Fatalf("create product %d %s", rr.Code, rr.Body.String())
	}
	prod := envelopeData(t, rr)
	productID, _ := prod["id"].(string)
	rr = jsonPOST(t, h, "/v1/stores/"+storeID+"/products/"+productID+"/publish", map[string]any{}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("publish product %d %s", rr.Code, rr.Body.String())
	}
	return productID
}

func TestCoupons_SellerCRUDAndActivate(t *testing.T) {
	h, _, capture := newCouponStack(t)
	cookie, storeID, _ := onboardSellerStore(t, h, capture)
	_ = createPublishedProduct(t, h, cookie, storeID, 100_000)

	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	code := "LAUNCH" + suffix[len(suffix)-6:]
	rr := jsonPOST(t, h, "/v1/stores/"+storeID+"/coupons", map[string]any{
		"code":          code,
		"discountKind":  "PERCENT",
		"discountValue": 20,
		"maxTotalUses":  10,
		"scope":         "ALL_PRODUCTS",
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusCreated {
		t.Fatalf("create coupon %d %s", rr.Code, rr.Body.String())
	}
	c := envelopeData(t, rr)
	if c["state"] != "DRAFT" {
		t.Fatalf("state=%v", c["state"])
	}
	// 20% → 2000 bps
	if c["discountValue"].(float64) != 2000 {
		t.Fatalf("discountValue=%v want 2000 bps", c["discountValue"])
	}
	couponID, _ := c["id"].(string)

	rr = jsonPOST(t, h, "/v1/stores/"+storeID+"/coupons/"+couponID+"/activate", map[string]any{}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("activate %d %s", rr.Code, rr.Body.String())
	}
	if envelopeData(t, rr)["state"] != "ACTIVE" {
		t.Fatalf("not active")
	}

	// Idempotent activate
	rr = jsonPOST(t, h, "/v1/stores/"+storeID+"/coupons/"+couponID+"/activate", map[string]any{}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("activate again %d", rr.Code)
	}

	rr = jsonPOST(t, h, "/v1/stores/"+storeID+"/coupons/"+couponID+"/pause", map[string]any{}, []*http.Cookie{cookie})
	if envelopeData(t, rr)["state"] != "PAUSED" {
		t.Fatalf("pause failed")
	}
	rr = jsonPOST(t, h, "/v1/stores/"+storeID+"/coupons/"+couponID+"/activate", map[string]any{}, []*http.Cookie{cookie})
	if envelopeData(t, rr)["state"] != "ACTIVE" {
		t.Fatalf("reactivate failed")
	}

	// Optimistic version conflict
	rr = jsonPATCH(t, h, "/v1/stores/"+storeID+"/coupons/"+couponID, map[string]any{
		"expectedVersion": 1,
		"discountValue":   15,
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusConflict {
		t.Fatalf("stale version want 409 got %d %s", rr.Code, rr.Body.String())
	}

	// Code conflict (same store, normalized code)
	rr = jsonPOST(t, h, "/v1/stores/"+storeID+"/coupons", map[string]any{
		"code":          strings.ToLower(code),
		"discountKind":  "FIXED_IDR",
		"discountValue": 5000,
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusConflict {
		t.Fatalf("code conflict want 409 got %d %s", rr.Code, rr.Body.String())
	}
}

func TestCoupons_ClientDiscountIgnoredAndIntegerMath(t *testing.T) {
	h, _, capture := newCouponStack(t)
	cookie, storeID, _ := onboardSellerStore(t, h, capture)
	productID := createPublishedProduct(t, h, cookie, storeID, 100_000)

	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	code := "SAVE" + suffix[len(suffix)-6:]
	rr := jsonPOST(t, h, "/v1/stores/"+storeID+"/coupons", map[string]any{
		"code":          code,
		"discountKind":  "PERCENT",
		"discountValue": 20,
	}, []*http.Cookie{cookie})
	couponID := envelopeData(t, rr)["id"].(string)
	jsonPOST(t, h, "/v1/stores/"+storeID+"/coupons/"+couponID+"/activate", map[string]any{}, []*http.Cookie{cookie})

	// Client claims huge discount — must be ignored.
	rr = jsonPOST(t, h, "/v1/checkout/quote", map[string]any{
		"storeId":        storeID,
		"productId":      productID,
		"couponCode":     code,
		"clientDiscount": 99999,
		"discount":       99999,
		"tip":            10000,
		"upsell":         5000,
	}, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("quote %d %s", rr.Code, rr.Body.String())
	}
	price := envelopeData(t, rr)
	if price["clientDiscountIgnored"] != true {
		t.Fatalf("expected clientDiscountIgnored")
	}
	// 20% of 100000 = 20000; tip/upsell not discounted
	if price["discount"].(float64) != 20000 {
		t.Fatalf("discount=%v want 20000", price["discount"])
	}
	// gross = 100000 - 20000 + 10000 + 5000 = 95000
	if price["gross"].(float64) != 95000 {
		t.Fatalf("gross=%v want 95000", price["gross"])
	}
	if price["couponApplied"] != true {
		t.Fatalf("coupon not applied: %v", price)
	}

	// Fixed IDR clamp to merchandise
	code2 := "FIX" + suffix[len(suffix)-6:]
	rr = jsonPOST(t, h, "/v1/stores/"+storeID+"/coupons", map[string]any{
		"code":          code2,
		"discountKind":  "FIXED_IDR",
		"discountValue": 500_000,
	}, []*http.Cookie{cookie})
	cid2 := envelopeData(t, rr)["id"].(string)
	jsonPOST(t, h, "/v1/stores/"+storeID+"/coupons/"+cid2+"/activate", map[string]any{}, []*http.Cookie{cookie})
	rr = jsonPOST(t, h, "/v1/checkout/apply-coupon", map[string]any{
		"storeId":    storeID,
		"productId":  productID,
		"couponCode": code2,
	}, nil)
	price = envelopeData(t, rr)
	if price["discount"].(float64) != 100000 {
		t.Fatalf("fixed clamp discount=%v", price["discount"])
	}
	if price["gross"].(float64) != 0 {
		t.Fatalf("gross=%v", price["gross"])
	}
}

func TestCoupons_IdempotentReservation(t *testing.T) {
	h, _, capture := newCouponStack(t)
	cookie, storeID, _ := onboardSellerStore(t, h, capture)
	productID := createPublishedProduct(t, h, cookie, storeID, 50_000)

	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	code := "IDEM" + suffix[len(suffix)-6:]
	rr := jsonPOST(t, h, "/v1/stores/"+storeID+"/coupons", map[string]any{
		"code":          code,
		"discountKind":  "PERCENT",
		"discountValue": 10,
		"maxTotalUses":  5,
	}, []*http.Cookie{cookie})
	cid := envelopeData(t, rr)["id"].(string)
	jsonPOST(t, h, "/v1/stores/"+storeID+"/coupons/"+cid+"/activate", map[string]any{}, []*http.Cookie{cookie})

	idemKey := "idem-key-" + suffix
	body := map[string]any{
		"storeId":    storeID,
		"productId":  productID,
		"orderId":    "ord_idem_" + suffix,
		"couponCode": code,
	}
	req1 := httptest.NewRequest(http.MethodPost, "/v1/checkout/coupon-reservations", mustJSON(t, body))
	req1.Header.Set("Content-Type", "application/json")
	req1.Header.Set("Idempotency-Key", idemKey)
	rr1 := httptest.NewRecorder()
	h.ServeHTTP(rr1, req1)
	if rr1.Code != http.StatusCreated {
		t.Fatalf("reserve1 %d %s", rr1.Code, rr1.Body.String())
	}
	d1 := envelopeData(t, rr1)
	res1 := d1["reservation"].(map[string]any)
	id1 := res1["id"].(string)

	req2 := httptest.NewRequest(http.MethodPost, "/v1/checkout/coupon-reservations", mustJSON(t, body))
	req2.Header.Set("Content-Type", "application/json")
	req2.Header.Set("Idempotency-Key", idemKey)
	rr2 := httptest.NewRecorder()
	h.ServeHTTP(rr2, req2)
	if rr2.Code != http.StatusOK {
		t.Fatalf("reserve2 %d %s", rr2.Code, rr2.Body.String())
	}
	d2 := envelopeData(t, rr2)
	if d2["replayed"] != true {
		t.Fatalf("expected replayed")
	}
	res2 := d2["reservation"].(map[string]any)
	if res2["id"] != id1 {
		t.Fatalf("idempotency mismatch %v vs %v", res2["id"], id1)
	}
}

func TestCoupons_ConcurrentLastSlot(t *testing.T) {
	h, couponSvc, capture := newCouponStack(t)
	cookie, storeID, _ := onboardSellerStore(t, h, capture)
	productID := createPublishedProduct(t, h, cookie, storeID, 25_000)

	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	code := "LAST" + suffix[len(suffix)-6:]
	limit := int64(1)
	rr := jsonPOST(t, h, "/v1/stores/"+storeID+"/coupons", map[string]any{
		"code":          code,
		"discountKind":  "FIXED_IDR",
		"discountValue": 5000,
		"maxTotalUses":  limit,
	}, []*http.Cookie{cookie})
	cid := envelopeData(t, rr)["id"].(string)
	jsonPOST(t, h, "/v1/stores/"+storeID+"/coupons/"+cid+"/activate", map[string]any{}, []*http.Cookie{cookie})

	const n = 8
	var okCount atomic.Int64
	var failCount atomic.Int64
	var wg sync.WaitGroup
	wg.Add(n)
	for i := 0; i < n; i++ {
		i := i
		go func() {
			defer wg.Done()
			body := map[string]any{
				"storeId":    storeID,
				"productId":  productID,
				"orderId":    fmt.Sprintf("ord_race_%s_%d", suffix, i),
				"couponCode": code,
			}
			req := httptest.NewRequest(http.MethodPost, "/v1/checkout/coupon-reservations", mustJSON(t, body))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Idempotency-Key", fmt.Sprintf("race-key-%s-%d", suffix, i))
			rr := httptest.NewRecorder()
			h.ServeHTTP(rr, req)
			if rr.Code == http.StatusCreated {
				okCount.Add(1)
				return
			}
			// limit exceeded or unavailable
			failCount.Add(1)
			if rr.Code != http.StatusConflict && rr.Code != http.StatusBadRequest {
				t.Errorf("unexpected status %d body=%s", rr.Code, rr.Body.String())
			}
		}()
	}
	wg.Wait()
	if okCount.Load() != 1 {
		t.Fatalf("last-slot race: winners=%d losers=%d want exactly 1 winner", okCount.Load(), failCount.Load())
	}
	if failCount.Load() != n-1 {
		t.Fatalf("losers=%d want %d", failCount.Load(), n-1)
	}

	// Second reserve after full limit must fail.
	_, err := couponSvc.Reserve(t.Context(), application.ReserveRequest{
		StoreID:        storeID,
		ProductID:      productID,
		OrderID:        "ord_after_full_" + suffix,
		IdempotencyKey: "after-full-" + suffix,
		CouponCode:     code,
	})
	if err == nil {
		t.Fatal("expected limit after full")
	}
	if ae, ok := apperr.AsAppError(err); !ok || (ae.Code != apperr.CodeCouponLimitExceeded && ae.Code != apperr.CodeCouponUnavailable) {
		t.Fatalf("unexpected err: %v", err)
	}
}

func TestCoupons_ReleaseAndConvertIdempotent(t *testing.T) {
	h, couponSvc, capture := newCouponStack(t)
	cookie, storeID, _ := onboardSellerStore(t, h, capture)
	productID := createPublishedProduct(t, h, cookie, storeID, 40_000)

	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	code := "REL" + suffix[len(suffix)-8:]
	rr := jsonPOST(t, h, "/v1/stores/"+storeID+"/coupons", map[string]any{
		"code":          code,
		"discountKind":  "PERCENT",
		"discountValue": 10,
		"maxTotalUses":  2,
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusCreated {
		t.Fatalf("create %d %s", rr.Code, rr.Body.String())
	}
	cid := envelopeData(t, rr)["id"].(string)
	jsonPOST(t, h, "/v1/stores/"+storeID+"/coupons/"+cid+"/activate", map[string]any{}, []*http.Cookie{cookie})

	ord1 := "ord_rel_" + suffix + "_1"
	ord2 := "ord_rel_" + suffix + "_2"
	res, err := couponSvc.Reserve(t.Context(), application.ReserveRequest{
		StoreID:        storeID,
		ProductID:      productID,
		OrderID:        ord1,
		IdempotencyKey: "rel-key-" + suffix + "-1",
		CouponCode:     code,
	})
	if err != nil {
		t.Fatal(err)
	}
	// Idempotent release
	r1, err := couponSvc.ReleaseReservation(t.Context(), res.Reservation.ID)
	if err != nil {
		t.Fatal(err)
	}
	if r1.State != "RELEASED" {
		t.Fatalf("state=%s", r1.State)
	}
	r2, err := couponSvc.ReleaseReservation(t.Context(), res.Reservation.ID)
	if err != nil {
		t.Fatal(err)
	}
	if r2.State != "RELEASED" {
		t.Fatalf("idempotent release state=%s", r2.State)
	}

	// New reserve should succeed after release frees slot
	res2, err := couponSvc.Reserve(t.Context(), application.ReserveRequest{
		StoreID:        storeID,
		ProductID:      productID,
		OrderID:        ord2,
		IdempotencyKey: "rel-key-" + suffix + "-2",
		CouponCode:     code,
	})
	if err != nil {
		t.Fatal(err)
	}
	red1, err := couponSvc.ConvertReservationToRedemption(t.Context(), res2.Reservation.ID)
	if err != nil {
		t.Fatal(err)
	}
	red2, err := couponSvc.ConvertReservationToRedemption(t.Context(), res2.Reservation.ID)
	if err != nil {
		t.Fatal(err)
	}
	if red1.ID != red2.ID {
		t.Fatalf("convert not idempotent %s vs %s", red1.ID, red2.ID)
	}
	// Cannot release consumed
	if _, err := couponSvc.ReleaseReservation(t.Context(), res2.Reservation.ID); err == nil {
		t.Fatal("expected error releasing consumed")
	}
}

func mustJSON(t *testing.T, v any) *bytes.Reader {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return bytes.NewReader(b)
}
