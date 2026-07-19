# QLT-410 — Database/API deploy and rollback (expand-contract co-evolution)

**Authority:** `TASK/07-TESTING-ROLLOUT-DOD.md` §QLT-410 · `TASK/09-EXECUTION-STATUS.md` §3.6–3.7

## Parent vs capability cells

| Level | Meaning when `[x]` |
| --- | --- |
| **Parent `QLT-410`** | Expand-contract steps + hard rules registered; required non-empty samples (migrate scripts/docs, canary-rollback, topology migrate/rolling, backup-restore, foundation migrate tests); parent assert + CI suite `qlt-410-deploy`; continuous co-evolution rule. **Not** full staging rolling deploy/rollback rehearsal results or §3.7 `QLT-410 rollback` cells. |
| **Capability cell** (`09` §3.7 column `QLT-410 rollback`) | Domain/migration-specific expand-contract + rollback proof when that capability changes schema/API and before canary. |

Parent must never wait on descendant cells. Changed migration/domain tasks claim a matching §3.7 cell; they do not re-open parent harness unless the framework itself regresses.

**Do not invent** production rollback drill results, live canary LB weights, or full staging traffic/callback/worker rehearsal outcomes. Those are cell/ops work when claimed.

## Expand-contract steps (parent registration)

| Step | Action | Parent sample anchors |
| --- | --- | --- |
| **1. Expand schema/API** | Add backward-compatible columns/tables/indexes/endpoint fields only | `backend/migrations/README.md` (migrate vs app role); `backend/scripts/migrate.sh` |
| **2. Dual-write / dual-read backend** | Deploy backend that writes/reads compatible forms (old + new) | Topology: migrate job pre-rollout, then rolling API/worker (`backend/docs/launch/topology.md`) |
| **3. Backfill** | Bounded, observable backfill job; no unbounded exclusive locks without rehearsal | Integration migrate path samples; ops lock/load rehearsal is cell/ops |
| **4. Consumer roll** | Deploy frontend/consumer using new contract only after BE compatible | Canary/rollback: image roll, not schema down (`backend/docs/launch/canary-rollback.md`) |
| **5. Contract** | Observe; remove old compatibility only after rollback window | Restore point / version capture: `backup-restore-integrity.md` + migrate version |

## Hard rules (parent registration)

| Rule | Parent stance |
| --- | --- |
| **No FE rollback via destructive migrate down** | Never tie frontend rollback to `migrate down` that drops columns/tables. FE/API rollback = previous **immutable image digest** + flags only. |
| **Rolling compatibility window** | Old backend/worker must remain compatible across the rolling window; document dual-compatible schema and outbox/API order. |
| **Worker/API deploy order** | Migrate job (advisory lock, once) → rolling API → worker (or dual-compatible simultaneous). Outbox schema compatibility required across versions. |
| **Long index/backfill** | Long `CREATE INDEX` / backfill lock/load must be rehearsed before production; parent registers the requirement; results are cells/ops. |
| **Checksum / restore point** | Capture migration version/checksum and restore point before risky expand; see backup-restore runbook. |
| **Callbacks accepted** | Provider callbacks remain accepted during deploy/rollback; dual-compatible webhook handlers; prefer full API roll only when callback path is dual-compatible. |
| **Idempotency / state machines** | Idempotency results and state-machine semantics stay stable across versions (foundation samples under QLT-210). |
| **Immutable digests** | Prior FE/BE image digests available for rollback; do not rebuild “same tag” as rollback. |
| **Money facts are not rolled back** | Rollback does **not** undo committed order/payment/ledger; it changes **code/flags only**. Forward-fix schema if needed. |

## Continuous co-evolution rule (domain / migration tasks)

When a domain task adds or changes SQL migrations, OpenAPI fields, workers/outbox payloads, or deploy readiness:

1. **Expand first** — additive, backward-compatible DDL/API only in the same release train as dual-compatible readers/writers.
2. **No destructive down for FE** — never require `migrate down` to roll back UI; use previous image digests + domain flags (QLT-400).
3. **Same PR / same slice** — document dual-read/write and deploy order; include or extend integration migrate coverage for the changed domain (QLT-210 cell).
4. **Callbacks** — webhook/outbox handlers accept both old and new payload shapes during the window.
5. **Restore point** — note migration version and backup/PITR restore point in change evidence when schema is risky.
6. **CI** — keep `scripts/ci-assert-suite.mjs qlt-410-deploy` green.
7. **Mark capability cell** in `09` §3.7 when domain expand-contract + rollback path is proven — leave parent alone.

## Harness locations

| Role | Path |
| --- | --- |
| Co-evolution rule (this doc) | `docs/QLT-410-DEPLOY-ROLLBACK-COEVOLUTION.md` |
| Parent framework assert (unit/fs) | `tests/unit/qlt-410-parent-framework.test.ts` |
| Migrate vs app role | `backend/migrations/README.md` |
| Migrate runner | `backend/scripts/migrate.sh` |
| Canary + image rollback | `backend/docs/launch/canary-rollback.md` |
| Executable release contract | `backend/docs/launch/release-deployment.md`, `scripts/release/*`, `release/schema/release-manifest.schema.json` |
| Topology (migrate job, rolling) | `backend/docs/launch/topology.md` |
| Backup / restore point | `backend/docs/runbooks/backup-restore-integrity.md` |
| Foundation migrate tests (QLT-210) | `backend/test/integration/foundation_test.go` |
| Parent CI suite id | `scripts/ci-assert-suite.mjs` → `qlt-410-deploy` |
| npm assert | `package.json` → `ci:assert:deploy` |
| Frontend CI step | `.github/workflows/ci.yml` → `frontend-static` (assert suites) |

## Local / CI recipe (repeatable)

```bash
# Parent suite guards (no stack / no production drill required)
node scripts/ci-assert-suite.mjs qlt-410-deploy

# FE parent unit assert
./node_modules/.bin/vitest run tests/unit/qlt-410-parent-framework.test.ts

# Optional: foundation migrate samples when DATABASE_URL available (QLT-210)
# cd backend && go test -tags=integration ./test/integration/ -run 'TestMigrate'
```

## Acceptance (parent only)

- Expand-contract steps and hard rules above are registered in this doc and enforced by parent assert + `qlt-410-deploy` suite.
- Required samples remain non-empty: migrations README + migrate.sh; canary-rollback; topology migrate/rolling; backup-restore; foundation migrate tests.
- CI fails if parent samples or co-evolution doc regress.
- Domain matrix cells in §3.7 and full staging deploy/rollback rehearsal remain separate work; parent `[x]` does **not** complete every §3.7 QLT-410 cell or invent production drill results.
