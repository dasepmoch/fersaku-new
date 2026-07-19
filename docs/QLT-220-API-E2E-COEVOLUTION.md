# QLT-220 — Cross-stack API-mode Playwright (continuous co-evolution)

**Authority:** `TASK/07-TESTING-ROLLOUT-DOD.md` §QLT-220 · `TASK/09-EXECUTION-STATUS.md` §3.6–3.7

## Parent vs capability cells

| Level | Meaning when `[x]` |
| --- | --- |
| **Parent `QLT-220`** | Distinct mock vs API Playwright registration, disposable stack + seed, real auth helpers (ephemeral cookies only), parent assert suite, required CI job, co-evolution rule. **Not** full public/buyer/seller/admin domain matrix. |
| **Capability cell** (`09` §3.7 column `QLT-220 API E2E`) | Domain-specific API-mode E2E depth for that capability before canary. |

Parent must never wait on descendant cells. Domain tasks add specs under `tests/e2e/api/` in the **same PR** as FE↔BE live behavior.

## Distinct Playwright projects (registration)

| Mode | Config | Projects | testDir / ignore |
| --- | --- | --- | --- |
| **Mock** | `playwright.config.ts` | `desktop-chromium`, `mobile-chromium` | `tests/e2e` · **ignores** `**/api/**` |
| **API** | `playwright.api.config.ts` | `api-desktop-chromium` | `tests/e2e/api` only |

- Mock suite: `npm run test:e2e` (smoke / critical / a11y / visual).
- API suite: `npm run test:e2e:api` after stack (`npm run test:e2e:api:stack` or CI `e2e-api-stack.sh`).
- Never merge API specs into mock projects; never run mock commerce fixtures under API mode.

## Continuous co-evolution rule (domain tasks)

When a domain task ships or changes a live user-visible FE↔BE path:

1. **Spec** — add or extend `tests/e2e/api/<domain>-*.spec.ts` (or a focused describe in an existing domain file).
2. **Auth** — use `tests/e2e/api/helpers/auth.ts` real login/session helpers; **no** hardcoded production cookies; storage state only under gitignored `test-results/api/.auth/` (ephemeral).
3. **Seed** — QLT-110 personas/IDs only (`helpers/seed.ts` / `seed-ids.json`); do not invent a second seed command.
4. **No mock network** — API mode must not call mock simulator / fixture HTTP endpoints; assert backend status + user-visible state.
5. **Secrets** — never write security codes (unused), raw magic tokens, webhook tokens, or session secrets into traces/annotations; use `maskToken` / sanitized summaries.
6. **Negatives** — prefer first-class 401/403/CSRF/foreign-tenant cases alongside happy path.
7. **CI** — suite stays non-empty (`scripts/ci-assert-suite.mjs cross-stack-api-e2e` / `qlt-220-api-e2e`); job remains required.
8. **Mark capability cell** in `09` §3.7 when domain depth is proven — leave parent alone.

## Required parent samples (must stay)

| Role | Path |
| --- | --- |
| Harness health (stack vs product) | `tests/e2e/api/harness-health.spec.ts` |
| First vertical slice | `tests/e2e/api/int-190-vertical-slice.spec.ts` |
| Parent framework asserts | `tests/e2e/api/qlt-220-parent-framework.spec.ts` |
| Auth (real API flow) | `tests/e2e/api/helpers/auth.ts` |
| Stack orchestration | `scripts/e2e-api-stack.sh` |
| API Playwright config | `playwright.api.config.ts` |
| Mock Playwright config | `playwright.config.ts` (`testIgnore: **/api/**`) |
| Required CI job | `.github/workflows/ci.yml` → `cross-stack-api-e2e` |
| Non-empty guards | `scripts/ci-assert-suite.mjs` (`cross-stack-api-e2e`, `qlt-220-api-e2e`) |

## Local / CI recipe (repeatable)

```bash
# Disposable deps + migrate + QLT-110 seed + api/worker
npm run test:e2e:api:stack

# API-mode suite (Next webServer DATA_SOURCE=api; no mock projects)
npm run test:e2e:api

# Backend-only probes (no Next edge)
E2E_API_SKIP_WEBSERVER=1 E2E_API_HAS_NEXT=0 \
 PLAYWRIGHT_API_BASE_URL=http://127.0.0.1:18080 npm run test:e2e:api

# Parent suite guards (no stack required)
node scripts/ci-assert-suite.mjs cross-stack-api-e2e
node scripts/ci-assert-suite.mjs qlt-220-api-e2e
```

CI: compose stack → migrate/seed → `playwright test -c playwright.api.config.ts` (artifacts on failure only).

## Auth + artefacts policy

- Login via real `POST /v1/auth/login` (and optional UI form when testing shells).
- Session files: cookie + CSRF only; path under `test-results/api/.auth/` (gitignored via `/test-results`).
- Traces/screenshots/video: `retain-on-failure` / `only-on-failure`; do not attach raw tokens.
- Teardown: logout when practical; delete ephemeral storage state after suite/worker.

## Acceptance (parent only)

- Mock and API Playwright projects are distinct and registered; API suite cannot pass empty.
- API mode has no network request to mock simulator/fixture endpoints (parent probe + domain rule).
- Auth uses real UI/API flow; state files are ephemeral cookies only.
- INT-190 + harness-health remain required samples.
- Domain matrix cells in §3.7 remain separate work; parent `[x]` does **not** complete every public/buyer/seller/admin bullet in `07` §QLT-220.
