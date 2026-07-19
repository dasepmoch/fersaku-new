# E2E-08 evidence (re-run)
- Date: 2026-07-19
- Agent: opencode
- Result: **pass**

## Steps
| Step | Result | Notes |
|------|--------|-------|
| Open `/dashboard/withdrawals/new` | pass | form renders |
| Min amount label | pass | Minimum Rp50.000 |
| Bank account visible | pass | seed bank |
| Request quote | pass | POST withdrawal-quotes **201** |
| No live payout | pass | stopped at quote |

## Screenshots
- `withdrawal-form.png`, `withdrawal-quote.png`

## Secrets check
- [x] no keys/cookies
