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

	cfg, err := config.Load("fersaku-api")
	if err != nil {
		t.Fatalf("local should allow missing production secrets: %v", err)
	}
	if cfg.IsProduction() {
		t.Fatal("expected non-production")
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

	_, err := config.Load("fersaku-api")
	if err == nil || !strings.Contains(err.Error(), "fake") {
		t.Fatalf("expected fake forbidden in production, got %v", err)
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
}

func setMinimalProduction(t *testing.T) {
	t.Helper()
	t.Setenv("APP_ENV", "production")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("LOG_LEVEL", "info")
	t.Setenv("XENDIT_MODE", "live")
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
}

func TestStagingRejectsFakeXendit(t *testing.T) {
	t.Setenv("APP_ENV", "staging")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("LOG_LEVEL", "info")
	t.Setenv("XENDIT_MODE", "fake")
	t.Setenv("SESSION_SECRET", "staging-session-secret-16")
	t.Setenv("CSRF_SECRET", "staging-csrf-secret")
	t.Setenv("REDIS_URL", "redis://localhost:6379/0")
	t.Setenv("MAIL_SMTP_HOST", "smtp.example.com")
	t.Setenv("MAIL_FROM", "noreply@example.com")

	_, err := config.Load("fersaku-api")
	if err == nil || !strings.Contains(err.Error(), "fake") {
		t.Fatalf("expected staging fake xendit forbidden, got %v", err)
	}
}

func TestStagingRejectsCaptureMail(t *testing.T) {
	t.Setenv("APP_ENV", "staging")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("LOG_LEVEL", "info")
	t.Setenv("XENDIT_MODE", "live")
	t.Setenv("XENDIT_SECRET_KEY", "xnd_staging_test")
	t.Setenv("XENDIT_WEBHOOK_TOKEN", "webhook_staging")
	t.Setenv("SESSION_SECRET", "staging-session-secret-16")
	t.Setenv("CSRF_SECRET", "staging-csrf-secret")
	t.Setenv("REDIS_URL", "redis://localhost:6379/0")
	t.Setenv("MAIL_MODE", "capture")
	t.Setenv("MAIL_SMTP_HOST", "smtp.example.com")
	t.Setenv("MAIL_FROM", "noreply@example.com")

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
