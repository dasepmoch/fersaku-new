# Go-live key-swap checklist (KEY-61 → KEY-62)

Execute **only** after KEY-61 scorecard 🟥 = 0 (or signed waivers) and human message:

```text
GO LIVE CANARY
```

## Phase A — Before flipping keys

- [ ] KEY-11..14 managed platform green  
- [ ] SM production secrets populated (sandbox provider env still)  
- [ ] KEY-51 launch-subset signed  
- [ ] KEY-60 residual signatures signed  
- [ ] Duitku dashboard callback = `https://api…/v1/webhooks/duitku`  
- [ ] Xendit disbursement callback = `https://api…/v1/webhooks/xendit/disbursement`  
- [ ] Canary amount agreed (e.g. Rp10k–50k)  
- [ ] Allowlisted merchant + buyer (non-seed)  
- [ ] On-call online; log access verified  
- [ ] Rollback plan reviewed (`ops/02` + below)

## Phase B — Key-swap (money env only)

```text
# From SM production secrets — values never logged
DUITKU_ENV=production
DUITKU_API_KEY=<live>
DUITKU_MERCHANT_CODE=<live merchant if different>
XENDIT_ENV=production
XENDIT_SECRET_KEY=<live>
XENDIT_WEBHOOK_TOKEN=<live>
# Keep:
PAYMENT_PROVIDER=duitku
DISBURSEMENT_PROVIDER=xendit
APP_ENV=production
MAIL_MODE=smtp
```

- [ ] Rolling restart API (+ worker if needed)  
- [ ] `/health/ready` 200  
- [ ] `POST /v1/webhooks/duitku` empty → 401  

## Phase C — Canary money

- [ ] One small Duitku LIVE pay → PAID → settlement ×1 → replay safe  
- [ ] Optional: one small Xendit LIVE WD  
- [ ] Record intent/order ids (no secrets) under `evidence/KEY-62/`  
- [ ] Go / no-go written  

## Phase D — Rollback (if needed)

1. Flip `DUITKU_ENV` / `XENDIT_ENV` back to `sandbox` + sandbox secrets.  
2. Emergency switches: freeze checkout/withdrawals if available.  
3. Do not auto-down migrate.  
4. Re-check health + webhook mount.  

## Phase E — After GO

- [ ] KEY-70 headed smoke on allowlist tenants  
- [ ] KEY-71 24–72h watch window  
