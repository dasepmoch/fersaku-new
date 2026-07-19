# E2E-12 evidence (re-run)
- Date: 2026-07-19
- Agent: opencode
- Result: **pass**

## Steps
| Step | Result | Notes |
|------|--------|-------|
| Wrong password no dashboard | pass | stays `/login` |
| Logged-out `/dashboard` | pass | → login returnTo |
| API wrong password | pass | 401 |
| Seller blocked admin API | pass | 403 `/v1/admin/payments` |
| Seller cannot use admin console | pass | redirected to login |

## Screenshots
- `wrong-password.png`, `isolation.png`

## Secrets check
- [x] no keys/cookies
