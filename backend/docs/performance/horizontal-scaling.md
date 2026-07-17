# Horizontal scaling proof (BE-620)

**Claim:** API and worker scale horizontally without in-memory correctness for financial or identity authority.

## Architecture (ADR-0001 / ADR-0007)

| Component | State location | Sticky sessions? |
| --------- | -------------- | ---------------- |
| fersaku-api | Stateless process; request state in Postgres | **No** |
| fersaku-worker | Stateless process; job leases in Postgres | N/A |
| PostgreSQL | Authoritative: money, outbox, sessions, idempotency, audit | HA managed |
| Redis | Non-authoritative | Optional |

## What is *not* correctness-critical in memory

| In-process structure | Purpose | Multi-replica impact |
| -------------------- | ------- | -------------------- |
| HTTP rate-limit token bucket | Soft abuse control local/dev | May be uneven across replicas; not financial |
| Gateway service soft rate map | Test/dev soft limit | Same |
| Principal permission set on request | Derived from session load | Recomputed per request from DB |
| Fake Xendit maps | Local/test only | Single-process tests only; production uses real adapter |
| Mail capture | Tests | N/A |

None of the above may gate ledger credits, withdrawal reserves, payment status, or idempotency.

## Correctness mechanisms (DB-backed)

1. **Idempotency** — `idempotency_records` unique scope; first-writer-wins (`TryInsertIdempotency`).
2. **Payment intents** — unique provider_ref / external_id / merchant_ref / idempotency hashes.
3. **Callbacks** — `payment_provider_events` canonical unique `(provider, account_scope, payment_mode, provider_event_id)`.
4. **Settlements / ledger** — unique journal/settlement keys; `post_ledger_transaction` SECURITY DEFINER; balance row locks.
5. **Outbox** — durable rows + lease_owner/lease_until; workers reclaim expired leases after restart.
6. **Sessions** — token hash in Postgres; any API replica can resolve cookies.
7. **Audit** — chain sequence uniqueness per `chain_scope` under append lock.

## Scaling rules

1. Run **≥ 2 API replicas** across failure domains for live traffic + Xendit callbacks.
2. Scale workers by **oldest outbox age / pending depth**, not CPU alone.
3. Recalculate **pool budget** when replica count changes (`pool-tuning.md`).
4. Rolling deploy: drain HTTP, stop dequeue, finish in-flight leases, keep callback capacity.
5. Never require session affinity or in-memory queues for money paths.

## Proof artifacts

| Evidence | Location |
| -------- | -------- |
| Concurrent callback idempotency (80×) | `test/integration/callbacks_test.go` |
| Concurrent withdrawal overspend blocked | `test/integration/withdrawals_test.go` |
| Concurrent foundation idempotency | `test/integration/foundation_test.go` |
| Worker restart / Redis non-authority drills | `scripts/resilience_drills.sh` + `resilience-drills.md` |
| Topology decision | `docs/adr/ADR-0007-production-runtime-topology.md` |

## Residual (non-blocking for launch)

- Global rate-limit fairness across replicas is best-effort until Redis-backed limiter ships; still not a money path.
- Local compose runs single API/worker; HA is staging/production topology (BE-630 provisioning).
