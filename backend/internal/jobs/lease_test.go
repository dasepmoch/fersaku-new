package jobs

import (
	"context"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	u := os.Getenv("DATABASE_URL")
	if u == "" {
		t.Skip("DATABASE_URL not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	t.Cleanup(cancel)
	pool, err := pgxpool.New(ctx, u)
	if err != nil {
		t.Fatalf("pool: %v", err)
	}
	t.Cleanup(pool.Close)
	// Ensure lease table exists (migration may already apply; create if missing for isolated unit).
	_, err = pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS job_leases (
			job_name         text        PRIMARY KEY,
			owner            text        NOT NULL,
			lease_until      timestamptz NOT NULL,
			locked_at        timestamptz NOT NULL DEFAULT now(),
			last_success_at  timestamptz,
			last_error       text,
			run_count        bigint      NOT NULL DEFAULT 0,
			updated_at       timestamptz NOT NULL DEFAULT now()
		)`)
	if err != nil {
		t.Fatalf("ensure job_leases: %v", err)
	}
	return pool
}

func TestLeaseStore_Exclusivity(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	clock := fixedClock{t: time.Date(2026, 7, 17, 10, 0, 0, 0, time.UTC)}
	store := &LeaseStore{Pool: pool, Clock: clock}
	job := JobName("test.lease_exclusivity")
	_, _ = pool.Exec(ctx, `DELETE FROM job_leases WHERE job_name = $1`, string(job))

	until, err := store.TryAcquire(ctx, job, "worker-a", 30*time.Second)
	if err != nil {
		t.Fatalf("a acquire: %v", err)
	}
	if until.Before(clock.t) {
		t.Fatalf("lease until %v before now", until)
	}

	_, err = store.TryAcquire(ctx, job, "worker-b", 30*time.Second)
	if err != ErrLeaseNotAcquired {
		t.Fatalf("b should lose lease, err=%v", err)
	}

	// Same owner can re-acquire.
	if _, err := store.TryAcquire(ctx, job, "worker-a", 30*time.Second); err != nil {
		t.Fatalf("a re-acquire: %v", err)
	}

	// Expire lease via clock jump.
	store.Clock = fixedClock{t: clock.t.Add(time.Minute)}
	if _, err := store.TryAcquire(ctx, job, "worker-b", 30*time.Second); err != nil {
		t.Fatalf("b after expiry: %v", err)
	}
}

func TestLeaseStore_ConcurrentOnlyOneWins(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	store := &LeaseStore{Pool: pool, Clock: fixedClock{t: time.Now().UTC()}}
	job := JobName("test.lease_race")
	_, _ = pool.Exec(ctx, `DELETE FROM job_leases WHERE job_name = $1`, string(job))

	var wins atomic.Int64
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			owner := fmt.Sprintf("w-%d", i)
			if _, err := store.TryAcquire(ctx, job, owner, 15*time.Second); err == nil {
				wins.Add(1)
			}
		}(i)
	}
	wg.Wait()
	if wins.Load() != 1 {
		t.Fatalf("expected exactly 1 winner, got %d", wins.Load())
	}
}

func TestRunner_LeasePreventsDoubleDomainEffect(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	clock := fixedClock{t: time.Now().UTC()}
	store := &LeaseStore{Pool: pool, Clock: clock}
	job := JobCouponReservationExpiry
	_, _ = pool.Exec(ctx, `DELETE FROM job_leases WHERE job_name = $1`, string(job))

	var domain atomic.Int64
	reg := NewRegistry()
	reg.Register(JobMeta{
		Name: job, Cadence: time.Hour, BatchSize: 10,
		Timeout: 2 * time.Second, LeaseTTL: 10 * time.Second,
	}, func(context.Context, int) (int, error) {
		domain.Add(1)
		time.Sleep(50 * time.Millisecond)
		return 1, nil
	})

	runA := &Runner{Registry: reg, Leases: store, Clock: clock, Owner: "replica-a"}
	runB := &Runner{Registry: reg, Leases: store, Clock: clock, Owner: "replica-b"}

	var wg sync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); _ = runA.RunOnce(ctx) }()
	go func() { defer wg.Done(); _ = runB.RunOnce(ctx) }()
	wg.Wait()

	if domain.Load() != 1 {
		t.Fatalf("lease should allow only one domain run, got %d", domain.Load())
	}
}
