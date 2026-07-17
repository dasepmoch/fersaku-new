// Package jobs hosts HA worker job registry, lease-safe runners, and outbox consumers.
package jobs

import (
	"context"

	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// Scheduler is a thin compatibility wrapper around Runner for legacy call sites.
// Prefer Runner + Registry (INT-185) for multi-replica lifecycle jobs.
type Scheduler struct {
	Log   ports.Logger
	Queue ports.Queue
	// Runner when set is used by Run; otherwise blocks until cancel (scaffold).
	Runner *Runner
}

// Run blocks until ctx is cancelled.
func (s *Scheduler) Run(ctx context.Context) error {
	if s.Runner != nil {
		return s.Runner.Run(ctx)
	}
	if s.Log != nil {
		s.Log.Info("worker scheduler ready (no runner)", "queue", "n/a")
	}
	<-ctx.Done()
	if s.Log != nil {
		s.Log.Info("worker scheduler stopping")
	}
	return ctx.Err()
}
