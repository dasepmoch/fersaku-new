# UI-060 — Responsive / a11y / motion invariants

**Authority:** `TASK/00-UI-FREEZE-CONTRACT.md` §UI-060 
**Suites:** `tests/e2e/accessibility.spec.ts`, `tests/e2e/visual.spec.ts`, `tests/e2e/smoke.spec.ts` 
**Baseline:** `TASK/evidence/UI-000/`

Wiring must preserve these invariants. Do not “fix” a11y/visual by redesign or snapshot update.

## 1. Responsive breakpoints

| Invariant | Source | Wiring rule |
| --- | --- | --- |
| Desktop + mobile characterization | Playwright projects `desktop-chromium` (Desktop Chrome) + `mobile-chromium` (Pixel 7) in `playwright.config.ts` | Every wired route still passes both projects for smoke/visual/a11y coverage that includes it |
| Visual full-page geometry | `tests/e2e/visual.spec.ts` — `fullPage: true`, 14 `visualRoutes` | Same hierarchy/class/geometry at both viewports; long/empty/error data must not force width changes |
| CSS mobile rules | `app/globals.css` `@media (max-width: 639px)` / `640px` | Do not alter breakpoint thresholds or stacking for data binding |
| Layout shift | UI-060 contract | No CLS from late data: reserve existing skeleton footprint; background refresh keeps previous data |

## 2. Accessibility (a11y)

| Invariant | Source | Wiring rule |
| --- | --- | --- |
| No serious/critical axe violations on covered routes | `tests/e2e/accessibility.spec.ts` | Routes: `/`, `/checkout/prod_01`, `/account/security`, `/dashboard`, `/dashboard/storefront`, `/admin`, `/admin/merchants` × desktop+mobile |
| Color-contrast debt | Suite disables `color-contrast` intentionally | Do not redesign contrast in wiring; documented UI debt |
| Focus management | Contract UI-060 | Focus still moves to existing dialog/success/error per current behavior |
| Pending CTAs | Contract UI-060 | Use existing `aria-busy`/status patterns; no new visible pending copy |
| Field errors | Contract UI-060 | Wire validation to existing inputs/ARIA associations only |
| Keyboard order / focus ring | UI-010 freeze | Do not reorder tab stops or restyle rings for “improvements” |
| Permission / dialog | Admin `ControlDialog`, `AdminPermissionBoundary` | Preserve keyboard escape/confirm patterns already in components |

## 3. Motion / animation

| Invariant | Source | Wiring rule |
| --- | --- | --- |
| Visual tests disable animations | `visual.spec.ts` `animations: "disabled"`, `caret: "hide"` | Snapshot stability ≠ permission to change runtime motion |
| Runtime classes | `app/globals.css` `.animate-rise`, `.animate-rise-2`, `.animate-rise-3`, `.animate-float`, `.animate-pulse-soft` | Do not change timing/easing/delays visible to users |
| Reduced motion | `@media (prefers-reduced-motion: reduce)` in `app/globals.css` | Keep global reduce rule; do not add competing long animations |
| Loading pulse | Seller `loading.tsx` uses `animate-pulse` | Keep footprint; do not swap for new spinners |
| Polling | Contract UI-060 | One in-flight poll; stop when hidden/unmounted/terminal; no live-region spam |

## 4. Content length / unknown data

| Invariant | Wiring rule |
| --- | --- |
| Long strings | Map/truncate via existing primitives only; no wider tables/cards |
| Zero / empty | Existing empty composition or launch invariant / UI-080 — never inject fake rows |
| Unknown enum | Fail closed or map to existing safe status — never invent badge styles |
| Seeded API visual | When API parity tests exist, cover long/empty/error fixtures, not only short happy path |

## 5. Theme

| Invariant | Wiring rule |
| --- | --- |
| Light/dark via `components/theme-provider.tsx` | Do not change theme tokens or toggle behavior for wiring |
| Surface colors in shells | Bind data only; keep hairline/card tokens from `shared/ui/styles.ts` |

## 6. Verification commands (preserve, don’t baseline-update)

```bash
# mock mode characterization (see UI-000 port helper if needed)
npx playwright test tests/e2e/smoke.spec.ts
npx playwright test tests/e2e/accessibility.spec.ts
npx playwright test tests/e2e/visual.spec.ts
# NEVER: playwright test --update-snapshots for integration fixes
```

UI-000 evidence: smoke 156 pass, a11y 14 pass, visual 28 fail env drift — failures are **not** license to update snapshots during wiring.

## 7. Agent checklist (per wired route)

- [ ] Desktop + mobile smoke path still navigable
- [ ] No layout jump on first paint vs refresh
- [ ] Axe serious/critical still clean on covered routes
- [ ] Focus/dialog/pending still keyboard operable
- [ ] Motion timing unchanged; reduced-motion still honored
- [ ] Long/unknown data does not expand frozen geometry
