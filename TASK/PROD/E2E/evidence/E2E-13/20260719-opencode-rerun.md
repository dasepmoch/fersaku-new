# E2E-13 evidence (re-run)
- Date: 2026-07-19
- Agent: opencode
- Result: **pass** (dual-mode verified; full mock suite blocked by port conflict)

## Steps
| Step | Result | Notes |
|------|--------|-------|
| Mock Playwright config | pass | `playwright.config.ts` baseURL `:3100`, ignores `api/**` |
| API Playwright config distinct | pass | `playwright.api.config.ts` · `NEXT_PUBLIC_DATA_SOURCE=api` |
| `.env.example` default mock | pass | `NEXT_PUBLIC_DATA_SOURCE=mock` |
| Unit env dual-mode | pass | `vitest tests/unit/env.test.ts` · **15/15** |
| Mock smoke against :3100 | **blocked** | `:3100` serves **Canbot** (`Canbot — Commerce, on autopilot`), not Fersaku mock FE |

## Command output
- Unit: `Test Files 1 passed · Tests 15 passed`
- Playwright smoke attempted → 14 passed / 64 failed (wrong app on 3100) — see `smoke-output.txt`

## Residuals
- Free/start Fersaku mock FE on 3100 (or change mock port) before claiming full mock route-smoke green
- Does **not** replace live E2E-05/06 money path

## Secrets check
- [x] no keys/cookies
