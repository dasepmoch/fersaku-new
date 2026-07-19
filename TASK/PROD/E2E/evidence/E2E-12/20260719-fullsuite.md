# E2E-12 evidence (full suite re-run)
- Date: 2026-07-19
- Agent: opencode
- Mode: Playwright Chromium (full suite)
- Base: http://127.0.0.1:3000
- Result: **pass**

## Steps
| Step | Result | Notes |
|------|--------|-------|
| wrong password no dashboard | pass | http://127.0.0.1:3000/login |
| logged-out → login | pass | http://127.0.0.1:3000/login?returnTo=%2Fdashboard |
| API wrong password | pass | HTTP 401 |
| seller blocked admin API | pass | HTTP 403 |
| seller cannot use admin console | pass | http://127.0.0.1:3000/login |

## Screenshots
- `fullsuite-*.png`

## Secrets check
- [x] no keys/cookies values
