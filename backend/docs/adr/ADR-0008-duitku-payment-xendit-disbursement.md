# ADR-0008: Dual provider — Duitku payment (QRIS) / Xendit disbursement

| Field | Value |
| ------ | ---------- |
| Status | Accepted |
| Date | 2026-07-19 |
| Task | PROD-A10 / PROD program |
| Supersedes | ADR-0002 **for QRIS payment create/callback only** |
| Does not supersede | ADR-0002 disbursement half; ledger, fee policy, wallet, R2, RBAC, UI freeze, no-refund policy |

## Context

ADR-0002 locked a single Xendit account for both QRIS payment create/callback and withdrawal disbursement, and treated Duitku as a non-goal. Product now requires a **split money path**:

```text
Buyer pays QRIS
    → Duitku create + callback
    → Fersaku payment state machine (PENDING → PAID | EXPIRED | FAILED)
    → fee snapshot + ledger credit (STOREFRONT | QRIS_API)
    → merchant available/pending balance

Seller withdraws
    → quote (platform fee + Xendit processing fee)
    → create disbursement (Xendit)
    → Xendit disbursement webhook
    → withdrawal COMPLETED | FAILED | UNKNOWN handling
```

Historical “Xendit only / no Duitku” guidance remains on disk for archaeology. This ADR is the source of truth for payment ingress going forward. Auth policy remains password / magic-link only (no MFA); that is out of scope for reopening ADR-0004.

References: `TASK/PROD/00-DECISIONS-AND-NON-GOALS.md`, `TASK/PROD/01-PROVIDER-ARCHITECTURE.md`, `TASK/PROD/02-PHASE-A-FOUNDATION-STAGING.md` (PROD-A10); ADR-0002, ADR-0003, ADR-0005, ADR-0007.

## Decision

1. **Payment ingress = Duitku.** Hosted checkout QRIS and merchant QRIS gateway create/status/callback use a **Duitku** implementation of `ports.QRISProvider`. Xendit is no longer the primary QRIS payment path after cutover.
2. **Disbursement = Xendit.** Seller withdrawal quote/create/webhook stays on **Xendit** via `ports.DisbursementProvider`. ADR-0002 remains valid for the disbursement half and for historical Xendit payment rows.
3. **Ports stay stable.** Application services talk only to `ports.QRISProvider` and `ports.DisbursementProvider`. Adapters own HTTP, signatures, and raw payload retention; they never write ledger rows.
4. **Config direction:**
   - `PAYMENT_PROVIDER=duitku|fake`
   - `DISBURSEMENT_PROVIDER=xendit|fake`
   - Duitku env names include `DUITKU_MERCHANT_CODE`, `DUITKU_API_KEY`, `DUITKU_ENV`, `DUITKU_BASE_URL`, `DUITKU_CALLBACK_URL`, `DUITKU_RETURN_URL`, `DUITKU_QRIS_PAYMENT_METHOD` (default `SP`), `DUITKU_ACCOUNT_SCOPE` (e.g. `duitku-primary`)
   - Xendit disbursement continues with existing secret/webhook/base URL vars and `XENDIT_ACCOUNT_SCOPE=xendit-primary`
5. **Fail-closed on staging/production.** `PAYMENT_PROVIDER=fake` and `DISBURSEMENT_PROVIDER=fake` are forbidden when `APP_ENV` is `staging` or `production` (except an explicit documented drill flag). Local/test may use fake providers.
6. **Canonical identities**
   - Payment (Duitku): `(provider="duitku", account_scope, payment_mode, provider_event_id)` with non-secret `account_scope` (e.g. `duitku-primary`), `payment_mode` `SANDBOX`|`LIVE`, and a unique Duitku merchantOrderId/reference as `provider_event_id`.
   - Disbursement (Xendit): `(provider="xendit", account_scope="xendit-primary", payment_mode, provider_event_id)` on `POST /v1/webhooks/xendit/disbursement`.
7. **Platform single merchant code** for Duitku at launch (Fersaku collects; ledger splits per merchant). Sandbox callback host first: `api.fersaku.net`.
8. **Xendit QRIS code:** keep on disk but unwire from composition on live; delete only after canary is stable (not in this ADR task).
9. **HTTP surface (target):** Duitku webhooks under `/v1/webhooks/duitku` (+ sandbox/live variants as needed); no new production payment traffic to Xendit payment webhook after cutover.
10. **Open product answers recorded for PROD-A10 (owner-silent defaults):**
    - Q1: use `DUITKU_QRIS_PAYMENT_METHOD` env (default `SP`)
    - Q2: platform single merchant code
    - Q3: `api.fersaku.net` sandbox first
    - Q4: keep Xendit QRIS code unwired; delete only after canary stable

### Explicit non-goals (this program)

1. Duitku disbursement / payout.
2. Xendit QRIS payment create/callback as primary path after cutover (dead/unwired code only until deleted).
3. Multi-provider failover UI or automatic “if Duitku down use Xendit QRIS”.
4. Refund, chargeback, or dispute management console.
5. Reopening ADR-0004 MFA policy (no MFA; password / magic-link only remains).

## Consequences

- New Duitku adapter and webhook routes land in later PROD-B* tasks; this ADR does not implement them.
- Existing `provider` / `account_scope` columns must accept `duitku` without breaking historical Xendit payment rows.
- Postgres remains fee and money-state authority; provider callbacks are evidence sources, applied idempotently by canonical event id.
- Fake providers must fail closed in staging/production config tests (PROD-A20).
- Adding another payment or disbursement provider later requires a new ADR, schema review, and release—not a runtime toggle or multi-account dashboard.

## References

- `TASK/PROD/00-DECISIONS-AND-NON-GOALS.md` (money path, D-01–D-10, non-goals, Q1–Q4)
- `TASK/PROD/01-PROVIDER-ARCHITECTURE.md` (ports, identities, config, fail-closed)
- `TASK/PROD/02-PHASE-A-FOUNDATION-STAGING.md` (PROD-A10)
- ADR-0002 (historical Xendit-only payment; payment half superseded here)
- ADR-0003 (launch fee policy unchanged)
- ADR-0005 (no-refund / no-dispute non-goals)
- ADR-0007 (payment_mode vs deployment env)
