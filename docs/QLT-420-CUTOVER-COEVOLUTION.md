# QLT-420 — Safe cutover and post-cutover mock cleanup (continuous co-evolution)

**Authority:** `TASK/07-TESTING-ROLLOUT-DOD.md` §QLT-420 · `TASK/09-EXECUTION-STATUS.md` §3.6–3.7 · §5 G0..G8

## Parent vs capability cells / gates

| Level | Meaning when `[x]` |
| --- | --- |
| **Parent `QLT-420`** | Cutover checklist categories + post-cutover cleanup rules registered; required non-empty samples (readiness, canary-rollback, e2e-acceptance, architecture mock ban, domain-source live rejection); parent assert + CI suite `qlt-420-cutover`; continuous co-evolution rule. **Not** G0..G8 green, live canary done, full-cutover stage, or every domain cell. |
| **G0..G8 / full-cutover / §3.7 cells** | Ops and domain evidence when launch domains are actually cut over; parent never marks them green. |

Parent must never wait on descendant cells or invent go-live results. Domain tasks claim selected quality cells and stage rows; they do not re-open parent harness unless the cutover framework itself regresses.

**Do not invent** live canary percentages, production cutover timestamps, G0..G8 completion, or mock-tree deletion that has not happened. Those are ops/cell work when claimed.

## Cutover checklist categories (parent registration)

| Category | Scope | Parent sample anchors |
| --- | --- | --- |
| **G0..G8 master gates** | All master gates green before full cutover claim | Gate list lives in `09` §5; parent only registers the requirement — gates remain `[ ]` until ops evidence |
| **On-call / dashboards / alerts / credentials / backup** | On-call, dashboards, alerts, provider credentials/mode, backup/PITR verified | `backend/docs/launch/readiness-checklist.md` (alerts, secrets, owner-sign); QLT-320 samples |
| **Health / readiness / synthetic** | Real health/readiness green; synthetic checkout/auth/notification/withdrawal-safe tests | Readiness + `e2e-acceptance.md` gate commands; synthetic health in launch docs |
| **Flags / canary / rollback commands** | Feature flags, canary cohort, rollback commands documented | `backend/docs/launch/canary-rollback.md`; QLT-400 domain-flags |
| **Release bundling** | No high-risk migration or unrelated UI release bundled with cutover | Co-evolution rule + QLT-410 expand-contract |
| **Owner communication** | Product/support/finance/security informed; request ID / runbook process | Readiness owner-sign rows + runbook process |

## Post-cutover cleanup rules (parent registration)

| Rule | Parent stance |
| --- | --- |
| **Compatibility aliases** | Remove obsolete API compatibility aliases only after usage zero and deprecation window. |
| **Architecture mock ban** | Tighten architecture test: API-mode presentation cannot import mock/demo IDs/local authority. Sample: `tests/unit/architecture-boundaries.test.ts`. |
| **Mock only nonprod** | Retain mock mode only as explicit prototype/test adapter; tree/path must never be selected live. Production/live rejects mock via domain-source. |
| **Truthful docs** | Update stale root/backend README and progress docs to truthful state after observation window. |
| **Archive rollout flags** | Archive rollout flags after all clients stable; retain emergency business switches (QLT-400 kill). |
| **Retention / secrets** | Review cache/log/telemetry retention; delete test artefacts/secrets from non-ephemeral stores. |
| **Global DATA_SOURCE deprecation** | After all domains are API-stable, deprecate/remove bootstrap-only `NEXT_PUBLIC_DATA_SOURCE` as a rollout mechanism; typed registry remains authority (INT-025 / QLT-400). |

## Continuous co-evolution rule (domain / cutover tasks)

When a domain task approaches activation, full-cutover stage, or post-stability cleanup:

1. **Gates first** — do not claim full cutover until selected G0..G8 and per-domain QLT cells for that surface are evidenced (parent does not invent them).
2. **No live mock** — production/live must never select mock business data; residual mock → `disabled` (domain-source + architecture boundaries).
3. **Same PR / same slice** — when removing mock imports from API presentation or archiving a domain flag, keep architecture-boundaries and domain-source asserts green.
4. **Rollback documented** — cutover PR/evidence links canary-rollback commands and previous immutable image digests (QLT-410).
5. **Observation window** — cleanup (alias removal, flag archive, doc truth-up) only after the documented observation window; do not delete emergency kill switches.
6. **CI** — keep `scripts/ci-assert-suite.mjs qlt-420-cutover` green.
7. **Mark cells/stages** in `09` when domain cutover or G-gate is proven — leave parent alone.

## Harness locations

| Role | Path |
| --- | --- |
| Co-evolution rule (this doc) | `docs/QLT-420-CUTOVER-COEVOLUTION.md` |
| Parent framework assert (unit/fs) | `tests/unit/qlt-420-parent-framework.test.ts` |
| Readiness checklist | `backend/docs/launch/readiness-checklist.md` |
| Canary + rollback | `backend/docs/launch/canary-rollback.md` |
| E2E acceptance matrix | `backend/docs/launch/e2e-acceptance.md` |
| Architecture (API no mock) | `tests/unit/architecture-boundaries.test.ts` |
| Domain-source live mock rejection | `shared/data/domain-source.ts` + `tests/unit/domain-source.test.ts` |
| Parent CI suite id | `scripts/ci-assert-suite.mjs` → `qlt-420-cutover` |
| npm assert | `package.json` → `ci:assert:cutover` |
| Frontend CI step | `.github/workflows/ci.yml` → `frontend-static` (assert suites) |

## Local / CI recipe (repeatable)

```bash
# Parent suite guards (no stack / no production cutover required)
node scripts/ci-assert-suite.mjs qlt-420-cutover

# FE parent unit assert
./node_modules/.bin/vitest run tests/unit/qlt-420-parent-framework.test.ts
```

## Acceptance (parent only)

- Cutover checklist categories and post-cutover cleanup rules above are registered in this doc and enforced by parent assert + `qlt-420-cutover` suite.
- Required samples remain non-empty: readiness-checklist; canary-rollback; e2e-acceptance; architecture-boundaries; domain-source production mock rejection.
- CI fails if parent samples or co-evolution doc regress.
- G0..G8, live canary, full-cutover stage, and §3.7 cells remain separate work; parent `[x]` does **not** mark them green or invent cutover/go-live results.
