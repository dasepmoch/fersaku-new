# PROD ops pack — platform readiness (KEY-11…14 + SM)

> **Audience:** human ops + agent support  
> **Goal:** Close the gap between “sandbox money proven” and “key-swap ready”.  
> **This host class:** tunnel demo / local compose — **not** production HA.  
> **Do not** paste secrets into git or evidence.

| Doc | Task | Purpose |
|-----|------|---------|
| [01-secret-manager-templates.md](01-secret-manager-templates.md) | KEY-10 | Concrete SM path templates + inject patterns |
| [02-postgres-pitr-runbook.md](02-postgres-pitr-runbook.md) | KEY-11 / GAP-11 | Managed PG + local E2E restore (`dr_restore_e2e.sh`) |
| [03-redis-runbook.md](03-redis-runbook.md) | KEY-12 | Managed Redis TLS + local AOF verify |
| [04-r2-object-storage-runbook.md](04-r2-object-storage-runbook.md) | KEY-13 | Cloudflare R2 (no MinIO in prod) |
| [05-smtp-mail-runbook.md](05-smtp-mail-runbook.md) | KEY-14 | Production SMTP + magic-link smoke |
| [06-go-live-keyswap-checklist.md](06-go-live-keyswap-checklist.md) | KEY-61/62 | Ordered flip to LIVE keys |

Evidence of drills executed on this host: `TASK/PROD/evidence/KEY-11/` … `KEY-14/`.
