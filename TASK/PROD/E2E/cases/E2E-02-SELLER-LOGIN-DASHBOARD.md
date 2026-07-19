# E2E-02 — Seller login + dashboard (browser)

| Field | Value |
|-------|--------|
| ID | E2E-02 |
| Priority | P0 |
| Type | Real browser |
| Depends | E2E-00 |

## Credentials (nonprod seed only)

- Email: `seller.owner.a@seed.fersaku.test`
- Password: `TestSeed1!`
- **No MFA**

## Steps

1. Open `/login` (or seller login route used by app)
2. Submit email + password
3. Land on seller dashboard (`/dashboard` or equivalent)
4. Hard refresh — session still valid
5. Open at least: products list, orders list, withdrawals page (navigation only)
6. Screenshot dashboard after login

## Expected

- Login success without MFA challenge
- Dashboard loads data or empty states (not mock-only fake names if api mode)
- Session cookie present (httpOnly) after login
- CSRF available for later mutations

## Fail if

- MFA required
- Redirect loop
- Dashboard stuck loading > 30s
- Wrong surface (buyer/admin)

## Evidence

`evidence/E2E-02/` — screenshots + note of final URL
