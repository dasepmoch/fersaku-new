# Redis runbook (KEY-12)

## 1. Role of Redis in Fersaku

| Use | Authoritative? |
|-----|----------------|
| Rate-limit / abuse counters | No — safety net; fail open/closed per middleware design |
| Cache / wake | No |
| Sessions | **No** — sessions live in **Postgres** |

Flushing Redis must not destroy money state or login identity (re-login OK).

## 2. Production target

| Requirement | Detail |
|-------------|--------|
| Managed Redis 7+ | ElastiCache / Memorystore / equiv |
| TLS | required — production config rejects non-TLS Redis URL |
| Auth | password/ACL via SM in `REDIS_URL` |
| Persistence | AOF or provider managed persistence for rate-limit continuity preferred |
| Network | private VPC only |

## 3. Local verify (this host)

| Check | Result 2026-07-19 |
|-------|-------------------|
| `PING` | PONG |
| `appendonly` | **yes** |
| AOF enabled | `aof_enabled:1` |
| RDB policy | `save 3600 1 300 100 60 10000` |
| Unit: production rejects non-TLS Redis | **PASS** |

Compose: `redis:7-alpine` with `--appendonly yes` (local only).

## 4. Staging boot checklist

```text
[ ] REDIS_URL=rediss://:****@managed-host:6379/0  (TLS scheme)
[ ] From API pod: redis-cli --tls PING
[ ] /health/ready 200
[ ] Login + CSRF mutation still works after Redis restart (session in PG)
[ ] Rate-limit still returns 429 under abuse test (E30)
```

## 5. Failure modes

| Failure | Expected app behavior |
|---------|----------------------|
| Redis down | API may degrade rate-limit; **must not** lose money/ledger |
| Redis flush | Sessions still in PG; caches cold |
| Wrong REDIS_URL | Fail boot on staging/prod validate |

## 6. Acceptance

| Item | Local | Managed |
|------|-------|---------|
| AOF/persistence documented | **done** | ops |
| TLS required in prod config | **unit PASS** | ops inject |
| Staging boot with managed Redis | — | **ops** |
