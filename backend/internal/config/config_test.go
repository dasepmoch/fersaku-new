package config_test

import (
	"strings"
	"testing"

	"github.com/dasepmoch/fersaku-new/backend/internal/config"
)

func TestLoadDefaults(t *testing.T) {
	t.Setenv("APP_ENV", "local")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("LOG_LEVEL", "info")
	t.Setenv("XENDIT_MODE", "fake")
	// Ensure optional secrets do not force production rules.
	t.Setenv("SESSION_SECRET", "")
	t.Setenv("DATABASE_URL", "")
	t.Setenv("REDIS_URL", "")
	t.Setenv("PAYMENT_PROVIDER", "")
	t.Setenv("DISBURSEMENT_PROVIDER", "")

	cfg, err := config.Load("fersaku-api")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.HTTPAddr != ":8080" {
		t.Fatalf("HTTPAddr = %q", cfg.HTTPAddr)
	}
	if cfg.AppEnv != config.EnvLocal {
		t.Fatalf("AppEnv = %q", cfg.AppEnv)
	}
	if !cfg.UseFakeXendit() {
		t.Fatal("expected fake xendit in local")
	}
	if !cfg.UseFakePayment() || !cfg.UseFakeDisbursement() {
		t.Fatalf("expected fake payment+disbursement, got pay=%q dis=%q", cfg.PaymentProvider, cfg.DisbursementProvider)
	}
}

func TestLoadInvalidEnv(t *testing.T) {
	t.Setenv("APP_ENV", "dev")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("LOG_LEVEL", "info")

	_, err := config.Load("fersaku-api")
	if err == nil {
		t.Fatal("expected error for invalid APP_ENV")
	}
}

func TestLoadInvalidLogLevel(t *testing.T) {
	t.Setenv("APP_ENV", "local")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("LOG_LEVEL", "verbose")

	_, err := config.Load("fersaku-api")
	if err == nil {
		t.Fatal("expected error for invalid LOG_LEVEL")
	}
}

func TestLocalAllowsMissingSecretsAndFakeXendit(t *testing.T) {
	t.Setenv("APP_ENV", "local")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("LOG_LEVEL", "info")
	t.Setenv("XENDIT_MODE", "fake")
	t.Setenv("SESSION_SECRET", "")
	t.Setenv("CSRF_SECRET", "")
	t.Setenv("XENDIT_SECRET_KEY", "")
	t.Setenv("DATABASE_URL", "")
	t.Setenv("REDIS_URL", "")
	t.Setenv("PAYMENT_PROVIDER", "")
	t.Setenv("DISBURSEMENT_PROVIDER", "")

	cfg, err := config.Load("fersaku-api")
	if err != nil {
		t.Fatalf("local should allow missing production secrets: %v", err)
	}
	if cfg.IsProduction() {
		t.Fatal("expected non-production")
	}
}

func TestLocalAllowsExplicitFakeProviders(t *testing.T) {
	t.Setenv("APP_ENV", "local")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("LOG_LEVEL", "info")
	t.Setenv("PAYMENT_PROVIDER", "fake")
	t.Setenv("DISBURSEMENT_PROVIDER", "fake")
	t.Setenv("XENDIT_MODE", "")
	t.Setenv("XENDIT_SECRET_KEY", "")
	t.Setenv("XENDIT_WEBHOOK_TOKEN", "")

	cfg, err := config.Load("fersaku-api")
	if err != nil {
		t.Fatalf("local fake providers: %v", err)
	}
	if cfg.PaymentProvider != config.PaymentProviderFake {
		t.Fatalf("PaymentProvider=%q", cfg.PaymentProvider)
	}
	if cfg.DisbursementProvider != config.DisbursementProviderFake {
		t.Fatalf("DisbursementProvider=%q", cfg.DisbursementProvider)
	}
	if !cfg.UseFakePayment() || !cfg.UseFakeDisbursement() || !cfg.UseFakeXendit() {
		t.Fatal("expected all fake helpers true")
	}
}

func TestLocalOptionalURLValidation(t *testing.T) {
	t.Setenv("APP_ENV", "local")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("LOG_LEVEL", "info")
	t.Setenv("XENDIT_MODE", "fake")
	t.Setenv("DATABASE_URL", "postgres://fersaku:fersaku_local@localhost:5433/fersaku?sslmode=disable")
	t.Setenv("REDIS_URL", "redis://localhost:6380/0")

	cfg, err := config.Load("fersaku-api")
	if err != nil {
		t.Fatalf("valid optional URLs: %v", err)
	}
	if cfg.DatabaseURL == "" || cfg.RedisURL == "" {
		t.Fatal("expected URLs set")
	}
}

func TestLocalRejectsMalformedDatabaseURL(t *testing.T) {
	t.Setenv("APP_ENV", "local")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("LOG_LEVEL", "info")
	t.Setenv("XENDIT_MODE", "fake")
	t.Setenv("DATABASE_URL", "not-a-url")

	_, err := config.Load("fersaku-api")
	if err == nil {
		t.Fatal("expected error for malformed DATABASE_URL")
	}
}

func TestProductionRejectsFakeXendit(t *testing.T) {
	setMinimalProduction(t)
	t.Setenv("XENDIT_MODE", "fake")
	t.Setenv("PAYMENT_PROVIDER", "")
	t.Setenv("DISBURSEMENT_PROVIDER", "")

	_, err := config.Load("fersaku-api")
	if err == nil || !strings.Contains(err.Error(), "fake") {
		t.Fatalf("expected fake forbidden in production, got %v", err)
	}
}

func TestProductionRejectsFakePaymentProvider(t *testing.T) {
	setMinimalProduction(t)
	t.Setenv("PAYMENT_PROVIDER", "fake")
	t.Setenv("DISBURSEMENT_PROVIDER", "xendit")
	t.Setenv("XENDIT_MODE", "live")

	_, err := config.Load("fersaku-api")
	if err == nil || !strings.Contains(err.Error(), "PAYMENT_PROVIDER=fake") {
		t.Fatalf("expected PAYMENT_PROVIDER=fake forbidden, got %v", err)
	}
}

func TestProductionRejectsFakeDisbursementProvider(t *testing.T) {
	setMinimalProduction(t)
	t.Setenv("PAYMENT_PROVIDER", "xendit")
	t.Setenv("DISBURSEMENT_PROVIDER", "fake")
	t.Setenv("XENDIT_MODE", "live")

	_, err := config.Load("fersaku-api")
	if err == nil || !strings.Contains(err.Error(), "DISBURSEMENT_PROVIDER=fake") {
		t.Fatalf("expected DISBURSEMENT_PROVIDER=fake forbidden, got %v", err)
	}
}

func TestProductionRejectsFakeEvenWithAllowFakeProviders(t *testing.T) {
	setMinimalProduction(t)
	t.Setenv("PAYMENT_PROVIDER", "fake")
	t.Setenv("DISBURSEMENT_PROVIDER", "fake")
	t.Setenv("ALLOW_FAKE_PROVIDERS", "1")
	t.Setenv("XENDIT_MODE", "")

	_, err := config.Load("fersaku-api")
	if err == nil || !strings.Contains(err.Error(), "fake") {
		t.Fatalf("production must reject fake even with ALLOW_FAKE_PROVIDERS, got %v", err)
	}
}

func TestProductionRequiresSessionSecret(t *testing.T) {
	setMinimalProduction(t)
	t.Setenv("SESSION_SECRET", "")

	_, err := config.Load("fersaku-api")
	if err == nil || !strings.Contains(err.Error(), "SESSION_SECRET") {
		t.Fatalf("expected SESSION_SECRET required, got %v", err)
	}
}

func TestProductionRejectsLocalDevPlaceholder(t *testing.T) {
	setMinimalProduction(t)
	t.Setenv("SESSION_SECRET", "local-dev-session-secret-not-for-prod-xxxxxxxx")

	_, err := config.Load("fersaku-api")
	if err == nil || !strings.Contains(err.Error(), "placeholder") {
		t.Fatalf("expected placeholder rejection, got %v", err)
	}
}

func TestProductionRejectsNonTLSRedis(t *testing.T) {
	setMinimalProduction(t)
	t.Setenv("REDIS_URL", "redis://redis.example:6379/0")

	_, err := config.Load("fersaku-api")
	if err == nil || !strings.Contains(err.Error(), "rediss") {
		t.Fatalf("expected rediss required, got %v", err)
	}
}

func TestProductionRejectsLocalMinIO(t *testing.T) {
	setMinimalProduction(t)
	t.Setenv("R2_ENDPOINT", "http://minio:9000")

	_, err := config.Load("fersaku-api")
	if err == nil || !strings.Contains(err.Error(), "local") {
		t.Fatalf("expected local MinIO forbidden, got %v", err)
	}
}

func TestProductionAcceptsHardenedConfig(t *testing.T) {
	setMinimalProduction(t)

	cfg, err := config.Load("fersaku-api")
	if err != nil {
		t.Fatalf("production hardened config should load: %v", err)
	}
	if !cfg.IsProduction() {
		t.Fatal("expected production")
	}
	if cfg.UseFakeXendit() {
		t.Fatal("expected live xendit")
	}
	if cfg.PaymentProvider != config.PaymentProviderXendit {
		t.Fatalf("PaymentProvider=%q", cfg.PaymentProvider)
	}
	if cfg.DisbursementProvider != config.DisbursementProviderXendit {
		t.Fatalf("DisbursementProvider=%q", cfg.DisbursementProvider)
	}
}

func setMinimalProduction(t *testing.T) {
	t.Helper()
	t.Setenv("APP_ENV", "production")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("LOG_LEVEL", "info")
	t.Setenv("XENDIT_MODE", "live")
	t.Setenv("PAYMENT_PROVIDER", "")
	t.Setenv("DISBURSEMENT_PROVIDER", "")
	t.Setenv("ALLOW_FAKE_PROVIDERS", "")
	t.Setenv("XENDIT_SECRET_KEY", "xnd_production_test_key_not_real")
	t.Setenv("XENDIT_WEBHOOK_TOKEN", "webhook_token_production_test_xx")
	t.Setenv("SESSION_SECRET", "prod-session-secret-32chars-min!!")
	t.Setenv("CSRF_SECRET", "prod-csrf-secret-32-characters!!")
	t.Setenv("KYC_ENCRYPTION_KEY", "prod-kyc-key-32-bytes-minimum!!!!")
	t.Setenv("DATABASE_URL", "postgres://user:pass@db.example:5432/fersaku?sslmode=require")
	t.Setenv("REDIS_URL", "rediss://:pass@redis.example:6379/0")
	t.Setenv("R2_ENDPOINT", "https://accountid.r2.cloudflarestorage.com")
	t.Setenv("R2_BUCKET_PRIVATE", "fersaku-private")
	t.Setenv("R2_BUCKET_PUBLIC", "fersaku-public")
	t.Setenv("R2_ACCESS_KEY_ID", "r2-access-key")
	t.Setenv("R2_SECRET_ACCESS_KEY", "r2-secret-key")
	// INT-180: production requires real SMTP (secrets owner-filled).
	t.Setenv("MAIL_MODE", "smtp")
	t.Setenv("MAIL_SMTP_HOST", "smtp.example.com")
	t.Setenv("MAIL_SMTP_PORT", "587")
	t.Setenv("MAIL_FROM", "noreply@example.com")
	// GAP-02 malware scanner
	t.Setenv("MALWARE_SCANNER", "clamav")
	t.Setenv("MALWARE_SCANNER_ADDRESS", "unix:///var/run/clamav/clamd.ctl")
	// GAP-03: explicit direct mode when no LB CIDRs in unit tests.
	t.Setenv("TRUSTED_PROXY_MODE", "direct")
	t.Setenv("TRUSTED_PROXY_CIDRS", "")
	// GAP-07: protect /metrics on live runtimes.
	t.Setenv("METRICS_BEARER_TOKEN", "test-metrics-scrape-token")
	t.Setenv("METRICS_ALLOW_CIDRS", "")
}

func setMinimalStaging(t *testing.T) {
	t.Helper()
	t.Setenv("APP_ENV", "staging")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("LOG_LEVEL", "info")
	t.Setenv("XENDIT_MODE", "live")
	t.Setenv("PAYMENT_PROVIDER", "")
	t.Setenv("DISBURSEMENT_PROVIDER", "")
	t.Setenv("ALLOW_FAKE_PROVIDERS", "")
	t.Setenv("XENDIT_SECRET_KEY", "xnd_staging_test")
	t.Setenv("XENDIT_WEBHOOK_TOKEN", "webhook_staging")
	t.Setenv("SESSION_SECRET", "staging-session-secret-16")
	t.Setenv("CSRF_SECRET", "staging-csrf-secret")
	t.Setenv("REDIS_URL", "redis://localhost:6379/0")
	t.Setenv("MAIL_MODE", "smtp")
	t.Setenv("MAIL_SMTP_HOST", "smtp.example.com")
	t.Setenv("MAIL_FROM", "noreply@example.com")
	// GAP-02 malware scanner
	t.Setenv("MALWARE_SCANNER", "clamav")
	t.Setenv("MALWARE_SCANNER_ADDRESS", "unix:///var/run/clamav/clamd.ctl")
	// GAP-03: explicit direct mode when no LB CIDRs in unit tests.
	t.Setenv("TRUSTED_PROXY_MODE", "direct")
	t.Setenv("TRUSTED_PROXY_CIDRS", "")
	// GAP-07: protect /metrics on live runtimes.
	t.Setenv("METRICS_BEARER_TOKEN", "test-metrics-scrape-token")
	t.Setenv("METRICS_ALLOW_CIDRS", "")
}

func TestStagingRejectsFakeXendit(t *testing.T) {
	t.Setenv("APP_ENV", "staging")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("LOG_LEVEL", "info")
	t.Setenv("XENDIT_MODE", "fake")
	t.Setenv("PAYMENT_PROVIDER", "")
	t.Setenv("DISBURSEMENT_PROVIDER", "")
	t.Setenv("ALLOW_FAKE_PROVIDERS", "")
	t.Setenv("SESSION_SECRET", "staging-session-secret-16")
	t.Setenv("CSRF_SECRET", "staging-csrf-secret")
	t.Setenv("REDIS_URL", "redis://localhost:6379/0")
	t.Setenv("MAIL_SMTP_HOST", "smtp.example.com")
	t.Setenv("MAIL_FROM", "noreply@example.com")
	t.Setenv("MALWARE_SCANNER", "clamav")
	t.Setenv("MALWARE_SCANNER_ADDRESS", "unix:///var/run/clamav/clamd.ctl")
	t.Setenv("TRUSTED_PROXY_MODE", "direct")
	t.Setenv("METRICS_BEARER_TOKEN", "test-metrics-scrape-token")

	_, err := config.Load("fersaku-api")
	if err == nil || !strings.Contains(err.Error(), "fake") {
		t.Fatalf("expected staging fake xendit forbidden, got %v", err)
	}
}

func TestLiveRequiresMetricsProtection(t *testing.T) {
	setMinimalStaging(t)
	t.Setenv("METRICS_BEARER_TOKEN", "")
	t.Setenv("METRICS_ALLOW_CIDRS", "")
	_, err := config.Load("fersaku-api")
	if err == nil || !strings.Contains(err.Error(), "METRICS_") {
		t.Fatalf("expected metrics protection required, got %v", err)
	}
}

func TestStagingAllowsMetricsCIDROnly(t *testing.T) {
	setMinimalStaging(t)
	t.Setenv("METRICS_BEARER_TOKEN", "")
	t.Setenv("METRICS_ALLOW_CIDRS", "10.0.0.0/8")
	cfg, err := config.Load("fersaku-api")
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.MetricsAllowCIDRs) != 1 {
		t.Fatalf("cidrs=%v", cfg.MetricsAllowCIDRs)
	}
}

func TestProductionRejectsLocalpassScanner(t *testing.T) {
	setMinimalProduction(t)
	t.Setenv("MALWARE_SCANNER", "localpass")
	_, err := config.Load("fersaku-api")
	if err == nil || !strings.Contains(err.Error(), "localpass") {
		t.Fatalf("expected production localpass forbidden, got %v", err)
	}
}

func TestLocalDefaultsLocalpassScanner(t *testing.T) {
	t.Setenv("APP_ENV", "local")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("LOG_LEVEL", "info")
	t.Setenv("XENDIT_MODE", "fake")
	t.Setenv("MALWARE_SCANNER", "")
	cfg, err := config.Load("fersaku-api")
	if err != nil {
		t.Fatal(err)
	}
	if cfg.EffectiveMalwareScanner() != "localpass" {
		t.Fatalf("got %s", cfg.EffectiveMalwareScanner())
	}
}

func TestStagingRejectsFakeWithoutAllowFlag(t *testing.T) {
	setMinimalStaging(t)
	t.Setenv("PAYMENT_PROVIDER", "fake")
	t.Setenv("DISBURSEMENT_PROVIDER", "fake")
	t.Setenv("XENDIT_MODE", "")
	t.Setenv("ALLOW_FAKE_PROVIDERS", "0")

	_, err := config.Load("fersaku-api")
	if err == nil || !strings.Contains(err.Error(), "fake") {
		t.Fatalf("expected staging fake forbidden without drill flag, got %v", err)
	}
}

func TestStagingAllowsFakeWithAllowFakeProviders(t *testing.T) {
	setMinimalStaging(t)
	t.Setenv("PAYMENT_PROVIDER", "fake")
	t.Setenv("DISBURSEMENT_PROVIDER", "fake")
	t.Setenv("XENDIT_MODE", "")
	t.Setenv("ALLOW_FAKE_PROVIDERS", "1")
	// Fake path: no Xendit keys required.
	t.Setenv("XENDIT_SECRET_KEY", "")
	t.Setenv("XENDIT_WEBHOOK_TOKEN", "")

	cfg, err := config.Load("fersaku-api")
	if err != nil {
		t.Fatalf("staging drill with ALLOW_FAKE_PROVIDERS should load: %v", err)
	}
	if !cfg.AllowFakeProviders {
		t.Fatal("expected AllowFakeProviders")
	}
	if !cfg.UseFakePayment() || !cfg.UseFakeDisbursement() {
		t.Fatal("expected fake providers")
	}
}

func TestStagingRejectsCaptureMail(t *testing.T) {
	t.Setenv("APP_ENV", "staging")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("LOG_LEVEL", "info")
	t.Setenv("XENDIT_MODE", "live")
	t.Setenv("XENDIT_SECRET_KEY", "xnd_staging_test")
	t.Setenv("XENDIT_WEBHOOK_TOKEN", "webhook_staging")
	t.Setenv("MALWARE_SCANNER", "clamav")
	t.Setenv("MALWARE_SCANNER_ADDRESS", "unix:///var/run/clamav/clamd.ctl")
	t.Setenv("SESSION_SECRET", "staging-session-secret-16")
	t.Setenv("CSRF_SECRET", "staging-csrf-secret")
	t.Setenv("REDIS_URL", "redis://localhost:6379/0")
	t.Setenv("MAIL_MODE", "capture")
	t.Setenv("MAIL_SMTP_HOST", "smtp.example.com")
	t.Setenv("MAIL_FROM", "noreply@example.com")
	t.Setenv("TRUSTED_PROXY_MODE", "direct")
	t.Setenv("METRICS_BEARER_TOKEN", "test-metrics-scrape-token")

	_, err := config.Load("fersaku-api")
	if err == nil || !strings.Contains(err.Error(), "capture") {
		t.Fatalf("expected staging capture mail forbidden, got %v", err)
	}
}

func TestProductionRejectsNoopMail(t *testing.T) {
	setMinimalProduction(t)
	t.Setenv("MAIL_MODE", "noop")

	_, err := config.Load("fersaku-api")
	if err == nil || !strings.Contains(err.Error(), "noop") {
		t.Fatalf("expected production noop mail forbidden, got %v", err)
	}
}

func TestLegacyXenditModeLiveMapsProvidersAndRequiresKeys(t *testing.T) {
	t.Setenv("APP_ENV", "local")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("LOG_LEVEL", "info")
	t.Setenv("XENDIT_MODE", "live")
	t.Setenv("PAYMENT_PROVIDER", "")
	t.Setenv("DISBURSEMENT_PROVIDER", "")
	t.Setenv("XENDIT_SECRET_KEY", "")
	t.Setenv("XENDIT_WEBHOOK_TOKEN", "")

	_, err := config.Load("fersaku-api")
	if err == nil || !strings.Contains(err.Error(), "XENDIT_SECRET_KEY") {
		t.Fatalf("expected keys required for live mapping, got %v", err)
	}

	t.Setenv("XENDIT_SECRET_KEY", "xnd_local_test")
	t.Setenv("XENDIT_WEBHOOK_TOKEN", "webhook_local")
	cfg, err := config.Load("fersaku-api")
	if err != nil {
		t.Fatalf("live with keys: %v", err)
	}
	if cfg.PaymentProvider != config.PaymentProviderXendit {
		t.Fatalf("PaymentProvider=%q", cfg.PaymentProvider)
	}
	if cfg.DisbursementProvider != config.DisbursementProviderXendit {
		t.Fatalf("DisbursementProvider=%q", cfg.DisbursementProvider)
	}
	if cfg.UseFakeXendit() || cfg.UseFakePayment() || cfg.UseFakeDisbursement() {
		t.Fatal("expected non-fake after XENDIT_MODE=live")
	}
	if cfg.XenditMode != config.XenditModeLive {
		t.Fatalf("XenditMode=%q", cfg.XenditMode)
	}
}

func TestLegacyXenditModeFakeMapsProvidersOnLocal(t *testing.T) {
	t.Setenv("APP_ENV", "local")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("LOG_LEVEL", "info")
	t.Setenv("XENDIT_MODE", "fake")
	t.Setenv("PAYMENT_PROVIDER", "")
	t.Setenv("DISBURSEMENT_PROVIDER", "")

	cfg, err := config.Load("fersaku-api")
	if err != nil {
		t.Fatalf("legacy fake: %v", err)
	}
	if cfg.PaymentProvider != config.PaymentProviderFake || cfg.DisbursementProvider != config.DisbursementProviderFake {
		t.Fatalf("providers pay=%q dis=%q", cfg.PaymentProvider, cfg.DisbursementProvider)
	}
}

func TestExplicitProvidersOverrideLegacyMode(t *testing.T) {
	t.Setenv("APP_ENV", "local")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("LOG_LEVEL", "info")
	t.Setenv("XENDIT_MODE", "live")
	t.Setenv("PAYMENT_PROVIDER", "fake")
	t.Setenv("DISBURSEMENT_PROVIDER", "fake")
	t.Setenv("XENDIT_SECRET_KEY", "")
	t.Setenv("XENDIT_WEBHOOK_TOKEN", "")

	cfg, err := config.Load("fersaku-api")
	if err != nil {
		t.Fatalf("explicit fake should win over XENDIT_MODE=live on local: %v", err)
	}
	if !cfg.UseFakePayment() || !cfg.UseFakeDisbursement() {
		t.Fatal("expected explicit fake providers")
	}
	// Both fake → derived XenditMode=fake for compat.
	if cfg.XenditMode != config.XenditModeFake {
		t.Fatalf("XenditMode=%q", cfg.XenditMode)
	}
}

func TestLocalDuitkuRequiresCredentials(t *testing.T) {
	t.Setenv("APP_ENV", "local")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("LOG_LEVEL", "info")
	t.Setenv("PAYMENT_PROVIDER", "duitku")
	t.Setenv("DISBURSEMENT_PROVIDER", "fake")
	t.Setenv("DUITKU_MERCHANT_CODE", "")
	t.Setenv("DUITKU_API_KEY", "")

	_, err := config.Load("fersaku-api")
	if err == nil || !strings.Contains(err.Error(), "DUITKU_MERCHANT_CODE") {
		t.Fatalf("expected duitku credentials required, got %v", err)
	}

	t.Setenv("DUITKU_MERCHANT_CODE", "DXXXX")
	t.Setenv("DUITKU_API_KEY", "duitku-test-key-not-real")
	cfg, err := config.Load("fersaku-api")
	if err != nil {
		t.Fatalf("duitku with keys: %v", err)
	}
	if cfg.PaymentProvider != config.PaymentProviderDuitku {
		t.Fatalf("PaymentProvider=%q", cfg.PaymentProvider)
	}
	if cfg.DuitkuQRISPaymentMethod != "SP" {
		t.Fatalf("DuitkuQRISPaymentMethod default=%q", cfg.DuitkuQRISPaymentMethod)
	}
	if cfg.DuitkuAccountScope != "duitku-primary" {
		t.Fatalf("DuitkuAccountScope=%q", cfg.DuitkuAccountScope)
	}
}

func TestProductionDuitkuRejectsSandboxBaseURL(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("LOG_LEVEL", "info")
	t.Setenv("PAYMENT_PROVIDER", "duitku")
	t.Setenv("DISBURSEMENT_PROVIDER", "xendit")
	t.Setenv("DUITKU_MERCHANT_CODE", "DXXXX")
	t.Setenv("DUITKU_API_KEY", "duitku-test-key-not-real")
	t.Setenv("DUITKU_ENV", "sandbox")
	t.Setenv("DUITKU_BASE_URL", "https://sandbox.duitku.com")
	t.Setenv("SESSION_SECRET", "production-session-secret-32chars-min!!")
	t.Setenv("CSRF_SECRET", "production-csrf-secret-32chars-min!!!!!")
	t.Setenv("KYC_ENCRYPTION_KEY", "0123456789abcdef0123456789abcdef")
	t.Setenv("DATABASE_URL", "postgres://u:p@db:5432/fersaku?sslmode=require")
	t.Setenv("REDIS_URL", "rediss://redis:6379/0")
	t.Setenv("R2_ENDPOINT", "https://r2.example.com")
	t.Setenv("R2_BUCKET_PRIVATE", "private")
	t.Setenv("R2_BUCKET_PUBLIC", "public")
	t.Setenv("R2_ACCESS_KEY_ID", "ak")
	t.Setenv("R2_SECRET_ACCESS_KEY", "sk")
	t.Setenv("XENDIT_SECRET_KEY", "xnd_production_test_key_not_real")
	t.Setenv("XENDIT_WEBHOOK_TOKEN", "webhook_token_production_test_xx")
	t.Setenv("MAIL_MODE", "smtp")
	t.Setenv("MAIL_SMTP_HOST", "smtp.example.com")
	t.Setenv("MAIL_FROM", "noreply@example.com")
	t.Setenv("MALWARE_SCANNER", "clamav")
	t.Setenv("MALWARE_SCANNER_ADDRESS", "unix:///var/run/clamav/clamd.ctl")
	t.Setenv("TRUSTED_PROXY_MODE", "direct")
	t.Setenv("METRICS_BEARER_TOKEN", "test-metrics-scrape-token")

	_, err := config.Load("fersaku-api")
	if err == nil || !strings.Contains(err.Error(), "sandbox") {
		t.Fatalf("expected production+sandbox rejected, got %v", err)
	}
}

func TestProductionDuitkuAllowsPassport(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("LOG_LEVEL", "info")
	t.Setenv("PAYMENT_PROVIDER", "duitku")
	t.Setenv("DISBURSEMENT_PROVIDER", "xendit")
	t.Setenv("DUITKU_MERCHANT_CODE", "DXXXX")
	t.Setenv("DUITKU_API_KEY", "duitku-test-key-not-real")
	t.Setenv("DUITKU_ENV", "production")
	t.Setenv("DUITKU_BASE_URL", "")
	t.Setenv("SESSION_SECRET", "production-session-secret-32chars-min!!")
	t.Setenv("CSRF_SECRET", "production-csrf-secret-32chars-min!!!!!")
	t.Setenv("KYC_ENCRYPTION_KEY", "0123456789abcdef0123456789abcdef")
	t.Setenv("DATABASE_URL", "postgres://u:p@db:5432/fersaku?sslmode=require")
	t.Setenv("REDIS_URL", "rediss://redis:6379/0")
	t.Setenv("R2_ENDPOINT", "https://r2.example.com")
	t.Setenv("R2_BUCKET_PRIVATE", "private")
	t.Setenv("R2_BUCKET_PUBLIC", "public")
	t.Setenv("R2_ACCESS_KEY_ID", "ak")
	t.Setenv("R2_SECRET_ACCESS_KEY", "sk")
	t.Setenv("XENDIT_SECRET_KEY", "xnd_production_test_key_not_real")
	t.Setenv("XENDIT_WEBHOOK_TOKEN", "webhook_token_production_test_xx")
	t.Setenv("MAIL_MODE", "smtp")
	t.Setenv("MAIL_SMTP_HOST", "smtp.example.com")
	t.Setenv("MAIL_FROM", "noreply@example.com")
	t.Setenv("MALWARE_SCANNER", "clamav")
	t.Setenv("MALWARE_SCANNER_ADDRESS", "unix:///var/run/clamav/clamd.ctl")
	t.Setenv("TRUSTED_PROXY_MODE", "direct")
	t.Setenv("METRICS_BEARER_TOKEN", "test-metrics-scrape-token")

	cfg, err := config.Load("fersaku-api")
	if err != nil {
		t.Fatalf("production duitku empty base should load: %v", err)
	}
	if cfg.DuitkuEnv != "production" {
		t.Fatalf("DuitkuEnv=%q", cfg.DuitkuEnv)
	}
}

func TestRejectUnknownPaymentProvider(t *testing.T) {
	t.Setenv("APP_ENV", "local")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("LOG_LEVEL", "info")
	t.Setenv("PAYMENT_PROVIDER", "stripe")
	t.Setenv("DISBURSEMENT_PROVIDER", "fake")

	_, err := config.Load("fersaku-api")
	if err == nil || !strings.Contains(err.Error(), "PAYMENT_PROVIDER") {
		t.Fatalf("expected unknown payment provider error, got %v", err)
	}
}

func TestRejectUnknownDisbursementProvider(t *testing.T) {
	t.Setenv("APP_ENV", "local")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("LOG_LEVEL", "info")
	t.Setenv("PAYMENT_PROVIDER", "fake")
	t.Setenv("DISBURSEMENT_PROVIDER", "duitku")

	_, err := config.Load("fersaku-api")
	if err == nil || !strings.Contains(err.Error(), "DISBURSEMENT_PROVIDER") {
		t.Fatalf("expected unknown disbursement provider error, got %v", err)
	}
}

func TestMixedProvidersLocalFakePayRealDisburse(t *testing.T) {
	t.Setenv("APP_ENV", "local")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("LOG_LEVEL", "info")
	t.Setenv("PAYMENT_PROVIDER", "fake")
	t.Setenv("DISBURSEMENT_PROVIDER", "xendit")
	t.Setenv("XENDIT_SECRET_KEY", "xnd_local_test")
	t.Setenv("XENDIT_WEBHOOK_TOKEN", "webhook_local")

	cfg, err := config.Load("fersaku-api")
	if err != nil {
		t.Fatalf("mixed: %v", err)
	}
	if !cfg.UseFakePayment() || cfg.UseFakeDisbursement() {
		t.Fatal("expected fake pay + real disburse")
	}
	if cfg.UseFakeXendit() {
		t.Fatal("UseFakeXendit should be false when only one side is fake")
	}
	if cfg.XenditMode != config.XenditModeLive {
		t.Fatalf("XenditMode=%q want live when either real", cfg.XenditMode)
	}
}

func TestLocalDefaultsTrustedProxyDirect(t *testing.T) {
	t.Setenv("APP_ENV", "local")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("LOG_LEVEL", "info")
	t.Setenv("XENDIT_MODE", "fake")
	t.Setenv("TRUSTED_PROXY_CIDRS", "")
	t.Setenv("TRUSTED_PROXY_MODE", "")

	cfg, err := config.Load("fersaku-api")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.TrustedProxyMode != "direct" {
		t.Fatalf("TrustedProxyMode=%q", cfg.TrustedProxyMode)
	}
	if len(cfg.TrustedProxyCIDRs) != 0 {
		t.Fatalf("expected empty CIDRs, got %v", cfg.TrustedProxyCIDRs)
	}
	pol := cfg.TrustedProxyPolicy()
	if pol["xffTrusted"] != false {
		t.Fatalf("policy=%v", pol)
	}
}

func TestProductionRequiresTrustedProxyExplicit(t *testing.T) {
	setMinimalProduction(t)
	t.Setenv("TRUSTED_PROXY_MODE", "")
	t.Setenv("TRUSTED_PROXY_CIDRS", "")

	_, err := config.Load("fersaku-api")
	if err == nil || !strings.Contains(err.Error(), "TRUSTED_PROXY") {
		t.Fatalf("expected TRUSTED_PROXY fail-closed, got %v", err)
	}
}

func TestProductionAcceptsTrustedProxyCIDRs(t *testing.T) {
	setMinimalProduction(t)
	t.Setenv("TRUSTED_PROXY_MODE", "")
	t.Setenv("TRUSTED_PROXY_CIDRS", "10.0.0.0/8, 2001:db8::1")

	cfg, err := config.Load("fersaku-api")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.TrustedProxyMode != "proxy" {
		t.Fatalf("mode=%q", cfg.TrustedProxyMode)
	}
	if len(cfg.TrustedProxyCIDRs) != 2 {
		t.Fatalf("cidrs=%v", cfg.TrustedProxyCIDRs)
	}
	pol := cfg.TrustedProxyPolicy()
	if pol["xffTrusted"] != true || pol["cidrCount"] != 2 {
		t.Fatalf("policy=%v", pol)
	}
}

func TestTrustedProxyInvalidCIDR(t *testing.T) {
	t.Setenv("APP_ENV", "local")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("LOG_LEVEL", "info")
	t.Setenv("XENDIT_MODE", "fake")
	t.Setenv("TRUSTED_PROXY_CIDRS", "not-a-cidr")

	_, err := config.Load("fersaku-api")
	if err == nil || !strings.Contains(err.Error(), "TRUSTED_PROXY_CIDRS") {
		t.Fatalf("expected invalid CIDR error, got %v", err)
	}
}

func TestTrustedProxyModeProxyRequiresCIDRs(t *testing.T) {
	t.Setenv("APP_ENV", "local")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("LOG_LEVEL", "info")
	t.Setenv("XENDIT_MODE", "fake")
	t.Setenv("TRUSTED_PROXY_MODE", "proxy")
	t.Setenv("TRUSTED_PROXY_CIDRS", "")

	_, err := config.Load("fersaku-api")
	if err == nil || !strings.Contains(err.Error(), "requires TRUSTED_PROXY_CIDRS") {
		t.Fatalf("expected mode=proxy requires CIDRs, got %v", err)
	}
}

func TestTrustedProxyDirectConflictsWithCIDRs(t *testing.T) {
	t.Setenv("APP_ENV", "local")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("LOG_LEVEL", "info")
	t.Setenv("XENDIT_MODE", "fake")
	t.Setenv("TRUSTED_PROXY_MODE", "direct")
	t.Setenv("TRUSTED_PROXY_CIDRS", "10.0.0.1/32")

	_, err := config.Load("fersaku-api")
	if err == nil || !strings.Contains(err.Error(), "cannot be combined") {
		t.Fatalf("expected conflict error, got %v", err)
	}
}
