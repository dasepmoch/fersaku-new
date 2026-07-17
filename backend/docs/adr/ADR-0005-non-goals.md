# ADR-0005: Non-goals — no refund, dispute, recon console, product gateway API, subscription

| Field  | Value      |
| ------ | ---------- |
| Status | Accepted   |
| Date   | 2026-07-16 |
| Task   | BE-000     |

## Context

Scope control is required so implementers do not grow a payment platform into commerce/refund/recon/subscription products. Frontend mock may show illustrative labels; those are not production authority.

References: `docs/BACKEND_PRODUCTION_TASKS.md` §0.1, §0.7, §15 BE-000, §16; `docs/BACKEND_HANDOFF.md`.

## Decision

The following are **explicitly out of scope** for launch and must not appear as schema, OpenAPI routes, admin consoles, or feature gates:

1. **No refund / dispute product**
   - No refund endpoint, refund table, dispute/refund console, or automatic refund.
   - Verified provider reversal is operational containment + compensating journal only; it never rewrites `PAID` into a refund status or adds refund UI/API.

2. **No reconciliation console**
   - No recon UI, multi-provider matching job as a product feature, or dual-provider settlement console.
   - Operational monitoring uses payment status, callback replay, seller-webhook retry, provider health, and mismatch alerts only.

3. **No product/catalog gateway API for integrators**
   - QRIS Payment Gateway API is payment-only: create/status/cancel intent, callback/webhook.
   - No product CRUD, upload, list, inventory, or catalog API on the gateway surface.

4. **No multi-provider / Duitku / failover**
   - Xendit only (see ADR-0002).

5. **No subscription / paid plan platform**
   - No `plans`, `subscriptions`, `billing_accounts`, `paid_entitlements`, platform billing checkout, purchasable feature gates, or fee-triggered access (see ADR-0006).

6. **No heavy platform extras**
   - No Admin AI, risk engine/operation console, dedicated security-audit console product, microservices/event bus (Kafka), service mesh, or full CQRS/event-sourcing.

7. **No UI redesign for backend**
   - Backend integrates without changing frontend routes, layout, visuals, or default mock-first behavior.

## Consequences

- CI negative assertions fail if OpenAPI/migrations/routes add forbidden domains.
- Provider-paid/local-pending and reverse-containment paths stay operational, not productized refund/recon.
- Expanding any non-goal requires a new approved ADR and release—not a flag.

## References

- BACKEND_PRODUCTION_TASKS §0.1, §0.7, §15 BE-000, §16 (No refund/dispute, No reconciliation console)
