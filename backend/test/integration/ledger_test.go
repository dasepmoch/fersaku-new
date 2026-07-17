//go:build integration

package integration_test

import (
	"context"
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
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/ledger"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/payments"
)

func newLedgerStack(t *testing.T) (http.Handler, *application.LedgerService, *postgres.Pool, *mail.Capture) {
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
	ledgerSvc := &application.LedgerService{
		Store:                 postgres.NewLedgerRepo(pool.Pool()),
		IDs:                   ids,
		Clock:                 observability.SystemClock{},
		Log:                   log,
		Authz:                 authzSvc,
		ForceImmediateRelease: true,
		DefaultPaymentMode:    payments.PaymentModeSandbox,
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
		LedgerService:     ledgerSvc,
		RateLimiter:       nil,
		RequestTimeout:    60 * time.Second,
	})
	_ = xd
	return h, ledgerSvc, pool, capture
}

func TestLedgerPaymentCapture100kImmediateAvailable(t *testing.T) {
	h, ledgerSvc, pool, capture := newLedgerStack(t)
	ctx := context.Background()
	cookie, storeID, _ := onboardSellerStore(t, h, capture)
	merchantID := storeMerchantID(t, pool, storeID)
	ids := observability.NewULIDGenerator()

	jid, lotID, err := ledgerSvc.PostPaymentCapture(ctx, ledger.PaymentCaptureInput{
		MerchantID:      merchantID,
		StoreID:         storeID,
		PaymentMode:     ledger.ModeSandbox,
		Source:          ledger.SourceStorefront,
		PaymentIntentID: "pi_test_100k_" + ids.New(),
		OrderID:         "ord_test_100k",
		GrossIDR:        100_000,
		FeePercentIDR:   3_000,
		FeeFixedIDR:     700,
		MerchantNetIDR:  96_300,
		PostedAt:        time.Now().UTC(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if jid == "" || lotID == "" {
		t.Fatalf("jid=%s lot=%s", jid, lotID)
	}

	bal, err := ledgerSvc.Store.GetBalance(ctx, merchantID, ledger.ModeSandbox)
	if err != nil {
		t.Fatal(err)
	}
	if bal.AvailableIDR != 96_300 {
		t.Fatalf("available %d want 96300", bal.AvailableIDR)
	}
	if bal.PendingIDR != 0 {
		t.Fatalf("pending %d want 0", bal.PendingIDR)
	}
	if bal.LifetimeGrossIDR != 100_000 || bal.LifetimeNetIDR != 96_300 {
		t.Fatalf("lifetime gross=%d net=%d", bal.LifetimeGrossIDR, bal.LifetimeNetIDR)
	}

	ok, err := ledgerSvc.VerifySourceTotalsSum(ctx, merchantID, ledger.ModeSandbox)
	if err != nil || !ok {
		t.Fatalf("source totals match=%v err=%v", ok, err)
	}

	before, after, match, err := ledgerSvc.RebuildBalances(ctx, merchantID, ledger.ModeSandbox)
	if err != nil {
		t.Fatal(err)
	}
	if !match {
		t.Fatalf("rebuild mismatch before=%+v after=%+v", before, after)
	}
	if after.AvailableIDR != 96_300 {
		t.Fatalf("rebuild available %d", after.AvailableIDR)
	}

	_, updErr := pool.Pool().Exec(ctx, `UPDATE ledger_entries SET amount_idr = 1 WHERE journal_id = $1`, jid)
	if updErr == nil {
		t.Fatal("expected update of ledger_entries to fail")
	}
	_, delErr := pool.Pool().Exec(ctx, `DELETE FROM ledger_entries WHERE journal_id = $1`, jid)
	if delErr == nil {
		t.Fatal("expected delete of ledger_entries to fail")
	}

	var d, c int64
	_ = pool.Pool().QueryRow(ctx, `
SELECT
  COALESCE(SUM(CASE WHEN side='DEBIT' THEN amount_idr ELSE 0 END),0),
  COALESCE(SUM(CASE WHEN side='CREDIT' THEN amount_idr ELSE 0 END),0)
FROM ledger_entries WHERE journal_id=$1`, jid).Scan(&d, &c)
	if d != c || d != 100_000 {
		t.Fatalf("journal balance d=%d c=%d", d, c)
	}

	req := httptest.NewRequest(http.MethodGet, "/v1/stores/"+storeID+"/finance/summary", nil)
	req.AddCookie(cookie)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("summary %d %s", rr.Code, rr.Body.String())
	}
	var env map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &env); err != nil {
		t.Fatal(err)
	}
	data := env["data"].(map[string]any)
	if int64(data["availableAmount"].(float64)) != 96_300 {
		t.Fatalf("http available %v", data["availableAmount"])
	}

	_, _, err = ledgerSvc.PostPaymentCapture(ctx, ledger.PaymentCaptureInput{
		MerchantID:      merchantID,
		StoreID:         storeID,
		PaymentMode:     ledger.ModeSandbox,
		Source:          ledger.SourceQRISAPI,
		PaymentIntentID: "pi_test_qris_" + ids.New(),
		OrderID:         "ord_test_qris",
		GrossIDR:        100_000,
		FeePercentIDR:   3_000,
		FeeFixedIDR:     700,
		MerchantNetIDR:  96_300,
		PostedAt:        time.Now().UTC(),
	})
	if err != nil {
		t.Fatal(err)
	}
	bal2, _ := ledgerSvc.Store.GetBalance(ctx, merchantID, ledger.ModeSandbox)
	if bal2.AvailableIDR != 192_600 {
		t.Fatalf("after mixed available %d", bal2.AvailableIDR)
	}
	ok, _ = ledgerSvc.VerifySourceTotalsSum(ctx, merchantID, ledger.ModeSandbox)
	if !ok {
		t.Fatal("source totals after mixed")
	}

	alloc, err := ledgerSvc.PreviewWithdrawalAllocation(ctx, merchantID, ledger.ModeSandbox, 100_000)
	if err != nil {
		t.Fatal(err)
	}
	if alloc.AmountDebited != 100_000 || len(alloc.Allocations) < 1 {
		t.Fatalf("alloc %+v", alloc)
	}

	reqL := httptest.NewRequest(http.MethodGet, "/v1/stores/"+storeID+"/finance/ledger", nil)
	reqL.AddCookie(cookie)
	rrL := httptest.NewRecorder()
	h.ServeHTTP(rrL, reqL)
	if rrL.Code != http.StatusOK {
		t.Fatalf("ledger %d %s", rrL.Code, rrL.Body.String())
	}

	reqS := httptest.NewRequest(http.MethodGet, "/v1/seller/finance/summary?storeId="+storeID, nil)
	reqS.AddCookie(cookie)
	rrS := httptest.NewRecorder()
	h.ServeHTTP(rrS, reqS)
	if rrS.Code != http.StatusOK {
		t.Fatalf("seller summary %d %s", rrS.Code, rrS.Body.String())
	}

	intent := "pi_idem_" + ids.New()
	j1, _, err := ledgerSvc.PostPaymentCapture(ctx, ledger.PaymentCaptureInput{
		MerchantID: merchantID, StoreID: storeID, PaymentMode: ledger.ModeSandbox,
		Source: ledger.SourceStorefront, PaymentIntentID: intent, OrderID: "o1",
		GrossIDR: 50_000, FeePercentIDR: 1_500, FeeFixedIDR: 700, MerchantNetIDR: 47_800,
		PostedAt: time.Now().UTC(),
	})
	if err != nil {
		t.Fatal(err)
	}
	j2, _, err := ledgerSvc.PostPaymentCapture(ctx, ledger.PaymentCaptureInput{
		MerchantID: merchantID, StoreID: storeID, PaymentMode: ledger.ModeSandbox,
		Source: ledger.SourceStorefront, PaymentIntentID: intent, OrderID: "o1",
		GrossIDR: 50_000, FeePercentIDR: 1_500, FeeFixedIDR: 700, MerchantNetIDR: 47_800,
		PostedAt: time.Now().UTC(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if j1 != j2 {
		t.Fatalf("idempotent journals %s vs %s", j1, j2)
	}
}

func TestLedgerPendingThenRelease(t *testing.T) {
	h, _, pool, capture := newLedgerStack(t)
	ctx := context.Background()
	cookie, storeID, _ := onboardSellerStore(t, h, capture)
	_ = cookie
	merchantID := storeMerchantID(t, pool, storeID)

	// Ensure delayed settlement (1 hour)
	_, _ = pool.Pool().Exec(ctx, `UPDATE schema_meta SET value='3600' WHERE key='settlement_delay_seconds'`)

	ids := observability.NewULIDGenerator()
	delayed := &application.LedgerService{
		Store:                 postgres.NewLedgerRepo(pool.Pool()),
		IDs:                   ids,
		Clock:                 observability.SystemClock{},
		Log:                   observability.NewSlogLogger("error", "test"),
		Authz:                 nil, // internal release path; no seller read
		ForceImmediateRelease: false,
		DefaultPaymentMode:    payments.PaymentModeSandbox,
	}

	intent := "pi_pend_" + ids.New()
	_, lotID, err := delayed.PostPaymentCapture(ctx, ledger.PaymentCaptureInput{
		MerchantID: merchantID, StoreID: storeID, PaymentMode: ledger.ModeSandbox,
		Source: ledger.SourceStorefront, PaymentIntentID: intent, OrderID: "op",
		GrossIDR: 100_000, FeePercentIDR: 3_000, FeeFixedIDR: 700, MerchantNetIDR: 96_300,
		PostedAt: time.Now().UTC(), ImmediateRelease: false,
	})
	if err != nil {
		t.Fatal(err)
	}
	bal, _ := delayed.Store.GetBalance(ctx, merchantID, ledger.ModeSandbox)
	if bal.PendingIDR != 96_300 {
		t.Fatalf("pending want 96300 got %d (available=%d)", bal.PendingIDR, bal.AvailableIDR)
	}
	if bal.AvailableIDR != 0 {
		t.Fatalf("available want 0 got %d", bal.AvailableIDR)
	}

	_, _ = pool.Pool().Exec(ctx, `UPDATE settlement_lots SET available_at = now() - interval '1 minute' WHERE id=$1`, lotID)
	n, err := delayed.ReleaseDueSettlements(ctx, 10)
	if err != nil {
		t.Fatal(err)
	}
	if n < 1 {
		t.Fatalf("released %d", n)
	}
	bal2, _ := delayed.Store.GetBalance(ctx, merchantID, ledger.ModeSandbox)
	if bal2.AvailableIDR != 96_300 || bal2.PendingIDR != 0 {
		t.Fatalf("after release available=%d pending=%d", bal2.AvailableIDR, bal2.PendingIDR)
	}

	// Source totals still sum after release
	ok, err := delayed.VerifySourceTotalsSum(ctx, merchantID, ledger.ModeSandbox)
	if err != nil || !ok {
		t.Fatalf("source sum after release ok=%v err=%v", ok, err)
	}
	_, after, match, err := delayed.RebuildBalances(ctx, merchantID, ledger.ModeSandbox)
	if err != nil || !match {
		t.Fatalf("rebuild match=%v err=%v after=%+v", match, err, after)
	}
}

func storeMerchantID(t *testing.T, pool *postgres.Pool, storeID string) string {
	t.Helper()
	var mid string
	err := pool.Pool().QueryRow(context.Background(), `SELECT merchant_id FROM stores WHERE id=$1`, storeID).Scan(&mid)
	if err != nil {
		t.Fatal(err)
	}
	return mid
}

func TestLedgerFIFOAllocationMixedSources(t *testing.T) {
	t0 := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	t1 := t0.Add(time.Hour)
	lots := []ledger.SettlementLot{
		{ID: "lot_b", Source: ledger.SourceQRISAPI, RemainingAmountIDR: 40_000, Status: ledger.LotAvailable, AvailableAt: t1},
		{ID: "lot_a", Source: ledger.SourceStorefront, RemainingAmountIDR: 60_000, Status: ledger.LotAvailable, AvailableAt: t0},
	}
	alloc, err := ledger.AllocateWithdrawalFIFO(100_000, lots)
	if err != nil {
		t.Fatal(err)
	}
	if alloc.Source != ledger.SourceMixed {
		t.Fatalf("source %s", alloc.Source)
	}
	if alloc.Allocations[0].AmountIDR != 60_000 || alloc.Allocations[1].AmountIDR != 40_000 {
		t.Fatalf("%+v", alloc.Allocations)
	}
	_ = fmt.Sprintf("ok")
}
