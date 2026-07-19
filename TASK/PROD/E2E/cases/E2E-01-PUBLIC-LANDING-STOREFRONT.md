# E2E-01 — Public landing + storefront (browser)

| Field | Value |
|-------|--------|
| ID | E2E-01 |
| Priority | P0 |
| Type | Real browser |
| Depends | E2E-00 |
| Base URL | `http://127.0.0.1:3000` or `https://fersaku.net` |

## Goal

Anonymous visitor can open marketing home and seed storefront without mock commerce.

## Steps

1. Open `/` — landing renders (no crash, no infinite spinner)
2. Open public storefront for seed store (route shape used by app, e.g. `/@seed-store-a` or documented public path — **discover from FE routes if needed**)
3. Open published product detail for seed product
4. Network: `/v1/*` requests go same-origin or API; **no** mock simulator host
5. Screenshot home + storefront + product

## Expected

- HTTP 200 pages
- Visible store name / product title from seed (or empty-state if slug route differs — document actual route)
- No console hard error that blanks the page
- No `NEXT_PUBLIC_DATA_SOURCE=mock` behaviour (no “simulate paid” control)

## Fail if

- 500 / blank shell
- Product page invents paid state without server
- Requests hit mock-only endpoints while stage=live

## Evidence

Screenshots + network note in `evidence/E2E-01/`
