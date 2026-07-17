//go:build integration

package integration_test

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres"
)

func databaseURL(t *testing.T) string {
	t.Helper()
	u := os.Getenv("DATABASE_URL")
	if u == "" {
		// QLT-105: required CI gates must not skip-pass when Postgres is absent.
		if os.Getenv("CI") != "" || os.Getenv("QLT_REQUIRE_INTEGRATION") == "1" {
			t.Fatal("DATABASE_URL required for integration tests (CI/QLT-105)")
		}
		t.Skip("DATABASE_URL not set; integration tests require Postgres")
	}
	return u
}

func backendRoot(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	// test/integration -> backend
	return filepath.Clean(filepath.Join(filepath.Dir(file), "..", ".."))
}

func runMigrate(t *testing.T, args ...string) {
	t.Helper()
	root := backendRoot(t)
	script := filepath.Join(root, "scripts", "migrate.sh")
	cmd := exec.Command("sh", append([]string{script}, args...)...)
	cmd.Dir = root
	cmd.Env = append(os.Environ(), "DATABASE_URL="+databaseURL(t))
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("migrate %v: %v\n%s", args, err, out)
	}
	t.Logf("migrate %v:\n%s", args, out)
}

func openPool(t *testing.T) *postgres.Pool {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	t.Cleanup(cancel)
	pool, err := postgres.Open(ctx, databaseURL(t), postgres.DefaultPoolConfig())
	if err != nil {
		t.Fatalf("open pool: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func TestMigrateUpFromZero(t *testing.T) {
	_ = databaseURL(t)
	// Drop all migrate state and re-apply from zero.
	runMigrate(t, "drop")
	runMigrate(t, "up")
	runMigrate(t, "version")

	pool := openPool(t)
	ctx := context.Background()
	var n int
	err := pool.Pool().QueryRow(ctx, `
		SELECT COUNT(*) FROM information_schema.tables
		WHERE table_schema = 'public'
		  AND table_name IN ('outbox_events', 'idempotency_records', 'audit_events', 'schema_meta')
	`).Scan(&n)
	if err != nil {
		t.Fatalf("count tables: %v", err)
	}
	if n != 4 {
		t.Fatalf("expected 4 foundation tables, got %d", n)
	}

	var idStrategy string
	err = pool.Pool().QueryRow(ctx, `SELECT value FROM schema_meta WHERE key = 'id_strategy'`).Scan(&idStrategy)
	if err != nil {
		t.Fatalf("schema_meta: %v", err)
	}
	if idStrategy != "ulid_text" {
		t.Fatalf("id_strategy=%q want ulid_text", idStrategy)
	}
}

func TestConcurrentIdempotencyFirstWriterWins(t *testing.T) {
	_ = databaseURL(t)
	runMigrate(t, "up")
	pool := openPool(t)
	ctx := context.Background()

	// Unique scope for this test run.
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	subjectID := "merchant_" + suffix
	keyHash := fmt.Sprintf("%x", sha256.Sum256([]byte("key-"+suffix)))
	reqHash := fmt.Sprintf("%x", sha256.Sum256([]byte("req-"+suffix)))
	expires := time.Now().UTC().Add(24 * time.Hour)

	const workers = 20
	var wins atomic.Int32
	var wg sync.WaitGroup
	wg.Add(workers)
	for i := 0; i < workers; i++ {
		i := i
		go func() {
			defer wg.Done()
			id := fmt.Sprintf("idem_%s_%02d", suffix, i)
			inserted, err := pool.TryInsertIdempotency(ctx, postgres.IdempotencyInsert{
				ID:          id,
				SubjectType: "merchant",
				SubjectID:   subjectID,
				Operation:   "payment.create",
				KeyHash:     keyHash,
				RequestHash: reqHash,
				Status:      "IN_PROGRESS",
				ExpiresAt:   expires,
			})
			if err != nil {
				t.Errorf("worker %d: %v", i, err)
				return
			}
			if inserted {
				wins.Add(1)
			}
		}()
	}
	wg.Wait()

	if wins.Load() != 1 {
		t.Fatalf("expected exactly 1 first-writer win, got %d", wins.Load())
	}

	var count int
	err := pool.Pool().QueryRow(ctx, `
		SELECT COUNT(*) FROM idempotency_records
		WHERE subject_type = 'merchant' AND subject_id = $1 AND key_hash = $2
	`, subjectID, keyHash).Scan(&count)
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected 1 row, got %d", count)
	}
}

func TestAtomicCommitRollbackOnOutboxFailure(t *testing.T) {
	_ = databaseURL(t)
	runMigrate(t, "up")
	pool := openPool(t)
	ctx := context.Background()

	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	domainID := "domain_" + suffix
	idemID := "idem_atomic_" + suffix
	auditID := "audit_" + suffix
	outboxID := "outbox_" + suffix

	// Ensure domain probe table exists for this test only (not a product migration).
	_, err := pool.Pool().Exec(ctx, `
		CREATE TABLE IF NOT EXISTS be100_domain_probe (
			id text PRIMARY KEY,
			note text NOT NULL
		)
	`)
	if err != nil {
		t.Fatalf("create probe: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Pool().Exec(context.Background(), `DELETE FROM be100_domain_probe WHERE id = $1`, domainID)
		_, _ = pool.Pool().Exec(context.Background(), `DELETE FROM idempotency_records WHERE id = $1`, idemID)
		// audit_events are append-only (BE-530); do not DELETE.
		_, _ = pool.Pool().Exec(context.Background(), `DELETE FROM outbox_events WHERE id = $1`, outboxID)
	})

	hash := sha256.Sum256([]byte("payload-" + suffix))
	expires := time.Now().UTC().Add(time.Hour)
	mode := "LIVE"

	// First: successful atomic write (domain + idempotency + outbox + audit).
	err = pool.RunAtomic(ctx, postgres.AtomicWrite{
		Domain: func(ctx context.Context, tx pgx.Tx) error {
			_, e := tx.Exec(ctx, `INSERT INTO be100_domain_probe (id, note) VALUES ($1, $2)`, domainID, "ok")
			return e
		},
		Idempotency: &postgres.IdempotencyInsert{
			ID:          idemID,
			SubjectType: "probe",
			SubjectID:   domainID,
			Operation:   "be100.atomic",
			PaymentMode: &mode,
			KeyHash:     fmt.Sprintf("%x", sha256.Sum256([]byte("k-"+suffix))),
			RequestHash: fmt.Sprintf("%x", sha256.Sum256([]byte("r-"+suffix))),
			Status:      "COMPLETED",
			ExpiresAt:   expires,
			ResponseBody: json.RawMessage(`{"ok":true}`),
		},
		Outbox: []postgres.OutboxInsert{{
			ID:          outboxID,
			Topic:       "be100.probe",
			Payload:     json.RawMessage(`{"domain":"` + domainID + `"}`),
			PaymentMode: &mode,
		}},
		Audit: &postgres.AuditStubInsert{
			ID:          auditID,
			SequenceNo:  time.Now().UnixNano(), // unique enough for stub
			PayloadHash: hash[:],
		},
	})
	if err != nil {
		t.Fatalf("successful atomic: %v", err)
	}

	// Second: force outbox insert failure (duplicate PK) and prove domain rollback.
	failDomainID := "domain_fail_" + suffix
	failIdemID := "idem_fail_" + suffix
	failAuditID := "audit_fail_" + suffix
	failSeq := time.Now().UnixNano() + 1

	err = pool.RunAtomic(ctx, postgres.AtomicWrite{
		Domain: func(ctx context.Context, tx pgx.Tx) error {
			_, e := tx.Exec(ctx, `INSERT INTO be100_domain_probe (id, note) VALUES ($1, $2)`, failDomainID, "should-rollback")
			return e
		},
		Idempotency: &postgres.IdempotencyInsert{
			ID:          failIdemID,
			SubjectType: "probe",
			SubjectID:   failDomainID,
			Operation:   "be100.atomic.fail",
			KeyHash:     fmt.Sprintf("%x", sha256.Sum256([]byte("kf-"+suffix))),
			RequestHash: fmt.Sprintf("%x", sha256.Sum256([]byte("rf-"+suffix))),
			Status:      "IN_PROGRESS",
			ExpiresAt:   expires,
		},
		Outbox: []postgres.OutboxInsert{{
			// Reuse existing outbox id → unique violation → full TX rollback.
			ID:      outboxID,
			Topic:   "be100.probe",
			Payload: json.RawMessage(`{"fail":true}`),
		}},
		Audit: &postgres.AuditStubInsert{
			ID:          failAuditID,
			SequenceNo:  failSeq,
			PayloadHash: hash[:],
		},
	})
	if err == nil {
		t.Fatal("expected outbox failure, got nil")
	}
	if !errors.Is(err, context.Canceled) {
		// just ensure we got an error; pgx unique violation is wrapped
		t.Logf("got expected error: %v", err)
	}

	var domainCount int
	if err := pool.Pool().QueryRow(ctx, `SELECT COUNT(*) FROM be100_domain_probe WHERE id = $1`, failDomainID).Scan(&domainCount); err != nil {
		t.Fatalf("domain count: %v", err)
	}
	if domainCount != 0 {
		t.Fatalf("domain row should have rolled back, count=%d", domainCount)
	}

	var idemCount int
	if err := pool.Pool().QueryRow(ctx, `SELECT COUNT(*) FROM idempotency_records WHERE id = $1`, failIdemID).Scan(&idemCount); err != nil {
		t.Fatalf("idem count: %v", err)
	}
	if idemCount != 0 {
		t.Fatalf("idempotency row should have rolled back, count=%d", idemCount)
	}

	var auditCount int
	if err := pool.Pool().QueryRow(ctx, `SELECT COUNT(*) FROM audit_events WHERE id = $1`, failAuditID).Scan(&auditCount); err != nil {
		t.Fatalf("audit count: %v", err)
	}
	if auditCount != 0 {
		t.Fatalf("audit row should have rolled back, count=%d", auditCount)
	}

	// Successful write still present.
	var okCount int
	if err := pool.Pool().QueryRow(ctx, `SELECT COUNT(*) FROM be100_domain_probe WHERE id = $1`, domainID).Scan(&okCount); err != nil {
		t.Fatalf("ok domain: %v", err)
	}
	if okCount != 1 {
		t.Fatalf("successful domain row missing")
	}
}

func TestPoolPing(t *testing.T) {
	pool := openPool(t)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := pool.Ping(ctx); err != nil {
		t.Fatalf("ping: %v", err)
	}
}
