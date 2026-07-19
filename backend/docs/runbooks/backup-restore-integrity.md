# Runbook: Backup, restore, and integrity scan

## Trigger

- Scheduled restore drill (quarterly).
- Suspected data loss / failed migration.
- Synthetic step `audit_integrity` or admin integrity status failed.
- Alert `fersaku_audit_chain_status_total{result="broken"}`.

## Customer impact

Potential read-only mode or delayed financial ops during restore. RPO/RTO must be owner-approved (ADR-0007: managed Postgres PITR).

## Targets (launch documentation)

| System | RPO | RTO | Notes |
| ------ | --- | --- | ----- |
| PostgreSQL | ≤ 5 minutes (PITR) | ≤ 1 hour isolated restore | Authoritative for money/ledger/outbox |
| R2 | object create-only keys; backup/archive per class | restore per object class | See BE-220 bucket lock doc |
| Redis | N/A for financial truth | rebuild from outbox poll | Non-authoritative |

## RPO/RTO decision (recorded)

| Class | Decision | Status |
| ----- | -------- | ------ |
| Managed production | RPO ≤ 5m continuous WAL/PITR; RTO ≤ 60m new instance + app re-point | **OWNER-BLOCKED** (not provisioned on demo host) |
| Local/demo logical | RPO = last `pg_dump` stamp; RTO measured by `scripts/dr_restore_e2e.sh` | **Executable** on compose |
| Object store | DB restore alone is insufficient; pair with object inventory | Enforced by E2E script (missing object **fails** drill) |
| Drill cadence | Quarterly | Next date recorded in latest evidence |

**Owner:** platform-lead · **On-call:** platform-oncall · **Escalation:** platform-lead → finance (ledger) → security (audit chain).

## Safe diagnosis / integrity

1. Audit chain: admin integrity endpoint / `VerifyChain` → `AUDIT_CHAIN_BROKEN` on tamper.
2. Ledger: rebuild balances equals projection (BE-340 tests).
3. Outbox: no lost critical topics after restore; `dedupe_key` unique (no duplicate money side effects on replay).
4. Object refs: every durable `object_refs` row (`READY`/`SCANNING`/`REJECTED`) must have bytes in R2/MinIO; size matches when known.
5. Never overwrite retention-locked audit checkpoints.

## Executable local E2E drill (GAP-11)

```bash
# Positive path: dump → isolated clone → integrity → object inventory
./scripts/dr_restore_e2e.sh

# Negative path: missing object bytes must fail the drill
./scripts/dr_restore_e2e.sh --fail-missing-object

# Retain clone DB for manual inspection
./scripts/dr_restore_e2e.sh --keep-clone
```

Script also covers: migration head parity, payment/order/withdrawal/outbox/ledger/audit parity,
webhook provider-event dedupe, bucket reachability, cutover procedure, secrets-not-in-dump,
timing (local RTO), quarterly schedule fields.

Reports land under `/tmp/opencode/fersaku-drills/reports/` (host tmp; not git).
Sanitized evidence: `TASK/GAP/evidence/11-P1-DR-BACKUP-E2E/`.

Related: `scripts/pg_logical_backup_drill.sh` (lighter dump/restore only),
`TASK/PROD/ops/02-postgres-pitr-runbook.md` (managed + KEY-11).

## Actions (incident / managed cutover)

1. Restore Postgres to **isolated** environment first (new instance; never overwrite prod).
2. Run migrations only if restore is pre-migration snapshot (document version).
3. Run: `./scripts/dr_restore_e2e.sh` (or managed equivalent) + `scripts/synthetic_health.sh` against restore.
4. Verify audit integrity, ledger readability, outbox dedupe, object inventory/checksums.
5. Inject `DATABASE_URL` and object credentials from secret manager (**external**, not in dump).
6. Boot API against clone; require `/health/ready` 200; admin read-only smoke; synthetic non-money checkout/read.
7. Outbox replay is idempotent via `dedupe_key` — no duplicate money side effect.
8. Cutover only with owner sign-off (BE-630). Keep original instance for rollback.
9. Never leave canary pointed at drill clone.

## Permissions

DB owner + platform lead. Application role cannot UPDATE/DELETE audit rows.

## Rollback

Keep failed primary offline until integrity green; do not dual-write live money during drill.
Re-point SM DSN / traffic back to original instance if cutover unhealthy.

## Audit

Record restore start/end, backup id, integrity report (sequence/head hash hex only), object inventory counts (ok/missing), local RTO seconds.

## Communication owner

Platform lead + finance for ledger window. Public notes: no customer PII.

## Post-incident

Update RPO/RTO evidence; fix any chain/ledger/object gap found; schedule next quarterly drill.

## Managed residual (honest)

| Item | Status |
| ---- | ------ |
| Managed multi-AZ PG + continuous PITR + encryption + access separation | **BLOCKED** — owner |
| Managed restore drill meeting approved RPO/RTO | **BLOCKED** — owner |
| Local logical E2E + object pairing | **done** via `dr_restore_e2e.sh` |
