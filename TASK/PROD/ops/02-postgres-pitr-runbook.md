# Postgres HA + PITR runbook (KEY-11)

## 1. Production target (managed)

| Requirement | Detail |
|-------------|--------|
| Engine | Managed PostgreSQL 16+ (RDS / Cloud SQL / AlloyDB / equiv) |
| HA | Multi-AZ / automatic failover |
| Backup | Continuous WAL + daily base; **PITR** enabled |
| TLS | `sslmode=require` (or verify-full); production rejects `sslmode=disable` |
| Access | DSN only via SM (`DATABASE_URL`) |
| Isolation | Separate DB/instance per env (staging ≠ production) |
| Migrate | Single pre-rollout job + advisory lock (`backend/scripts/migrate.sh`) |

**Compose postgres on this host is local-only** (`sslmode=disable`, single node).

## 2. RPO / RTO targets (recommended)

| Metric | Target | Notes |
|--------|--------|-------|
| RPO | ≤ 5 minutes | PITR / continuous backup |
| RTO | ≤ 60 minutes | restore to new instance + app re-point |
| Drill cadence | quarterly | document each drill |

## 3. Local logical dump/restore drill (executed)

> Proves backup tooling + restore procedure on **this demo host**. Does **not** replace managed PITR.

### Preferred: E2E script (GAP-11)

```bash
# Full E2E: dump → isolated clone → migration head → ledger/outbox/audit →
# object_refs ↔ MinIO/R2 inventory (missing object fails) → RTO + quarterly fields
./scripts/dr_restore_e2e.sh

# Negative path: missing object must fail
./scripts/dr_restore_e2e.sh --fail-missing-object
```

Reports: `/tmp/opencode/fersaku-drills/reports/`.  
Evidence: `TASK/GAP/evidence/11-P1-DR-BACKUP-E2E/`, `TASK/PROD/evidence/KEY-11/`.

### Lighter dump-only script

```bash
./scripts/pg_logical_backup_drill.sh
```

### Historical manual commands (2026-07-19 KEY-11)

```bash
docker exec fersaku-backend-postgres-1 \
  pg_dump -U fersaku -d fersaku -Fc -f /tmp/fersaku.dump
docker exec fersaku-backend-postgres-1 \
  psql -U fersaku -d postgres -c "CREATE DATABASE fersaku_restore_drill OWNER fersaku;"
docker exec fersaku-backend-postgres-1 \
  pg_restore -U fersaku -d fersaku_restore_drill --no-owner --role=fersaku /tmp/fersaku.dump
```

| Check | Result (2026-07-19) |
|-------|---------------------|
| Dump stamp | `20260719T142546Z` |
| `payment_intents` / `orders` / `withdrawals` | 20/20 · 27/27 · 8/8 |
| **RTO (logical, small DB)** | **≪ 1 min** |

## 4. Managed PITR drill (ops — production) — **OWNER-BLOCKED**

1. Snapshot/PITR restore to **new** instance (do not overwrite prod).  
2. Pair with object inventory/checksum for private + public buckets (see `04-r2-object-storage-runbook.md`).  
3. Set SM staging/prod clone DSN temporarily for API canary pod (secrets external — not in dump).  
4. Run migrate version check (expect already at head).  
5. Integrity: audit chain, ledger readable, outbox `dedupe_key` unique, provider event dedupe.  
6. Boot API against clone; `/health/ready` 200; admin read-only smoke; synthetic non-money path.  
7. Measure restore start/end, data-loss point, queue replay (idempotent), webhook dedupe.  
8. Tear down clone; record RTO/RPO in evidence; schedule next quarterly drill.  
9. **Never** leave canary pointed at clone; rollback = re-point SM DSN to original instance.

## 5. Connection budget (ADR-0007)

```text
sum(API_replicas × API_MaxConns + Worker_replicas × Worker_MaxConns)
  < 0.8 × postgres max_connections
```

See `backend/docs/performance/pool-tuning.md`.

## 6. Acceptance

| Item | Local drill | Managed prod |
|------|-------------|--------------|
| Logical dump/restore + E2E integrity | **done** (`dr_restore_e2e.sh`, KEY-11 + GAP-11) | N/A |
| Object inventory paired with DB restore | **done** (local MinIO; missing object fails) | **ops** (R2) |
| Managed HA + PITR provisioned | — | **BLOCKED owner** |
| Quarterly PITR drill logged | local schedule recorded | **ops** |
| Prod DSN TLS + SM only | code rejects disable | **ops** |
