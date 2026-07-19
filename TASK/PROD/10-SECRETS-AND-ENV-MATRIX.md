# 10 — Secrets and environment matrix

## 1. Secret sources (never commit values)

| Source | Use | In git? |
| ------ | --- | ------- |
| `/var/www/pg.txt` | Host-local sandbox reference from old stack | **No** (outside repo) |
| Secret manager / host env | Staging & production | **No** |
| `backend/.env` / `frontend/.env.local` | Local only, gitignored | **No** |
| `*.env.example` | Names + non-secret defaults only | Yes |

**Agent rule:** When documenting, write `DUITKU_API_KEY=<set from host secret>` — never paste real keys into `TASK/PROD/evidence/**`.

---

## 2. Backend environment variables

### 2.1 Core

| Variable | Local | Staging | Production | Notes |
| -------- | ----- | ------- | ---------- | ----- |
| `APP_ENV` | `local` | `staging` | `production` | Fail-closed driver |
| `HTTP_ADDR` | `:8080` | `:8080` | `:8080` | |
| `DATABASE_URL` | compose local | managed PG | managed PG + TLS | prod forbids `sslmode=disable` |
| `REDIS_URL` | compose local | required TLS | required TLS | |
| `SESSION_SECRET` | local placeholder | ≥32 random | ≥32 random | |
| `CSRF_SECRET` | local placeholder | ≥32 random | ≥32 random | |
| `KYC_ENCRYPTION_KEY` | optional local | required | required | |
| `STOCK_ENCRYPTION_KEY` | optional | required or fall back KYC | required | |
| `LOG_LEVEL` | `info` | `info` | `info` | |

### 2.2 Payment — Duitku

| Variable | Required when | Example shape (not real secrets) |
| -------- | ------------- | -------------------------------- |
| `PAYMENT_PROVIDER` | always | `duitku` \| `fake` |
| `DUITKU_MERCHANT_CODE` | payment=duitku | from host secret |
| `DUITKU_API_KEY` | payment=duitku | from host secret |
| `DUITKU_ENV` | payment=duitku | `sandbox` \| `production` |
| `DUITKU_BASE_URL` | payment=duitku | sandbox: `https://sandbox.duitku.com` |
| `DUITKU_CALLBACK_URL` | payment=duitku | `https://api.fersaku.net/v1/webhooks/duitku` |
| `DUITKU_RETURN_URL` | payment=duitku | `https://fersaku.net/...` (buyer return, non-authoritative) |
| `DUITKU_QRIS_PAYMENT_METHOD` | payment=duitku | e.g. `SP` |
| `DUITKU_ACCOUNT_SCOPE` | payment=duitku | `duitku-primary` |

Host reference field mapping from `/var/www/pg.txt`:

| pg.txt key | Env var |
| ---------- | ------- |
| `DUITKU_MERCHANT_CODE` | same |
| `DUITKU_API_KEY` | same |
| `DUITKU_ENV` | same |
| `DUITKU_CALLBACK_URL` | same |
| `DUITKU_RETURN_URL` | same |
| `DUITKU_BASE_URL` | same |
| `DUITKU_QRIS_PAYMENT_METHOD` | same |

### 2.3 Disbursement — Xendit

| Variable | Required when | Notes |
| -------- | ------------- | ----- |
| `DISBURSEMENT_PROVIDER` | always | `xendit` \| `fake` |
| `XENDIT_SECRET_KEY` | disbursement=xendit | from host secret |
| `XENDIT_WEBHOOK_TOKEN` | disbursement=xendit | callback auth |
| `XENDIT_ENV` | disbursement=xendit | `sandbox` \| `production` |
| `XENDIT_BASE_URL` | optional | default `https://api.xendit.co` |
| `XENDIT_ACCOUNT_SCOPE` | disbursement=xendit | `xendit-primary` |
| `XENDIT_MODE` | legacy | Prefer `DISBURSEMENT_PROVIDER`; keep for compat during migration |

Host reference field mapping from `/var/www/pg.txt`:

| pg.txt key | Env var |
| ---------- | ------- |
| `XENDIT_SECRET_KEY` | same |
| `XENDIT_WEBHOOK_TOKEN` | same |
| `XENDIT_ENV` | same |
| `XENDIT_BASE_URL` | same |
| `XENDIT_DISBURSEMENT_CALLBACK_URL` | document only; route is fixed in app |

### 2.4 Storage / mail

| Variable | Staging/Prod |
| -------- | ------------ |
| R2 endpoint/keys/buckets | required; no MinIO host in production |
| `MAIL_MODE` | `smtp` on live |
| SMTP host/user/pass | required when smtp |

---

## 3. Frontend environment variables

| Variable | Local prototype | API demo / staging | Production |
| -------- | --------------- | ------------------ | ---------- |
| `NEXT_PUBLIC_DATA_SOURCE` | `mock` | `api` | `api` |
| `NEXT_PUBLIC_APP_STAGE` | `prototype` | `live` or staging-equivalent | `live` |
| `API_INTERNAL_URL` | `http://127.0.0.1:18080` | internal service URL | internal only |
| `NEXT_PUBLIC_API_URL` | empty | empty (same-origin `/v1`) | empty |

Browser must not receive provider secrets.

---

## 4. Injection patterns (recommended)

### Local

```bash
# backend/.env (gitignored) — load values from /var/www/pg.txt manually
PAYMENT_PROVIDER=fake          # or duitku when testing sandbox
DISBURSEMENT_PROVIDER=fake     # or xendit when testing sandbox
```

### Staging / production

- Docker/K8s: env from secret store, not baked into image.
- Cloudflare tunnel already points `api.fersaku.net` → host API; callback URLs must match public HTTPS.

---

## 5. Checklist before any sandbox money test

- [ ] `PAYMENT_PROVIDER=duitku` and keys loaded from secret (not committed)
- [ ] Callback URL publicly reachable HTTPS
- [ ] `DISBURSEMENT_PROVIDER=xendit` and webhook token set
- [ ] `APP_ENV` matches intended fail-closed tier
- [ ] FE same-origin `/v1` rewrite target healthy
- [ ] No secret appears in `git status` or evidence files

---

## 6. Rotation

| Secret | Rotate when |
| ------ | ----------- |
| Duitku API key | leak suspicion; env change sandbox→prod |
| Xendit secret + webhook token | leak; staff offboarding |
| Session/CSRF secrets | compromise; force session revoke-all |
| KYC/stock encryption keys | with re-encrypt plan only |
