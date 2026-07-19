# OpenCode — run ONE E2E case (template)

You are executing **exactly one** browser/API E2E case for Fersaku.

## Case

- **CASE_ID:** `{{CASE_ID}}`
- Spec file: `TASK/PROD/E2E/cases/{{CASE_FILE}}`
- Status board: `TASK/PROD/E2E/STATUS.md`

## Read first

1. `TASK/PROD/E2E/README.md`
2. The case markdown fully
3. UI freeze: `TASK/00-UI-FREEZE-CONTRACT.md` (no redesign)

## Runtime

```text
FE:  http://127.0.0.1:3000  (or https://fersaku.net)
API: http://127.0.0.1:18080
Seed password: TestSeed1!
Seller: seller.owner.a@seed.fersaku.test
Buyer:  buyer.a@seed.fersaku.test
Admin:  admin.super@seed.fersaku.test
```

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$HOME/.local/go/bin:$PATH"
export PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000
export PLAYWRIGHT_SKIP_WEBSERVER=1
export API_INTERNAL_URL=http://127.0.0.1:18080
```

## STRICT

- Only this CASE_ID
- No UI redesign
- No secrets in evidence (no pg.txt values, no full cookies)
- Prefer Playwright script under `frontend/tests/e2e/` **or** one-off script in `TASK/PROD/E2E/scripts/` if needed
- If using browser MCP / computer-use: still write evidence file
- Do not mark other cases done
- Do not run G40 live money

## Do

1. Claim case in `STATUS.md` → `in_progress`
2. Ensure preflight still OK if case depends on E2E-00
3. Execute every step in the case file
4. Capture screenshots to `TASK/PROD/E2E/evidence/{{CASE_ID}}/`
5. Write evidence markdown with pass/fail per step
6. Update STATUS.md → `done` or `failed` + residual
7. Print summary: pass/fail, evidence path, blockers

## Evidence template

```md
# {{CASE_ID}} evidence
- Date:
- Agent: opencode
- Base URL:
- Result: pass|fail

## Steps
| Step | Result | Notes |
|------|--------|-------|

## Screenshots
- path...

## Residuals
```

## Done criteria

- [ ] STATUS updated
- [ ] Evidence written
- [ ] No secrets committed
