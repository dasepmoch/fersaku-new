# Audit Codebase Fersaku Frontend

Tanggal audit: 16 Juli 2026
Scope: kondisi working tree aktual di `frontend/`, termasuk file tracked yang berubah dan file untracked
Fokus: arsitektur, modularitas, scalability, mock-first data flow, type safety, testing, reliability, security, performance, dan developer experience
Non-goal: mengubah UI, desain, copy, atau behavior produk yang terlihat pengguna

## Ringkasan eksekutif

**Nilai keseluruhan saat ini: 6,5/10.**

- Sebagai prototype mock yang kaya fitur: **7,2/10**.
- Sebagai frontend yang siap tumbuh dan disambungkan ke backend produksi: **6,3/10**.
- Target setelah backlog di `docs/TASKS_TO_9.md` selesai: **9,0/10** untuk kualitas engineering frontend. Backend Go tetap harus menjadi sumber kebenaran untuk auth, authorization, payment, ledger, fulfillment, KYC, dan secret.

Verdict singkat: struktur dasarnya sudah baik dan arah refactor terakhir benar. App Router, route eksplisit, feature folders, strict TypeScript, TanStack Query, shared HTTP client, loading/error boundary, serta pemecahan file besar sudah menjadi fondasi yang layak. Hambatan utamanya bukan UI, melainkan konsistensi boundary: banyak screen masih membaca fixture langsung, mutation masih berupa local state, kontrak API belum divalidasi saat runtime, test belum melindungi UI/flow, dan quality gate belum otomatis di CI.

Mencapai 9/10 tidak membutuhkan redesign. Yang dibutuhkan adalah mengunci tampilan sekarang dengan visual regression test, lalu merapikan data flow dan tooling di bawahnya.

## Snapshot yang diaudit

| Sinyal                                            |                Hasil |
| ------------------------------------------------- | -------------------: |
| TypeScript/TSX aplikasi, tidak termasuk test      |             339 file |
| Halaman App Router                                |        82 page files |
| Source TS/TSX                                     | sekitar 27.578 baris |
| Client Components                                 |             121 file |
| File source di atas 200 baris                     |              41 file |
| File source di atas 300 baris                     |              10 file |
| Unit test                                         |    10 file / 34 test |
| E2E test                                          |      0 file / 0 test |
| Internal import cycles                            |                    0 |
| Direct mock imports dari app/component/screen     |    sekitar 44 import |
| Query key yang didefinisikan tetapi belum dipakai |               18 key |
| File yang tidak reachable dari App Router         |               8 file |
| Tracked files yang sedang berubah                 |              62 file |
| Expanded untracked files                          |             142 file |

Working tree besar ini bukan otomatis berarti kodenya buruk, tetapi meningkatkan risiko refactor sulit direview, regression tersembunyi, dan file compatibility tertinggal. Sebelum task lain dikerjakan, perubahan ini perlu dijadikan checkpoint yang bersih dan terverifikasi.

## Hasil quality gate aktual

| Pemeriksaan                  | Status               | Catatan                                                      |
| ---------------------------- | -------------------- | ------------------------------------------------------------ |
| `npm run typecheck`          | Lulus                | Strict TypeScript aktif                                      |
| `npm run test:run`           | Lulus                | 10 file, 34 test                                             |
| `npm run build`              | Lulus                | Production compile lulus; 69 static generation units selesai |
| `npm run lint`               | Lulus dengan warning | 5 unused-import warning                                      |
| `npm run format:check`       | Gagal                | 4 file belum sesuai Prettier                                 |
| `npm run verify`             | Gagal secara efektif | Berhenti di format check                                     |
| `npx playwright test --list` | Gagal                | `tests/e2e` belum ada, 0 test                                |
| `npx vitest run --coverage`  | Gagal                | `@vitest/coverage-v8` belum terpasang                        |
| `npm audit --omit=dev`       | Perlu tindak lanjut  | 2 advisory moderat melalui PostCSS bawaan Next               |

Catatan dependency: jangan menjalankan `npm audit fix --force` tanpa review. Pada snapshot ini npm menyarankan perubahan Next yang breaking/downgrade. Solusi yang benar adalah memantau advisory dan meng-upgrade Next/PostCSS secara terkontrol ketika versi perbaikannya layak.

## Scorecard

| Area                             |    Bobot |           Nilai | Alasan utama                                                                                         |
| -------------------------------- | -------: | --------------: | ---------------------------------------------------------------------------------------------------- |
| Arsitektur dan module boundaries |      20% |             7,7 | Feature folders, explicit routes, no cycles; boundary belum konsisten atau enforced                  |
| Data layer dan scalability       |      15% |             6,4 | Query/API pattern sudah ada tetapi baru sebagian domain; mutation layer belum ada                    |
| Type safety dan contract safety  |      10% |             7,2 | `strict: true`; masih banyak cast dan tidak ada runtime response validation                          |
| Testing dan regression safety    |      15% |             5,2 | Unit test lulus; tidak ada component/E2E/visual test dan coverage belum aktif                        |
| Reliability dan error handling   |      10% |             6,4 | Route boundary dan structured error tersedia; timeout API memiliki gap dan state async belum seragam |
| Security readiness               |      10% |             5,8 | Security intent terdokumentasi; auth/RBAC masih mock dan security headers belum ada                  |
| Performance dan Next.js usage    |       8% |             7,0 | Build sehat dan route eksplisit; client surface besar, belum ada budget atau bundle gate             |
| DX, CI, dan dokumentasi          |       7% |             5,8 | Script lokal cukup lengkap; CI, Node pin, env example, dan handoff doc belum ada                     |
| Maintainability dan konsistensi  |       5% |             7,0 | Refactor pemecahan file bagus; masih ada shim, dead code, dan primitive duplikat                     |
| **Total tertimbang**             | **100%** | **sekitar 6,5** |                                                                                                      |

## Hal yang sudah bagus

1. **Arah arsitektur jelas.** `app/` berfokus pada route dan sebagian besar seller/admin page sudah tipis. Route catch-all tidak dipakai untuk product surfaces.
2. **Tidak ada circular dependency** pada 339 file aplikasi yang dipetakan.
3. **TypeScript strict dan build production lulus.** Ini fondasi yang penting sebelum backend dihubungkan.
4. **Mock-first adalah keputusan yang tepat** untuk tahap sekarang. `NEXT_PUBLIC_DATA_SOURCE` dan plain async feature API membuat migrasi bertahap mungkin dilakukan.
5. **Query key sudah tenant-aware** pada seller data dan dipisahkan antara seller, admin, dan buyer.
6. **Money memakai integer IDR** di contract finance dan fixture utama.
7. **Error/loading boundary route sudah ada** untuk root, seller workspace, dan admin console.
8. **Admin permission metadata sudah dipetakan per route.** Walaupun enforcement masih mock, vocabulary-nya sudah terbentuk.
9. **Pure state helper mulai diekstrak.** Storefront undo/redo adalah contoh yang baik dan sudah diuji.
10. **Refactor terbaru berhasil memangkas file monolitik.** Diff memperlihatkan lebih dari 15 ribu baris dipindah/dipecah tanpa mematahkan typecheck atau build.

## Temuan prioritas

### F-01 — Data boundary baru konsisten di sebagian domain

Severity: tinggi untuk scalability.

Arsitektur menyatakan flow `page -> screen -> query hook -> API module -> mock/API`, tetapi implementasi aktual masih memiliki sekitar 44 direct import dari `lib/*mock-data` di app, screen, dan presentation component. Contoh ada di public storefront, buyer security/detail, checkout, seller inventory, seller overview, admin overview/reviews/inventory, dan beberapa detail screen.

Dari query keys yang sudah disiapkan, 18 belum memiliki pemakaian nyata, termasuk seller coupons, webhooks, API keys, storefront, serta banyak domain admin seperti KYC, risk, campaigns, providers, reconciliation, dan disputes. Seluruh mutation penting juga masih local `useState`/`setTimeout`, bukan feature mutation API.

Dampak:

- Peralihan dari mock ke API akan memaksa perubahan banyak screen.
- Data loading/error/empty behavior akan berbeda-beda.
- Cache invalidation dan optimistic update belum memiliki satu pola.
- Fixture transport dan view model mudah saling mengunci.

Target: presentation tidak pernah tahu apakah data berasal dari mock atau HTTP.

### F-02 — HTTP client belum memenuhi aturan arsitektur sendiri

Severity: tinggi sebelum live API.

`shared/api/http-client.ts` sudah menangani cookie, JSON, timeout, dan structured error. Namun:

- Pada baris 55, `options.signal || controller.signal` membuat timeout internal tidak berlaku ketika TanStack Query mengirim signal. Hampir semua query hook mengirim signal, sehingga timeout 15 detik praktis tidak menjadi guard pada jalur utama.
- Response JSON hanya di-cast ke generic pada baris 71, tidak divalidasi dengan Zod atau schema lain.
- `NEXT_PUBLIC_API_URL` fallback ke `http://localhost:8080` juga berlaku jika konfigurasi production hilang.
- Request correlation yang diklaim `ARCHITECTURE.md` belum dihasilkan/dikirim.
- Belum ada seam standar untuk CSRF, idempotency key, recent-MFA context, atau audit reason pada mutation sensitif.
- Error untuk invalid JSON, offline, timeout, abort, dan 204 belum diuji sebagai behavior.

### F-03 — Mock layer tersebar dan belum menjadi simulator yang deterministic

Severity: tinggi untuk refactor aman.

Fixture berada di `lib/`, beberapa feature `data.ts`, dan array langsung di screen. `Date.now()` digunakan untuk ID mock, banyak interaction memakai timer sendiri, dan browser persistence memakai raw `localStorage`.

`features/seller/storefront/draft.ts` melakukan `JSON.parse` lalu type cast dan shallow merge tanpa version/schema migration. Pola serupa ada pada announcement seller. Tidak ada scenario seperti empty, loading lambat, unauthorized, API error, atau conflict yang dapat dipilih test.

Target mock-first yang scalable adalah mock adapter yang:

- memakai contract yang sama dengan HTTP adapter;
- deterministic melalui injected clock/ID factory;
- mendukung scenario dan failure injection;
- menyimpan state melalui storage adapter berversi;
- dapat di-reset per test;
- tidak bocor ke presentation.

### F-04 — Regression safety belum cukup untuk janji “UI tidak berubah”

Severity: tinggi.

Playwright sudah dikonfigurasi untuk desktop dan mobile, tetapi `tests/e2e` tidak ada. Tidak ada screenshot baseline, route smoke test, atau interaction test. Karena target refactor tidak boleh mengubah UI, visual regression justru harus menjadi task pertama sebelum pemindahan module berikutnya.

Unit test yang ada berguna tetapi sangat sempit:

- `tests/unit/pagination.test.ts` menyalin algoritma pagination ke dalam test, bukan menguji source function. Test dapat tetap hijau saat implementasi sebenarnya berubah.
- `tests/unit/http-client.test.ts` hanya menguji constructor `ApiError`, bukan networking behavior.
- Belum ada test untuk hooks, mutations, schemas, error state, local storage migration, form behavior, atau accessibility.
- Coverage config ada tetapi provider tidak terpasang dan threshold tidak ditentukan.

Rasio kasar test source terhadap production TS/TSX hanya sekitar 452 : 27.578 baris. Coverage tidak harus mengejar semua JSX, tetapi critical domain behavior dan adapter wajib kuat.

### F-05 — Quality gate belum otomatis dan belum reproducible

Severity: tinggi untuk kerja tim.

Tidak ada workflow CI, Node version pin, `engines`, `.env.example`, atau dependency update policy. `verify` belum memasukkan E2E dan saat audit gagal karena format. Lint juga mengizinkan lima warning tanpa membuat job gagal.

Tanpa CI, script yang baik di `package.json` tetap bergantung pada disiplin manual.

### F-06 — Boundary dan public API module belum ditegakkan

Severity: menengah.

Tidak ada lint rule yang mencegah `shared` mengimpor feature/lib, screen membaca fixture, atau deep import yang melewati public API. Satu pelanggaran arah yang konkret adalah `shared/format/money.ts` mengimpor `lib/utils.ts`.

Cross-feature dependency seller -> catalog/orders/finance terlihat masuk akal sebagai composition, tetapi perlu aturan eksplisit agar tidak berkembang acak. Folder `components/` saat ini mencampur cross-surface components, compatibility re-export, dan legacy code.

Sisi positifnya: audit graph tidak menemukan cycle.

### F-07 — Masih ada dead code, compatibility shim, dan duplikasi primitive

Severity: menengah.

Delapan file tidak reachable dari App Router pada snapshot ini:

- `components/account-controls.tsx`
- `components/admin-extras.tsx`
- `components/admin-providers.tsx`
- `components/admin-security-center.tsx`
- `components/buyer-pages.tsx`
- `components/checkout-experience.tsx`
- `components/checkout-flow.tsx`
- `components/storefront-builder.tsx`

Sebagian besar merupakan shim satu baris, tetapi `components/checkout-flow.tsx` adalah implementasi legacy yang lebih besar.

Duplikasi yang perlu dikonsolidasikan tanpa mengubah class/output:

- dua formatter `rupiah` dengan output berbeda;
- status classification di `shared/format/status.ts`, `shared/ui/status-badge.tsx`, seller UI, dan feature pieces;
- lebih dari satu `MiniStat` dan `SectionHead`;
- beberapa jalur re-export ganda seperti `foo.tsx -> foo/index -> implementation`.

### F-08 — Client boundary masih lebar

Severity: menengah.

121 dari 339 file aplikasi adalah Client Components. Banyak di antaranya memang interaktif, tetapi beberapa screen/controller berukuran 250–500 baris menempatkan data mapping, constants, modal state, timer, table, dan presentation dalam satu client bundle. Tidak ada dynamic import/lazy boundary untuk screen berat seperti chart, storefront preview, campaign composer, atau provider playground.

Ini belum terbukti sebagai masalah performa karena belum ada bundle budget. Task yang benar adalah mengukur dahulu, lalu memecah controller/presentation atau lazy-load hanya ketika hasil ukur membenarkan.

### F-09 — Security intent bagus, enforcement masih prototype

Severity: blocker production, wajar untuk mock stage.

Admin route memiliki permission metadata, tetapi `mockPermissions` berisi `"*"`. Tidak ada auth route guard/middleware, mock session contract, security headers, atau CSP. Inline theme boot script juga perlu strategi hash/nonce jika CSP ketat diterapkan.

Ini tidak perlu “dipalsukan” menjadi security backend di frontend. Yang perlu dibangun sekarang adalah seam yang benar: mock auth adapter, typed permission contract, route guard interface, mutation context, headers, dan test. Backend Go tetap authoritative.

Dependency audit juga menemukan dua advisory moderat melalui PostCSS bawaan Next. Tidak ada high/critical advisory pada audit production yang dijalankan.

### F-10 — Dokumentasi lebih maju daripada implementasi

Severity: menengah.

`ARCHITECTURE.md` menyebut `tests/e2e`, request correlation, cursor pagination, dan critical Playwright flows seolah sudah aktif. Sebagian belum ada atau baru berlaku pada domain tertentu. `README.md` dua kali mengarah ke `../docs/BACKEND_HANDOFF.md`, tetapi file tersebut tidak ada di workspace.

Dokumentasi arsitektur harus membedakan `current`, `target`, dan `backend-owned` agar developer tidak membangun berdasarkan asumsi yang salah.

### F-11 — Detail route dan state belum memiliki semantic policy seragam

Severity: menengah-rendah.

Sebagian public route memakai `notFound()`, tetapi banyak detail client query memakai fallback data atau `null` dengan behavior berbeda. `useSellerOrder` bahkan memakai order pertama sebagai placeholder jika ID tidak ditemukan. Ini dapat menampilkan entity yang salah sesaat ketika masuk ke route invalid/live mode.

Perlu satu policy untuk loading, not found, forbidden, empty, stale, dan retry. Tampilan route valid harus tetap persis sama.

### F-12 — SEO/metadata dan operational signals masih minimal

Severity: rendah untuk refactor, menengah sebelum launch.

Hanya root metadata yang ditemukan. Public storefront, product, blog, dan invoice verification belum memiliki metadata dinamis yang terukur. Belum ada Web Vitals/error reporting adapter, release metadata, atau request ID yang ditampilkan pada error support path.

## Arsitektur target yang disarankan

Tetap sederhana; tidak perlu repository/interface berlapis-lapis.

```txt
App Router page/layout
  -> feature screen/controller
  -> query or mutation hook
  -> feature data function
       -> mock adapter (default)
       -> HTTP adapter (when DATA_SOURCE=api)
  -> shared typed HTTP client

Feature slice
  contracts.ts       domain/view types
  schemas.ts         runtime transport validation
  mock.ts            deterministic fixtures + operations
  api.ts              source selection + plain async functions
  hooks.ts           query/mutation policy
  components/        presentation
  index.ts           supported public API only
```

Aturan dependency:

```txt
app -> features -> shared
app -> components (cross-surface only)
feature composition -> explicitly allowed feature public API
shared -> shared only
mock fixtures -> feature contract, never presentation
```

## Makna target 9/10

Target 9/10 tercapai jika seluruh kondisi berikut benar:

1. Tidak ada intentional UI diff pada baseline desktop/mobile yang disetujui.
2. Presentation tidak mengimpor `lib/*mock-data` atau memilih data source.
3. Seluruh read dan mutation flow utama melewati feature data API yang dapat memakai mock atau HTTP.
4. Mock deterministic, resettable, scenario-driven, dan memakai contract yang sama dengan API.
5. Runtime parsing aktif di network/storage boundary.
6. Boundary lint mencegah dependency yang salah dan tidak ada cycles.
7. Format, lint tanpa warning, typecheck, unit/component test, E2E, accessibility smoke, build, dan audit policy berjalan di CI.
8. Critical flows memiliki desktop/mobile E2E dan visual regression coverage.
9. HTTP client lulus test timeout, abort, error normalization, correlation, dan 204.
10. Tidak ada high/critical production vulnerability; moderate vulnerability memiliki owner dan keputusan terdokumentasi.
11. Bundle/performance budgets diukur dan dijaga tanpa mengubah desain.
12. `README` dan `ARCHITECTURE` hanya mengklaim behavior yang benar-benar ada.

9/10 bukan berarti semua file harus kecil atau coverage 100%. Artinya boundary sulit dilanggar, perubahan aman direview, mock/API dapat ditukar tanpa menyentuh UI, critical behavior teruji, dan operational risk memiliki guardrail.

## Addendum implementasi

Refactor mock-first, data boundaries, quality gates, critical/visual/accessibility E2E, security seams, observability, dan backend handoff pada roadmap sudah dikerjakan dalam snapshot yang sama. Baseline score di atas adalah historical audit sebelum perubahan; scorecard setelah implementasi dan accepted debt tercatat di [`IMPLEMENTATION_STATUS_2026-07-16.md`](IMPLEMENTATION_STATUS_2026-07-16.md).

## Kesimpulan historical baseline

Pada saat audit awal, project ini **sudah cukup rapi untuk melanjutkan pengembangan**, tetapi **belum scalable secara konsisten**. Refactor yang direncanakan kemudian dieksekusi tanpa redesign; hasil akhirnya dicatat pada addendum dan implementation status di atas.

Urutan implementasi lengkap, dependency antar-task, dan acceptance criteria ada di `docs/TASKS_TO_9.md`.
