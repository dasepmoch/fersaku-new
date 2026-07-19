# 01 — Provider architecture (ports, adapters, identity)

## 1. Layering (best practice)

```text
HTTP handlers / jobs
        ↓
application services (checkout, gateway, withdrawals)
        ↓
ports.QRISProvider          ports.DisbursementProvider
        ↓                              ↓
adapters/duitku/*            adapters/xendit/* (disbursement)
        ↓                              ↓
Duitku HTTP API              Xendit HTTP API
```

**Rules:**

- Application layer **never** imports Duitku/Xendit DTO packages.
- Adapters **never** write ledger rows; they return port results / classified errors.
- Callback handlers verify auth → parse → map to domain command → service apply (idempotent).

---

## 2. Port contracts (existing — preserve)

### 2.1 Payment (today named QRIS)

File: `backend/internal/ports/qris.go`

```go
type QRISProvider interface {
  CreateQRIS(ctx, CreateQRISInput) (CreateQRISResult, error)
  GetPayment(ctx, providerRef) (ProviderPayment, error)
  CancelPayment(ctx, providerRef) (ProviderPayment, error)
  ExpirePayment(ctx, providerRef) (ProviderPayment, error)
}
```

**PROD change:** implement with **Duitku** adapter. Optionally rename later to `PaymentProvider` (non-blocking; rename only if zero behavior change).

### 2.2 Disbursement

File: `backend/internal/ports/disbursement.go`

```go
type DisbursementProvider interface {
  QuoteDisbursement(ctx, DisbursementQuoteInput) (DisbursementQuote, error)
  CreateDisbursement(ctx, CreateDisbursementInput) (CreateDisbursementResult, error)
  GetDisbursement(ctx, providerRef) (ProviderDisbursement, error)
}
```

**PROD change:** keep **Xendit** real adapter; ensure wired on staging/production.

---

## 3. Canonical identities

### 3.1 Payment callback (Duitku)

```text
(provider="duitku", account_scope, payment_mode, provider_event_id)
```

- `account_scope`: non-secret stable string e.g. `duitku-primary`.
- `payment_mode`: `SANDBOX` | `LIVE`.
- `provider_event_id`: Duitku merchantOrderId / reference that is unique per money event.
- Uniqueness enforced in Postgres for money resolution (same spirit as current Xendit path).

### 3.2 Disbursement callback (Xendit)

```text
(provider="xendit", account_scope="xendit-primary", payment_mode, provider_event_id)
```

Existing route: `POST /v1/webhooks/xendit/disbursement`.

---

## 4. HTTP surface (target)

| Method | Path | Auth | Owner task |
| ------ | ---- | ---- | ---------- |
| POST | `/v1/webhooks/duitku` | Duitku signature / merchant validation | PROD-B20 |
| POST | `/v1/webhooks/duitku/sandbox` | same | PROD-B20 |
| POST | `/v1/webhooks/duitku/live` | same | PROD-B20 |
| POST | `/v1/webhooks/xendit/disbursement` | `x-callback-token` | PROD-C10 (harden) |
| POST | `/v1/webhooks/xendit` (payment) | **No new traffic** after cutover | PROD-B40 unwire |

Checkout / gateway create paths stay application routes; only the **provider adapter** behind them changes.

---

## 5. Config composition

```text
PAYMENT_PROVIDER=duitku|fake
DISBURSEMENT_PROVIDER=xendit|fake

# Duitku
DUITKU_MERCHANT_CODE=
DUITKU_API_KEY=
DUITKU_ENV=sandbox|production
DUITKU_BASE_URL=
DUITKU_CALLBACK_URL=
DUITKU_RETURN_URL=
DUITKU_QRIS_PAYMENT_METHOD=SP
DUITKU_ACCOUNT_SCOPE=duitku-primary

# Xendit (disbursement)
XENDIT_SECRET_KEY=
XENDIT_WEBHOOK_TOKEN=
XENDIT_ENV=sandbox|production
XENDIT_BASE_URL=https://api.xendit.co
XENDIT_ACCOUNT_SCOPE=xendit-primary
XENDIT_MODE=fake|live   # legacy; map to DISBURSEMENT_PROVIDER + fail-closed
```

**Fail-closed:**

| APP_ENV | fake payment | fake disbursement |
| ------- | ------------ | ----------------- |
| local / test | allowed | allowed |
| staging | **forbidden** unless explicit `ALLOW_FAKE_PROVIDERS=1` for dry drills | same |
| production | **forbidden** | **forbidden** |

---

## 6. State machines (do not invent new money states)

Reuse existing payment / withdrawal status enums and transitions. Adapters only map provider status → existing domain status.

| Provider signal | Domain (payment) |
| --------------- | ---------------- |
| pending / created | PENDING_PAYMENT |
| success / paid | PAID |
| expired | EXPIRED |
| failed / canceled | FAILED |

| Provider signal | Domain (withdrawal) |
| --------------- | ------------------- |
| pending / processing | PROCESSING |
| completed | COMPLETED |
| failed | FAILED |
| timeout after send | UNKNOWN + lookup job |

---

## 7. Testing matrix (minimum)

| Layer | Payment (Duitku) | Disbursement (Xendit) |
| ----- | ---------------- | --------------------- |
| Unit adapter | signature, map status, error class | token, map status |
| Integration | create → callback → PAID ledger | quote → create → webhook |
| Security | bad signature 401, replay, oversized body | bad token 401, replay |
| E2E API | checkout vertical slice with sandbox or fake dual mode | withdrawal slice |

---

## 8. Rollback

1. Feature flag / env: point `PAYMENT_PROVIDER=fake` only on local; on staging set previous known-good image.
2. Do not delete Duitku rows; money history is append-only.
3. Callback routes remain mounted even if create path rolled back (absorb late events).
