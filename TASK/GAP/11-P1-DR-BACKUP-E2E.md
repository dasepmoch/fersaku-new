# P1 — Verifikasi backup/PITR dan object/data restore end-to-end

## Bukti temuan

- Runbook `backend/docs/runbooks/backup-restore-integrity.md` dan `TASK/PROD/evidence/KEY-11` membuktikan local logical restore, tetapi managed HA/PITR provisioning dan managed restore drill masih owner-pending.
- Database menyimpan object refs, grants, ledger, outbox, KYC metadata; R2/object bytes berada di provider durability boundary dan harus dipulihkan bersama.

## Langkah implementasi

1. Owner provision managed HA Postgres, continuous WAL/PITR, encryption, retention, monitoring, and access separation; record RPO/RTO decision.
2. Restore snapshot/PITR ke instance baru tanpa menyentuh production. Pair DB restore dengan object inventory/checksum/retention validation untuk public/private buckets.
3. Run migrations/version check, integrity hash/ledger/outbox checks, scanner/object access checks, synthetic checkout/read/download (non-money), and admin read-only smoke.
4. Measure restore start/end, data loss point, queue replay, webhook dedupe, and application cutover/repoint procedure. Verify secrets are supplied externally, not in dump.
5. Schedule quarterly drill and incident runbook with owner/on-call, escalation, communication, and rollback to original instance.

## Acceptance criteria

- Managed restore drill meets approved RPO/RTO and has sanitized evidence.
- Ledger/audit/integrity chain, outbox, object refs and actual bytes reconcile; missing object fails drill.
- App can boot against restored clone, readiness passes, and no duplicate money side effect occurs when outbox replayed.
- Next drill date, owner, alert, and evidence location are recorded.

