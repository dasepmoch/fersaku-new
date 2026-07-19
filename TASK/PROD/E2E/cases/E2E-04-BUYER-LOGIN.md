# E2E-04 — Buyer login (browser)

| Field | Value |
|-------|--------|
| ID | E2E-04 |
| Priority | P0 |
| Type | Real browser |
| Depends | E2E-00 |

## Credentials

- Email: `buyer.a@seed.fersaku.test`
- Password: `TestSeed1!` (if password path enabled)
- Or magic-link path if UI only offers passwordless — document which path works

## Steps

1. Open buyer login (`/account/login` or app equivalent)
2. Complete login (password or magic-link request + note if token needs mailpit)
3. Open purchases / account area
4. Screenshot

## Expected

- Buyer surface only
- No MFA
- If magic-link only: evidence of request accepted + mailpit capture if available (`:8025`)

## Fail if

- Seller/admin session created
- Uncaught error

## Evidence

`evidence/E2E-04/`
