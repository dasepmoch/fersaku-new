# UI-090 — Per-PR no-UI-change review checklist

**Authority:** `TASK/00-UI-FREEZE-CONTRACT.md` §UI-090 
**Use:** Every wiring PR and agent handoff. Paste into PR body or link this path.

Related evidence:

- Freeze scope: `TASK/evidence/UI-010/`
- Wiring-only policy: `TASK/evidence/UI-020/wiring-only-policy.md`
- Component reuse: `TASK/evidence/UI-030/component-reuse-registry.md`
- DTO parity: `TASK/evidence/UI-040/dto-view-parity.md`
- Lifecycle map: `TASK/evidence/UI-050/lifecycle-state-map.md`
- Responsive/a11y/motion: `TASK/evidence/UI-060/invariants.md`
- Visual-risk files: `TASK/evidence/UI-070/visual-risk-files.md`
- Exceptions: `TASK/evidence/UI-080/exception-register.md`

---

## PR metadata

| Field | Value |
| --- | --- |
| PR / branch | |
| Task ID(s) | |
| Actor | |
| Surfaces/routes touched | |
| Mock mode verified | Y/N |
| API mode verified (if claimed) | Y/N / n/a |

---

## A. Freeze (hard fail if unchecked)

- [ ] No frozen route/layout/style/icon change
- [ ] No static product copy change (labels, placeholders, headings, CTA, empty/error/loading text)
- [ ] Dynamic authoritative values / security redaction / documented mock-label removal only where 00/10 allow
- [ ] Any other copy or geometry change has **UI-080 approval** and is a separate slice
- [ ] Screenshot baselines **not** updated (`tests/e2e/__screenshots__/**`)
- [ ] No duplicate visual component or live-only screen fork

## B. Architecture

- [ ] Transport DTO mapped at feature boundary → existing view model → existing props
- [ ] Presentation does **not** import fixture/mock on API path, raw backend DTO, or endpoint URL
- [ ] Source from typed registry (when available); no ad-hoc env reads in screens
- [ ] No mock fallback after API failure

## C. Lifecycle (existing surfaces only)

- [ ] Loading uses existing skeleton/route loading
- [ ] Empty uses existing empty composition **or** documented invariant/UI-080 — no fake rows
- [ ] Error/retry uses existing boundary/inline error
- [ ] 401 → clear private cache + existing login
- [ ] 403 → AdminPermissionBoundary or safe-404/UXE — not silent auth redirect
- [ ] 404 → `notFound()` / existing not-found only for true absence
- [ ] Mutation pending disables existing CTA; no double-submit
- [ ] Success only after authoritative response

## D. Visual-risk file review

- [ ] `git diff --stat` attached
- [ ] Every path matching `TASK/evidence/UI-070/visual-risk-files.md` listed below
- [ ] For each visual-risk file: one-line reason render remains identical

| Visual-risk path | Why output identical |
| --- | --- |
| | |

## E. Verification

- [ ] Unit/mapper/contract tests for changed adapters pass
- [ ] Mock smoke still passes for touched routes (or failure pre-existing & noted)
- [ ] A11y suite still passes for covered routes (serious/critical)
- [ ] Visual suite: no snapshot update; any fail is env drift or real regression (call out)
- [ ] Keyboard/focus checks for dialogs/pending/errors touched
- [ ] Negative auth/tenant/CSRF/idempotency as required by task risk

## F. Exception / disposition

- [ ] No new UI exception implemented without UI-080 approval row
- [ ] New no-op/active control discovered → row added to TASK/10 inventory before enabling surface
- [ ] Decision rows (`IMPLEMENT`/`DISABLED`/`STATIC`/…) updated if disposition changed

## G. Reviewer sign-off

| Role | Name | Date | Result |
| --- | --- | --- | --- |
| Implementer | | | |
| Reviewer | | | pass / request changes |

**Definition of done (UI freeze):** same mock fixture → pixel-equivalent; API security-equivalent fixture → same tree/class/geometry; no new Tailwind primitives for wiring; network/security states use existing patterns; product owner needs no new UI training for live backend.
