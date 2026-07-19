# E2E-02 evidence (re-run)
- Date: 2026-07-19
- Agent: opencode
- Base URL: http://127.0.0.1:3000
- Result: **pass**

## Steps
| Step | Result | Notes |
|------|--------|-------|
| Open `/login` | pass | form rendered |
| Submit seller seed login | pass | → `/dashboard` |
| No MFA | pass | none |
| Dashboard store name | pass | Seed Merchant A Store |
| Hard refresh session | pass | stays on `/dashboard` |
| Nav products | pass | `/dashboard/products` |
| Nav orders | pass | `/dashboard/orders` |
| Nav withdrawals | pass | `/dashboard/withdrawals` |
| Session cookie httpOnly | pass | `fersaku_session` |
| Surface | pass | SELLER |

## Screenshots
- `login.png`, `login-filled.png`
- `seller-dashboard-rerun.png`, `dashboard-after-refresh.png`
- `products.png`, `orders.png`, `withdrawals.png`

## Residuals
- none

## Secrets check
- [x] no keys/cookies values in this file
