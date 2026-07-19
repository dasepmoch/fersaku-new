# BE-220 R2 Bucket Lock, retention, and backup/PITR boundary

## Scope

This document records launch intent for Cloudflare R2 object retention versus
PostgreSQL authority and backup. It is operational policy for BE-220 foundation;
legal/product owners must approve durations before production sign-off (see
`docs/BACKEND_PRODUCTION_TASKS.md` §10.4).

## Authority split

| Concern | System of record |
| --- | --- |
| Object metadata, ownership, status (`UPLOADING`→`READY`/`REJECTED`/`EXPIRED`) | PostgreSQL `object_refs` |
| Object bytes | R2 (production) / MinIO (local S3-compatible) |
| Financial ledger, payments, audit chain metadata | PostgreSQL |
| Point-in-time recovery of DB rows | Managed PostgreSQL PITR / backups |
| Immutability of audit/evidence **bytes** for a retention window | R2 Bucket Lock on dedicated prefixes |

R2 object versioning is **not** assumed. Every write uses a server-generated
globally unique create-only key. Replacement creates a new key and updates the
DB pointer atomically. Application code must not overwrite financial evidence,
KYC ciphertext, invoice versions, provider evidence, or audit checkpoints.

## Bucket / prefix policy (§10.1)

Private by default. Public assets only under explicit public prefix/bucket.

```text
private-products/{merchant_id}/{store_id}/{object_id}
private-profile-assets/{merchant_id}/{store_id}/{object_id}
private-invoices/{merchant_id}/{store_id}/{object_id}
public-assets/{store_id}/{object_id}
private-kyc/... # BE-400 only — never browser-presigned
private-provider-events/...
private-audit-exports/...
```

## Bucket Lock (audit / evidence prefixes)

**Intent (post-owner approval):**

1. Apply Cloudflare R2 Bucket Lock rules to retention-locked prefixes only:
 - `private-audit-exports/`
 - provider raw evidence prefixes used by BE-530
 - any future audit checkpoint objects
2. Retention period: align with ledger/audit online retention (target **7 years**
 for financial/audit evidence; see §10.4 table). Exact duration is not
 self-service via admin API.
3. Application credentials used by the API/worker must be least-privilege and
 **must not** be able to:
 - shorten retention
 - delete or replace a locked object during the retention window
4. Verify in staging: attempt `DeleteObject` / overwrite of a locked object with
 app credentials → provider rejects; alert if unexpected success.

Bucket Lock is **retention**, not:

- object versioning
- a substitute for PostgreSQL PITR
- payment/settlement reconciliation

## Backup / PITR boundary (separate)

| Data | Backup | Notes |
| --- | --- | --- |
| PostgreSQL | Managed HA + PITR | Restores `object_refs`, grants, ledger; does not restore R2 bytes |
| R2 objects | Provider durability + optional lifecycle | Restoring DB without objects yields broken refs; restore playbooks must pair DB PITR cutover with object inventory checks |
| Incomplete uploads | Abort/delete within 24h cleanup job | Not backed up as product data |
| KYC ciphertext | Envelope-encrypted; purge per §10.4 | BE-400; never browser-to-R2 presign |

Backup policy must not silently retain deleted KYC beyond the documented purge
window. Object delete order for subject-request/legal purge:

1. DB tombstone / status update + audit metadata
2. Object delete (if not Bucket-Locked / after lock expiry)
3. Backup expiry per retention schedule

## KYC path (out of scope for BE-220 presign)

KYC documents **never** use browser-to-R2 presigned PUT/GET. BE-400 uses an
authenticated server-mediated stream: validate → scan → envelope-encrypt →
create-only key for ciphertext only. Only ciphertext reaches private R2.

## Soft quota

Per-merchant soft byte quota is optional config (default 5 GiB READY bytes).
Enforced before upload intent and projected after complete. Not a contractual
SLA; abuse control only.

## Local MinIO

Compose MinIO (`R2_ENDPOINT=http://127.0.0.1:9000` or `http://minio:9000`,
keys `minioadmin`) implements the same `ports.ObjectStore` interface as R2.
Path-style addressing is required. Production forbids local/MinIO endpoints.
