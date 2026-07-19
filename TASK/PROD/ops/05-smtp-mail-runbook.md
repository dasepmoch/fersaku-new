# SMTP mail runbook (KEY-14)

## 1. Why this matters

Buyer **magic-link** and transactional mail (order/delivery) require real SMTP on staging/production.  
Local **Mailpit** is capture-only and must not be production `MAIL_SMTP_HOST`.

## 2. Production / staging config (fail-closed)

| Variable | Required value |
|----------|----------------|
| `MAIL_MODE` | **`smtp`** |
| `MAIL_SMTP_HOST` | real provider host |
| `MAIL_SMTP_PORT` | 587/465 per provider |
| `MAIL_FROM` | verified sender |
| `MAIL_SMTP_USER` / `MAIL_SMTP_PASSWORD` | SM |

Code (`validateLiveMail`):

- staging/production **forbid** `capture` / `noop`  
- require `smtp` + host + from  

Units:

- `TestStagingRejectsCaptureMail` → PASS  
- `TestProductionRejectsNoopMail` → PASS  

## 3. Local Mailpit (demo)

| Fact | Value 2026-07-19 |
|------|------------------|
| UI/API | `http://127.0.0.1:8025` |
| SMTP | host `mailpit:1025` in compose |
| Messages | 0 (capture empty) |
| API `MAIL_MODE` | UNSET (local defaults capture path) |

## 4. Provider options (ops choose one)

| Provider | Notes |
|----------|-------|
| Amazon SES | Good for prod; verify domain DKIM/SPF |
| Resend / Postmark / SendGrid | Simple SMTP |
| Self-hosted | Not recommended for launch |

## 5. Smoke procedure (staging)

1. Inject SMTP secrets from SM.  
2. Set `MAIL_MODE=smtp`, real `MAIL_FROM`.  
3. Restart API/worker.  
4. Buyer flow: open `/account/login` → request magic-link for a **real** mailbox you control.  
5. Confirm email arrives **< 2 minutes**; link consumes once.  
6. Optional: complete a sandbox paid order → delivery/access email if product sends one.  
7. Check provider dashboard for bounces; fix SPF/DKIM if needed.

## 6. Acceptance

| Item | Code/local | Staging/prod |
|------|------------|--------------|
| Fail-closed mail mode | **unit PASS** | — |
| Mailpit not used in prod compose | policy | **ops** |
| Real magic-link received | — | **ops** |
