# E2E-04 evidence (re-run)
- Date: 2026-07-19
- Agent: opencode
- Base URL: http://127.0.0.1:3000
- Result: **pass** (with note)

## Steps
| Step | Result | Notes |
|------|--------|-------|
| Open `/account/login` | pass | Buyer magic-link form |
| Submit magic-link request | pass | "Cek emailmu" confirmation |
| No MFA | pass | |
| Not seller/admin session | pass | stays buyer surface |
| API login surface=BUYER | pass | 200 · mfaRequired=false · surface=BUYER |
| Account area gate | pass | `/account/purchases` → login returnTo (unauthenticated expected) |

## Screenshots
- `buyer-login.png`, `buyer-after-submit.png`
- `account-_account_purchases.png`

## Residuals
- FE buyer path is magic-link only; full browser consume needs mail delivery of token
- API password login with surface=BUYER proves auth works

## Secrets check
- [x] no keys/cookies in this file
