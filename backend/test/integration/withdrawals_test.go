//go:build integration

package integration_test

import (
	"bytes"
	"context"
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
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/ledger"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/payments"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/withdrawals"
)

func newWithdrawalStack(t *testing.T) (
	http.Handler,
	*application.WithdrawalService,
	*application.LedgerService,
	*xendit.Fake,
	*postgres.Pool,
	*mail.Capture,
) {
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
	feeSvc := &application.FeeService{
		Store: postgres.NewFeeRepo(pool.Pool()),
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
	auto := true
	wdSvc := &application.WithdrawalService{
		Store:              postgres.NewWithdrawalRepo(pool.Pool()),
		Ledger:             ledgerSvc,
		Fees:               feeSvc,
		Disburse:           xd,
		IDs:                ids,
		Clock:              observability.SystemClock{},
		Log:                log,
		EncryptionKey:      "local-dev-stock-encryption-key!!!!",
		AccountScope:       "xendit-primary",
		DefaultPaymentMode: payments.PaymentModeSandbox,
		ForceAutoApprove:   &auto,
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
		FeeService:        feeSvc,
		LedgerService:     ledgerSvc,
		WithdrawalService: wdSvc,
		RateLimiter:       nil,
		RequestTimeout:    60 * time.Second,
	})
	return h, wdSvc, ledgerSvc, xd, pool, capture
}

func creditAvailable(t *testing.T, ledgerSvc *application.LedgerService, merchantID, storeID string, net int64) {
	t.Helper()
	ctx := context.Background()
	ids := observability.NewULIDGenerator()
	// Use fee components that balance: gross = net + feeP + feeF
	feeP := int64(3000)
	feeF := int64(700)
	gross := net + feeP + feeF
	_, _, err := ledgerSvc.PostPaymentCapture(ctx, ledger.PaymentCaptureInput{
		MerchantID:      merchantID,
		StoreID:         storeID,
		PaymentMode:     ledger.ModeSandbox,
		Source:          ledger.SourceStorefront,
		PaymentIntentID: "pi_wd_" + ids.New(),
		OrderID:         "ord_wd_" + ids.New(),
		GrossIDR:        gross,
		FeePercentIDR:   feeP,
		FeeFixedIDR:     feeF,
		MerchantNetIDR:  net,
		PostedAt:        time.Now().UTC(),
	})
	if err != nil {
		t.Fatal(err)
	}
}

func setupSellerWithBalance(t *testing.T, h http.Handler, ledgerSvc *application.LedgerService, pool *postgres.Pool, capture *mail.Capture, available int64) (cookie *http.Cookie, storeID, merchantID string) {
	t.Helper()
	cookie, storeID, _ = onboardSellerStore(t, h, capture)
	merchantID = storeMerchantID(t, pool, storeID)
	creditAvailable(t, ledgerSvc, merchantID, storeID, available)
	return cookie, storeID, merchantID
}

func createVerifiedBank(t *testing.T, wd *application.WithdrawalService, storeID string) withdrawals.BankAccount {
	t.Helper()
	ctx := context.Background()
	acc, err := wd.CreateBankAccount(ctx, storeID, "BCA", "BCA", "Test Seller", "1234567890", false)
	if err != nil {
		t.Fatal(err)
	}
	acc, err = wd.VerifyBankAccount(ctx, storeID, acc.ID)
	if err != nil {
		t.Fatal(err)
	}
	return acc
}

func forceComplete(t *testing.T, wd *application.WithdrawalService, xd *xendit.Fake, storeID string, w withdrawals.Withdrawal) withdrawals.Withdrawal {
	t.Helper()
	ctx := context.Background()
	if w.Status == withdrawals.StatusCompleted {
		return w
	}
	ref := ""
	if w.ProviderDisbursementReference != nil {
		ref = *w.ProviderDisbursementReference
	}
	if ref != "" && !bytesHasPrefix(ref, "pending:") {
		_ = xd.SimulateDisburseComplete(ref)
		d, err := xd.GetDisbursement(ctx, ref)
		if err == nil {
			_ = wd.HandleDisbursementCallback(ctx, d.ProviderReference, "COMPLETED", d.ProviderFeeIDR, d.NetAmountIDR)
		}
	} else {
		_ = wd.ResolveUnknownOutcome(ctx, w.ID)
	}
	out, err := wd.GetWithdrawal(ctx, storeID, w.ID)
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func bytesHasPrefix(s, p string) bool {
	return len(s) >= len(p) && s[:len(p)] == p
}

func TestWithdrawalBelowMinRejected(t *testing.T) {
	h, wd, ledgerSvc, _, pool, capture := newWithdrawalStack(t)
	cookie, storeID, _ := setupSellerWithBalance(t, h, ledgerSvc, pool, capture, 200_000)
	bank := createVerifiedBank(t, wd, storeID)

	body, _ := json.Marshal(map[string]any{"amount": 49999, "bankAccountId": bank.ID})
	req := httptest.NewRequest(http.MethodPost, "/v1/stores/"+storeID+"/withdrawal-quotes", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", "idem-below-min")
	req.AddCookie(cookie)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code == http.StatusCreated {
		t.Fatalf("expected reject below min, got %d %s", rr.Code, rr.Body.String())
	}
}

func TestWithdrawalFee100kProvider2500(t *testing.T) {
	h, wd, ledgerSvc, xd, pool, capture := newWithdrawalStack(t)
	_, storeID, merchantID := setupSellerWithBalance(t, h, ledgerSvc, pool, capture, 200_000)
	bank := createVerifiedBank(t, wd, storeID)
	xd.DefaultProviderFeeIDR = 2500
	xd.AutoCompleteDisburse = true

	ctx := context.Background()
	q, err := wd.CreateQuote(ctx, storeID, "idem-fee-100k", 100_000, bank.ID, payments.PaymentModeSandbox)
	if err != nil {
		t.Fatal(err)
	}
	if q.PlatformFeeIDR != 3_000 || q.ProviderFeeIDR != 2_500 || q.TotalFeeIDR != 5_500 || q.NetDisbursementIDR != 94_500 {
		t.Fatalf("fees platform=%d provider=%d total=%d net=%d", q.PlatformFeeIDR, q.ProviderFeeIDR, q.TotalFeeIDR, q.NetDisbursementIDR)
	}

	w, err := wd.RequestWithdrawal(ctx, storeID, q.ID, "idem-wd-100k", payments.PaymentModeSandbox)
	if err != nil {
		t.Fatal(err)
	}
	w = forceComplete(t, wd, xd, storeID, w)
	if w.AmountIDR != 100_000 || w.TotalFeeIDR != 5_500 || w.NetDisbursementIDR != 94_500 {
		t.Fatalf("withdrawal amounts amount=%d total=%d net=%d status=%s", w.AmountIDR, w.TotalFeeIDR, w.NetDisbursementIDR, w.Status)
	}
	if w.Status != withdrawals.StatusCompleted {
		t.Fatalf("status %s want COMPLETED", w.Status)
	}
	bal, err := ledgerSvc.Store.GetBalance(ctx, merchantID, ledger.ModeSandbox)
	if err != nil {
		t.Fatal(err)
	}
	if bal.AvailableIDR != 100_000 {
		t.Fatalf("available %d want 100000", bal.AvailableIDR)
	}
}

func TestConcurrentWithdrawalsCannotOverspend(t *testing.T) {
	h, wd, ledgerSvc, _, pool, capture := newWithdrawalStack(t)
	_, storeID, merchantID := setupSellerWithBalance(t, h, ledgerSvc, pool, capture, 100_000)
	bank := createVerifiedBank(t, wd, storeID)
	ctx := context.Background()

	const n = 10
	var okCount int64
	var wg sync.WaitGroup
	wg.Add(n)
	for i := 0; i < n; i++ {
		i := i
		go func() {
			defer wg.Done()
			q, err := wd.CreateQuote(ctx, storeID, fmt.Sprintf("idem-q-conc-%d", i), 60_000, bank.ID, payments.PaymentModeSandbox)
			if err != nil {
				return
			}
			_, err = wd.RequestWithdrawal(ctx, storeID, q.ID, fmt.Sprintf("idem-w-conc-%d", i), payments.PaymentModeSandbox)
			if err == nil {
				atomic.AddInt64(&okCount, 1)
			}
		}()
	}
	wg.Wait()
	if okCount != 1 {
		t.Fatalf("successful concurrent withdrawals=%d want 1", okCount)
	}
	bal, err := ledgerSvc.Store.GetBalance(ctx, merchantID, ledger.ModeSandbox)
	if err != nil {
		t.Fatal(err)
	}
	if bal.AvailableIDR < 0 {
		t.Fatalf("available went negative: %d", bal.AvailableIDR)
	}
	// One 60k reserve from 100k → 40k available
	if bal.AvailableIDR != 40_000 {
		t.Fatalf("available %d want 40000", bal.AvailableIDR)
	}
}

func TestProviderTimeoutNoDoublePayout(t *testing.T) {
	h, wd, ledgerSvc, xd, pool, capture := newWithdrawalStack(t)
	_, storeID, merchantID := setupSellerWithBalance(t, h, ledgerSvc, pool, capture, 200_000)
	bank := createVerifiedBank(t, wd, storeID)
	ctx := context.Background()

	xd.ForceTimeoutDisburse = true
	xd.AutoCompleteDisburse = false

	q, err := wd.CreateQuote(ctx, storeID, "idem-timeout-q", 100_000, bank.ID, payments.PaymentModeSandbox)
	if err != nil {
		t.Fatal(err)
	}
	w, err := wd.RequestWithdrawal(ctx, storeID, q.ID, "idem-timeout-w", payments.PaymentModeSandbox)
	if err != nil {
		t.Fatal(err)
	}
	w, _ = wd.GetWithdrawal(ctx, storeID, w.ID)
	if w.Status != withdrawals.StatusUnknownOutcome && w.Status != withdrawals.StatusProcessing {
		t.Fatalf("status %s want UNKNOWN_OUTCOME or PROCESSING", w.Status)
	}
	count1 := xd.DisbursementCount()
	_ = wd.DisburseWithdrawal(ctx, w.ID)
	count2 := xd.DisbursementCount()
	if count2 != count1 {
		t.Fatalf("second payout created: before=%d after=%d", count1, count2)
	}
	bal, _ := ledgerSvc.Store.GetBalance(ctx, merchantID, ledger.ModeSandbox)
	if bal.AvailableIDR != 100_000 {
		t.Fatalf("available %d want 100000 (reserve held)", bal.AvailableIDR)
	}
	// Resolve via same reference — still one disbursement
	xd.ForceTimeoutDisburse = false
	xd.AutoCompleteDisburse = true
	_ = wd.ResolveUnknownOutcome(ctx, w.ID)
	if xd.DisbursementCount() != count1 {
		t.Fatalf("disbursement count changed %d -> %d", count1, xd.DisbursementCount())
	}
}

func TestWithdrawalQuoteIdempotent(t *testing.T) {
	h, wd, ledgerSvc, _, pool, capture := newWithdrawalStack(t)
	_, storeID, _ := setupSellerWithBalance(t, h, ledgerSvc, pool, capture, 200_000)
	bank := createVerifiedBank(t, wd, storeID)
	ctx := context.Background()
	q1, err := wd.CreateQuote(ctx, storeID, "idem-same", 100_000, bank.ID, payments.PaymentModeSandbox)
	if err != nil {
		t.Fatal(err)
	}
	q2, err := wd.CreateQuote(ctx, storeID, "idem-same", 100_000, bank.ID, payments.PaymentModeSandbox)
	if err != nil {
		t.Fatal(err)
	}
	if q1.ID != q2.ID {
		t.Fatalf("quote not idempotent %s vs %s", q1.ID, q2.ID)
	}
	_, err = wd.CreateQuote(ctx, storeID, "idem-same", 80_000, bank.ID, payments.PaymentModeSandbox)
	if err == nil {
		t.Fatal("expected conflict on different amount")
	}
}
