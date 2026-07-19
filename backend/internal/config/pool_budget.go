package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Process roles for pool sizing (single source with topology worksheet).
const (
	RoleAPI     = "api"
	RoleWorker  = "worker"
	RoleMigrate = "migrate"
	RoleAdmin   = "admin"
	RoleSeed    = "seed"
)

// Launch topology defaults (docs/launch/topology.md, ADR-0007).
// API 2×20 + Worker 2×10 = 60 ≤ 0.8×100; migrate/admin use reserved headroom.
const (
	DefaultDBMaxConnections = 100
	DefaultAPIReplicas      = 2
	DefaultWorkerReplicas   = 2
	DefaultAPIMaxConns      = 20
	DefaultWorkerMaxConns   = 10
	DefaultMigrateMaxConns  = 4
	DefaultAdminMaxConns    = 4
	// BudgetHeadroomRatio reserves ratio of max_connections outside app pools.
	// 0.2 → usable = 80% (migrate/admin/HA/PITR sit in the remaining 20%).
	DefaultBudgetHeadroomRatio = 0.20
	DefaultStatementTimeoutMS  = 30_000
)

// CapacityWorksheet is the single source for connection budget math.
// Runtime pool sizes and topology docs must match these numbers.
type CapacityWorksheet struct {
	DBMaxConnections int
	APIReplicas      int
	WorkerReplicas   int
	APIMaxConns      int32
	WorkerMaxConns   int32
	MigrateMaxConns  int32
	AdminMaxConns    int32
	HeadroomRatio    float64
}

// PoolTuning is per-process pgx pool sizing loaded from env + role defaults.
type PoolTuning struct {
	MaxConns          int32
	MinConns          int32
	MaxConnLifetime   time.Duration
	MaxConnIdleTime   time.Duration
	HealthCheckPeriod time.Duration
	ConnectTimeout    time.Duration
	StatementTimeout  time.Duration
	ApplicationName   string
	Role              string
}

// DefaultCapacityWorksheet returns launch defaults (DB max_connections=100).
func DefaultCapacityWorksheet() CapacityWorksheet {
	return CapacityWorksheet{
		DBMaxConnections: DefaultDBMaxConnections,
		APIReplicas:      DefaultAPIReplicas,
		WorkerReplicas:   DefaultWorkerReplicas,
		APIMaxConns:      DefaultAPIMaxConns,
		WorkerMaxConns:   DefaultWorkerMaxConns,
		MigrateMaxConns:  DefaultMigrateMaxConns,
		AdminMaxConns:    DefaultAdminMaxConns,
		HeadroomRatio:    DefaultBudgetHeadroomRatio,
	}
}

// UsableConnections is floor((1-headroom) * DB max_connections).
func (w CapacityWorksheet) UsableConnections() int {
	ratio := w.HeadroomRatio
	if ratio < 0 {
		ratio = 0
	}
	if ratio > 0.9 {
		ratio = 0.9
	}
	return int(float64(w.DBMaxConnections) * (1 - ratio))
}

// AppPoolTotal is sum of API+worker theoretical max connections.
func (w CapacityWorksheet) AppPoolTotal() int {
	return w.APIReplicas*int(w.APIMaxConns) + w.WorkerReplicas*int(w.WorkerMaxConns)
}

// ReservedHeadroom is migrate + admin reservation (must fit in headroom band).
func (w CapacityWorksheet) ReservedHeadroom() int {
	return int(w.MigrateMaxConns) + int(w.AdminMaxConns)
}

// HeadroomBand is DBMax - Usable (connections reserved outside app pools).
func (w CapacityWorksheet) HeadroomBand() int {
	return w.DBMaxConnections - w.UsableConnections()
}

// Validate returns an error when the worksheet exceeds the budget.
func (w CapacityWorksheet) Validate() error {
	if w.DBMaxConnections < 10 {
		return fmt.Errorf("config: PG_MAX_CONNECTIONS must be >= 10, got %d", w.DBMaxConnections)
	}
	if w.APIReplicas < 1 || w.WorkerReplicas < 0 {
		return fmt.Errorf("config: replica counts invalid api=%d worker=%d", w.APIReplicas, w.WorkerReplicas)
	}
	if w.APIMaxConns < 1 || w.WorkerMaxConns < 1 {
		return fmt.Errorf("config: pool max conns must be >= 1 (api=%d worker=%d)", w.APIMaxConns, w.WorkerMaxConns)
	}
	if w.MigrateMaxConns < 1 || w.AdminMaxConns < 0 {
		return fmt.Errorf("config: migrate/admin pool sizes invalid migrate=%d admin=%d", w.MigrateMaxConns, w.AdminMaxConns)
	}
	app := w.AppPoolTotal()
	usable := w.UsableConnections()
	if app > usable {
		return fmt.Errorf(
			"config: connection budget exceeded: api(%d×%d)+worker(%d×%d)=%d > usable %d (%.0f%% of PG_MAX_CONNECTIONS=%d); reduce replicas/MaxConns or raise PG_MAX_CONNECTIONS",
			w.APIReplicas, w.APIMaxConns, w.WorkerReplicas, w.WorkerMaxConns, app, usable,
			(1-w.HeadroomRatio)*100, w.DBMaxConnections,
		)
	}
	// Migrate+admin must fit in the reserved headroom band (HA/PITR share the rest).
	reserved := w.ReservedHeadroom()
	band := w.HeadroomBand()
	if reserved > band {
		return fmt.Errorf(
			"config: migrate(%d)+admin(%d)=%d exceeds headroom band %d (%.0f%% of %d); lower PG_MIGRATE_MAX_CONNS/PG_ADMIN_MAX_CONNS or raise headroom",
			w.MigrateMaxConns, w.AdminMaxConns, reserved, band, w.HeadroomRatio*100, w.DBMaxConnections,
		)
	}
	return nil
}

// Summary returns a stable diagnostic string (no secrets).
func (w CapacityWorksheet) Summary() string {
	return fmt.Sprintf(
		"api=%d×%d worker=%d×%d app_total=%d usable=%d/%d headroom_band=%d migrate=%d admin=%d",
		w.APIReplicas, w.APIMaxConns, w.WorkerReplicas, w.WorkerMaxConns,
		w.AppPoolTotal(), w.UsableConnections(), w.DBMaxConnections, w.HeadroomBand(),
		w.MigrateMaxConns, w.AdminMaxConns,
	)
}

// ProcessRole maps service name to pool role.
func ProcessRole(serviceName string) string {
	s := strings.ToLower(strings.TrimSpace(serviceName))
	switch {
	case strings.Contains(s, "worker"):
		return RoleWorker
	case strings.Contains(s, "migrate"):
		return RoleMigrate
	case strings.Contains(s, "seed"):
		return RoleSeed
	case strings.Contains(s, "admin"), strings.Contains(s, "bootstrap"):
		return RoleAdmin
	default:
		return RoleAPI
	}
}

// loadCapacityWorksheet reads topology knobs from the environment.
func loadCapacityWorksheet() (CapacityWorksheet, error) {
	w := DefaultCapacityWorksheet()
	var err error
	if w.DBMaxConnections, err = envInt("PG_MAX_CONNECTIONS", w.DBMaxConnections); err != nil {
		return w, err
	}
	if w.APIReplicas, err = envInt("PG_API_REPLICAS", w.APIReplicas); err != nil {
		return w, err
	}
	if w.WorkerReplicas, err = envInt("PG_WORKER_REPLICAS", w.WorkerReplicas); err != nil {
		return w, err
	}
	if v, err := envInt32("PG_API_MAX_CONNS", w.APIMaxConns); err != nil {
		return w, err
	} else {
		w.APIMaxConns = v
	}
	if v, err := envInt32("PG_WORKER_MAX_CONNS", w.WorkerMaxConns); err != nil {
		return w, err
	} else {
		w.WorkerMaxConns = v
	}
	if v, err := envInt32("PG_MIGRATE_MAX_CONNS", w.MigrateMaxConns); err != nil {
		return w, err
	} else {
		w.MigrateMaxConns = v
	}
	if v, err := envInt32("PG_ADMIN_MAX_CONNS", w.AdminMaxConns); err != nil {
		return w, err
	} else {
		w.AdminMaxConns = v
	}
	if raw := strings.TrimSpace(os.Getenv("PG_BUDGET_HEADROOM_RATIO")); raw != "" {
		f, err := strconv.ParseFloat(raw, 64)
		if err != nil || f < 0 || f > 0.9 {
			return w, fmt.Errorf("config: PG_BUDGET_HEADROOM_RATIO must be 0..0.9, got %q", raw)
		}
		w.HeadroomRatio = f
	}
	return w, nil
}

// loadPoolTuning reads per-process pool overrides (applied after role defaults).
func loadPoolTuning(role string, sheet CapacityWorksheet) (PoolTuning, error) {
	base := PoolTuning{
		MaxConnLifetime:   30 * time.Minute,
		MaxConnIdleTime:   5 * time.Minute,
		HealthCheckPeriod: 30 * time.Second,
		ConnectTimeout:    5 * time.Second,
		StatementTimeout:  time.Duration(DefaultStatementTimeoutMS) * time.Millisecond,
		Role:              role,
	}
	switch role {
	case RoleWorker:
		base.MaxConns = sheet.WorkerMaxConns
		base.MinConns = 1
		base.ApplicationName = "fersaku-worker"
	case RoleMigrate:
		base.MaxConns = sheet.MigrateMaxConns
		base.MinConns = 0
		base.ApplicationName = "fersaku-migrate"
	case RoleAdmin, RoleSeed:
		base.MaxConns = sheet.AdminMaxConns
		base.MinConns = 0
		base.ApplicationName = "fersaku-admin"
	default:
		base.MaxConns = sheet.APIMaxConns
		base.MinConns = 2
		base.ApplicationName = "fersaku-api"
	}

	// Per-process override (takes precedence over role worksheet MaxConns).
	if v, ok, err := envInt32Opt("PG_POOL_MAX_CONNS"); err != nil {
		return base, err
	} else if ok {
		base.MaxConns = v
	}
	if v, ok, err := envInt32Opt("PG_POOL_MIN_CONNS"); err != nil {
		return base, err
	} else if ok {
		base.MinConns = v
	}
	if sec, ok, err := envIntOpt("PG_POOL_MAX_CONN_LIFETIME_SEC"); err != nil {
		return base, err
	} else if ok {
		base.MaxConnLifetime = time.Duration(sec) * time.Second
	}
	if sec, ok, err := envIntOpt("PG_POOL_MAX_CONN_IDLE_SEC"); err != nil {
		return base, err
	} else if ok {
		base.MaxConnIdleTime = time.Duration(sec) * time.Second
	}
	if sec, ok, err := envIntOpt("PG_POOL_HEALTH_CHECK_SEC"); err != nil {
		return base, err
	} else if ok {
		base.HealthCheckPeriod = time.Duration(sec) * time.Second
	}
	if sec, ok, err := envIntOpt("PG_POOL_CONNECT_TIMEOUT_SEC"); err != nil {
		return base, err
	} else if ok {
		base.ConnectTimeout = time.Duration(sec) * time.Second
	}
	if ms, ok, err := envIntOpt("PG_STATEMENT_TIMEOUT_MS"); err != nil {
		return base, err
	} else if ok {
		base.StatementTimeout = time.Duration(ms) * time.Millisecond
	}
	if name := strings.TrimSpace(os.Getenv("PG_APPLICATION_NAME")); name != "" {
		base.ApplicationName = name
	}
	if base.MaxConns < 1 {
		return base, fmt.Errorf("config: PG_POOL_MAX_CONNS must be >= 1, got %d", base.MaxConns)
	}
	if base.MinConns < 0 || base.MinConns > base.MaxConns {
		return base, fmt.Errorf("config: PG_POOL_MIN_CONNS invalid min=%d max=%d", base.MinConns, base.MaxConns)
	}
	return base, nil
}

func envInt(key string, def int) (int, error) {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return def, nil
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("config: %s must be integer, got %q", key, raw)
	}
	return n, nil
}

func envInt32(key string, def int32) (int32, error) {
	n, err := envInt(key, int(def))
	if err != nil {
		return 0, err
	}
	return int32(n), nil
}

func envIntOpt(key string) (int, bool, error) {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return 0, false, nil
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return 0, true, fmt.Errorf("config: %s must be integer, got %q", key, raw)
	}
	return n, true, nil
}

func envInt32Opt(key string) (int32, bool, error) {
	n, ok, err := envIntOpt(key)
	return int32(n), ok, err
}

// budgetEnforceEnabled is true when capacity worksheet must fail closed.
// Staging/production always enforce; local/test only when PG_BUDGET_ENFORCE=1.
func budgetEnforceEnabled(appEnv Env) bool {
	if raw := strings.TrimSpace(os.Getenv("PG_BUDGET_ENFORCE")); raw != "" {
		switch strings.ToLower(raw) {
		case "1", "true", "yes", "on":
			return true
		case "0", "false", "no", "off":
			return false
		}
	}
	return appEnv == EnvStaging || appEnv == EnvProduction
}
