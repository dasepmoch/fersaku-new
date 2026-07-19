# E2E-10 — Seller products CRUD smoke (browser)

| Field | Value |
|-------|--------|
| ID | E2E-10 |
| Priority | P1 |
| Type | Real browser |
| Depends | E2E-02 |

## Steps

1. Login seller
2. Open products list
3. Open existing seed published product (read)
4. Create draft product with unique title `E2E-10-{timestamp}`
5. Save draft — appears in list
6. Do **not** redesign fields; use existing form
7. Screenshot list + editor

## Expected

- Create/read works against API
- No mock-only persistence (survives refresh)

## Fail if

- Product disappears after refresh in api mode
- 500 on save

## Evidence

`evidence/E2E-10/` + product id if returned
