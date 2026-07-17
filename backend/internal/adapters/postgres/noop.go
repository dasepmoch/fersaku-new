// Package postgres provides PostgreSQL adapters (pool, unit-of-work, sqlc gen).
// Domain packages must never import this package or pgx (import-boundary tests).
package postgres

import "context"

// Noop is a placeholder pinger for unit tests / local boot without DATABASE_URL.
type Noop struct{}

// Ping always succeeds when no real database is configured.
func (Noop) Ping(ctx context.Context) error {
	_ = ctx
	return nil
}
