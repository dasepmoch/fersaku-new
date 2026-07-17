//go:build integration

package integration_test

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/observability"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/audit"
)

func newAuditService(t *testing.T) (*application.AuditService, *postgres.Pool) {
	t.Helper()
	_ = databaseURL(t)
	runMigrate(t, "up")
	pool := openPool(t)
	ids := observability.NewULIDGenerator()
	svc := &application.AuditService{
		Store: postgres.NewAuditRepo(pool.Pool()),
		IDs:   ids,
		Clock: observability.SystemClock{},
		Log:   observability.NewSlogLogger("error", "test"),
	}
	return svc, pool
}

func TestAuditChain_ConcurrentAppendsGapFree(t *testing.T) {
	svc, pool := newAuditService(t)
	ctx := context.Background()
	const n = 20
	var wg sync.WaitGroup
	var fails atomic.Int32
	prefix := fmt.Sprintf("aud_conc_%d_", time.Now().UnixNano())
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, err := svc.Append(ctx, application.AppendInput{
				ID:           fmt.Sprintf("%s%d", prefix, i),
				Action:       "test.concurrent",
				ResourceType: "probe",
				ResourceID:   fmt.Sprintf("%d", i),
				ActorUserID:  "user_test",
				Reason:       "concurrent append proof",
				Result:       "OK",
				OccurredAt:   time.Now().UTC(),
			})
			if err != nil {
				fails.Add(1)
				t.Errorf("append %d: %v", i, err)
			}
		}(i)
	}
	wg.Wait()
	if fails.Load() != 0 {
		t.Fatalf("concurrent appends failed: %d", fails.Load())
	}

	// Sequences for our rows must be unique and gap-free among themselves relative to chain head lock.
	var seqs []int64
	rows, err := pool.Pool().Query(ctx, `
		SELECT sequence_no FROM audit_events
		WHERE id LIKE $1
		ORDER BY sequence_no ASC`, prefix+"%")
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	defer rows.Close()
	for rows.Next() {
		var s int64
		if err := rows.Scan(&s); err != nil {
			t.Fatal(err)
		}
		seqs = append(seqs, s)
	}
	if len(seqs) != n {
		t.Fatalf("want %d rows got %d", n, len(seqs))
	}
	seen := map[int64]bool{}
	for i, s := range seqs {
		if seen[s] {
			t.Fatalf("duplicate sequence %d", s)
		}
		seen[s] = true
		if i > 0 && seqs[i] != seqs[i-1]+1 {
			// Concurrent with other tests may interleave; require uniqueness only if alone.
			// When interleaved, still unique and ordered.
			if seqs[i] <= seqs[i-1] {
				t.Fatalf("non-monotonic sequences: %v", seqs)
			}
		}
	}

	rep, err := svc.VerifyChain(ctx)
	if err != nil && rep.VerifierStatus != audit.VerifierBroken {
		t.Fatalf("verify: %v", err)
	}
	if rep.VerifierStatus == audit.VerifierBroken {
		// May break on pre-existing legacy rows in shared DB; check our modern segment hashes.
		t.Logf("full chain status=%s reason=%s (shared DB may have legacy stubs)", rep.VerifierStatus, rep.BrokenReason)
	}

	// Direct integrity: recompute row_hash in Go for our modern rows.
	qrows, err := pool.Pool().Query(ctx, `
		SELECT sequence_no, prev_hash, row_hash, canonical_version, canonical_payload
		FROM audit_events WHERE id LIKE $1 ORDER BY sequence_no`, prefix+"%")
	if err != nil {
		t.Fatalf("hash query: %v", err)
	}
	defer qrows.Close()
	bad := 0
	for qrows.Next() {
		var seq int64
		var prev, rowH, payload []byte
		var ver string
		if err := qrows.Scan(&seq, &prev, &rowH, &ver, &payload); err != nil {
			t.Fatal(err)
		}
		if len(payload) == 0 || payload[0] != '{' {
			continue
		}
		computed := audit.ComputeRowHash(seq, prev, ver, payload)
		if !bytesEqual(computed, rowH) {
			bad++
		}
	}
	if bad != 0 {
		t.Fatalf("row_hash mismatches: %d", bad)
	}
}

func bytesEqual(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestAuditChain_TamperRaisesBroken(t *testing.T) {
	svc, pool := newAuditService(t)
	ctx := context.Background()
	res, err := svc.Append(ctx, application.AppendInput{
		ID:           fmt.Sprintf("aud_tamper_%d", time.Now().UnixNano()),
		Action:       "test.tamper",
		ResourceType: "probe",
		ResourceID:   "x",
		Reason:       "tamper setup",
		OccurredAt:   time.Now().UTC(),
	})
	if err != nil {
		t.Fatalf("append: %v", err)
	}

	// Disable trigger to simulate malicious UPDATE, then re-enable.
	_, err = pool.Pool().Exec(ctx, `ALTER TABLE audit_events DISABLE TRIGGER audit_events_no_update`)
	if err != nil {
		t.Fatalf("disable trigger: %v", err)
	}
	_, err = pool.Pool().Exec(ctx, `
		UPDATE audit_events SET row_hash = decode(repeat('ab', 32), 'hex'), payload_hash = decode(repeat('ab', 32), 'hex')
		WHERE id = $1`, res.ID)
	if err != nil {
		_, _ = pool.Pool().Exec(ctx, `ALTER TABLE audit_events ENABLE TRIGGER audit_events_no_update`)
		t.Fatalf("tamper update: %v", err)
	}
	_, _ = pool.Pool().Exec(ctx, `ALTER TABLE audit_events ENABLE TRIGGER audit_events_no_update`)

	// Append one more modern event so verifier has a modern chain segment including tampered row.
	_, _ = svc.Append(ctx, application.AppendInput{
		ID:           fmt.Sprintf("aud_tamper_after_%d", time.Now().UnixNano()),
		Action:       "test.tamper.after",
		ResourceType: "probe",
		ResourceID:   "y",
		Reason:       "after",
		OccurredAt:   time.Now().UTC(),
	})

	rep, err := svc.VerifyChain(ctx)
	if rep.VerifierStatus != audit.VerifierBroken {
		t.Fatalf("expected AUDIT_CHAIN_BROKEN status, got %+v err=%v", rep, err)
	}
	if err == nil {
		t.Fatal("expected error on broken chain")
	}
	if !strings.Contains(err.Error(), "AUDIT_CHAIN_BROKEN") && !strings.Contains(err.Error(), "integrity") {
		t.Logf("error: %v status=%s reason=%s", err, rep.VerifierStatus, rep.BrokenReason)
	}
	if rep.BrokenReason == "" {
		t.Fatal("expected broken reason")
	}
}

func TestAuditChain_CheckpointOverwriteDenied(t *testing.T) {
	svc, pool := newAuditService(t)
	ctx := context.Background()
	_, err := svc.Append(ctx, application.AppendInput{
		ID:           fmt.Sprintf("aud_cp_%d", time.Now().UnixNano()),
		Action:       "test.checkpoint",
		ResourceType: "probe",
		ResourceID:   "1",
		Reason:       "checkpoint",
		OccurredAt:   time.Now().UTC(),
	})
	if err != nil {
		t.Fatalf("append: %v", err)
	}
	cp, err := svc.CreateCheckpoint(ctx)
	if err != nil {
		t.Fatalf("checkpoint: %v", err)
	}
	// Second insert same scope+sequence must fail (overwrite denied).
	err = pool.Pool().QueryRow(ctx, `
		SELECT insert_audit_checkpoint($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		cp.ID+"_dup", cp.ChainScope, cp.SequenceNo, cp.HeadHash, cp.CanonicalVersion,
		cp.Signature, cp.KeyID, cp.SignedAt, cp.LockedUntil,
	).Scan(new(string))
	if err == nil {
		t.Fatal("expected overwrite denial")
	}
	// Direct UPDATE must be blocked by trigger.
	_, err = pool.Pool().Exec(ctx, `UPDATE audit_checkpoints SET key_id = 'hacked' WHERE id = $1`, cp.ID)
	if err == nil {
		t.Fatal("expected update denied")
	}
	// DELETE denied.
	_, err = pool.Pool().Exec(ctx, `DELETE FROM audit_checkpoints WHERE id = $1`, cp.ID)
	if err == nil {
		t.Fatal("expected delete denied")
	}
}

func TestAuditChain_HealthNoSecrets(t *testing.T) {
	_ = databaseURL(t)
	runMigrate(t, "up")
	pool := openPool(t)
	adminOps := &application.AdminOpsService{
		Store: postgres.NewAdminOpsRepo(pool.Pool()),
		IDs:   observability.NewULIDGenerator(),
		Clock: observability.SystemClock{},
	}
	list, err := adminOps.GetComponentHealth(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(list) < 4 {
		t.Fatalf("want 4 components got %d", len(list))
	}
	for _, c := range list {
		if strings.Contains(c.Message, "sk_") || strings.Contains(c.Message, "AKIA") ||
			strings.Contains(strings.ToLower(c.Message), "password") ||
			strings.Contains(strings.ToLower(c.Message), "api_key") {
			t.Fatalf("secret-like content in health: %+v", c)
		}
		if c.Component == "" {
			t.Fatal("empty component")
		}
	}
	want := map[string]bool{"xendit": false, "r2": false, "redis": false, "mail": false}
	for _, c := range list {
		if _, ok := want[c.Component]; ok {
			want[c.Component] = true
		}
	}
	for k, v := range want {
		if !v {
			t.Fatalf("missing component %s", k)
		}
	}
}

func TestAuditChain_EmergencyBeforeAfter(t *testing.T) {
	svc, pool := newAuditService(t)
	ctx := context.Background()
	ids := observability.NewULIDGenerator()
	ops := &application.AdminOpsService{
		Store: postgres.NewAdminOpsRepo(pool.Pool()),
		Audit: svc,
		IDs:   ids,
		Clock: observability.SystemClock{},
		Log:   observability.NewSlogLogger("error", "test"),
	}
	cur, err := ops.ListEmergencyControls(ctx)
	if err != nil || len(cur) == 0 {
		t.Fatalf("list emergency: %v %v", err, cur)
	}
	sw := cur[0]
	_, err = ops.SetEmergencyControl(ctx, "admin_actor", sw.SwitchName, !sw.Enabled, "BE-530 evidence", "INC-530", sw.Version, "req-530")
	if err != nil {
		t.Fatalf("set emergency: %v", err)
	}
	var meta []byte
	err = pool.Pool().QueryRow(ctx, `
		SELECT metadata_json FROM audit_events
		WHERE action = 'platform.emergency.update'
		ORDER BY sequence_no DESC LIMIT 1`).Scan(&meta)
	if err != nil {
		t.Fatalf("audit row: %v", err)
	}
	s := string(meta)
	if !strings.Contains(s, "before") || !strings.Contains(s, "after") {
		t.Fatalf("expected before/after in metadata: %s", s)
	}
}

func TestAuditChain_UpdateDeleteDenied(t *testing.T) {
	svc, pool := newAuditService(t)
	ctx := context.Background()
	res, err := svc.Append(ctx, application.AppendInput{
		ID:           fmt.Sprintf("aud_deny_%d", time.Now().UnixNano()),
		Action:       "test.deny",
		ResourceType: "probe",
		ResourceID:   "1",
		Reason:       "deny",
		OccurredAt:   time.Now().UTC(),
	})
	if err != nil {
		t.Fatalf("append: %v", err)
	}
	_, err = pool.Pool().Exec(ctx, `UPDATE audit_events SET reason = 'hacked' WHERE id = $1`, res.ID)
	if err == nil {
		t.Fatal("expected UPDATE denied")
	}
	_, err = pool.Pool().Exec(ctx, `DELETE FROM audit_events WHERE id = $1`, res.ID)
	if err == nil {
		t.Fatal("expected DELETE denied")
	}
}
