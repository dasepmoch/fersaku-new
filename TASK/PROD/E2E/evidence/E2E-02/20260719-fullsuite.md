# E2E-02 evidence (full suite re-run)
- Date: 2026-07-19
- Agent: opencode
- Mode: Playwright Chromium (full suite)
- Base: http://127.0.0.1:3000
- Result: **pass**

## Steps
| Step | Result | Notes |
|------|--------|-------|
| login → dashboard | pass | http://127.0.0.1:3000/dashboard |
| store name | pass |  |
| no MFA | pass |  |
| hard refresh session | pass |  |
| nav products | pass | http://127.0.0.1:3000/dashboard/products |
| nav orders | pass | http://127.0.0.1:3000/dashboard/orders |
| nav withdrawals | pass | http://127.0.0.1:3000/dashboard/withdrawals |

## Screenshots
- `fullsuite-*.png`

## Secrets check
- [x] no keys/cookies values
