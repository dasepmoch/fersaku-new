//go:build integration

package seed_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres"
	"github.com/dasepmoch/fersaku-new/backend/internal/seed"
)

// TestApply_SmokeDisposableDB runs QLT-110 seed twice and checks stable IDs.
// Requires DATABASE_URL pointing at a migrated disposable DB.
func TestApply_SmokeDisposableDB(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set")
	}
	t.Setenv("APP_ENV", "test")

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	pool, err := postgres.Open(ctx, dbURL, postgres.DefaultPoolConfig())
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer pool.Close()

	r1, err := seed.Apply(ctx, pool.Pool())
	if err != nil {
		t.Fatalf("first apply: %v", err)
	}
	if len(r1.Personas) != 9 {
		t.Fatalf("personas want 9 got %d", len(r1.Personas))
	}
	if r1.Resources["persona.buyer_a.user_id"] != seed.ID(seed.IDUserBuyerA) {
		t.Fatalf("buyer_a id unstable: %s", r1.Resources["persona.buyer_a.user_id"])
	}

	r2, err := seed.Apply(ctx, pool.Pool())
	if err != nil {
		t.Fatalf("second apply: %v", err)
	}
	if r1.Resources["persona.buyer_a.user_id"] != r2.Resources["persona.buyer_a.user_id"] {
		t.Fatal("reseed changed buyer_a id")
	}
	if r1.Resources["store.seed-store-a"] != r2.Resources["store.seed-store-a"] {
		t.Fatal("reseed changed store A")
	}

	var n int
	err = pool.Pool().QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE id LIKE '01HQ0SEED%'`).Scan(&n)
	if err != nil {
		t.Fatalf("count users: %v", err)
	}
	if n != 9 {
		t.Fatalf("seed users want 9 got %d", n)
	}

	var marker string
	err = pool.Pool().QueryRow(ctx, `SELECT value FROM schema_meta WHERE key = 'qlt110_seed'`).Scan(&marker)
	if err != nil || marker == "" {
		t.Fatalf("marker missing: %v %q", err, marker)
	}
}
