// Package redis provides Redis adapters. Scaffold uses a noop client marker.
// Redis is non-authoritative (ADR-0001); real client arrives in later tasks.
package redis

// Noop is a placeholder until BE-002/BE-100 wiring.
type Noop struct{}

// Ping always succeeds for ready checks when Redis is not required.
func (Noop) Ping() error { return nil }
