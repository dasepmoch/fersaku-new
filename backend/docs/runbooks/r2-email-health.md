# Runbook: R2 object store and email health

## Trigger

- Component health R2 or mail degraded (`GET /v1/admin/system`).
- Synthetic steps `r2_ready` / `mail_capture` fail.
- Upload/download or KYC document stream failures.

## Customer impact

- R2: product assets, delivery objects, KYC ciphertext upload fail.
- Mail: verification/reset/notification email delayed (inbox notification may still exist).

## Safe diagnosis

1. Admin componentHealth: status only — **no access keys**.
2. Local compose: MinIO `:9000`, Mailpit `:8025`.
3. Metrics/logs: R2 errors by purpose (no raw keys); SMTP errors without full addresses when possible.
4. KYC: server-mediated only; never browser presign (BE-400).

## Actions

| Component | Action |
| --------- | ------ |
| R2/MinIO | Check endpoint/bucket/credentials in secret manager; network path; Bucket Lock policy docs |
| Mail | Check SMTP host/port; Mailpit for local; provider status for staging |
| Quota | Soft merchant quota exceeded → seller-facing error, not platform outage |

## Permissions

Platform on-call; storage/security for KYC path.

## Rollback

Revert config/secret version; previous API image if adapter bug.

## Audit

No secret material in tickets; object refs by internal id only.

## Communication owner

Platform on-call.

## Post-incident

Re-run synthetic; quarterly restore notes in `backup-restore-integrity.md`.
