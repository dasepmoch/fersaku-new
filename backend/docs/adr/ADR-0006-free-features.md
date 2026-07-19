# ADR-0006: All in-scope features free; delivery auth ≠ paid plan

| Field | Value |
| ------ | ---------- |
| Status | Accepted |
| Date | 2026-07-16 |
| Task | BE-000 |

## Context

Fersaku monetizes only via transaction and withdrawal fees (ADR-0003). Feature access must never depend on plan, subscription, or payment entitlement. Buyer rights to digital goods they already paid for must not be confused with a Fersaku SaaS plan.

References: `docs/BACKEND_PRODUCTION_TASKS.md` §0.1, §0.2, §0.7, §4.12, §15 BE-000, §16; `docs/BACKEND_HANDOFF.md`.

## Decision

1. **All in-scope product features are free** for every merchant/seller/buyer allowed by role, security state, KYC (live API only), merchant status, and emergency switches.
2. **No paid plan machinery:** no tables/endpoints for `plans`, `subscriptions`, `billing_accounts`, `paid_entitlements`, platform recurring billing, usage quotas that can be purchased, or feature gates based on billing status.
3. **Fees never open or close features.** Posting a transaction/withdrawal fee must leave capabilities unchanged.
4. **Authorization controls that remain valid (not paywalls):**
 - RBAC / tenant membership
 - KYC approval for **live** QRIS API only
 - Merchant/API suspension (independent)
 - Emergency switches: `SELLER_REGISTRATION`, `QRIS_CHECKOUT`, `WITHDRAWALS`
5. **Delivery authorization is not a plan:**
 - Buyer access to a purchased product (download, protected link, credential reveal) is order/payment/fulfillment authorization.
 - It is **not** a Fersaku paid entitlement or subscription tier.
6. **Domain custom hosting, analytics, coupons, webhooks, sandbox API** are free within documented security limits; none require a paid tier.

## Consequences

- OpenAPI/schema/route inventory tests must fail CI if plan/subscription/billing gate paths appear.
- Admin system/config remains operational (read-only release config + three emergency switches), never per-merchant “Pro” override.
- Frontend mock labels that look like tiers must map to free/capability state at the adapter boundary without inventing billing.

## References

- BACKEND_PRODUCTION_TASKS §0.1, §0.2, §0.7, §4.12, §15 BE-000, §16 (All scoped features free)
