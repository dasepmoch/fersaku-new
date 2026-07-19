# PROD-F40 — Sandbox canary (Duitku payment + Xendit disbursement)

| Field | Value |
| ----- | ----- |
| Task | PROD-F40 |
| Date | 2026-07-19 |
| Executor | @nikki/opencode |
| Mode | **sandbox / local dry-run** — **not** live money canary |
| Status | executed agent-safe portions; live money **blocked** (owner GO → G40) |

## Scope adaptation (vs BE-630 live canary)

| Original (live) | This run |
| --------------- | -------- |
| Production LB weight | N/A |
| Live Xendit / bank | **not** executed |
| Duitku sandbox QRIS pay | **not** claimed PAID (B50 residual) |
| Local health + synthetic + rollback docs | **executed / dry-run** |

## Preconditions checked

- [x] Local compose API healthy (`:18080`)
- [x] Postgres `:5433` up
- [x] Public `https://fersaku.net` + `https://api.fersaku.net/v1/status` reachable
- [ ] Deployed API image includes Duitku webhook routes (**no** — POST `/v1/webhooks/duitku` → 404 on current image)
- [ ] Owner GO for live money (**no**)

## Executed steps (this session)

### 1. Health + metrics sample

```text
BASE_URL=http://127.0.0.1:18080
pre_live=200
pre_ready=200
pre_metrics=200
remote_status=200 (~98ms)
remote_fe=200 (~149ms)
```

`scripts/synthetic_health.sh` → **OK** (live, ready, metrics, invalid callback token 401, status, mailpit).

### 2. Provider path health (no money)

| Check | Result |
| ----- | ------ |
| Xendit webhook missing token | 401 fail-closed |
| Xendit disbursement oversize | 413 |
| Duitku webhook on running image | 404 (image lag) |
| Unit Duitku/Xendit security matrix | PASS (E20) |

### 3. Rollback dry-run (documented, not force-recreate)

**Did not** `docker compose up --force-recreate` (shared host; avoid disrupting other agents).

Documented rollback (from `backend/docs/launch/canary-rollback.md`, adapted):

1. Pin previous immutable image tag on API (+ worker if rolled).
2. Env flip if needed: `PAYMENT_PROVIDER` / `DISBURSEMENT_PROVIDER` only with known-good values (duitku|fake / xendit|fake) — no multi-provider failover UI.
3. Confirm `/health/ready` 200 + `synthetic_health.sh`.
4. Do **not** auto-down migrate.
5. Money invariant break → freeze withdrawals (owner/eng).

Compose files present: `backend/docker-compose.yml`, `docker-compose.staging.yml`.

### 4. Metrics watch list (sandbox)

| Signal | This run |
| ------ | -------- |
| `/health/ready` | 200 |
| HTTP 5xx on health/status | none observed |
| Callback reject (invalid token) | expected 401 |
| Ledger/payment paid live | **not measured** (no PAID canary) |

## Explicit non-claims

- **No** live QRIS settlement / ledger credit claimed.
- **No** live Xendit disbursement to bank.
- **No** production canary weight / G40.

## Next for full sandbox canary (human + rebuild)

1. Rebuild/redeploy `fersaku-api:local` with B10–B40 dual-provider.
2. Sandbox Duitku create → pay or signed callback → single ledger credit (close B50).
3. Optional sandbox disbursement with test keys (owner).
4. Record success/latency/errors then sign.

## Sign-off

| Role | Name | Timestamp UTC |
| ---- | ---- | ------------- |
| Agent executor (dry-run only) | @nikki/opencode | 2026-07-19T06:50Z |
| Owner live money | — | **required for G40** |

## Secrets check

- [x] no keys, tokens, or account numbers
