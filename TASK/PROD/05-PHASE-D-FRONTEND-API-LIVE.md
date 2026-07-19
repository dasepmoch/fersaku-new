# 05 — Phase D: Frontend API-live (checkout & withdraw)

**Depends on:** Phase B (payment) for checkout; Phase C for withdraw UI proof  
**UI freeze:** still on

---

## Outcomes

1. Staging/demo FE runs with `NEXT_PUBLIC_DATA_SOURCE=api` and fail-closed stage.
2. Checkout does not simulate paid; polls/server state only.
3. Seller withdrawal form talks to real APIs; errors mapped without new panels.
4. Same-origin `/v1` rewrite works from `frontend/` monorepo layout.

---

## Tasks

### PROD-D10 — FE env + domain source for staging

| Field | Value |
| ----- | ----- |
| Priority | P0 |
| Paths | `frontend/.env.example`, deploy docs, domain-source |

**Do**

1. Document required env for API-live.
2. Ensure live stage rejects mock domains (already in domain-source; verify tests).
3. Tunnel / process manager starts Next from `frontend/`.

**Acceptance**

- [ ] Written runbook snippet in evidence.
- [ ] `domain-source` unit tests still green.

---

### PROD-D20 — Checkout API path smoke (no mock paid)

| Field | Value |
| ----- | ----- |
| Priority | P0 |
| Depends | B30, D10 |

**Do**

1. Verify checkout create intent → displays QR from backend fields.
2. Status transitions only from poll/session; no client-side “mark paid”.
3. Fix mappers only if Duitku field names differ (keep UI geometry).
4. Playwright API e2e sample or manual evidence with screenshots (no secrets).

**Acceptance**

- [ ] Cannot reach success state without server PAID.
- [ ] Evidence attached.

---

### PROD-D30 — Seller withdrawal API path smoke

| Field | Value |
| ----- | ----- |
| Priority | P0 |
| Depends | C20, D10 |

**Do**

1. Quote → confirm → status list/detail.
2. Map 4xx/409/429 to existing UI states (no new error chrome unless freeze exception).
3. Bank change security lock still server-authoritative.

**Acceptance**

- [ ] Smoke evidence on staging or local API mode.

---

### PROD-D40 — Admin money surfaces sanity

| Field | Value |
| ----- | ----- |
| Priority | P1 |
| Depends | D10 |

**Do**

1. Admin payments/withdrawals/orders read paths work under admin session (no MFA).
2. Privileged commands still need reason + permission.

**Acceptance**

- [ ] Checklist of routes exercised in evidence.

---

## Phase D exit criteria

- [ ] D10–D30 done.
- [ ] FE default mock still works for prototype (`DATA_SOURCE=mock`).
