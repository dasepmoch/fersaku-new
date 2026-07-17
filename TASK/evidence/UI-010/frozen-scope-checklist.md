# UI-010 — Frozen visual scope (enforceable checklist)

**Authority:** `TASK/00-UI-FREEZE-CONTRACT.md` §UI-010  
**Machine-readable path globs:** [`frozen-scope.json`](./frozen-scope.json)  
**Baseline evidence:** `TASK/evidence/UI-000/`

Use this checklist on every wiring PR. Any intentional violation requires `UI-080` (separate slice).

## A. Route & ownership (frozen)

- [ ] No change to URL path, route folder, route group, or `page.tsx` ownership
- [ ] No change to layout hierarchy (`app/**/layout.tsx`) or route group nesting
- [ ] No new `page.tsx` / `layout.tsx` / `loading.tsx` / `error.tsx` / `not-found.tsx` without `UI-080`
- [ ] Auth ceremony stays on existing ownership: `/login`, `/admin/login`, `/account/verify` (compose state; do not add routes)

## B. Layout geometry (frozen)

- [ ] Section order and visual DOM composition unchanged
- [ ] Grid / flex behavior, width / height, spacing, gap, padding, margin unchanged
- [ ] Breakpoints, mobile/desktop stacking, sticky, overflow, scroll behavior unchanged
- [ ] Table columns, modal/drawer style, pagination style, form density, button hierarchy unchanged

## C. Visual design tokens (frozen)

- [ ] Font family / size / weight / line-height unchanged
- [ ] Color, gradient, border, radius, shadow, opacity unchanged
- [ ] Icon set, icon size/position, illustration/product art unchanged
- [ ] Light/dark theme behavior unchanged
- [ ] Visible transition/animation/timing unchanged
- [ ] No new Tailwind utility classes introduced solely for wiring aesthetics

## D. Copy & static product text (frozen)

- [ ] Static product copy, labels, placeholders, headings, CTA text, status/empty/error/loading copy unchanged
- [ ] Dynamic authoritative values (name, amount, status, date, count, masked id) may differ per backend
- [ ] Mock/fake secret/fake success literals must be mode-gated or removed in API mode (security > pixel fake)
- [ ] New wording/product flow without existing variant → `UI-080`

## E. A11y semantics already correct (frozen)

- [ ] Focus ring, keyboard order, ARIA labels/semantics already correct stay unchanged
- [ ] Do not “improve” a11y by redesign; only bind existing ARIA hooks (`aria-busy`, field errors)

## F. Screenshot baselines (frozen)

- [ ] `tests/e2e/__screenshots__/**` never updated as part of integration
- [ ] Visual suite may fail on env drift (see UI-000); do not “fix” by snapshot update
- [ ] Mock mode must remain pixel-identical to approved baseline geometry
- [ ] API mode with security-equivalent fixtures: same hierarchy/class/geometry; dynamic truth may differ

## G. Content rules (not freeze of false data)

| Mode | Layout/class/geometry | Dynamic values | Fake mock/secret/success |
| --- | --- | --- | --- |
| `mock` | Pixel-identical to baseline | Fixture values | Allowed only as prototype |
| `api` + security-equivalent fixture | Structural/geometry parity | Backend truth | Forbidden as live authority |

## H. Frozen path classes (summary)

| Class | Paths (see `frozen-scope.json`) |
| --- | --- |
| App Router surfaces | `app/**/page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx` |
| Global style | `app/globals.css`, PostCSS/font config |
| Shared presentation | `components/**/*.tsx`, `shared/ui/**/*` |
| Feature presentation | `features/**/screens/**`, `features/**/components/**`, `features/admin/ui/**`, `features/seller/ui/**`, `features/seller/storefront/**`, `features/commerce/checkout/**` |
| Baselines | `tests/e2e/__screenshots__/**` |

## I. Preferred wiring locations (not frozen presentation)

`features/**/api.ts`, `hooks.ts`, `schemas.ts`, `mappers.ts`, `transport.ts`, `mock.ts`, `data/**`, `shared/api/**`, providers, backend.

## Enforcement linkage

- Registry row: `TASK/09-EXECUTION-STATUS.md` → `UI-010`
- Continuous review: `TASK/evidence/UI-090/pr-no-ui-change-checklist.md`
- Visual-risk file list: `TASK/evidence/UI-070/visual-risk-files.md`
- Exception process: `TASK/evidence/UI-080/exception-register.md` + `TASK/10-ROUTE-AND-CONTROL-DISPOSITION.md` §6
