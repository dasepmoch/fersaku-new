# E2E-11 evidence (full suite re-run)
- Date: 2026-07-19
- Agent: opencode
- Mode: Playwright Chromium (full suite)
- Base: http://127.0.0.1:3000
- Result: **pass**

## Steps
| Step | Result | Notes |
|------|--------|-------|
| hard refresh still auth | pass |  |
| csrf after refresh | pass |  |
| CSRF rejects bad | pass | HTTP 403 |
| logout valid CSRF | pass | HTTP 200 |
| dashboard after logout → login | pass | http://127.0.0.1:3000/login?returnTo=%2Fdashboard |

## Screenshots
- `fullsuite-*.png`

## Secrets check
- [x] no keys/cookies values
