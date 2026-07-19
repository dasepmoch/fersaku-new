# UI-020 — Wiring-only change policy

**Authority:** `TASK/00-UI-FREEZE-CONTRACT.md` §UI-020 
**Freeze scope:** `TASK/evidence/UI-010/` 
**PR continuous checklist:** `TASK/evidence/UI-090/pr-no-ui-change-checklist.md`

## 1. Allowed non-visual change classes

| Class | Examples | Guardrail |
| --- | --- | --- |
| Data source swap | mock → source-neutral hook/API adapter | Same view model to existing props |
| Transport layer | DTO types, Zod/runtime schemas, mappers, query keys, mutations | No export of transport DTO into JSX |
| Session / tenant providers | session bootstrap, store context, CSRF recovery plumbing | Invisible to layout geometry |
| Event / state binding | handlers, `disabled`, `aria-busy` on **existing** elements | Must match already visualized behavior |
| Lifecycle binding | wire existing skeleton/error/modal/toast/status to network | No new spinner/card/empty art |
| Presentation hygiene | move fixture imports out of screens into `api`/`mock` adapters | Screens stay presentation-only |
| Invisible boundaries | auth/route guards, SSR prefetch, hydration, request ID, redacted telemetry | No new visible copy |
| Internal fallbacks | non-user-visible error normalization | Never mock fallback in API mode |
| Test IDs | `data-testid` only if a11y/styling unaffected | Prefer role/name selectors |
| Composition adapters | pure functions returning **exact** existing component props | No parallel “live” components |

## 2. Explicitly forbidden (requires UI-080 if product insists)

- New components, screens, route files, or “live-only” visual forks
- New Tailwind styling / design tokens / icons for wiring convenience
- New cards, rows, badges, columns, pagination, empty illustrations to surface extra backend fields
- Changing static product copy, labels, placeholders, CTA text
- Updating screenshot baselines to hide diffs
- Mapping unknown/backend failure to success or mock data in API mode
- Silent UI redesign “while we are here”

## 3. Backend fields without a UI slot

1. Keep field on transport/domain contract, **or**
2. Drop/ignore explicitly in mapper with test, **or**
3. File `UI-080` if product requires a new visible surface

Do **not** invent presentation to “show everything the API returns.”

## 4. PR review checklist (wiring-only)

Copy into PR description or attach this file.

### Scope

- [ ] Diff is limited to allowed classes above (or justified invisible helper)
- [ ] No files under frozen globs in `TASK/evidence/UI-010/frozen-scope.json` change geometry/class/copy
- [ ] If a visual-risk file is touched (`UI-070`), reviewer explains render identity

### Architecture

- [ ] Screen/component has no endpoint URL, raw transport DTO, or fixture import on API path
- [ ] Mapper/schema lives at feature boundary; props match existing view model
- [ ] Source comes from typed registry (`INT-025` when present); no ad-hoc `isLiveApi()` in screens
- [ ] No mock fallback after API error

### Lifecycle / security

- [ ] Loading/empty/error/401/403/404/pending/success use existing surfaces (`UI-050`)
- [ ] Mutations: no double-submit; success only after authoritative response
- [ ] Secrets/PII not logged, not in URL, not in long-lived client cache

### Verification

- [ ] Relevant unit/contract tests pass
- [ ] Mock smoke (and a11y if route covered) still pass
- [ ] Visual suite not “fixed” via snapshot update
- [ ] `git diff --stat` attached; visual-risk paths listed

## 5. Lightweight guard (docs only)

No product CI script added in this task (overkill for Phase 0 docs). Agents/reviewers:

1. Diff path set against `frozen-scope.json` globs
2. Run `UI-090` checklist
3. Prefer wiring in `features/**/{api,hooks,schemas,mappers,transport,mock,data}/**` and `shared/api/**`

Optional future (QLT lane): path-based PR labeler — out of scope for UI-020 code changes.
