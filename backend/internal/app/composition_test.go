package app

import (
	"strings"
	"testing"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/middleware"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/redis"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/config"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/payments"
)

func TestPlatformHealth_FakeXenditDownOnLive(t *testing.T) {
	cfg := config.Config{AppEnv: config.EnvProduction}
	comps := platformComponentHealth(
		t.Context(), nil, nil,
		"fake", "fake", "fake", "smtp", "redis",
		noopRedis{}, nil, cfg,
	)
	var xenditStatus string
	for _, c := range comps {
		if c.Component == "xendit" {
			xenditStatus = c.Status
		}
	}
	if xenditStatus != "DOWN" {
		t.Fatalf("live+fake xendit must be DOWN, got %q components=%+v", xenditStatus, comps)
	}
}

func TestPlatformHealth_NoopMailDownOnLive(t *testing.T) {
	cfg := config.Config{AppEnv: config.EnvStaging}
	comps := platformComponentHealth(
		t.Context(), nil, nil,
		"real", "duitku", "xendit", "noop", "redis",
		noopRedis{}, nil, cfg,
	)
	var mailStatus string
	for _, c := range comps {
		if c.Component == "mail" {
			mailStatus = c.Status
		}
	}
	if mailStatus != "DOWN" {
		t.Fatalf("live+noop mail must be DOWN, got %q", mailStatus)
	}
}

func TestPlatformHealth_FakeOKOnLocal(t *testing.T) {
	cfg := config.Config{AppEnv: config.EnvLocal}
	comps := platformComponentHealth(
		t.Context(), nil, nil,
		"fake", "fake", "fake", "capture", "noop",
		noopRedis{}, nil, cfg,
	)
	for _, c := range comps {
		if c.Component == "xendit" && c.Status != "OK" {
			t.Fatalf("local fake xendit should be OK, got %q", c.Status)
		}
		if c.Component == "mail" && c.Status != "OK" {
			t.Fatalf("local capture mail should be OK, got %q", c.Status)
		}
	}
}

func TestHealthService_RejectsFakeOnLiveCheck(t *testing.T) {
	// Mirrors readiness check installed for live runtime.
	hs := application.NewHealthService(func() error {
		return errFakeXenditLive
	})
	if hs.Ready() {
		t.Fatal("expected not ready when fake xendit check fails")
	}
}

var errFakeXenditLive = errString("xendit: fake adapter not allowed on live runtime")

type errString string

func (e errString) Error() string { return string(e) }

func TestWireMailer_LiveRejectsCapture(t *testing.T) {
	cfg := config.Config{
		AppEnv:       config.EnvProduction,
		MailMode:     "capture",
		MailSMTPHost: "smtp.example.com",
		MailFrom:     "a@b.c",
	}
	_, _, err := wireMailer(cfg)
	if err == nil || !strings.Contains(err.Error(), "capture") {
		t.Fatalf("expected capture forbidden, got %v", err)
	}
}

func TestWireMailer_LocalCapture(t *testing.T) {
	cfg := config.Config{AppEnv: config.EnvLocal, MailMode: "capture"}
	m, kind, err := wireMailer(cfg)
	if err != nil {
		t.Fatal(err)
	}
	if kind != "capture" || m == nil {
		t.Fatalf("kind=%q mailer=%v", kind, m)
	}
}

func TestWireMailer_SMTP(t *testing.T) {
	cfg := config.Config{
		AppEnv:       config.EnvStaging,
		MailMode:     "smtp",
		MailSMTPHost: "smtp.example.com",
		MailSMTPPort: "587",
		MailFrom:     "noreply@example.com",
	}
	m, kind, err := wireMailer(cfg)
	if err != nil {
		t.Fatal(err)
	}
	if kind != "smtp" || m == nil {
		t.Fatalf("kind=%q", kind)
	}
}

func TestRateLimiterSelection_LocalIsProcessLocal(t *testing.T) {
	// Document expected selection: local uses TokenBucketLimiter type.
	lim := middleware.NewTokenBucketLimiter(10, 1)
	ok, _, _ := lim.Allow("1.2.3.4")
	if !ok {
		t.Fatal("process-local should allow first request")
	}
}

func TestRateLimiterSelection_RedisFailClosed(t *testing.T) {
	// Nil redis client inside limiter fails closed.
	lim := redis.NewTokenBucketLimiter(nil, 10, time.Minute)
	ok, _, _ := lim.Allow("1.2.3.4")
	if ok {
		t.Fatal("redis limiter without client must fail closed")
	}
}

func TestEffectiveWebhookToken_LocalDefault(t *testing.T) {
	cfg := config.Config{AppEnv: config.EnvLocal}
	if got := effectiveWebhookToken(cfg); got != "local-xendit-webhook-token" {
		t.Fatalf("got %q", got)
	}
}

func TestEffectiveWebhookToken_ProductionEmptyWhenMissing(t *testing.T) {
	cfg := config.Config{AppEnv: config.EnvProduction}
	if got := effectiveWebhookToken(cfg); got != "" {
		t.Fatalf("expected empty, got %q", got)
	}
}

func TestWireMoneyProviders_LocalFake(t *testing.T) {
	cfg := config.Config{
		AppEnv:               config.EnvLocal,
		PaymentProvider:      config.PaymentProviderFake,
		DisbursementProvider: config.DisbursementProviderFake,
	}
	qris, dis, fake, pk, dk, err := wireMoneyProviders(cfg, "xendit-primary", nil)
	if err != nil {
		t.Fatal(err)
	}
	if qris == nil || dis == nil || fake == nil {
		t.Fatal("expected fake adapters")
	}
	if pk != "fake" || dk != "fake" {
		t.Fatalf("kinds pay=%q dis=%q", pk, dk)
	}
}

func TestPaymentIntentIdentity(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name         string
		payProvider  string
		duitkuScope  string
		xenditScope  string
		wantProvider string
		wantScope    string
	}{
		{
			name:         "fake_keeps_xendit",
			payProvider:  config.PaymentProviderFake,
			xenditScope:  "xendit-primary",
			wantProvider: payments.ProviderXendit,
			wantScope:    "xendit-primary",
		},
		{
			name:         "xendit",
			payProvider:  config.PaymentProviderXendit,
			xenditScope:  "xendit-primary",
			wantProvider: payments.ProviderXendit,
			wantScope:    "xendit-primary",
		},
		{
			name:         "duitku_default_scope",
			payProvider:  config.PaymentProviderDuitku,
			xenditScope:  "xendit-primary",
			wantProvider: payments.ProviderDuitku,
			wantScope:    payments.AccountScopeDuitkuPrimary,
		},
		{
			name:         "duitku_custom_scope",
			payProvider:  config.PaymentProviderDuitku,
			duitkuScope:  "duitku-sandbox",
			xenditScope:  "xendit-primary",
			wantProvider: payments.ProviderDuitku,
			wantScope:    "duitku-sandbox",
		},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			cfg := config.Config{
				PaymentProvider:    tc.payProvider,
				DuitkuAccountScope: tc.duitkuScope,
			}
			gotP, gotS := paymentIntentIdentity(cfg, tc.xenditScope)
			if gotP != tc.wantProvider || gotS != tc.wantScope {
				t.Fatalf("got provider=%q scope=%q want %q %q", gotP, gotS, tc.wantProvider, tc.wantScope)
			}
		})
	}
}

func TestWireMoneyProviders_DuitkuRealSuccess(t *testing.T) {
	cfg := config.Config{
		AppEnv:                  config.EnvLocal,
		PaymentProvider:         config.PaymentProviderDuitku,
		DisbursementProvider:    config.DisbursementProviderFake,
		DuitkuMerchantCode:      "DXXXX",
		DuitkuAPIKey:            "duitku-test-key-not-real",
		DuitkuQRISPaymentMethod: "SP",
		DuitkuAccountScope:      "duitku-primary",
	}
	qris, dis, fake, pk, dk, err := wireMoneyProviders(cfg, "xendit-primary", nil)
	if err != nil {
		t.Fatal(err)
	}
	if pk != "duitku" || dk != "fake" {
		t.Fatalf("kinds pay=%q dis=%q", pk, dk)
	}
	if qris == nil {
		t.Fatal("expected duitku QRIS provider")
	}
	if fake == nil || dis != fake {
		t.Fatal("disbursement should be xendit fake")
	}
	// No network: NewReal only validates credentials.
	if _, ok := qris.(interface{ IsFake() bool }); ok {
		if qris.(interface{ IsFake() bool }).IsFake() {
			t.Fatal("duitku real must not report IsFake")
		}
	}
}

func TestWireMoneyProviders_DuitkuRequiresCredentials(t *testing.T) {
	cfg := config.Config{
		AppEnv:               config.EnvLocal,
		PaymentProvider:      config.PaymentProviderDuitku,
		DisbursementProvider: config.DisbursementProviderFake,
	}
	_, _, _, _, _, err := wireMoneyProviders(cfg, "xendit-primary", nil)
	if err == nil {
		t.Fatal("expected error without duitku credentials")
	}
}

func TestWireMoneyProviders_MixedFakePayRealDisburse(t *testing.T) {
	cfg := config.Config{
		AppEnv:               config.EnvLocal,
		PaymentProvider:      config.PaymentProviderFake,
		DisbursementProvider: config.DisbursementProviderXendit,
		XenditSecretKey:      "xnd_test_not_real",
	}
	qris, dis, fake, pk, dk, err := wireMoneyProviders(cfg, "xendit-primary", nil)
	if err != nil {
		t.Fatal(err)
	}
	if pk != "fake" || dk != "xendit" {
		t.Fatalf("kinds pay=%q dis=%q", pk, dk)
	}
	if fake == nil {
		t.Fatal("expected xdFake for payment side")
	}
	if qris != fake {
		t.Fatal("qris should be fake")
	}
	if dis == nil || dis == fake {
		t.Fatal("disburse should be real xendit, not fake")
	}
}

func TestWireMoneyProviders_ProductionRejectsFake(t *testing.T) {
	cfg := config.Config{
		AppEnv:               config.EnvProduction,
		PaymentProvider:      config.PaymentProviderFake,
		DisbursementProvider: config.DisbursementProviderFake,
	}
	_, _, _, _, _, err := wireMoneyProviders(cfg, "xendit-primary", nil)
	if err == nil || !strings.Contains(err.Error(), "fake") {
		t.Fatalf("expected production fake reject, got %v", err)
	}
}

func TestWireMoneyProviders_StagingAllowsFakeWithFlag(t *testing.T) {
	cfg := config.Config{
		AppEnv:               config.EnvStaging,
		PaymentProvider:      config.PaymentProviderFake,
		DisbursementProvider: config.DisbursementProviderFake,
		AllowFakeProviders:   true,
	}
	_, _, _, pk, dk, err := wireMoneyProviders(cfg, "xendit-primary", nil)
	if err != nil {
		t.Fatal(err)
	}
	if pk != "fake" || dk != "fake" {
		t.Fatalf("kinds pay=%q dis=%q", pk, dk)
	}
}

// PROD-B40: payment=duitku must not select Xendit for QRIS; disbursement stays independent.
func TestWireMoneyProviders_DuitkuPaymentDoesNotUseXenditQRIS(t *testing.T) {
	cfg := config.Config{
		AppEnv:                  config.EnvLocal,
		PaymentProvider:         config.PaymentProviderDuitku,
		DisbursementProvider:    config.DisbursementProviderXendit,
		DuitkuMerchantCode:      "DXXXX",
		DuitkuAPIKey:            "duitku-test-key-not-real",
		DuitkuQRISPaymentMethod: "SP",
		DuitkuAccountScope:      "duitku-primary",
		XenditSecretKey:         "xnd_test_not_real",
	}
	qris, dis, fake, pk, dk, err := wireMoneyProviders(cfg, "xendit-primary", nil)
	if err != nil {
		t.Fatal(err)
	}
	if pk != "duitku" {
		t.Fatalf("payment kind want duitku got %q", pk)
	}
	if dk != "xendit" {
		t.Fatalf("disbursement kind want xendit got %q", dk)
	}
	if qris == nil {
		t.Fatal("expected duitku QRIS provider")
	}
	if fake != nil {
		t.Fatal("xdFake must be nil when payment is not fake and disbursement is real xendit")
	}
	if dis == nil {
		t.Fatal("expected xendit disbursement provider")
	}
	// Duitku Real is not Xendit Fake; type assert IsFake if present must be false.
	if f, ok := qris.(interface{ IsFake() bool }); ok && f.IsFake() {
		t.Fatal("payment QRIS must not be xendit.Fake when payment=duitku")
	}
	// Disbursement is Xendit Real (not fake); QRIS is Duitku — kinds already assert split.
	if f, ok := dis.(interface{ IsFake() bool }); ok && f.IsFake() {
		t.Fatal("disbursement must be real xendit when DISBURSEMENT_PROVIDER=xendit")
	}
}

func TestWireMoneyProviders_XenditPaymentLegacyKind(t *testing.T) {
	cfg := config.Config{
		AppEnv:               config.EnvLocal,
		PaymentProvider:      config.PaymentProviderXendit,
		DisbursementProvider: config.DisbursementProviderXendit,
		XenditSecretKey:      "xnd_test_not_real",
	}
	qris, dis, fake, pk, dk, err := wireMoneyProviders(cfg, "xendit-primary", nil)
	if err != nil {
		t.Fatal(err)
	}
	if pk != "xendit" || dk != "xendit" {
		t.Fatalf("kinds pay=%q dis=%q", pk, dk)
	}
	if fake != nil {
		t.Fatal("real xendit both sides should not allocate Fake")
	}
	if qris == nil || dis == nil {
		t.Fatal("expected real adapters")
	}
	if f, ok := qris.(interface{ IsFake() bool }); ok && f.IsFake() {
		t.Fatal("legacy payment=xendit must use real adapter")
	}
}

func TestPlatformHealth_MessageDistinguishesPaymentDisbursement(t *testing.T) {
	cfg := config.Config{AppEnv: config.EnvLocal}
	comps := platformComponentHealth(
		t.Context(), nil, nil,
		"mixed", "duitku", "xendit", "capture", "noop",
		noopRedis{}, nil, cfg,
	)
	var msg string
	for _, c := range comps {
		if c.Component == "xendit" {
			msg = c.Message
		}
	}
	if !strings.Contains(msg, "payment=duitku") || !strings.Contains(msg, "disbursement=xendit") {
		t.Fatalf("health message should distinguish providers, got %q", msg)
	}
}
