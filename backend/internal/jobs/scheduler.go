// Package jobs hosts worker job handlers and scheduling hooks.
// Real asynq/outbox consumers arrive in later phases.
package jobs

import (
	"context"

	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// Scheduler is a scaffold worker loop driver (no public listener).
type Scheduler struct {
	Log   ports.Logger
	Queue ports.Queue
}

// Run blocks until ctx is cancelled. Logs ready once.
func (s *Scheduler) Run(ctx context.Context) error {
	s.Log.Info("worker scheduler ready", "queue", "fake")
	<-ctx.Done()
	s.Log.Info("worker scheduler stopping")
	return ctx.Err()
}
