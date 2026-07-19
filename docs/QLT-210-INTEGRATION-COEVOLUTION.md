# QLT-210 — Backend integration/database tests (continuous co-evolution)

**Authority:** `TASK/07-TESTING-ROLLOUT-DOD.md` §QLT-210 · `TASK/09-EXECUTION-STATUS.md` §3.6–3.7

## Parent vs capability cells

| Level | Meaning when `[x]` |
| --- | --- |
| **Parent `QLT-210`** | Reusable tagged integration harness, required CI job, non-empty suite guards, migrate-from-empty + concurrent race foundation samples, co-evolution rule. **Not** full domain matrix. |
| **Capability cell** (`09` §3.7 column `QLT-210 DB/integration`) | Domain-specific DB/constraint/tenant/idempotency/concurrency depth for that capability before canary. |

Parent must never wait on descendant cells. Domain tasks extend `backend/test/integration/` in the **same PR** as backend behavior/schema changes.

## Continuous co-evolution rule (domain tasks)

When a domain task adds or changes schema, transactional invariants, or HTTP handlers that depend on Postgres:

1. **Migration** — `backend/migrations/NNNNNN_*.up.sql` + matching `.down.sql` (migrate role only; see `migrations/README.md`).
2. **Integration test** — extend or add `backend/test/integration/<domain>_test.go` under `//go:build integration`:
 - happy path against real DB (not sequential mocks alone);
 - constraint/unique/FK failures that must stay fail-closed;
 - cross-tenant / foreign membership → safe `404` (or documented `403`);
 - idempotency same/different body where the operation is idempotent;
 - **real concurrent** goroutines/`WaitGroup` for last-slot, first-writer-wins, or overspend races — not only serial retries;
 - rollback: domain + idempotency + outbox + audit fail together when required.
3. **CI** — suite stays non-empty (`scripts/ci-assert-suite.mjs backend-integration` / `qlt-210-integration`); do not skip under `CI`/`QLT_REQUIRE_INTEGRATION`.
4. **Secrets** — ephemeral local/compose credentials only; never invent production secrets in tests or evidence.
5. **Mark capability cell** in `09` §3.7 when domain depth is proven — leave parent alone.

## Harness locations

| Role | Path |
| --- | --- |
| Integration package | `backend/test/integration/*_test.go` |
| DB URL / CI no-skip | `foundation_test.go` → `databaseURL` |
| Migrate empty → head | `TestMigrateUpFromZero` |
| Migrate previous → head | `TestMigrateUpgradeFromSupportedPrevious` |
| Concurrent first-writer sample | `TestConcurrentIdempotencyFirstWriterWins` |
| Atomic multi-table rollback | `TestAtomicCommitRollbackOnOutboxFailure` |
| Security negatives | `security_verification_test.go` |
| Required CI job | `.github/workflows/backend-ci.yml` → `backend-integration` |
| Local full suite | `backend/Makefile` → `make test-integration` |
| Local foundation smoke | `make test-integration-foundation` |
| Non-empty guards | `scripts/ci-assert-suite.mjs` (`backend-integration`, `qlt-210-integration`) |
| Zero-test guard | `scripts/ci-assert-go-tests.sh` |

## Local / CI recipe (repeatable)

```bash
# Disposable deps (host ports match Makefile defaults)
cd backend && make compose-deps
export DATABASE_URL='postgres://fersaku:fersaku_local@localhost:5433/fersaku?sslmode=disable'
export APP_ENV=test
export QLT_REQUIRE_INTEGRATION=1
make migrate
make test-integration-foundation # parent smoke
make test-integration # full tagged suite
```

CI: Postgres service + `sh scripts/migrate.sh up` + `go test -tags=integration` via `ci-assert-go-tests.sh` (fails if zero packages / skip-pass).

## Acceptance (parent only)

- Tagged integration is a **required** CI job and is repeatable from clean checkout + disposable Postgres.
- Suite cannot pass empty or with `DATABASE_URL` missing under `CI`/`QLT_REQUIRE_INTEGRATION`.
- Foundation proves migrate-from-empty, upgrade-from-previous, concurrent idempotency, and atomic rollback.
- Domain matrix cells in §3.7 remain separate work; parent `[x]` does **not** complete every coverage bullet in `07` §QLT-210.
