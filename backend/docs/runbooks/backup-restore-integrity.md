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

## Safe diagnosis / integrity

1. Audit chain: admin integrity endpoint / `VerifyChain` → `AUDIT_CHAIN_BROKEN` on tamper.
2. Ledger: rebuild balances equals projection (BE-340 tests).
3. Outbox: no lost critical topics after restore.
4. Never overwrite retention-locked audit checkpoints.

## Actions

1. Restore Postgres to **isolated** environment first.
2. Run migrations only if restore is pre-migration snapshot (document version).
3. Run: `go test -tags=integration` subset + `scripts/synthetic_health.sh` against restore.
4. Verify audit integrity and sample payment paid path in sandbox.
5. Cutover only with owner sign-off (BE-630).

## Permissions

DB owner + platform lead. Application role cannot UPDATE/DELETE audit rows.

## Rollback

Keep failed primary offline until integrity green; do not dual-write live money during drill.

## Audit

Record restore start/end, backup id, integrity report (sequence/head hash hex only).

## Communication owner

Platform lead + finance for ledger window.

## Post-incident

Update RPO/RTO evidence; fix any chain/ledger gap found.
