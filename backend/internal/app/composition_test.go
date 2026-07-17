package app

import (
	"strings"
	"testing"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/middleware"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/redis"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/config"
)

func TestPlatformHealth_FakeXenditDownOnLive(t *testing.T) {
	cfg := config.Config{AppEnv: config.EnvProduction}
	comps := platformComponentHealth(
		t.Context(), nil, nil,
		"fake", "smtp", "redis",
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
		"real", "noop", "redis",
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
		"fake", "capture", "noop",
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
