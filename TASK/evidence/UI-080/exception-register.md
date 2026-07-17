# UI-080 — Controlled UI exception register (process + open set)

**Authority:** `TASK/00-UI-FREEZE-CONTRACT.md` §UI-080  
**Aligned with:** `TASK/10-ROUTE-AND-CONTROL-DISPOSITION.md` §6 (UXE rows)  
**Reuse registry:** `TASK/evidence/UI-030/component-reuse-registry.md`

This register tracks **process** and the current open exception **candidates**.  
**UXE rows are not product-owner approvals to redesign.** They record gaps where API truth needs a state not fully represented by an existing surface.

## 1. Protocol (mandatory)

If backend requirements cannot be expressed with existing components:

1. **Stop** UI changes in the wiring task.
2. Document: requirement, missing state, risk if hidden, existing components evaluated.
3. Open a **separate** proposal with desktop+mobile screenshots/wireframe.
4. Obtain **explicit product-owner approval**.
5. Implement as a **separate reviewed slice** from data wiring; extend existing primitives—no new visual language.
6. Security never waived for freeze: if step-up/prompt is missing, **disable/block** the action and escalate here.

### Auth composition default (no new routes)

| Ceremony | Ownership route | Compose with |
| --- | --- | --- |
| Seller verify / reset / merchant invite / seller MFA | `/login` | `AuthShell`, `AuthForm`, existing controls |
| Admin invite / admin MFA | `/admin/login` | `AdminLogin` geometry / approved composition |
| Buyer magic-link consume | `/account/verify` | Existing verify page / safe `NotFound` |

New auth routes require a filled exception row + approval.

## 2. Exception record template

```md
### UXE-XXX — <short title>

| Field | Value |
| --- | --- |
| Status | `open` \| `blocked-pending-approval` \| `approved` \| `implemented` \| `rejected` \| `superseded` |
| Route / state | exact path + network state |
| Why mapper/hook cannot solve | |
| Existing components considered | paths from UI-030 |
| Desktop/mobile characterization | evidence paths (before change) |
| A11y / focus impact | |
| Product approval | name + date (required before implement) |
| Owner | agent/team |
| Implementing task | separate from wiring |
| Rollback | |
| Linked disposition | TASK/10 §6 row |
```

## 3. Open register (zero **approved** UI exceptions)

As of **2026-07-17**, there are **zero product-approved UI redesign exceptions**.  
The following are **pre-catalogued gaps** from disposition matrix §6 — resolution is composition/invariant/disable, not automatic UI work:

| ID | Situation (summary) | Default under freeze | Status |
| --- | --- | --- | --- |
| `UXE-001` | Challenge routes verify/reset/invite/MFA | Compose on existing auth routes only | Constraint (pre-authorized composition) — not a redesign approval |
| `UXE-002` | Buyer lacks route-level loading/error/empty | BuyerShell/cards; keep previous data | **open** — BUY tasks; UI change needs approval |
| `UXE-003` | Checkout conflict/expired/unavailable gaps | Reuse checkout pieces; never map to paid | **open** — CHK tasks |
| `UXE-004` | Domain `disabled` user-visible behavior | Existing error/disabled control only | **open** — INT-025/QLT-400 |
| `UXE-005` | Visible request ID / support ref | Reporter/log only by default | **open** — visible copy needs approval |
| `UXE-006` | Numbered pagination vs cursor backend | Keep `TablePagination`; NumberedPageList adapter | Process constraint — INT-020 |
| `UXE-007` | Static/no-op marketing controls | Same element static behavior or disabled | **open** — PUB-230 |
| `UXE-008` | Onboarding outside workspace boundaries | Form state / root error; no maintenance banner | **open** — SEL-110 |
| `UXE-009` | Public home/store empty arrays | Non-empty launch invariant or approved composition | **open** — product/UX decision |
| `UXE-010` | Contact form missing error/pending regions | Disable submit or approved composition | **open** — PUB-200 |
| `UXE-011` | Auth negative/MFA/rate/unavailable gaps; AdminLogin mock | Block canary or approved composition | **open** — AUT/ADM |
| `UXE-012` | Seller product/review/inventory empty | Launch invariant or approved composition | **open** — SEL-210/240/270 |

### Approved implementation queue

| ID | Approved by | Date | Implementing task | Evidence |
| --- | --- | --- | --- | --- |
| — | — | — | — | **Empty — zero approved exceptions** |

## 4. How agents use this register

1. Before inventing UI: search this file + TASK/10 §6 + UI-030 registry.
2. Prefer: mapper fix, disable control, safe-404, launch invariant, existing composition.
3. If still blocked: add/update UXE row status to `blocked-pending-approval`, link wiring task evidence, **do not** ship redesign in the same PR.
4. After product approval: set status `approved`, implement in a dedicated PR, then `implemented` with visual/a11y evidence (new characterization allowed only for the approved delta—not silent baseline rewrites of unrelated routes).

## 5. Linkage

- Continuous PR gate: `TASK/evidence/UI-090/pr-no-ui-change-checklist.md`
- Freeze scope: `TASK/evidence/UI-010/`
- Canonical narrative register remains in `TASK/10-ROUTE-AND-CONTROL-DISPOSITION.md` §6; this file is the **execution evidence + empty approval queue** for UI-080.
