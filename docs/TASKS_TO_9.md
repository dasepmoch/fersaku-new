# Backlog Engineering Menuju 9/10

Dokumen ini adalah implementation backlog, bukan perubahan aplikasi. Seluruh task dirancang untuk mempertahankan UI Fersaku yang sekarang sambil memperbaiki architecture, scalability, modularity, reliability, dan developer experience.

Audit sumber: `docs/CODEBASE_AUDIT_2026-07-16.md`
Baseline score: **6,5/10**
Target score: **9,0/10**

Eksekusi snapshot ini sudah selesai untuk scope frontend mock-first. Lihat [implementation status](IMPLEMENTATION_STATUS_2026-07-16.md) untuk checklist bukti, command gate, dan accepted debt. Checkbox di bawah dipertahankan sebagai backlog operasional lanjutan saat backend Go mulai diintegrasikan.

## Aturan eksekusi yang tidak boleh dilanggar

1. **Mock-first tetap menjadi default** sampai backend Go siap.
2. **Tidak ada intentional visual change.** Layout, spacing, warna, typography, responsive behavior, copy, dan interaction result yang terlihat harus tetap sama kecuali ada bug yang disetujui terpisah.
3. **Ambil visual baseline sebelum structural refactor.** Setiap PR refactor harus membuktikan screenshot diff kosong atau menjelaskan variance yang memang nondeterministic.
4. **Tidak membangun business authority di frontend.** Payment, ledger, fulfillment, KYC, provider secret, auth, dan authorization final tetap milik backend.
5. **Tidak membuat abstraction berlebihan.** Pertahankan plain async functions; tidak perlu repository classes atau dependency-injection framework.
6. **Satu task, satu concern utama.** Hindari PR besar yang sekaligus memindah folder, mengubah behavior, dan memperbarui design.
7. **Semua fixture deterministic.** Hindari `Date.now()`, random value, dan timer yang tidak bisa dikontrol test.
8. **Semua module baru harus punya owner dan public API yang jelas.** Deep import hanya boleh untuk file internal dalam feature yang sama.

## Skala effort

- **S**: sampai sekitar 1 hari fokus.
- **M**: sekitar 1–2 hari.
- **L**: sekitar 3–5 hari.
- **XL**: sekitar 5–8 hari dan sebaiknya dipecah per domain/PR.

Estimate bersifat relatif, bukan komitmen waktu.

## Tangga nilai

| Milestone       | Perkiraan nilai | Kondisi                                                              |
| --------------- | --------------: | -------------------------------------------------------------------- |
| Baseline        |             6,5 | Kondisi audit saat ini                                               |
| Phase 0 selesai |             7,2 | Refactor aman, reproducible, dan dijaga CI/visual baseline           |
| Phase 1 selesai |             8,2 | Semua UI memakai mock/API boundary yang konsisten                    |
| Phase 2 selesai |             8,8 | Critical behavior, accessibility, dan performance memiliki guardrail |
| Phase 3 selesai |             9,0 | Security seams, observability, docs, dan final audit lengkap         |

## Urutan dependency

```txt
T9-001
  -> T9-002 -> semua structural refactor
  -> T9-003
  -> T9-004

T9-101 -> T9-102 -> T9-103
                     -> T9-104 -> T9-107
                     -> T9-105 -> T9-107
                     -> T9-106 -> T9-107

T9-108 dapat berjalan setelah T9-102
T9-109 dilakukan setelah T9-104..T9-108 agar tidak membuat shim baru

T9-201 -> T9-202 -> T9-203
T9-204 setelah T9-109

T9-301 -> T9-302 -> T9-303 -> T9-304
```

## Phase 0 — Stabilkan baseline dan quality gates

### [ ] T9-001 — Buat checkpoint bersih untuk refactor saat ini

Priority: P0
Effort: S
Temuan: working tree besar, format/lint belum bersih

Scope:

- Review 62 tracked changes dan 142 expanded untracked files sebagai satu refactor snapshot.
- Pastikan tidak ada file user yang hilang atau shim penting yang terhapus tanpa migrasi import.
- Jalankan Prettier hanya pada file yang memang masuk checkpoint.
- Hapus lima unused import yang dilaporkan ESLint tanpa mengubah output render.
- Catat baseline command output dan buat commit/checkpoint reviewable sebelum task berikutnya.
- Jangan mencampurkan roadmap docs ini dengan refactor runtime jika workflow tim menghendaki commit terpisah.

Acceptance criteria:

- `npm run format:check` lulus.
- `npm run lint -- --max-warnings=0` lulus.
- `npm run typecheck`, `npm run test:run`, dan `npm run build` lulus.
- `git diff --check` bersih.
- Working tree setelah checkpoint hanya berisi pekerjaan task aktif yang disengaja.
- Tidak ada intentional UI change.

### [ ] T9-002 — Kunci route dan visual characterization baseline

Priority: P0
Effort: L
Depends on: T9-001
Temuan: F-04

Scope:

- Buat `tests/e2e` dan route manifest yang mencakup seluruh route statis serta contoh valid untuk setiap dynamic route.
- Tambahkan smoke test: route dapat dibuka, tidak ada uncaught exception, tidak ada hydration error, dan heading/surface utama muncul.
- Ambil screenshot baseline desktop Chromium dan mobile Chromium untuk surface representatif:
  - landing, pricing, public storefront, product detail;
  - checkout detail dan QRIS state;
  - buyer purchase library/detail/security;
  - seller overview/products/orders/inventory/storefront/settings;
  - admin overview/merchant detail/withdrawal detail/risk/reconciliation/providers.
- Tambahkan interaction characterization untuk checkout, storefront undo/redo, pagination, modal confirmation, theme, notification, dan profile menu.
- Stabilkan animation, clock, fixture, dan local storage pada test setup. Jangan mengubah animation production.
- Pisahkan smoke suite dari screenshot suite agar diagnosis cepat.

Acceptance criteria:

- `npx playwright test --list` menemukan test desktop dan mobile.
- Semua route yang tercantum di README memiliki minimal smoke coverage atau alasan pengecualian.
- Screenshot baseline disetujui dan tersimpan konsisten di environment CI.
- Test lulus dua kali berturut-turut tanpa flaky retry lokal.
- Console error allowlist kosong atau sangat eksplisit.
- Baseline tidak mengubah CSS/markup production untuk sekadar membuat test hijau.

### [ ] T9-003 — Tambahkan CI dan toolchain reproducibility

Priority: P0
Effort: M
Depends on: T9-001

Scope:

- Pin versi Node melalui satu sumber yang disepakati (`.nvmrc`, `.node-version`, Volta, atau `package.json#engines`).
- Tambahkan workflow CI dengan `npm ci` dan cache yang berbasis `package-lock.json`.
- Buat job cepat untuk format, lint zero-warning, typecheck, dan unit test.
- Buat job build dan E2E terpisah; upload trace/screenshot/video hanya ketika gagal.
- Tambahkan concurrency cancellation untuk commit lama pada branch/PR yang sama.
- Tambahkan dependency audit policy: gagal pada high/critical, report moderat untuk review.
- Hindari `npm audit fix --force` otomatis.

Acceptance criteria:

- Pull request tidak dapat dianggap hijau jika format/lint/typecheck/test/build gagal.
- CI memakai `npm ci`, bukan `npm install`.
- Node lokal dan CI konsisten.
- E2E artifact tersedia saat gagal.
- Branch protection/required checks didokumentasikan bila repo host mendukungnya.

### [ ] T9-004 — Perbaiki unit-test dan coverage infrastructure

Priority: P0
Effort: M
Depends on: T9-001

Scope:

- Tambahkan Vitest coverage provider yang kompatibel.
- Tambahkan script `test:coverage`.
- Ekstrak pagination math menjadi pure production function, lalu ubah test agar mengimpor function itu; jangan menyalin implementasi di test.
- Uji `apiRequest` dengan mocked `fetch`: success JSON, 204, problem JSON, invalid JSON, timeout, external abort, offline/network failure, headers, credentials, dan query params.
- Tambahkan coverage threshold bertahap. Mulai realistis untuk pure/data modules, lalu naikkan setelah Phase 1.
- Exclude generated/build/config dengan alasan jelas, bukan blanket exclude terhadap file sulit.

Acceptance criteria:

- `npm run test:coverage` lulus.
- Coverage provider terpasang eksplisit di lockfile.
- Test pagination menyentuh source implementation.
- HTTP client behavior, bukan hanya `ApiError` constructor, terlindungi.
- Threshold gagal jika critical module coverage turun.

## Phase 1 — Selesaikan modular data architecture

### [ ] T9-101 — Definisikan dan enforce dependency boundaries

Priority: P1
Effort: M
Depends on: T9-002
Temuan: F-06

Scope:

- Dokumentasikan dependency direction: `app -> features -> shared` dan cross-surface `components` yang terbatas.
- Nyatakan cross-feature dependency yang diizinkan, misalnya seller composition boleh memakai public API catalog/orders/finance.
- Tambahkan lint/import rule atau architecture test yang memblokir:
  - `shared` mengimpor `features`, `components`, atau `lib`;
  - presentation mengimpor `*mock-data`;
  - feature A melakukan deep import ke internal feature B;
  - `app` mengimpor fixture langsung.
- Pindahkan `compactRupiah` sehingga `shared/format/money.ts` tidak bergantung pada `lib/utils.ts`.
- Tambahkan cycle detection ke CI.

Acceptance criteria:

- Boundary yang salah membuat test/lint gagal.
- Internal import cycles tetap 0.
- `shared/` hanya bergantung pada `shared/` dan package eksternal.
- Allowed cross-feature dependencies tertulis, sedikit, dan melalui public API.
- Tidak ada visual diff.

### [ ] T9-102 — Tetapkan blueprint feature data slice

Priority: P1
Effort: M
Depends on: T9-101
Temuan: F-01, F-03

Scope:

- Pilih satu domain kecil sebagai reference slice, misalnya seller reviews atau customers.
- Standardisasi file minimal:
  - `contracts.ts` untuk domain/view types;
  - `schemas.ts` untuk transport/storage parsing;
  - `mock.ts` untuk deterministic fixture dan operations;
  - `api.ts` untuk plain async source-neutral functions;
  - `hooks.ts` untuk query/mutation policy;
  - `index.ts` untuk public exports.
- Data source dipilih dalam data layer, bukan screen/hook/presentation.
- Bedakan transport DTO dari view model ketika bentuk backend tidak cocok dengan UI.
- Pertahankan pola plain function; jangan membuat repository class.
- Tuliskan naming, error, pagination, signal, query-key, dan mutation invalidation convention.

Acceptance criteria:

- Reference slice dapat berpindah mock/API tanpa mengubah import presentation.
- Presentation reference slice tidak mengimpor fixture atau `isLiveApi()`.
- Mock dan HTTP adapter mengembalikan contract domain yang sama.
- Blueprint singkat ditambahkan ke `ARCHITECTURE.md` sebagai current convention.
- Screenshot reference slice identik dengan baseline.

### [ ] T9-103 — Bangun deterministic mock runtime

Priority: P1
Effort: L
Depends on: T9-102
Temuan: F-03

Scope:

- Buat shared mock utilities yang kecil untuk clock, ID factory, latency, result/error, dan state reset.
- Sediakan scenario minimal: `default`, `empty`, `loading-slow`, `error`, `unauthorized`, dan domain-specific conflict bila relevan.
- Centralize latency; timer harus abort-aware dan dapat memakai fake clock pada unit test.
- Buat storage adapter berversi untuk storefront draft dan seller announcement.
- Parse storage payload dengan schema dan sediakan migration/fallback yang deterministic.
- Hilangkan `Date.now()` dari generated mock IDs.
- Pastikan setiap test mendapatkan state terisolasi dan bisa reset.
- Jangan menjadikan mock runtime production business engine; cukup mensimulasikan contract frontend.

Acceptance criteria:

- Mock output sama untuk seed/scenario yang sama.
- Abort membatalkan simulated latency.
- Storage corrupt/versi lama tidak membuat render crash.
- Scenario dapat dipilih oleh test tanpa edit source.
- Test tidak berbagi mutation state.
- Default scenario menghasilkan UI yang sama dengan baseline.

### [ ] T9-104 — Migrasikan seller reads ke data boundary

Priority: P1
Effort: XL, pecah per domain
Depends on: T9-103
Temuan: F-01

Scope per PR:

1. catalog/products dan seller overview;
2. orders dan customers;
3. finance/withdrawals;
4. inventory;
5. reviews dan coupons;
6. storefront;
7. API keys, webhooks, settings, onboarding, notifications, dan analytics.

Untuk setiap domain:

- Pindahkan fixture ke mock adapter milik domain.
- Screen hanya membaca hook/props yang source-neutral.
- Lengkapi query keys dan filter types.
- Standardisasi list/detail return, not-found, dan cursor/page metadata.
- Hindari fallback ke entity pertama ketika ID tidak ditemukan.
- Untuk server-rendered public-safe initial data, siapkan path prefetch/hydration tanpa mengharuskan backend sekarang.
- Jalankan visual baseline setelah setiap PR.

Acceptance criteria:

- Tidak ada seller screen yang mengimpor `lib/*mock-data`.
- Query key seller yang dipertahankan benar-benar digunakan; key spekulatif dihapus.
- Valid route tetap identik secara visual dan behavior.
- Invalid ID menghasilkan not-found policy, bukan entity lain.
- Mock default dan API mode memakai signature yang sama.

### [ ] T9-105 — Migrasikan buyer, public storefront, dan checkout reads

Priority: P1
Effort: L
Depends on: T9-103
Temuan: F-01

Scope:

- Buyer purchases, profile, sessions, invoice, dan delivery detail.
- Public storefront, public product detail, reviews summary, invoice verification, dan order status.
- Checkout product/store lookup dan order summary.
- Hapus direct fixture import dari `app/store`, `app/checkout`, `app/account`, buyer screens, dan commerce presentation.
- Pisahkan public data contract dari seller/admin contract bila exposure field berbeda.
- Pastikan secret/credential fixture hanya masuk ke authorized mock view, tidak ke public payload.

Acceptance criteria:

- `app/`, buyer screen, dan checkout presentation tidak mengimpor mock fixtures.
- Public DTO tidak membawa field admin/seller/secret yang tidak diperlukan.
- Public dynamic routes memiliki not-found dan metadata policy yang konsisten.
- Checkout characterization dan buyer E2E tetap lulus tanpa screenshot diff.

### [ ] T9-106 — Migrasikan admin reads ke data boundary

Priority: P1
Effort: XL, pecah per bounded context
Depends on: T9-103
Temuan: F-01

Scope per PR:

1. merchants, buyers, orders, payments, withdrawals;
2. inventory, fulfillment, reviews;
3. KYC, risk, webhooks, emergency controls;
4. campaigns, disputes, reconciliation, merchant fees;
5. providers, security, audit logs, system, roles/users/profile.

Untuk setiap context:

- Pindahkan inline arrays dan `lib/admin-mock-data` reads ke mock adapter.
- Tambahkan query hooks, typed filters, list/detail keys, dan stable selectors.
- Bedakan admin list summary contract dengan detail contract.
- Pastikan privileged/secret data tidak berada pada generic list model.
- Gunakan permission metadata sebagai input view policy, bukan sebagai backend enforcement palsu.

Acceptance criteria:

- Admin screen tidak mengimpor `lib/admin-mock-data`, inventory fixture, atau buyer fixture secara langsung.
- Seluruh query key admin yang dipertahankan digunakan dan diuji.
- List/detail contract terpisah ketika exposure berbeda.
- Admin visual/E2E baseline lulus.
- Tidak ada claim bahwa mock permission adalah security authoritative.

### [ ] T9-107 — Tambahkan source-neutral mutation layer

Priority: P1
Effort: XL, pecah per risk/domain
Depends on: T9-104, T9-105, T9-106
Temuan: F-01, F-03

Scope:

- Inventaris semua interaction yang saat ini hanya `setState`, `setTimeout`, atau local-array mutation.
- Kelompokkan menjadi:
  - local ephemeral UI state: modal/tab/disclosure, tetap lokal;
  - persisted client draft: lewat storage adapter;
  - domain mutation: lewat async feature function + React Query mutation.
- Prioritaskan checkout, product publish/archive, inventory import/reveal, withdrawal, review reply/report, storefront save, API key, webhook test, bank/MFA/session actions, serta seluruh privileged admin action.
- Standardisasi mutation result, optimistic policy, invalidate/update cache, retry, idempotency metadata, audit reason, recent-MFA requirement, dan user-visible success/error mapping.
- Mock adapter harus memutasi in-memory scenario state secara deterministic.
- UI confirmation dan copy tetap sama.

Acceptance criteria:

- Tidak ada fake domain success yang hanya ditentukan timer di presentation.
- Domain mutation dapat dijalankan dengan mock/API source menggunakan hook yang sama.
- Cache yang terdampak di-update/invalidate secara eksplisit.
- Sensitive mutation contract membawa reason/idempotency/MFA context yang diperlukan, walau mock belum memverifikasi backend.
- Success/error/duplicate-submit/abort test tersedia.
- Visual dan interaction baseline tetap lulus.

### [ ] T9-108 — Runtime contracts, environment, dan HTTP hardening

Priority: P1
Effort: L
Depends on: T9-102
Temuan: F-02

Scope:

- Validasi environment pada startup/build; production API mode tidak boleh diam-diam fallback ke localhost.
- Pisahkan public env dari server-only env dan dokumentasikan di `.env.example` tanpa secret.
- Gabungkan timeout signal dengan caller signal menggunakan mechanism yang benar; bedakan timeout vs user/navigation abort.
- Generate/forward request correlation ID.
- Normalize JSON problem, non-JSON error, network error, timeout, abort, dan 204.
- Tambahkan runtime schema parsing pada API envelope dan storage boundary.
- Sediakan typed hooks/options untuk CSRF token, idempotency key, recent-MFA proof, dan audit reason tanpa menyimpan secret di public env/local storage.
- Tentukan policy GET retry dan mutation no-retry.
- Jangan log credential, token, QR payload sensitif, atau raw inventory secret.

Acceptance criteria:

- Timeout tetap bekerja ketika external signal diberikan.
- Invalid response menghasilkan typed contract error, bukan data cast yang lolos diam-diam.
- Missing production API URL menggagalkan config secara jelas.
- Correlation ID tersedia pada request/error path.
- Semua behavior di atas diuji.
- Architecture API rules sesuai implementasi aktual.

### [ ] T9-109 — Bersihkan module surface, dead code, dan client boundary

Priority: P1
Effort: L
Depends on: T9-104 sampai T9-108
Temuan: F-07, F-08

Scope:

- Hapus delapan unreachable file yang tercatat audit setelah memastikan tidak ada external consumer.
- Hapus compatibility shim satu baris secara bertahap setelah semua import memakai canonical public API.
- Konsolidasikan formatter money, status classification, `MiniStat`, `SectionHead`, dan style tokens tanpa mengubah class/output.
- Split file besar berdasarkan responsibility, bukan angka baris semata: controller, pure selectors, table, dialog, dan presentation.
- Pindahkan constants besar keluar dari Client Component jika tidak perlu browser runtime.
- Ubah feature frame agar mengimpor local/canonical module, bukan memutar melalui compatibility `components/`.
- Evaluasi Server/Client boundary; komponen statis tetap server jika tidak butuh hook/event/browser API.
- Pertahankan `components/` hanya untuk cross-surface UI yang benar-benar shared.

Acceptance criteria:

- Unreachable source yang disengaja = 0 atau memiliki alasan terdokumentasi.
- Satu canonical import path per feature public surface.
- `shared` tidak bergantung pada `lib`.
- Tidak ada primitive money/status ganda dengan semantic berbeda tanpa nama eksplisit.
- Client bundle tidak membesar dari baseline tanpa alasan.
- Screenshot diff kosong.

## Phase 2 — Regression, accessibility, dan performance

### [ ] T9-201 — Tambahkan component dan integration test yang bernilai

Priority: P1
Effort: L
Depends on: Phase 1 domain terkait

Scope:

- Tambahkan DOM test environment dan React Testing Library/user-event bila dipilih.
- Uji behavior, bukan implementation detail/class string.
- Prioritas test:
  - query loading/error/empty/success;
  - forms dan schema validation;
  - pagination source function/component;
  - storage migration;
  - storefront reducer/history;
  - checkout calculation dan state transition;
  - mutation cache update dan duplicate prevention;
  - permission view behavior;
  - secret reveal/revoke policy.
- Gunakan contract fixtures/builders agar test tidak menggandakan giant object.
- Tetapkan threshold lebih tinggi untuk shared/data/pure domain modules daripada JSX presentation.

Acceptance criteria:

- Critical pure/data modules memiliki branch coverage bermakna, target awal minimal 80% untuk area tersebut.
- Test gagal bila contract mapping, query policy, atau mutation behavior rusak.
- Tidak ada snapshot JSX besar yang sulit direview.
- Suite tetap cepat dan deterministic.

### [ ] T9-202 — Lengkapi critical-flow E2E

Priority: P1
Effort: L
Depends on: T9-002, T9-107, T9-201

Scope:

- Ubah characterization test menjadi assertion behavior yang authoritative.
- Flow minimum:
  - storefront -> product -> checkout -> QRIS paid -> success/invoice;
  - buyer login mock -> purchases -> delivery -> session revoke;
  - seller onboarding -> product -> inventory -> order -> withdrawal;
  - storefront edit -> save -> refresh -> undo/redo;
  - admin merchant inspect -> impersonation confirmation;
  - admin withdrawal/dispute/reconciliation privileged confirmation;
  - theme persistence dan mobile navigation.
- Jalankan default scenario dan beberapa error/unauthorized/empty scenario.
- Gunakan stable selectors berbasis role/label; `data-testid` hanya ketika semantic selector tidak cukup.

Acceptance criteria:

- Critical flows lulus di desktop dan mobile Chromium.
- Retry rate CI dipantau; flaky test harus diperbaiki, bukan disembunyikan dengan retry berlebih.
- Trace tersedia untuk kegagalan.
- Tidak ada dependency pada internet/provider nyata.

### [ ] T9-203 — Tambahkan accessibility guardrail tanpa redesign

Priority: P1
Effort: M
Depends on: T9-202

Scope:

- Jalankan automated accessibility scan pada surface representatif.
- Audit keyboard navigation, focus order, focus trap/return pada modal, Escape close, accessible name, form error association, table semantics, live-region success/error, dan color-mode state.
- Perbaiki semantics/ARIA yang tidak mengubah tampilan.
- Jika perbaikan membutuhkan visual change, pisahkan dan minta persetujuan.

Acceptance criteria:

- Tidak ada serious/critical automated accessibility violation pada route utama.
- Semua interaction utama dapat diselesaikan dengan keyboard.
- Dialog mengelola focus dengan benar.
- Error/success async diumumkan ke assistive technology.
- Screenshot baseline tetap identik kecuali antialiasing/environment noise.

### [ ] T9-204 — Tetapkan performance dan bundle budgets

Priority: P2
Effort: M
Depends on: T9-109

Scope:

- Ukur client JS per representative route, build duration, hydration warning, dan Web Vitals lab.
- Tambahkan bundle analyzer/script yang tidak aktif pada build normal.
- Tentukan budget realistis berdasarkan baseline, lalu cegah regression.
- Lazy-load hanya surface berat dan non-critical seperti chart/editor/provider playground jika hasil ukur membenarkan.
- Kurangi client boundary melalui server composition dan pure props.
- Pastikan font/icon/chart import tidak menarik package lebih besar dari yang diperlukan.

Acceptance criteria:

- Budget tercatat dan dicek di CI atau release checklist.
- Tidak ada hydration warning pada smoke routes.
- Refactor memberi perbaikan terukur atau minimal tidak memperburuk baseline.
- Tidak ada visual/layout shift baru.

## Phase 3 — Production seams dan operational maturity

### [ ] T9-301 — Frontend security seams dan dependency policy

Priority: P1 sebelum launch
Effort: L
Depends on: T9-108, T9-202
Temuan: F-09

Scope:

- Buat typed mock auth/session adapter untuk buyer, seller, dan admin.
- Hubungkan route/view permission policy ke session contract tanpa mengklaim frontend sebagai authoritative.
- Tambahkan production guard yang menolak mock mode pada deployment live yang ditandai production.
- Definisikan security headers: CSP, HSTS pada production, frame ancestors, referrer policy, permissions policy, nosniff.
- Tentukan strategi CSP untuk inline theme bootstrap: hash, nonce, atau externalized script.
- Pastikan secret tidak dipersist ke local storage, query cache yang terlalu luas, error log, atau public bundle.
- Tambahkan dependency scanning rutin dan owner untuk advisory.
- Dokumentasikan dua advisory PostCSS/Next yang ditemukan dan upgrade path; jangan force downgrade.

Acceptance criteria:

- Unauthorized mock session memiliki route/view behavior teruji.
- Production config tidak dapat berjalan dengan accidental mock/live mismatch.
- Security headers memiliki automated assertion.
- Tidak ada high/critical production vulnerability.
- Moderate vulnerability memiliki keputusan, owner, dan target review.

### [ ] T9-302 — Tambahkan observability adapters

Priority: P2
Effort: M
Depends on: T9-108, T9-301

Scope:

- Buat interface kecil untuk error reporting, Web Vitals, dan event telemetry; default local/mock adapter tidak mengirim data keluar.
- Hubungkan route error boundary dan React Query global error policy ke reporter.
- Sertakan route, release/build ID, correlation ID, dan safe context.
- Redact email, credential, QR payload, token, bank account, dan sensitive admin data.
- Bedakan operational event dari financial source of truth; analytics frontend tidak menentukan revenue/ledger.
- Tambahkan no-op/test adapter agar E2E dapat mengassert event tanpa third-party network.

Acceptance criteria:

- Error produksi dapat ditelusuri ke release dan request ID tanpa data sensitif.
- Telemetry redaction diuji.
- Tidak ada third-party call pada default mock mode.
- Analytics tidak dipakai untuk keputusan finansial.

### [ ] T9-303 — Selaraskan dokumentasi, ADR, dan backend handoff

Priority: P2
Effort: M
Depends on: Phase 1, T9-301, T9-302
Temuan: F-10

Scope:

- Perbarui `ARCHITECTURE.md` dengan label jelas: current, target, backend-owned.
- Buat/fix `BACKEND_HANDOFF.md` di lokasi yang benar dan perbaiki link README.
- Dokumentasikan contracts untuk pagination, auth/session, errors, correlation, idempotency, MFA, permission, money, timezone, inventory secret, payment, ledger, fulfillment, KYC, dan audit.
- Tambahkan ADR singkat untuk mock/API selection, feature boundaries, React Query policy, public vs private DTO, dan server/client strategy.
- Tambahkan `.env.example`, local setup, test strategy, contribution/PR checklist, dan troubleshooting.
- Generate atau validasi daftar route agar README tidak drift manual.

Acceptance criteria:

- Tidak ada broken local documentation link.
- Dokumen tidak mengklaim E2E/correlation/cursor/security yang belum ada.
- Developer baru dapat install, run, test, dan memilih scenario mock dari docs saja.
- Backend handoff membedakan hard invariant dari UI preference.

### [ ] T9-304 — Final 9/10 audit dan release gate

Priority: P1 untuk menutup roadmap
Effort: M
Depends on: semua task target 9/10

Scope:

- Ulangi inventory file/import/cycle/dead-code/size/client-boundary.
- Ulangi format, lint zero-warning, typecheck, unit, coverage, build, E2E, accessibility, visual regression, bundle budget, dan dependency audit.
- Cari kembali direct mock imports, unsafe casts, raw storage parsing, timers, duplicate primitives, dan unused query keys.
- Bandingkan screenshot desktop/mobile dengan baseline awal.
- Review dokumentasi terhadap implementasi aktual.
- Buat scorecard baru dan daftar consciously accepted debt.

Acceptance criteria:

- Seluruh definisi 9/10 pada audit terpenuhi.
- CI hijau dari clean checkout menggunakan `npm ci`.
- Direct mock import dari presentation = 0.
- Internal cycles = 0; boundary violation = 0.
- Unreachable runtime source = 0 atau accepted/documented.
- E2E dan visual baseline lulus desktop/mobile.
- High/critical production vulnerability = 0.
- Tidak ada intentional UI change dari baseline tanpa approval eksplisit.
- Scorecard final minimal 9,0/10 dengan bukti command dan link artifact.

## Checklist PR untuk seluruh task

Gunakan checklist ini pada setiap implementasi nanti:

- [ ] Scope hanya concern task ini.
- [ ] Mock mode tetap default dan bekerja tanpa backend/internet.
- [ ] Tidak ada presentation import ke fixture/data source selector.
- [ ] Types dan runtime schema diperbarui bersama.
- [ ] Unit/integration test relevan ditambah atau diperbarui.
- [ ] Route smoke dan E2E terkait lulus.
- [ ] Screenshot desktop/mobile tidak berubah.
- [ ] Accessibility tidak menurun.
- [ ] Format, lint zero-warning, typecheck, test, dan build lulus.
- [ ] Tidak ada secret/PII pada fixture baru, log, screenshot, atau artifact.
- [ ] Dokumentasi current behavior diperbarui bila boundary berubah.

## Task yang tidak perlu dilakukan untuk mencapai 9/10

Hindari scope berikut kecuali ada kebutuhan produk terpisah:

- redesign UI atau mengganti design system;
- microfrontend;
- Redux/global state library baru tanpa masalah konkret;
- repository classes untuk setiap data function;
- monorepo migration hanya demi struktur;
- backend business logic di Next.js;
- coverage 100% pada static marketing JSX;
- optimisasi berdasarkan feeling tanpa bundle/performance measurement;
- mengganti framework/library besar saat pattern yang ada masih memadai.

Fokus utama tetap: **UI yang sama, data boundary yang konsisten, mock yang dapat dipercaya, test yang menjaga behavior, dan CI yang mencegah arsitektur mundur.**
