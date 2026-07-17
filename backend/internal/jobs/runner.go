package jobs

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// Runner drives the HA job registry: lease → run → release, with graceful drain.
type Runner struct {
	Registry *Registry
	Leases   *LeaseStore
	Log      ports.Logger
	Clock    ports.Clock
	// Owner identifies this worker process (hostname/ulid).
	Owner string
	// Tick is the base loop interval for checking due jobs (default 1s).
	Tick time.Duration

	// Health snapshots (atomic).
	alive     atomic.Bool
	running   atomic.Int64
	lastTick  atomic.Int64 // unix nano
	drainMode atomic.Bool

	// inFlight tracks jobs currently executing for drain wait.
	inFlight sync.WaitGroup
	mu       sync.Mutex
	// nextDue maps job name → earliest next run (local; lease enforces multi-replica).
	nextDue map[JobName]time.Time
}

func (r *Runner) now() time.Time {
	if r.Clock != nil {
		return r.Clock.Now().UTC()
	}
	return time.Now().UTC()
}

// Alive reports whether the scheduler loop is active.
func (r *Runner) Alive() bool { return r.alive.Load() }

// InFlight returns approximate number of jobs currently executing.
func (r *Runner) InFlight() int64 { return r.running.Load() }

// Draining reports graceful shutdown mode (no new leases).
func (r *Runner) Draining() bool { return r.drainMode.Load() }

// LastTick returns last loop tick time (zero if never).
func (r *Runner) LastTick() time.Time {
	n := r.lastTick.Load()
	if n == 0 {
		return time.Time{}
	}
	return time.Unix(0, n).UTC()
}

// Run blocks until ctx is cancelled, then drains in-flight jobs.
func (r *Runner) Run(ctx context.Context) error {
	if r.Registry == nil {
		return errors.New("jobs runner: registry required")
	}
	if r.Owner == "" {
		r.Owner = "worker"
	}
	tick := r.Tick
	if tick <= 0 {
		tick = time.Second
	}
	r.mu.Lock()
	if r.nextDue == nil {
		r.nextDue = make(map[JobName]time.Time)
	}
	r.mu.Unlock()

	r.alive.Store(true)
	if r.Log != nil {
		r.Log.Info("ha job runner ready", "owner", r.Owner, "jobs", len(r.Registry.All()))
	}

	t := time.NewTicker(tick)
	defer t.Stop()

	for {
		select {
		case <-ctx.Done():
			r.drainMode.Store(true)
			r.alive.Store(false)
			if r.Log != nil {
				r.Log.Info("ha job runner draining", "in_flight", r.running.Load())
			}
			// Wait for in-flight batches; they finish or hit their timeout.
			done := make(chan struct{})
			go func() {
				r.inFlight.Wait()
				close(done)
			}()
			select {
			case <-done:
			case <-time.After(2 * time.Minute):
				if r.Log != nil {
					r.Log.Warn("ha job runner drain timeout", "in_flight", r.running.Load())
				}
			}
			if r.Log != nil {
				r.Log.Info("ha job runner stopped")
			}
			return ctx.Err()
		case <-t.C:
			r.lastTick.Store(r.now().UnixNano())
			if r.drainMode.Load() {
				continue
			}
			r.tickOnce(ctx)
		}
	}
}

// RunOnce executes every registered job that can acquire a lease (tests / WorkerRunOnce).
func (r *Runner) RunOnce(ctx context.Context) error {
	if r.Registry == nil {
		return errors.New("jobs runner: registry required")
	}
	if r.Owner == "" {
		r.Owner = "worker"
	}
	for _, j := range r.Registry.All() {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		r.executeJob(ctx, j)
	}
	return nil
}

func (r *Runner) tickOnce(ctx context.Context) {
	now := r.now()
	for _, j := range r.Registry.All() {
		if ctx.Err() != nil || r.drainMode.Load() {
			return
		}
		r.mu.Lock()
		due, ok := r.nextDue[j.Meta.Name]
		r.mu.Unlock()
		if ok && now.Before(due) {
			continue
		}
		// Fire-and-forget per job so slow jobs don't block others; lease prevents double-run.
		job := j
		r.inFlight.Add(1)
		r.running.Add(1)
		go func() {
			defer r.inFlight.Done()
			defer r.running.Add(-1)
			r.executeJob(ctx, job)
		}()
		// Local cadence gate (lease is source of multi-replica truth).
		cadence := job.Meta.Cadence
		if cadence <= 0 {
			cadence = 30 * time.Second
		}
		r.mu.Lock()
		r.nextDue[job.Meta.Name] = now.Add(cadence)
		r.mu.Unlock()
	}
}

func (r *Runner) executeJob(ctx context.Context, j RegisteredJob) {
	if r.drainMode.Load() && ctx.Err() != nil {
		return
	}
	if j.Run == nil {
		return
	}
	leaseTTL := j.Meta.LeaseTTL
	if leaseTTL <= 0 {
		leaseTTL = j.Meta.Timeout + 15*time.Second
	}
	if leaseTTL <= 0 {
		leaseTTL = 45 * time.Second
	}

	if r.Leases != nil && r.Leases.Pool != nil {
		_, err := r.Leases.TryAcquire(ctx, j.Meta.Name, r.Owner, leaseTTL)
		if errors.Is(err, ErrLeaseNotAcquired) {
			return
		}
		if err != nil {
			if r.Log != nil {
				r.Log.Warn("job lease acquire failed", "job", string(j.Meta.Name), "err", err.Error())
			}
			return
		}
	}

	timeout := j.Meta.Timeout
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	runCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	start := r.now()
	batch := j.Meta.BatchSize
	if batch <= 0 {
		batch = 50
	}
	n, runErr := j.Run(runCtx, batch)
	elapsed := r.now().Sub(start)

	if r.Leases != nil && r.Leases.Pool != nil {
		if runErr != nil {
			_ = r.Leases.MarkFailure(ctx, j.Meta.Name, r.Owner, runErr)
		} else {
			_ = r.Leases.MarkSuccess(ctx, j.Meta.Name, r.Owner)
		}
	}

	if r.Log != nil {
		if runErr != nil {
			r.Log.Warn("job failed", "job", string(j.Meta.Name), "processed", n, "dur_ms", elapsed.Milliseconds(), "err", runErr.Error())
		} else if n > 0 {
			r.Log.Info("job ok", "job", string(j.Meta.Name), "processed", n, "dur_ms", elapsed.Milliseconds())
		}
	}
}
