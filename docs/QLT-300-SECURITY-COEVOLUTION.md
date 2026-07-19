# QLT-300 — Security/privacy verification matrix (continuous co-evolution)

**Authority:** `TASK/07-TESTING-ROLLOUT-DOD.md` §QLT-300 · `TASK/09-EXECUTION-STATUS.md` §3.6–3.7

## Parent vs capability cells

| Level | Meaning when `[x]` |
| --- | --- |
| **Parent `QLT-300`** | Security matrix **categories registered**, required non-empty FE unit + BE integration samples, parent assert + CI suite `qlt-300-security`, continuous co-evolution rule. **Not** every identity/authz/money/secret/abuse bullet or §3.7 cell. |
| **Capability cell** (`09` §3.7 column `QLT-300 security`) | Domain-specific security/privacy negative depth for that capability before canary. |

Parent must never wait on descendant cells. Domain tasks expand negatives in the **same PR** as security-sensitive FE/BE changes.

## Matrix categories (parent registration)

These five categories are the durable taxonomy. Parent harness only requires **at least one non-empty sample per side (FE unit + BE integration)** that anchors the matrix — not exhaustive coverage of every bullet in `07` §QLT-300.

| Category | Scope (examples; cells expand) | Parent FE sample anchors | Parent BE sample anchors |
| --- | --- | --- | --- |
| **Identity/session** | Session fixation/rotation/logout/revoke; cookie flags; surface confusion; CSRF missing/invalid/cross-session; stale cookie recovery; session missing/expired/replay; returnTo; magic/reset/invite scrub | `tests/unit/csrf.test.ts`, `tests/unit/session-int-120.test.ts`, `tests/unit/int-140.test.ts` | `security_verification_test.go` (`TestSecurity_CSRF*`, `TestSecurity_StaleCookie*`, `TestSecurity_SessionExpiry`), `authenticated_session_int140_test.go` |
| **Authorization** | Owner/member/foreign store; buyer owner/non-owner; admin route/action permission; stale permission; impersonation scope/TTL; object enumeration | `tests/unit/architecture-boundaries.test.ts` (tenant/surface guards) | `security_verification_test.go` (`TestSecurity_CrossTenant404`, `TestSecurity_ImpersonationDefaultDeny`), `rbac_test.go` |
| **Money/state** | Tampered price/fee/amount; integer boundaries; idempotency same/different body; concurrent stock/coupon/withdrawal; callback forge/replay/order | `tests/unit/int-160-query-mutation.test.ts`, `tests/unit/chk-110-checkout-intent.test.ts` | Domain integration suites (checkout/withdrawals/coupons/inventory); parent requires suite non-empty via integration guards |
| **Secret/data** | Secrets never in URL/storage/cache/logs/traces; one-time reveal/claim; SSR/CDN bleed; PII redaction; upload MIME/SSRF | `tests/unit/int-170-error-mock-observability.test.ts`, `tests/unit/architecture-boundaries.test.ts` | `security_verification_test.go` (`TestSecurity_RawCredentialNeverInList`, `TestSecurity_KYCNoPresign`, `TestSecurity_SSRF*`, `TestSecurity_WebhookPrivateNetwork`) |
| **Abuse/resilience** | Rate limits; body/upload bounds; timeouts/backpressure; provider outage honesty; audit immutability | Parent FE anchors may be partial; domain cells expand | Audit/callback/domain suites; cells claim depth before canary |

**Parent claim boundary:** registering categories + keeping sample files non-empty + CI guard green. Completing every row above for every capability is **§3.7 cell** work.

## Continuous co-evolution rule (domain tasks)

When a domain task adds or changes auth, tenant, money, secret, callback, or privileged surfaces:

1. **Negatives in the same PR** — extend FE unit and/or BE integration tests; do not ship happy-path-only for P0 security surfaces.
2. **Pick the category** — map the change to Identity / Authorization / Money / Secret / Abuse and document in evidence if non-obvious.
3. **FE unit** — prefer pure helpers/adapters (`tests/unit/*`); no production secrets; mock network only for unit isolation.
4. **BE integration** — prefer `//go:build integration` under `backend/test/integration/` (extend `security_verification_test.go` or domain suite); fail-closed assertions (404/403/problem codes).
5. **No invented pentest** — do not claim manual penetration results, production findings, or cloud secret scans that were not run; automated negatives only for parent/cells unless separate approved evidence exists.
6. **Secrets hygiene** — ephemeral local/compose credentials only; never commit security codes (unused), raw API keys, webhook secrets, or session material into tests, evidence, traces, or screenshots.
7. **CI** — keep `scripts/ci-assert-suite.mjs qlt-300-security` (and existing `security-negative` / `backend-integration`) green; do not skip security jobs under CI.
8. **Mark capability cell** in `09` §3.7 when domain security depth is proven — leave parent alone.

## Harness locations

| Role | Path |
| --- | --- |
| Co-evolution rule (this doc) | `docs/QLT-300-SECURITY-COEVOLUTION.md` |
| Parent framework assert (unit/fs) | `tests/unit/qlt-300-parent-framework.test.ts` |
| FE CSRF sample | `tests/unit/csrf.test.ts` |
| FE auth sample | `tests/unit/int-140.test.ts` |
| FE session sample | `tests/unit/session-int-120.test.ts` |
| FE redaction/boundaries | `tests/unit/int-170-error-mock-observability.test.ts`, `tests/unit/architecture-boundaries.test.ts` |
| FE QLT-105 security-negative list | `scripts/ci-assert-suite.mjs` → `security-negative` |
| BE consolidated security matrix | `backend/test/integration/security_verification_test.go` |
| BE auth gate sample | `backend/test/integration/authenticated_session_int140_test.go` |
| Threat / authz docs (reference) | `backend/docs/security/` |
| Parent CI suite id | `scripts/ci-assert-suite.mjs` → `qlt-300-security` |
| npm assert | `package.json` → `ci:assert:security` |
| Frontend CI step | `.github/workflows/ci.yml` → `frontend-static` (assert suites) |
| Backend security integration | `.github/workflows/backend-ci.yml` → `backend-integration` |

## Local / CI recipe (repeatable)

```bash
# Parent suite guards (no stack required)
node scripts/ci-assert-suite.mjs security-negative
node scripts/ci-assert-suite.mjs qlt-300-security

# FE unit samples (security-related)
./node_modules/.bin/vitest run \
 tests/unit/qlt-300-parent-framework.test.ts \
 tests/unit/csrf.test.ts \
 tests/unit/int-140.test.ts \
 tests/unit/session-int-120.test.ts

# BE security integration (disposable Postgres; ephemeral local creds only)
cd backend && make compose-deps
export DATABASE_URL='postgres://fersaku:fersaku_local@localhost:5433/fersaku?sslmode=disable'
export APP_ENV=test
export QLT_REQUIRE_INTEGRATION=1
make migrate
go test -tags=integration -count=1 -timeout 10m \
 -run 'TestSecurity_|TestINT140_MFA' ./test/integration/ -v
```

## Acceptance (parent only)

- Five matrix categories are registered in this doc and enforced by parent assert + `qlt-300-security` suite.
- Required FE unit samples and BE `security_verification_test.go` remain non-empty and referenced.
- CI fails if parent samples or co-evolution doc regress (empty suite / missing markers).
- No production secrets; no invented pentest results.
- Domain matrix cells in §3.7 remain separate work; parent `[x]` does **not** complete every identity/authz/money/secret/abuse bullet in `07` §QLT-300.
