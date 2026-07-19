# Performance baseline (BE-620)

Agreed **staging** load targets aligned with launch SLOs in `backend/docs/slo.md` and topology in ADR-0007. These are operational gates for BE-630, not marketing SLAs.

## Staging load targets

| Scenario | Target | Pass criteria | Notes |
| -------- | ------ | ------------- | ----- |
| API mixed read (health + public storefront + seller session reads) | 50 RPS sustained 10m, 2 API replicas | p95 &lt; 300ms; 5xx &lt; 0.1%; error budget burn not critical | No sticky sessions |
| Checkout create intent (fake Xendit) | 20 RPS sustained 5m | p95 &lt; 3s (SLO); create error rate &lt; 2% | Server price authority; Idempotency-Key required |
| Gateway QRIS create (sandbox key) | 15 RPS sustained 5m | p95 &lt; 3s; auth failures not counted as 5xx | LIVE gated by KYC capability |
| Inbound Xendit callback | 40 RPS burst 2m + 10 RPS sustained | p95 accept &lt; 500ms; finalization lag p95 &lt; 30s | Canonical four-part key; duplicate replay OK |
| Concurrent same-callback | 80 parallel identical paid callbacks | exactly 1 provider event, 1 settlement, 1 paid intent | Integration proof: `TestCallback_DuplicatePaid_SingleEffect` |
| Worker outbox drain | backlog 500 pending critical topics | oldest critical age &lt; 5m steady-state | Postgres poll + lease; Redis optional |
| Withdrawal concurrent overspend | 10 parallel withdrawals vs balance | at most one success; available ≥ 0 | Integration: `TestConcurrentWithdrawalsCannotOverspend` |

### Capacity assumptions (launch)

- Managed Postgres max_connections ≥ 100 (typical managed tier).
- API replicas: 2 × `MaxConns=20` = 40.
- Worker replicas: 2 × `MaxConns=10` = 20 (lower than API; financial jobs are lease-bounded).
- Total pool budget: **60 ≤ 80% of 100** (ADR-0007). See `pool-tuning.md`.
- Redis: non-authoritative; flush/restart must not change ledger/payment truth.

## Pool settings (staging defaults)

| Process | `pgx` MaxConns | MinConns | MaxConnLifetime | MaxConnIdleTime | ConnectTimeout |
| ------- | -------------- | -------- | --------------- | --------------- | -------------- |
| API | 20 | 2 | 30m | 5m | 5s |
| Worker | 10 | 1 | 30m | 5m | 5s |

Code defaults today: `postgres.DefaultPoolConfig()` → MaxConns **20**, MinConns **0**, lifetime **30m**, idle **5m**, health **30s**, connect **5s** (`internal/adapters/postgres/pool.go`). Staging/production should set worker MaxConns lower via deploy config when split budgets are enforced (document in BE-630 secrets/topology).

Per-request HTTP timeout: router middleware (default 60s integration stacks). Prefer short DB statements; long work is outbox/worker.

## Key query / index review (hot paths)

Evidence captured on local compose Postgres (2026-07-17) with production migrations applied. Full index inventory + EXPLAIN notes:

### 1. `payment_intents` by `provider_reference`

**Index:** `payment_intents_provider_ref_uidx` 
`UNIQUE (provider, account_scope, payment_mode, provider_reference) WHERE provider_reference IS NOT NULL` 
(migration `000015_checkout.up.sql`)

**Hot path:** callback normalize → resolve intent by provider ref; create path writes unique ref.

**Plan note:** Prefer equality on all four columns. Partial unique index supports O(1) lookup when `provider_reference` is set. Related: `payment_intents_external_id_uidx` on `(payment_mode, external_id)` for external_id correlation.

**Invariant:** one intent per provider ref per mode/account; concurrent creates cannot double-book the same provider payment.

### 2. `outbox_events` pending poll

**Indexes:**

- `outbox_events_poll_idx` — `(available_at, id) WHERE status IN ('pending','failed')`
- `outbox_events_lease_idx` — `(lease_until) WHERE status = 'processing'`
- `outbox_events_dedupe_key_uidx` — unique `dedupe_key` where not null

**Hot path:** worker claim with lease; restart must reclaim expired leases (no in-memory queue authority).

**Plan note:** At small row counts planner may seq-scan; at staging volumes the partial poll index is the intended access path. Always filter `status` + `available_at <= now()` and `ORDER BY available_at, id` with `LIMIT`.

**Invariant:** Redis flush does not drop outbox rows; financial side effects complete when worker resumes.

### 3. `audit_events` sequence

**Indexes:**

- `audit_events_chain_seq_uidx` — `UNIQUE (chain_scope, sequence_no)` (BE-530)
- `audit_events_chain_created_idx` — `(chain_scope, created_at DESC, sequence_no DESC)`

**Hot path:** append under head lock; integrity scan / metrics head select.

**Plan note (local):** 
`ORDER BY sequence_no DESC LIMIT 1` for a scope → **Index Scan Backward** on `audit_events_chain_seq_uidx`.

**Invariant:** gap-free unique sequence per chain_scope under concurrent appends.

### 4. `merchant_balances`

**Primary key:** `(merchant_id, payment_mode)` — point lookup / `FOR UPDATE` in `post_ledger_transaction`.

**Hot path:** payment capture, settlement release, withdrawal reserve; finance summary reads.

**Plan note (local):** 
`WHERE merchant_id = $1 AND payment_mode = $2` → **Index Scan** on `merchant_balances_pkey`.

**Invariant:** non-negative available/pending/held; rebuild equals projection (BE-340 tests).

### 5. `payment_provider_events` canonical key

**Index:** `payment_provider_events_canonical_uidx` 
`UNIQUE (provider, account_scope, payment_mode, provider_event_id)` 
(migration `000015_checkout.up.sql`)

Also: `payment_provider_events_provider_ref_idx` on provider_reference (partial); processing/replay indexes for workers.

**Hot path:** inbound callback first-writer-wins insert; concurrent duplicates share one row.

**Plan note (local):** 
four-part equality → **Index Scan** on `payment_provider_events_canonical_uidx`.

**Invariant:** SANDBOX vs LIVE same `provider_event_id` do not collide; 80 concurrent paid → 1 event / 1 settlement / 1 grant (BE-330).

## Staging load / SLO gate checklist

Before BE-630 canary:

1. [ ] Hit sustained RPS targets above without 5xx burn critical.
2. [ ] QRIS create p95 &lt; 3s under load with fake/staging provider.
3. [ ] Callback→PAID p95 &lt; 30s with worker replicas ≥ 1.
4. [ ] Outbox oldest critical age &lt; 5m after worker restart drill.
5. [ ] Redis flush drill: balances and payment statuses unchanged.
6. [ ] Concurrent idempotency tests green (unit/integration suite).
7. [ ] Pool budget: sum(API MaxConns × replicas + worker MaxConns × replicas) ≤ 0.8 × DB max_connections.

## Related

- `pool-tuning.md` — pgx/Redis tuning
- `resilience-drills.md` — failure injection
- `horizontal-scaling.md` — stateless proof
- `backend/docs/slo.md` — launch SLOs
- ADR-0007 — topology and pool budget
