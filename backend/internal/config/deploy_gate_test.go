package config_test

import (
	"testing"

	"github.com/dasepmoch/fersaku-new/backend/internal/config"
)

// TestExpandMigrationDeployContract documents GAP-06 rollout rules:
// 1) Expand migration (forward-only) may run while old app still uses previous schema.
// 2) New app image must not roll out until migration version == EXPECTED_HEAD.
// Enforced by scripts/release/migrate-job.sh exit 3 on mismatch; this test locks worksheet math.
func TestExpandMigrationDeployContract(t *testing.T) {
	// Old + new API replicas during rolling deploy may briefly double API count.
	// Budget must leave headroom so expand-phase (N and N+1) does not exhaust DB.
	w := config.DefaultCapacityWorksheet()
	steady := w.AppPoolTotal() // 60
	// Rolling: temporary extra API replica (3×20 + 2×10 = 80) == usable edge.
	rolling := (w.APIReplicas+1)*int(w.APIMaxConns) + w.WorkerReplicas*int(w.WorkerMaxConns)
	if rolling > w.UsableConnections() {
		t.Fatalf("rolling deploy peak %d exceeds usable %d — lower MaxConns or raise DB max before multi-replica roll",
			rolling, w.UsableConnections())
	}
	if steady > w.UsableConnections() {
		t.Fatalf("steady total %d > usable %d", steady, w.UsableConnections())
	}
	// Contract: migrate MaxConns fits headroom so expand job does not steal app pool budget.
	if int(w.MigrateMaxConns) > w.HeadroomBand() {
		t.Fatalf("migrate MaxConns %d > headroom band %d", w.MigrateMaxConns, w.HeadroomBand())
	}
}
