package config_test

import (
	"strings"
	"testing"

	"github.com/dasepmoch/fersaku-new/backend/internal/config"
)

func TestDefaultCapacityWorksheetMatchesTopology(t *testing.T) {
	w := config.DefaultCapacityWorksheet()
	// topology.md launch defaults: 2×20 + 2×10 = 60 ≤ 80 (0.8×100)
	if w.AppPoolTotal() != 60 {
		t.Fatalf("AppPoolTotal=%d want 60", w.AppPoolTotal())
	}
	if w.UsableConnections() != 80 {
		t.Fatalf("UsableConnections=%d want 80", w.UsableConnections())
	}
	if err := w.Validate(); err != nil {
		t.Fatalf("Validate: %v", err)
	}
	if w.ReservedHeadroom() != 8 {
		t.Fatalf("ReservedHeadroom=%d want 8 (migrate4+admin4)", w.ReservedHeadroom())
	}
	if !strings.Contains(w.Summary(), "api=2×20") {
		t.Fatalf("Summary missing api=2×20: %s", w.Summary())
	}
}

func TestCapacityWorksheet_OverBudgetFails(t *testing.T) {
	w := config.DefaultCapacityWorksheet()
	// Simulate old bug: workers also MaxConns=20 → 2×20+2×20=80 == usable edge ok;
	// push over with 3 API replicas × 20 + 2×20 = 100 > 80.
	w.APIReplicas = 3
	w.WorkerMaxConns = 20
	if err := w.Validate(); err == nil {
		t.Fatal("expected budget exceeded")
	}
}

func TestCapacityWorksheet_HeadroomBandFails(t *testing.T) {
	w := config.DefaultCapacityWorksheet()
	w.MigrateMaxConns = 15
	w.AdminMaxConns = 10 // 25 > headroom band 20
	if err := w.Validate(); err == nil {
		t.Fatal("expected headroom band error")
	}
}

func TestProcessRole(t *testing.T) {
	cases := map[string]string{
		"fersaku-api":     config.RoleAPI,
		"fersaku-worker":  config.RoleWorker,
		"migrate-job":     config.RoleMigrate,
		"fersaku-seed":    config.RoleSeed,
		"bootstrap-admin": config.RoleAdmin,
		"":                config.RoleAPI,
	}
	for in, want := range cases {
		if got := config.ProcessRole(in); got != want {
			t.Fatalf("ProcessRole(%q)=%q want %q", in, got, want)
		}
	}
}

func TestLoad_APIAndWorkerPoolDefaults(t *testing.T) {
	t.Setenv("APP_ENV", "local")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("LOG_LEVEL", "info")
	t.Setenv("XENDIT_MODE", "fake")
	t.Setenv("SESSION_SECRET", "")
	t.Setenv("DATABASE_URL", "")
	t.Setenv("REDIS_URL", "")
	t.Setenv("PAYMENT_PROVIDER", "")
	t.Setenv("DISBURSEMENT_PROVIDER", "")
	// Clear pool overrides from parent env.
	t.Setenv("PG_POOL_MAX_CONNS", "")
	t.Setenv("PG_API_MAX_CONNS", "")
	t.Setenv("PG_WORKER_MAX_CONNS", "")
	t.Setenv("PG_API_REPLICAS", "")
	t.Setenv("PG_WORKER_REPLICAS", "")
	t.Setenv("PG_MAX_CONNECTIONS", "")
	t.Setenv("PG_BUDGET_ENFORCE", "")

	api, err := config.Load("fersaku-api")
	if err != nil {
		t.Fatalf("api Load: %v", err)
	}
	if api.ProcessRole != config.RoleAPI {
		t.Fatalf("api role=%q", api.ProcessRole)
	}
	if api.Pool.MaxConns != config.DefaultAPIMaxConns {
		t.Fatalf("api MaxConns=%d want %d", api.Pool.MaxConns, config.DefaultAPIMaxConns)
	}
	if api.Pool.ApplicationName != "fersaku-api" {
		t.Fatalf("api app_name=%q", api.Pool.ApplicationName)
	}

	worker, err := config.Load("fersaku-worker")
	if err != nil {
		t.Fatalf("worker Load: %v", err)
	}
	if worker.ProcessRole != config.RoleWorker {
		t.Fatalf("worker role=%q", worker.ProcessRole)
	}
	if worker.Pool.MaxConns != config.DefaultWorkerMaxConns {
		t.Fatalf("worker MaxConns=%d want %d (must not share API default 20)", worker.Pool.MaxConns, config.DefaultWorkerMaxConns)
	}
	if worker.Pool.ApplicationName != "fersaku-worker" {
		t.Fatalf("worker app_name=%q", worker.Pool.ApplicationName)
	}

	// Runtime capacity matches topology worksheet.
	if api.CapacityWorksheet.AppPoolTotal() != 60 {
		t.Fatalf("worksheet total=%d", api.CapacityWorksheet.AppPoolTotal())
	}
}

func TestLoad_ProductionBudgetEnforced(t *testing.T) {
	setMinimalProduction(t)
	t.Setenv("PG_POOL_MAX_CONNS", "")
	// Over budget: 5 API × 20 + 2 × 20 workers = 140 > 80
	t.Setenv("PG_API_REPLICAS", "5")
	t.Setenv("PG_WORKER_MAX_CONNS", "20")
	t.Setenv("PG_MAX_CONNECTIONS", "100")

	_, err := config.Load("fersaku-api")
	if err == nil {
		t.Fatal("expected production budget enforcement failure")
	}
	if !strings.Contains(err.Error(), "connection budget exceeded") {
		t.Fatalf("unexpected err: %v", err)
	}
}

func TestLoad_PoolOverride(t *testing.T) {
	t.Setenv("APP_ENV", "local")
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("LOG_LEVEL", "info")
	t.Setenv("XENDIT_MODE", "fake")
	t.Setenv("SESSION_SECRET", "")
	t.Setenv("DATABASE_URL", "")
	t.Setenv("REDIS_URL", "")
	t.Setenv("PAYMENT_PROVIDER", "")
	t.Setenv("DISBURSEMENT_PROVIDER", "")
	t.Setenv("PG_POOL_MAX_CONNS", "7")
	t.Setenv("PG_STATEMENT_TIMEOUT_MS", "15000")
	t.Setenv("PG_APPLICATION_NAME", "fersaku-api-canary")
	t.Setenv("PG_API_REPLICAS", "")
	t.Setenv("PG_WORKER_REPLICAS", "")
	t.Setenv("PG_MAX_CONNECTIONS", "")
	t.Setenv("PG_BUDGET_ENFORCE", "")

	cfg, err := config.Load("fersaku-api")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.Pool.MaxConns != 7 {
		t.Fatalf("MaxConns=%d", cfg.Pool.MaxConns)
	}
	if cfg.Pool.StatementTimeout.Milliseconds() != 15000 {
		t.Fatalf("StatementTimeout=%v", cfg.Pool.StatementTimeout)
	}
	if cfg.Pool.ApplicationName != "fersaku-api-canary" {
		t.Fatalf("ApplicationName=%q", cfg.Pool.ApplicationName)
	}
}
