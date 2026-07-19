# Quality, CI, Security, Performance, Rollout & Definition of Done

Integrasi bukan selesai ketika compile. Dokumen ini mendefinisikan bukti yang wajib untuk menyatakan satu domain atau seluruh program siap.

## Snapshot test saat audit

- Backend unit `go test ./...`: lulus pada 17 Juli 2026.
- Backend tagged integration: belum dijalankan pada audit karena PostgreSQL tidak tersedia.
- Frontend tests: belum dijalankan pada audit karena `node_modules` tidak tersedia.
- Visual baseline: 14 route x desktop/mobile tersedia.
- Cross-stack API-mode Playwright: belum ada.
- OpenAPI/contract test: belum ada; folder backend contract hanya `.gitkeep`.

Jangan mengekstrapolasi hasil unit backend menjadi bukti FE-BE integration.

---

## QLT-100 — Perbaiki dan scaffold pipeline CI dasar

**Priority:** P0
**Depends on:** tidak ada; dapat dimulai segera

### Current issues

- `.github/workflows/ci.yml` mengatur working directory `frontend`, padahal frontend berada di root.
- Lockfile/`.nvmrc` path frontend salah.
- Backend workflow memakai Go 1.24, sedangkan `backend/go.mod` meminta Go 1.25.12.
- Tagged integration/OpenAPI drift/cross-stack suite belum menjadi gate.

### Target CI job topology

Task ini membuat workflow/path/toolchain/job skeleton yang benar. Job yang memerlukan OpenAPI codegen, deterministic seed, atau API Playwright harness baru diaktifkan sebagai required gate oleh `QLT-105`; jangan memalsukan green dengan empty/no-op test.

1. **frontend-static**
 - install exact Node/npm from `package.json` engines/package manager;
 - `npm ci`;
 - `npm run format:check`;
 - lint with zero warnings;
 - typecheck;
 - unit/coverage;
 - build + bundle budget.
2. **openapi-contract**
 - parse/lint/bundle OpenAPI;
 - generate TS/schema;
 - fail on dirty diff;
 - operation/router coverage tests.
3. **backend-unit**
 - exact Go version from `go.mod`;
 - format/vet/unit/race/check-generated/build.
4. **backend-integration**
 - disposable Postgres/Redis/MinIO/Mailpit as needed;
 - migrations;
 - `go test -tags=integration ...`;
 - migration integrity/down-up policy tests.
5. **frontend-mock-e2e**
 - smoke, critical, a11y, visual desktop/mobile.
6. **cross-stack-api-e2e**
 - compose dependencies/API/worker;
 - migrate + deterministic nonprod seed;
 - Next API-mode;
 - public/buyer/seller/admin/security flows.
7. **security/artifact**
 - dependency vulnerability/license/secret scan according project policy;
 - container/SBOM scan;
 - artefact provenance and immutable image digest.

### CI rules

- [ ] Pin actions/tool versions and dependency caches by lock/hash.
- [ ] Do not expose test secrets in logs/artefacts; use ephemeral credentials.
- [ ] Cancel superseded PR runs, but never cancel migration/release job mid-critical step without safe handling.
- [ ] Upload Playwright traces/screenshots only on failure and scrub secret flows.
- [ ] Visual baseline update requires explicit separate review label/approval; integration PR cannot silently change it.
- [x] Required checks branch protection; no “continue-on-error” for P0 gates. *(QLT-105: `docs/CI-BRANCH-PROTECTION.md` + active workflows)*

### Acceptance criteria

- Workflow syntax valid; frontend runs dari root; backend memakai exact Go version; cache/lockfile paths benar.
- Existing frontend static/unit/build/mock suites dan backend unit checks yang memang tersedia berjalan dari clean checkout.
- Placeholder job tidak mengklaim pass untuk contract/integration/API E2E yang belum dibuat; dependency ke `QLT-105` tercatat.

---

## QLT-105 — Aktifkan seluruh CI gate sebagai required checks

**Priority:** P0 sebelum setiap domain/capability canary dan full cutover
**Depends on:** QLT-100, INT-000, INT-010, QLT-110, QLT-215. `QLT-200/210` framework dan capability quality cells co-evolve; cells wajib required-check sebelum canary, tetapi bukan hard dependency balik ke parent `QLT-105`.

### Checklist

- [x] Aktifkan OpenAPI lint/bundle/codegen dirty-diff/router coverage setelah `INT-000/010`.
- [x] Aktifkan backend tagged integration setelah `QLT-210` framework/environment stabil dan instance capability terkait siap. *(parent gate: Postgres service + `go test -tags=integration` required in CI; domain cells still expand coverage under QLT-210)*
- [x] Aktifkan API-mode Playwright harness setelah `QLT-110/215`; tambahkan project/test dan required-check instance **sebelum** capability canary, bukan setelah rollout.
- [x] Aktifkan mock smoke/critical/a11y/visual dan API visual/a11y yang relevan. *(mock matrix required; API a11y/visual remain domain QLT-230 cells)*
- [x] Jadikan security/contract/tenant/idempotency negative tests required, bukan optional/continue-on-error.
- [x] Branch protection mengharuskan gate yang relevan untuk changed domain; full matrix required untuk release branch/cutover. *(operator checklist: `docs/CI-BRANCH-PROTECTION.md`)*

### Acceptance criteria

- Clean checkout CI end-to-end untuk implemented capability instance succeeds.
- Intentional OpenAPI drift, visual diff, cross-tenant access, generated dirty diff, atau mock reachability pada API path fails CI.
- Tidak ada required job yang pass karena tidak menemukan test/file.

---

## QLT-110 — Deterministic test environment dan fixtures

**Priority:** P0
**Depends on:** INT-000, INT-030; co-evolve dengan INT-150 dan domain migrations, prerequisite untuk INT-190

### Required seed personas

| Persona | Required state |
| --- | --- |
| Buyer A | verified, purchases, sessions, notification, eligible review |
| Buyer B | verified, no ownership over Buyer A purchase |
| Seller owner A | completed onboarding, canonical store, product/inventory/order/customer/review/finance |
| Seller member read | same store, read-only permission |
| Seller B | another merchant/store for isolation tests |
| Admin super | all test permissions (no auth) (no auth) |
| Admin support | bounded read/support permissions |
| Admin finance | withdrawal/payment permissions only |
| Admin no-access | authenticated but lacks target permission |

### Required data scenarios

- empty/new store;
- draft/published/archived products;
- available/reserved/delivered/revoked/invalid inventory;
- pending/paid/expired/failed/unknown payment;
- order delivery ready/revoked/retry state;
- active/paused/expired/last-use coupon;
- withdrawal available/locked/expired quote/pending/processing/unknown/completed;
- review pending/published/replied/reported/moderated;
- callback duplicate/rejected/replayable and seller delivery retry/DLQ;
- KYC draft/submitted/needs-info/approved/rejected;
- audit chain and emergency control versions.

### Fixture rules

- [x] Seed command refuses `APP_ENV=production`.
- [x] IDs/timestamps deterministic relative to fixed clock or seeded window.
- [x] No real provider secret, raw credential, PII, or production copy.
- [x] Database disposable per run; tests parallelized only with namespace/isolation.
- [ ] Provider fake/test double is explicit and cannot be selected in live.
- [ ] Mail links captured in Mailpit/test adapter and tokens consumed securely.
- [x] Teardown uses disposable environment, not destructive wildcard against shared DB.
- [x] Seed ownership tunggal berada di task ini; `INT-190` hanya memakai dan memvalidasi first vertical slice, tidak membuat command/persona kedua.

### Acceptance criteria

- Same commit produces same visible normalized view and test IDs.
- Isolation tests can refer to stable actors/resources without shared-state flakiness.

---

## QLT-200 — Unit, mapper, provider/consumer contract tests

**Priority:** P0/P1 per endpoint
**Depends on:** INT-000, INT-010; berjalan bersama setiap domain task

### Coverage configuration

- [x] Expand `vitest.config.ts` include secara bertahap dari snapshot HTTP client/pagination-only ke seluruh live feature adapters, schemas, mappers, query policies, session/source registry, dan pure security helpers. *(QLT-200 parent 2026-07-17)*
- [x] Threshold tidak boleh memberi false confidence karena hanya dua file masuk denominator; report per critical directory/domain. *(expanded denominator; thresholds honest vs full adapter set)*
- [x] Exclude generated code, visual-only components, mock fixtures, dan config hanya dengan alasan tertulis; generated contract diuji provider/drift, bukan line coverage. *(see vitest.config.ts + docs/QLT-200-CONTRACT-COEVOLUTION.md)*
- [x] Coverage adalah signal tambahan, bukan pengganti negative/integration/E2E tests.

### Frontend adapter minimum

For every feature API function:

- [ ] Valid response -> exact existing view model.
- [ ] Empty response/list/cursor.
- [ ] Malformed envelope/invalid schema -> `INVALID_API_CONTRACT`.
- [ ] ProblemEnvelope code/details/requestId preserved.
- [ ] Abort/timeout/network behavior.
- [ ] Expected 404 -> null only where declared.
- [ ] 400 malformed/`VALIDATION_FAILED`, 401/403/409/429 behavior.
- [ ] Unknown enum fail-safe, not success.
- [ ] Integer money/timestamp/status mapper boundaries.
- [ ] Request mapper sends no unknown/view-only field.
- [ ] Sensitive response does not enter reporter/query cache.

### Backend handler/service minimum

- [ ] Strict decode/body/query/content type/limit.
- [ ] Happy path and domain problem mapping.
- [ ] Auth, permission, tenant/ownership/capability.
- [ ] CSRF/recent authentication/reason/idempotency/version where required.
- [ ] State transition/concurrency/duplicate/replay.
- [ ] Audit/outbox/transaction rollback.
- [ ] Redaction/no secret logging.

### Contract compatibility strategy

- Generate raw DTO fixtures from OpenAPI examples or schema-valid builders. *(harness: `tests/contract/fixtures/` + `backend/test/fixtures/contract/`)*
- Provider test: Go presenter response validates OpenAPI schema. *(sample: `backend/test/contract/provider_presenter_test.go`)*
- Consumer test: raw response maps to existing FE view model. *(sample: `tests/contract/qlt-200-consumer-foundation.test.ts` + helpers)*
- Mock/API parity: semantically equivalent fixture yields equal normalized view object, except fields explicitly nonvisual/authority-only.
- Continuous co-evolution: domain tasks extend harness in the same slice as adapters — `docs/QLT-200-CONTRACT-COEVOLUTION.md`. Parent framework ≠ full capability matrix (§3.7 cells).

### Acceptance criteria

- A backend field rename/removal breaks provider/consumer CI before runtime.
- No mapper silently fills authoritative required data with mock/default success value.

---

## QLT-210 — Backend integration/database tests

**Priority:** P0
**Depends on:** QLT-100 dan foundation/domain migration yang sedang diuji; berjalan bersama setiap backend slice

Parent framework (harness/CI/co-evolution) completed 2026-07-17 — see `docs/QLT-210-INTEGRATION-COEVOLUTION.md` and `TASK/evidence/QLT-210/`. Parent `[x]` does **not** mark every domain coverage bullet or §3.7 capability cell complete; cells co-evolve with domain BE slices.

### Parent framework (done)

- [x] Tagged integration required CI (`backend-ci.yml` → `backend-integration`) + non-empty guards (`ci-assert-suite.mjs` `backend-integration` / `qlt-210-integration`).
- [x] Repeatable local recipe: `make compose-deps && make migrate && make test-integration` / `test-integration-foundation`.
- [x] Migrations apply from empty DB (`TestMigrateUpFromZero`) and upgrade supported previous schema (`TestMigrateUpgradeFromSupportedPrevious`).
- [x] Race/concurrency foundation sample uses real concurrent transactions (`TestConcurrentIdempotencyFirstWriterWins` + domain WaitGroup suites).
- [x] Atomic multi-table rollback sample (`TestAtomicCommitRollbackOnOutboxFailure`).
- [x] Continuous co-evolution rule documented — domain slices extend suite in same PR as BE changes.

### Coverage areas (capability cells / domain co-evolution — not claimed by parent alone)

- [ ] Unique/foreign/check/deferred/immutability constraints. *(partial: foundation + domain suites; claim per §3.7 cell)*
- [ ] Store membership/foreign tenant returns safe 404. *(partial: rbac/security suites)*
- [ ] Buyer ownership and admin permission projections.
- [ ] Idempotency same/different body and concurrent requests. *(foundation concurrent sample [x]; domain cells expand)*
- [ ] Optimistic concurrency/ETag.
- [ ] Inventory reservation/import/reveal/revoke. *(suite present; cell depth before canary)*
- [ ] Coupon reservation/redemption concurrency.
- [ ] Checkout provider callback duplicate/out-of-order/late event.
- [ ] Balanced append-only ledger and withdrawal reserve/variance/unknown outcome.
- [ ] Delivery exactly-once/outbox retry.
- [ ] Credential/webhook one-time secret claim.
- [ ] KYC encryption/transition/document access.
- [ ] Impersonation TTL/scope/gate.
- [ ] Audit chain/integrity/export.
- [ ] Notification recipient isolation.

### Database role tests

- App role cannot mutate ledger/audit immutable tables outside approved functions. *(domain/security cells)*
- Migration role separated from app role. *(documented `migrations/README.md`; prod separation ops)*
- Transaction failure rolls back domain/idempotency/outbox/audit together. *(foundation sample [x])*
- Backup/PITR/restore rehearsal tracked outside unit CI but before live.

### Acceptance criteria

- [x] Tagged integration is required CI and repeatable. *(parent)*
- [x] Race/concurrency cases use actual concurrent transactions, not only sequential mocks. *(parent foundation + existing domain WaitGroup samples)*

---

## QLT-215 — API-mode Playwright harness

**Priority:** P0 sebelum `INT-190`
**Depends on:** QLT-100, QLT-110, INT-025, INT-030, INT-100

### Checklist

- [x] Add separate Playwright project/env for API mode without removing mock projects.
- [x] Orchestrate disposable dependencies, migration, `QLT-110` seed, backend API/worker readiness, and Next per-domain source registry.
- [x] Provide safe test helpers for Mailpit token extraction and signed fake-provider callback; helpers exist only test environment and cannot boot production.
- [x] Capture sanitized trace/network/log; mask/disable artefact during raw secret/document/recovery-code steps.
- [x] Make teardown/retry deterministic and parallel namespace-safe.
- [x] Add one minimal health/public request test so harness failure is distinguishable from product test failure.

### Acceptance criteria

- Fresh CI worker can start stack and run minimal public + authenticated probe.
- Harness exposes no production credential, no mock commerce fallback, and no hidden direct DB mutation except declared seed/setup boundary.

---

## QLT-220 — Cross-stack API-mode Playwright

**Priority:** P0 before domain rollout
**Depends on:** QLT-215, INT-190; co-evolve with the domain implementation and its quality instance (domain task must not wait for a global QLT-220 parent row).

Parent framework (harness registration/CI/co-evolution) completed 2026-07-17 — see `docs/QLT-220-API-E2E-COEVOLUTION.md` and `TASK/evidence/QLT-220/`. Parent `[x]` does **not** mark every public/buyer/seller/admin flow bullet or §3.7 capability cell complete; cells co-evolve with domain FE↔BE slices.

### Parent framework (done)

- [x] Distinct Playwright project/config/env for mock (`playwright.config.ts` + `testIgnore **/api/**`) and API (`playwright.api.config.ts` → `api-desktop-chromium`); parent registered in `09-EXECUTION-STATUS.md` (capability cells remain separate).
- [x] API project starts/reuses isolated stack, migrations, QLT-110 seed, backend health/readiness, Next (`scripts/e2e-api-stack.sh` + webServer).
- [x] Authentication via real API flow (`helpers/auth.ts` loginViaApi / optional UI); storage state under gitignored `test-results/api/.auth/` (ephemeral cookies only; cleaned).
- [x] Tests do not call internal DB to force success except declared seed/setup + provider callback helper (`helpers/callback.ts`) with test-only boundary.
- [x] Trace/screenshot retain-on-failure only; tokens masked (`maskToken` / `sanitizeAuthSummary`); no raw secret annotations.
- [x] Required samples stay green: `harness-health.spec.ts` + `int-190-vertical-slice.spec.ts` + `qlt-220-parent-framework.spec.ts`.
- [x] Suite guards: `ci-assert-suite.mjs` `cross-stack-api-e2e` + `qlt-220-api-e2e`; CI job `cross-stack-api-e2e`.
- [x] Continuous co-evolution rule documented — domain slices add `tests/e2e/api/*` in same PR as live paths.

### Public/checkout flow (capability cells / domain co-evolution — not claimed by parent alone)

- public storefront/product; *(INT-190 public slice sample [x]; full checkout cells remain open)*
- create intent, QR pending, signed test callback, paid;
- failure never paid;
- tampered total ignored;
- double-click one order;
- refresh/offline/expiry recovery;
- order result capability, delivery access, invoice verify.

### Buyer flow (capability cells)

- magic request/mail fragment consume; *(INT-190 buyer magic request sample)*
- purchases/detail/delivery/review;
- profile conflict;
- sessions revoke/logout;
- owner vs other buyer denial.

### Seller flow (capability cells)

- register/verify/login; *(INT-190 seller login/session/logout sample)*
- onboarding/current store;
- product create/upload/inventory/publish;
- order/customer/review;
- storefront draft conflict/publish;
- finance/withdrawal quote/reauth/create;
- webhook/key one-time claim cleanup;
- foreign store denial. *(INT-190 foreign store negative sample)*

### Admin flow (capability cells)

- login/route permission;
- merchant/status/API capability;
- buyer support/session;
- roles anti-escalation;
- payment/order evidence;
- withdrawal review;
- inventory reveal TTL/no cache;
- KYC/document;
- provider callback/seller delivery;
- audit/export/system/emergency;
- impersonation TTL/read-only/terminate.

### Acceptance criteria

- [x] API mode has no network request to mock simulator/fixture endpoint. *(parent probe + blocklist + DATA_SOURCE=api)*
- [x] Tests assert backend state/response and user-visible existing state. *(INT-190 + parent samples)*
- [x] Negative security cases are first-class, not only happy path. *(INT-190 negatives; domain cells expand)*
- [ ] Full public/buyer/seller/admin matrix bullets — **capability cells** (§3.7)

---

## QLT-230 — Visual, responsive, accessibility, dan interaction parity

**Priority:** P0 UI contract
**Depends on:** UI-000, UI-050, UI-060, QLT-100; API-state parity per domain juga membutuhkan QLT-110, QLT-215, dan domain task terkait

Parent framework (harness/CI/co-evolution) completed 2026-07-17 — see `docs/QLT-230-VISUAL-A11Y-COEVOLUTION.md` and `TASK/evidence/QLT-230/`. Parent `[x]` does **not** mark every visual/a11y/interaction bullet or §3.7 capability cell complete; cells co-evolve with domain UI wiring. API-state visual/a11y claims require QLT-110/215 + domain seed normalization.

### Parent framework (done)

- [x] Mock Playwright desktop/mobile projects + visual/a11y/critical/smoke samples required non-empty (`playwright.config.ts`, `tests/e2e/{visual,accessibility,critical-flows,smoke}.spec.ts`).
- [x] Committed mock baselines for all `visualRoutes` × desktop/mobile (`tests/e2e/__screenshots__`); suite guards require ≥14 each.
- [x] Parent assert suite `tests/e2e/qlt-230-parent-framework.spec.ts`.
- [x] Baseline update requires explicit separate review — documented in co-evolution doc (no silent domain PR rewrites).
- [x] CI: `frontend-mock-e2e` + `ci-assert-suite.mjs` `frontend-mock-e2e` / `qlt-230-visual-a11y`.
- [x] Continuous co-evolution rule for domain mock + API-state visual/a11y cells.

### Visual (capability cells / domain co-evolution — not claimed by parent alone)

- [x] Mock baseline routes registered desktop/mobile without silent snapshot update. *(parent harness; per-route green remains CI + domain)*
- [ ] Run same visual routes with API seed normalized to equivalent view. *(needs QLT-110/215/domain; do not overwrite mock baselines)*
- [ ] Add characterization snapshots only for touched high-risk routes not covered, in a separate reviewed baseline step before wiring.
- [ ] Compare loading/empty/error/long-data states at both widths.
- [ ] No layout shift during hydration/background refresh.

### Accessibility (capability cells)

- [x] Existing axe suite required non-empty (serious/critical block; contrast debt documented). *(parent sample routes)*
- [ ] Existing axe suite plus auth/checkout/dialog/secret/error API states.
- [ ] Pending state: correct disabled/`aria-busy`, no double submit.
- [ ] Error: `role=alert`/described-by/focus first invalid using existing controls.
- [ ] Dialog: focus trap/return/Escape/label.
- [ ] Polling: no repeated live-region announcements.
- [ ] Table/pagination/filter keyboard semantics unchanged.
- [ ] Secret copy/reveal TTL communicated through existing semantics without leaking to accessibility tree after clear.

### Interaction (capability cells)

- [x] Critical flow existing tests continue in mock mode. *(parent sample: critical-flows.spec.ts)*
- [ ] API-mode equivalent asserts no fake timer/success.
- [ ] Theme/profile/notification menus retain behavior and server actions. *(sample covered in critical-flows; domain cells expand)*

### Acceptance criteria

- [x] Parent harness: mock visual/a11y non-empty, baselines present, CI guards, co-evolution documented.
- [ ] Zero unexpected pixel diff on domain-touched routes — **capability cells**
- [ ] No new serious/critical axe violation on domain-touched routes — **capability cells**
- [ ] Keyboard-only user can complete the same flows — **capability cells**

---

## QLT-300 — Security/privacy verification matrix

**Priority:** P0
**Depends on:** INT-120, INT-130, INT-140, INT-150, INT-170; INT-180 **if live provider/security integration**; capability cells co-evolve

Parent framework (category registration/CI/co-evolution) completed 2026-07-17 — see `docs/QLT-300-SECURITY-COEVOLUTION.md` and `TASK/evidence/QLT-300/`. Parent `[x]` does **not** mark every identity/authz/money/secret/abuse bullet or §3.7 capability cell complete; cells co-evolve with domain security-sensitive slices.

### Parent framework (done)

- [x] Five matrix categories registered: Identity/session, Authorization, Money/state, Secret/data, Abuse/resilience.
- [x] Required non-empty FE unit samples (CSRF, auth, session, boundaries, redaction, idempotency/checkout).
- [x] Required non-empty BE integration sample (`security_verification_test.go` + auth/RBAC anchors).
- [x] Parent assert suite `tests/unit/qlt-300-parent-framework.test.ts`.
- [x] CI suite guard `ci-assert-suite.mjs` `qlt-300-security` (+ existing `security-negative`); wired in `frontend-static` / `ci:assert:security`.
- [x] Continuous co-evolution rule documented — domain slices expand negatives in same PR as security-sensitive changes.

### Identity/session (capability cells / domain co-evolution — not claimed by parent alone)

- session fixation/rotation/logout/revoke;
- cookie flags/domain/path/same-site;
- surface confusion buyer/seller/admin;
- CSRF missing/invalid/cross-session/cross-origin/refetch; *(parent sample: FE csrf + BE TestSecurity_CSRF*)*
- stale/expired/revoked HttpOnly cookie must not permanently block login, magic/reset/invite consume, or logout; verify narrowly scoped recovery still rejects cross-site unsafe requests; *(parent sample: TestSecurity_StaleCookie*)*
- session missing/expired/replay/wrong purpose; *(parent sample: int-140 + authenticated_session_int140)*
- login for invited/admin user and recent-proof mint/exchange purpose/TTL/replay;
- safe returnTo/open redirect; *(parent sample: session-int-120)*
- magic/reset/invite fragment scrub/replay/scanner.

### Authorization (capability cells / domain co-evolution — not claimed by parent alone)

- owner/member/foreign store for every store resource; *(parent sample: TestSecurity_CrossTenant404 / rbac)*
- buyer owner/non-owner;
- admin direct route/action with/without permission;
- permission changes/stale session;
- impersonation scope/TTL/termination/no chaining; *(parent sample: TestSecurity_ImpersonationDefaultDeny)*
- object/invoice/order enumeration.

### Money/state (capability cells / domain co-evolution — not claimed by parent alone)

- tampered price/fee/amount/status;
- integer/fractional/overflow boundaries;
- duplicate idempotency/same key different body; *(parent FE sample: int-160 / chk-110)*
- concurrent stock/coupon/withdrawal;
- callback forged/replayed/out-of-order/account-mode mismatch;
- unknown provider outcome/no duplicate charge/release.

### Secret/data (capability cells / domain co-evolution — not claimed by parent alone)

- API/webhook/inventory/delivery/auth/KYC/signed URL never in URL, browser persistent storage, query cache, logs, traces, analytics, screenshots; *(parent samples: int-170, architecture-boundaries, TestSecurity_RawCredential*)*
- explicit reveal/claim one-time/TTL/wrong user;
- SSR/CDN/private cache bleed;
- PII redaction/export scope/notification target;
- upload MIME spoof/malware/checksum/SSRF. *(parent sample: TestSecurity_SSRF*)*

### Abuse/resilience (capability cells / domain co-evolution — not claimed by parent alone)

- distributed rate limits login/checkout/reveal/admin/callback/upload/export;
- request/body/upload bounds;
- timeouts/cancellation/backpressure/retry storm;
- provider/dependency outage/readiness honesty;
- audit immutability/integrity.

### Acceptance criteria

- [x] Parent: P0 security suite harness automated (categories + samples + CI guards); continuous co-evolution documented.
- [ ] Full matrix bullets / §3.7 cells — domain co-evolution before canary.
- Manual penetration checklist/evidence for browser/provider flows remains cell/ops work when claimed — do not invent results.
- No known high/critical issue accepted without explicit owner, expiry, compensating control, and go-live approval.

---

## QLT-310 — Performance dan “smooth” behavior budget

**Priority:** P1
**Depends on:** INT-160; capability cells co-evolve

Parent framework (category registration/CI/co-evolution) completed 2026-07-17 — see `docs/QLT-310-PERFORMANCE-COEVOLUTION.md` and `TASK/evidence/QLT-310/`. Parent `[x]` does **not** mark every FE interaction / BE budget / UX smoothness bullet or §3.7 capability cell complete; cells co-evolve with domain performance-sensitive slices. **Do not invent load-test results.**

### Parent framework (done)

- [x] Three categories registered: FE interaction guards, BE budget categories, UX smoothness policy.
- [x] Required non-empty samples (bundle budget, query policy, checkout poll no-overlap, timeouts).
- [x] Parent assert suite `tests/unit/qlt-310-parent-framework.test.ts`.
- [x] CI suite guard `ci-assert-suite.mjs` `qlt-310-performance`; wired in `frontend-static` / `ci:assert:performance` (+ existing `frontend-build` bundle budget).
- [x] Continuous co-evolution rule documented — domain slices expand budgets/guards in same PR as performance-sensitive changes; domain SLOs co-evolve via §3.7 cells.

### Frontend interaction targets (capability cells / domain co-evolution — not claimed by parent alone)

Targets harus dikonfirmasi dengan actual baseline/SLO, tetapi gunakan guard berikut:

- search debounce sekitar 250–400 ms; request sebelumnya dibatalkan; *(parent sample: QUERY-MUTATION-POLICY + checkout quote debounce)*
- no overlapping checkout polls; visible pending poll bounded, hidden tab strongly reduced; *(parent sample: chk-120-checkout-poll no-overlap)*
- background refetch keeps previous content; *(parent sample: query-policy keepPreviousData)*
- exact cache invalidation, not whole-console refetch; *(parent sample: matchesExactQueryKey / INT-160)*
- list page bounded server limit; no fetch-all;
- large upload direct-to-object storage with progress/cancel;
- charts receive bounded aggregated series, not raw transaction history;
- Server Components private fetch no shared cache and no waterfall where queries independent;
- query/mutation timeout per operation class, not one indiscriminate value for upload/export/provider. *(parent sample: http-client timeoutMs + unit abort)*

### Backend budgets/tests (capability cells / domain co-evolution — not claimed by parent alone)

- Define SLO per read/write/payment/callback and measure p50/p95/p99. *(domain cells; no invented load results)*
- Explain query plans/indexes for seller/admin filters and cursor.
- N+1 detector/query count tests for order/customer/review/inventory read models.
- Connection pool budgets across API/worker replicas.
- Load test checkout create/status/callback, seller/admin lists, notifications, webhook worker.
- Backpressure and graceful degradation; readiness/load shedding as designed.

### UX smoothness acceptance (capability cells / domain co-evolution — not claimed by parent alone)

- No flash from mock -> real data.
- No stale tenant/actor row.
- Filter result race cannot revert UI. *(parent sample: keepPrevious + abort on key change)*
- Button only locks relevant operation and recovers on error. *(parent sample: createPendingDedupe)*
- Polling/upload timers abort on unmount. *(parent sample: chk-120 poll abort)*
- Layout and scroll/focus position remain stable on background updates.

---

## QLT-320 — Observability, alerts, dashboards, runbooks

**Priority:** P0 before live
**Depends on:** INT-170; INT-180/185 **if live signals/runtime active**; capability cells co-evolve

Parent framework (category registration/CI/co-evolution) completed 2026-07-17 — see `docs/QLT-320-OBSERVABILITY-COEVOLUTION.md` and `TASK/evidence/QLT-320/`. Parent `[x]` does **not** mark every structured-signal / alert / dashboard / runbook bullet or §3.7 capability cell complete; cells co-evolve with domain observability-sensitive slices. **Do not invent** alert firings or game-day results.

### Parent framework (done)

- [x] Four categories registered: Structured signals, Alerts, Dashboards, Runbooks.
- [x] Required non-empty samples (FE reporter/redaction, requestId propagation, BE metrics, runbook index + dashboard/SLO anchors).
- [x] Parent assert suite `tests/unit/qlt-320-parent-framework.test.ts`.
- [x] CI suite guard `ci-assert-suite.mjs` `qlt-320-observability`; wired in `frontend-static` / `ci:assert:observability`.
- [x] Continuous co-evolution rule documented — domain slices expand signals/alerts/runbooks in same PR as observability-sensitive changes; canary firings/game-days co-evolve via §3.7 cells.

### Structured signals (capability cells / domain co-evolution — not claimed by parent alone)

- request ID, trace ID, release ID, route template/operation ID, surface, status/problem code, latency; *(parent samples: FE reporter, log fields, metrics)*
- actor/tenant identifiers only in approved pseudonymous form; never high-cardinality/raw PII; *(parent sample: redact)*
- payment/provider mode/account scope/reference hashed/bounded where useful;
- queue lag/retry/DLQ; callback rejection/dedupe; checkout conversion/state age; *(parent sample: BE metrics series)*
- ledger/withdrawal invariant failures; auth/CSRF/permission denials;
- contract-invalid rate; cache/SSR errors; frontend API errors by operation;
- dependency health/readiness from real adapters.

### Alerts (capability cells / domain co-evolution — not claimed by parent alone)

- paid callback not transitioning order;
- callback signature rejection spike or duplicate storm;
- provider unknown outcomes/latency;
- ledger imbalance/withdrawal reserve anomaly;
- delivery/notification/webhook queue lag/DLQ;
- login/CSRF anomaly;
- cross-tenant/permission denial anomaly;
- contract invalid after deploy;
- error budget burn/readiness failure.
*(parent registers taxonomy via `backend/docs/slo.md`; do not invent firings)*

### Dashboards (capability cells / domain co-evolution — not claimed by parent alone)

- HTTP rate/latency, payment paid, callback, webhook, outbox, audit chain panels. *(parent sample: `backend/docs/dashboards/launch-overview`)*

### Runbooks (capability cells / domain co-evolution — not claimed by parent alone)

- Xendit outage/unknown create/disbursement;
- callback backlog/replay safely; *(parent sample: callback-failure)*
- delivery/webhook DLQ; *(parent sample: queue-outbox)*
- object scanner/storage outage; *(parent sample: r2-email-health)*
- CSRF/session incident;
- credential/secret exposure;
- ledger/withdrawal containment;
- emergency switches;
- rollout rollback and data migration issue.
*(parent sample index: `backend/docs/runbooks/` + incident-diagnosis)*

### Acceptance criteria

- [x] Parent: categories + samples + CI + co-evolution documented; operator correlation path samples exist (requestId/trace without raw secret).
- [ ] Synthetic/canary event proves each critical alert reaches owner — **capability cells / ops**.
- [ ] Full signal/alert/dashboard/runbook bullets / §3.7 cells — domain co-evolution before canary.
- [ ] Runbook exercised in staging/game day — **ops / cell when claimed; do not invent results**.

---

## QLT-400 — Per-domain flags dan rollout sequence

**Priority:** P0
**Depends on:** INT-025, INT-170, QLT-320; aktivasi tiap domain juga membutuhkan domain gate pada `09-EXECUTION-STATUS.md`

### Flag principles

- One global `NEXT_PUBLIC_DATA_SOURCE` is insufficient for gradual production rollout.
- Use server-controlled/release config capability per domain/surface; build-time public flags alone cannot be emergency controls.
- Production flag off must show existing read-only/maintenance/error state—not mock business data.
- Backend authorization/state remains enforced regardless flag.
- Flag evaluation must not leak user/tenant data or cause hydration mismatch.

### Implementasi registry yang wajib

- [x] Gunakan satu typed server-owned registry yang didefinisikan oleh `INT-025`; satu key per domain (`publicCatalog`, `auth`, `checkout`, `buyer`, `sellerCatalog`, `sellerOperations`, `sellerFinance`, `adminRead`, `adminWrite`, dan key lebih sempit bila blast radius menuntutnya). *(QLT-400 parent: harness on INT-025 keys; domain cells may narrow further)*
- [x] Nilai efektif hanya `mock | api | disabled`. Production menolak `mock` saat boot/build validation; `disabled` tidak pernah melakukan fallback network ke fixture. *(parent harness + `domain-source` / `domain-flags` tests)*
- [x] Server menghitung snapshot config untuk request/tenant/allowlist dan mengirim hanya nilai public-safe yang dibutuhkan client. Jangan menyebar pembacaan `process.env` langsung di feature API atau component. *(evaluateDomainFlags + DomainSourceProvider; architecture forbids ad-hoc flags)*
- [x] Setiap feature adapter menerima source/capability melalui dependency atau accessor typed yang sama; tidak boleh memiliki helper global `isLiveApi()` yang menyalakan seluruh domain sekaligus. *(getDomainSource / withDomainSource; architecture-boundaries)*
- [x] Server Component dan client hydration memakai snapshot source yang sama. Perbedaan snapshot adalah error konfigurasi, bukan alasan untuk render mock sementara. *(DomainSourceProvider + install)*
- [x] Emergency control server-side mempunyai version, actor, reason, audit, expiry bila sementara, dan propagation SLO. Build-time env hanya default bootstrap. *(domain-flags EmergencyKillSwitch + audit event; parent only — live firings are cells/ops)*
- [x] Query key memasukkan source/tenant yang memengaruhi data; saat source berubah, cancel dan hapus cache domain terkait sebelum fetch baru. *(domainSourceKeySegment + purgeDomainCachesOnSourceChange)*
- [x] Telemetry mencatat domain, source efektif, config version, dan release—tanpa raw user/tenant data. *(buildDomainSourceTelemetry)*
- [x] Unit test mencakup precedence default/allowlist/emergency, production-mock rejection, disabled behavior, hydration parity, cache cleanup, dan unknown key fail-closed. *(domain-source.test.ts + domain-flags.test.ts + qlt-400-parent-framework)*
- [x] Architecture test melarang import mock/fixture dari API branch dan melarang pembacaan flag ad hoc di screen/hook. *(architecture-boundaries; continuous co-evolution via cells)*

### Recommended sequence

1. Contract/UI freeze + foundation in shadow/non-user path.
2. Public catalog reads.
3. Auth/session/current-store with no money mutation.
4. Checkout sandbox internal canary.
5. Buyer purchases/profile/security/delivery.
6. Seller read-only domains.
7. Seller catalog/inventory/storefront mutations.
8. Seller finance/withdrawal after real provider/callback gate.
9. Admin read-only.
10. Admin mutations by permission group, highest-risk last.
11. Global API default only after all active surface flags migrated.

### Per-stage checks

- internal staff -> selected test tenants -> small percentage/allowlist -> broader canary -> full;
- compare API vs mock normalized view only in safe non-authoritative test/shadow environment, never show fallback mock to production user;
- monitor latency/error/contract-invalid/auth/tenant/provider/business invariants;
- explicit go/no-go owner and observation window;
- one domain at a time for high-risk mutation.

### Acceptance criteria

- Each domain can be stopped independently without reverting database facts.
- Flag off does not reintroduce fake paid/balance/permission/secret state.
- Kill switch dapat dibuktikan lewat test: request baru berhenti mencapai adapter domain yang dinonaktifkan dalam propagation SLO, sementara domain lain tetap berjalan.

---

## QLT-410 — Database/API deploy dan rollback strategy

**Priority:** P0
**Depends on:** INT-000; INT-180 **if live migration/runtime dependency**; QLT-210 framework; changed migration/domain gets a matching cell

### Expand-contract migration (parent registration)

1. Add backward-compatible columns/tables/indexes/endpoint fields.
2. Deploy backend that writes/reads compatible forms.
3. Backfill with bounded observable job.
4. Deploy frontend/consumer using new contract.
5. Observe and remove old compatibility only after rollback window.

*(QLT-410 parent: steps registered in `docs/QLT-410-DEPLOY-ROLLBACK-COEVOLUTION.md`; domain cells prove per-migration path)*

### Rules

- [x] Never tie frontend rollback to destructive migration down. *(parent: code/flags + immutable image only; canary-rollback sample)*
- [x] Old backend/worker compatibility across rolling window documented. *(parent: topology + co-evolution rule)*
- [x] Worker/API deploy order and outbox schema compatibility tested. *(parent sample: topology migrate-then-roll; foundation outbox/idempotency; domain cells extend)*
- [ ] Long index/backfill lock/load rehearsed. *(capability cells / ops — do not invent)*
- [x] Migration checksum/version and restore point captured. *(parent samples: migrate version + backup-restore runbook)*
- [x] Provider callback remains accepted during deploy/rollback. *(parent rule + canary-rollback dual-compatible callback path)*
- [x] Idempotency results and state machine semantics stable across versions. *(QLT-210 foundation samples; domain cells co-evolve)*
- [x] Immutable prior FE/BE image digest available. *(parent: canary-rollback image roll)*
- [x] Rollback does not undo committed order/payment/ledger; it changes code/flags only. *(parent hard rule)*
- [x] CI suite guard `ci-assert-suite.mjs` `qlt-410-deploy`; wired in `frontend-static` / `ci:assert:deploy`.

### Acceptance criteria

- [x] Parent: expand-contract steps + hard rules + samples + CI + co-evolution documented.
- [ ] Staging rolling deploy + rollback rehearsal succeeds under traffic/callback/worker load — **capability cells / ops**.
- [ ] No dropped callback/outbox/double processing — **cell/ops rehearsal; do not invent results**.
- [ ] §3.7 QLT-410 cells — domain co-evolution when schema/API changes.

---

## QLT-420 — Cutover and post-cutover cleanup

**Priority:** P1 after stable rollout
**Depends on:** QLT-105 framework plus selected QLT-105/220/230/300/310/320/400/410 cells for every launch domain (activation gates; parent harness co-evolves)

Parent framework (cutover checklist + post-cutover cleanup registration/CI/co-evolution) completed 2026-07-17 — see `docs/QLT-420-CUTOVER-COEVOLUTION.md` and `TASK/evidence/QLT-420/`. Parent `[x]` does **not** mark G0..G8 green, live canary done, full-cutover stage, or §3.7 cells; those remain open until ops/domain evidence.

### Cutover checklist (parent registration)

- [x] Categories registered: G0..G8, on-call/dashboards/alerts/credentials/backup, health/readiness/synthetic, flags/canary/rollback, release bundling, owner communication. *(parent: `docs/QLT-420-CUTOVER-COEVOLUTION.md`; gate green is ops/cells)*
- [x] Sample anchors non-empty: readiness-checklist, canary-rollback, e2e-acceptance. *(parent samples)*
- [ ] All `G0..G8` master gates green. *(ops — do not invent)*
- [ ] On-call, dashboards, alerts, provider credentials/mode, backup/PITR verified. *(ops)*
- [ ] Real health/readiness green and synthetic checkout/auth/notification/withdrawal-safe test passes. *(ops / cells)*
- [x] Feature flags/canary cohort/rollback commands documented. *(parent samples: canary-rollback + QLT-400; live canary still ops)*
- [x] No high-risk migration or unrelated UI release bundled. *(parent rule + QLT-410 co-evolution)*
- [x] Product/support/finance/security owners informed with request ID/runbook process. *(parent category + readiness owner-sign process; live sign-off is ops)*

### Cleanup after observation window (parent registration)

- [x] Remove obsolete API compatibility aliases only after usage zero and deprecation window. *(parent rule registered; execution is post-observation)*
- [x] Tighten architecture test: API-mode presentation cannot import mock/demo IDs/local authority. *(parent sample: `architecture-boundaries.test.ts`)*
- [x] Retain mock mode only as explicit prototype/test adapter; tree/path must never be selected live. *(parent: domain-source production rejection + architecture ban)*
- [x] Update stale root/backend README and progress docs to truthful state. *(parent rule; truth-up is post-observation)*
- [x] Archive rollout flags after all clients stable; retain emergency business switches. *(parent rule + QLT-400 kill retained)*
- [x] Review cache/log/telemetry retention and delete test artefacts/secrets. *(parent rule)*
- [x] CI suite guard `ci-assert-suite.mjs` `qlt-420-cutover`; wired in `frontend-static` / `ci:assert:cutover`.

### Acceptance criteria

- [x] Parent: cutover categories + cleanup rules + samples + CI + co-evolution documented.
- [ ] G0..G8 green and live canary/full cutover — **ops / stage rows; do not invent**.
- [ ] Post-observation cleanup executed for all launch domains — **ops after stability**.
- [ ] §3.7 / domain cells for launch surfaces — **remain separate; parent does not aggregate green**.

---

## QLT-490 — Final program Definition of Done

Semua item wajib:

### Contract/architecture

- [ ] OpenAPI valid, linted, generated, router-covered, no dirty drift.
- [ ] Every active UI operation has row/disposition in endpoint matrix.
- [ ] Screen imports hooks/contracts only; URLs/DTO/mock absent from presentation.
- [ ] Runtime schema + mapper for every live response.

### UI

- [ ] No unauthorized redesign/component duplication/UI kit.
- [ ] Existing route/copy/style/responsive/theme preserved.
- [ ] Mock and API-seeded visual suites zero unexpected diff.
- [ ] Loading/empty/error/permission/conflict/pending states use existing components.

### Security/authority

- [ ] Session/CSRF hard refresh and route guards work.
- [ ] Store/buyer/admin/impersonation authorization negative tests complete.
- [ ] Browser never controls paid/price/fee/ledger/withdrawal/permission/secret eligibility.
- [ ] Secret/PII policies verified across cache/storage/log/URL/telemetry/artefacts.
- [ ] Real adapter/callback/scanner/mail/queue/Redis readiness gates pass live config.

### Reliability/data

- [ ] Idempotency/concurrency/unknown outcome/state transitions tested.
- [ ] Ledger/order/payment/delivery/audit invariants remain atomic/append-only.
- [ ] Provider duplicate/late/forged events safe.
- [ ] Migration/backup/restore/rolling rollback rehearsed.

### Quality/operations

- [ ] FE static/unit/build/mock E2E/API E2E/a11y/visual pass.
- [ ] Go format/vet/unit/race/integration/build pass.
- [ ] Contract/security/performance/resilience gates pass.
- [ ] Dashboards/alerts/runbooks/on-call/canary/kill switches ready.
- [ ] No live fallback to mock and no demo identifier/secret/business truth.

Only after `QLT-490` may the project claim frontend and backend are fully wired for production.
