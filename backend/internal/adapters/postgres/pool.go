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
	// MaxConns is the maximum number of connections (default 20).
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
}

// DefaultPoolConfig returns production-sane defaults for local and small deploys.
func DefaultPoolConfig() PoolConfig {
	return PoolConfig{
		MaxConns:          20,
		MinConns:          0,
		MaxConnLifetime:       30 * time.Minute,
		MaxConnIdleTime:   5 * time.Minute,
		HealthCheckPeriod: 30 * time.Second,
		ConnectTimeout:    5 * time.Second,
	}
}

// Pool wraps pgxpool.Pool with transaction helpers.
// Domain packages must never import this package or pgx.
type Pool struct {
	pool *pgxpool.Pool
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

	pool, err := pgxpool.NewWithConfig(ctx, pcfg)
	if err != nil {
		return nil, fmt.Errorf("postgres: open pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("postgres: ping: %w", err)
	}
	return &Pool{pool: pool}, nil
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
