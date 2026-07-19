# E2E-12 — Negative auth + isolation (browser/API)

| Field | Value |
|-------|--------|
| ID | E2E-12 |
| Priority | P1 |
| Type | Browser + API |
| Depends | E2E-00 |

## Steps

1. Login with wrong password → error, no session cookie
2. Access `/dashboard` logged out → login redirect
3. Login seller A; try open seller B store resources by URL tampering if IDs known → 404/403
4. Optional API: seller A cannot list seller B products

## Expected

- Generic auth error (no user enumeration if product policy says so)
- Tenant isolation holds

## Fail if

- Wrong password still sets session
- Cross-merchant data visible

## Evidence

`evidence/E2E-12/`
