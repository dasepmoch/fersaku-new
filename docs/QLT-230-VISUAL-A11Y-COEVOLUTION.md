# QLT-230 — Visual, responsive, accessibility, interaction parity (continuous co-evolution)

**Authority:** `TASK/07-TESTING-ROLLOUT-DOD.md` §QLT-230 · `TASK/09-EXECUTION-STATUS.md` §3.6–3.7 
**UI freeze:** `TASK/00-UI-FREEZE-CONTRACT.md` · UI-000/050/060 evidence

## Parent vs capability cells

| Level | Meaning when `[x]` |
| --- | --- |
| **Parent `QLT-230`** | Mock visual + a11y + interaction harness registered, required non-empty samples, desktop/mobile projects, committed baselines, baseline-update review process, parent assert suite, CI required via `frontend-mock-e2e`, co-evolution rule for domain visual/a11y (including API-state). **Not** full domain matrix or every §QLT-230 bullet. |
| **Capability cell** (`09` §3.7 column `QLT-230 visual/a11y`) | Domain-specific mock and/or API-state visual/a11y/interaction depth for that capability before canary. |

Parent must never wait on descendant cells. Domain tasks extend routes/specs/baselines in the **same PR** as wiring that touches user-visible presentation.

## Required parent samples (must stay)

| Role | Path |
| --- | --- |
| Mock Playwright config | `playwright.config.ts` (`desktop-chromium`, `mobile-chromium`, `testIgnore **/api/**`) |
| Visual characterization | `tests/e2e/visual.spec.ts` |
| Accessibility smoke (axe) | `tests/e2e/accessibility.spec.ts` |
| Interaction characterization | `tests/e2e/critical-flows.spec.ts` |
| Route smoke | `tests/e2e/smoke.spec.ts` |
| Route lists | `tests/e2e/routes.ts` (`visualRoutes`, `smokeRoutes`) |
| Deterministic fixtures | `tests/e2e/fixtures.ts` |
| Committed baselines | `tests/e2e/__screenshots__/{desktop,mobile}-chromium/*.png` |
| Parent framework asserts | `tests/e2e/qlt-230-parent-framework.spec.ts` |
| Responsive/a11y invariants | `TASK/evidence/UI-060/invariants.md` |
| Required CI job | `.github/workflows/ci.yml` → `frontend-mock-e2e` |
| Non-empty guards | `scripts/ci-assert-suite.mjs` (`frontend-mock-e2e`, `qlt-230-visual-a11y`) |

Mock suite command: `npm run test:e2e` (smoke / critical / a11y / visual on desktop + mobile).

## Baseline update review process (hard rule)

Visual baselines are **characterization contracts**, not free-form screenshots.

1. **Never** update `__screenshots__` inside a domain wiring PR to "make green."
2. Unexpected pixel diff → investigate wiring/CSS/font/env; fix product or isolate env drift.
3. Intentional baseline change requires a **separate reviewed PR** (or explicit UX/QA approval label) that:
 - lists every changed PNG and route;
 - states why geometry/content changed (approved UI-080 exception or intentional freeze delta);
 - includes before/after review notes;
 - does not mix unrelated route rewrites.
4. Env/font/renderer drift (~1–3%) is **not** fixed by silent bulk `--update-snapshots` in product PRs; re-characterize only under UX/QA ownership.
5. CI rule (QLT-100/105): visual baseline update needs separate review; integration PR cannot silently change it.

## Continuous co-evolution rule (domain tasks)

When a domain task ships or changes a **user-visible** route/control/state:

### Mock mode (always, when UI freeze applies)

1. **Smoke** — route remains in or is added to `smokeRoutes` if it is a launch surface.
2. **Visual** — high-risk / frozen routes: ensure coverage in `visualRoutes` + matching desktop **and** mobile baselines; no silent baseline rewrite.
3. **A11y** — extend `accessibility.spec.ts` (or domain describe) for touched high-risk surfaces; zero new serious/critical axe (contrast debt remains documented exception).
4. **Interaction** — critical flows that the domain owns stay green in `critical-flows.spec.ts` (or focused sibling) under mock mode.
5. **Lifecycle** — loading/empty/error/long-data must not force layout redesign (UI-050/060); characterize only when already in suite or approved.
6. **Mark capability cell** in `09` §3.7 when domain visual/a11y depth is proven — leave parent alone.

### API-state visual / a11y parity (domain cells only)

API-seeded visual and a11y **are not claimed by parent alone**. Claiming live visual/a11y for a capability requires:

| Prerequisite | Why |
| --- | --- |
| **QLT-110** | Deterministic nonprod seed / personas for stable content |
| **QLT-215** | Disposable API-mode Playwright harness |
| **Domain task** | Live FE↔BE path actually wired |
| **Normalized view** | Seed/data chosen so layout is comparable to mock characterization (not a redesign) |

Rules for API visual/a11y cells:

1. Prefer **semantic + interaction + axe** parity first; pixel baselines against API only when seed is normalized and env is locked.
2. Do **not** overwrite mock `__screenshots__` with API-mode captures; keep mock baselines authoritative for freeze.
3. If API visual baselines are introduced later, store under a **distinct** path/project (never mix with mock `__screenshots__/desktop-chromium` without explicit UX review).
4. API mode must not use fake timers/success that greenwash interaction parity (see QLT-220 no-mock-network policy).
5. Same PR as domain live wiring: extend cells + evidence; do not wait for a global parent reopen.

## Responsive / a11y / interaction parent policy

| Area | Parent guarantee | Domain expands |
| --- | --- | --- |
| Responsive | Desktop + mobile projects always run mock visual/a11y/smoke/critical | Extra breakpoints only if product already defines them |
| Visual | ≥14 mock routes × 2 viewports with committed PNGs | Touched high-risk routes |
| A11y | Axe suite on representative routes; block serious/critical | Auth/checkout/dialog/secret/error API states |
| Interaction | Mock critical-flows sample (checkout, storefront, pagination, menus, …) | API-mode equivalent asserts (QLT-220 cells + this column) |

## Local / CI recipe

```bash
# Non-empty harness (no browser)
node scripts/ci-assert-suite.mjs frontend-mock-e2e
node scripts/ci-assert-suite.mjs qlt-230-visual-a11y

# Parent framework asserts (mock Playwright; needs app on :3100 or webServer)
npx playwright test tests/e2e/qlt-230-parent-framework.spec.ts

# Full mock matrix (CI job frontend-mock-e2e)
npm run test:e2e

# Targeted
npm run test:e2e:a11y
npm run test:e2e:visual
```

## Acceptance (parent only)

- Mock visual + a11y suites required, non-empty, desktop/mobile registered.
- Baselines committed for every `visualRoutes` entry on both projects.
- Baseline updates follow explicit review process (documented above).
- API-state visual/a11y co-evolution rule documented; depends on QLT-110/215/domain when claiming live visual.
- Parent `[x]` does **not** complete every visual/a11y/interaction bullet in `07` §QLT-230 or §3.7 cells.
