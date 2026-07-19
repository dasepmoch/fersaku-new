package postgres

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PoolConfig controls pgx pool sizing and timeouts.
type PoolConfig struct {
	// MaxConns is the maximum number of connections (role-specific; see config.CapacityWorksheet).
	MaxConns int32
	// MinConns is the minimum idle connections (default 0).
	MinConns int32
	// MaxConnLifetime is connection lifetime (default 30m).
	MaxConnLifetime time.Duration
	// MaxConnIdleTime is idle eviction (default 5m).
	MaxConnIdleTime time.Duration
	// HealthCheckPeriod is pool health tick (default 30s).
	HealthCheckPeriod time.Duration
	// ConnectTimeout bounds dial+auth (default 5s).
	ConnectTimeout time.Duration
	// StatementTimeout is applied as runtime parameter statement_timeout (0 = omit).
	StatementTimeout time.Duration
	// ApplicationName is set as runtime parameter application_name for pg_stat_activity.
	ApplicationName string
}

// DefaultPoolConfig returns local/single-process defaults.
// Prefer Role-based sizing via config.PostgresPoolConfig for api/worker.
func DefaultPoolConfig() PoolConfig {
	return PoolConfig{
		MaxConns:          20,
		MinConns:          0,
		MaxConnLifetime:   30 * time.Minute,
		MaxConnIdleTime:   5 * time.Minute,
		HealthCheckPeriod: 30 * time.Second,
		ConnectTimeout:    5 * time.Second,
		StatementTimeout:  30 * time.Second,
		ApplicationName:   "fersaku",
	}
}

// Pool wraps pgxpool.Pool with transaction helpers.
// Domain packages must never import this package or pgx.
type Pool struct {
	pool *pgxpool.Pool
	cfg  PoolConfig
}

// Open creates a pool from DATABASE_URL. Caller must Close.
func Open(ctx context.Context, databaseURL string, cfg PoolConfig) (*Pool, error) {
	if databaseURL == "" {
		return nil, fmt.Errorf("postgres: DATABASE_URL is empty")
	}
	if cfg.MaxConns == 0 {
		cfg = DefaultPoolConfig()
	}

	pcfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("postgres: parse DATABASE_URL: %w", err)
	}
	pcfg.MaxConns = cfg.MaxConns
	pcfg.MinConns = cfg.MinConns
	pcfg.MaxConnLifetime = cfg.MaxConnLifetime
	pcfg.MaxConnIdleTime = cfg.MaxConnIdleTime
	pcfg.HealthCheckPeriod = cfg.HealthCheckPeriod
	if cfg.ConnectTimeout > 0 {
		pcfg.ConnConfig.ConnectTimeout = cfg.ConnectTimeout
	}

	// Session GUC: application_name + statement_timeout for every acquired conn.
	runtimeParams := map[string]string{}
	if cfg.ApplicationName != "" {
		runtimeParams["application_name"] = cfg.ApplicationName
	}
	if cfg.StatementTimeout > 0 {
		// Postgres accepts "30s" / milliseconds integer; use ms for precision.
		runtimeParams["statement_timeout"] = fmt.Sprintf("%d", cfg.StatementTimeout.Milliseconds())
	}
	if len(runtimeParams) > 0 {
		if pcfg.ConnConfig.RuntimeParams == nil {
			pcfg.ConnConfig.RuntimeParams = map[string]string{}
		}
		for k, v := range runtimeParams {
			pcfg.ConnConfig.RuntimeParams[k] = v
		}
	}

	pool, err := pgxpool.NewWithConfig(ctx, pcfg)
	if err != nil {
		return nil, fmt.Errorf("postgres: open pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("postgres: ping: %w", err)
	}
	return &Pool{pool: pool, cfg: cfg}, nil
}

// Close releases the pool.
func (p *Pool) Close() {
	if p == nil || p.pool == nil {
		return
	}
	p.pool.Close()
}

// Ping checks database connectivity (health/ready).
func (p *Pool) Ping(ctx context.Context) error {
	if p == nil || p.pool == nil {
		return fmt.Errorf("postgres: pool is nil")
	}
	return p.pool.Ping(ctx)
}

// Pool returns the underlying pgxpool for sqlc / advanced use in this adapter package only.
func (p *Pool) Pool() *pgxpool.Pool {
	if p == nil {
		return nil
	}
	return p.pool
}

// Config returns the pool sizing used at Open (for metrics/diagnostics).
func (p *Pool) Config() PoolConfig {
	if p == nil {
		return PoolConfig{}
	}
	return p.cfg
}

// Stats returns pgx pool stats (acquired/idle/max) for metrics exporters.
func (p *Pool) Stats() *pgxpool.Stat {
	if p == nil || p.pool == nil {
		return nil
	}
	return p.pool.Stat()
}

// WithTx runs fn inside a transaction. Commits on nil error; rolls back otherwise.
// Transaction boundaries stay explicit: callers must not start nested hidden txs.
func (p *Pool) WithTx(ctx context.Context, fn func(ctx context.Context, tx pgx.Tx) error) error {
	if p == nil || p.pool == nil {
		return fmt.Errorf("postgres: pool is nil")
	}
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("postgres: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if err := fn(ctx, tx); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("postgres: commit: %w", err)
	}
	return nil
}
