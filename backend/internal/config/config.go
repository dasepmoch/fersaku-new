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

// XenditMode selects the payment provider adapter.
type XenditMode string

const (
	XenditModeFake XenditMode = "fake"
	XenditModeLive XenditMode = "live"
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

	// Xendit adapter selection and credentials (secrets never logged).
	XenditMode         XenditMode
	XenditSecretKey    string
	XenditWebhookToken string
	XenditAccountScope string

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
	MailSMTPHost string
	MailSMTPPort string
	MailFrom     string

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
		AppEnv:             Env(strings.ToLower(strings.TrimSpace(getEnv("APP_ENV", "local")))),
		HTTPAddr:           getEnv("HTTP_ADDR", ":8080"),
		LogLevel:           strings.ToLower(strings.TrimSpace(getEnv("LOG_LEVEL", "info"))),
		ServiceName:        serviceName,
		ShutdownTimeout:    15 * time.Second,
		WorkerRunOnce:      false,
		DatabaseURL:        strings.TrimSpace(os.Getenv("DATABASE_URL")),
		RedisURL:           strings.TrimSpace(os.Getenv("REDIS_URL")),
		XenditMode:         XenditMode(strings.ToLower(strings.TrimSpace(getEnv("XENDIT_MODE", "fake")))),
		XenditSecretKey:    strings.TrimSpace(os.Getenv("XENDIT_SECRET_KEY")),
		XenditWebhookToken: strings.TrimSpace(os.Getenv("XENDIT_WEBHOOK_TOKEN")),
		XenditAccountScope: strings.TrimSpace(getEnv("XENDIT_ACCOUNT_SCOPE", "xendit-primary")),
		SessionCookieName:  strings.TrimSpace(getEnv("SESSION_COOKIE_NAME", "fersaku_session")),
		SessionSecret:      strings.TrimSpace(os.Getenv("SESSION_SECRET")),
		CSRFSecret:         strings.TrimSpace(os.Getenv("CSRF_SECRET")),
		KYCEncryptionKey:   strings.TrimSpace(os.Getenv("KYC_ENCRYPTION_KEY")),
		StockEncryptionKey: strings.TrimSpace(os.Getenv("STOCK_ENCRYPTION_KEY")),
		R2Endpoint:         strings.TrimSpace(os.Getenv("R2_ENDPOINT")),
		R2BucketPublic:     strings.TrimSpace(os.Getenv("R2_BUCKET_PUBLIC")),
		R2BucketPrivate:    strings.TrimSpace(os.Getenv("R2_BUCKET_PRIVATE")),
		R2AccessKeyID:      strings.TrimSpace(os.Getenv("R2_ACCESS_KEY_ID")),
		R2SecretAccessKey:  strings.TrimSpace(os.Getenv("R2_SECRET_ACCESS_KEY")),
		R2Region:           strings.TrimSpace(getEnv("R2_REGION", "auto")),
		R2ForcePathStyle:   false,
		MailSMTPHost:       strings.TrimSpace(os.Getenv("MAIL_SMTP_HOST")),
		MailSMTPPort:       strings.TrimSpace(os.Getenv("MAIL_SMTP_PORT")),
		MailFrom:           strings.TrimSpace(os.Getenv("MAIL_FROM")),
		OTELEndpoint:        strings.TrimSpace(os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")),
		BootstrapAdminEmail: strings.TrimSpace(os.Getenv("BOOTSTRAP_ADMIN_EMAIL")),
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

	if err := cfg.Validate(); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

// Validate fails fast on invalid configuration.
// Local/test allow fake adapters and missing production secrets.
// Production fails closed for fake Xendit, missing SESSION_SECRET, etc.
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

	switch c.XenditMode {
	case XenditModeFake, XenditModeLive, "":
		if c.XenditMode == "" {
			return fmt.Errorf("config: XENDIT_MODE must be fake|live")
		}
	default:
		return fmt.Errorf("config: XENDIT_MODE must be fake|live, got %q", c.XenditMode)
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

// UseFakeXendit reports whether the fake provider adapter is selected.
func (c Config) UseFakeXendit() bool {
	return c.XenditMode == XenditModeFake
}

// IsProduction is true when APP_ENV=production.
func (c Config) IsProduction() bool {
	return c.AppEnv == EnvProduction
}

func (c Config) validateByEnv() error {
	switch c.AppEnv {
	case EnvLocal, EnvTest:
		// Fake adapters and missing production secrets are allowed.
		// If Xendit live is forced in local, still require keys (fail closed for misconfig).
		if c.XenditMode == XenditModeLive {
			if c.XenditSecretKey == "" {
				return fmt.Errorf("config: XENDIT_SECRET_KEY required when XENDIT_MODE=live")
			}
			if c.XenditWebhookToken == "" {
				return fmt.Errorf("config: XENDIT_WEBHOOK_TOKEN required when XENDIT_MODE=live")
			}
		}
		return nil

	case EnvStaging:
		if c.XenditMode == XenditModeFake {
			// Staging may use fake for some tests; allow but require session secrets.
		}
		if c.SessionSecret == "" {
			return fmt.Errorf("config: SESSION_SECRET is required when APP_ENV=staging")
		}
		if len(c.SessionSecret) < 16 {
			return fmt.Errorf("config: SESSION_SECRET must be at least 16 characters when APP_ENV=staging")
		}
		if c.CSRFSecret == "" {
			return fmt.Errorf("config: CSRF_SECRET is required when APP_ENV=staging")
		}
		if c.XenditMode == XenditModeLive {
			if c.XenditSecretKey == "" {
				return fmt.Errorf("config: XENDIT_SECRET_KEY required when XENDIT_MODE=live")
			}
			if c.XenditWebhookToken == "" {
				return fmt.Errorf("config: XENDIT_WEBHOOK_TOKEN required when XENDIT_MODE=live")
			}
		}
		return nil

	case EnvProduction:
		// Production fails closed (§3.4).
		if c.XenditMode == XenditModeFake {
			return fmt.Errorf("config: XENDIT_MODE=fake is forbidden when APP_ENV=production")
		}
		if c.XenditSecretKey == "" {
			return fmt.Errorf("config: XENDIT_SECRET_KEY is required when APP_ENV=production")
		}
		if c.XenditWebhookToken == "" {
			return fmt.Errorf("config: XENDIT_WEBHOOK_TOKEN is required when APP_ENV=production")
		}
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
		return nil
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
