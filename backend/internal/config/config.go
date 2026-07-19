// Package config loads and validates process configuration from the environment.
// No secrets are baked into binaries; missing required values fail fast at boot.
// Local allows fake adapters and missing production secrets; production fails closed.
package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// Env is the deployment/runtime environment (not payment_mode SANDBOX|LIVE).
type Env string

const (
	EnvLocal      Env = "local"
	EnvStaging    Env = "staging"
	EnvProduction Env = "production"
	EnvTest       Env = "test"
)

// XenditMode is a legacy alias for dual-provider selection (PROD-A20).
// Prefer PaymentProvider + DisbursementProvider. Kept for backward compatibility.
type XenditMode string

const (
	XenditModeFake XenditMode = "fake"
	XenditModeLive XenditMode = "live"
)

// Payment provider values (PAYMENT_PROVIDER).
const (
	PaymentProviderFake   = "fake"
	PaymentProviderDuitku = "duitku"
	PaymentProviderXendit = "xendit" // legacy QRIS until PROD-B40
)

// Disbursement provider values (DISBURSEMENT_PROVIDER).
const (
	DisbursementProviderFake   = "fake"
	DisbursementProviderXendit = "xendit"
)

// Config is typed process configuration for api and worker binaries.
type Config struct {
	AppEnv   Env
	HTTPAddr string
	LogLevel string
	// ServiceName distinguishes api vs worker in logs/metrics.
	ServiceName string
	// ShutdownTimeout bounds graceful shutdown.
	ShutdownTimeout time.Duration
	// WorkerRunOnce exits after ready when true (tests / one-shot).
	WorkerRunOnce bool

	// Optional until BE-100; when set, must be valid URL form.
	DatabaseURL string
	RedisURL    string

	// PaymentProvider selects QRIS payment adapter.
	// Values: duitku | fake | xendit (xendit = temporary legacy QRIS until PROD-B40).
	PaymentProvider string
	// DisbursementProvider selects withdrawal adapter.
	// Values: xendit | fake
	DisbursementProvider string
	// AllowFakeProviders permits PAYMENT/DISBURSEMENT_PROVIDER=fake on staging only
	// (dry drills). Production always rejects fake even when this flag is set.
	// Env: ALLOW_FAKE_PROVIDERS=1
	AllowFakeProviders bool

	// Duitku credentials and endpoints (empty ok when payment=fake).
	DuitkuMerchantCode      string
	DuitkuAPIKey            string
	DuitkuEnv               string // sandbox|production
	DuitkuBaseURL           string
	DuitkuCallbackURL       string
	DuitkuReturnURL         string
	DuitkuQRISPaymentMethod string // default SP
	DuitkuAccountScope      string // default duitku-primary

	// Xendit adapter selection and credentials (secrets never logged).
	// XenditMode is legacy (fake|live); derived from providers when unset.
	XenditMode         XenditMode
	XenditSecretKey    string
	XenditWebhookToken string
	XenditAccountScope string
	XenditEnv          string // sandbox|production optional
	XenditBaseURL      string // default https://api.xendit.co when empty at adapter wire

	// Session / CSRF
	SessionCookieName string
	SessionSecret     string
	CSRFSecret        string

	// KYC field encryption key (required in production).
	KYCEncryptionKey string
	// StockEncryptionKey for inventory secret envelopes (BE-230).
	// Falls back to KYC_ENCRYPTION_KEY when empty.
	StockEncryptionKey string

	// Object storage (R2 or local MinIO S3-compatible).
	R2Endpoint        string
	R2BucketPublic    string
	R2BucketPrivate   string
	R2AccessKeyID     string
	R2SecretAccessKey string
	R2Region          string
	R2ForcePathStyle  bool

	// Mail
	MailSMTPHost     string
	MailSMTPPort     string
	MailFrom         string
	MailSMTPUser     string
	MailSMTPPassword string
	// MailMode: capture|smtp|noop (empty = derived from AppEnv).
	// capture/noop forbidden on staging/production.
	MailMode string

	// Observability
	OTELEndpoint string

	// BootstrapAdminEmail when set attaches SUPER_ADMIN on seed (BE-130).
	// User must already exist (register/verify first). Does not create accounts.
	BootstrapAdminEmail string
}

// Load reads configuration from environment variables and validates.
// serviceName should be "fersaku-api" or "fersaku-worker".
func Load(serviceName string) (Config, error) {
	cfg := Config{
		AppEnv:                  Env(strings.ToLower(strings.TrimSpace(getEnv("APP_ENV", "local")))),
		HTTPAddr:                getEnv("HTTP_ADDR", ":8080"),
		LogLevel:                strings.ToLower(strings.TrimSpace(getEnv("LOG_LEVEL", "info"))),
		ServiceName:             serviceName,
		ShutdownTimeout:         15 * time.Second,
		WorkerRunOnce:           false,
		DatabaseURL:             strings.TrimSpace(os.Getenv("DATABASE_URL")),
		RedisURL:                strings.TrimSpace(os.Getenv("REDIS_URL")),
		PaymentProvider:         strings.ToLower(strings.TrimSpace(os.Getenv("PAYMENT_PROVIDER"))),
		DisbursementProvider:    strings.ToLower(strings.TrimSpace(os.Getenv("DISBURSEMENT_PROVIDER"))),
		DuitkuMerchantCode:      strings.TrimSpace(os.Getenv("DUITKU_MERCHANT_CODE")),
		DuitkuAPIKey:            strings.TrimSpace(os.Getenv("DUITKU_API_KEY")),
		DuitkuEnv:               strings.ToLower(strings.TrimSpace(os.Getenv("DUITKU_ENV"))),
		DuitkuBaseURL:           strings.TrimSpace(os.Getenv("DUITKU_BASE_URL")),
		DuitkuCallbackURL:       strings.TrimSpace(os.Getenv("DUITKU_CALLBACK_URL")),
		DuitkuReturnURL:         strings.TrimSpace(os.Getenv("DUITKU_RETURN_URL")),
		DuitkuQRISPaymentMethod: strings.TrimSpace(getEnv("DUITKU_QRIS_PAYMENT_METHOD", "SP")),
		DuitkuAccountScope:      strings.TrimSpace(getEnv("DUITKU_ACCOUNT_SCOPE", "duitku-primary")),
		XenditMode:              XenditMode(strings.ToLower(strings.TrimSpace(os.Getenv("XENDIT_MODE")))),
		XenditSecretKey:         strings.TrimSpace(os.Getenv("XENDIT_SECRET_KEY")),
		XenditWebhookToken:      strings.TrimSpace(os.Getenv("XENDIT_WEBHOOK_TOKEN")),
		XenditAccountScope:      strings.TrimSpace(getEnv("XENDIT_ACCOUNT_SCOPE", "xendit-primary")),
		XenditEnv:               strings.ToLower(strings.TrimSpace(os.Getenv("XENDIT_ENV"))),
		XenditBaseURL:           strings.TrimSpace(os.Getenv("XENDIT_BASE_URL")),
		SessionCookieName:       strings.TrimSpace(getEnv("SESSION_COOKIE_NAME", "fersaku_session")),
		SessionSecret:           strings.TrimSpace(os.Getenv("SESSION_SECRET")),
		CSRFSecret:              strings.TrimSpace(os.Getenv("CSRF_SECRET")),
		KYCEncryptionKey:        strings.TrimSpace(os.Getenv("KYC_ENCRYPTION_KEY")),
		StockEncryptionKey:      strings.TrimSpace(os.Getenv("STOCK_ENCRYPTION_KEY")),
		R2Endpoint:              strings.TrimSpace(os.Getenv("R2_ENDPOINT")),
		R2BucketPublic:          strings.TrimSpace(os.Getenv("R2_BUCKET_PUBLIC")),
		R2BucketPrivate:         strings.TrimSpace(os.Getenv("R2_BUCKET_PRIVATE")),
		R2AccessKeyID:           strings.TrimSpace(os.Getenv("R2_ACCESS_KEY_ID")),
		R2SecretAccessKey:       strings.TrimSpace(os.Getenv("R2_SECRET_ACCESS_KEY")),
		R2Region:                strings.TrimSpace(getEnv("R2_REGION", "auto")),
		R2ForcePathStyle:        false,
		MailSMTPHost:            strings.TrimSpace(os.Getenv("MAIL_SMTP_HOST")),
		MailSMTPPort:            strings.TrimSpace(getEnv("MAIL_SMTP_PORT", "587")),
		MailFrom:                strings.TrimSpace(os.Getenv("MAIL_FROM")),
		MailSMTPUser:            strings.TrimSpace(os.Getenv("MAIL_SMTP_USER")),
		MailSMTPPassword:        strings.TrimSpace(os.Getenv("MAIL_SMTP_PASSWORD")),
		MailMode:                strings.ToLower(strings.TrimSpace(os.Getenv("MAIL_MODE"))),
		OTELEndpoint:            strings.TrimSpace(os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")),
		BootstrapAdminEmail:     strings.TrimSpace(os.Getenv("BOOTSTRAP_ADMIN_EMAIL")),
	}

	if v := strings.TrimSpace(os.Getenv("ALLOW_FAKE_PROVIDERS")); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			// Accept "1" / "0" as well as true/false
			if v == "1" {
				b = true
			} else if v == "0" {
				b = false
			} else {
				return Config{}, fmt.Errorf("config: ALLOW_FAKE_PROVIDERS must be bool or 0|1, got %q", v)
			}
		}
		cfg.AllowFakeProviders = b
	}

	if v := strings.TrimSpace(os.Getenv("SHUTDOWN_TIMEOUT_SEC")); v != "" {
		sec, err := strconv.Atoi(v)
		if err != nil || sec < 1 || sec > 300 {
			return Config{}, fmt.Errorf("config: SHUTDOWN_TIMEOUT_SEC must be integer 1..300, got %q", v)
		}
		cfg.ShutdownTimeout = time.Duration(sec) * time.Second
	}

	if v := strings.TrimSpace(os.Getenv("WORKER_RUN_ONCE")); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return Config{}, fmt.Errorf("config: WORKER_RUN_ONCE must be bool, got %q", v)
		}
		cfg.WorkerRunOnce = b
	}

	if v := strings.TrimSpace(os.Getenv("R2_FORCE_PATH_STYLE")); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return Config{}, fmt.Errorf("config: R2_FORCE_PATH_STYLE must be bool, got %q", v)
		}
		cfg.R2ForcePathStyle = b
	}

	if err := cfg.resolveProviders(); err != nil {
		return Config{}, err
	}

	if err := cfg.Validate(); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

// resolveProviders maps legacy XENDIT_MODE into PaymentProvider / DisbursementProvider
// and keeps XenditMode populated for backward-compatible call sites.
func (c *Config) resolveProviders() error {
	legacyMode := c.XenditMode
	if legacyMode == "" {
		// Historical default when nothing set: local fake adapters.
		if c.PaymentProvider == "" && c.DisbursementProvider == "" {
			legacyMode = XenditModeFake
		}
	}
	switch legacyMode {
	case XenditModeFake, XenditModeLive, "":
	default:
		return fmt.Errorf("config: XENDIT_MODE must be fake|live, got %q", legacyMode)
	}

	if c.PaymentProvider == "" {
		switch legacyMode {
		case XenditModeLive:
			c.PaymentProvider = PaymentProviderXendit
		default:
			c.PaymentProvider = PaymentProviderFake
		}
	}
	if c.DisbursementProvider == "" {
		switch legacyMode {
		case XenditModeLive:
			c.DisbursementProvider = DisbursementProviderXendit
		default:
			c.DisbursementProvider = DisbursementProviderFake
		}
	}

	// Normalize and validate known values early so XenditMode derivation is clean.
	c.PaymentProvider = strings.ToLower(strings.TrimSpace(c.PaymentProvider))
	c.DisbursementProvider = strings.ToLower(strings.TrimSpace(c.DisbursementProvider))

	// Compat: XenditMode=fake only when both sides are fake; otherwise live.
	if c.UseFakePayment() && c.UseFakeDisbursement() {
		c.XenditMode = XenditModeFake
	} else {
		c.XenditMode = XenditModeLive
	}
	return nil
}

// Validate fails fast on invalid configuration.
// Local/test allow fake adapters and missing production secrets.
// Production fails closed for fake providers, missing SESSION_SECRET, etc.
func (c Config) Validate() error {
	switch c.AppEnv {
	case EnvLocal, EnvStaging, EnvProduction, EnvTest:
	default:
		return fmt.Errorf("config: APP_ENV must be one of local|staging|production|test, got %q", c.AppEnv)
	}

	switch c.LogLevel {
	case "debug", "info", "warn", "error":
	default:
		return fmt.Errorf("config: LOG_LEVEL must be one of debug|info|warn|error, got %q", c.LogLevel)
	}

	if strings.TrimSpace(c.HTTPAddr) == "" {
		return fmt.Errorf("config: HTTP_ADDR must not be empty")
	}

	if strings.TrimSpace(c.ServiceName) == "" {
		return fmt.Errorf("config: ServiceName must not be empty")
	}

	if c.ShutdownTimeout < time.Second || c.ShutdownTimeout > 5*time.Minute {
		return fmt.Errorf("config: ShutdownTimeout out of range")
	}

	switch c.PaymentProvider {
	case PaymentProviderFake, PaymentProviderDuitku, PaymentProviderXendit:
	default:
		return fmt.Errorf("config: PAYMENT_PROVIDER must be fake|duitku|xendit, got %q", c.PaymentProvider)
	}
	switch c.DisbursementProvider {
	case DisbursementProviderFake, DisbursementProviderXendit:
	default:
		return fmt.Errorf("config: DISBURSEMENT_PROVIDER must be fake|xendit, got %q", c.DisbursementProvider)
	}

	switch c.XenditMode {
	case XenditModeFake, XenditModeLive:
	default:
		return fmt.Errorf("config: XENDIT_MODE must be fake|live, got %q", c.XenditMode)
	}

	if c.DuitkuEnv != "" {
		switch c.DuitkuEnv {
		case "sandbox", "production":
		default:
			return fmt.Errorf("config: DUITKU_ENV must be sandbox|production, got %q", c.DuitkuEnv)
		}
	}
	if c.XenditEnv != "" {
		switch c.XenditEnv {
		case "sandbox", "production":
		default:
			return fmt.Errorf("config: XENDIT_ENV must be sandbox|production, got %q", c.XenditEnv)
		}
	}

	if c.DatabaseURL != "" {
		if err := validateURL("DATABASE_URL", c.DatabaseURL, []string{"postgres", "postgresql"}); err != nil {
			return err
		}
	}
	if c.RedisURL != "" {
		if err := validateURL("REDIS_URL", c.RedisURL, []string{"redis", "rediss"}); err != nil {
			return err
		}
	}

	if err := c.validateByEnv(); err != nil {
		return err
	}

	return nil
}

// UseFakePayment reports whether the fake QRIS payment adapter is selected.
func (c Config) UseFakePayment() bool {
	return c.PaymentProvider == PaymentProviderFake
}

// UseFakeDisbursement reports whether the fake disbursement adapter is selected.
func (c Config) UseFakeDisbursement() bool {
	return c.DisbursementProvider == DisbursementProviderFake
}

// UseFakeXendit is deprecated: true only when both payment and disbursement are fake.
// Prefer UseFakePayment / UseFakeDisbursement (PROD-A20 dual-provider).
func (c Config) UseFakeXendit() bool {
	return c.UseFakePayment() && c.UseFakeDisbursement()
}

// NeedsXenditCredentials is true when any path still uses the Xendit adapter.
func (c Config) NeedsXenditCredentials() bool {
	return c.PaymentProvider == PaymentProviderXendit || c.DisbursementProvider == DisbursementProviderXendit
}

// NeedsDuitkuCredentials is true when payment uses Duitku.
func (c Config) NeedsDuitkuCredentials() bool {
	return c.PaymentProvider == PaymentProviderDuitku
}

// IsProduction is true when APP_ENV=production.
func (c Config) IsProduction() bool {
	return c.AppEnv == EnvProduction
}

// IsLiveRuntime is true for staging or production (no fake/noop authority by default).
func (c Config) IsLiveRuntime() bool {
	return c.AppEnv == EnvStaging || c.AppEnv == EnvProduction
}

// EffectiveMailMode returns capture|smtp|noop after defaults.
// local/test default capture; staging/production require smtp.
func (c Config) EffectiveMailMode() string {
	m := strings.ToLower(strings.TrimSpace(c.MailMode))
	if m != "" {
		return m
	}
	if c.IsLiveRuntime() {
		return "smtp"
	}
	return "capture"
}

// RequiresDistributedLimiter is true when multi-instance rate limiting is required.
func (c Config) RequiresDistributedLimiter() bool {
	return c.IsLiveRuntime()
}

func (c Config) validateByEnv() error {
	if err := c.validateFakeProviders(); err != nil {
		return err
	}
	if err := c.validateProviderCredentials(); err != nil {
		return err
	}

	switch c.AppEnv {
	case EnvLocal, EnvTest:
		if m := c.EffectiveMailMode(); m != "capture" && m != "smtp" && m != "noop" {
			return fmt.Errorf("config: MAIL_MODE must be capture|smtp|noop, got %q", m)
		}
		return nil

	case EnvStaging:
		if c.SessionSecret == "" {
			return fmt.Errorf("config: SESSION_SECRET is required when APP_ENV=staging")
		}
		if len(c.SessionSecret) < 16 {
			return fmt.Errorf("config: SESSION_SECRET must be at least 16 characters when APP_ENV=staging")
		}
		if c.CSRFSecret == "" {
			return fmt.Errorf("config: CSRF_SECRET is required when APP_ENV=staging")
		}
		if err := c.validateLiveMail(); err != nil {
			return err
		}
		if c.RedisURL == "" {
			return fmt.Errorf("config: REDIS_URL is required when APP_ENV=staging (distributed limiter)")
		}
		return nil

	case EnvProduction:
		// Production fails closed (§3.4 + INT-180).
		if c.SessionSecret == "" {
			return fmt.Errorf("config: SESSION_SECRET is required when APP_ENV=production")
		}
		if len(c.SessionSecret) < 32 {
			return fmt.Errorf("config: SESSION_SECRET must be at least 32 characters when APP_ENV=production")
		}
		if isInsecurePlaceholder(c.SessionSecret) {
			return fmt.Errorf("config: SESSION_SECRET must not be a local/dev placeholder when APP_ENV=production")
		}
		if c.CSRFSecret == "" {
			return fmt.Errorf("config: CSRF_SECRET is required when APP_ENV=production")
		}
		if len(c.CSRFSecret) < 32 {
			return fmt.Errorf("config: CSRF_SECRET must be at least 32 characters when APP_ENV=production")
		}
		if isInsecurePlaceholder(c.CSRFSecret) {
			return fmt.Errorf("config: CSRF_SECRET must not be a local/dev placeholder when APP_ENV=production")
		}
		if c.KYCEncryptionKey == "" {
			return fmt.Errorf("config: KYC_ENCRYPTION_KEY is required when APP_ENV=production")
		}
		// Stock secrets may use STOCK_ENCRYPTION_KEY or fall back to KYC key.
		if c.DatabaseURL == "" {
			return fmt.Errorf("config: DATABASE_URL is required when APP_ENV=production")
		}
		if err := requireTLSScheme("DATABASE_URL", c.DatabaseURL, []string{"postgres", "postgresql"}, "sslmode=disable"); err != nil {
			return err
		}
		if c.RedisURL == "" {
			return fmt.Errorf("config: REDIS_URL is required when APP_ENV=production")
		}
		if err := requireRedisTLS(c.RedisURL); err != nil {
			return err
		}
		if c.R2Endpoint == "" || c.R2BucketPrivate == "" {
			return fmt.Errorf("config: R2_ENDPOINT and R2_BUCKET_PRIVATE are required when APP_ENV=production")
		}
		if isLocalObjectEndpoint(c.R2Endpoint) {
			return fmt.Errorf("config: local/MinIO R2_ENDPOINT is forbidden when APP_ENV=production")
		}
		if c.R2AccessKeyID == "" || c.R2SecretAccessKey == "" {
			return fmt.Errorf("config: R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required when APP_ENV=production")
		}
		if err := c.validateLiveMail(); err != nil {
			return err
		}
		return nil
	}
	return nil
}

// validateFakeProviders enforces fail-closed fake rules (ADR-0008 / INT-180).
// production: always reject fake payment and fake disbursement.
// staging: reject fake unless ALLOW_FAKE_PROVIDERS=1.
// local/test: allow fake.
func (c Config) validateFakeProviders() error {
	fakePay := c.UseFakePayment()
	fakeDis := c.UseFakeDisbursement()
	if !fakePay && !fakeDis {
		return nil
	}

	switch c.AppEnv {
	case EnvLocal, EnvTest:
		return nil
	case EnvProduction:
		if fakePay {
			return fmt.Errorf("config: PAYMENT_PROVIDER=fake is forbidden when APP_ENV=production")
		}
		if fakeDis {
			return fmt.Errorf("config: DISBURSEMENT_PROVIDER=fake is forbidden when APP_ENV=production")
		}
	case EnvStaging:
		if c.AllowFakeProviders {
			// Staging dry-drill escape hatch only (document ALLOW_FAKE_PROVIDERS=1).
			return nil
		}
		if fakePay {
			return fmt.Errorf("config: PAYMENT_PROVIDER=fake is forbidden when APP_ENV=staging (set ALLOW_FAKE_PROVIDERS=1 for drills only; INT-180)")
		}
		if fakeDis {
			return fmt.Errorf("config: DISBURSEMENT_PROVIDER=fake is forbidden when APP_ENV=staging (set ALLOW_FAKE_PROVIDERS=1 for drills only; INT-180)")
		}
	}
	return nil
}

func (c Config) validateProviderCredentials() error {
	if c.NeedsDuitkuCredentials() {
		if c.DuitkuMerchantCode == "" {
			return fmt.Errorf("config: DUITKU_MERCHANT_CODE is required when PAYMENT_PROVIDER=duitku")
		}
		if c.DuitkuAPIKey == "" {
			return fmt.Errorf("config: DUITKU_API_KEY is required when PAYMENT_PROVIDER=duitku")
		}
	}

	if c.NeedsXenditCredentials() {
		// Live runtime always requires keys; local/test only when xendit path selected.
		if c.XenditSecretKey == "" {
			return fmt.Errorf("config: XENDIT_SECRET_KEY is required when payment or disbursement uses xendit")
		}
		if c.XenditWebhookToken == "" {
			return fmt.Errorf("config: XENDIT_WEBHOOK_TOKEN is required when payment or disbursement uses xendit")
		}
	}
	return nil
}

func (c Config) validateLiveMail() error {
	m := c.EffectiveMailMode()
	if m == "noop" || m == "capture" {
		return fmt.Errorf("config: MAIL_MODE=%s is forbidden on staging/production (INT-180)", m)
	}
	if m != "smtp" {
		return fmt.Errorf("config: MAIL_MODE must be smtp on staging/production, got %q", m)
	}
	if c.MailSMTPHost == "" {
		return fmt.Errorf("config: MAIL_SMTP_HOST is required when mail mode is smtp")
	}
	if c.MailFrom == "" {
		return fmt.Errorf("config: MAIL_FROM is required when mail mode is smtp")
	}
	return nil
}

func validateURL(name, raw string, schemes []string) error {
	u, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("config: %s is not a valid URL: %w", name, err)
	}
	if u.Scheme == "" {
		return fmt.Errorf("config: %s must include a scheme, got %q", name, raw)
	}
	ok := false
	for _, s := range schemes {
		if strings.EqualFold(u.Scheme, s) {
			ok = true
			break
		}
	}
	if !ok {
		return fmt.Errorf("config: %s scheme must be one of %v, got %q", name, schemes, u.Scheme)
	}
	if u.Host == "" {
		return fmt.Errorf("config: %s must include a host", name)
	}
	return nil
}

func requireTLSScheme(name, raw string, schemes []string, forbiddenQuery string) error {
	if err := validateURL(name, raw, schemes); err != nil {
		return err
	}
	u, _ := url.Parse(raw)
	q := u.Query()
	if forbiddenQuery != "" {
		// e.g. sslmode=disable
		parts := strings.SplitN(forbiddenQuery, "=", 2)
		if len(parts) == 2 && strings.EqualFold(q.Get(parts[0]), parts[1]) {
			return fmt.Errorf("config: %s must not use %s when APP_ENV=production", name, forbiddenQuery)
		}
	}
	return nil
}

func requireRedisTLS(raw string) error {
	u, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("config: REDIS_URL is not a valid URL: %w", err)
	}
	if !strings.EqualFold(u.Scheme, "rediss") {
		return fmt.Errorf("config: REDIS_URL must use rediss:// (TLS) when APP_ENV=production")
	}
	return nil
}

func isLocalObjectEndpoint(endpoint string) bool {
	e := strings.ToLower(endpoint)
	return strings.Contains(e, "localhost") ||
		strings.Contains(e, "127.0.0.1") ||
		strings.Contains(e, "minio") ||
		strings.HasPrefix(e, "http://")
}

func isInsecurePlaceholder(s string) bool {
	lower := strings.ToLower(s)
	markers := []string{
		"local-dev",
		"not-for-prod",
		"changeme",
		"placeholder",
		"secret-not-for",
		"dev-only",
	}
	for _, m := range markers {
		if strings.Contains(lower, m) {
			return true
		}
	}
	return false
}

// EffectiveStockEncryptionKey returns STOCK_ENCRYPTION_KEY or KYC_ENCRYPTION_KEY fallback.
func (c Config) EffectiveStockEncryptionKey() string {
	if strings.TrimSpace(c.StockEncryptionKey) != "" {
		return strings.TrimSpace(c.StockEncryptionKey)
	}
	return strings.TrimSpace(c.KYCEncryptionKey)
}

func getEnv(key, def string) string {
	if v, ok := os.LookupEnv(key); ok {
		return v
	}
	return def
}
