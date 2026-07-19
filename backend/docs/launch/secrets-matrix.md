# BE-630 Secrets / configuration matrix

**Rule:** Never commit real secrets. Production/staging values live in a secret manager. 
**Source:** `backend/.env.example`, `internal/config/config.go`, ADR-0007.

`APP_ENV` is deployment only (`local|staging|production|test`). 
`payment_mode` is financial identity (`SANDBOX|LIVE`) and is **not** set by env alone.

---

## Legend

| Column | Meaning |
| ------ | ------- |
| Local | Compose / developer machine |
| Staging | Pre-prod |
| Production | Live money |
| Required | Process fails closed if missing/invalid |

---

## Core runtime

| Variable | Local | Staging | Production | Notes |
| -------- | ----- | ------- | ---------- | ----- |
| `APP_ENV` | `local` | `staging` | `production` | Never use as payment_mode |
| `HTTP_ADDR` | `:8080` | `:8080` | `:8080` (or platform) | Container listen |
| `LOG_LEVEL` | `info` | `info` | `info`/`warn` | No secrets in logs |
| `SHUTDOWN_TIMEOUT_SEC` | `15` | `15`–`30` | `15`–`30` | Drain window |
| `DATABASE_URL` | compose host `:5433` | managed TLS | **required** TLS; no `sslmode=disable` | Authoritative store |
| `REDIS_URL` | `redis://localhost:6380/0` | TLS preferred | **required** `rediss://` | Non-authoritative |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | optional | optional | recommended | Traces |

---

## Session / CSRF

| Variable | Local | Staging | Production | Notes |
| -------- | ----- | ------- | ---------- | ----- |
| `SESSION_COOKIE_NAME` | `fersaku_session` | same | same | HttpOnly cookie |
| `SESSION_SECRET` | placeholder ok | **required** ≥16 | **required** ≥32; not local placeholder | HMAC/session material |
| `CSRF_SECRET` | placeholder ok | **required** | **required** ≥32; not placeholder | Double-submit |

---

## Xendit (only payment/disbursement provider)

| Variable | Local | Staging | Production | Notes |
| -------- | ----- | ------- | ---------- | ----- |
| `XENDIT_MODE` | `fake` | `fake` or `live` | **must be `live`** | Fake forbidden in production |
| `XENDIT_SECRET_KEY` | empty if fake | required if live | **required** | Secret manager |
| `XENDIT_WEBHOOK_TOKEN` | empty if fake | required if live | **required** | Matches Xendit dashboard; constant-time compare |
| `XENDIT_ACCOUNT_SCOPE` | `xendit-primary` | same | same | Single account (ADR-0002) |

No Duitku / multi-provider failover variables exist by design.

---

## Encryption

| Variable | Local | Staging | Production | Notes |
| -------- | ----- | ------- | ---------- | ----- |
| `KYC_ENCRYPTION_KEY` | empty ok | recommended | **required** | AEAD for KYC fields/docs |
| `STOCK_ENCRYPTION_KEY` | empty → KYC fallback | recommended | recommended | Inventory secrets |

---

## Object storage (R2; local MinIO)

| Variable | Local | Staging | Production | Notes |
| -------- | ----- | ------- | ---------- | ----- |
| `R2_ENDPOINT` | `http://localhost:9000` | R2 endpoint | **required** non-local | MinIO forbidden in prod |
| `R2_BUCKET_PUBLIC` | `fersaku-public` | env-separated | env-separated | |
| `R2_BUCKET_PRIVATE` | `fersaku-private` | env-separated | **required** | KYC/private objects |
| `R2_ACCESS_KEY_ID` | `minioadmin` | secret | **required** | |
| `R2_SECRET_ACCESS_KEY` | `minioadmin` | secret | **required** | |
| `R2_REGION` | `auto` | `auto` | `auto` | |
| `R2_FORCE_PATH_STYLE` | `true` (MinIO) | false for R2 | false for R2 | |

---

## Mail

| Variable | Local | Staging | Production | Notes |
| -------- | ----- | ------- | ---------- | ----- |
| `MAIL_SMTP_HOST` | `localhost` / mailpit | provider | provider | |
| `MAIL_SMTP_PORT` | `1025` | provider | provider | |
| `MAIL_FROM` | `noreply@localhost` | real domain | real domain | |
| `MAIL_SMTP_USER` / `MAIL_SMTP_PASSWORD` | empty | as needed | as needed | Secret manager |

---

## Worker / bootstrap

| Variable | Local | Staging | Production | Notes |
| -------- | ----- | ------- | ---------- | ----- |
| `WORKER_RUN_ONCE` | `false` | `false` | `false` | `true` only for one-shot jobs |
| `BOOTSTRAP_ADMIN_EMAIL` | optional | one-shot | one-shot | Seed SUPER_ADMIN; unset after use |
| `MIGRATE_*` | host tooling | CI/job | **migrate job only** | Not app runtime |

---

## Ingress / proxy (operational — may be platform config)

| Setting | Production requirement |
| ------- | ---------------------- |
| TLS termination | At LB/ingress |
| Trusted proxy CIDRs | Only LB/proxy ranges (see `topology.md`) |
| Request ID | Preserve / inject; app emits `X-Request-ID` |
| Xendit callback path | `POST /v1/webhooks/xendit` on API service (not worker) |

---

## What must never appear in git

- Live `XENDIT_*` keys/tokens 
- Production `SESSION_SECRET` / `CSRF_SECRET` / encryption keys 
- Production `DATABASE_URL` passwords 
- R2 production access keys 
- Any `.env` with real values (`.env` is gitignored; only `.env.example` is tracked)

---

## Verification without secrets

```bash
# Config unit tests cover fail-closed production rules
go test ./internal/config/...

# Security scan for accidental committed secrets
./scripts/security_scan.sh
```
