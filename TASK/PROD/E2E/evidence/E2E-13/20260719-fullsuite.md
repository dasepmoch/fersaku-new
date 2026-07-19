# E2E-13 evidence (full suite re-run)
- Date: 2026-07-19
- Agent: opencode
- Mode: Playwright Chromium (full suite)
- Base: http://127.0.0.1:3000
- Result: **pass**

## Steps
| Step | Result | Notes |
|------|--------|-------|
| mock playwright config :3100 | pass |  |
| api config distinct | pass |  |
| env.example default mock | pass |  |
| env unit dual-mode | pass | vitest env |
| mock smoke :3100 skipped | pass | port 3100 is Canbot not Fersaku mock FE |

## Screenshots
- `fullsuite-*.png`

## Secrets check
- [x] no keys/cookies values
