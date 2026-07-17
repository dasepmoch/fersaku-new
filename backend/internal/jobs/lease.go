package jobs

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// ErrLeaseNotAcquired means another replica holds a live lease.
var ErrLeaseNotAcquired = errors.New("job lease not acquired")

// LeaseStore provides multi-replica exclusive job leases via Postgres.
type LeaseStore struct {
	Pool  *pgxpool.Pool
	Clock ports.Clock
}

func (s *LeaseStore) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now().UTC()
	}
	return time.Now().UTC()
}

// TryAcquire claims job_name for owner until leaseUntil if free or expired.
// Uses INSERT ... ON CONFLICT + conditional UPDATE so only one replica wins.
func (s *LeaseStore) TryAcquire(ctx context.Context, jobName JobName, owner string, leaseTTL time.Duration) (leaseUntil time.Time, err error) {
	if s.Pool == nil {
		return time.Time{}, fmt.Errorf("lease store: pool required")
	}
	if owner == "" {
		return time.Time{}, fmt.Errorf("lease store: owner required")
	}
	if leaseTTL <= 0 {
		leaseTTL = 30 * time.Second
	}
	now := s.now()
	until := now.Add(leaseTTL)

	// Single-statement race-safe claim: insert if missing; else take if expired or same owner.
	tag, err := s.Pool.Exec(ctx, `
		INSERT INTO job_leases (job_name, owner, lease_until, locked_at, updated_at)
		VALUES ($1, $2, $3, $4, $4)
		ON CONFLICT (job_name) DO UPDATE
		SET owner = EXCLUDED.owner,
		    lease_until = EXCLUDED.lease_until,
		    locked_at = EXCLUDED.locked_at,
		    updated_at = EXCLUDED.updated_at,
		    last_error = NULL
		WHERE job_leases.lease_until <= EXCLUDED.locked_at
		   OR job_leases.owner = EXCLUDED.owner`,
		string(jobName), owner, until, now,
	)
	if err != nil {
		return time.Time{}, err
	}
	if tag.RowsAffected() == 0 {
		return time.Time{}, ErrLeaseNotAcquired
	}
	return until, nil
}

// Release frees the lease if still owned by owner (graceful drain / early release).
func (s *LeaseStore) Release(ctx context.Context, jobName JobName, owner string) error {
	if s.Pool == nil {
		return nil
	}
	now := s.now()
	_, err := s.Pool.Exec(ctx, `
		UPDATE job_leases
		SET lease_until = $3,
		    updated_at = $3
		WHERE job_name = $1 AND owner = $2`,
		string(jobName), owner, now,
	)
	return err
}

// MarkSuccess records a successful run and optionally extends ownership end.
func (s *LeaseStore) MarkSuccess(ctx context.Context, jobName JobName, owner string) error {
	if s.Pool == nil {
		return nil
	}
	now := s.now()
	_, err := s.Pool.Exec(ctx, `
		UPDATE job_leases
		SET last_success_at = $3,
		    last_error = NULL,
		    run_count = run_count + 1,
		    lease_until = $3,
		    updated_at = $3
		WHERE job_name = $1 AND owner = $2`,
		string(jobName), owner, now,
	)
	return err
}

// MarkFailure records last_error and releases the lease for retry by any replica.
func (s *LeaseStore) MarkFailure(ctx context.Context, jobName JobName, owner string, runErr error) error {
	if s.Pool == nil {
		return nil
	}
	now := s.now()
	msg := "error"
	if runErr != nil {
		msg = runErr.Error()
		if len(msg) > 500 {
			msg = msg[:500]
		}
	}
	_, err := s.Pool.Exec(ctx, `
		UPDATE job_leases
		SET last_error = $3,
		    run_count = run_count + 1,
		    lease_until = $4,
		    updated_at = $4
		WHERE job_name = $1 AND owner = $2`,
		string(jobName), owner, msg, now,
	)
	return err
}

// GetLease returns current lease row fields for tests/health.
type LeaseInfo struct {
	JobName       string
	Owner         string
	LeaseUntil    time.Time
	LastSuccessAt *time.Time
	LastError     *string
	RunCount      int64
}

// Get loads lease state; returns false if no row.
func (s *LeaseStore) Get(ctx context.Context, jobName JobName) (LeaseInfo, bool, error) {
	if s.Pool == nil {
		return LeaseInfo{}, false, fmt.Errorf("lease store: pool required")
	}
	var info LeaseInfo
	var lastSuccess pgtypeTimestamptz
	var lastErr *string
	err := s.Pool.QueryRow(ctx, `
		SELECT job_name, owner, lease_until, last_success_at, last_error, run_count
		FROM job_leases WHERE job_name = $1`, string(jobName),
	).Scan(&info.JobName, &info.Owner, &info.LeaseUntil, &lastSuccess, &lastErr, &info.RunCount)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return LeaseInfo{}, false, nil
		}
		return LeaseInfo{}, false, err
	}
	if lastSuccess.valid {
		t := lastSuccess.t
		info.LastSuccessAt = &t
	}
	info.LastError = lastErr
	return info, true, nil
}

// pgtypeTimestamptz is a tiny nullable timestamptz scanner without pgtype import coupling in tests.
type pgtypeTimestamptz struct {
	t     time.Time
	valid bool
}

func (p *pgtypeTimestamptz) Scan(src any) error {
	if src == nil {
		p.valid = false
		return nil
	}
	switch v := src.(type) {
	case time.Time:
		p.t = v.UTC()
		p.valid = true
		return nil
	default:
		return fmt.Errorf("cannot scan %T into timestamptz", src)
	}
}
