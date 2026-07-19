# 00 — Decisions and non-goals (locked for PROD program)

| Field | Value |
| ----- | ----- |
| Status | **Accepted for execution** |
| Date | 2026-07-19 |
| Supersedes (payment ingress) | ADR-0002 “Xendit only / no Duitku” for **QRIS payment create/callback** |
| Does not supersede | Ledger, fee policy, wallet, R2, RBAC, UI freeze, no-refund policy |

---

## 1. Money path (locked)

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

| Concern | Provider | Rationale |
| ------- | -------- | --------- |
| Hosted checkout QRIS | **Duitku** | Product owner: receive payment via Duitku |
| Merchant QRIS gateway API | **Duitku** | Same wallet, same fee owner, one payment adapter |
| Withdrawal / bank disbursement | **Xendit** | Product owner: payout via Xendit disbursement |
| Fee calculation / ledger | **Fersaku (Postgres)** | Never trust provider as fee authority alone |

---

## 2. Explicit product decisions

| ID | Decision |
| -- | -------- |
| D-01 | **Split providers by capability**, not by surface: payment = Duitku, disbursement = Xendit. |
| D-02 | **One wallet per merchant** still holds; source tags remain `STOREFRONT` / `QRIS_API`. |
| D-03 | **Launch fee policy unchanged** (3%+700 tx, 3%+provider withdrawal, min WD Rp50.000). |
| D-04 | **No MFA/TOTP** for admin/seller/buyer (password / magic-link only). |
| D-05 | **No refund/dispute console** in this program. |
| D-06 | **No multi-provider failover UI** and no automatic “if Duitku down use Xendit QRIS”. |
| D-07 | **Sandbox first**, then live canary with owner approval for real money. |
| D-08 | **Secrets never in git**; `/var/www/pg.txt` is host-local reference only. |
| D-09 | **UI freeze** unless a PROD task lists a minimal control exception. |
| D-10 | Historical “no Duitku” ADRs remain on disk for history; **new ADR-0008** is required before merge of Duitku adapter (task PROD-A10). |

---

## 3. Non-goals (do not implement in this program)

1. Duitku disbursement / payout.
2. Xendit QRIS payment create/callback as primary path (may remain as dead code only until deleted/isolated; must not receive production traffic).
3. Provider routing / smart failover / multi-account dashboards.
4. Refund, chargeback, or dispute management console.
5. Subscription / plan entitlements.
6. Google OAuth, live contact form, admin campaigns (still launch out-of-scope unless product reopens).
7. Redesign of seller/admin/buyer shells.
8. Committing production or sandbox secrets to the repository.

---

## 4. Migration stance from Xendit-QRIS → Duitku-QRIS

| Area | Action |
| ---- | ------ |
| `ports.QRISProvider` | Keep interface stable; swap implementation to Duitku adapter |
| `ports.DisbursementProvider` | Keep Xendit implementation |
| Inbound routes | Add `/v1/webhooks/duitku` (+ sandbox/live variants if needed); deprecate payment traffic to `/v1/webhooks/xendit` |
| Outbound | Keep `/v1/webhooks/xendit/disbursement` |
| OpenAPI | Document both webhook families with security schemes |
| Config | `PAYMENT_PROVIDER=duitku`, `DISBURSEMENT_PROVIDER=xendit` (names exact in `10-SECRETS-AND-ENV-MATRIX.md`) |
| Data | Existing `provider` / `account_scope` columns must accept `duitku` without breaking historical Xendit rows |

---

## 5. Security baseline (non-negotiable)

- Webhook auth: Duitku signature/merchant validation; Xendit `x-callback-token` constant-time compare.
- Bounded body size; raw payload encrypted or redacted at rest per existing callback evidence policy.
- Idempotent callback apply by canonical event id.
- No browser trust of paid status; only server session + payment state.
- Rate limits on login, checkout create, webhook ingress (IP + route).

---

## 6. Open questions (must close in PROD-A10 before coding adapters)

| # | Question | Default if owner silent |
| - | -------- | ----------------------- |
| Q1 | Duitku QRIS method code for launch (`SP` in pg.txt) | Use `DUITKU_QRIS_PAYMENT_METHOD` env |
| Q2 | Single merchant code for whole platform vs per-seller | **Platform single merchant code** (Fersaku collects, then ledger splits) |
| Q3 | Live vs sandbox callback hostnames | `api.fersaku.net` sandbox first |
| Q4 | Whether to delete Xendit QRIS code or keep behind dead flag | **Keep code**, unwire from composition on live; delete only after canary stable |

Record answers in `TASK/PROD/evidence/PROD-A10/`.
