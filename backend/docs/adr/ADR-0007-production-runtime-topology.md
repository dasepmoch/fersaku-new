# ADR-0007: Production runtime/topology, payment_mode, canonical store, fee bounds

| Field | Value |
| ------ | ---------- |
| Status | Accepted |
| Date | 2026-07-16 |
| Task | BE-000 |

## Context

`BE-000` must not leave production topology implicit. Compose is local-only. Financial identity (`payment_mode`) must not be confused with deployment env. Every merchant needs one canonical store and one unified wallet.

References: `docs/BACKEND_PRODUCTION_TASKS.md` §0.3, §0.5, §0.6, §2.1, §10.4, §14.3–14.5, §15 BE-000, §16; ADR-0001, ADR-0003.

## Decision

### Production container runtime

1. **Chosen runtime:** managed container service (e.g. managed ECS/Cloud Run/equivalent) **or** Kubernetes **only if** the operator already runs it. Launch default: **managed container service** with rolling deploy—not Docker Compose, not DIY single-VM.
2. **Binaries:** `fersaku-api` and `fersaku-worker` images (ADR-0001). Compose remains local/dev only and is never presented as production topology.

### Minimum topology

| Component | Requirement |
| --------- | ----------- |
| Ingress / LB | Terminates TLS; preserves configured request ID; trusts only documented proxy CIDRs |
| API | ≥ 2 stateless replicas across failure domains for live traffic + Xendit callbacks; no sticky sessions |
| Worker | Replicas/concurrency queue-specific; financial jobs use bounded leases + DB pool limits; email/webhook may scale independently inside same binary |
| PostgreSQL | Managed HA + PITR; environment-separated |
| Redis | Managed TLS/auth; non-authoritative (ADR-0001) |
| R2 | Private buckets by default; secret-manager identities environment-separated |
| Migrations | One migration job/identity before rollout under PostgreSQL advisory lock; API/worker startup never races migrations |
| DB pools | Total API + worker pool max ≤ **80%** of DB max connections; per-query/transaction timeouts |
| Resources | CPU/memory requests/limits and worker concurrency measured in staging; autoscale on API latency/RPS and critical-job oldest age, not CPU alone |
| Deploy | Rolling: drain HTTP, stop dequeue, complete bounded in-flight work, release leases, preserve callback availability; rollback = previous immutable image + forward-compatible schema |

### Deployment env vs payment_mode

| Concept | Values | Use |
| ------- | ------ | --- |
| Runtime `env` | `local` \| `staging` \| `production` | Deployment/config only—never financial identity |
| `payment_mode` | `SANDBOX` \| `LIVE` | Required on order, payment intent, provider event, ledger tx, outbox, idempotency scope, audit context |

- Sandbox: fake/deterministic provider adapter, separate ledger namespace; never credits live wallet; not withdrawable.
- API capability state is per `(merchant, payment_mode)`; not a single boolean.
- `POST /v1/checkout/simulate-payment` only on local/staging with explicit gate; production 404/405.

### Canonical store and unified wallet

1. Onboarding **must** create exactly one canonical store per merchant (even API-only merchants).
2. Wallet, KYC capability, API credentials, and admin API-access state are **merchant-scoped**.
3. Service always resolves `store_id → merchant_id`; no per-store wallet.
4. Storefront payments: `source=STOREFRONT` + `store_id`. Gateway: `source=QRIS_API` + canonical store attribution default.
5. Available/pending/held and withdrawal lock are merchant-wide; store/source breakdown is reporting only.

### Fee / amount policy (consistent with ADR-0003)

| Invariant | Launch value |
| --------- | ------------ |
| `transaction_percent_bps` | 300 |
| `transaction_fixed_idr` | 700 |
| `withdrawal_percent_bps` | 300 |
| `minimum_withdrawal_idr` | 50_000 |
| `minimum_payment_idr` | 1_000 |
| `maximum_payment_idr` | 100_000_000 |
| Fee scope | `GLOBAL` only; immutable via admin |
| Xendit `account_scope` | `xendit-primary` |

### Retention owners (summary)

See ADR-0004 / §10.4 table. Owners: Finance+Privacy (ledger/audit 7y), Payments (raw callback 90d), Compliance+Privacy (KYC), Security (auth events/sessions), Merchant/Product (delivery objects), Storage (multipart 24h), Admin Ops (export artifacts 24h).

## Consequences

- BE-630 must provision HA topology, ingress trust, pool budgets, migration lock, drain/autoscaling, and callback failure-domain tests before launch.
- Implementers must never use `env=production` as a substitute for `payment_mode=LIVE`.
- Changing min/max payment or topology class requires ADR amendment + release evidence.

## References

- BACKEND_PRODUCTION_TASKS §0.3, §0.5, §0.6, §2.1, §10.4, §14.3, §14.4, §14.5, §15 BE-000, §16 (Production topology, Sandbox isolation, Mandatory store, Unified wallet)
