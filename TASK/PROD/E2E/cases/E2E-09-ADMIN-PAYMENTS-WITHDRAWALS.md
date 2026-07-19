# E2E-09 — Admin payments + withdrawals (browser)

| Field | Value |
|-------|--------|
| ID | E2E-09 |
| Priority | P1 |
| Type | Real browser |
| Depends | E2E-06, E2E-03 |

## Steps

1. Login admin super
2. Open `/admin/payments` — list loads; optional filter
3. Open payment detail if available for E2E-06 intent
4. Open `/admin/withdrawals` — list loads
5. Open `/admin/orders` — list loads
6. Screenshot each list

## Expected

- Pages render under admin session
- Privileged actions still require reason (do not force-fulfill unless testing that path separately)

## Fail if

- 401/403 with SUPER_ADMIN seed
- Blank error without recovery

## Evidence

`evidence/E2E-09/`
