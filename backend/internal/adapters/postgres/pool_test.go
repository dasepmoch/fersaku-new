package postgres_test

import (
	"testing"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres"
)

func TestDefaultPoolConfig(t *testing.T) {
	cfg := postgres.DefaultPoolConfig()
	if cfg.MaxConns != 20 {
		t.Fatalf("MaxConns=%d", cfg.MaxConns)
	}
	if cfg.ConnectTimeout != 5*time.Second {
		t.Fatalf("ConnectTimeout=%v", cfg.ConnectTimeout)
	}
	if cfg.StatementTimeout != 30*time.Second {
		t.Fatalf("StatementTimeout=%v", cfg.StatementTimeout)
	}
}

func TestOpen_EmptyURL(t *testing.T) {
	_, err := postgres.Open(t.Context(), "", postgres.DefaultPoolConfig())
	if err == nil {
		t.Fatal("expected empty DATABASE_URL error")
	}
}
