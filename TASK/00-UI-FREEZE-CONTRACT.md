# UI Freeze Contract — Integrasi Data Tanpa Redesign

**Status:** wajib, berlaku untuk setiap task pada folder `TASK/`.

**Mandat pemilik produk:** UI yang sekarang tidak boleh diubah. Jika wiring membutuhkan penambahan atau penyesuaian surface, implementer wajib memakai komponen yang sudah ada dengan tampilan, API visual, dan pola komposisi yang sama persis.

## UI-000 — Ambil baseline sebelum mengubah kode

### Checklist

- [ ] Catat commit dasar dan pastikan unrelated working-tree changes tidak disentuh.
- [ ] Jalankan `npm run test:e2e:smoke` pada mode mock.
- [ ] Jalankan `npm run test:e2e:a11y` pada mode mock.
- [ ] Jalankan `npm run test:e2e:visual` pada desktop dan mobile.
- [ ] Simpan hasil run/artefact CI; jangan menyalin secret/API data ke artefact.
- [ ] Catat baseline behavior critical flows pada `tests/e2e/critical-flows.spec.ts`.
- [ ] Catat route yang belum memiliki screenshot tetapi akan disentuh; tambahkan characterization test sebelum wiring, menggunakan UI existing tanpa mengubah snapshot lama.

### Baseline visual yang sudah ada

`tests/e2e/visual.spec.ts` melindungi 14 route pada desktop dan mobile:

```text
/
/pricing
/@asep-ai-tools
/@asep-ai-tools/ai-prompt-pack
/checkout/prod_01
/account/purchases
/account/purchases/FRS-240712-1842
/account/security
/dashboard
/dashboard/products
/dashboard/orders
/dashboard/storefront
/admin
/admin/merchants
```

Route lain tetap dilindungi smoke suite di `tests/e2e/routes.ts`. Jangan menganggap route tanpa screenshot bebas di-redesign.

### Acceptance criteria

- Ada hasil baseline yang repeatable dari environment bersih.
- Kegagalan awal dipisahkan dari regresi hasil wiring.
- Tidak ada snapshot yang di-update sebagai bagian integrasi.

## UI-010 — Area yang dibekukan

Tanpa persetujuan eksplisit, agent **dilarang** mengubah:

- URL, folder route, route group, ownership `page.tsx`, atau hierarchy layout;
- urutan section, DOM composition visual, grid, flex behavior, width/height, spacing, gap, padding, margin;
- breakpoint, mobile/desktop stacking, sticky behavior, overflow, dan scroll behavior;
- font, font size/weight/line-height, warna, gradient, border, radius, shadow, opacity;
- icon, ukuran/posisi icon, illustration/product art;
- static product copy, label, placeholder, heading, CTA text, status text, empty/error/loading copy; dynamic backend value dan mock/security exception mengikuti clarification di bawah;
- table columns, modal/drawer style, pagination style, form density, button hierarchy;
- transition/animation/timing yang terlihat pengguna;
- light/dark theme behavior;
- focus ring, keyboard order, ARIA label, atau semantics yang sudah benar;
- screenshot baseline existing.

Mengganti hardcoded value menjadi data backend boleh dilakukan selama output view model untuk fixture sepadan menghasilkan hierarchy/class/geometry yang sama. Nilai dinamis memang boleh berbeda. Literal mock, fake secret, fake identity, atau fake success **tidak boleh dipertahankan pada API mode hanya demi screenshot**.

### Clarification untuk content mock dan security state

Freeze ini melindungi desain, bukan kebohongan data. Karena itu:

- mock mode wajib tetap pixel-identical dengan baseline existing;
- API mode dengan fixture yang security-equivalent wajib pixel-identical untuk layout, geometry, class, typography, color, icon, dan component composition;
- nilai dinamis seperti nama, nominal, status, tanggal, count, dan masked identifier mengikuti backend;
- literal seperti “mock”, link simulasi, credential palsu permanen, atau success palsu harus mode-gated/diganti dengan state authoritative;
- auth challenge, one-time secret, masked secret, dan capability state dinilai dengan **structural/geometry parity**, bukan kesamaan literal pixel dengan fake content;
- visible copy baru yang belum memiliki variant existing harus mengikuti `UI-080`; reuse exact shell/form/dialog/control, buat characterization screenshot sebelum wiring, dan minta approval jika wording/product flow benar-benar baru.

## UI-020 — Perubahan yang boleh dilakukan

Perubahan berikut boleh selama tidak mengubah hasil visual:

- mengganti sumber data mock menjadi hook/API source-neutral;
- membuat transport DTO, Zod schema, mapper, query key, mutation, session/store provider;
- menambahkan event handler, `disabled`, `aria-busy`, atau state binding pada element existing sesuai behavior yang sudah divisualisasikan;
- menghubungkan skeleton/error/modal/toast/status existing ke network lifecycle;
- memindahkan business/fixture import keluar dari presentation ke API/mock adapter;
- menambahkan invisible route/auth boundary, server prefetch, hydration, request correlation, atau telemetry redaction;
- mengubah fallback internal yang tidak terlihat pengguna;
- menambah test IDs hanya jika tidak memengaruhi accessibility atau styling;
- membuat adapter komposisi yang menghasilkan props exact untuk component existing.

Jika data backend memerlukan field baru tetapi UI tidak punya tempat untuk menampilkannya, simpan field di transport/domain contract atau abaikan secara eksplisit pada mapper. Jangan membuat card/row/badge baru hanya agar semua field backend tampil.

## UI-030 — Registry komponen yang wajib digunakan ulang

### Cross-surface

- `shared/ui/form-controls.tsx` — primitive input/form existing.
- `shared/ui/status-badge.tsx` — status badge existing.
- `shared/ui/table-pagination.tsx` dan `shared/ui/use-client-pagination.ts` — pagination presentation existing.
- `shared/ui/section-head.tsx`, `shared/ui/mini-stat.tsx` — heading/stat pattern.
- `shared/ui/notification-center.tsx` — notification shell; ganti data/action, bukan desain.
- `shared/ui/profile-menu.tsx` — profile/session menu; ganti authority/action, bukan desain.
- `components/auth-shell.tsx`, `components/auth-form.tsx`, `components/buyer-login.tsx` — auth surface existing.
- `features/admin/components/admin-shell.tsx` (`AdminLogin`) dan `app/account/verify/page.tsx` juga termasuk visual-risk auth surfaces; keduanya saat snapshot masih static/mock dan tidak boleh diberi form/error panel baru dalam wiring.
- `components/invoice-view.tsx` — invoice presentation existing.
- `components/mock-interaction-boundary.tsx` — harus mode-gated; jangan tampilkan feedback mock pada API mode.

### Seller

- `features/seller/components/dashboard-shell.tsx` dan `seller-dashboard-frame.tsx` — shell/navigation.
- `features/seller/ui/pieces.tsx` — primitive seller existing; import langsung, jangan membuat versi live.
- `app/dashboard/(workspace)/loading.tsx` — seller route loading surface.
- `app/dashboard/(workspace)/error.tsx` — seller route error/retry surface.
- Form, table, card, dialog, status, dan chart yang sudah dipakai screen seller terkait harus dipakai langsung; jangan menyalin JSX-nya menjadi “versi live”.

### Buyer

- `features/buyer/components/buyer-shell.tsx` — account shell/navigation existing.
- Screen/piece dalam `features/buyer/screens/**` — pertahankan card, review, delivery, profile, dan security composition existing.
- `components/buyer-login.tsx` dan `components/invoice-view.tsx` — ganti data/action melalui adapter, bukan markup.

### Admin

- `features/admin/ui/admin-button.tsx`.
- `features/admin/ui/dialogs.tsx`, termasuk guarded confirmation flow.
- `features/admin/ui/forms.tsx`.
- `features/admin/ui/layout.tsx`, `chrome.tsx`, `status.tsx`, `transaction-source.tsx`.
- `app/admin/(console)/loading.tsx` dan `error.tsx`.
- `features/admin/components/admin-shell.tsx` dan `admin-permission-boundary.tsx`.

Jika membutuhkan pola yang belum terdaftar, cari lebih dahulu dengan `rg` di `shared/ui`, `components`, dan feature domain. Reuse component secara import; jangan copy-paste markup/class.

## UI-040 — Aturan mapper agar UI tetap identik

Setiap domain menggunakan tiga bentuk data yang terpisah:

```text
Backend transport DTO (wire truth)
  -> schema validation
  -> mapper eksplisit
  -> existing frontend view model
  -> existing component props/JSX
```

Mapper harus:

- menormalisasi enum backend ke label/status yang sudah dimengerti UI;
- memformat timestamp/money melalui formatter existing, bukan string dari server;
- mengisi optional display field hanya jika contract existing mengizinkan;
- tidak mengarang status keamanan/risk/KYC/paid;
- tidak memakai mock sebagai fallback ketika response API tidak lengkap;
- melempar `INVALID_API_CONTRACT` bila field authoritative wajib hilang;
- mempertahankan stable IDs untuk React keys dan state selection;
- menerima response pagination/meta tanpa memaksa perubahan table UI;
- diuji dengan fixture mock dan fixture API sehingga view model setara.

Contoh yang benar:

```ts
// Transport enum tetap UPPERCASE; mapper menghasilkan view status existing.
const view = mapWithdrawalDto(dto);
// JSX menerima SellerWithdrawal yang sama seperti mode mock.
```

Contoh yang dilarang:

```tsx
// Jangan cabangkan desain di component berdasarkan sumber data.
return isLiveApi() ? <NewLiveWithdrawalTable /> : <ExistingTable />;
```

## UI-050 — Network lifecycle tanpa menambah desain

Untuk setiap route:

- **initial loading:** gunakan route loading/skeleton existing; pertahankan footprint agar layout tidak melompat;
- **background refresh:** pertahankan data lama, jangan mengganti seluruh layar dengan spinner;
- **empty:** gunakan empty composition/copy yang sudah ada; bila route snapshot tidak memilikinya, enforce bounded non-empty launch invariant atau catat `UI-080`—jangan menambah fake rows;
- **error:** gunakan error boundary/inline error existing dan retry GET yang eksplisit;
- **401:** hapus cache sensitif dan arahkan ke login surface sesuai surface;
- **403:** render existing unauthorized boundary where one exists (admin); buyer/seller must use backend safe-404 or a documented `UI-080` existing unavailable composition—never silently redirect as auth or invent a panel;
- **404:** gunakan `notFound()`/not-found behavior existing hanya untuk resource yang memang tidak ditemukan;
- **409:** pertahankan form/draft dan gunakan dialog/error existing untuk refresh/retry conflict;
- **400 `VALIDATION_FAILED`:** map field error ke input existing tanpa mengubah form layout; `INT-000` harus mengubah seluruh provider/consumer bersama jika kelak memilih `422`;
- **429:** hormati `Retry-After`; jangan loop retry;
- **5xx/network:** data cached yang aman boleh tetap terlihat dengan error state existing; jangan fallback ke mock;
- **mutation pending:** disable CTA existing dan cegah double-submit;
- **mutation success:** gunakan success state existing setelah response authoritative;
- **mutation failure/unknown:** jangan pindah ke success; pertahankan state dan berikan retry/recovery existing.
- **auth-state gap:** jika surface auth existing tidak memiliki generic failure, MFA, rate-limit, atau unavailable region, ikuti `UXE-011` pada disposition matrix; jangan memetakan kegagalan ke success atau menyisipkan copy/layout baru.

## UI-060 — Perilaku responsive, a11y, dan motion

- Wiring tidak boleh membuat content layout shift akibat data datang terlambat.
- Focus tetap berpindah ke dialog/success/error sesuai behavior existing.
- Semua CTA pending tetap dapat dipahami screen reader (`aria-busy`/status existing), tanpa menambah visible copy.
- Error field terhubung ke input melalui ARIA existing.
- Polling tidak memicu live-region spam.
- Animasi snapshot dimatikan oleh test, tetapi runtime timing yang terlihat tetap sama.
- Data panjang/unknown harus dipetakan atau dipotong sesuai primitive existing; jangan mengubah lebar table/card.
- Test desktop dan mobile wajib dijalankan dengan data seeded API yang panjang/empty/error, bukan hanya happy path pendek.

## UI-070 — File yang berisiko tinggi

Perubahan pada file berikut wajib ditinjau sebagai visual-risk walaupun diff terlihat kecil:

```text
app/**/page.tsx
app/**/layout.tsx
app/**/loading.tsx
app/**/error.tsx
app/globals.css
components/**/*.tsx
shared/ui/**/*.tsx
features/**/screens/**/*.tsx
features/**/components/**/*.tsx
features/admin/ui/**/*.tsx
features/seller/storefront/**/*.tsx
tailwind/postcss/font config
tests/e2e/__screenshots__/**
```

Sebagian besar wiring seharusnya terjadi di `features/**/api.ts`, `features/**/data/*.ts`, hooks, contract/schema/mapper, `shared/api`, provider, dan backend.

## UI-080 — Protocol pengecualian UI

Jika backend requirement benar-benar tidak bisa diekspresikan oleh component existing:

1. Hentikan perubahan UI pada task wiring.
2. Dokumentasikan requirement, state yang belum punya surface, risiko jika tidak ditampilkan, dan component existing yang sudah dievaluasi.
3. Ajukan perubahan sebagai proposal terpisah dengan screenshot/wireframe dan persetujuan eksplisit pemilik produk.
4. Jangan menyelipkan proposal tersebut ke PR wiring.
5. Setelah disetujui, extend primitive existing; jangan membuat visual language baru.

Security tidak boleh dikorbankan demi freeze. Jika action tidak aman tanpa prompt/step-up yang belum punya surface, disable/hentikan action dan eskalasi melalui protocol ini—jangan menjalankan mutation diam-diam.

### Default auth-state composition (tidak menambah route)

Untuk menghindari route baru selama wiring, default keputusan backlog adalah:

- `/login` tetap memiliki ownership seller login dan juga merender state verify-email, reset-password, merchant invite consume, serta seller MFA challenge dari fragment/flow state;
- `/admin/login` tetap memiliki ownership admin login dan admin MFA challenge;
- `/account/verify` tetap menangani buyer magic-link consume;
- staff invite consume masuk melalui `/admin/login`, merchant invite melalui `/login`;
- seluruh state menyusun `AuthShell`, form controls, button, error, dan modal existing dengan class/geometry yang sama.

Jika contract/backend membutuhkan route berbeda atau existing components tidak cukup, itu adalah `UI-080` exception. Jangan menambah `page.tsx` diam-diam.

## UI-090 — Review checklist per PR

- [ ] Tidak ada frozen route/layout/style/icon atau static copy yang berubah. Dynamic authoritative values, security redaction, dan explicit prototype/mock labels may differ only where documented in task 00/10; any other copy change requires UI-080.
- [ ] Tidak ada duplicate visual component atau live-only screen.
- [ ] DTO dipetakan ke view model di feature boundary.
- [ ] Presentation tidak mengimpor fixture/mock/backend DTO/API URL.
- [ ] Loading/empty/error/unauthorized/not-found memakai surface existing.
- [ ] CTA mencegah double-submit dan hanya success setelah response authoritative.
- [ ] Screenshot existing tidak di-update dan visual suite lulus desktop/mobile.
- [ ] Smoke dan critical flow mode mock tetap lulus.
- [ ] API-seeded visual comparison lulus pada route yang di-wire.
- [ ] Keyboard/focus/axe checks lulus.
- [ ] Reviewer melampirkan `git diff --stat` dan daftar file visual-risk yang tersentuh.
- [ ] Jika file visual-risk berubah, reviewer menjelaskan mengapa output render tetap identik.

### Definition of Done UI freeze

Task domain hanya boleh selesai jika:

1. fixture mock yang sama menghasilkan screenshot pixel-equivalent;
2. fixture API security-equivalent menghasilkan component tree/class/geometry yang sama; dynamic truth dan penghilangan fake secret/mock label boleh berbeda sesuai clarification di atas;
3. tidak ada new Tailwind styling/primitive untuk kebutuhan wiring;
4. seluruh state network/security memakai pattern existing;
5. pemilik produk tidak perlu mempelajari UI baru untuk memakai backend live.
