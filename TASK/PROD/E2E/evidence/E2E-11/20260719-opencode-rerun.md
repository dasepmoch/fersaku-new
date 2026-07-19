# E2E-11 evidence (re-run)
- Date: 2026-07-19
- Agent: opencode
- Result: **pass**

## Steps
| Step | Result | Notes |
|------|--------|-------|
| Hard refresh still auth | pass | stays `/dashboard` |
| CSRF rejects bad token | pass | logout HTTP 403 |
| Logout valid CSRF | pass | HTTP 200 |
| Dashboard after logout | pass | → `/login?returnTo=/dashboard` |

## Screenshots
- `after-refresh.png`, `post-logout.png`

## Secrets check
- [x] no keys/cookies
