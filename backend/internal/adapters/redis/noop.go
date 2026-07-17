// Package redis provides Redis adapters. Noop is local/test only.
// Redis is non-authoritative (ADR-0001).
package redis

import "context"

// Noop is a placeholder for local/test when Redis is not required.
// Forbidden as production readiness authority (INT-180).
type Noop struct{}

// Ping always succeeds for ready checks when Redis is not required.
func (Noop) Ping() error { return nil }

// PingContext matches Client.Ping signature for interface-ish checks.
func (Noop) PingContext(context.Context) error { return nil }

// Kind returns adapter kind for readiness.
func (Noop) Kind() string { return "noop" }

// Close is a no-op.
func (Noop) Close() error { return nil }
