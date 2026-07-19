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

## Dual providers (ADR-0008 / PROD-A20)

Payment QRIS and disbursement are **independent**. Production launch: `PAYMENT_PROVIDER=duitku`, `DISBURSEMENT_PROVIDER=xendit`. No multi-provider failover UI.

| Variable | Local | Staging | Production | Notes |
| -------- | ----- | ------- | ---------- | ----- |
| `PAYMENT_PROVIDER` | `fake` | `duitku` (or `fake` drill) | **`duitku`** | `fake`\|`duitku`\|`xendit` (xendit = legacy QRIS only) |
| `DISBURSEMENT_PROVIDER` | `fake` | `xendit` (or `fake` drill) | **`xendit`** | `fake`\|`xendit` |
| `ALLOW_FAKE_PROVIDERS` | n/a | `0` or `1` drill | **forbidden effect** | Staging drill only |

### Payment — Duitku (when `PAYMENT_PROVIDER=duitku`)

| Variable | Local | Staging | Production | Notes |
| -------- | ----- | ------- | ---------- | ----- |
| `DUITKU_MERCHANT_CODE` | sandbox | required | **required** | Host secret |
| `DUITKU_API_KEY` | sandbox | required | **required** | Host secret; never log |
| `DUITKU_ENV` | `sandbox` | `sandbox` | `production` | |
| `DUITKU_BASE_URL` | optional | sandbox URL | prod URL | Default from adapter if empty |
| `DUITKU_CALLBACK_URL` | local tunnel | `https://api…/v1/webhooks/duitku` | same | |
| `DUITKU_RETURN_URL` | optional | buyer return | buyer return | Non-authoritative |
| `DUITKU_QRIS_PAYMENT_METHOD` | `SP` | `SP` | `SP` | |
| `DUITKU_ACCOUNT_SCOPE` | `duitku-primary` | same | same | Non-secret identity |

### Disbursement — Xendit (when `DISBURSEMENT_PROVIDER=xendit`)

| Variable | Local | Staging | Production | Notes |
| -------- | ----- | ------- | ---------- | ----- |
| `XENDIT_MODE` | `fake` | legacy alias | prefer `DISBURSEMENT_PROVIDER` | Fake forbidden in production |
| `XENDIT_SECRET_KEY` | empty if fake | required if live | **required** | Secret manager |
| `XENDIT_WEBHOOK_TOKEN` | empty if fake | required if live | **required** | Disbursement (+ late payment) webhooks |
| `XENDIT_ACCOUNT_SCOPE` | `xendit-primary` | same | same | Single disbursement account (ADR-0002 half) |
| `XENDIT_BASE_URL` | default | default | default | |

Xendit QRIS create is **not** the primary path when `PAYMENT_PROVIDER=duitku` (PROD-B40 option A: code kept, composition selects Duitku). Xendit payment webhook may still accept historical/late events.

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
| Duitku payment callback | `POST /v1/webhooks/duitku` on API service (not worker) |
| Xendit disbursement (+ late payment) | `POST /v1/webhooks/xendit` (+ `/disbursement` as mounted) on API service |

---

## What must never appear in git

- Live `XENDIT_*` / `DUITKU_*` keys/tokens 
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
