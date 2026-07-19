# E2E-10 evidence (re-run)
- Date: 2026-07-19
- Agent: opencode
- Result: **pass**

## Steps
| Step | Result | Notes |
|------|--------|-------|
| Seller API login + CSRF | pass | |
| List products API | pass | 200 |
| Create draft | pass | 201 · `01KXX6QYPSXGFA1S23FRD3N09P` · title `E2E-10-1784465324756` |
| UI products list | pass | |
| Open seed product | pass | `/dashboard/products/01HQ0SEED…042` |
| Draft appears + survives refresh | pass | api mode persistence |

## Screenshots
- `products-list.png`, `seed-product.png`, `products-after-create.png`

## Secrets check
- [x] no keys/cookies
