# Pool tuning (BE-620)

Postgres is authoritative. Redis is non-authoritative (wake-up / cache only). Financial correctness must never depend on Redis or in-process memory.

## pgx pool (API + worker)

Implementation: `internal/adapters/postgres/pool.go`.

### Defaults (`DefaultPoolConfig`)

| Setting | Default | Rationale |
| ------- | ------- | --------- |
| MaxConns | 20 | Safe single-process default for local/small staging |
| MinConns | 0 | Avoid idle connection waste on idle workers |
| MaxConnLifetime | 30m | Recycle before managed LB/NAT idle kills |
| MaxConnIdleTime | 5m | Drop idle under low traffic |
| HealthCheckPeriod | 30s | Detect dead connections |
| ConnectTimeout | 5s | Fail fast on network partition |

Opened from composition root when `DATABASE_URL` is set (`internal/app/app.go` → `postgres.Open(..., DefaultPoolConfig())`).

### ADR-0007 budget rule

```text
sum(API_replicas × API_MaxConns + Worker_replicas × Worker_MaxConns)
  ≤ 0.8 × postgres_max_connections
```

Reserve headroom for: migrate job, ad-hoc admin/psql, managed HA replica lag/check connections.

### Recommended staging/production split

| Role | Replicas (min) | MaxConns each | Notes |
| ---- | -------------- | ------------- | ----- |
| fersaku-api | ≥ 2 | 15–20 | HTTP + callbacks share API |
| fersaku-worker | ≥ 1 (2 preferred) | 8–12 | Outbox poll + settlement release |
| migrate job | 1 (pre-rollout) | 2–4 | Advisory lock; never concurrent with other migrate |

Example (DB max_connections=100):

- 2× API × 20 + 2× worker × 10 = 60 ≤ 80.

### Tuning procedure

1. Measure p95 wait for pool acquire and Postgres `pg_stat_activity` count under staging load.
2. If acquire wait rises while CPU free: raise MaxConns **only** if budget allows; else add replicas carefully.
3. If DB CPU/IO saturates: lower MaxConns and worker poll concurrency; do not “fix” with Redis.
4. Keep statement/transaction timeouts at the application layer for financial writes (short txs; no open txs across provider HTTP).

### Anti-patterns

- Sharing one huge MaxConns across unbounded autoscaling without recalculating the 80% budget.
- Holding a pool connection across Xendit HTTP calls.
- Nested hidden transactions (use explicit `WithTx` / UoW only).

## Redis

| Fact | Detail |
| ---- | ------ |
| Authority | **None** for money, idempotency, sessions (sessions are Postgres), outbox, ledger |
| Config | `REDIS_URL` required in production; TLS `rediss://` (config fail-closed) |
| Local | `redis://localhost:6380/0` compose |
| Current adapter | `internal/adapters/redis` Noop / health ping; queue is Postgres outbox |
| Rate limit | In-process token bucket for local/dev (`middleware/ratelimit.go`); may move to Redis later for multi-replica fairness only — never for money |

### Redis pool guidance (when a real client is wired)

- Small pool (e.g. 10–20) per process; timeouts &lt; 200ms for cache/wake.
- Circuit-break: Redis down → continue with Postgres-only paths.
- Flush/restart drill must pass: see `resilience-drills.md` drill 2.

## Worker concurrency vs pool

Worker poll loops (notifications, callbacks, seller webhooks, settlement release) must size concurrent handlers so:

```text
concurrent_handlers ≤ Worker_MaxConns - 2  (reserve for metrics/health/admin)
```

Leases in `outbox_events` / provider event rows prevent double-processing across replicas.

## Observability hooks

- `fersaku_outbox_pending`, `fersaku_outbox_oldest_age_seconds` (BE-600)
- Postgres: `pg_stat_activity` connection count by application_name
- Alert when pool exhausted (API latency spike + ready degraded)

## Related

- `baseline.md` — load targets
- ADR-0007 — topology
- `backend/docs/runbooks/queue-outbox.md`
