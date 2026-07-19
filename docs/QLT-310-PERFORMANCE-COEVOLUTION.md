# QLT-310 — Performance and “smooth” behavior budget (continuous co-evolution)

**Authority:** `TASK/07-TESTING-ROLLOUT-DOD.md` §QLT-310 · `TASK/09-EXECUTION-STATUS.md` §3.6–3.7

## Parent vs capability cells

| Level | Meaning when `[x]` |
| --- | --- |
| **Parent `QLT-310`** | Performance/smoothness **categories registered**, required non-empty samples (bundle budget, query policy, checkout poll no-overlap, timeouts), parent assert + CI suite `qlt-310-performance`, continuous co-evolution rule. **Not** every FE interaction / BE budget / UX smoothness bullet or §3.7 cell. |
| **Capability cell** (`09` §3.7 column `QLT-310 performance`) | Domain-specific SLOs, load evidence, and interaction depth for that capability before canary. |

Parent must never wait on descendant cells. Domain tasks expand budgets and smoothness guards in the **same PR** as performance-sensitive FE/BE changes.

## Categories (parent registration)

These three categories are the durable taxonomy. Parent harness only requires **at least one non-empty sample per required anchor** — not exhaustive coverage of every bullet in `07` §QLT-310.

| Category | Scope (examples; cells expand) | Parent sample anchors |
| --- | --- | --- |
| **FE interaction guards** | Search debounce 250–400 ms + cancel prior request; no overlapping checkout polls; bounded visible poll / reduced hidden; keepPrevious on background refetch; exact cache invalidation; list page server limit (no fetch-all); upload progress/cancel; charts bounded series; private SSR no shared cache / no independent waterfalls; timeout per operation class | `shared/query/query-policy.ts`, `shared/query/mutation-policy.ts`, `shared/query/QUERY-MUTATION-POLICY.md`, `tests/unit/int-160-query-mutation.test.ts`, `features/commerce/checkout/poll.ts`, `tests/unit/chk-120-checkout-poll.test.ts`, `shared/api/http-client.ts`, `tests/unit/http-client.test.ts`, `scripts/check-bundle-budget.mjs` |
| **BE budget categories** | SLO per read/write/payment/callback (p50/p95/p99); explain plans/indexes for seller/admin filters/cursor; N+1 / query-count tests; connection pool budgets; load tests (checkout create/status/callback, lists, notifications, webhook worker); backpressure / readiness / load shedding | Parent registers category + co-evolution only. **Do not invent load-test results.** Domain cells own measured SLOs and load evidence when claimed. |
| **UX smoothness policy** | No mock→real flash; no stale tenant/actor row; filter race cannot revert UI; button locks only relevant operation and recovers on error; poll/upload timers abort on unmount; layout/scroll/focus stable on background updates | Anchored by query keepPrevious + poll abort + pending dedupe samples; domain UI cells expand |

**Parent claim boundary:** registering categories + keeping sample files non-empty + CI guard green. Completing every row above for every capability is **§3.7 cell** work.

## Continuous co-evolution rule (domain tasks)

When a domain task adds or changes interactive lists, checkout/payment polls, heavy uploads, charts, private SSR fetches, or hot API paths:

1. **Guards in the same PR** — extend FE unit and/or BE integration/load harness; do not ship unbounded poll, fetch-all, or indiscriminate timeouts for P0 hot paths.
2. **Pick the category** — map the change to FE interaction / BE budget / UX smoothness and document in evidence if non-obvious.
3. **FE unit** — prefer pure helpers (`tests/unit/*`): debounce bounds, single-flight poll, keepPrevious, exact invalidation, timeout class, pending dedupe.
4. **Bundle** — production build remains gated by `scripts/check-bundle-budget.mjs` / `npm run check:bundle` (frontend-build job).
5. **BE budgets** — when claiming a capability cell, record measured p50/p95 (or load harness path) for the domain hot path; **never invent** load-test numbers or production SLOs that were not run.
6. **Domain SLOs co-evolve** — each capability cell in §3.7 owns its read/write/payment/callback budgets; parent only defines the taxonomy and sample anchors.
7. **CI** — keep `scripts/ci-assert-suite.mjs qlt-310-performance` green; do not skip frontend-build bundle budget under CI.
8. **Mark capability cell** in `09` §3.7 when domain performance depth is proven — leave parent alone.

## Harness locations

| Role | Path |
| --- | --- |
| Co-evolution rule (this doc) | `docs/QLT-310-PERFORMANCE-COEVOLUTION.md` |
| Parent framework assert (unit/fs) | `tests/unit/qlt-310-parent-framework.test.ts` |
| Bundle budget script | `scripts/check-bundle-budget.mjs` |
| Query / keepPrevious / exact invalidation | `shared/query/query-policy.ts`, `tests/unit/int-160-query-mutation.test.ts` |
| Mutation pending / no auto-retry | `shared/query/mutation-policy.ts` |
| Policy narrative | `shared/query/QUERY-MUTATION-POLICY.md` |
| Checkout poll no-overlap | `features/commerce/checkout/poll.ts`, `tests/unit/chk-120-checkout-poll.test.ts` |
| HTTP timeouts | `shared/api/http-client.ts`, `tests/unit/http-client.test.ts` |
| Parent CI suite id | `scripts/ci-assert-suite.mjs` → `qlt-310-performance` |
| npm assert | `package.json` → `ci:assert:performance` |
| Frontend CI step | `.github/workflows/ci.yml` → `frontend-static` (assert suites) + `frontend-build` (bundle) |

## Local / CI recipe (repeatable)

```bash
# Parent suite guards (no stack required)
node scripts/ci-assert-suite.mjs qlt-310-performance

# FE unit samples (performance/smoothness-related)
./node_modules/.bin/vitest run \
 tests/unit/qlt-310-parent-framework.test.ts \
 tests/unit/int-160-query-mutation.test.ts \
 tests/unit/chk-120-checkout-poll.test.ts \
 tests/unit/http-client.test.ts

# Bundle budget (after production build)
npm run build
npm run check:bundle
```

## Acceptance (parent only)

- Three categories (FE interaction guards, BE budget categories, UX smoothness policy) are registered in this doc and enforced by parent assert + `qlt-310-performance` suite.
- Required samples remain non-empty and referenced: bundle budget, query policy, checkout poll no-overlap, timeouts.
- CI fails if parent samples or co-evolution doc regress (empty suite / missing markers).
- No invented load-test results; domain SLOs co-evolve via §3.7 cells.
- Domain matrix cells in §3.7 remain separate work; parent `[x]` does **not** complete every FE/BE/UX bullet in `07` §QLT-310.
