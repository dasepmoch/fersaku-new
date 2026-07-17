# Resilience drills (BE-620)

Executable script: `backend/scripts/resilience_drills.sh`.

Financial truth is **Postgres**. Redis and process memory are non-authoritative. After every failure injection, balances, payment status, and unique financial side effects must remain correct.

## Prerequisites

- Local compose (or staging) with Postgres healthy.
- Optional: API on `BASE_URL` (default `http://127.0.0.1:18080`), Redis on host `6380`, worker container name from compose.
- Go: `$HOME/.local/go/bin/go` preferred.
- `DATABASE_URL` for integration tests (Makefile default host port 5433).

```bash
cd backend
export DATABASE_URL="${DATABASE_URL:-postgres://fersaku:fersaku_local@localhost:5433/fersaku?sslmode=disable}"
export BASE_URL="${BASE_URL:-http://127.0.0.1:18080}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6380/0}"
```

## How to run

```bash
# Dry-run: print steps + invariants, no destructive actions
./scripts/resilience_drills.sh --dry-run

# Local compose: worker restart + Redis FLUSHDB + health + integration subset
./scripts/resilience_drills.sh --local

# Full: local drills + go unit tests + concurrent integration suite
./scripts/resilience_drills.sh --full
```

Exit 0 only if all selected steps pass.

## Drills

### 1. Worker restart while outbox pending

**Inject:** stop worker process/container while `outbox_events` has `pending`/`processing` rows; start worker again.

**Expected:**

- Rows remain in Postgres (not lost).
- Expired leases reclaimed; handlers re-run idempotently.
- No double ledger post / double settlement for already-processed work.
- Metrics: `fersaku_outbox_pending` eventually declines; oldest age recovers under SLO.

**Evidence:** script inserts or detects pending outbox; restarts compose worker; re-checks status counts.

### 2. Redis flush / restart (non-authority)

**Inject:** `FLUSHDB` on local Redis DB (or restart redis container).

**Expected:**

- API `/health/live` stays 200; ready may degrade briefly if ready checks Redis, then recovers.
- No change to `merchant_balances`, `payment_intents.status`, `ledger_journals` counts.
- Outbox continues to process via Postgres poll.

**Evidence:** script snapshots balance/intent counts (or schema existence), flushes Redis, re-checks equality.

### 3. Provider timeout simulation (fake Xendit)

**Inject:** unit/integration path with `xendit.Fake.ForceTimeoutCreate` / `ForceTimeoutDisburse` (already used in BE-310/350 tests).

**Expected:**

- Create timeout after send → `UNKNOWN_OUTCOME` / no double provider create on safe retry.
- Disburse timeout → reserve held; no second payout; no premature reserve release.
- Money never credited twice.

**Evidence:** `go test` filters for timeout/unknown-outcome tests; script runs them under `--full`.

### 4. Concurrent payment / callback idempotency smoke

**Inject:** 80 parallel identical paid webhooks; concurrent checkout/withdrawal races.

**Expected financial invariants:**

| Invariant | Check |
| --------- | ----- |
| One provider event per canonical key | `COUNT(*) = 1` on four-part key |
| One settlement / paid effect per intent | settlement count = 1; status PAID once |
| Ledger capture once | journal idempotency key unique |
| Balance non-negative | `available_idr >= 0` etc. |
| Concurrent withdrawal | cannot overspend available |

**Evidence:** integration tests:

- `TestCallback_DuplicatePaid_SingleEffect`
- `TestConcurrentIdempotencyFirstWriterWins`
- `TestConcurrentWithdrawalsCannotOverspend`
- Provider timeout withdrawal tests

## Financial invariants (must hold after all drills)

1. **Exactly-once money effects** under duplicate callbacks and restarts (unique constraints + UoW).
2. **Redis is not a source of truth** — flush never invents or deletes ledger rows.
3. **Worker crash safety** — leases expire; reprocessing is idempotent.
4. **Provider timeout** — no double disbursement / no silent free money.
5. **Horizontal workers** — two workers cannot both complete the same outbox row successfully twice.

## Staging evidence log

Record for each drill (date, env, operator, pass/fail):

| Drill | Date | Env | Result | Notes |
| ----- | ---- | --- | ------ | ----- |
| Worker restart | 2026-07-17 | local compose | scripted | see `tmp/resilience-drills/` report |
| Redis flush | 2026-07-17 | local compose | scripted | non-authority |
| Provider timeout | 2026-07-17 | go test | suite | fake Xendit |
| Concurrent idempotency | 2026-07-17 | integration | suite | 80× callback |

## Related runbooks

- `backend/docs/runbooks/queue-outbox.md`
- `backend/docs/runbooks/callback-failure.md`
- `backend/docs/slo.md`
