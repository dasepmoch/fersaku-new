# CI required checks & branch protection (QLT-105)

This document lists **real required GitHub checks** after QLT-105. No job is allowed to pass because it finds zero tests or is a `if: false` placeholder.

## Required status checks (main / release)

Configure repository **Settings → Branches → Branch protection** (or Rulesets) for `main` / release branches:

### Workflow: `Frontend quality` (`.github/workflows/ci.yml`)

| Job name (exact) | Purpose |
| --- | --- |
| `frontend-static (format, lint, typecheck, unit, security-negative)` | Format, lint, typecheck, unit/coverage, FE security/contract/tenant/idempotency negatives + QLT-300/310/320/400 parents |
| `frontend-build (production + bundle budget)` | Production build + bundle budget |
| `frontend-mock-e2e (smoke/critical/a11y/visual)` | Mock Playwright smoke, critical, a11y, visual + QLT-230 parent harness |
| `cross-stack-api-e2e (API stack + harness + INT-190 + QLT-220)` | Disposable stack + API harness + INT-190 + QLT-220 parent |

### Workflow: `Backend CI` (`.github/workflows/backend-ci.yml`)

| Job name (exact) | Purpose |
| --- | --- |
| `backend-unit (fmt, vet, test, check-generated)` | Go fmt/vet/unit + sqlc dirty-diff |
| `backend-race (go test -race)` | Race detector |
| `backend-docker (api + worker images)` | Image build |
| `openapi-contract (lint, bundle, codegen check, router)` | OpenAPI lint/bundle/codegen dirty-diff + router coverage |
| `backend-integration (Postgres + security/tenant/idempotency)` | Tagged integration + security negatives |

> **Path filters:** `Backend CI` only runs when backend/OpenAPI-related paths change. For PRs that only touch frontend, require the Frontend quality jobs; for backend/OpenAPI PRs require both workflows. For **release/cutover** branches, require the **full matrix** (both workflows green on a merge commit that includes both trees, or a composite “all-gates” dispatch).

## No-op guards

| Guard | Location |
| --- | --- |
| Suite file presence | `scripts/ci-assert-suite.mjs` |
| `go test` executed packages | `scripts/ci-assert-go-tests.sh` |
| Integration refuses silent skip in CI | `backend/test/integration/foundation_test.go` (`DATABASE_URL` + `CI`/`QLT_REQUIRE_INTEGRATION`) |
| OpenAPI generated dirty-diff | `npm run api:check` |
| sqlc dirty-diff | `backend/scripts/check-generated.sh` |

## Secrets

These gates use **ephemeral local credentials only** (compose Postgres/Redis, fake Xendit, seed personas). **Do not invent** production secrets, cloud API keys, or org-level tokens for CI. Optional tools (govulncheck, gitleaks) may be added later without blocking P0 gates if not installed.

## Intentional failure cases (must break CI)

- OpenAPI lint errors or router inventory drift
- Dirty `shared/api/generated/openapi.ts` after codegen check
- Dirty sqlc `gen/`
- Cross-tenant / CSRF / idempotency negative test failures
- QLT-300 parent assert / `qlt-300-security` suite guard failure
- QLT-310 parent assert / `qlt-310-performance` suite guard failure
- QLT-320 parent assert / `qlt-320-observability` suite guard failure
- QLT-400 parent assert / `qlt-400-flags` suite guard failure
- QLT-410 parent assert / `qlt-410-deploy` suite guard failure
- QLT-420 parent assert / `qlt-420-cutover` suite guard failure
- Missing mock visual baselines or empty e2e/unit suites
- QLT-230 parent assert / `qlt-230-visual-a11y` suite guard failure
- Bundle budget exceeded (`npm run check:bundle`)
- API stack fail (migrate/seed/health) or harness/INT-190/QLT-220 parent failure
- Integration suite with `DATABASE_URL` unset under `CI=1`

## Operator checklist

1. Enable “Require status checks to pass before merging”.
2. Add every job name above that applies to the protected branch.
3. Disable “Allow force pushes” on release branches.
4. Do not mark any P0 job `continue-on-error: true`.
5. Visual baseline updates require separate review (do not regenerate baselines inside domain PRs). See `docs/QLT-230-VISUAL-A11Y-COEVOLUTION.md`.
