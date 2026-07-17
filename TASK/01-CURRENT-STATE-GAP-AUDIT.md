# Current State & Gap Audit

Dokumen ini adalah snapshot kode aktual, bukan klaim bahwa implementasi sudah selesai. Setiap agent wajib membaca ulang file terkait karena line number dapat bergeser setelah perubahan.

## 1. Ringkasan sistem saat ini

### Frontend

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4.
- TanStack Query 5 untuk cache/query/mutation.
- React Hook Form + Zod tersedia, tetapi runtime response schema belum dipakai oleh feature API.
- Default `.env.example`: `NEXT_PUBLIC_DATA_SOURCE=mock`, `NEXT_PUBLIC_APP_STAGE=prototype`.
- Data flow yang dimaksud: `page -> screen -> hook -> feature API -> mock/apiRequest`.
- Visual baseline desktop/mobile dan smoke route suite sudah tersedia.
- Auth/session provider dan route guard nyata belum tersedia.
- Seller memakai `DEMO_STORE_ID`; banyak screen/actions tetap lokal/mock.

### Backend

- Go modular monolith dengan binary API + worker.
- chi HTTP, pgx/sqlc, Postgres, Redis/R2/Xendit/mail ports.
- 28 migration mencakup identity, tenant/RBAC, catalog, checkout, ledger, withdrawal, delivery, KYC, credential, webhook, audit, dan admin read model.
- Route domain hanya dipasang jika dependency/service terkait tersedia; local tanpa database dapat sehat tetapi route bisnis menjadi `404`.
- Unit test `go test ./...` lulus pada audit 17 Juli 2026.
- Tagged integration test belum dijalankan pada audit karena membutuhkan PostgreSQL.
- `backend/test/contract` masih kosong.

### Deployment/config

- Backend compose mengekspos API host pada `http://localhost:18080`, process pada `:8080`.
- Fallback frontend internal saat mock adalah `http://localhost:8080`; ini tidak cocok dengan host compose.
- Browser client mengharuskan absolute `NEXT_PUBLIC_API_URL` dan memakai `credentials: "include"`.
- Backend tidak memiliki middleware CORS, dan Next belum memiliki proxy `/v1`.

## 2. Arsitektur target yang dipertahankan

```text
Public browser -----------------------+
Authenticated browser ---------------+--> same-origin edge `/v1`
Next Server Component --server client+             |
                                                   v
                                            Go API/worker
                                              |    |    |
                                         Postgres R2 provider
```

Next hanya bertindak sebagai presentation/server rendering dan optional transparent reverse proxy. Auth, authorization, tenant ownership, pricing, payment, ledger, delivery, KYC, credential, webhook, dan audit tetap backend-authoritative.

## 3. Status seam per area

| Area | Status | Penjelasan |
| --- | --- | --- |
| Public catalog/store | Kuning | Endpoint ada; belum ada schema/mapper dan public DTO perlu dikunci. |
| Seller catalog reads/publish | Kuning | Route ada; body publish/idempotency/revision belum align. |
| Auth/session | Merah | Backend route ada; FE masih mock, CSRF reload buntu, route guard tidak ada. |
| Checkout | Merah | FE memakai simulator dengan body berbeda; route simulator non-production. |
| Buyer purchases/profile | Kuning | Route ada; DTO dan secret delivery separation belum align. |
| Seller merchant context | Merah | FE hardcode demo store; belum ada provider canonical store. |
| Seller orders | Merah | FE seam ada; backend list/detail read route tidak ada. |
| Seller customers | Merah | FE seam ada; backend domain/read route tidak ada. |
| Seller reviews | Merah | FE seam ada tetapi screen mengabaikan hasil; backend seller read/summary tidak ada. |
| Seller inventory | Kuning/Merah | Route domain ada; DTO tidak sesuai view; reveal security bermasalah. |
| Finance/withdrawal | Kuning/Merah | Route ada; tenant guard dan request/response contract belum aman/align. |
| Storefront draft/publish | Kuning | Route ada; FE hanya publish, revision/error handling salah. |
| Seller webhooks/API key | Kuning/Merah | Backend lifecycle ada; UI seluruhnya mock dan secret policy belum wired. |
| Admin read models | Kuning/Hijau | Banyak DTO sengaja FE-aligned; filter/pagination/schema belum wired. |
| Admin mutations/RBAC | Kuning/Merah | Route banyak tersedia; FE banyak local/generic action, MFA/idempotency belum benar. |
| Campaign | Merah | UI aktif; backend route/domain campaign tidak ditemukan. |
| Notifications/profile shell | Merah | Backend notifications ada; shell FE hardcoded/local. |
| Contract/CI | Merah | OpenAPI invalid/drift, contract test kosong, workflow path/toolchain salah. |
| Production adapters | Merah | Xendit/queue/DNS fake, Redis/mail noop, scanner belum production-ready. |

## 4. Blocker P0 — harus selesai sebelum API/live mode

### P0-01 — Error envelope FE/BE berbeda

Backend mengirim:

```json
{
  "problem": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Resource not found",
    "details": {},
    "requestId": "req_..."
  }
}
```

`shared/api/http-client.ts` saat snapshot membaca `code/message` di root. Dampak: seluruh error domain menjadi `HTTP_ERROR`, field validation/request ID hilang, dan route tidak dapat membedakan auth/permission/not-found/conflict.

**Resolution owner:** `INT-100`.

### P0-02 — OpenAPI tidak valid dan drift

- `backend/api/openapi.yaml` gagal parse karena scalar description yang tidak di-quote sekitar baris audit 6236.
- Sebagian operation memakai security scheme `cookieAuth`, sementara definisi yang ada bernama `sessionCookie`.
- File besar tersebut tidak dilint/bundle di CI.
- Tidak ada generated TS DTO/schema dan tidak ada route-vs-spec contract test.

**Resolution owner:** `INT-000` dan `INT-010`.

### P0-03 — Network/cookie topology belum ada

- Browser memakai absolute API URL + credential cookie.
- Backend tidak punya CORS/preflight policy.
- Next tidak proxy `/v1`.
- Protected Server Components memakai client yang sama; `credentials: include` di Node tidak meneruskan incoming cookie.

**Resolution:** same-origin edge/proxy sebagai default, plus server-only client yang forward allowlisted headers dan memakai `no-store`. Lihat `INT-030`, `INT-110`.

### P0-04 — Session/CSRF tidak pulih setelah refresh

Login mengembalikan raw CSRF token dan session cookie HttpOnly. Middleware hanya memulihkan hash CSRF dari session; `/v1/auth/session` kemudian mengembalikan token kosong. Setelah hard refresh, browser tidak dapat menjalankan unsafe mutation secara benar.

**Resolution owner:** `INT-130`; jangan menyimpan raw token di local/session storage.

### P0-04A — Session dan seller bootstrap tidak membawa claims yang dibutuhkan

- `/v1/auth/session` snapshot hanya membawa identity/status/MFA dasar; belum ada permissions, role codes, memberships, current session ID lengkap, atau impersonation metadata yang dibutuhkan navigation/boundary.
- `/v1/seller/me/merchant` hanya memilih first active membership dan mengembalikan satu merchant/role; belum ada daftar store, scoped capabilities, canonical/current store, atau deterministic multi-store selection.
- Schema membership hanya `OWNER|STAFF`, sementara role/permission global; persona tenant read/write terpisah belum dapat dienforce seperti yang dibutuhkan UI/test.

**Resolution:** extend satu canonical session/bootstrap contract di `INT-120`, freeze seller bootstrap dan tenant capability model/migration di `INT-150`/`SEL-100` sebelum menghapus demo store.

### P0-05 — MFA/step-up belum authoritative

- FE mengirim `X-Recent-MFA`; backend/doc mengharapkan `X-Recent-MFA-Proof`.
- Screen memakai string seperti `mock-recent-mfa` atau checkbox/password placeholder.
- Login snapshot membuat full session sebelum MFA, session resolver tetap menempelkan role/permission saat `mfa_verified_at` kosong, dan `RequireAuth` hanya memeriksa principal. Field config `RequireAdminMFA` dideklarasikan tetapi belum menjadi gate yang terpasang; direct HTTP dapat melewati UI MFA.
- Inventory reveal menerima boolean/body claim `mfaVerified` dan tidak membuktikan freshness server-side.

**Resolution owner:** `INT-140` harus membuat pre-MFA ticket atau global `MFA_PENDING` allowlist gate, lalu `INT-150` dan task secret/admin terkait. UI guard saja tidak cukup.

### P0-06 — Cross-tenant authorization lemah

Global permission `seller.store.read/write` belum cukup. Audit menemukan finance/ledger/withdrawal use case menerima `storeId` tanpa mengecek membership/owner actor secara konsisten. Seller dengan permission global berpotensi mengakses store lain.

**Resolution:** centralized `StoreAccessGuard` di application/service layer. Foreign tenant identifier menghasilkan safe `404`; test owner/member/foreign/impersonation wajib. Lihat `INT-150`.

### P0-06A — Public product slug tidak terikat store

Pretty route frontend membawa `storeSlug` + `productSlug`, tetapi backend `GET /v1/public/products/{idOrSlug}` snapshot menjalankan lookup slug global dan mengambil first match. Product slug yang sama pada dua store dapat merender/menautkan product milik store yang salah; featured DTO/FE juga belum menjamin canonical `storeSlug` sehingga homepage masih menautkan demo store.

**Resolution:** freeze public product contract yang store-bound atau selalu memakai canonical unique product ID plus verified owning store; response featured wajib membawa canonical store/product URL. Test dua store dengan product slug sama. Lihat `PUB-100`.

### P0-07 — Checkout FE bukan production flow

- FE hanya memanggil `/v1/checkout/simulate-payment` dengan product/customer/total.
- Backend simulator menerima intent ID dan hanya dipasang local/test.
- Hasil mutation diabaikan; timer UI dapat tetap menuju state paid saat request gagal.
- Order ID/QR/price sebagian hardcoded.
- Backend GET/expire intent belum memvalidasi owner/capability secara memadai.

**Resolution:** create intent -> render QR -> poll authoritative state -> delivery/order result. Browser total/status tidak dipercaya. Lihat `CHK-100..CHK-150`.

### P0-08 — Runtime production masih fake/noop

Audit composition root menemukan:

- Xendit selalu `NewFake()`; real adapter masih stub `ProviderUnavailable`;
- queue fake;
- Redis noop;
- mail noop membuang pesan;
- DNS/edge custom domain fake;
- component health melaporkan dependency noop/fake sebagai sehat;
- object completion production fail-closed tanpa real malware scanner;
- KYC hanya heuristic scan, bukan production scanner.

Config yang melarang fake di production tidak cukup jika composition tetap menyuntikkan fake. **Jangan menyebut sistem production-ready atau menjalankan checkout live sebelum `INT-180` selesai.**

### P0-09 — Callback disbursement tidak terautentikasi kuat

Route callback disbursement publik memproses body tanpa mandatory constant-time token/signature verification yang sama dengan durable callback ingress. Ini dapat memalsukan outcome withdrawal.

**Resolution:** unify secure callback ingress, raw body limit, signature/token, account/mode binding, dedupe, rejection quarantine, audit, deterministic acknowledgement. Lihat `INT-180` dan `SEL-410`.

### P0-10 — Secret/capability exposure

- Inventory reveal tidak boleh percaya boolean dari client.
- Buyer purchase view model saat ini mengandung delivery secret, padahal backend memisahkan explicit delivery access.
- Seller API key UI selalu menampilkan fake raw secret.
- Checkout public capability dikembalikan, tetapi intent/order polling/expire perlu benar-benar memvalidasi capability/session.

**Resolution:** explicit one-time/short-lived secret access, `Cache-Control: no-store`, component-memory only, cleanup timer/unmount/visibility, no telemetry/query cache/storage/URL.

### P0-11 — Admin generic action dan credential permission confusion

`POST /v1/admin/actions` snapshot hanya dijaga `merchants.write`, tetapi dispatcher dapat memilih action buyer session/magic/email, review moderation, credential rotation, delivery resend, provider lookup, atau withdrawal review. Service belum membuktikan permission per action secara konsisten. Selain itu seluruh route credential admin memakai `kyc.review`, sehingga reviewer KYC berpotensi mendapat kemampuan mengelola API credential.

**Resolution:** ganti generic dispatcher dengan typed operation atau server-side action-to-permission allowlist yang memverifikasi permission, target scope, reason, recent MFA, idempotency, dan audit untuk setiap action. Pisahkan permission `credentials.read/authorize/rotate/suspend/revoke` dari `kyc.review`; tambahkan direct-HTTP matrix anti-confusion. Lihat `ADM-110`, `ADM-200`, `ADM-340`, `INT-000`.

### P0-12 — Auth stale-cookie recovery dan admin MFA enrollment dead-end

Global CSRF middleware saat ini dapat menolak login, magic-link, reset, invite accept, dan logout ketika browser masih mengirim HttpOnly session cookie yang expired/revoked tetapi belum dibersihkan. Di sisi lain admin login mewajibkan MFA sementara enroll/confirm hanya ada di authenticated group, sehingga admin baru/invited admin tidak memiliki ceremony enrollment yang sah setelah surface isolation diperketat.

**Resolution:** `INT-130` harus menetapkan stale-cookie recovery yang tetap memeriksa Origin/Fetch Metadata/rate limit dan tidak mematikan CSRF untuk valid session; `INT-140`/`ADM-100` harus menetapkan pre-enrollment ticket/invite-bound MFA ceremony dengan purpose/expiry/replay tests.

## 5. Gap endpoint backend yang nyata

Endpoint berikut dipanggil atau dibutuhkan UI tetapi tidak terpasang pada router saat snapshot:

| Kebutuhan | FE seam/UI | Gap backend |
| --- | --- | --- |
| Seller order list | `features/orders/api.ts` | `GET /v1/stores/{storeId}/orders` tidak ada. |
| Seller order detail | `features/orders/api.ts` | Base detail GET tidak ada; hanya `/delivery...` subroutes. |
| Seller customers | `features/seller/customers/api.ts` | List/detail/domain read model tidak ada. |
| Seller reviews | `features/seller/reviews/api.ts` | Seller list/summary/reply/report tidak ada; hanya public dan buyer write. |
| Admin inventory reveal | `features/admin/data/inventory.ts` | FE path admin tidak ada; hanya store-scoped reveal. |
| Admin campaigns | `/admin/campaigns` | CRUD/test/publish/ack backend tidak ditemukan. |

Endpoint tidak boleh “dipalsukan” dengan mock fallback pada API mode. Implement missing read/command atau disable rollout domain sampai dependency tersedia.

## 6. Mismatch kontrak utama

### Global

- Success backend: `data` + `meta` cursor; FE `ApiEnvelope.meta` hanya requestId/timestamp.
- Pagination campur: beberapa FE mengharapkan `data: CursorPage`, banyak backend mengirim `data: []` + cursor di `meta`.
- Feature API memakai TypeScript cast tanpa `schema` runtime.
- Detail function mendeklarasikan `null`, tetapi API `404` selalu dilempar.
- Strict JSON backend menolak unknown field/trailing junk; FE sering mengirim view model mentah.

### Buyer

- Session backend: `data: { sessions: [...] }`; FE mengharapkan direct array.
- Session field backend dan display FE berbeda.
- Revoke backend `{revoked:true}`; FE mengharapkan `{accepted,sessionId,requestId}`.
- Purchase metadata dan delivery secret harus dipisahkan.

### Inventory

- Backend summary: `productId`, counts, schema version.
- FE view: title/type/available/reserved/sold/invalid/threshold/delivery.
- Detail backend `{summary, items}`; FE mengharapkan product card.
- Diperlukan read model/join + mapper; jangan ubah table/card UI.

### Reviews

- Backend review berisi IDs/rating/body/status/reply.
- UI membutuhkan joined product, buyer/seller display, initials, verified label.
- Summary backend `count/averageRating/rating1..5`; FE `total/average/distribution`.

### Finance/withdrawal

- Withdrawal list backend membungkus `{items}`, field/status berbeda dari FE.
- Quote backend `quoteId/amountDebited/netDisbursement/ACTIVE`; FE `id/amount/netAmount/VERIFIED`.
- FE mengirim `reauthProof` pada JSON strict, sedangkan backend body saat ini tidak menerimanya.
- Lock/reason/time field berbeda.
- Ledger memiliki enum `SETTLEMENT_RELEASE` yang belum dipetakan frontend.

### Roles/audit

- Backend roles membungkus `{items}`, memakai `isSystem`, tidak memiliki display `members/color` yang diharapkan view.
- Backend permission flat; UI grouped.
- Audit backend canonical fields berbeda dari display event UI.

### Storefront/publish

- FE mengirim view model lengkap termasuk `storeId/logoStyle/reason/idempotencyKey`.
- Backend strict body mengharapkan revision/config subset dan saat snapshot menelan decode error pada publish.
- Wajib request mapper + reject decode error + `If-Match`/revision.

## 7. Mock/local authority yang harus diisolasi

### Global/shell/auth

- Login/register/admin login/buyer magic link masih timer/link/local state.
- Notification center, profile identity, logout masih hardcoded/local.
- `MockInteractionBoundary` aktif juga pada API mode dan memberi feedback palsu.
- Admin permission boundary selalu memakai mock admin session.

### Seller

- Semua query memakai demo store.
- Onboarding slug/complete local.
- Product form/upload/release/delivery timeline local.
- Inventory detail/schema/items/reveal local/mock.
- Review query diabaikan, list/reply/report local.
- Customer metrics/history/notes local.
- Coupon CRUD local.
- Storefront draft/audit localStorage; hanya publish memiliki seam.
- Webhook/API key/settings/bank/MFA banyak mock.
- Withdrawal memakai bank/proof/key berbasis demo/time.

### Buyer/public

- Checkout QR/status/order ID/timer local.
- Order result mempercayai path status dan hardcoded detail.
- Invoice dan public verification hardcoded.
- Profile tidak memakai hook.
- Security meng-copy async query ke local state terlalu dini.
- Review local.

### Admin

- Users/invites/profile/roles mutation/campaign/KYC/providers/emergency/fulfillment/webhook operations banyak local state atau localStorage.
- Impersonation session dan identifier disimpan di URL/sessionStorage.
- Mock audit chain dibentuk di browser.
- Generic admin action belum cukup untuk seluruh state transition.

Mode mock boleh mempertahankan fixture ini. Mode API harus berjalan melalui adapter/backend dan tidak boleh diam-diam kembali ke mock saat error.

## 8. CI/testing gap

- `.github/workflows/ci.yml` menganggap frontend berada di subfolder `frontend`; aplikasi sebenarnya di root.
- Workflow mencari `frontend/.nvmrc`/lockfile yang tidak ada di lokasi tersebut.
- Backend workflow memakai Go 1.24, sedangkan `backend/go.mod` meminta Go 1.25.12.
- Integration test bertag membutuhkan PostgreSQL tetapi tidak menjadi gate lengkap CI.
- Contract test folder kosong.
- Playwright saat ini hanya mengkarakterisasi mode mock.
- Coverage frontend sekarang tidak merepresentasikan wiring domain end-to-end.
- Pada audit, FE test belum dijalankan karena `node_modules` tidak tersedia; jangan klaim test frontend hijau dari snapshot ini.

Lihat `07-TESTING-ROLLOUT-DOD.md` untuk perbaikan.

## 9. Keputusan produk/teknis yang tidak boleh berubah diam-diam

| Keputusan | Nilai default |
| --- | --- |
| UI | Freeze; exact existing components. |
| Browser topology | Same-origin `/v1`. |
| SSR private reads | Server-only API base + allowlisted cookie/request ID + `no-store`. |
| Business authority | Go/Postgres/provider, bukan Next/browser/mock. |
| Money | Integer whole IDR, server-calculated. |
| Payment | Provider event authoritative; simulator non-production. |
| Store context | Membership/canonical store dari session/bootstrap. |
| Pagination | Opaque cursor on wire, adapter mempertahankan existing table UI. |
| Error | Stable ProblemEnvelope, typed mapping, no mock fallback. |
| Secret | One-time/short TTL, component memory, no cache/storage/log. |
| Sensitive mutation | Actual recent MFA + reason + idempotency + audit. |
| Rollout | Per-domain capability flag, no global cutover awal. |

Jika agent perlu mengubah salah satu keputusan, buat ADR singkat dan minta review tech lead/security/product sesuai dampaknya sebelum implementasi.

## 10. Prioritas penyelesaian

### P0

Kontrak/OpenAPI, topology, HTTP client, runtime schema, server client, session/CSRF/MFA, tenant guard, real provider/runtime, checkout, callback security, secret handling.

### P1

Missing seller read models, buyer mapping/delivery, seller catalog/inventory/order/customer/review/finance, admin auth/RBAC/critical actions, notification/profile.

### P2

Campaign, analytics/export, custom domain end-to-end, operational polish, full API-mode performance/visual parity, removal of obsolete compatibility seam setelah rollout stabil.
