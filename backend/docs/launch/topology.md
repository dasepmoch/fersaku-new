# BE-630 Production HA topology

**Authority:** ADR-0007, BE-620 pool-tuning / horizontal-scaling, BE-630 
**Runtime class:** Managed container service (ECS/Cloud Run equivalent) **or** existing Kubernetes — **not** Docker Compose as production.

Compose remains **local/dev only**. Staging may use a multi-replica compose overlay for rehearsal (`docker-compose.staging.yml`) without changing local defaults.

---

## 1. Approved component topology

```text
 ┌─────────────────────────┐
 Clients / Xendit │ Ingress / LB (TLS) │
 callbacks │ trust proxy CIDRs only │
 └───────────┬─────────────┘
 │
 ┌─────────────────┴─────────────────┐
 │ │
 ┌────────▼────────┐ ┌────────▼────────┐
 │ fersaku-api × N │ N ≥ 2 │ fersaku-api × N │
 │ (stateless) │ no sticky │ + callbacks │
 └────────┬────────┘ └────────┬────────┘
 │ │
 └─────────────────┬─────────────────┘
 │
 ┌──────────────────────┼──────────────────────┐
 │ │ │
┌────────▼────────┐ ┌─────────▼─────────┐ ┌───────▼────────┐
│ PostgreSQL HA │ │ Redis (TLS/auth) │ │ R2 private/ │
│ + PITR │ │ non-authoritative │ │ public buckets │
└────────▲────────┘ └───────────────────┘ └────────────────┘
 │
┌────────┴────────┐ ┌───────────────────┐
│ fersaku-worker │ │ Mail provider │
│ × M (≥1, 2 pref)│ │ (SMTP) │
└─────────────────┘ └───────────────────┘

Pre-rollout (once): migrate job (advisory lock) → then rolling API/worker
```

| Component | Min | Notes |
| --------- | --- | ----- |
| Ingress/LB | 1 managed | TLS; request ID; Xendit → API only |
| `fersaku-api` | **≥ 2** | Live traffic + callbacks; any replica |
| `fersaku-worker` | **≥ 1** (2 preferred) | Outbox, settlement, webhooks, notifications |
| PostgreSQL | Managed HA + PITR | Env-separated DBs |
| Redis | Managed | Wake/cache only; flush-safe |
| R2 | Private default | Env-separated credentials |
| Mail | Provider SMTP | Local: Mailpit |
| Migrate job | 1 pre-rollout | Never concurrent with another migrate |

---

## 2. Ingress and proxy trust

| Rule | Detail |
| ---- | ------ |
| TLS | Terminated at LB; app may speak plain HTTP inside VPC |
| Trusted proxies | Set `TRUSTED_PROXY_CIDRS` (comma-separated LB CIDRs) or explicit `TRUSTED_PROXY_MODE=direct`. Wired via `RouterDeps.TrustedProxies` from config. Empty CIDRs on staging/production fail closed unless mode=direct. |
| Client IP | From `X-Forwarded-For` **only** when peer is trusted |
| Request ID | Preserve inbound `X-Request-ID` or generate; return on response |
| Sticky sessions | **Forbidden** — sessions in Postgres |
| Callback route | `POST /v1/webhooks/xendit` on API service behind same LB |
| Admin/metrics | Restrict `/metrics` and admin paths at network/WAF where possible |

### Local / tunnel note

Local API: host `:18080`. Optional Cloudflare tunnel (`cloudflared-fersaku` → `fersaku.net`) is edge routing for dev/staging demos — **not** a substitute for production HA multi-replica API.

---

## 3. Resource and connection budgets

Full detail: `docs/performance/pool-tuning.md`.

### ADR-0007 budget

```text
sum(API_replicas × API_MaxConns + Worker_replicas × Worker_MaxConns)
 ≤ 0.8 × postgres_max_connections
```

Reserve ~20% for migrate, admin, HA health, PITR tooling.

### Launch defaults (example DB max_connections=100)

| Role | Replicas | MaxConns each | Subtotal |
| ---- | -------- | ------------- | -------- |
| API | 2 | 20 | 40 |
| Worker | 2 | 10 | 20 |
| Migrate job | 1 (pre-rollout only) | 4 | 4 |
| **Total** | | | **64 ≤ 80** |

### Process resources (staging-measured; adjust)

| Service | CPU request/limit | Memory request/limit |
| ------- | ----------------- | -------------------- |
| API | 0.25 / 1.0 | 256Mi / 512Mi |
| Worker | 0.25 / 1.0 | 256Mi / 512Mi |

Autoscale:

- **API:** p95 latency + RPS (not CPU alone). 
- **Worker:** oldest outbox age / pending depth. 
- Recalculate pool budget whenever replica count changes.

### Worker concurrency

```text
concurrent_handlers ≤ Worker_MaxConns - 2
```

Financial jobs use DB leases; no in-memory queue for money.

---

## 4. Migration lock

| Step | Policy |
| ---- | ------ |
| Who | Dedicated **migrate** identity (not app role) — see `migrations/README.md` |
| When | **Before** API/worker image rollout |
| How | Single job: `./scripts/migrate.sh up` (golang-migrate advisory lock) |
| Concurrency | Never two migrate jobs; API/worker must not auto-migrate on boot |
| Failure | Abort deploy; do not roll API to schema-dependent code until migrate succeeds |
| Rollback schema | Prefer forward-compatible migrations; down only with eng approval |

---

## 5. Drain / rolling deploy / autoscaling

Aligned with ADR-0007 deploy section and BE-620 horizontal-scaling.

### Rolling deploy order

1. Run migrate job to target version. 
2. Start new API tasks/pods; wait health `/health/live` + `/health/ready`. 
3. Drain old API: stop new HTTP, allow in-flight ≤ `SHUTDOWN_TIMEOUT_SEC`. 
4. Roll workers: stop dequeue (SIGTERM), finish leased outbox work, release leases. 
5. Keep **≥ 1 healthy API** receiving Xendit callbacks at all times (prefer ≥ 2). 
6. Verify synthetic_health + key metrics (callback reject rate, outbox lag, payment_paid).

### Drain checklist

- [ ] HTTP graceful shutdown 
- [ ] Worker stops claiming new outbox rows 
- [ ] In-flight provider HTTP not abandoned mid-double-write (short txs) 
- [ ] Leases expire so peer workers reclaim 
- [ ] Callback path remains available on remaining API replicas 

### Autoscaling policy

| Signal | Scale API | Scale worker |
| ------ | --------- | ------------ |
| p95 latency / RPS | up | — |
| CPU alone | soft signal only | soft |
| Outbox oldest age | — | up |
| Pending outbox depth | — | up |
| DB connection saturation | down or freeze | down |

Never scale past pool budget without raising DB max_connections first.

---

## 6. How local compose maps to staging (without breaking local)

| Concern | Local (`docker-compose.yml`) | Staging rehearsal |
| ------- | ---------------------------- | ----------------- |
| API | 1 container, host 18080 | Prefer ≥2 replicas (`docker-compose.staging.yml` scale) |
| Worker | 1 | ≥1–2 |
| Postgres/Redis/MinIO/Mailpit | Single containers | Same images OK for rehearsal; prod uses managed |
| Xendit | `fake` | `fake` or sandbox live keys |
| Topology claim | Dev only | Staging may approximate HA; **production is managed HA** |

Commands:

```bash
# Local (unchanged)
docker compose up -d

# Staging-shaped multi-api (optional; does not replace production)
docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d --scale api=2 --scale worker=2
```

---

## 7. Failure-domain notes (callbacks)

- Xendit callbacks hit the **API** fleet only. 
- Loss of all workers delays settlement/webhooks/email but must not drop callback acceptance (202 + durable event). 
- Loss of one API AZ: remaining replica continues callbacks (requires N≥2). 
- See `xendit-callback-failure-domain.md` for test plan + local proof.

---

## 8. Dual-provider callbacks (PROD-A30)

Payment and disbursement use **separate** providers (ADR-0008). HTTP surface (target):

| Method | Path | Owner |
| ------ | ---- | ----- |
| POST | `/v1/webhooks/duitku` | Duitku payment (primary) |
| POST | `/v1/webhooks/duitku/sandbox` | Duitku payment (sandbox) |
| POST | `/v1/webhooks/duitku/live` | Duitku payment (live) |
| POST | `/v1/webhooks/xendit/disbursement` | Xendit disbursement |
| POST | `/v1/webhooks/xendit` | Legacy Xendit **payment** — no new traffic after cutover |

Public staging/demo callback base (this host tunnel): `https://api.fersaku.net` + path above.

**Host tunnel table, FE monorepo path, and ingress checklist:**  
`TASK/PROD/evidence/PROD-A30/topology.md`  
(Architecture authority: `TASK/PROD/01-PROVIDER-ARCHITECTURE.md` §4.)

Tunnel remains **dev/staging demo edge only** — not production HA (see §1–§2).

---

## 9. References

- `docs/adr/ADR-0007-production-runtime-topology.md` 
- `docs/adr/ADR-0008-duitku-payment-xendit-disbursement.md` 
- `docs/performance/pool-tuning.md` 
- `docs/performance/horizontal-scaling.md` 
- `docs/performance/resilience-drills.md` 
- `docs/slo.md` 
- `TASK/PROD/evidence/PROD-A30/topology.md` 
