# ADR-0002: One Xendit account for QRIS payment + disbursement; no Duitku/failover

| Field | Value |
| ------ | ---------- |
| Status | Accepted |
| Date | 2026-07-16 |
| Task | BE-000 |

## Context

Hosted checkout and merchant QRIS gateway must settle into one merchant wallet with one fee/state owner. Multi-provider routing, Duitku, backup accounts, and reconciliation consoles are product non-goals and would split fee ownership and operational truth.

References: `docs/BACKEND_PRODUCTION_TASKS.md` §0.4, §0.5, §0.7, §8, §15 BE-000, §16; `docs/BACKEND_HANDOFF.md` domain invariants.

## Decision

1. **Single logical Xendit account** for both QRIS payment create/callback and withdrawal disbursement.
2. **One Xendit adapter** shared by hosted checkout and gateway API; no duplicated fee or payment state machines.
3. **Stable non-secret `account_scope`** (launch value: `xendit-primary`). Canonical callback identity is `(provider, account_scope, payment_mode, provider_event_id)`. Raw account IDs/tokens are never used as scope or logged.
4. **No Duitku**, backup provider, multi-account routing, provider failover, or reconciliation-console product feature.
5. Monitoring is payment status, inbound callback replay, outbound seller-webhook retry, provider health, and provider-paid/local-pending alerts—not a recon UI.

## Consequences

- Provider reference uniqueness for money resolution uses the full tuple including `payment_mode` and `account_scope`, never a provider reference alone.
- Callbacks may duplicate/out-of-order; state machine + idempotency must absorb them.
- Adding another provider later requires a new ADR, schema, and release—not a runtime toggle.

## References

- BACKEND_PRODUCTION_TASKS §0.4, §0.5, §0.7, §8.1–8.4, §15 BE-000, §16 (One Xendit account)
