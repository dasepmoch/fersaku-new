# E2E-11 — Session, CSRF, logout (browser)

| Field | Value |
|-------|--------|
| ID | E2E-11 |
| Priority | P1 |
| Type | Real browser |
| Depends | E2E-02 |

## Steps

1. Login seller
2. Hard refresh dashboard — still authenticated
3. Perform a safe mutation that needs CSRF (e.g. update profile name or notification toggle) after refresh
4. Logout
5. Visit `/dashboard` — redirected to login
6. Screenshot post-logout

## Expected

- CSRF works after refresh (no permanent stale block)
- Logout clears session
- No MFA anywhere

## Fail if

- Mutation 403 CSRF forever after refresh without recovery
- Dashboard accessible after logout

## Evidence

`evidence/E2E-11/`
