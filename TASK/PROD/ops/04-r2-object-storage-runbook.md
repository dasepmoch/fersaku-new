# Object storage R2 runbook (KEY-13)

## 1. Production target

| Requirement | Detail |
|-------------|--------|
| Provider | Cloudflare R2 (S3-compatible) |
| Buckets | **private** (default) + **public** (CDN assets only) |
| Credentials | SM only (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) |
| Endpoint | Real R2 endpoint — **not** `localhost` / `minio` |
| KYC | Ciphertext only; **no** browser-to-R2 presign for KYC (BE-400) |

## 2. Fail-closed (code)

`APP_ENV=production` rejects local/MinIO endpoints:

```text
config: local/MinIO R2_ENDPOINT is forbidden when APP_ENV=production
```

Unit: `TestProductionRejectsLocalMinIO` → **PASS**.

Also requires non-empty `R2_ENDPOINT`, `R2_BUCKET_PRIVATE`, access keys on production.

## 3. Local MinIO (demo only)

| Fact | Value |
|------|--------|
| Endpoint | `http://minio:9000` |
| Buckets present | `fersaku-private/`, `fersaku-public/` |
| Credentials | local minioadmin (not for prod) |

**Never** promote this endpoint to production.

## 4. Provision procedure (ops)

1. Create R2 account + two buckets per env: `fersaku-{env}-private`, `fersaku-{env}-public`.  
2. Create API token with least privilege (object RW on those buckets).  
3. Store endpoint + keys in SM (`fersaku/{env}/storage/*`).  
4. Set CORS only if public browser upload required (prefer server-mediated).  
5. Staging smoke:
   - non-KYC presigned upload intent/complete  
   - private download short-lived URL  
   - KYC stream (admin) with encryption key from KEY-21  
6. Confirm logs never print secret keys or raw KYC plaintext.

## 5. Smoke commands (staging — placeholders)

```bash
# After SM inject into shell
curl -sS "$API/health/ready"
# Use existing seller object upload path from FE/API docs — no secrets in CI logs
```

## 6. DR pairing with Postgres restore (GAP-11)

PostgreSQL restore recovers `object_refs` / grants / KYC metadata only — **not** object bytes.
After any DB restore drill:

1. Inventory durable `object_refs` (`READY`/`SCANNING`/`REJECTED`).
2. `Head`/`stat` each `(bucket, object_key)` on R2/MinIO; compare size when known.
3. **Missing object fails the drill** (no silent broken downloads).
4. Confirm private + public buckets reachable; retention class present on refs.

Executable: `backend/scripts/dr_restore_e2e.sh` (local MinIO).  
Policy: `backend/docs/BE-220-r2-bucket-lock.md` § Backup / PITR boundary.

## 7. Acceptance

| Item | Code/local | Managed R2 |
|------|------------|------------|
| MinIO forbidden in production | **unit PASS** | — |
| Local buckets exist (demo) | **verified** | — |
| Object inventory paired with DB restore | **done** (`dr_restore_e2e.sh`) | **ops** |
| Real R2 buckets + SM keys | — | **ops** |
| Upload/download smoke staging | — | **ops** |
