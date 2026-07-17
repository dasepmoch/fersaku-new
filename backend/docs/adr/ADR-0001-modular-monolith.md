# ADR-0001: Modular monolith (api + worker), PostgreSQL authority, Redis non-authoritative, R2 private-by-default

| Field  | Value      |
| ------ | ---------- |
| Status | Accepted   |
| Date   | 2026-07-16 |
| Task   | BE-000     |

## Context

Fersaku needs one production-ready Go backend for hosted storefront commerce and a pure QRIS payment gateway API. The product forbids microservices-first design, Kafka/service mesh, full CQRS/event-sourcing, and treating frontend mock/localStorage as authority. Frontend stays mock-first by default; Go owns identity, payment, ledger, KYC, credentials, and audit.

References: `docs/BACKEND_PRODUCTION_TASKS.md` §0, §2.1–2.3, §9.1, §10.1, §14.5, §15 Phase 0 BE-000, §16, §18; `docs/BACKEND_HANDOFF.md`; `ARCHITECTURE.md`.

## Decision

1. **Shape:** Modular monolith with two binaries sharing domain/application/ports:
   - `fersaku-api` — HTTP API, auth, seller/buyer/admin, checkout, gateway, Xendit callback ingress.
   - `fersaku-worker` — queue jobs (webhook delivery/retry, email, KYC processing, cleanup, alerts).
2. **Dependency direction:** `cmd/*` → `internal/app` → `application` → `domain` → `ports` ← `adapters`. Domain must not import chi, pgx, Redis, Xendit, R2, or HTTP DTOs.
3. **PostgreSQL** is the sole source of truth for money, auth sessions, ledger, payments, KYC, credentials, audit, and authorization decisions.
4. **Redis** is non-authoritative: cache, rate limit, coordination, and queue acceleration only. Flush/restart must not corrupt financial truth; durable work recovers from Postgres transactional outbox.
5. **Cloudflare R2** is private-by-default. Public assets only via explicit public prefix/domain. DB stores opaque `object_ref`; keys are server-generated create-only; R2 object versioning is not assumed. KYC never uses browser-to-R2 presign.
6. **Not now:** microservices, Kafka, service mesh, full CQRS/event-sourcing, repository over-abstraction.

## Consequences

- Horizontal scale of api/worker replicas is fine; split services only after measured bottleneck and a new ADR.
- All financial and security mutations commit domain rows + audit + idempotency + outbox atomically in Postgres.
- Compose is local-only; production topology is recorded in ADR-0007.
- Implementers must not treat Redis or frontend localStorage as authority for auth, payment, ledger, or KYC.

## References

- BACKEND_PRODUCTION_TASKS §2.1, §2.2, §2.3, §9.1, §10.1, §14.5, §15 BE-000, §16 (Redis non-authority, R2 privacy)
