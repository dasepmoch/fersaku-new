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
- [ ] Required checks branch protection; no “continue-on-error” for P0 gates.

### Acceptance criteria

- Workflow syntax valid; frontend runs dari root; backend memakai exact Go version; cache/lockfile paths benar.
- Existing frontend static/unit/build/mock suites dan backend unit checks yang memang tersedia berjalan dari clean checkout.
- Placeholder job tidak mengklaim pass untuk contract/integration/API E2E yang belum dibuat; dependency ke `QLT-105` tercatat.

---

## QLT-105 — Aktifkan seluruh CI gate sebagai required checks

**Priority:** P0 sebelum setiap domain/capability canary dan full cutover
**Depends on:** QLT-100, INT-000, INT-010, QLT-110, QLT-215. `QLT-200/210` framework dan capability quality cells co-evolve; cells wajib required-check sebelum canary, tetapi bukan hard dependency balik ke parent `QLT-105`.

### Checklist

- [ ] Aktifkan OpenAPI lint/bundle/codegen dirty-diff/router coverage setelah `INT-000/010`.
- [ ] Aktifkan backend tagged integration setelah `QLT-210` framework/environment stabil dan instance capability terkait siap.
- [ ] Aktifkan API-mode Playwright harness setelah `QLT-110/215`; tambahkan project/test dan required-check instance **sebelum** capability canary, bukan setelah rollout.
- [ ] Aktifkan mock smoke/critical/a11y/visual dan API visual/a11y yang relevan.
- [ ] Jadikan security/contract/tenant/idempotency negative tests required, bukan optional/continue-on-error.
- [ ] Branch protection mengharuskan gate yang relevan untuk changed domain; full matrix required untuk release branch/cutover.

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
| Admin super | MFA, all test permissions |
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

- [ ] Expand `vitest.config.ts` include secara bertahap dari snapshot HTTP client/pagination-only ke seluruh live feature adapters, schemas, mappers, query policies, session/source registry, dan pure security helpers.
- [ ] Threshold tidak boleh memberi false confidence karena hanya dua file masuk denominator; report per critical directory/domain.
- [ ] Exclude generated code, visual-only components, mock fixtures, dan config hanya dengan alasan tertulis; generated contract diuji provider/drift, bukan line coverage.
- [ ] Coverage adalah signal tambahan, bukan pengganti negative/integration/E2E tests.

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
- [ ] CSRF/recent MFA/reason/idempotency/version where required.
- [ ] State transition/concurrency/duplicate/replay.
- [ ] Audit/outbox/transaction rollback.
- [ ] Redaction/no secret logging.

### Contract compatibility strategy

- Generate raw DTO fixtures from OpenAPI examples or schema-valid builders.
- Provider test: Go presenter response validates OpenAPI schema.
- Consumer test: raw response maps to existing FE view model.
- Mock/API parity: semantically equivalent fixture yields equal normalized view object, except fields explicitly nonvisual/authority-only.

### Acceptance criteria

- A backend field rename/removal breaks provider/consumer CI before runtime.
- No mapper silently fills authoritative required data with mock/default success value.

---

## QLT-210 — Backend integration/database tests

**Priority:** P0
**Depends on:** QLT-100 dan foundation/domain migration yang sedang diuji; berjalan bersama setiap backend slice

### Coverage areas

- [ ] Migrations apply from empty DB and upgrade supported previous schema.
- [ ] Unique/foreign/check/deferred/immutability constraints.
- [ ] Store membership/foreign tenant returns safe 404.
- [ ] Buyer ownership and admin permission projections.
- [ ] Idempotency same/different body and concurrent requests.
- [ ] Optimistic concurrency/ETag.
- [ ] Inventory reservation/import/reveal/revoke.
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

- App role cannot mutate ledger/audit immutable tables outside approved functions.
- Migration role separated from app role.
- Transaction failure rolls back domain/idempotency/outbox/audit together.
- Backup/PITR/restore rehearsal tracked outside unit CI but before live.

### Acceptance criteria

- Tagged integration is required CI and repeatable.
- Race/concurrency cases use actual concurrent transactions, not only sequential mocks.

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

### Project setup

- [ ] Add distinct Playwright project/config/env for mock and API mode; register each capability instance in `09-EXECUTION-STATUS.md`.
- [ ] API project starts/reuses isolated stack, migrations, seed, backend health/readiness, Next.
- [ ] Authentication setup uses actual UI/API flow; state files contain only ephemeral test cookies and are secured/cleaned.
- [ ] Tests do not call internal DB to force success except fixture setup/provider callback helper with explicit test-only boundary.
- [ ] Trace/screenshot excludes secret reveal/claim raw values or masks them.

### Public/checkout flow

- public storefront/product;
- create intent, QR pending, signed test callback, paid;
- failure never paid;
- tampered total ignored;
- double-click one order;
- refresh/offline/expiry recovery;
- order result capability, delivery access, invoice verify.

### Buyer flow

- magic request/mail fragment consume;
- purchases/detail/delivery/review;
- profile conflict;
- sessions revoke/logout;
- owner vs other buyer denial.

### Seller flow

- register/verify/login/MFA;
- onboarding/current store;
- product create/upload/inventory/publish;
- order/customer/review;
- storefront draft conflict/publish;
- finance/withdrawal quote/reauth/create;
- webhook/key one-time claim cleanup;
- foreign store denial.

### Admin flow

- login/MFA/route permission;
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

- API mode has no network request to mock simulator/fixture endpoint.
- Tests assert backend state/response and user-visible existing state.
- Negative security cases are first-class, not only happy path.

---

## QLT-230 — Visual, responsive, accessibility, dan interaction parity

**Priority:** P0 UI contract
**Depends on:** UI-000, UI-050, UI-060, QLT-100; API-state parity per domain juga membutuhkan QLT-110, QLT-215, dan domain task terkait

### Visual

- [ ] Mock baseline routes pass desktop/mobile without snapshot update.
- [ ] Run same visual routes with API seed normalized to equivalent view.
- [ ] Add characterization snapshots only for touched high-risk routes not covered, in a separate reviewed baseline step before wiring.
- [ ] Compare loading/empty/error/long-data states at both widths.
- [ ] No layout shift during hydration/background refresh.

### Accessibility

- [ ] Existing axe suite plus auth/checkout/dialog/secret/error API states.
- [ ] Pending state: correct disabled/`aria-busy`, no double submit.
- [ ] Error: `role=alert`/described-by/focus first invalid using existing controls.
- [ ] Dialog: focus trap/return/Escape/label.
- [ ] Polling: no repeated live-region announcements.
- [ ] Table/pagination/filter keyboard semantics unchanged.
- [ ] Secret copy/reveal TTL communicated through existing semantics without leaking to accessibility tree after clear.

### Interaction

- [ ] Critical flow existing tests continue in mock mode.
- [ ] API-mode equivalent asserts no fake timer/success.
- [ ] Theme/profile/notification menus retain behavior and server actions.

### Acceptance criteria

- Zero unexpected pixel diff.
- No new serious/critical axe violation.
- Keyboard-only user can complete the same flows.

---

## QLT-300 — Security/privacy verification matrix

**Priority:** P0

### Identity/session

- session fixation/rotation/logout/revoke;
- cookie flags/domain/path/same-site;
- surface confusion buyer/seller/admin;
- CSRF missing/invalid/cross-session/cross-origin/refetch;
- stale/expired/revoked HttpOnly cookie must not permanently block login, magic/reset/invite consume, or logout; verify narrowly scoped recovery still rejects cross-site unsafe requests;
- MFA missing/expired/replay/wrong purpose;
- pre-enrollment ticket for invited/admin user and recent-proof mint/exchange purpose/TTL/replay;
- safe returnTo/open redirect;
- magic/reset/invite fragment scrub/replay/scanner.

### Authorization

- owner/member/foreign store for every store resource;
- buyer owner/non-owner;
- admin direct route/action with/without permission;
- permission changes/stale session;
- impersonation scope/TTL/termination/no chaining;
- object/invoice/order enumeration.

### Money/state

- tampered price/fee/amount/status;
- integer/fractional/overflow boundaries;
- duplicate idempotency/same key different body;
- concurrent stock/coupon/withdrawal;
- callback forged/replayed/out-of-order/account-mode mismatch;
- unknown provider outcome/no duplicate charge/release.

### Secret/data

- API/webhook/inventory/delivery/MFA/KYC/signed URL never in URL, browser persistent storage, query cache, logs, traces, analytics, screenshots;
- explicit reveal/claim one-time/TTL/wrong user;
- SSR/CDN/private cache bleed;
- PII redaction/export scope/notification target;
- upload MIME spoof/malware/checksum/SSRF.

### Abuse/resilience

- distributed rate limits login/MFA/checkout/reveal/admin/callback/upload/export;
- request/body/upload bounds;
- timeouts/cancellation/backpressure/retry storm;
- provider/dependency outage/readiness honesty;
- audit immutability/integrity.

### Acceptance criteria

- P0 security suite automated where possible; manual penetration checklist/evidence for browser/provider flows.
- No known high/critical issue accepted without explicit owner, expiry, compensating control, and go-live approval.

---

## QLT-310 — Performance dan “smooth” behavior budget

**Priority:** P1

### Frontend interaction targets

Targets harus dikonfirmasi dengan actual baseline/SLO, tetapi gunakan guard berikut:

- search debounce sekitar 250–400 ms; request sebelumnya dibatalkan;
- no overlapping checkout polls; visible pending poll bounded, hidden tab strongly reduced;
- background refetch keeps previous content;
- exact cache invalidation, not whole-console refetch;
- list page bounded server limit; no fetch-all;
- large upload direct-to-object storage with progress/cancel;
- charts receive bounded aggregated series, not raw transaction history;
- Server Components private fetch no shared cache and no waterfall where queries independent;
- query/mutation timeout per operation class, not one indiscriminate value for upload/export/provider.

### Backend budgets/tests

- Define SLO per read/write/payment/callback and measure p50/p95/p99.
- Explain query plans/indexes for seller/admin filters and cursor.
- N+1 detector/query count tests for order/customer/review/inventory read models.
- Connection pool budgets across API/worker replicas.
- Load test checkout create/status/callback, seller/admin lists, notifications, webhook worker.
- Backpressure and graceful degradation; readiness/load shedding as designed.

### UX smoothness acceptance

- No flash from mock -> real data.
- No stale tenant/actor row.
- Filter result race cannot revert UI.
- Button only locks relevant operation and recovers on error.
- Polling/upload timers abort on unmount.
- Layout and scroll/focus position remain stable on background updates.

---

## QLT-320 — Observability, alerts, dashboards, runbooks

**Priority:** P0 before live

### Structured signals

- request ID, trace ID, release ID, route template/operation ID, surface, status/problem code, latency;
- actor/tenant identifiers only in approved pseudonymous form; never high-cardinality/raw PII;
- payment/provider mode/account scope/reference hashed/bounded where useful;
- queue lag/retry/DLQ; callback rejection/dedupe; checkout conversion/state age;
- ledger/withdrawal invariant failures; auth/CSRF/MFA/permission denials;
- contract-invalid rate; cache/SSR errors; frontend API errors by operation;
- dependency health/readiness from real adapters.

### Alerts

- paid callback not transitioning order;
- callback signature rejection spike or duplicate storm;
- provider unknown outcomes/latency;
- ledger imbalance/withdrawal reserve anomaly;
- delivery/notification/webhook queue lag/DLQ;
- login/MFA/CSRF anomaly;
- cross-tenant/permission denial anomaly;
- contract invalid after deploy;
- error budget burn/readiness failure.

### Runbooks

- Xendit outage/unknown create/disbursement;
- callback backlog/replay safely;
- delivery/webhook DLQ;
- object scanner/storage outage;
- CSRF/session incident;
- credential/secret exposure;
- ledger/withdrawal containment;
- emergency switches;
- rollout rollback and data migration issue.

### Acceptance criteria

- Synthetic/canary event proves each critical alert reaches owner.
- Operator can trace UI request -> Go -> DB/outbox/worker/provider without raw secret.
- Runbook exercised in staging/game day.

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

- [ ] Gunakan satu typed server-owned registry yang didefinisikan oleh `INT-025`; satu key per domain (`publicCatalog`, `authSeller`, `authBuyer`, `checkout`, `buyer`, `sellerRead`, `sellerCatalog`, `sellerFinance`, `adminRead`, `adminMutations`, dan key lebih sempit bila blast radius menuntutnya).
- [ ] Nilai efektif hanya `mock | api | disabled`. Production menolak `mock` saat boot/build validation; `disabled` tidak pernah melakukan fallback network ke fixture.
- [ ] Server menghitung snapshot config untuk request/tenant/allowlist dan mengirim hanya nilai public-safe yang dibutuhkan client. Jangan menyebar pembacaan `process.env` langsung di feature API atau component.
- [ ] Setiap feature adapter menerima source/capability melalui dependency atau accessor typed yang sama; tidak boleh memiliki helper global `isLiveApi()` yang menyalakan seluruh domain sekaligus.
- [ ] Server Component dan client hydration memakai snapshot source yang sama. Perbedaan snapshot adalah error konfigurasi, bukan alasan untuk render mock sementara.
- [ ] Emergency control server-side mempunyai version, actor, reason, audit, expiry bila sementara, dan propagation SLO. Build-time env hanya default bootstrap.
- [ ] Query key memasukkan source/tenant yang memengaruhi data; saat source berubah, cancel dan hapus cache domain terkait sebelum fetch baru.
- [ ] Telemetry mencatat domain, source efektif, config version, dan release—tanpa raw user/tenant data.
- [ ] Unit test mencakup precedence default/allowlist/emergency, production-mock rejection, disabled behavior, hydration parity, cache cleanup, dan unknown key fail-closed.
- [ ] Architecture test melarang import mock/fixture dari API branch dan melarang pembacaan flag ad hoc di screen/hook.

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

### Expand-contract migration

1. Add backward-compatible columns/tables/indexes/endpoint fields.
2. Deploy backend that writes/reads compatible forms.
3. Backfill with bounded observable job.
4. Deploy frontend/consumer using new contract.
5. Observe and remove old compatibility only after rollback window.

### Rules

- [ ] Never tie frontend rollback to destructive migration down.
- [ ] Old backend/worker compatibility across rolling window documented.
- [ ] Worker/API deploy order and outbox schema compatibility tested.
- [ ] Long index/backfill lock/load rehearsed.
- [ ] Migration checksum/version and restore point captured.
- [ ] Provider callback remains accepted during deploy/rollback.
- [ ] Idempotency results and state machine semantics stable across versions.
- [ ] Immutable prior FE/BE image digest available.
- [ ] Rollback does not undo committed order/payment/ledger; it changes code/flags only.

### Acceptance criteria

- Staging rolling deploy + rollback rehearsal succeeds under traffic/callback/worker load.
- No dropped callback/outbox/double processing.

---

## QLT-420 — Cutover and post-cutover cleanup

**Priority:** P1 after stable rollout

### Cutover checklist

- [ ] All `G0..G8` master gates green.
- [ ] On-call, dashboards, alerts, provider credentials/mode, backup/PITR verified.
- [ ] Real health/readiness green and synthetic checkout/auth/notification/withdrawal-safe test passes.
- [ ] Feature flags/canary cohort/rollback commands documented.
- [ ] No high-risk migration or unrelated UI release bundled.
- [ ] Product/support/finance/security owners informed with request ID/runbook process.

### Cleanup after observation window

- [ ] Remove obsolete API compatibility aliases only after usage zero and deprecation window.
- [ ] Tighten architecture test: API-mode presentation cannot import mock/demo IDs/local authority.
- [ ] Retain mock mode only as explicit prototype/test adapter; tree/path must never be selected live.
- [ ] Update stale root/backend README and progress docs to truthful state.
- [ ] Archive rollout flags after all clients stable; retain emergency business switches.
- [ ] Review cache/log/telemetry retention and delete test artefacts/secrets.

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

- [ ] Session/CSRF/MFA hard refresh and route guards work.
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
