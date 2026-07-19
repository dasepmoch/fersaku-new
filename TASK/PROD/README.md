# PROD — Production readiness & dual-provider money path

> **Program start:** 2026-07-19  
> **Goal:** Bawa monorepo `frontend/` + `backend/` dari **local/demo** ke **staging → canary → production**, dengan path uang yang benar:
>
> | Flow | Provider |
> | ---- | -------- |
> | **Terima pembayaran (QRIS checkout + gateway)** | **Duitku** |
> | **Withdrawal / disbursement ke bank** | **Xendit** |
>
> **Auth policy (supersedes historical MFA tasks):** no MFA/TOTP. Password (seller/admin) or magic-link (buyer) only.

This package is the **execution source of truth** for production cutover.  
Historical docs under `docs/`, `backend/docs/adr/`, and root `TASK/01..10` that say **“Xendit only / no Duitku”** are **superseded for payment ingress** by [`00-DECISIONS-AND-NON-GOALS.md`](00-DECISIONS-AND-NON-GOALS.md). Disbursement remains Xendit.

---

## 1. Why this package exists

| Reality today | Target |
| ------------- | ------ |
| Backend engineering package largely complete (BE-000…BE-630) | Live money + HA + owner-sign |
| FE domain wiring largely complete in old `TASK/09` | `NEXT_PUBLIC_DATA_SOURCE=api` + stage `live` canary |
| QRIS adapter is Xendit-shaped (`ports.QRISProvider` + `adapters/xendit`) | **Duitku** implements QRIS create/status/callback |
| Withdrawal path already Xendit-oriented | Keep/harden **Xendit disbursement** only |
| `APP_ENV=local`, Xendit fake, MinIO, Mailpit | Staging secrets, real sandbox, then live canary |
| Integration gates G0–G8 / quality cells still open | Close them with evidence under `TASK/PROD/evidence/` |

---

## 2. Hard rules (best practice)

1. **Never commit secrets.** Credentials live only in host secret files / secret manager. Reference: host file `/var/www/pg.txt` (sandbox keys for local/staging bootstrap). **Do not copy raw keys into git, Docker images, evidence MD, or logs.**
2. **UI freeze remains in force** for seller/buyer/admin chrome (`TASK/00-UI-FREEZE-CONTRACT.md`) unless a task explicitly allows a minimal control fix.
3. **Postgres is authority** for money state. Providers are evidence sources; callbacks are idempotent and ordered-safe.
4. **Ports over SDKs.** Domain services talk to `ports.QRISProvider` / `ports.DisbursementProvider`. Adapters own HTTP, signatures, and raw payload retention.
5. **Fail closed on live.** Fake/mock providers forbidden when `APP_ENV` is `staging` or `production` (except explicit sandbox *payment_mode* where product allows).
6. **One task = one claimable unit** with: scope, non-goals, acceptance tests, evidence path, rollback.
7. **Evidence required** under `TASK/PROD/evidence/<TASK-ID>/YYYYMMDD-HHMM-<agent>.md` before marking done in [`09-EXECUTION-STATUS.md`](09-EXECUTION-STATUS.md).
8. **No silent ADR drift.** Provider split requires new ADR file in phase A before merge of adapter code.

---

## 3. Phase map (execute in order)

```text
A  Decisions + ADR + env matrix          00, 01, 10
B  Staging foundation (infra flags)      02
C  Duitku payment (QRIS + callback)      03
D  Xendit disbursement (withdrawal)      04
E  Frontend API-live checkout/withdraw   05
F  Security hardening                    06
G  Quality gates + canary                07
H  Ops owner-sign + go-live              08
```

Parallelism allowed only where dependency arrows are empty in each phase file.

---

## 4. Document index

| Doc | Purpose |
| --- | ------- |
| [`00-DECISIONS-AND-NON-GOALS.md`](00-DECISIONS-AND-NON-GOALS.md) | Product/tech decisions; supersedes Xendit-only payment |
| [`01-PROVIDER-ARCHITECTURE.md`](01-PROVIDER-ARCHITECTURE.md) | Ports, adapters, callback identity, fee ownership |
| [`02-PHASE-A-FOUNDATION-STAGING.md`](02-PHASE-A-FOUNDATION-STAGING.md) | ADR, config, compose, secrets injection |
| [`03-PHASE-B-DUITKU-PAYMENT.md`](03-PHASE-B-DUITKU-PAYMENT.md) | Duitku QRIS create/status/callback/tests |
| [`04-PHASE-C-XENDIT-DISBURSEMENT.md`](04-PHASE-C-XENDIT-DISBURSEMENT.md) | Xendit disbursement quote/create/webhook |
| [`05-PHASE-D-FRONTEND-API-LIVE.md`](05-PHASE-D-FRONTEND-API-LIVE.md) | FE flags, checkout/withdraw wiring |
| [`06-PHASE-E-SECURITY-HARDENING.md`](06-PHASE-E-SECURITY-HARDENING.md) | Cookies, CSRF, rate limits, webhook auth |
| [`07-PHASE-F-QUALITY-CANARY.md`](07-PHASE-F-QUALITY-CANARY.md) | G0–G8, quality cells, canary script |
| [`08-PHASE-G-OPS-OWNER-SIGN.md`](08-PHASE-G-OPS-OWNER-SIGN.md) | HA, backups, on-call, residual sign-off |
| [`09-EXECUTION-STATUS.md`](09-EXECUTION-STATUS.md) | Live status board |
| [`10-SECRETS-AND-ENV-MATRIX.md`](10-SECRETS-AND-ENV-MATRIX.md) | Env var names only; source of values |
| [`11-AGENT-RUNBOOK.md`](11-AGENT-RUNBOOK.md) | How an agent claims/finishes a task |

---

## 5. Definition of done (program)

Program complete only when **all** hold:

1. Sandbox end-to-end: checkout paid via **Duitku** callback → ledger credit → seller balance.
2. Sandbox end-to-end: withdrawal → **Xendit** disbursement webhook → completed/failed handled.
3. Staging FE runs `DATA_SOURCE=api` + `APP_STAGE=live` (or staging stage with same fail-closed rules).
4. Fake providers rejected on staging/production config tests.
5. Quality gates for `checkout-order` + `seller-finance` + auth/session closed with evidence.
6. Owner-signed readiness checklist + residual risks (or explicitly deferred with date).
7. Canary runbook executed once on sandbox (and once on live when owner approves).
8. No secrets in git history from this program.

---

## 6. Relationship to older TASK/

| Older package | Role after PROD |
| ------------- | --------------- |
| `TASK/00`–`10` + `evidence/` | Historical FE↔BE integration program; keep for archaeology |
| `docs/backend-progress.json` | BE engineering package status (code complete ≠ live) |
| **`TASK/PROD/*`** | **Active production + dual-provider execution** |

Agents doing production/money work **start here**, not in `TASK/09`.

---

## 7. Quick start for the next agent

```bash
# 1. Read in order
TASK/PROD/README.md
TASK/PROD/00-DECISIONS-AND-NON-GOALS.md
TASK/PROD/01-PROVIDER-ARCHITECTURE.md
TASK/PROD/09-EXECUTION-STATUS.md   # pick first open P0 task
TASK/PROD/11-AGENT-RUNBOOK.md

# 2. Never cat secrets into commits
# Values: /var/www/pg.txt (host-local) → inject as env only

# 3. Work only the claimed task ID; write evidence; update 09 board
```
