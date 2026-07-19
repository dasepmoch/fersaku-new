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

### Commands used (2026-07-19)

```bash
# dump
docker exec fersaku-backend-postgres-1 \
  pg_dump -U fersaku -d fersaku -Fc -f /tmp/fersaku.dump

# restore to clone DB
docker exec fersaku-backend-postgres-1 \
  psql -U fersaku -d postgres -c "CREATE DATABASE fersaku_restore_drill OWNER fersaku;"
docker exec fersaku-backend-postgres-1 \
  pg_restore -U fersaku -d fersaku_restore_drill --no-owner --role=fersaku /tmp/fersaku.dump
```

### Results

| Check | Result |
|-------|--------|
| Dump stamp | `20260719T142546Z` |
| Dump size | ~524 KiB (`/tmp/opencode/fersaku-drills/…`) |
| `payment_intents` origin vs clone | 20 = 20 |
| `orders` | 27 = 27 |
| `withdrawals` | 8 = 8 |
| Clone `SELECT 1` | OK |

### Approx timing (this host)

| Phase | Approx |
|-------|--------|
| Dump | < 5 s |
| Create DB + restore | < 15 s |
| Verify counts | < 5 s |
| **RTO (logical, small DB)** | **≪ 1 min** |

## 4. Managed PITR drill (ops — production)

1. Snapshot/PITR restore to **new** instance (do not overwrite prod).  
2. Set SM staging/prod clone DSN temporarily for API canary pod.  
3. Run migrate version check (expect already at head).  
4. Boot API against clone; `/health/ready` 200.  
5. Smoke: login + one read-only admin list.  
6. Tear down clone; record RTO/RPO in evidence.  
7. **Never** leave canary pointed at clone.

## 5. Connection budget (ADR-0007)

```text
sum(API_replicas × API_MaxConns + Worker_replicas × Worker_MaxConns)
  < 0.8 × postgres max_connections
```

See `backend/docs/performance/pool-tuning.md`.

## 6. Acceptance

| Item | Local drill | Managed prod |
|------|-------------|--------------|
| Logical dump/restore works | **done** (evidence KEY-11) | N/A |
| Managed HA + PITR provisioned | — | **ops** |
| Quarterly PITR drill logged | — | **ops** |
| Prod DSN TLS + SM only | code rejects disable | **ops** |
