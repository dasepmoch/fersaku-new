package jobs

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type fixedClock struct{ t time.Time }

func (c fixedClock) Now() time.Time { return c.t }

func TestRunner_IdempotentDoubleRun(t *testing.T) {
	var calls atomic.Int64
	// Idempotent domain effect: only first successful application counts.
	var once sync.Once
	var applied atomic.Int64

	reg := NewRegistry()
	reg.Register(JobMeta{
		Name: JobSettlementRelease, Cadence: time.Hour, BatchSize: 10,
		Timeout: 2 * time.Second, LeaseTTL: 3 * time.Second,
	}, func(context.Context, int) (int, error) {
		calls.Add(1)
		once.Do(func() { applied.Add(1) })
		return 1, nil
	})

	r := &Runner{
		Registry: reg,
		Clock:    fixedClock{t: time.Date(2026, 7, 17, 12, 0, 0, 0, time.UTC)},
		Owner:    "t1",
	}
	ctx := context.Background()
	if err := r.RunOnce(ctx); err != nil {
		t.Fatal(err)
	}
	if err := r.RunOnce(ctx); err != nil {
		t.Fatal(err)
	}
	if calls.Load() != 2 {
		t.Fatalf("expected 2 runner invocations, got %d", calls.Load())
	}
	if applied.Load() != 1 {
		t.Fatalf("idempotent effect should apply once, got %d", applied.Load())
	}
}

func TestRunner_GracefulDrainStopsNewWork(t *testing.T) {
	var started atomic.Int64
	block := make(chan struct{})
	reg := NewRegistry()
	reg.Register(JobMeta{
		Name: JobNotificationOutbox, Cadence: time.Millisecond, BatchSize: 1,
		Timeout: 5 * time.Second, LeaseTTL: 5 * time.Second,
	}, func(ctx context.Context, _ int) (int, error) {
		started.Add(1)
		select {
		case <-block:
		case <-ctx.Done():
		}
		return 0, nil
	})

	r := &Runner{
		Registry: reg,
		Clock:    fixedClock{t: time.Now().UTC()},
		Owner:    "drain-test",
		Tick:     20 * time.Millisecond,
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- r.Run(ctx) }()

	// Wait until at least one job started.
	deadline := time.Now().Add(2 * time.Second)
	for started.Load() == 0 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if started.Load() == 0 {
		close(block)
		cancel()
		t.Fatal("job never started")
	}
	cancel()
	// Unblock so drain can finish.
	close(block)
	select {
	case err := <-done:
		if err != nil && err != context.Canceled {
			t.Fatalf("run err: %v", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("runner did not stop")
	}
	if r.Alive() {
		t.Fatal("expected not alive after drain")
	}
}

func TestRunner_ConcurrentExecuteJob_NoLeaseStillIdempotentEffect(t *testing.T) {
	var applied atomic.Int64
	var mu sync.Mutex
	seen := false
	reg := NewRegistry()
	reg.Register(JobMeta{
		Name: JobCouponReservationExpiry, Cadence: time.Hour, BatchSize: 5,
		Timeout: time.Second, LeaseTTL: 2 * time.Second,
	}, func(context.Context, int) (int, error) {
		mu.Lock()
		defer mu.Unlock()
		if !seen {
			seen = true
			applied.Add(1)
			return 1, nil
		}
		// Second concurrent/double run: no-op effect.
		return 0, nil
	})
	r := &Runner{Registry: reg, Owner: "c1", Clock: fixedClock{t: time.Now().UTC()}}
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			r.executeJob(context.Background(), reg.All()[0])
		}()
	}
	wg.Wait()
	if applied.Load() != 1 {
		t.Fatalf("want single apply, got %d", applied.Load())
	}
}
