# E2E-00 evidence (re-run)
- Date: 2026-07-19
- Agent: opencode
- Base URL: FE http://127.0.0.1:3000 · API http://127.0.0.1:18080
- Result: **pass**

## Steps
| Step | Result | Notes |
|------|--------|-------|
| 1. GET /health/live | pass | 200 `status:ok` |
| 2. GET /health/ready | pass | 200 `status:ready` |
| 3. POST /v1/webhooks/duitku `{}` | pass | 401 (mounted, not 404) |
| 4. GET FE `/` | pass | 200 |
| 5. POST /v1/auth/login seller seed | pass | 200, csrfToken present, mfaRequired=false |
| 6. Seed product exists | pass | `GET /v1/public/stores/seed-store-a` includes product `01HQ0SEED…042` title "Seed Published Product" price 50000 |
| Env dual-provider | pass | api container `PAYMENT_PROVIDER=duitku` `DISBURSEMENT_PROVIDER=xendit` |

## Screenshots
- (shell/curl only — no browser)

## Residuals
- Direct `GET /v1/catalog/products/01HQ0SEED…042` returns 404; public storefront path is the correct discovery surface.
