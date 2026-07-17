# Execution Status, Dependency, Ownership, and Evidence Registry

Dokumen ini adalah **manifest operasional tunggal** untuk mengambil, mengklaim, memblokir, dan menyelesaikan task. Detail implementasi tetap berada pada dokumen task masing-masing; status yang tersebar di heading/checklist domain tidak menggantikan registry ini.

> Snapshot awal: 17 Juli 2026. Semua row sengaja dimulai `[ ]` karena audit/dokumentasi bukan evidence implementasi. Agent harus memverifikasi repository saat claim.

## 1. Protocol status yang wajib

| Marker | Arti | Field wajib |
| --- | --- | --- |
| `[ ]` | Belum diambil | `Active claim` harus `—`; evidence boleh berisi baseline audit. |
| `[~]` | Sedang dikerjakan | actor/agent, branch/worktree, timestamp WIB, intended files, execution-note link. |
| `[x]` | Selesai | commit/path, exact test result, contract/security/visual evidence, rollout/rollback bila relevan. |
| `[!]` | Blocked | blocker konkret, dependency/decision owner, bukti percobaan, pertanyaan atau perubahan state yang diperlukan. |

Aturan claim:

1. Semua **hard dependency** pada kolom `Depends on` harus `[x]`. Teks `co-evolve` berarti kedua owner boleh bekerja paralel tetapi wajib menyepakati contract/fixture boundary sebelum edit. Notasi conditional harus dibaca secara eksplisit: `if <capability> active`/`before live <capability>` wajib `[x]` hanya ketika capability itu dipilih `IMPLEMENT` atau live; jika tidak, evidence harus menunjuk disposition `DISABLED/OUT-OF-SCOPE` pada dokumen 10. `framework` berarti parent quality harness yang tidak menunggu cells; `selected <capability> cell` berarti hard gate hanya pada stage/canary capability tersebut. `changed migration/domain` berarti buat/claim cell `QLT-410` untuk domain yang berubah, bukan menunggu seluruh program. `all launch domains` hanya berlaku untuk aggregate/full-cutover, bukan pilot pertama.
2. Ubah satu row menjadi `[~]` sebelum mengedit. Format claim: `@agent · branch · YYYY-MM-DD HH:mm WIB · files: ...`.
3. Jangan mengambil row dengan active claim. Claim yang tampak stale tidak boleh ditimpa otomatis; verifikasi branch/status dan lakukan handoff eksplisit.
4. Satu agent menjadi owner akhir satu row. Reviewer boleh membantu tanpa mengambil ownership, tetapi tidak boleh mengedit shared hotspot bersamaan.
5. Evidence harus berupa link/path yang dapat diperiksa. “Implemented”, “tested”, screenshot baseline yang di-update, atau CI job kosong bukan evidence.
6. Status `[x]` berarti implementasi task dan task-scoped acceptance/negative tests selesai; ia **tidak otomatis mengaktifkan production flag**. Activation/canary gate pada bagian 4 harus lulus separately. Quality IDs `QLT-105/200/210/220/230/300/310/320/400/410` memiliki dua level: parent row `[x]` hanya berarti reusable framework/harness/guard siap (dengan smoke evidence), sedangkan capability cells di §3.7 membuktikan domain-specific run. Jangan membuat parent bergantung pada descendant cells; aggregate/canary gate-lah yang menunggu cells.
7. Bila task mengubah dependency atau menemukan drift, update task detail, matrix `06`, registry ini, dan tests dalam slice yang sama.

## 2. Lane dan batas ownership

| Lane | Ownership canonical | Tidak boleh dikerjakan diam-diam |
| --- | --- | --- |
| `UX` | baseline, characterization, parity review, exception register | redesign, snapshot update untuk menutupi diff |
| `FND` | OpenAPI, generated transport, HTTP clients, source registry, session/CSRF/MFA/tenant/cache | screen/domain business mapping tanpa handoff |
| `RTM` | provider, callback, queue, scanner, scheduler, readiness | UI success simulation atau domain DTO |
| `PUB` | public/auth/checkout/buyer feature adapters dan existing screens | shared session/proof/media/notification primitive tanpa owner terkait |
| `SEL` | seller feature adapters, backend store operations, existing seller screens | shared foundation/generated files |
| `ADM` | admin RBAC/read/command adapters, backend admin operations, existing admin screens | weakening backend guards karena control disembunyikan |
| `QA` | CI, seed harness, integration/E2E/security/performance/rollout evidence | membuat production behavior hanya agar test hijau |

Shared hotspot mempunyai single-writer rule:

- `backend/api/openapi.yaml` dan generated DTO/schema: owner aktif `INT-000/INT-010` saja; domain memberi operation patch melalui owner tersebut.
- `shared/api/**`, proxy/env, source registry: owner aktif foundation terkait.
- session/CSRF/MFA/tenant primitives: `INT-120..INT-150`; profile domain hanya menjadi consumer.
- reusable auth ceremony: `AUT-120`; personal media: `INT-175`; notification center: `BUY-140`.
- runtime adapter/scheduler: `INT-180/INT-185`; deterministic persona/seed: `QLT-110`; API Playwright orchestration: `QLT-215`.
- Jika dua task perlu file yang sama, satu menjadi writer dan task lain mencatat dependency/handoff. Jangan menyelesaikan konflik dengan duplicate helper/component.

## 3. Registry task

### 3.1 UI contract

| Status | ID | Priority | Depends on | Lane | Active claim | Unlocks/output | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `[x]` | `UI-000` | P0 | — | UX | completed @nikki/opencode · 2026-07-17 11:48 WIB · claim released | G0 baseline, route/component characterization | TASK/evidence/UI-000/20260717-1143-nikki.md |
| `[x]` | `UI-010` | P0 | UI-000 | UX | completed @nikki/opencode · 2026-07-17 11:50 WIB · claim released | Frozen visual scope | TASK/evidence/UI-010/20260717-1150-nikki.md · frozen-scope-checklist.md · frozen-scope.json |
| `[x]` | `UI-020` | P0 | UI-000 | UX | completed @nikki/opencode · 2026-07-17 11:51 WIB · claim released | Wiring-only change policy | TASK/evidence/UI-020/20260717-1151-nikki.md · wiring-only-policy.md |
| `[x]` | `UI-030` | P0 | UI-000 | UX | completed @nikki/opencode · 2026-07-17 11:52 WIB · claim released | Exact component reuse registry | TASK/evidence/UI-030/20260717-1152-nikki.md · component-reuse-registry.md |
| `[x]` | `UI-040` | P0 | UI-000 | UX/FND | completed @nikki/opencode · 2026-07-17 11:53 WIB · claim released | DTO-to-view parity rule | TASK/evidence/UI-040/20260717-1153-nikki.md · dto-view-parity.md |
| `[x]` | `UI-050` | P0 | UI-000, UI-030 | UX/FND | completed @nikki/opencode · 2026-07-17 11:54 WIB · claim released | Existing lifecycle-state mapping | TASK/evidence/UI-050/20260717-1154-nikki.md · lifecycle-state-map.md |
| `[x]` | `UI-060` | P0 | UI-000, UI-030 | UX | completed @nikki/opencode · 2026-07-17 11:55 WIB · claim released | Responsive/a11y/motion invariant | TASK/evidence/UI-060/20260717-1155-nikki.md · invariants.md |
| `[x]` | `UI-070` | P0 | UI-000 | UX | completed @nikki/opencode · 2026-07-17 11:56 WIB · claim released | Visual-risk file register | TASK/evidence/UI-070/20260717-1156-nikki.md · visual-risk-files.md |
| `[x]` | `UI-080` | P0/decision | UI-000, UI-030 | UX | completed @nikki/opencode · 2026-07-17 11:57 WIB · claim released | Controlled UI exception only | TASK/evidence/UI-080/20260717-1157-nikki.md · exception-register.md (zero approved) |
| `[x]` | `UI-090` | Continuous | UI-010..UI-080 | UX/QA | completed @nikki/opencode · 2026-07-17 11:58 WIB · claim released | Per-PR no-UI-change review | TASK/evidence/UI-090/20260717-1158-nikki.md · pr-no-ui-change-checklist.md |

### 3.2 Foundation, identity, tenant, and runtime

| Status | ID | Priority | Depends on | Lane | Active claim | Unlocks/output | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `[x]` | `INT-000` | P0 | UI-000 | FND | completed @nikki/opencode · 2026-07-17 12:00 WIB · claim released | Valid OpenAPI 3.0.3 + router drift gate (G1) | TASK/evidence/INT-000/20260717-1200-nikki.md |
| `[x]` | `INT-010` | P0 | INT-000 | FND | completed @nikki/opencode · 2026-07-17 12:05 WIB · claim released | Generated transport/runtime schemas | TASK/evidence/INT-010/20260717-1205-nikki.md · shared/api/generated · shared/api/schemas.ts · features/catalog/mappers.ts |
| `[x]` | `INT-020` | P0 | INT-000 | FND | completed @nikki/opencode · 2026-07-17 12:07 WIB · claim released | HTTP/error/pagination/version contract | TASK/evidence/INT-020/20260717-1207-nikki.md · shared/api/problem-codes.ts · error-policy.ts · pagination.ts · idempotency.ts · http-semantics.ts · tests/unit/int-020-semantics.test.ts |
| `[x]` | `INT-025` | P0 | INT-000, INT-020 | FND | completed @nikki/opencode · 2026-07-17 12:15 WIB · claim released | Typed per-domain `mock/api/disabled` registry | TASK/evidence/INT-025/20260717-1215-nikki.md · shared/data/domain-source.ts · shared/data/domain-source-provider.tsx |
| `[x]` | `INT-030` | P0 | INT-000 | FND | completed @nikki/opencode · 2026-07-17 12:30 WIB · claim released | Same-origin browser + server-only topology | TASK/evidence/INT-030/20260717-1230-nikki.md · topology.md · next.config.ts · shared/config/env.ts · shared/api/http-client.ts |
| `[x]` | `INT-100` | P0 | INT-010, INT-020, INT-030 | FND | completed @nikki/opencode · 2026-07-17 12:18 WIB · claim released | Hardened browser transport (G2) | TASK/evidence/INT-100/20260717-1218-nikki.md · shared/api/http-client.ts · api-error.ts · schemas.ts · features/**/api.ts · tests/unit/http-client.test.ts · architecture-boundaries.test.ts |
| `[x]` | `INT-110` | P0 | INT-030, INT-100 | FND | completed @nikki/opencode · 2026-07-17 12:25 WIB · claim released | Cookie-forwarding private SSR client | TASK/evidence/INT-110/20260717-1225-nikki.md · shared/api/server-http-client.ts · server-cookie-forward.ts · SERVER-SSR-POLICY.md · tests/unit/server-*.test.ts |
| `[x]` | `INT-130` | P0 | INT-000, INT-030 | FND | completed @nikki/opencode · 2026-07-17 12:30 WIB · claim released | Recoverable session-bound CSRF | TASK/evidence/INT-130/20260717-1230-nikki.md · shared/api/csrf.ts · middleware/csrf.go · auth RotateSessionCSRF · tests/unit/csrf.test.ts |
| `[x]` | `INT-120` | P0 | INT-025, INT-100, INT-110, INT-130 | FND | completed @nikki/opencode · 2026-07-17 12:33 WIB · claim released | Session/bootstrap/claims/guards | TASK/evidence/INT-120/20260717-1233-nikki.md |
| `[x]` | `INT-140` | P0 | INT-120, INT-130 | FND | completed @nikki/opencode · 2026-07-17 12:39 WIB · claim released | Pre-MFA global gate + recent proof | TASK/evidence/INT-140/20260717-1239-nikki.md |
| `[x]` | `INT-150` | P0 | INT-120 | FND | completed @nikki/opencode · 2026-07-17 12:45 WIB · claim released | Membership capabilities/current store/tenant guards | TASK/evidence/INT-150/20260717-1245-nikki.md |
| `[x]` | `INT-160` | P1 | INT-100, INT-120, INT-150 | FND | completed @nikki/opencode · 2026-07-17 · claim released | Safe query/cache/mutation/idempotency policy | TASK/evidence/INT-160/20260717-1300-nikki.md · shared/query/* · tests/unit/int-160-query-mutation.test.ts |
| `[x]` | `INT-170` | P1 | INT-100, INT-120, UI-050 | FND | completed @nikki/opencode · 2026-07-17 · claim released | Error/redaction/mock reachability boundary | TASK/evidence/INT-170/20260717-1300-nikki.md · shared/observability/* · shared/data/mock-interaction.ts · shared/api/error-presentation.ts · tests/unit/int-170-error-mock-observability.test.ts · architecture-boundaries.test.ts |
| `[x]` | `INT-175` | P1 | INT-000, INT-120; INT-180/185 if capability active | FND/RTM | completed @nikki/opencode · 2026-07-17 · claim released | User-scoped personal media: launch DISABLED/OUT-OF-SCOPE + store-object forbid gate | TASK/evidence/INT-175/20260717-1257-nikki.md · tests/unit/architecture-boundaries.test.ts |
| `[x]` | `INT-180` | P0 live | INT-000, INT-030 | RTM | completed @nikki/opencode · 2026-07-17 · claim released | Real adapters, callback security, truthful G4 | TASK/evidence/INT-180/20260717-int180-nikki.md |
| `[x]` | `INT-185` | P0 live | INT-150, INT-180 | RTM | completed @nikki/opencode · 2026-07-17 · claim released | HA scheduler/lifecycle jobs | TASK/evidence/INT-185/20260717-int185-nikki.md |
| `[x]` | `INT-190` | P0 | INT-010, INT-020, INT-025, INT-030, INT-100, INT-110, INT-120, INT-130, INT-140, INT-150, QLT-110, QLT-215; co-evolve AUT-100/PUB-100/SEL-100 | FND/QA | completed @nikki/opencode · main · 2026-07-17 · claim released | First public + authenticated API vertical slice | TASK/evidence/INT-190/20260717-int190-nikki.md · responses/* · playwright-int190.log · tests/e2e/api/int-190-vertical-slice.spec.ts |

### 3.3 Public, auth, checkout, and buyer

| Status | ID | Priority | Depends on | Lane | Active claim | Unlocks/output | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `[x]` | `AUT-100` | P0 | INT-010, INT-020, INT-025, INT-100, INT-110, INT-120, INT-130, INT-140; co-evolve INT-190 | PUB | completed @nikki/opencode · main · 2026-07-17 13:19 WIB · claim released | Seller register/login/session/logout | TASK/evidence/AUT-100/20260717-1319-nikki.md · features/auth · components/auth-form.tsx · tests/unit/aut-100-seller-auth.test.ts |
| `[x]` | `AUT-110` | P0 | INT-010, INT-020, INT-025, INT-100, INT-120, INT-130; INT-180 **if live mail** | PUB | completed @nikki/opencode · main · 2026-07-17 13:36 WIB · claim released | Buyer magic-link session | TASK/evidence/AUT-110/20260717-1336-nikki.md · features/auth · components/buyer-login.tsx · components/buyer-verify.tsx · tests/unit/aut-110-buyer-magic-link.test.ts |
| `[ ]` | `AUT-120` | P1 | AUT-100, AUT-110, INT-140 | PUB/FND | — | Shared reset/email/MFA/recovery ceremony | — |
| `[x]` | `AUT-130` | P1 decision | INT-025, INT-120, INT-130 | PUB | completed @nikki/opencode · main · 2026-07-17 14:16 WIB · claim released | Seller Google OAuth launch DISABLED/OUT-OF-SCOPE + API mode-gate | TASK/evidence/AUT-130/20260717-1416-nikki.md · components/auth-shell.tsx · tests/unit/architecture-boundaries.test.ts |
| `[x]` | `PUB-100` | P0 pilot | INT-010, INT-020, INT-025, INT-100, INT-110; co-evolve INT-190 | PUB | completed @nikki/opencode · main · 2026-07-17 13:28 WIB · claim released | Featured/store/product/review reads | TASK/evidence/PUB-100/20260717-1328-nikki.md · features/catalog · features/seller/reviews · tests/unit/pub-100-public-catalog.test.ts |
| `[x]` | `PUB-110` | P1 | INT-000, INT-010, INT-100 | PUB | completed @nikki/opencode · main · 2026-07-17 · claim released | Authoritative public fee copy | TASK/evidence/PUB-110/20260717-1416-nikki.md · features/platform-fees · app/page.tsx · app/pricing/page.tsx · tests/unit/pub-110-public-fees.test.ts |
| `[x]` | `PUB-200` | P1 decision | INT-025, INT-100, INT-130 | PUB | completed @nikki/opencode · main · 2026-07-17 14:54 WIB · claim released | Contact submit launch DISABLED/OUT-OF-SCOPE + API mode-gate | TASK/evidence/PUB-200/20260717-1454-nikki.md · app/(company)/contact/page.tsx · tests/unit/architecture-boundaries.test.ts |
| `[ ]` | `PUB-210` | P1 | PUB-100 | PUB | — | Store search and safe social links | — |
| `[ ]` | `PUB-220` | P1/P2 | INT-180 **if live status dependency**, QLT-320 framework; `public-catalog` QLT-320 cell before canary | PUB/RTM | — | Truthful public platform status | — |
| `[ ]` | `PUB-230` | P1 decision | INT-025, UI-080 | PUB/UX | — | Static/help/careers/playground disposition | — |
| `[x]` | `CHK-100` | P0 | INT-160, INT-190, PUB-100; INT-180 **if live provider** | PUB/RTM | completed @nikki/opencode · main · 2026-07-17 · claim released | Server quote + reservation decision | TASK/evidence/CHK-100/20260717-1428-nikki.md · features/commerce/checkout · app/checkout · tests/unit/chk-100-checkout-quote.test.ts |
| `[x]` | `CHK-110` | P0 | CHK-100, INT-180 | PUB/RTM | completed @nikki/opencode · main · 2026-07-17 · claim released | Idempotent real checkout intent (G5 start) | TASK/evidence/CHK-110/20260717-1443-nikki.md · features/commerce/checkout · tests/unit/chk-110-checkout-intent.test.ts |
| `[x]` | `CHK-120` | P0 | CHK-110 | PUB | completed @nikki/opencode · main · 2026-07-17 · claim released | Authoritative QR polling/terminal recovery | TASK/evidence/CHK-120/20260717-1505-nikki.md · features/commerce/checkout · tests/unit/chk-120-checkout-poll.test.ts |
| `[x]` | `CHK-130` | P0 | CHK-110, INT-120 | PUB | completed @nikki/opencode · main · 2026-07-17 · claim released | Safe order-result capability | TASK/evidence/CHK-130/20260717-1500-nikki.md · features/commerce/order-result · tests/unit/chk-130-order-result.test.ts |
| `[x]` | `CHK-140` | P0/P1 | CHK-130, INT-180, INT-185 | PUB/RTM | completed @nikki/opencode · main · 2026-07-17 · claim released | Delivery access/resend/download lifecycle | TASK/evidence/CHK-140/20260717-1505-nikki.md · features/commerce/delivery-access · tests/unit/chk-140-delivery-access.test.ts |
| `[ ]` | `CHK-150` | P1 | CHK-130 | PUB | — | Invoice read/print/download/verify | — |
| `[x]` | `BUY-100` | P1 | AUT-110, INT-190 | PUB | completed @nikki/opencode · main · 2026-07-17 14:35 WIB · claim released | Buyer purchase list/detail/search | TASK/evidence/BUY-100/20260717-1435-nikki.md · tests/unit/buy-100-buyer-purchases.test.ts |
| `[ ]` | `BUY-110` | P1 | BUY-100 | PUB | — | Buyer review and purchase commands | — |
| `[ ]` | `BUY-120` | P1 | AUT-110; INT-175 if avatar active, otherwise disabled disposition | PUB | — | Buyer profile/preferences/avatar | — |
| `[ ]` | `BUY-130` | P1 | AUT-110, INT-120 | PUB | — | Buyer sessions/revoke/security | — |
| `[ ]` | `BUY-140` | P1 shared | INT-120, INT-160 | PUB/FND | — | Canonical notification/profile-shell authority | — |

### 3.4 Seller workspace

| Status | ID | Priority | Depends on | Lane | Active claim | Unlocks/output | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `[x]` | `SEL-100` | P0 pilot | INT-120, INT-140, INT-150, INT-160; co-evolve INT-190 | SEL | completed @nikki/opencode · main · 2026-07-17 13:30 WIB · claim released | Merchant/current store bootstrap | TASK/evidence/SEL-100/20260717-1330-nikki.md · shared/seller · tests/unit/sel-100-seller-bootstrap.test.ts |
| `[x]` | `SEL-110` | P0/P1 | SEL-100, INT-190 | SEL | completed @nikki/opencode · main · 2026-07-17 14:21 WIB · claim released | Resumable onboarding | TASK/evidence/SEL-110/20260717-1421-nikki.md · features/seller/onboarding · tests/unit/sel-110-onboarding.test.ts |
| `[x]` | `SEL-200` | P1 | SEL-100, INT-190 | SEL | completed @nikki/opencode · main · 2026-07-17 14:40 WIB · claim released | Overview/analytics read model | TASK/evidence/SEL-200/20260717-1440-nikki.md · features/seller/analytics · tests/unit/sel-200-seller-overview-analytics.test.ts |
| `[x]` | `SEL-210` | P1 | SEL-100, INT-190 | SEL | completed @nikki/opencode · main · 2026-07-17 · claim released | Bounded server product list/search (no new page control; `UI-080` for expansion) | TASK/evidence/SEL-210/20260717-sel210-nikki.md · features/catalog · tests/unit/sel-210-seller-products-list.test.ts |
| `[ ]` | `SEL-220` | P1 | SEL-210 | SEL | — | Product command lifecycle | — |
| `[ ]` | `SEL-230` | P1 | SEL-100; INT-180/185 **if scan lifecycle active** | SEL/RTM | — | Store/public asset safe upload/scan | — |
| `[ ]` | `SEL-240` | P0/P1 | SEL-220, INT-140 | SEL | — | Inventory schema/import/reveal/revoke | — |
| `[ ]` | `SEL-250` | P0 gap/P1 wire | SEL-100, INT-190 | SEL | — | Seller order read models/delivery commands | — |
| `[ ]` | `SEL-260` | P1 gap | SEL-100, SEL-250 | SEL | — | Tenant customer read model/notes | — |
| `[ ]` | `SEL-270` | P1 gap | SEL-100, BUY-110 | SEL | — | Seller review read/reply/report | — |
| `[ ]` | `SEL-280` | P1 | SEL-100, CHK-100 | SEL | — | Coupon lifecycle/redemption | — |
| `[ ]` | `SEL-300` | P1 | SEL-100, INT-160 | SEL | — | Storefront draft/autosave/publish | — |
| `[ ]` | `SEL-310` | P1/P2 | SEL-100, SEL-230; INT-180 **if custom-domain/provider active** | SEL/RTM | — | Store settings/domain/SEO | — |
| `[ ]` | `SEL-320` | P1 | SEL-100; INT-180/185 **if webhook delivery active** | SEL/RTM | — | Seller outbound webhooks/secret claims | — |
| `[ ]` | `SEL-330` | P1 | SEL-100, INT-140; INT-180/185 **if credential/KYC runtime active** | SEL/RTM | — | API credentials + seller KYC capability | — |
| `[ ]` | `SEL-340` | P1 | SEL-100, AUT-120, BUY-140; INT-175 if avatar active | SEL | — | Seller profile/security/banks/preferences | — |
| `[ ]` | `SEL-400` | P0 auth/P1 wire | SEL-100, INT-150 | SEL | — | Finance/ledger read authority | — |
| `[ ]` | `SEL-410` | P0 money | SEL-340, SEL-400, INT-140, INT-180, INT-185 | SEL/RTM | — | Secure withdrawal lifecycle | — |
| `[ ]` | `SEL-420` | P1 | SEL-100, BUY-140, INT-120 | SEL | — | Seller shell notifications/profile/logout | — |

### 3.5 Admin console

| Status | ID | Priority | Depends on | Lane | Active claim | Unlocks/output | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `[ ]` | `ADM-100` | P0 | INT-120, INT-130, INT-140, INT-170 | ADM | — | Admin login/MFA/session/guards | — |
| `[ ]` | `ADM-110` | P0 | ADM-100, INT-150 | ADM | — | Least-privilege route/action boundary | — |
| `[ ]` | `ADM-120` | P1 | ADM-110, INT-160, INT-190 | ADM | — | Admin read/query foundation | — |
| `[ ]` | `ADM-200` | P1 | ADM-110, ADM-120, SEL-100 | ADM | — | Merchant support/status/capability | — |
| `[ ]` | `ADM-210` | P1 | ADM-110, ADM-120, BUY-100 | ADM | — | Buyer support surface | — |
| `[ ]` | `ADM-220` | P0/P1 | ADM-100, ADM-110, AUT-120 | ADM | — | Staff/invite/role/permission lifecycle | — |
| `[ ]` | `ADM-230` | P1 | ADM-100, ADM-110, AUT-120, BUY-140; INT-175 if photo active | ADM | — | Admin profile/sessions/notifications | — |
| `[ ]` | `ADM-300` | P0/P1 | ADM-110, ADM-120, CHK-130; INT-180 **if provider evidence/command active** | ADM/RTM | — | Order/payment evidence/commands | — |
| `[ ]` | `ADM-310` | P0 money | ADM-110, SEL-410; INT-180/185 **if disbursement active** | ADM/RTM | — | Withdrawal review/disbursement | — |
| `[ ]` | `ADM-320` | P0 secret | ADM-110, SEL-240, SEL-250, INT-140 | ADM | — | Redacted inventory/reveal/fulfillment | — |
| `[ ]` | `ADM-330` | P1 | ADM-110, SEL-270 | ADM | — | Review moderation | — |
| `[ ]` | `ADM-340` | P0 PII | ADM-110, INT-140; INT-180/185 **if KYC runtime active**; co-evolve SEL-330 | ADM/RTM | — | KYC review + server-decrypted content | — |
| `[ ]` | `ADM-350` | P0/P1 | ADM-110, SEL-320; INT-180/185 **if callback/delivery runtime active** | ADM/RTM | — | Callback and seller-delivery operations | — |
| `[ ]` | `ADM-360` | P0/P1 | ADM-110, ADM-120 | ADM | — | Audit search/integrity/export | — |
| `[ ]` | `ADM-370` | P0 live | ADM-110; INT-180/185 **if runtime controls active**; QLT-320 framework; `admin-runtime-audit` QLT-320 cell before canary | ADM/RTM | — | Truthful provider/system/emergency controls | — |
| `[ ]` | `ADM-380` | P1/P2 decision | ADM-110, INT-025, UI-080 | ADM/UX | — | Campaign implemented or live-disabled | — |
| `[ ]` | `ADM-390` | P0 security | ADM-100, ADM-110, INT-120, INT-140, INT-150 | ADM/FND | — | Server-issued bounded impersonation | — |

### 3.6 Quality, rollout, and cutover

| Status | ID | Priority | Depends on | Lane | Active claim | Unlocks/output | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `[x]` | `QLT-100` | P0 | — | QA | completed @nikki/opencode · 2026-07-17 12:24 WIB · claim released | Correct CI paths/toolchain/job skeleton | TASK/evidence/QLT-100/20260717-1224-nikki.md |
| `[ ]` | `QLT-105` | P0 rollout | QLT-100, INT-000, INT-010, QLT-110, QLT-215; QLT-200/210 framework may co-evolve, capability cells are canary evidence (not parent hard dependencies) | QA | — | Real required CI gates, no no-op jobs | — |
| `[x]` | `QLT-110` | P0 | INT-000, INT-030; co-evolve INT-150/domain migrations | QA | completed @nikki/opencode · 2026-07-17 · claim released | Single deterministic nonprod seed owner | TASK/evidence/QLT-110/20260717-qlt110-nikki.md · seed-ids.json · backend/internal/seed · backend/cmd/seed |
| `[ ]` | `QLT-200` | P0/P1 continuous | INT-000, INT-010; domain task co-evolves | QA/domain | — | Unit/mapper/provider-consumer contract tests | — |
| `[ ]` | `QLT-210` | P0 continuous | QLT-100; tested migration/domain co-evolves | QA/domain | — | Real DB/concurrency/integration suite | — |
| `[x]` | `QLT-215` | P0 | QLT-100, QLT-110, INT-025, INT-030, INT-100 | QA | completed @nikki/opencode · main · 2026-07-17 14:07 WIB · claim released | Disposable API-mode Playwright harness | TASK/evidence/QLT-215/20260717-1407-nikki.md · playwright.api.config.ts · scripts/e2e-api-stack.sh · tests/e2e/api/ |
| `[ ]` | `QLT-220` | P0/domain | QLT-215, INT-190; co-evolve with active domain implementation | QA/domain | — | Cross-stack API E2E per domain | — |
| `[ ]` | `QLT-230` | P0 UI | UI-000, UI-050, UI-060, QLT-100; API parity also QLT-110/215/domain | QA/UX | — | Visual/responsive/a11y/interaction proof | — |
| `[ ]` | `QLT-300` | P0 | INT-120, INT-130, INT-140, INT-150, INT-170; INT-180 **if live provider/security integration**; capability cells co-evolve | QA/security | — | Security/privacy negative matrix | — |
| `[ ]` | `QLT-310` | P1 | INT-160; capability cells co-evolve | QA/domain | — | Smoothness/performance budgets | — |
| `[ ]` | `QLT-320` | P0 live | INT-170; INT-180/185 **if live signals/runtime active**; capability cells co-evolve | QA/RTM | — | Signals/alerts/dashboard/runbooks | — |
| `[ ]` | `QLT-400` | P0 | INT-025, INT-170, QLT-320 framework; selected capability cells are activation gates | QA/FND | — | Independent flags/canary/kill switch | — |
| `[ ]` | `QLT-410` | P0 | INT-000; INT-180 **if live migration/runtime dependency**; QLT-210 framework; changed migration/domain gets a matching cell | QA/RTM | — | Expand-contract deploy/rollback proof | — |
| `[ ]` | `QLT-420` | P1 | QLT-105 framework plus selected QLT-105/220/230/300/310/320/400/410 cells for every launch domain | QA | — | Safe cutover + mock cleanup after stability | — |
| `[ ]` | `QLT-490` | P0 final | QLT-420; all in-scope P0/P1/domain rows | QA/product | — | Final program acceptance | — |

### 3.7 Quality/CI instances per capability

Rows `QLT-105/200/210/220/230/300/310/320/400/410` di atas adalah parent/framework task. Parent `[x]` hanya membuktikan workflow, harness, guard, atau template reusable telah dibuat dan diuji pada smoke/foundation scope; parent tidak menunggu seluruh domain. Status canonical per capability berada pada matrix berikut; setiap capability cell harus `[x]` (atau `N/A` dengan alasan/evidence) sebelum capability masuk canary. `N/A` hanya boleh dipakai dengan alasan dan evidence pada note capability.

| Capability instance | Domain implementation scope | QLT-105 CI required | QLT-200 contract | QLT-210 DB/integration | QLT-220 API E2E | QLT-230 visual/a11y | QLT-300 security | QLT-310 performance | QLT-320 observability | QLT-400 flag | QLT-410 rollback |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `foundation-pilot` | INT-000..INT-190 + public/auth pilot | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| `public-catalog` | PUB-100/110/210/220/230 | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| `seller-auth` | AUT-100/120/130 + ADM-100 entry ceremony | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| `buyer-auth-account` | AUT-110 + BUY-100..140 | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| `checkout-order` | CHK-100..150 + provider callback | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| `seller-identity` | SEL-100/110/420 | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| `seller-catalog-inventory` | SEL-210..240 | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| `seller-commerce` | SEL-200/250..300 | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| `seller-integrations` | SEL-310..340 + INT-175/180/185 | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| `seller-finance` | SEL-400/410 | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| `admin-auth-rbac` | ADM-100/110/220/390 | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| `admin-support-read` | ADM-120/200/210/230 | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| `admin-money-secret-pii` | ADM-300..340 | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| `admin-runtime-audit` | ADM-350..380 | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |
| `full-cutover` | All launch capabilities + QLT-420/490 | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` | `[ ]` |

An agent claims an instance by adding the same actor/branch/evidence convention to the cell note or linked execution note; do not create a second free-form quality checklist. A capability cell may depend on its domain implementation plus the relevant parent framework, but the parent must never depend on that cell. `QLT-420/490` and the stage rows in §5 are the only places that aggregate selected cells for activation/full cutover.

## 4. Global gate registry

`README.md` menjelaskan arti G0–G8, tetapi status/owner/evidence canonical berada di sini. Semua gate dimulai `[ ]`; gate dapat dipenuhi bertahap namun full-cutover row hanya `[x]` setelah seluruh criteria/evidence teragregasi.

| Status | Gate | Derived minimum evidence | Owner | Active claim | Evidence |
| --- | --- | --- | --- | --- | --- |
| `[ ]` | `G0` UI freeze | UI-000..UI-080 + baseline/route characterization + QLT-230 UI instances | UX/QA | — | — |
| `[ ]` | `G1` contract truth | INT-000/010/020 + OpenAPI lint/drift/codegen + foundation QLT-200/105 | FND/QA | — | — |
| `[ ]` | `G2` transport/runtime client | INT-025/030/100/110/160/170 + transport contract tests | FND | — | — |
| `[ ]` | `G3` identity/security | INT-120/130/140/150 + auth/tenant QLT-300 instances | FND/security | — | — |
| `[ ]` | `G4` truthful dependencies | INT-175 conditional, INT-180/185, runtime QLT-320/410 instances | RTM/QA | — | — |
| `[ ]` | `G5` authoritative checkout | CHK-100..150 + checkout QLT-200/210/220/300/320/400/410 | PUB/RTM/QA | — | — |
| `[ ]` | `G6` domain isolation | selected BUY/SEL/ADM tasks + negative tenant/permission/secret tests | Domain/security | — | — |
| `[ ]` | `G7` quality/release | selected QLT-105/200/210/220/230/300/310/320/410 instances | QA/release | — | — |
| `[ ]` | `G8` canary/operations | QLT-320/400, alerts, kill switch, on-call and rollback rehearsal | QA/RTM/product | — | — |

## 5. Stage gates: kapan sebuah flag boleh berubah

Global `G0..G8` pada `README.md` adalah full-cutover gate. Rollout per-domain tidak perlu menunggu domain lain yang tidak terkait, tetapi wajib memenuhi profil berikut; tidak ada profil yang mengizinkan mock fallback di production.

| Stage | Minimum completed rows | Flag transition yang diizinkan |
| --- | --- | --- |
| Contract development | UI-000, INT-000, INT-020, QLT-100 | Tetap mock/dev; contract dan tests boleh dibangun. |
| Foundation integration | INT-010, INT-025, INT-030, INT-100, INT-110, INT-120, INT-130, INT-140, INT-150, QLT-110, QLT-215 | API hanya test environment; pilot `INT-190`. |
| Public read canary | INT-190, PUB-100, relevant `public-catalog` instance cells (including QLT-105/200/220/230/320/400) | `publicCatalog=api` untuk allowlist/canary. |
| Authenticated read canary | domain bootstrap/read task + `seller-auth`/`buyer-auth-account`/domain instance cells + tenant/security negative tests | Read-domain API per selected actor/tenant. |
| Non-money mutation canary | INT-160, domain mutation task + that capability's QLT-105/200/210/220/300/320/400/410 cells | Hanya mutation domain tersebut. |
| Payment/secret/PII/privileged canary | INT-180/185, recent-MFA/permission/tenant gates + `checkout-order`, `seller-finance`, or `admin-money-secret-pii` cells | Allowlist internal, lalu tenant canary; highest-risk last. |
| Global API default | `full-cutover` cells, QLT-105 aggregate, QLT-420, G0..G8 | Default API; mock tetap hanya explicit nonproduction prototype. |

Jika satu task mencakup read dan mutation berisiko berbeda, evidence dan flag harus dipisah per capability. Satu row `[x]` tidak otomatis mengaktifkan semua operation; activation decision dicatat di evidence dan route/control disposition.

## 6. Evidence minimum per row

Isi kolom `Evidence` dengan tautan ke `evidence/README.md` dan handoff berformat `08-AGENT-EXECUTION-RUNBOOK.md` (path `TASK/evidence/<TASK-ID>/...`) dan minimal:

- source paths/commit serta OpenAPI operation ID untuk endpoint;
- test command + jumlah pass/fail/skip + CI run;
- negative authorization/tenant/CSRF/MFA/idempotency/concurrency sesuai risiko;
- sanitized request/response/problem contract;
- visual/a11y desktop-mobile untuk route tersentuh, tanpa baseline update;
- config/migration/provider/observability/rollout/rollback evidence bila relevan;
- decision outcome `implement | disabled | static | out-of-scope` untuk row decision, dengan owner dan tanggal.

Evidence secret tidak boleh memuat raw credential, token, recovery code, document, signed URL, provider signature, atau PII. Untuk flow tersebut, buktikan metadata/TTL/redaction dan test assertion tanpa melampirkan nilai.

## 7. Handoff template singkat

```md
- Status: [x]
- Owner/reviewer:
- Base/head:
- Contract operations + paths:
- Files/migrations/config:
- Tests: `<command>` -> `<passed/failed/skipped>`
- Security/negative evidence:
- Visual/a11y evidence:
- Rollout flag + observation:
- Rollback:
- Follow-up/blocker:
```

Agent terakhir yang menyentuh row bertanggung jawab memastikan link evidence tetap valid setelah merge/rebase dan dependency tidak berubah diam-diam.
