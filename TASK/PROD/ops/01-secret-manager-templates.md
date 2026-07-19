# Secret manager path templates (KEY-10)

## 1. Rules

1. Production **never** reads `/var/www/pg.txt`.  
2. Secrets only in SM / platform secrets; images stay secret-free.  
3. Browser never receives provider/encrypt/session secrets.  
4. Staging and production use **separate** secret prefixes.  
5. Rotation: see matrix in `TASK/PROD/10-SECRETS-AND-ENV-MATRIX.md` §6.

## 2. Naming convention (recommended)

```text
fersaku/{env}/{domain}/{name}

env    = staging | production
domain = core | payment | disbursement | storage | mail | frontend
```

### Example paths (fill real ARNs/IDs in ops vault — not in git)

| Env var | Staging path template | Production path template |
|---------|----------------------|--------------------------|
| `DATABASE_URL` | `fersaku/staging/core/database_url` | `fersaku/production/core/database_url` |
| `REDIS_URL` | `fersaku/staging/core/redis_url` | `fersaku/production/core/redis_url` |
| `SESSION_SECRET` | `fersaku/staging/core/session_secret` | `fersaku/production/core/session_secret` |
| `CSRF_SECRET` | `fersaku/staging/core/csrf_secret` | `fersaku/production/core/csrf_secret` |
| `KYC_ENCRYPTION_KEY` | `fersaku/staging/core/kyc_encryption_key` | `fersaku/production/core/kyc_encryption_key` |
| `STOCK_ENCRYPTION_KEY` | `fersaku/staging/core/stock_encryption_key` | `fersaku/production/core/stock_encryption_key` |
| `PAYMENT_PROVIDER` | deploy config = `duitku` | deploy config = `duitku` |
| `DUITKU_MERCHANT_CODE` | `fersaku/staging/payment/duitku_merchant_code` | `fersaku/production/payment/duitku_merchant_code` |
| `DUITKU_API_KEY` | `fersaku/staging/payment/duitku_api_key` | `fersaku/production/payment/duitku_api_key` |
| `DUITKU_ENV` | deploy = `sandbox` | deploy = `sandbox` until KEY-62 → `production` |
| `DUITKU_CALLBACK_URL` | `https://api-staging…/v1/webhooks/duitku` | `https://api.fersaku.net/v1/webhooks/duitku` |
| `DISBURSEMENT_PROVIDER` | deploy = `xendit` | deploy = `xendit` |
| `XENDIT_SECRET_KEY` | `fersaku/staging/disbursement/xendit_secret_key` | `fersaku/production/disbursement/xendit_secret_key` |
| `XENDIT_WEBHOOK_TOKEN` | `fersaku/staging/disbursement/xendit_webhook_token` | `fersaku/production/disbursement/xendit_webhook_token` |
| `XENDIT_ENV` | deploy = `sandbox` | deploy = `sandbox` until KEY-62 → `production` |
| `R2_ENDPOINT` | `fersaku/staging/storage/r2_endpoint` | `fersaku/production/storage/r2_endpoint` |
| `R2_ACCESS_KEY_ID` | `fersaku/staging/storage/r2_access_key_id` | `fersaku/production/storage/r2_access_key_id` |
| `R2_SECRET_ACCESS_KEY` | `fersaku/staging/storage/r2_secret_access_key` | `fersaku/production/storage/r2_secret_access_key` |
| `R2_BUCKET_PRIVATE` | deploy config | deploy config |
| `R2_BUCKET_PUBLIC` | deploy config | deploy config |
| `MAIL_MODE` | deploy = `smtp` | deploy = `smtp` |
| `MAIL_SMTP_HOST` | `fersaku/staging/mail/smtp_host` | `fersaku/production/mail/smtp_host` |
| `MAIL_SMTP_USER` | `fersaku/staging/mail/smtp_user` | `fersaku/production/mail/smtp_user` |
| `MAIL_SMTP_PASSWORD` | `fersaku/staging/mail/smtp_password` | `fersaku/production/mail/smtp_password` |
| `MAIL_FROM` | deploy config | deploy config |
| `NEXT_PUBLIC_DATA_SOURCE` | `api` | `api` |
| `NEXT_PUBLIC_APP_STAGE` | `live` (or staging-equivalent) | `live` |
| `API_INTERNAL_URL` | internal SSR URL | internal SSR URL |
| `NEXT_PUBLIC_API_URL` | **empty** | **empty** |

## 3. Inject patterns

### Kubernetes

```yaml
# sketch only — use ExternalSecrets / CSI / sealed-secrets per org standard
envFrom:
  - secretRef:
      name: fersaku-api-env
```

### Docker / Compose (staging rehearsal only)

```bash
# Pull from SM CLI into process env — never commit the file
export $(aws secretsmanager get-secret-value --secret-id fersaku/staging/core/database_url --query SecretString --output text | jq -r 'to_entries|map("\(.key)=\(.value)")|.[]')
```

### Forbidden

- Baking secrets into Docker image `ENV`
- Mounting `/var/www/pg.txt` on prod
- Putting LIVE keys in shell history on shared bastion without audit

## 4. Populate procedure

1. Create all staging secrets first.  
2. Boot staging API: `APP_ENV=staging`, providers duitku/xendit, `DUITKU_ENV=sandbox`, `XENDIT_ENV=sandbox`, `MAIL_MODE=smtp`.  
3. Verify: `/health/ready` 200; `POST /v1/webhooks/duitku` empty → 401; magic-link mail received.  
4. Clone secret set to production prefix with **sandbox** provider env still.  
5. KEY-62 only: flip LIVE Duitku/Xendit secrets + `*_ENV=production`.

## 5. Owner table

| Role | Duty |
|------|------|
| Ops | Create paths, inject, rotate |
| Eng | Fail-closed config tests |
| Payments | Dashboard callback URLs match SM |
