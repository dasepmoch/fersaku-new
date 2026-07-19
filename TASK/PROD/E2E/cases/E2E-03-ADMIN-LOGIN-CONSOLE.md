# E2E-03 — Admin login + console (browser)

| Field | Value |
|-------|--------|
| ID | E2E-03 |
| Priority | P0 |
| Type | Real browser |
| Depends | E2E-00 |

## Credentials

- Email: `admin.super@seed.fersaku.test`
- Password: `TestSeed1!`
- **No MFA**

## Steps

1. Open `/admin/login`
2. Login
3. Open `/admin` (or admin home)
4. Navigate to payments, withdrawals, orders (read-only smoke)
5. Screenshot admin home

## Expected

- Login without MFA
- Admin chrome loads (graphite console)
- Money list pages render (may be empty or seeded rows)

## Fail if

- MFA gate
- 403 after valid SUPER_ADMIN seed
- Seller dashboard shown instead

## Evidence

`evidence/E2E-03/`
