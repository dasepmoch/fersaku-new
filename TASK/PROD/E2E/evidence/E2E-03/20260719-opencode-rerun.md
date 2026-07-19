# E2E-03 evidence (re-run)
- Date: 2026-07-19
- Agent: opencode
- Base URL: http://127.0.0.1:3000
- Result: **pass**

## Steps
| Step | Result | Notes |
|------|--------|-------|
| Open `/admin/login` | pass | |
| Submit admin seed login | pass | → `/admin` |
| No MFA | pass | |
| Admin surface (not seller) | pass | Command center / Fersaku Control |
| Nav payments | pass | `/admin/payments` |
| Nav withdrawals | pass | `/admin/withdrawals` |
| Nav orders | pass | `/admin/orders` 200 |

## Screenshots
- `admin-login.png`, `admin-home.png`
- `payments.png`, `withdrawals.png`, `orders.png`

## Residuals
- none

## Secrets check
- [x] no keys/cookies in this file
