# Master Plan Integrasi Frontend–Backend Fersaku

> **Auth policy (2026-07-19):** MFA/TOTP is **out of scope**. Admin, seller, and buyer use password or magic-link sessions only. Sensitive actions use permission + reason + idempotency (not authenticator apps). Historical task text that mentions MFA is superseded by this policy.


> Snapshot audit: 17 Juli 2026, commit awal `48d659e` (`feat(backend): complete production backend BE-000..BE-630`).
>
> Tujuan folder ini: menjadi instruksi eksekusi utama bagi agent berikutnya untuk menghubungkan frontend Next.js yang masih mock-first ke backend Go, **tanpa mengubah UI yang sudah ada**.

## 1. Outcome yang wajib dicapai

Integrasi dianggap selesai hanya jika seluruh kondisi berikut benar:

1. Seluruh surface transaksi utama—auth, storefront, checkout, buyer, seller, dan admin—membaca/menulis data authoritative melalui backend pada mode API.
2. Mode mock tetap bekerja sebagai mode prototype yang deterministic.
3. Tidak ada perubahan desain visual, route ownership, copy, layout, class styling, atau perilaku responsive.
4. Semua response backend divalidasi saat runtime dan dipetakan ke view model frontend pada feature boundary.
5. Session cookie, CSRF, auth/step-up, tenant authorization, idempotency, dan audit reason bekerja end-to-end.
6. Checkout production memakai intent/provider state dari backend; browser tidak boleh mensimulasikan atau menetapkan status paid.
7. Secret tidak masuk URL, browser storage, query cache jangka panjang, log, telemetry, screenshot, atau fixture production.
8. Kontrak OpenAPI, route Go, DTO mapper, dan test integration tidak drift.
9. Rollout dilakukan per domain dengan observability dan rollback yang teruji; jangan menyalakan mode API global sebelum gate selesai.

## 2. Aturan paling penting: UI dibekukan

Baca dan patuhi [`00-UI-FREEZE-CONTRACT.md`](00-UI-FREEZE-CONTRACT.md) sebelum mengubah kode apa pun.

Ringkasnya:

- jangan redesign;
- jangan mengubah route, struktur layout, grid, spacing, breakpoint, typography, warna, icon, radius, shadow, copy, atau animasi;
- jangan membuat komponen baru jika komponen yang sama sudah tersedia;
- jika wiring memerlukan state tambahan, gunakan **komponen yang sama persis** dari registry yang sudah ada;
- perbedaan DTO diselesaikan di mapper/API layer, bukan di JSX presentasi;
- baseline screenshot tidak boleh di-update untuk membuat kegagalan hilang;
- pengecualian UI hanya boleh dikerjakan setelah persetujuan eksplisit pemilik produk dan harus menjadi perubahan terpisah dari wiring data.

## 3. Urutan eksekusi wajib

```text
Phase 0 — Freeze, characterization, contract/CI skeleton
 UI-000..UI-090
 INT-000..INT-030
 QLT-100 + baseline portion QLT-230
 |
Phase 1 — Transport, runtime, identity, tenant, test harness
 Core entry: INT-100/110/120/130/140/150 + QLT-110/215
 INT-160/170 dan INT-175/180/185 berjalan parallel sesuai capability
 QLT-105/200/210/300/320 instances diaktifkan per capability
 |
Phase 2 — First safe vertical slice (co-evolve)
 PUB-100 public catalog
 AUT-100 session/login
 SEL-100 merchant context
 INT-190 + first QLT-105/200/210/220/230/300/320/400 instances
 |
Phase 3 — Commerce/domain slices + their tests, not after them
 CHK-100..CHK-150
 BUY-100..BUY-140
 SEL-110..SEL-420
 QLT-200/210/220/230/300/310/320/400/410 per slice
 |
Phase 4 — Privileged operations, highest-risk last
 ADM-100..ADM-390
 same per-slice quality/security/rollout gates
 |
Phase 5 — Full-cutover proof and cleanup
 QLT-105 aggregate + QLT-420 + QLT-490
```

Testing, security, observability, visual parity, dan rollout evidence dibuat bersama setiap slice; Phase 5 hanya mengagregasi full-program proof. `QLT-105` adalah required-check activation incremental per capability, bukan task yang baru boleh dimulai pada Phase 5. Runtime live-only (`INT-180/185`) dan quality cells yang tidak dipakai pilot dapat menunggu capability masing-masing. Jangan paralelkan task yang memiliki dependency data/kontrak belum final. Task read-only antar-domain boleh paralel setelah `INT-190` lulus. Mutasi uang, secret, atau privileged operation baru boleh dimulai setelah auth/CSRF/idempotency selesai.

## 4. Dokumen kerja

| Dokumen | Isi | Pembaca utama |
| --- | --- | --- |
| [`00-UI-FREEZE-CONTRACT.md`](00-UI-FREEZE-CONTRACT.md) | Kontrak no-visual-change, registry komponen, review gate | Semua agent/reviewer |
| [`01-CURRENT-STATE-GAP-AUDIT.md`](01-CURRENT-STATE-GAP-AUDIT.md) | Arsitektur aktual, gap, blocker P0/P1, keputusan yang belum terkunci | Tech lead, agent foundation |
| [`02-FOUNDATION-TRANSPORT-AUTH.md`](02-FOUNDATION-TRANSPORT-AUTH.md) | OpenAPI, network topology, client, schema, SSR, session, CSRF, auth, tenant, cache | FE/BE foundation |
| [`03-PUBLIC-AUTH-CHECKOUT-BUYER.md`](03-PUBLIC-AUTH-CHECKOUT-BUYER.md) | Login/register, public catalog, checkout, order/invoice, buyer account | Agent commerce/buyer |
| [`04-SELLER-WORKSPACE.md`](04-SELLER-WORKSPACE.md) | Onboarding, catalog, inventory, order, customer, review, finance, settings | Agent seller |
| [`05-ADMIN-CONSOLE.md`](05-ADMIN-CONSOLE.md) | RBAC, read models, privileged mutations, audit, system operations | Agent admin |
| [`06-ENDPOINT-CONTRACT-MATRIX.md`](06-ENDPOINT-CONTRACT-MATRIX.md) | Matriks route UI ↔ FE seam ↔ endpoint BE ↔ status/gap | Semua implementer |
| [`07-TESTING-ROLLOUT-DOD.md`](07-TESTING-ROLLOUT-DOD.md) | Test pyramid, fixture, CI, rollout, rollback, DoD final | QA/release owner |
| [`08-AGENT-EXECUTION-RUNBOOK.md`](08-AGENT-EXECUTION-RUNBOOK.md) | Cara mengambil task, format evidence, PR slicing, handoff | Agent berikutnya |
| [`09-EXECUTION-STATUS.md`](09-EXECUTION-STATUS.md) | Manifest status/dependency/claim/owner/evidence dan stage gates | Semua agent/lead |
| [`10-ROUTE-AND-CONTROL-DISPOSITION.md`](10-ROUTE-AND-CONTROL-DISPOSITION.md) | Matriks route/network state/control aktif, no-op disposition, UI exception register | FE/QA/product reviewer |
| [`evidence/README.md`](evidence/README.md) | Naming/location execution note dan aturan redaction evidence | Semua agent/reviewer |

## 5. Source of truth dan prioritas bukti

Sebelum `INT-000/G1` selesai, gunakan urutan discovery berikut bila sumber saling bertentangan:

1. Invariant keamanan dan keputusan produk pada folder `TASK/` ini.
2. Route yang benar-benar terpasang pada `backend/internal/adapters/http/router.go` dan behavior service/handler yang dites.
3. OpenAPI snapshot—**saat audit belum valid dan belum boleh dianggap authoritative**; gunakan hanya untuk menemukan intent/drift.
4. Contract/view model pada `features/**/contracts.ts` dan data yang benar-benar dibutuhkan UI.
5. `ARCHITECTURE.md` dan `docs/BACKEND_HANDOFF.md`.
6. README/progress checklist lama hanya konteks; label “complete” bukan bukti endpoint siap dipakai.

Setelah `INT-000/G1` `[x]`, OpenAPI yang sudah lint/bundle/provider/router-drift test menjadi wire contract normative untuk method/path/DTO/status/problem. Router, handler/presenter, generated FE transport, dan tests wajib diubah bersama agar kembali conform; runtime code tidak boleh diam-diam mengalahkan spec. Domain/security invariants dan explicit product decisions tetap berada di atas wire mechanics.

Backend progress saat ini menyatakan pekerjaan selesai, tetapi audit kode menemukan endpoint yang belum terpasang, kontrak yang berbeda, serta adapter production yang masih fake/noop. Agent wajib memverifikasi kode dan test, bukan mempercayai status dokumen.

## 6. Definisi status task

Status/claim canonical hanya diperbarui pada [`09-EXECUTION-STATUS.md`](09-EXECUTION-STATUS.md). Gunakan marker berikut:

- `[ ]` belum dikerjakan;
- `[~]` sedang dikerjakan; sertakan nama agent/branch dan timestamp;
- `[x]` selesai dan seluruh acceptance criteria memiliki evidence;
- `[!]` blocked; tulis blocker konkret, owner, dan dependency—jangan menandai blocked hanya karena task sulit.

Checklist pada dokumen domain adalah acceptance criteria, bukan tempat claim ownership. Dependency keras, lane, collision rule, active actor/branch/timestamp, dan evidence link berada pada registry pusat.

Satu task tidak boleh diberi `[x]` hanya karena kode sudah ditulis. Minimal evidence:

- path/commit implementasi;
- test unit/integration/E2E yang relevan dan hasilnya;
- contoh contract request/response yang sudah disanitasi;
- bukti visual/a11y untuk route terkait;
- bukti authorization/error/negative path;
- catatan migration/rollout/rollback jika mengubah persistence atau behavior production.

## 7. Pola implementasi yang harus dipertahankan

```text
App Router page/layout
 -> feature screen (presentation saja)
 -> TanStack Query hook
 -> feature API function
 -> transport DTO schema + mapper
 -> shared browser/server HTTP client
 -> same-origin /v1 reverse proxy
 -> Go handler -> application service -> Postgres/provider
```

Rules:

- screen tidak boleh memiliki URL endpoint;
- component tidak boleh menentukan auth/payment/ledger/permission truth;
- mock dan API harus menghasilkan view model yang sama;
- transport DTO tidak boleh diekspor ke component;
- query key selalu memuat tenant, filter, sort, dan cursor yang memengaruhi hasil;
- detail `404` dipetakan secara eksplisit ke `null/notFound`, sedangkan `401/403` tidak boleh disamarkan sebagai `404` di client;
- mutation tidak auto-retry; idempotency key stabil untuk satu logical intent dan tetap sama pada retry manual;
- mutation keuangan/secret/admin tidak optimistic; UI menunggu hasil authoritative;
- invalid contract harus fail closed sebagai `INVALID_API_CONTRACT`, bukan dilanjutkan dengan cast TypeScript.

## 8. Keputusan default yang dipakai backlog ini

Kecuali tech lead mengubah keputusan secara tertulis:

1. Browser menggunakan same-origin `/v1`; edge/reverse proxy meneruskan ke Go API. Ini menghindari credentialed CORS dan membuat cookie lebih konsisten.
2. Server Component menggunakan base URL internal server-only dan meneruskan cookie/request ID secara allowlist. Browser tidak mengetahui internal URL.
3. Backend tetap source of truth; Next.js tidak mengambil alih business logic.
4. CSRF menggunakan token yang dapat dipulihkan aman setelah refresh dan terikat session. Pilihan implementasi final harus didokumentasikan di `INT-130`; raw token tidak boleh masuk local/session storage.
5. Seller context berasal dari `/v1/seller/me/merchant`, bukan `DEMO_STORE_ID` pada mode API.
6. OpenAPI harus diperbaiki dan dikunci dengan lint + router/contract test sebelum type generation.
7. Rollout dilakukan per surface/domain. Legacy global `NEXT_PUBLIC_DATA_SOURCE` tidak boleh menjadi mekanisme rollout; setelah seluruh domain lulus, default typed registry boleh menjadi `api` dan env global harus dideprecate/dihapus melalui `QLT-420`.
8. Source efektif berasal dari typed server-owned registry `INT-025` dengan nilai per-domain `mock | api | disabled`; production menolak `mock`, dan `disabled` tidak pernah fallback ke fixture.

## 9. Gate sebelum mode API boleh aktif

Daftar `G0..G8` berikut adalah gate **global default/full cutover**. Canary satu domain boleh berjalan lebih awal hanya dengan profil stage pada `09-EXECUTION-STATUS.md`: seluruh dependency foundation dan gate quality/security/observability/rollback yang relevan untuk domain itu harus hijau. Gate domain tidak membebaskan domain lain, dan tidak pernah mengizinkan mock fallback di production.

Semua ini wajib hijau:

- `G0` — UI freeze baseline dan route characterization disimpan; tidak ada baseline update. Status/evidence di registry `09`.
- `G1` — OpenAPI valid, endpoint matrix disepakati, dan drift CI aktif. Status/evidence di registry `09`.
- `G2` — same-origin/internal URL, error envelope, runtime schema, timeout, abort, request ID lolos test. Status/evidence di registry `09`.
- `G3` — session restore, CSRF refresh, logout, auth/step-up, route guard, tenant authorization lolos negative tests. Status/evidence di registry `09`.
- `G4` — adapter production Xendit/mail/queue/Redis/storage/scanner dan health/readiness jujur; tidak ada fake/noop di live. Status/evidence di registry `09`.
- `G5` — checkout E2E membuktikan browser tidak pernah menandai paid; callback/provider transition authoritative. Status/evidence di registry `09`.
- `G6` — seller/buyer/admin route kritis terhubung tanpa cross-tenant leak atau secret leak. Status/evidence di registry `09`.
- `G7` — unit, contract, Go integration, Playwright smoke/a11y/visual, build, migration, dan rollback rehearsal lulus. Status/evidence di registry `09`.
- `G8` — canary metrics, alert, kill switch, dan owner on-call siap. Status/evidence di registry `09`.

## 10. Hal yang dilarang

- Mengaktifkan live/API untuk “mencoba” sebelum gate keamanan selesai.
- Menggunakan `/v1/checkout/simulate-payment` di production.
- Menambah fallback dari API error ke mock data di live; ini menyembunyikan kegagalan dan dapat menampilkan data palsu.
- Menaruh token/session proof/raw credential/secret inventory di URL, `localStorage`, `sessionStorage`, telemetry, atau persistent query cache.
- Mempercayai `storeId`, `merchantId`, permission, price, fee, total, paid status, atau `mfaVerified` dari browser.
- Menggunakan `Date.now()` sebagai idempotency key setiap retry.
- Mengubah screenshot baseline, copy, atau styling untuk menyesuaikan response backend.
- Memetakan unknown backend state ke status sukses.
- Membuat generic backend action yang melewati domain transition/authorization/audit.
- Menggabungkan provider callback inbound dengan seller webhook outbound sebagai satu resource backend; UI boleh mengomposisikan dua sumber melalui discriminated union.

## 11. Definition of Done tingkat program

Program selesai bila semua checklist domain selesai dan:

- tidak ada import fixture/mock pada jalur presentasi mode API;
- tidak ada hardcoded demo tenant/order/QR/secret pada hasil production;
- setiap active UI control memiliki backend command nyata atau secara eksplisit disabled berdasarkan authorization/state authoritative;
- setiap active route memiliki loading, empty, error, retry, unauthorized, forbidden, not-found, dan success behavior yang konsisten dengan komponen existing;
- seluruh route/control/disposition dan exception state pada `10-ROUTE-AND-CONTROL-DISPOSITION.md` memiliki task/evidence final;
- log dan telemetry mengandung release ID + request ID tetapi sudah redacted;
- seluruh state machine kritis memiliki negative/concurrency/idempotency test;
- screenshot desktop dan mobile sama dengan baseline yang disetujui;
- mock mode dan API mode sama-sama lulus suite masing-masing;
- release dapat di-roll back tanpa kehilangan event/order/ledger yang sudah committed.
