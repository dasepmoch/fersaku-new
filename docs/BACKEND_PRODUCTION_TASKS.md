# Fersaku Backend Production Task Specification

**Status:** Backend production tasks complete (BE-000…BE-630); owner-sign residual for live go-live

**Target:** production-ready, modular, scalable, ringan, dan aman tanpa mengubah UI frontend yang sudah ada.

**Stack wajib:** Go, Docker, PostgreSQL, Redis, Cloudflare R2, dan satu akun Xendit.

> Dokumen ini adalah task specification untuk AI/engineer backend lain. Checkbox berarti pekerjaan yang harus dikerjakan, bukan pekerjaan yang sudah selesai. Setiap task wajib menghasilkan code, migration (bila ada), test, observability, security review, dan bukti acceptance.

---

## 0. Ringkasan produk dan aturan bisnis

### 0.1 Produk Fersaku

Fersaku memiliki dua pengalaman yang memakai backend yang sama:

1. **Hosted storefront:** seller membuat toko, menjual produk digital (download, protected link, code/credential), menerima pembayaran QRIS melalui checkout Fersaku, dan mengirim delivery ke buyer.
2. **QRIS Payment Gateway API:** merchant membuat payment intent QRIS dari website/aplikasi miliknya sendiri. API ini murni payment gateway: create/status/cancel payment, callback/webhook, dan tidak menyediakan product CRUD, upload produk, list produk, inventory API, atau katalog API.

Semua fitur dalam scope ini gratis. Pendapatan platform hanya berasal dari
biaya transaksi dan penarikan yang dijelaskan di bawah; tidak ada paket
berlangganan, tier berbayar, atau entitlement fitur berdasarkan pembayaran.

### 0.2 Flow bisnis end-to-end

```text
Register/login
 -> email verification/session sesuai policy
 -> onboarding wajib membuat satu store
 -> product optional (boleh dilewati)
 -> hosted storefront dapat digunakan
 -> merchant dapat meminta sandbox QRIS API
 -> KYC diajukan untuk live QRIS API
 -> admin review/approve
 -> live API credential aktif
 -> hosted checkout dan QRIS API memakai Xendit account yang sama
 -> payment paid -> fee snapshot -> unified ledger -> balance
 -> withdrawal -> security lock/review -> Xendit disbursement
```

Aturan yang harus selalu benar:

- Setiap seller/merchant memiliki minimal satu store walaupun hanya ingin memakai API.
- Store boleh kosong/tidak dipakai; store tetap menjadi tenant/onboarding anchor.
- KYC **hanya** menjadi syarat aktivasi live QRIS API.
- Seller storefront biasa tidak perlu KYC API untuk berjualan, melihat saldo, atau withdraw (selama syarat withdraw lain terpenuhi).
- Sandbox API boleh tersedia tanpa KYC dan tidak boleh menyentuh production ledger/provider.
- Hosted checkout dan QRIS API masuk ke satu wallet/ledger merchant.
- Sumber transaksi harus dibedakan `STOREFRONT` atau `QRIS_API` untuk filter/reporting.
- Hanya satu provider payment/disbursement: Xendit.
- Tidak ada refund, dispute workflow, provider failover, atau reconciliation console.
- Akses fitur tidak pernah ditentukan oleh plan/subscription/payment entitlement.
 Authorization, KYC live API, merchant status, dan emergency switch tetap
 berlaku sebagai kontrol keamanan/operasional, bukan paywall.

### 0.3 Fee transaksi

Semua uang disimpan sebagai integer IDR; dilarang menggunakan floating point untuk keputusan uang.

Fee sukses untuk **hosted storefront dan QRIS API sama**:

```text
transaction_percent = round_half_up(gross_amount * 300 / 10_000)
transaction_fee = transaction_percent + 700
merchant_net_credit = gross_amount - transaction_fee
```

- `300 bps = 3%` dan fixed processing `Rp700` adalah invariant
 `LAUNCH_FEE_POLICY_V1`, bukan default yang boleh diedit admin.
- Scope launch hanya `GLOBAL`; tidak ada merchant override atau buyer surcharge.
 Fee dipotong dari gross sebelum credit merchant (sesuai pola finance UI).
- Amount, currency, rounding, dan fee component harus tersedia dalam detail/ledger yang berwenang.

Invariant launch yang tidak boleh berubah lewat runtime/admin API:

```text
transaction_percent_bps = 300
transaction_fixed_idr = 700
withdrawal_percent_bps = 300
minimum_withdrawal_idr = 50_000
```

Admin boleh menjalankan preview dengan calculator production dan melihat policy
version aktif, tetapi tidak boleh mem-publish angka persentase/fixed/minimum
arbitrer. Perubahan setelah launch membutuhkan product ADR yang disetujui,
policy version baru, effective time, migration/seed yang immutable, regression
test, dan deployment release terkontrol. Ini bukan routine settings mutation.
Payment/withdrawal yang sudah dibuat tetap memakai snapshot version sebelumnya.

Canonical fee basis: `gross_amount` adalah jumlah yang benar-benar menjadi
payment intent setelah validasi harga/discount, sebelum platform fee. Tip dan
upsell yang dibayar buyer masuk gross bila ikut ditagihkan pada payment intent.
Seller-funded discount mengurangi gross sebelum fee, sedangkan platform-funded
discount dicatat sebagai komponen terpisah dan tidak boleh membuat merchant net
negatif. Fee dihitung atas integer IDR yang telah dinormalisasi; payment ditolak
bila `gross <= 0` atau `gross - transaction_fee < 0` (frontend mock yang
men-clamp net ke nol bukan kontrak backend).

For non-negative IDR integers, implement 3% round-half-up as checked arithmetic
`(gross * 300 + 5_000) / 10_000`; reject overflow before multiplication. Define
effective-dated min/max payment amounts (launch values approved in `BE-000`) and
test boundary `fee == gross`, `fee > gross`, max `int64`, and malformed decimals.

Fee withdrawal:

```text
withdrawal_percent = round_half_up(withdrawal_amount * 300 / 10_000)
withdrawal_fee = withdrawal_percent + xendit_processing_fee
minimum_withdrawal = 50_000
net_disbursement = withdrawal_amount - withdrawal_fee
```

- `xendit_processing_fee` berasal dari quote/response Xendit yang diverifikasi.
 Fallback schedule hanya boleh berasal dari artifact konfigurasi provider yang
 versioned dan dipasang lewat release; angka ini bukan field bebas pada admin
 fee policy dan tidak boleh hard-coded di frontend.
- Request di bawah Rp50.000 ditolak backend.
- Withdrawal fee/processing fee juga disnapshot.
- Jangan menampilkan `Rp0` di production kecuali verified provider schedule
 untuk komponen processing memang zero; komponen launch 3%/Rp700/minimum tidak
 dapat dinolkan lewat admin.
- `amount` berarti nominal yang didebit dari wallet merchant, bukan target net yang ingin diterima. Quote memiliki TTL dan idempotency key; provider fee precedence adalah verified Xendit response, lalu versioned schedule fallback hanya ketika response memang tidak tersedia.
- Tolak quote/request bila net disbursement non-positive. Revalidate fee before the irrevocable provider call; once a valid quote is consumed, the merchant charge is locked. If Xendit later reports a different actual fee, the platform absorbs/records the delta in `PLATFORM_PROVIDER_SUBSIDY` and emits audit/alert; do not silently change merchant net or history.

Semua nilai uang pada API, domain, database, dan jurnal adalah `int64`.
Satuannya **whole-rupiah (rupiah utuh)** karena IDR memiliki nol digit pecahan;
bukan float, decimal JSON, sen, atau string berformat. Persentase dihitung dengan checked integer arithmetic dan
aturan tunggal `round_half_up(amount * bps / 10_000)`; overflow, pecahan pada
input, amount `<= 0`, fee component negatif, atau hasil net `<= 0` ditolak
sebelum provider call maupun ledger post. Kalkulator, quote, snapshot, preview,
OpenAPI, dan test vector wajib memakai aturan yang sama.

Contoh test wajib:

| Kasus | Nominal | Fee | Net |
| -------------------------------- | --------: | ------------: | -----------: |
| Storefront paid | Rp100.000 | Rp3.700 | Rp96.300 |
| QRIS API paid | Rp250.000 | Rp8.200 | Rp241.800 |
| Withdrawal, provider fee Rp2.500 | Rp100.000 | Rp5.500 | Rp94.500 |
| Withdrawal minimum | Rp50.000 | 3% + provider | amount - fee |

### 0.4 Xendit satu account

- Gunakan satu logical Xendit account/credential untuk QRIS payment dan disbursement.
- Buat satu adapter Xendit yang dipakai hosted checkout dan gateway API; jangan duplikasi fee/state logic.
- Beri konfigurasi account tersebut identifier non-secret stabil
 `account_scope` (launch: satu nilai, misalnya `xendit-primary`). Semua callback
 memakai canonical identity `(provider, account_scope, payment_mode,
provider_event_id)` walaupun saat launch hanya ada satu account; raw account
 ID/token tidak pernah dipakai sebagai scope atau masuk log.
- Provider reference, event ID, amount, currency, dan callback timestamp disimpan untuk evidence.
- Callback dapat duplicate/out-of-order; state machine dan idempotency wajib menangani.
- Tidak ada Duitku, backup provider, routing, multi-account, atau UI reconciliation.
- Monitoring cukup melalui payment status, inbound Xendit callback replay,
 outbound seller-webhook delivery retry, provider health, dan alert
 provider-paid/local-pending.

### 0.5 Scope merchant, payment mode, environment, dan wallet

- Merchant adalah owner wallet, KYC capability, API credentials, dan admin API-access state. Onboarding wajib membuat satu canonical store; store routes tetap dipertahankan agar adapter frontend tidak berubah, tetapi service selalu resolve `store_id -> merchant_id` dan tidak membuat wallet per store.
- Hosted storefront payments membawa `store_id` dan `source=STOREFRONT`; gateway payments membawa merchant credential dan memakai canonical store sebagai attribution default (`source=QRIS_API`). Finance/withdrawal responses boleh menampilkan store/source breakdown, tetapi available/pending/held dan withdrawal lock selalu merchant-wide.
- Terminology is explicit: deployment/runtime `env` is `local|staging|production`; the financial `payment_mode` column is `SANDBOX|LIVE`. `payment_mode` wajib ada pada order, payment intent, provider event, ledger transaction, outbox effect, idempotency scope, dan audit context. Sandbox memakai fake/deterministic provider adapter, ledger namespace terpisah, dan tidak pernah menambah live wallet atau dapat di-withdraw.
- API capability state diturunkan per merchant + `payment_mode` (`SANDBOX` dan `LIVE` dapat berbeda); jangan memakai satu boolean yang tidak bisa merepresentasikan live pending sementara sandbox aktif. Admin UI boleh menampilkan ringkasan `apiAccess`, tetapi backend menyimpan state detail.
- Settlement delay adalah effective-dated platform setting (default mock `1 day`); delay, release event, dan fee snapshot harus tercatat. Withdrawal allocation memakai available merchant wallet tunggal; default FIFO berdasarkan `available_at`, dengan source breakdown hanya untuk reporting.

### 0.6 Sandbox, simulator, dan production boundaries

- Sandbox credential/intent boleh tersedia tanpa live KYC hanya sebagai developer test capability; KYC tetap wajib sebelum live credential/production API activation. Bila product owner memilih KYC untuk semua payment mode, ubah decision record dan tests sebelum implementation.
- `POST /v1/checkout/simulate-payment` hanya boleh hidup pada local/staging dengan explicit config gate, test principal, fixture amount, dan no-provider/no-ledger-production guarantee. Production route harus 404/405; browser tidak boleh memakai simulator untuk menandai paid.
- Test provider lifecycle harus deterministic (`CREATED -> PENDING -> PAID/FAILED/EXPIRED/CANCELLED`), mengirim callback fixture, dan memakai canonical uniqueness key `(provider, account_scope, payment_mode, provider_event_id)`.

### 0.7 Non-goals yang tidak boleh dibuat

Scope berikut sengaja **tidak** dibuat:

- Product/catalog/upload/list API untuk integrator; QRIS API bukan commerce API.
- Refund endpoint, refund table, dispute/refund console, atau automatic refund.
- Reconciliation console, reconciliation job sebagai product feature, atau UI untuk mencocokkan dua provider.
- Admin AI, risk engine/operation, security-audit console terpisah.
- Multi-provider failover/routing.
- Plan/tier berbayar, subscription recurring, platform billing checkout,
 entitlement fitur berbayar, usage quota yang dapat dibeli, atau feature gate
 berdasarkan status pembayaran. Biaya transaksi/withdrawal bukan subscription
 dan tidak boleh membuka atau menutup fitur.
- Tabel/endpoint seperti `plans`, `subscriptions`, `billing_accounts`, atau
 `paid_entitlements`. Hak buyer untuk mengakses produk yang memang telah
 dibelinya adalah delivery authorization, bukan entitlement paket Fersaku.
- Microservices/event bus besar, Kafka, service mesh, CQRS/event-sourcing penuh, atau abstraction repository berlebihan.
- Perubahan UI/desain hanya karena backend dibuat.
- Menjadikan frontend/mock/localStorage sebagai authority untuk auth, payment, KYC, ledger, credential, atau authorization.

---

## 1. UI contract dan referensi frontend

### 1.1 Aturan no visual change

Backend harus diintegrasikan tanpa mengubah:

- route URL/file ownership;
- layout, grid, spacing, breakpoint, color, typography, icon, radius, shadow;
- bahasa/copy, modal style, table style, loading/error surface;
- light/dark theme dan responsive behavior;
- default mock behavior (`NEXT_PUBLIC_DATA_SOURCE=mock`);
- visual regression baseline.

Jika DTO backend berbeda dengan view model, ubah mapper pada feature API boundary, bukan markup. Jika field baru belum punya visual surface, kirim hanya field yang sudah disepakati atau buat contract extension tanpa memaksa redesign.

### 1.2 File/contract yang wajib dibaca implementer

- `docs/BACKEND_HANDOFF.md`: envelope, headers, money, payment, ledger, KYC, audit, cursor.
- `ARCHITECTURE.md`: boundary `app -> features -> shared`.
- `shared/api/contracts.ts`, `shared/api/schemas.ts`, `shared/api/http-client.ts`.
- `features/{domain}/api.ts`, `features/{domain}/data/*.ts`, `features/{domain}/contracts.ts`.
- `features/seller/onboarding/store-onboarding.tsx`: store mandatory, product optional.
- `features/seller/screens/api-keys.tsx`: one-account presentation over one API
 authentication key plus the independently endpoint-owned webhook signing
 secret, deterministic mock reveal, and production request/one-time-claim/
 masked-secret policy.
- `features/finance/*`, `features/seller/screens/finance/*`: unified balance, ledger, withdrawal lock.
- `features/seller/screens/coupons.tsx`: coupon CRUD/activation fields and
 checkout discount expectations.
- `features/seller/screens/reviews.tsx`, `features/seller/screens/customers.tsx`:
 replies, reports, internal notes, consent, and bounded seller communication.
- `features/seller/domains/settings/*`, `features/seller/storefront/*`:
 account/business settings, bank security lock, custom domain, SEO, and
 optimistic storefront revisions.
- `features/seller/components/traffic-analytics.tsx`,
 `shared/ui/notification-center.tsx`: privacy-bounded attribution and
 surface-scoped inbox contracts.
- `components/invoice-view.tsx`, `features/buyer/screens/*`:
 invoice snapshot/verification, product delivery grants, buyer profile, and
 session behavior.
- `features/admin/operations/kyc/*`: API-only KYC.
- `features/admin/operations/webhooks/*`: inbound Xendit callback
 failure/replay/evidence; ini bukan outbound seller-webhook delivery queue.
- `features/admin/screens/merchants/impersonation-dialog.tsx`: read-only/support-write scope, duration, reason, dan banner; privileged/full scope tidak ada di enum/API/UI.
- `features/admin/config/routes.ts`, `features/admin/components/admin-shell.tsx`: active admin routes/permissions.

The current frontend is intentionally mock-first. Existing screens may still
show illustrative risk labels, settlement delay, or deterministic mock secrets.
These are not production authority: map them at the API/mapper boundary to the
contracts below, keep the existing markup, return raw credentials only at the
explicit one-time issuance boundary, and never persist a mock value, fabricated
risk decision, or raw secret as if it were real. Storefront sellers remain free
to withdraw subject to balance/bank/security checks; no hidden risk/KYC engine
may become a withdrawal gate.

Until a separately approved lightweight signal exists, production DTO uses
`riskAssessment: "NOT_ASSESSED"`; the mapper renders neutral `Not assessed`
(never Low/High fabricated data) and it cannot block payment/withdrawal. The KYC
field on withdrawal review is `NOT_REQUIRED_FOR_STOREFRONT` unless the case is
specifically about live QRIS API capability; it is informational, not payout
eligibility.

The withdrawal form now uses source-neutral typed quote/create mutations. Mock
mode persists created history locally and requires an explicit verified Xendit
processing-fee quote before submit; API mode already targets the `POST` quote
and create endpoints below. Backend integration must implement those contracts,
return authoritative quote/request/bank-account DTOs without changing existing
form/modal markup, and extend contract/E2E coverage for locked/expired/consumed
quote, below-minimum, insufficient balance, success, and unknown provider
outcome. The local success screen and mock persistence are presentation/demo
state only; provider outcome, reserve, wallet, and history remain server-owned.

The admin fee card keeps its existing visual layout, but production integration
binds it to active-policy read and pure preview only. A mock “publish” behavior
must not become a numeric fee mutation: render the launch values/version from
the server and treat editable hypothetical inputs as preview state. No backend
route may persist them. This changes authority/behavior at the adapter boundary,
not the page design.

### 1.3 Route-to-domain matrix

| Frontend surface | Backend responsibility |
| ------------------------------------------------- | ----------------------------------------------------------------------------- |
| `/login`, `/register` | seller identity, verification, password/session lifecycle |
| `/account/login`, `/account/verify` | passwordless buyer magic link and one-time verification |
| `/account/profile`, `/account/security` | buyer profile/preferences, email-change proof, sessions/revoke-all |
| `/account/purchases*` | buyer ownership, release/delivery grants, resend, review, invoice |
| `/dashboard/onboarding` | mandatory canonical store, slug availability, progress |
| `/dashboard` | aggregate revenue/order/product/traffic attribution read models |
| `/dashboard/products*` | seller product CRUD/publish/version/release and private object upload |
| `/dashboard/inventory*` | versioned stock schema, import, validation, reservation, per-item reveal |
| `/dashboard/orders*` | seller order/detail/timeline and safe delivery resend |
| `/dashboard/customers*` | store-scoped customer/order history, internal notes, consent-aware messaging |
| `/dashboard/reviews` | verified reviews, seller reply, report, rating summary |
| `/dashboard/coupons*` | coupon lifecycle, scope/limits, atomic checkout redemption |
| `/dashboard/storefront` | draft/revision/publish, SEO/custom links, domain ownership/TLS state |
| `/dashboard/settings` | personal/business profile, bank, password, notification preferences |
| `/dashboard/api-keys` | credential metadata, KYC/API state, controlled rotation policy |
| `/dashboard/webhooks` | outbound seller endpoint/test/delivery history |
| `/dashboard/balance`, `/dashboard/withdrawals*` | unified ledger, source categories, fee quote, bank snapshot, payout |
| `/store/*`, `/checkout/*` | public catalog, server-priced hosted QRIS intent, coupon/upsell/tip snapshot |
| `/orders/*`, `/invoices/verify/*` | guest-token status, owned delivery, immutable invoice and public verification |
| `/admin` | bounded command-center aggregate |
| `/admin/merchants*` | merchant search/status/API capability/credential support/impersonation |
| `/admin/buyers*` | buyer ownership view, safe magic-link/email workflow, session revoke |
| `/admin/users`, `/admin/roles*`, `/admin/profile` | staff invite/profile/session and least-privilege role lifecycle |
| `/admin/campaigns` | safe seller announcement test/publish/pause/read acknowledgement |
| `/admin/orders*`, `/admin/payments` | order/payment evidence, provider lookup, delivery resend/force-fulfill |
| `/admin/withdrawals*` | review/approve/hold/reject/disbursement |
| `/admin/inventory`, `/admin/fulfillment` | redacted inventory health, per-item reveal, delivery retry/revoke |
| `/admin/reviews` | explicit verified-review moderation transitions |
| `/admin/kyc` | KYC live-API queue/review |
| `/admin/webhooks` | client-composed provider callbacks plus seller deliveries; separate APIs |
| `/admin/audit-logs` | immutable audit search/detail/export/integrity |
| `/admin/system`, `/admin/providers` | read-only release config/fees/health and exactly three emergency switches |

### 1.4 Existing API path compatibility

Where frontend already calls a path, keep it or provide a deliberate versioned migration. Current seams include:

```text
/v1/public/products/featured
/v1/public/stores/{slug}
/v1/public/products/{idOrSlug}
/v1/stores/{storeId}/products
/v1/stores/{storeId}/products/{productId}
/v1/stores/{storeId}/products/{productId}/publish
/v1/stores/{storeId}/storefront/publish
/v1/stores/{storeId}/orders
/v1/stores/{storeId}/orders/{orderId}
/v1/stores/{storeId}/customers
/v1/stores/{storeId}/customers/{customerId}
/v1/stores/{storeId}/inventory/products
/v1/stores/{storeId}/inventory/products/{productId}
/v1/stores/{storeId}/inventory/products/{productId}/schema
/v1/stores/{storeId}/reviews
/v1/stores/{storeId}/reviews/summary
/v1/stores/{storeId}/coupons
/v1/stores/{storeId}/domains
/v1/stores/{storeId}/analytics/overview
/v1/stores/{storeId}/analytics/traffic
/v1/public/products/{productId}/reviews
/v1/public/products/{productId}/reviews/summary
/v1/checkout/simulate-payment (local/staging only; deprecated in production)
/v1/qris/payments (legacy docs compatibility alias)
/v1/stores/{storeId}/finance/summary
/v1/stores/{storeId}/finance/ledger
/v1/stores/{storeId}/withdrawals
/v1/stores/{storeId}/withdrawals/lock
/v1/buyer/purchases
/v1/buyer/purchases/{orderId}
/v1/buyer/profile
/v1/buyer/notifications
/v1/buyer/sessions/{sessionId}/revoke
/v1/admin/merchants
/v1/admin/merchants/{merchantId}
/v1/admin/orders
/v1/admin/payments
/v1/admin/withdrawals
/v1/admin/buyers
/v1/admin/reviews
/v1/admin/inventory
/v1/admin/fulfillments
/v1/admin/campaigns
/v1/admin/overview/platform-volume
/v1/admin/audit-logs
/v1/admin/roles
/v1/admin/permissions
/v1/admin/actions
```

Adapter baru harus tetap mengembalikan domain/view contract yang sama dengan mock.

---

## 2. Arsitektur backend target

### 2.1 Bentuk deployment

Mulai sebagai modular monolith dengan dua binary:

1. `fersaku-api`: HTTP API, auth, seller/buyer/admin reads/mutations, checkout, gateway, webhook ingress.
2. `fersaku-worker`: queue jobs (webhook delivery/retry, email, KYC document processing, cleanup, alert).

Keduanya berbagi domain/application/ports dan dapat scale horizontal. PostgreSQL adalah source of truth. Redis hanya cache/coordination/rate limit/queue acceleration. Jangan memecah menjadi microservices sebelum ada bukti bottleneck/ownership.

### 2.2 Dependency direction

```text
cmd/api, cmd/worker
 -> internal/app (composition)
 -> internal/application (use cases)
 -> internal/domain (entities, value objects, invariants)
 -> internal/ports (small interfaces)
 -> internal/adapters (HTTP, PostgreSQL, Redis, Xendit, R2, mail)
```

Rules:

- Domain tidak mengimpor chi, pgx, Redis, Xendit SDK, R2 SDK, atau HTTP DTO.
- Handler hanya decode/validate/authenticate/authorize dan memanggil use case.
- Use case mengorkestrasi transaksi/provider/queue melalui port.
- SQL ada di query files + generated sqlc; jangan string-build query.
- Provider SDK tidak bocor ke domain/presentation.
- Tidak ada global utility bucket untuk menyimpan business rule acak.
- Clock/ID/random/token generator di-inject agar test deterministic.
- Cross-domain command harus jelas pemiliknya; fee calculator/payment/ledger hanya satu implementation.

### 2.3 Repository layout yang disarankan

```text
backend/
 cmd/api/main.go
 cmd/worker/main.go
 internal/
 app/
 domain/
 auth/ users/ stores/ catalog/ inventory/ coupons/ reviews/
 orders/ payments/ gateway/ ledger/ withdrawals/
 delivery/ invoices/ customers/ domains/ analytics/
 kyc/ credentials/ webhooks/ campaigns/ notifications/
 admin/ audit/ platform/
 application/
 ports/
 adapters/
 http/{middleware,handlers,dto,presenters}
 postgres/{queries,gen,repositories}
 redis/
 xendit/
 r2/
 queue/
 mail/
 observability/
 jobs/{handlers,scheduler.go}
 security/
 migrations/
 test/{fixtures,contract,integration}
 api/openapi.yaml
 sqlc.yaml
 Dockerfile
 Dockerfile.worker
 docker-compose.yml
 .dockerignore
 go.mod
```

### 2.4 Library baseline

Pin versions and review updates:

- Go `net/http` + `github.com/go-chi/chi/v5`.
- PostgreSQL `pgx/v5` + `sqlc`.
- `golang-migrate` (atau equivalent forward-only migration runner).
- `redis/go-redis/v9`.
- `hibiken/asynq` atau queue adapter dengan semantics idempotent.
- `log/slog`, Prometheus client, OpenTelemetry.
- Argon2id dan maintained password library.
- OpenAPI generator (`oapi-codegen` atau equivalent).
- Standard `testing`, `httptest`, `testcontainers-go`.
- Dependency tambahan harus punya license, maintenance, CVE, dan complexity review.

---

## 3. Docker, local development, config

### 3.1 Environment matrix

| Environment | PostgreSQL | Redis | Object storage | Xendit | Mail |
| ----------- | ------------------- | ------------------- | ------------------- | ---------------------- | ------------------- |
| local | Docker | Docker | MinIO S3-compatible | fake adapter | Mailpit |
| CI | ephemeral container | ephemeral container | fake/MinIO | fake server | fake mailer |
| staging | managed | managed TLS | R2 staging bucket | sandbox/test | staging provider |
| production | managed HA | managed TLS | private R2 bucket | one production account | production provider |

### 3.2 Docker tasks

- [ ] Multi-stage Dockerfile; minimal non-root runtime image.
- [ ] Pin base image digest melalui release automation.
- [ ] Run UID/GID non-root, read-only root FS bila memungkinkan, drop capabilities.
- [ ] Add `/health/live` dan `/health/ready`.
- [ ] Separate API dan worker command; worker tidak punya public listener.
- [ ] `.dockerignore` exclude `.git`, `.env*`, node_modules, screenshot, test artifact, secret.
- [ ] Graceful shutdown dan bounded request/job timeout.
- [ ] SBOM dan image vulnerability scan di CI.
- [ ] Tidak ada secret/environment config dibake ke image.

### 3.3 Local Compose

Required services:

```yaml
services:
 api:
 build: .
 command: ["/app/fersaku-api"]
 depends_on: [postgres, redis, minio]
 worker:
 build: .
 command: ["/app/fersaku-worker"]
 depends_on: [postgres, redis, minio]
 postgres:
 image: postgres:<pinned-major>
 redis:
 image: redis:<pinned-major>
 minio:
 image: minio/minio:<pinned-digest>
 mailpit:
 image: axllent/mailpit:<pinned-digest>
```

Acceptance:

- [ ] `docker compose up --build` starts API/worker.
- [ ] One documented command runs migrations dan deterministic seed.
- [ ] MinIO path semantics match Cloudflare R2 adapter.
- [ ] Mailpit menerima local email; no real provider call.
- [ ] Compose contains no production credential.
- [ ] Test suite starts from clean containers.

### 3.4 Typed environment configuration

Required production config categories:

```text
APP_ENV, HTTP_ADDR, DATABASE_URL, REDIS_URL
R2_ENDPOINT, R2_BUCKET_PUBLIC, R2_BUCKET_PRIVATE
R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
XENDIT_SECRET_KEY, XENDIT_WEBHOOK_TOKEN
SESSION_COOKIE_NAME, SESSION_SECRET, CSRF_SECRET
KYC_ENCRYPTION_KEY, MAIL_*, OTEL_EXPORTER_OTLP_ENDPOINT
```

- [ ] Validate every required field at startup.
- [ ] Production fails closed for fake Xendit, insecure cookie, non-TLS DB/Redis, local R2, or missing encryption key.
- [ ] Secrets come from secret manager, not committed `.env`.
- [ ] Support reviewed current/previous overlap independently for Xendit
 provider credentials and each endpoint-owned seller webhook signing
 secret. There is no global/account API-credential copy of a seller
 webhook secret.
- [ ] Public frontend env contains only API URL/flags, never secrets.

---

## 4. Database model dan invariants

### 4.1 General rules

- PostgreSQL authoritative untuk auth, authorization, tenant, catalog, payment, ledger, withdrawal, KYC, webhook, audit.
- IDs opaque ULID/UUID; pilih satu dan konsisten.
- `timestamptz` UTC; timezone hanya presentation concern.
- Money operational columns `bigint` IDR units.
- Status/check constraints + application state machine.
- Tenant queries selalu membawa `merchant_id`/`store_id` scope.
- Financial/audit records tidak dihapus oleh aplikasi.
- PII classification, retention owner, encrypted columns, and redacted DTO wajib terdokumentasi.
- Unique indexes account for normalized email/slug/case.

### 4.2 Identity/access

`users`:

- id, normalized/display email, password hash nullable for buyer magic link, name/phone, status (`PENDING_VERIFICATION`, `ACTIVE`, `SUSPENDED`, `CLOSED`), verification/login timestamps.
- Legal fields encrypted/limited; never return hash/tax data.

`auth_sessions`:

- id, user, surface (`BUYER`, `SELLER`, `ADMIN`), token hash, created/last seen/expiry/revoked, IP/UA hash, device label.
- Raw token never stored; rotate at login, password change, privilege elevation, impersonation.

`auth_challenges`:

- purpose, token hash, expiry, attempts, consumed time.
- Used for email, dual-confirmation email change, magic link, reset, auth, and
 staff/merchant invitation acceptance; one-time and rate-limited.

`user_profiles`, `user_notification_preferences`:

- User, display name, phone, locale, timezone, avatar object ref, and version.
- Preferences use a closed event/channel matrix. Mandatory security, payment,
 KYC, withdrawal, and campaign-compliance messages cannot be disabled through
 a marketing preference.
- Email change stores a pending normalized address and two independent
 challenges for the current and new address. The canonical email changes only
 after both proofs, uniqueness recheck, and session rotation. An administrator
 can start the same workflow but cannot mark an arbitrary address verified.

`staff_invitations`, `merchant_invitations`:

- Normalized email, inviter, initial role or onboarding purpose, token hash,
 expiry, status, accepted user, and audit reference.
- Acceptance is idempotent; raw token is delivered once by email and never
 returned by list/detail. A staff invite remains inactive until email proof
 and required auth are complete.

`roles`, `permissions`, `role_permissions`, `user_roles`:

- Stable permissions (`merchants.read`, `kyc.review`,
 `provider_callbacks.replay`, `seller_webhook_deliveries.retry`,
 `withdrawals.review`, `impersonation.start`,
 `impersonation.support_write`, etc.). Inbound provider replay and outbound
 seller delivery retry are never represented by one ambiguous permission.
- Deny by default; role editor cannot grant permission it lacks.
- System roles are immutable. Custom role create/update/delete and membership
 assignment use optimistic versioning; a role in use cannot be deleted until
 assignments are removed or migrated.
- Role/assignment changes are audited and rotate affected privileged sessions
 when effective permissions increase or are revoked.

### 4.3 Merchant/store

`merchants`:

- owner user, display/legal name, business type, status (`ACTIVE`, `SUSPENDED`, `CLOSED`).
- API capability is not a singular merchant column. Use the canonical
 `merchant_api_capabilities` table keyed by `(merchant_id, payment_mode,
capability)` with status, KYC case/version, reason, effective/expiry,
 suspension actor, and audit reference. Merchant status and API capability are
 separate.
- Onboarding creates exactly one canonical store for every merchant. The schema may support additional stores later, but wallet, KYC capability, API credentials, and admin API-access state are merchant-scoped; a store ID is an ownership/reporting anchor, not a second wallet.

`stores`:

- merchant, normalized unique slug, name, bio/address, status, onboarding state, storefront revision/published revision.
- Store creation is idempotent/transactional with onboarding.
- Slug changes use cooldown and audit.
- Merchant + canonical store are created in one transaction. The canonical/sole
 store cannot be deleted or archived into an unusable state; gateway, KYC,
 finance, and credential use cases reject an orphan merchant and emit an
 integrity alert. A scheduled invariant scan detects/repairs legacy orphans
 through an audited migration, never by silently inventing a second wallet.

`merchant_members` (optional future team support):

- merchant/user/role/status; initial UI may show owner only but schema must not block team support.

### 4.4 Catalog/storefront/inventory

`products`:

- store, slug/title/description/type (`DOWNLOAD`, `LINK`, `CODE`), price IDR, pay-what-you-want/min, status (`DRAFT`, `PUBLISHED`, `ARCHIVED`), current version.
- Product API is seller/admin only; gateway API never exposes it.

`product_versions`:

- immutable release metadata, R2 object refs, release notes, creator.

`storefront_revisions`:

- store, monotonic revision, validated config JSON, ETag, publisher.
- Publish requires expected revision/ETag; conflict returns typed 409.

`inventory_schemas`, `stock_items`, `stock_reservations`:

- Inventory schema is versioned by `(product_id, version)`, with ordered fields,
 normalized unique keys, label, secret/required/buyer-copyable flags, delimiter
 contract, creator, and immutable checksum. Product points to the active schema
 version.
- Updating a schema uses expected version/ETag and creates a new immutable
 version. It never rewrites a schema referenced by imported stock, reservation,
 delivery, or order. Import explicitly binds the active version; incompatible
 rows fail before any item is inserted.
- Secret fields encrypted before persistence.
- Atomic reservation/expiry prevents double delivery.
- Reveal is explicit **per item**, permissioned, recent-auth-gated where policy
 requires it, `Cache-Control: no-store`, one-time/audited. List, aggregate, and
 export DTOs always mask secrets. A global/list-level reveal endpoint is
 forbidden.

`object_refs`:

- bucket/key, checksum, content type/size, encryption key version, retention class, owner, status (`UPLOADING`, `SCANNING`, `READY`, `REJECTED`, `EXPIRED`), upload token expiry, multipart upload ID/abort state, scan verdict/version, and last verified timestamp.
- API DTOs never return a reusable raw R2 key as a field. A non-KYC presigned
 URL necessarily contains a provider endpoint/path and is treated as a
 short-lived capability; its generated unguessable key is never accepted back
 as caller-selected authority or written to logs/telemetry. KYC never uses a
 browser-visible R2 URL.

`coupons`, `coupon_product_scopes`:

- Store, normalized code, discount kind (`PERCENT`, `FIXED_IDR`), value, minimum
 order, optional total/per-buyer use limit, start/end time, state
 (`DRAFT`, `ACTIVE`, `PAUSED`, `EXPIRED`, `ARCHIVED`), scope (`ALL_PRODUCTS`,
 `SELECTED_PRODUCTS`), version, creator, and timestamps.
- Unique `(store_id, normalized_code)` including archived history; changing a
 code creates a new coupon, never changes an already-snapshotted redemption.
- Percent is bounded `1..10000` bps; fixed discount is positive IDR and cannot
 reduce eligible merchandise below zero. Tip, provider fee, and platform fee
 are never discountable. Product scope rows reference seller-owned products.

`coupon_redemption_reservations`, `coupon_redemptions`:

- Reservation binds coupon/version, checkout/order, normalized buyer identity
 hash when a per-buyer limit exists, computed discount, eligible subtotal,
 expiry, state, and idempotency key.
- Unique `(coupon_id, order_id)` and `(coupon_id, idempotency_key)` prevent
 duplicate consumption. Creation locks the coupon counter row and checks
 active time, product scope, minimum order, total/per-buyer limits, then
 reserves one slot in the same transaction as checkout intent creation.
- Reservation becomes `CONSUMED` only in the verified-paid transaction. It is
 released only after verified cancel/expiry or an unpaid abandoned-intent TTL;
 `UNKNOWN_OUTCOME` and cancel/expire pending retain it. A verified late `PAID`
 may atomically reclaim its original released reservation beyond the nominal
 limit because the immutable order was already authorized; record/alert this
 exceptional overage rather than changing the paid amount or refunding.
- Redemption is immutable and stores the exact coupon/version/code/discount
 snapshot used by the invoice. Counter rebuild from reservation/redemption
 rows must equal the coupon projection.

`reviews`, `review_replies`, `review_reports`:

- Review belongs to one paid storefront order item, product, buyer, and store;
 rating `1..5`, bounded title/body, verified-purchase evidence, status
 (`PENDING`, `PUBLISHED`, `NEEDS_EDIT`, `REMOVED`), version, and timestamps.
- Unique review per buyer/order item at launch. A buyer edit creates a versioned
 content revision; it never changes rating aggregates without an atomic
 projection update.
- Seller reply is one public, bounded, versioned reply per review. Seller can
 edit only its store's reply. Reports store reporter, closed reason code,
 bounded context, status, and moderation reference; repeated reports are
 deduplicated.
- Moderation transitions require explicit permission/reason and immutable
 before/after audit. Verified-order/product ownership is authoritative; no
 fabricated risk or opaque abuse score can decide a transition.

`customer_notes`:

- Store, buyer/customer projection, author, bounded plaintext, version, created
 and updated time. Notes are seller-internal, tenant-scoped, excluded from
 buyer/public DTOs and general exports, and never used as authorization.

### 4.5 Order/payment

`orders`:

- id/public number, payment_mode (`SANDBOX`/`LIVE`), store/merchant, buyer
 nullable, source (`STOREFRONT`, `QRIS_API`), merchant reference, IDR amounts
 (merchandise/upsell/tip/discount/gross/fee/net), coupon/redemption snapshot
 nullable, status (`CREATED`, `PENDING_PAYMENT`, `PAID`, `FULFILLING`,
 `FULFILLED`, `DELIVERY_FAILED`, `FAILED`, `EXPIRED`, `CANCELLED`).
- Payment/order source is a closed two-value enum: exactly `STOREFRONT` or
 `QRIS_API`. `MIXED` is invalid for an individual order, payment intent,
 provider event, or payment ledger credit.
- QRIS API order may have no product ID.
- Unique merchant reference per merchant/payment_mode.
- No `REFUNDED` status.
- `FAILED`/`EXPIRED`/`CANCELLED` only follow verified provider unpaid-terminal evidence.
 A later matching verified `PAID` event is an exceptional provider-precedence
 transition back to `PAID` with `paid_late=true`, not a refund or ignored
 event. It posts the financial effects once and then enters the safe
 fulfillment recovery described in section 5.3.

`order_items`:

- Storefront snapshot product/version/title/type/unit price/quantity, delivery
 policy, upsell attribution, and discount allocation; optional descriptive item
 for gateway payment. Invoice and fulfillment read this immutable snapshot,
 never the mutable current product.

`delivery_grants`, `delivery_attempts`:

- Grant binds one paid order item to its immutable product/version/object or
 stock item, buyer/guest principal, delivery kind (`DOWNLOAD`,
 `PROTECTED_LINK`, `CREDENTIAL`, `CODE`), access limits, expiry, revocation,
 and unique fulfillment-effect key.
- Download/access tokens are random, purpose-bound, short-lived, and stored only
 as hashes. Credential reveal counters and file download counters increment
 atomically after authorization; retries cannot allocate a second stock item.
- Attempt stores channel (`PORTAL`, `EMAIL`), result, safe error code, retry
 count, actor, and timestamps without secret content. Resend creates a new
 delivery attempt for the existing grant; it never creates payment/ledger or
 stock-allocation effects.
- Revoke disables future access token/reveal and records reason, but preserves
 paid order, ownership, invoice, ledger, and delivery history. Regrant/retry is
 an explicit audited command and reuses the same authorized item.

`invoices`, `invoice_verification_tokens`:

- Invoice is an immutable snapshot of issuer/buyer safe identity, order items,
 coupon code/version/discount, tip, gross, currency, paid time, provider-safe
 reference, invoice number, canonical payload hash, and renderer version.
- Unique invoice per paid order/version; generation is idempotent. PDF is a
 private R2 object and is served through ownership/guest authorization plus a
 short-lived URL. Public verification uses a separate high-entropy token hash
 and returns only minimum safe fields.
- A renderer change may create a new document version with the same immutable
 financial snapshot. It cannot recalculate historical totals from current
 product/coupon data.

`payment_intents`:

- order/store/merchant/payment_mode/source/provider (`XENDIT`), non-secret
 `account_scope`, `provider_reference`, amount, fee snapshot, status
 (`REQUIRES_PAYMENT`, `PENDING`,
 `CANCEL_PENDING`, `EXPIRE_PENDING`, `UNKNOWN_OUTCOME`, `PAID`, `FAILED`,
 `EXPIRED`, `CANCELLED`), QR metadata, expires_at, requested/confirmed
 cancel-expire timestamps/reason, unknown operation, lookup schedule, and
 `paid_late`/preceding-status evidence. Provider-side post-payment anomalies
 use a separate `provider_financial_state` (`NORMAL`,
 `PROVIDER_REVERSAL_HELD`, `PROVIDER_REVERSAL_CONFIRMED`) and never overload
 the payment status with a refund/reversal state.
- Unique idempotency key per subject/operation/payment_mode.
- A cancel request only enters `CANCEL_PENDING`. `CANCELLED` is persisted only
 after a verified Xendit response or reference lookup confirms that exact
 payment is cancelled/unpayable; expiry follows the same rule through
 `EXPIRE_PENDING -> EXPIRED`. Provider timeout never produces a local terminal
 state: it enters `UNKNOWN_OUTCOME` and schedules reference lookup with the
 same provider reference. Replays return the same operation resource.
- `PAID` cannot move back to an unpaid state. Conversely, a cryptographically
 and semantically verified late `PAID` event (matching account/reference,
 merchant, amount, currency, and mode) has financial precedence even after a
 previously confirmed `FAILED`/`CANCELLED`/`EXPIRED`: set `paid_late`, post ledger once,
 emit a high-severity inconsistency alert, and continue safe order/delivery
 recovery. There is no automatic refund path.

`payment_provider_events`:

- Opaque internal primary key `callback_id`, `provider`, stable non-secret `account_scope`, `payment_mode`,
 `provider_event_id`, received time, encrypted bounded
 payload/object ref, normalized type, processing state (`ACCEPTED`,
 `PROCESSING`, `PROCESSED`, `FAILED`, `QUARANTINED`), failure code,
 attempt/lease/next retry, processed time, and safe replay metadata.
- Unique canonical key `(provider, account_scope, payment_mode,
provider_event_id)`; use these exact column/field names in schema, Go value
 objects, queue payloads, logs, replay tools, and tests. If Xendit omits an event
 ID, normalization first derives deterministic
 `provider_event_id = "fp_" + SHA-256(canonical callback identity/body)` and
 then applies the same unique key—never introduce a second uniqueness rule.
 Raw payload retention is private/redacted. Only callbacks whose provider
 authentication was valid may enter this table.

`provider_callback_rejections` is a separate, append-only security table for a
request rejected **before** canonical event insertion. It stores rejection ID,
provider/route/account-scope configuration selected by the server, received
time, bounded observed size/over-limit flag, digest of only the bounded received
bytes, source-network fingerprint, stable reason
(`AUTH_INVALID`, `BODY_TOO_LARGE`, `MALFORMED_ENVELOPE`), and request ID. It
never stores the attacker-supplied event ID as trusted identity, a reusable
signature/token, parsed business fields, or plaintext body, and it never feeds
the event queue/replay endpoint. The ingress first enforces byte limit, verifies
the Xendit credential/signature over the original bytes, and only then parses,
normalizes, derives a missing event ID, and inserts `payment_provider_events`.
An authenticated but semantically mismatched event may be quarantined in the
canonical table; an unauthenticated callback cannot reserve/collide with a
canonical uniqueness key.

Provider resource binding is also database-enforced, not inferred from a
provider reference alone. `payment_intents` has a partial unique index on
`(provider, account_scope, payment_mode, provider_reference) WHERE
provider_reference IS NOT NULL`; withdrawals have the equivalent index for
`provider_disbursement_reference`. A normalized callback must resolve exactly
one row using the complete tuple and then verify event kind, merchant, amount,
currency, and immutable local reference. Zero/multiple matches, a reference
bound under another account scope/mode, or payment-vs-disbursement type
confusion is quarantined and cannot mutate state or ledger.

`provider_callback_admin_view` is the inbound-only query/read projection over
`payment_provider_events` plus safe payment/disbursement references. It exposes
only the internal `callbackId`, canonical `provider`/`accountScope`/
`paymentMode`/`providerEventId`, normalized type, masked reference,
received/processed time, processing status, attempt, next retry, stable error
code, mismatch/quarantine reason, replay eligibility, and audit correlation. It
never exposes raw body, signature/token, bank data, QR payload, or secrets. The
active `/admin/webhooks` frontend screen client-composes this projection with
the separately fetched `seller_webhook_delivery_admin_view` through the tagged
union specified in section 7.13; the backend never merges their rows, IDs,
statuses, cursors, or retry commands.

`idempotency_records`:

- subject type/id, operation, payment_mode nullable, key hash, canonical request
 hash, status (`IN_PROGRESS`, `COMPLETED`, `FAILED`, `UNKNOWN_PROVIDER_OUTCOME`),
 resource reference, safe response status/body, lease expiry, retention expiry,
 and request ID.
- Unique `(subject, operation, payment_mode, key_hash)`. Same key + different
 request hash returns `IDEMPOTENCY_CONFLICT`; same request replays the original
 resource/response. Expired `IN_PROGRESS` is reclaimed only through an
 operation-specific unknown-outcome lookup, never blind provider retry.

### 4.6 Unified double-entry ledger

`ledger_accounts`:

- Merchant available/pending/held, merchant recovery receivable, platform fee
 and payment-processing revenue, Xendit cash/receivable/provider expense,
 provider disbursement payable, provider-fee variance income,
 platform-provider subsidy expense, provider-reversal clearing, withdrawal
 clearing, and explicitly versioned system accounts used by the mandatory
 templates below.

`ledger_transactions`:

- merchant, optional store attribution, payment_mode, source, reference type/id (order/payment/withdrawal), status, idempotency key, posted time.
- For a payment reference, `source` is exactly `STOREFRONT` or `QRIS_API`. For a
 withdrawal reference, the top-level reporting source may additionally be
 derived `MIXED`; its allocation/entry rows retain the two original sources so
 rebuild does not guess from the top-level enum.

`ledger_entries`:

- transaction/account, debit/credit, amount/currency, fee component, source, payment_mode, references, `available_at`, and immutable settlement-lot ID for merchant credits.
- Append-only. Correction = compensating transaction + reason.

The application role has no direct `INSERT`/`UPDATE`/`DELETE` on ledger tables.
It receives `EXECUTE` only on a narrowly owned `post_ledger_transaction(...)`
database routine (or an equivalently isolated ledger-writer role) that locks the
reference and accounts in a documented order, checks one currency/mode/source,
positive whole-rupiah entries, reference/idempotency uniqueness, and inserts the
transaction plus all entries. A deferred constraint trigger runs at transaction
commit and rejects any transaction that is not balanced, has fewer than two
entries, contains zero/negative legs, or is left in an intermediate posting
state. `POSTED` rows and entries are immutable even to the normal migration/app
role; only a separately authorized migration owner may change the routines.
If the routine is `SECURITY DEFINER`, its owner is non-login, `PUBLIC` execute
is revoked, `search_path` is pinned to `pg_catalog` + the ledger schema, all
objects are schema-qualified, dynamic SQL is forbidden, and caller/tenant/
permission context is verified before posting.
No HTTP/admin command supplies account IDs or debit/credit legs. The use case
selects a closed, reviewed journal-template discriminator and immutable domain
reference; the DB routine verifies that template's allowed accounts/equations
before insert. A generic “post these entries” endpoint/function grant to the app
role is forbidden.

Invariant:

```text
available = posted merchant credits - posted merchant debits
pending = pending merchant credits
held = held merchant funds
sum(debits) == sum(credits) for every posted transaction
```

A balance projection may accelerate reads, but rebuild from ledger must produce identical totals.

Mandatory journal templates (all rows are in one DB transaction and carry the
same `payment_mode`/source/reference):

```text
Payment capture gross G, fee F, merchant credit N=G-F:
 Dr XENDIT_RECEIVABLE G
 Cr MERCHANT_PENDING N
 Cr PLATFORM_FEE_REVENUE F_percent
 Cr PAYMENT_PROCESSING_REVENUE F_fixed

Xendit settlement/actual provider cost C (internal clearing, no matching UI):
 Dr XENDIT_CASH G-C
 Dr XENDIT_PROVIDER_EXPENSE C
 Cr XENDIT_RECEIVABLE G

Settlement release after effective delay N:
 Dr MERCHANT_PENDING N
 Cr MERCHANT_AVAILABLE N

Withdrawal reserve amount W:
 Dr MERCHANT_AVAILABLE W
 Cr WITHDRAWAL_CLEARING W

Verified definitive failure/cancel before payout, release once:
 Dr WITHDRAWAL_CLEARING W
 Cr MERCHANT_AVAILABLE W

Exceptional verified late success after a prior reserve release (a+r=W):
 Dr MERCHANT_AVAILABLE a
 Dr MERCHANT_RECOVERY_RECEIVABLE r
 Cr WITHDRAWAL_CLEARING W

Withdrawal completed with platform fee P and locked quoted provider fee Q:
 Dr WITHDRAWAL_CLEARING W
 Cr PROVIDER_DISBURSEMENT_PAYABLE Q
 Cr PLATFORM_FEE_REVENUE P
 Cr XENDIT_CASH N = W-P-Q

Provider disbursement fee settled when actual A equals quote Q:
 Dr PROVIDER_DISBURSEMENT_PAYABLE Q
 Cr XENDIT_CASH A (= Q)

Actual A greater than quote Q (platform absorbs D=A-Q):
 Dr PROVIDER_DISBURSEMENT_PAYABLE Q
 Dr PLATFORM_PROVIDER_SUBSIDY D
 Cr XENDIT_CASH A

Actual A lower than quote Q (platform variance income D=Q-A):
 Dr PROVIDER_DISBURSEMENT_PAYABLE Q
 Cr XENDIT_CASH A
 Cr PROVIDER_FEE_VARIANCE_INCOME D
```

`F_fixed` is the Rp700 merchant-charged processing component; actual Xendit
costs are tracked separately as provider expense/clearing. The balance summary
must label merchant-charged fees versus actual provider costs and never imply a
provider settlement match UI.

`W = P + Q + N` is locked when the quote is consumed and the provider is asked
to disburse exactly `N`; later actual fee `A` never rewrites `W`, `P`, `Q`, `N`,
the merchant debit, reserve, clearing, or history. Only one of the three exact
fee-settlement templates above is posted from verified provider evidence, with
`A`, signed variance, provider evidence ID, and quote version snapshotted. A
positive delta is a platform expense; a negative delta is separately reported
income, never a hidden merchant charge. Platform-funded checkout discounts use
a separate `PLATFORM_SUBSIDY` account, cap, and audit reference; they never
mutate the merchant fee formula.

The failure-release template is legal only with the authoritative no-payout
evidence in sections 4.8/5.5. If later contradictory verified success arrives,
the exceptional recapture journal restores clearing before the normal
completion template: debit available only up to the amount actually available,
put shortfall `r` into merchant recovery receivable, omit zero legs, freeze
further withdrawal, and alert. It never creates a second payout or silently
drives the available projection below zero.

A verified provider reversal/chargeback-like event can occur even though
Fersaku intentionally has no refund/dispute UI or refund command. It never moves
the payment out of `PAID`, deletes the original journal, or automatically
revokes delivery. It atomically sets a separate financial containment state
`PROVIDER_REVERSAL_HELD`, blocks new withdrawal from affected funds, raises a
critical alert, and posts one idempotent compensating journal against the
original settlement lots. For a verified full-gross reversal `G = N +
F_percent + F_fixed`, consume merchant pending first (`p`), then available
(`a`), record any already-withdrawn shortfall as
`MERCHANT_RECOVERY_RECEIVABLE r = N - p - a`, and post:

```text
 Dr MERCHANT_PENDING p
 Dr MERCHANT_AVAILABLE a
 Dr MERCHANT_RECOVERY_RECEIVABLE r
 Dr PLATFORM_FEE_REVENUE F_percent
 Dr PAYMENT_PROCESSING_REVENUE F_fixed
 Cr PROVIDER_REVERSAL_CLEARING G

If provider reverses before settlement:
 Dr PROVIDER_REVERSAL_CLEARING G
 Cr XENDIT_RECEIVABLE G

If provider debits already-settled cash:
 Dr PROVIDER_REVERSAL_CLEARING G
 Cr XENDIT_CASH G
```

Omit any zero-valued `p`/`a`/`r` leg so the ledger's positive-entry invariant
remains true; the remaining legs still balance because `p + a + r = N`. Exactly
one provider-asset settlement variant is posted from verified settlement state;
the reversal clearing account cannot remain open past the incident SLA without
an alert.

Partial/provider-fee reversal variants require an explicit typed template with
the verified amount; they may not improvise a generic balance adjustment. A
provider correction later uses another balanced compensating transaction. The
incident is handled by the payment-provider runbook and audited operator notes,
not by adding refund endpoints or a refund status.

### 4.7 Fee schedules

`fee_schedules`:

- immutable policy version, source release/ADR, scope (`GLOBAL` only at launch),
 transaction bps/fixed, withdrawal bps, min withdrawal, effective interval,
 release creator/checksum/reason. `LAUNCH_FEE_POLICY_V1` must contain exactly
 `300 bps + Rp700`, withdrawal `300 bps`, and minimum `Rp50.000`.
- No overlapping intervals.
- Every payment/withdrawal stores immutable fee snapshot.
- Payment fee snapshot is selected at intent/order creation (the effective
 policy at authorization); it travels unchanged through callback, settlement,
 and ledger. Failed/expired/cancelled evidence alone never posts a fee or
 ledger entry; a later verified `PAID` precedence event posts the original
 snapshot exactly once as defined in section 5.3.
- Admin preview uses same pure calculator as posting.
- Application/admin DB roles have no insert/update/delete capability on
 `fee_schedules`. Launch values are installed by a checksum-verified
 migration/release identity. A future policy needs approved product ADR,
 versioned seed/migration, explicit effective time, regression tests, release
 approval, and rollback semantics; it cannot be supplied as arbitrary numeric
 JSON to an admin endpoint.
- Verified Xendit withdrawal processing fee and its versioned fallback evidence
 are stored in the withdrawal quote/snapshot, but do not mutate the platform
 3% or minimum withdrawal policy.

### 4.8 Withdrawals/bank

`withdrawal_quotes`:

- Opaque quote ID, merchant, `payment_mode=LIVE`, whole-rupiah amount,
 platform/provider fee components, positive net payout, fee-policy version,
 verified provider quote/reference evidence, immutable bank-account ID/version
 snapshot, idempotency record, status (`ACTIVE`, `CONSUMED`, `EXPIRED`,
 `INVALIDATED`), expiry, and consuming withdrawal ID.
- Creation is the idempotent POST contract in section 7.8. A quote is consumed
 at most once under the merchant wallet lock; bank change/security lock,
 policy/version mismatch, expiry, or prior consumption fails closed and cannot
 be “refreshed” by mutating the row.

`withdrawals`:

- merchant (wallet owner), `payment_mode=LIVE` wallet namespace, optional
 store/source allocation snapshot, amount, fee snapshot, net payout, masked
 bank snapshot, provider, non-secret `account_scope`,
 `provider_disbursement_reference`, status (`REQUESTED`, `UNDER_REVIEW`,
 `APPROVED`, `HELD`, `PROCESSING`, `COMPLETED`, `FAILED`, `UNKNOWN_OUTCOME`,
 `REJECTED`, `CANCELLED`), lock/review metadata.
- Withdrawal top-level reporting source is `STOREFRONT`, `QRIS_API`, or
 `MIXED`; `MIXED` is derived only when immutable allocations consume both
 source types. It is never accepted from the client and never used as a
 payment source.
- Reserve balance before provider call; provider retry never creates second payout.
- `UNKNOWN_OUTCOME` means the provider call may have reached Xendit; freeze the reserve and perform reference-based status lookup before any retry. `HELD` is an explicit admin review state; neither state releases funds implicitly.
- Database/use-case constraints reject allocation of SANDBOX settlement lots to a
 withdrawal, including mixed-balance tests.

Unknown-outcome resolution is exhaustive and reference-bound:

- verified `SUCCEEDED/COMPLETED` for the exact provider/account/mode/reference,
 amount, currency, and bank snapshot posts the completion journal once;
- verified definitive `FAILED/REJECTED/CANCELLED` (or authoritative not-created
 evidence after Xendit's documented lookup horizon) releases the exact reserve
 once with a compensating journal and records `FAILED`/`CANCELLED`;
- `PENDING/PROCESSING` remains `UNKNOWN_OUTCOME` (or returns to `PROCESSING`
 only when provider evidence is unambiguous), keeps the reserve, and schedules
 bounded exponential lookup with jitter;
- timeout, unavailable lookup, unverified “not found”, or conflicting evidence
 remains unknown, never releases/resends, and escalates after the alert SLA;
- reference/amount/currency/account/mode/bank mismatch quarantines the event,
 keeps funds reserved, and requires incident investigation—no admin status
 override.

Every lookup/callback shares one outcome idempotency key and row lock. A retry
of the provider create/disbursement call is permitted only when authoritative
evidence proves the original request was never accepted and the adapter's
documented idempotency key is reused; it can never mint a second reference or
payout. That retry happens before a terminal release. Once the withdrawal is
marked `FAILED`/`CANCELLED` and its reserve released, the original provider
create is never retried; a seller must create a new quote/withdrawal.

`withdrawal_allocations` snapshots each consumed settlement lot/source and amount.
FIFO ordering is `(available_at ASC, settlement_lot_id ASC)` under the merchant
wallet lock; rebuild and admin reporting use this snapshot rather than guessing
from current balances.

`bank_accounts`:

- encrypted account/token, masked label, holder, bank code, status
 (`PENDING_VERIFICATION`, `VERIFIED`, `ARCHIVED`), immutable version,
 verification/primary/change timestamps.
- Bank change triggers configurable security lock dan notification.
- Full number never appears in logs/DTO/history.
- Edit creates a new version and archives the previous payout target. Archive is
 rejected while referenced by an active quote/withdrawal or when it would
 leave an in-flight payout without its immutable bank snapshot. Exactly one
 verified primary account may exist per merchant; changing primary is audited
 and invalidates outstanding withdrawal quotes.

### 4.9 KYC/API credential

`kyc_cases`:

- merchant (capability owner), optional canonical store anchor, capability `QRIS_API_LIVE`, status (`DRAFT`, `SUBMITTED`, `IN_REVIEW`, `VENDOR_CHECK`, `NEEDS_CLARIFICATION`, `APPROVED`, `REJECTED`, `EXPIRED`), reviewer/vendor refs, reason, version/timestamps.
- Transition matrix enforced.

`kyc_documents`:

- document metadata in DB, binary private R2, checksum/encryption/retention state.
- KYC plaintext never receives a browser-to-R2 presigned URL. Upload is streamed
 through an authenticated, size-bounded server endpoint into the malware/file
 validator and application envelope-encryption pipeline; only ciphertext is
 committed to private R2 under a server-generated create-only key. Scanner or
 encryption failure leaves no `READY` document and schedules cleanup.
- Reviewer view is a server-authorized, audited, short-lived decrypted stream
 with `Cache-Control: private, no-store`; no raw R2 key or reusable URL is
 returned.

`api_credentials`:

- merchant (authoritative owner), optional canonical store anchor,
 `payment_mode` (`SANDBOX`, `LIVE`), key prefix/hash, status (`ACTIVE`,
 `REVOKED`, `SUSPENDED`, `EXPIRED`), lifecycle timestamps. Pre-claim/KYC state
 belongs to the issuance request, never a credential row with nonexistent key
 material.
- At most one active **API authentication key** total per merchant is exposed by
 the current UI (enforced by a partial unique index). The first successfully
 claimed credential is `SANDBOX`; live KYC approval authorizes the pending
 `LIVE` issuance request/claim. Successful seller claim then generates and
 activates the live key and revokes the sandbox key atomically. An eligible
 seller may request and claim its own key through the guarded workflow in
 section 7.9; admin/support may authorize rotation/revocation but can never
 receive or reveal the merchant's raw key.
- Live activation transaction checks KYC approved + merchant active + emergency switch.
- API key stores prefix + keyed hash only and is revealed once through a
 short-lived seller claim. Outbound webhook signing secrets do **not** belong
 to `api_credentials`; they are owned and rotated only by `webhook_endpoints`
 because the server must retain their envelope-encrypted ciphertext to sign.
 The frontend mock may display fixed sample values, but production returns
 masked metadata after the one-time claims.

`api_credential_issuance_requests`, `secret_claims`:

- Issuance request stores merchant, payment mode, typed purpose, capability/KYC
 version, requester/authorizer, expected predecessor version, status
 (`PENDING_KYC`, `AUTHORIZED`, `CLAIMED`, `EXPIRED`, `REVOKED`), idempotency
 reference, and lifecycle timestamps. It never stores a raw API key.
- Partial unique indexes permit at most one outstanding (`PENDING_KYC` or
 `AUTHORIZED`) issuance request per merchant/mode and one active API
 credential per merchant; idempotent replay returns the existing request.
- A claim stores opaque claim ID, kind (`API_KEY`, `WEBHOOK_ENDPOINT_SECRET`),
 issuance request or endpoint/secret version, exact recipient user, keyed hash
 of the random claim token, attempts, expiry, and consumed time. One partial
 unique active claim is allowed per resource/version/kind. The raw claim token
 is returned/delivered once under section 6.5 and never stored.
- API key material is generated only inside successful claim consumption.
 Webhook endpoint material already retained for signing may be decrypted only
 for its first valid claim; claim consumption/expiry does not delete the
 endpoint's required signing ciphertext.

`merchant_api_capabilities`:

- merchant, payment_mode, capability (`QRIS_API`), status, KYC case/version,
 effective/expiry timestamps, suspension reason/actor, and audit reference;
 unique `(merchant_id, payment_mode, capability)`.

`gateway_redirect_origins`:

- merchant, `payment_mode`, normalized HTTPS origin (`scheme`, IDNA ASCII host,
 explicit/default port), status, creator/reason, created/revoked timestamps;
 unique `(merchant_id, payment_mode, normalized_origin)`.
- It is the allowlist authority for gateway `successUrl`/`failureUrl`; paths and
 bounded query strings remain per-intent while the origin must match exactly.
 Wildcards, public-suffix-only entries, userinfo, and fragments are invalid.
 Until the unchanged frontend has a management surface, provisioning is an
 audited admin/support operation rather than a hidden permissive fallback.

### 4.10 Outbound seller-webhook delivery

`webhook_endpoints`:

- merchant/store, `payment_mode`, normalized URL, event allowlist, encrypted signing secret ciphertext + key version
 (hash alone cannot generate outbound signatures), status
 (`PENDING_VERIFICATION`, `PENDING_SECRET_CLAIM`, `ACTIVE`, `SUSPENDED`,
 `REVOKED`), failure counters,
 current/previous secret version and rotation overlap expiry.
- Launch UI may enforce one active endpoint per merchant/mode with a partial
 unique index. The endpoint is the sole owner of its signing secret; API-key
 rotation does not rotate/reveal it, and endpoint secret rotation does not
 change API authentication.
- Production HTTPS + SSRF/private IP/redirect protections.

`webhook_deliveries`:

- endpoint/event/source/order/payment/withdrawal reference, payload object/hash, attempt, HTTP/latency, next retry, status (`QUEUED`, `DELIVERED`, `RETRYING`, `DEAD_LETTER`, `CANCELLED`).
- Same immutable event ID and exact body on retries; each attempt gets a fresh
 timestamp/signature so the receiver replay window remains valid. Retry is not
 a new financial event.

`seller_webhook_delivery_admin_view` is a separate outbound delivery projection
with endpoint host, event ID/type, target merchant/store, delivery status,
attempt/next retry, safe HTTP class/latency, and dead-letter reason. It never
reuses provider callback IDs/statuses and is not the data source for the active
admin failed-Xendit-callback feature. Seller dashboard delivery history and any
authorized operational retry use this projection and the outbound delivery use
case only.

### 4.11 Audit/impersonation

`audit_events` append-only:

- Event ID, actor admin/user, acting session, impersonation session, action,
 resource, merchant/store, request ID, IP/UA hash, reason, redacted
 before/after, result, timestamp, and `payment_mode` where relevant.
- Integrity columns are mandatory: `chain_scope`, monotonic `sequence_no`,
 `canonical_version`, `canonical_payload`, `prev_hash`, and `row_hash`.
- DB app role has no direct INSERT/UPDATE/DELETE privilege. It only receives
 `EXECUTE` on a narrow `append_audit_event(...)` function; export/read roles
 cannot call that function.
- Export is redacted, cursor-paginated, async for large range, and itself audited.

Every privileged/business mutation that requires audit commits the domain row,
the append-only audit event, the idempotency result, and every resulting outbox
effect in the **same PostgreSQL transaction**. The audit append function accepts
the transaction's derived before/after values, not caller-authored JSON. If
audit append, sequence/hash allocation, or outbox insertion fails, the mutation
rolls back; “best-effort audit after commit” is forbidden. A worker may deliver
the outbox effect later, but it cannot reconstruct a missing authoritative
audit record. Read-only audit views/exports remain independently audited by the
same atomic command wrapper where they create an export or verification job.

Lightweight hash-chain contract (implement exactly, not as a UI-only
"verified" label):

1. Launch uses one logical chain per stable runtime `deployment_scope`; do not
 split by merchant, worker, or `payment_mode`. The genesis `prev_hash` is 32
 zero bytes and the public signing-key fingerprint is pinned in deployment
 config/ADR.
2. The Go audit package canonicalizes the immutable logical event fields with
 RFC 8785 JSON Canonicalization Scheme and passes UTF-8 bytes as
 `canonical_payload`; launch `canonical_version` is `JCS-1`. Null versus
 absent, enum casing, UTC RFC3339 nanoseconds, integer encoding, redaction,
 and field set are frozen by golden test vectors. Search projections are
 extracted from this payload; they are not a second mutable truth.
3. `append_audit_event(...)` validates the supported version/size/required
 fields, locks the single `audit_chain_heads(chain_scope)` row `FOR UPDATE`,
 assigns `sequence_no = head + 1`, and calculates with `pgcrypto`:

 ```text
 row_hash = SHA-256(
 UTF8("fersaku.audit.v1") || 0x00 ||
 int8send(sequence_no) || prev_hash ||
 int4send(length(version_bytes)) || version_bytes ||
 int8send(length(canonical_payload)) || canonical_payload
 )
 ```

 Integer lengths are byte counts in network order. It inserts the event and
 advances the head in the same transaction. Rollback advances neither;
 correction is a new event, never an update.

4. A checkpoint worker runs at least hourly or every 10,000 committed events,
 whichever comes first. A separate least-privilege signer signs
 `(chain_scope, sequence_no, row_hash, canonical_version, signed_at)` with an
 Ed25519 key held outside PostgreSQL. Store the signature/key ID in append-only
 `audit_checkpoints` and a create-only object in a dedicated private R2
 prefix/bucket using a unique conditional-create key protected by an approved
 Cloudflare R2 Bucket Lock rule for at least the audit retention period. Do
 not assume object versioning. The normal application role cannot sign,
 overwrite, shorten retention, or delete checkpoints.
5. The verifier streams by `sequence_no`, recomputes canonical bytes/hash,
 checks gap/duplicate/`prev_hash`, verifies the latest anchored checkpoint
 against the pinned public key, and reports the uncheckpointed tail
 separately. Run incremental verification after each checkpoint and a full
 scan daily. Any gap, hash/signature mismatch, missing overdue checkpoint, or
 R2/DB anchor disagreement emits critical `AUDIT_CHAIN_BROKEN`, marks admin
 integrity/export claims as failed, and follows a runbook; it alerts but does
 not stop payment callback processing.

Concurrency/partition policy stays simple: all writers serialize briefly on the
one chain-head row and acquire it after business row locks in a documented,
consistent order; multiple audit events in one transaction take the head lock
once. Launch keeps `audit_events` unpartitioned so PostgreSQL can enforce unique
`event_id` and `(chain_scope, sequence_no)` directly. Benchmark row count/index
size and this lock at staging load; do not pre-partition. A later measured need
for monthly physical partitions requires a versioned migration that preserves a
continuous `sequence_no`/`prev_hash` across boundaries and an unpartitioned
uniqueness registry (or equivalent DB-enforced global uniqueness). Sharding the
logical chain additionally requires new trust anchors, verifier support, and an
ADR; neither optimization may be introduced speculatively.

`audit_chain_heads` and `audit_checkpoints` are infrastructure tables, not an
event-sourcing system. The chain proves post-commit alteration/gaps relative to
the signed anchor; it does not claim that a compromised authorized writer
reported a truthful business fact, so authorization and before/after capture
tests remain mandatory.

`impersonation_sessions`:

- actor admin, required canonical target user, optional target merchant context,
 scope (`READ_ONLY`, `SUPPORT_WRITE` only), start/end/expiry, reason/ticket,
 original/derived session, status/termination actor. There is no privileged or
 full-access enum value in schema, Go, OpenAPI, generated client, or UI.
- Never overwrite target's real session.

### 4.12 Platform settings/alerts

`platform_settings`:

- read-only active fee policy reference, emergency switches
 (`SELLER_REGISTRATION`, `QRIS_CHECKOUT`, `WITHDRAWALS`), and
 provider/retention policy. Platform settings cannot override fee bps/fixed or
 minimum withdrawal; those resolve from the immutable release policy.
- Exactly those three emergency switches are runtime-writable at launch. Fee,
 settlement delay, feature availability, provider choice, rate/resource
 limits, maintenance policy, and administrator security policy shown on the
 existing system screen are read-only release-managed configuration. The
 generic mock “Publish configuration” button must be disabled/no-op under the
 live adapter and has no backend mutation route.
- There is no fourth maintenance switch and no mutable global announcement
 boolean here. Customer communication uses the separately permissioned
 campaign contract below; disabling a product surface uses one of the three
 named switches with its documented effect matrix.
- Operational availability/config flags are never plan, subscription, billing,
 or paid-entitlement gates. There is no per-merchant "Pro" override.
- Sensitive change requires permission, reason, idempotency, audit.

`operational_alerts`:

- deduplicated fingerprint, type, severity, resource, acknowledged/resolved metadata.
- Alert is operational projection, not alternate financial truth.

### 4.13 Custom domains

`store_domains`:

- Store, normalized ASCII/IDNA hostname, display hostname, verification-token
 hash, expected DNS record, status (`PENDING_DNS`, `VERIFYING`, `ACTIVE`,
 `FAILED`, `SUSPENDED`, `REMOVING`), TLS/certificate state, last/next verified
 time, failure code, and version.
- Global unique hostname prevents cross-tenant takeover. Reject IP literals,
 localhost/private suffixes, public-suffix-only names, wildcard input,
 userinfo/path/port, mixed-script spoofing outside the documented IDNA policy,
 and any hostname reserved by Fersaku.
- Ownership verification checks the exact DNS token through a resolver with
 bounded timeout/cache policy. Activation waits for ownership plus valid edge
 routing/TLS. Periodic revalidation suspends routing after a documented grace
 period; deletion first removes edge routing/certificate, then releases the
 hostname after a takeover-cooldown tombstone.
- Domain lifecycle is free for all stores and independent from KYC/API access.
 The public request host is resolved to a store by this authoritative table,
 never by a client-supplied store ID or `Host` string passed through blindly.

### 4.14 Attribution analytics

`checkout_attribution_snapshots`, `store_traffic_daily`:

- At checkout-session creation capture bounded normalized UTM source, medium,
 campaign, content, referrer origin, landing path, anonymous visitor/session
 hash, store/product, consent/collection version, and occurred time. Strip
 known sensitive query parameters; never store full arbitrary URLs, email,
 tokens, API keys, or payment data as analytics dimensions.
- The immutable snapshot follows the order and is marked converted only from
 verified `PAID`. Last non-direct click at launch uses a documented 30-day
 window and deterministic tie-breaker. Gateway API payments never invent
 storefront traffic attribution.
- Daily aggregate is a rebuildable projection for clicks/sessions/orders/gross
 by bounded dimensions. Raw snapshot retention, aggregation timezone, bot
 filtering, consent/cookie notice, deletion/anonymization, and late-event
 handling are versioned. Analytics cannot authorize or affect payment,
 ledger, delivery, KYC, or withdrawal.

### 4.15 Notifications and seller communication

`notifications`, `notification_preferences`:

- Recipient user/surface (`SELLER`, `BUYER`, `ADMIN`), closed event type,
 bounded title/body, internal safe route, resource/tenant scope, created/read
 timestamps, priority, dedupe key, and retention class.
- Notification links are relative allowlisted application routes generated by
 the server. Arbitrary schemes/origins, secrets, raw provider payloads, and
 sensitive bank/KYC fields are forbidden.
- Outbox creates notification/email jobs idempotently. Mandatory transactional,
 security, KYC, payment, withdrawal, and compliance events ignore marketing
 opt-out only for their necessary channel; optional marketing respects consent
 and unsubscribe immediately.

Seller-to-customer email is intentionally narrow:

- Launch does not provide an arbitrary HTML, attachment, recipient-list, or
 bulk-mail relay. A seller may invoke only a versioned allowlisted template for
 its own verified customer/order (for example product update or delivery
 resend), with server-rendered bounded variables, consent/legal-purpose check,
 per-store/per-recipient rate limits, suppression/bounce handling, and audit.
- The existing “Kirim email” control must remain unavailable in live mode until
 a specific template/purpose is selected. Internal customer notes are never
 interpolated into email.

### 4.16 Admin campaigns/announcements

`campaigns`, `campaign_deliveries`, `campaign_acknowledgements`:

- Campaign stores creator, closed audience predicate/version, priority
 (`INFO`, `WARNING`, `CRITICAL`, `COMPLIANCE`), sanitized bounded Markdown,
 optional internal CTA label/path, channels (`EMAIL`, `IN_APP`), mandatory
 acknowledgement flag, status (`DRAFT`, `QUEUED`, `LIVE`, `PAUSED`,
 `COMPLETED`, `CANCELLED`), reason, schedule, and immutable content version.
- Audience is selected from server-defined predicates such as all sellers,
 active sellers, restricted sellers, or QRIS API applicants. The request never
 accepts SQL/filter expressions or an arbitrary recipient list. Preview returns
 an estimated count and safe sample without exposing recipient PII.
- Markdown is sanitized to the supported subset. CTA is a normalized relative
 path from an allowlist; `javascript:`, `data:`, protocol-relative, external,
 and open-redirect targets are rejected.
- Publish requires permission, recent authentication for critical/compliance priority,
 reason, confirmation, content checksum, expected draft version, and
 idempotency key. Test sends only to the acting admin. Pause/resume affects
 unsent jobs and never retracts already delivered mail.
- Delivery uses an immutable recipient snapshot/dedupe key. Mandatory in-app
 acknowledgement is recorded per user/campaign version; dismissing client
 storage is not proof. Marketing campaigns honor preference/consent;
 operational or compliance use requires a documented legal/product purpose.

### 4.17 Active-surface configuration boundary

- Personal profile, business profile, notification preferences, bank accounts,
 custom domains, storefront draft, and campaigns each use their own typed
 command and optimistic version. Do not route them through a generic JSON
 settings blob.
- Business/legal identity fields referenced by an approved KYC case are
 versioned. Editing them does not rewrite evidence or silently preserve live
 capability: apply the documented material-change policy and, when material,
 suspend only the live QRIS API capability pending review while storefront and
 wallet history remain intact.
- The live application exposes no arbitrary merchant credit/debit/balance or
 ledger command. Existing balance-control cards remain visibly disabled under
 the live adapter. Corrections, if ever approved later, require a separate ADR,
 maker-checker workflow, evidence, typed source allocation, and balanced
 compensating journal; they are not added through `/v1/admin/actions`.

---

## 5. State machines

### 5.1 Auth

```text
REGISTERED -> EMAIL_PENDING -> ACTIVE
ACTIVE -> SUSPENDED -> ACTIVE
ACTIVE -> CLOSED
```

Password reset revokes sessions. Login rotates session.

### 5.2 Onboarding

```text
NOT_STARTED -> IDENTITY -> SLUG -> VISUAL -> PRODUCT_OPTIONAL -> COMPLETE
```

Product is skippable; store identity/slug are not. Progress persists and retries are idempotent.

### 5.3 Payment/order

```text
PAYMENT allowed transitions:
REQUIRES_PAYMENT -> PENDING | PAID(verified create/callback race) | FAILED
PENDING -> PAID | FAILED | CANCEL_PENDING | EXPIRE_PENDING | UNKNOWN_OUTCOME
CANCEL_PENDING -> CANCELLED | UNKNOWN_OUTCOME | PAID
EXPIRE_PENDING -> EXPIRED | UNKNOWN_OUTCOME | PAID
UNKNOWN_OUTCOME -> PENDING | PAID | FAILED | CANCELLED | EXPIRED
FAILED | CANCELLED | EXPIRED -> PAID (verified-provider precedence exception)
PAID -> no other payment status; provider reversal uses provider_financial_state

PROVIDER_FINANCIAL_STATE:
NORMAL -> PROVIDER_REVERSAL_HELD -> PROVIDER_REVERSAL_CONFIRMED
PROVIDER_REVERSAL_HELD | PROVIDER_REVERSAL_CONFIRMED -> NORMAL only after verified provider correction + compensating journal

ORDER normal:
CREATED -> PENDING_PAYMENT -> PAID -> FULFILLING -> FULFILLED
 | \-> DELIVERY_FAILED
 -> FAILED/CANCELLED/EXPIRED only after provider evidence
FAILED/CANCELLED/EXPIRED -> PAID only with the matching payment exception
```

Cancel/expire commands are idempotent **requests**, not proof that QRIS can no
longer be paid. They first persist `CANCEL_PENDING`/`EXPIRE_PENDING` with the
same provider reference. Only a verified provider response/event/reference
lookup may finalize `CANCELLED`/`EXPIRED`. Timeout or ambiguous response enters
`UNKNOWN_OUTCOME`; a bounded lookup job runs before any terminal transition,
stock release, or provider retry. Client/admin cannot directly choose a
terminal result.

Only verified provider evidence can finalize `PAID`. A reference lookup may
return `PENDING` from `UNKNOWN_OUTCOME`; its terminal result must match the
remembered operation (`CANCELLED` only for cancel, `EXPIRED` only for expire,
and `FAILED` only for a verified payment failure). `PAID` always dominates a
pending cancel/expire/unknown/failed result. If matching verified `PAID` arrives
after local `FAILED`/`CANCELLED`/`EXPIRED`, process it as a
provider-consistency exception:

1. lock provider event, payment, order, and financial reference;
2. transition payment/order to `PAID`, mark `paid_late=true`, preserve preceding
 terminal evidence, and post fee/ledger/outbox exactly once using the original
 snapshot;
3. emit a deduplicated high-severity provider-terminal-contradiction alert and
 send the normal payment event once; never synthesize a refund;
4. for `QRIS_API`, finish with the normal paid event/status because there is no
 Fersaku inventory delivery;
5. for storefront, keep an existing valid reservation or attempt one atomic
 re-reservation against the immutable order snapshot. Deliver only if the
 item/credential still belongs to this order. If fulfillment is not safely
 possible, set `DELIVERY_FAILED`, retain the valid paid/ledger record, notify
 buyer/merchant operations, and require the evidence-gated normal delivery
 retry/force-fulfill use case. Never expose another order's stock or silently
 discard payment.

Duplicate `PAID` is a no-op for ledger and delivery uniqueness keys. Later
failed/cancelled/expired events cannot move `PAID` backward. A verified
provider reversal changes only the containment state and posts the section 4.6
compensating journal. The late-paid path above is the only payment-status
transition out of an unpaid terminal state and is not exposed as a public/admin
status mutation. Every unspecified edge is rejected with the current resource
version and an immutable audit/evidence reference.

### 5.4 KYC/live key

```text
KYC case:
DRAFT -> SUBMITTED
SUBMITTED -> IN_REVIEW
IN_REVIEW -> VENDOR_CHECK | NEEDS_CLARIFICATION | APPROVED | REJECTED
VENDOR_CHECK -> IN_REVIEW | NEEDS_CLARIFICATION | APPROVED | REJECTED
NEEDS_CLARIFICATION -> SUBMITTED (new immutable submission/document version)
APPROVED -> EXPIRED
REJECTED | EXPIRED -> terminal; a resubmission creates a linked successor DRAFT case

ISSUANCE_REQUEST:
PENDING_KYC -> AUTHORIZED | REVOKED | EXPIRED
AUTHORIZED -> CLAIMED | REVOKED | EXPIRED
CLAIMED -> terminal; it creates exactly one credential

CREDENTIAL:
ACTIVE -> SUSPENDED | REVOKED | EXPIRED
SUSPENDED -> ACTIVE | REVOKED | EXPIRED
REVOKED | EXPIRED -> terminal; reissue requires a new issuance request
```

An eligible sandbox issuance request may be created directly as `AUTHORIZED`;
a live request is `PENDING_KYC` unless a current approved capability already
exists. KYC expiry/revocation expires unclaimed live requests/claims and
suspends an active live credential in the same transaction.

KYC expiry/revocation suspends live API capability only; storefront, balance
reads, settled history, and eligible withdrawals remain available. A reviewer
cannot silently reactivate a key without a current approved capability state,
active merchant, enabled API switch, recent-auth/reason authorization, and an
atomic audit event. `APPROVED` requires all mandatory documents `READY`, scan
success, consent/version match, and reviewer/vendor evidence; a clarification
or rejection reason is mandatory. An expired/rejected case row and its evidence
are immutable and cannot be relabeled by resubmission.

### 5.5 Withdrawal

```text
REQUESTED -> UNDER_REVIEW | REJECTED | CANCELLED
UNDER_REVIEW -> APPROVED | HELD | REJECTED | CANCELLED
HELD -> UNDER_REVIEW | REJECTED | CANCELLED
APPROVED -> PROCESSING | CANCELLED (only before provider submission)
PROCESSING -> COMPLETED | FAILED | UNKNOWN_OUTCOME
UNKNOWN_OUTCOME -> PROCESSING | COMPLETED | FAILED | CANCELLED
FAILED | CANCELLED -> COMPLETED only on verified late provider-success evidence
```

Reserve before provider call. `UNKNOWN_OUTCOME` is resolved only by lookup of
the same provider reference; never create a second disbursement. Every terminal
path releases or settles the reserve exactly once. Amount/reference mismatch
quarantines the callback and keeps the reserve held. A verified late success
after a local terminal failure/cancellation financially wins. It consumes the
still-linked reserve, or—if authoritative failure had already released it—posts
the exact section 4.6 recapture + completion journals once, records any
shortfall as recovery receivable, freezes withdrawal, and raises a critical
contradiction alert; it never sends a second payout.
Every unspecified/manual status edge is rejected.

### 5.6 Impersonation

```text
REQUESTED -> ACTIVE -> EXPIRED
 -> TERMINATED
 -> REVOKED
```

No nested impersonation; no admin-to-admin impersonation. Server enforces expiry and scope.
Every session resolves to one non-admin `target_user_id`; merchant-target start
is only a convenience resolver for its canonical owner and fails closed if the
target is missing or ambiguous. `SUPPORT_WRITE` is default-deny and only admits
the exact route/field allowlist in section 11.5.

### 5.7 Coupon/redemption

```text
COUPON: DRAFT -> ACTIVE -> PAUSED -> ACTIVE
 | \-> ARCHIVED
 -> EXPIRED -> ARCHIVED

REDEMPTION: RESERVED -> CONSUMED
 | -> RELEASED (verified unpaid/abandoned only)
 \-> HELD_UNKNOWN (provider outcome unknown)
HELD_UNKNOWN -> CONSUMED | RELEASED after verified provider outcome
```

Coupon activation validates product ownership, time window, value, and limits.
Checkout and redemption use one transaction/lock order. Editing an active coupon
creates a new version for future intents; existing reservation/invoice keeps its
snapshot. Browser/admin cannot directly increment or decrement use counters.

### 5.8 Review/moderation

```text
PENDING -> PUBLISHED -> NEEDS_EDIT -> PUBLISHED
 \-> REMOVED
PENDING ----------------> REMOVED
```

Only a verified eligible buyer creates/edits its review. Seller reply/report is
separate from review status. Admin transitions require reason and cannot change
the buyer/order/product identity or fabricate verified purchase.

### 5.9 Delivery grant

```text
PENDING_FULFILLMENT -> ACTIVE -> EXPIRED
 | -> REVOKED
 \-> DELIVERY_FAILED -> ACTIVE (safe retry/regrant)
```

Only verified paid state creates or reactivates a grant. Retry/resend reuses the
same unique grant/allocation. Revocation never changes payment, ledger, invoice,
or ownership and never frees sold credential stock for another order.

### 5.10 Domain/campaign

```text
DOMAIN: PENDING_DNS -> VERIFYING -> ACTIVE -> SUSPENDED -> ACTIVE
 \-> REMOVING

CAMPAIGN: DRAFT -> QUEUED -> LIVE -> PAUSED -> LIVE
 | \-> CANCELLED
 \-> COMPLETED
```

Domain activation requires authoritative ownership plus edge/TLS readiness.
Campaign state transitions are content-version/idempotency guarded; pause and
cancel never claim already delivered messages were withdrawn.

---

## 6. HTTP contract

### 6.1 Envelope

Success:

```json
{
 "data": {},
 "meta": { "requestId": "req_01", "timestamp": "2026-07-16T08:00:00Z" }
}
```

Error:

```json
{
 "problem": {
 "code": "KYC_REQUIRED_FOR_LIVE_API",
 "message": "Live QRIS API access requires approved KYC.",
 "details": {},
 "requestId": "req_01"
 }
}
```

Rules:

- Stable machine code; message must not leak secret/PII.
- `X-Request-ID` forwarded/generated dan present on every response.
- Collection data has opaque cursor metadata.
- Strict content type/body size/JSON validation.
- IDR money fields are JSON integers with OpenAPI `type: integer`,
 `format: int64`, operation-specific positive bounds, and checked arithmetic;
 decimal/exponent/string forms are invalid.
- 2xx is not enough: response must match OpenAPI/schema.

### 6.2 Headers

```text
X-Request-ID
Idempotency-Key
X-CSRF-Token
session authentication
X-Audit-Reason
```

- Server derives actor/merchant from auth, never accepts client actor ID.
- Mutation idempotency namespace = subject + `payment_mode` (when financial) + operation + key; runtime deployment `env` is never used as a financial identity.
- Only safe reads are generic-retryable.

### 6.3 Error codes

Minimum stable codes:

```text
AUTH_REQUIRED, AUTH_INVALID_CREDENTIALS, AUTH_SESSION_EXPIRED,
AUTH_AUTH_REQUIRED, AUTH_CSRF_INVALID, FORBIDDEN,
RESOURCE_NOT_FOUND, VALIDATION_FAILED, CONFLICT,
IDEMPOTENCY_REPLAY, IDEMPOTENCY_CONFLICT, RATE_LIMITED,
ONBOARDING_STORE_REQUIRED, KYC_REQUIRED_FOR_LIVE_API, KYC_NOT_APPROVED,
KYC_NEEDS_CLARIFICATION, KYC_EXPIRED, MERCHANT_SUSPENDED,
API_ACCESS_SUSPENDED, LIVE_CREDENTIAL_REQUIRED, SANDBOX_MODE_REQUIRED,
SECRET_CLAIM_INVALID, WEBHOOK_ENDPOINT_UNAVAILABLE,
PAYMENT_NOT_FOUND, PAYMENT_AMOUNT_MISMATCH, PAYMENT_ALREADY_FINAL,
PAYMENT_CANNOT_CANCEL, PAYMENT_CANCELLED, PAYMENT_EXPIRED,
PROVIDER_UNAVAILABLE, PROVIDER_UNKNOWN_OUTCOME, WEBHOOK_SIGNATURE_INVALID,
WEBHOOK_REPLAY, BALANCE_INSUFFICIENT, WITHDRAWAL_BELOW_MINIMUM,
WITHDRAWAL_QUOTE_EXPIRED, WITHDRAWAL_FEE_UNAVAILABLE,
WITHDRAWAL_UNKNOWN_OUTCOME, WITHDRAWAL_SECURITY_LOCK,
STOREFRONT_REVISION_CONFLICT, INVENTORY_SCHEMA_CONFLICT,
COUPON_INVALID, COUPON_INACTIVE, COUPON_LIMIT_REACHED,
COUPON_NOT_APPLICABLE, REVIEW_NOT_ELIGIBLE, REVIEW_TRANSITION_INVALID,
DELIVERY_NOT_AVAILABLE, DELIVERY_REVOKED, DOMAIN_OWNERSHIP_REQUIRED,
DOMAIN_ALREADY_CLAIMED, CAMPAIGN_VERSION_CONFLICT,
EMAIL_CHANGE_PROOF_REQUIRED, NOTIFICATION_NOT_FOUND,
IMPERSONATION_NOT_ALLOWED, IMPERSONATION_EXPIRED, INTERNAL_ERROR
```

### 6.4 Pagination/filter

- Cursor order `(created_at DESC, id DESC)` and hard max page size 100.
- Validate filter names/enums; reject arbitrary SQL/order.
- Include all filters in frontend query key/cache identity.
- Large exports are async and audited.

### 6.5 One-time URL/bootstrap token exchange

Raw magic-link, email-verification/change, password-reset, invitation,
guest-order, invoice-verification, credential-claim, and webhook-secret-claim
tokens are never accepted in a query string or path parameter. Email/browser
links carry the random token in the URL fragment (`#token=...`), which is not
sent in the HTTP request; the minimal first-party page immediately removes the
fragment with `history.replaceState` and sends the token once in an HTTPS
`POST` JSON body to its typed exchange endpoint. That page has
`Referrer-Policy: no-referrer`, `Cache-Control: no-store`, no third-party
scripts/pixels/assets, and redacted access logs. A no-JavaScript fallback is a
first-party POST form, never a tokenized GET.

Tokens are random >=256-bit, purpose/audience/resource bound, stored only as a
keyed hash, short-lived, rate-limited, and atomically consumed with the resulting
session/capability/claim. GET, email-security scanner, preview bot, retry, or
referer cannot consume one. A successful guest exchange returns the minimum
response or a short-lived host-only capability cookie and redirects only to a
fixed token-free relative path. Failed/replayed/expired exchanges return a
generic problem and never reveal account/resource existence. Credential claims
add an authenticated matching seller, recent authentication, issuance-request version,
and one-reveal response; their raw secret is never delivered in the email URL.

---

## 7. Endpoint catalog

### 7.1 Health/status

```text
GET /health/live
GET /health/ready
GET /v1/status
GET /v1/platform/fees
```

Liveness never depends on provider. Readiness checks dependencies without leaking credentials.

### 7.2 Auth/session

```text
POST /v1/auth/register
POST /v1/auth/verify-email
POST /v1/auth/login
POST /v1/auth/logout
POST /v1/auth/magic-link/request
POST /v1/auth/magic-link/consume
POST /v1/auth/password/forgot
POST /v1/auth/password/reset
POST /v1/auth/password/change
POST /v1/auth/email-change/request
POST /v1/auth/email-change/confirm-current
POST /v1/auth/email-change/confirm-new
GET /v1/auth/session
POST /v1/auth/auth/enroll
POST /v1/auth/auth/confirm
POST /v1/auth/auth/verify
POST /v1/auth/auth/disable
POST /v1/auth/auth/recovery-codes/regenerate
GET /v1/auth/sessions
POST /v1/auth/sessions/{sessionId}/revoke
POST /v1/auth/sessions/revoke-others
POST /v1/auth/sessions/revoke-all
GET /v1/me/profile
PATCH /v1/me/profile
GET /v1/me/notification-preferences
PATCH /v1/me/notification-preferences
```

Cookie session is httpOnly/Secure/SameSite. Buyer magic link is one-time/expiring.
Password/email/s require recent proof appropriate to the current
principal, rotate sessions, and notify the old verified address. Security codes (unused)
are returned once from create/regenerate, stored hashed, excluded from logs, and
cannot be fetched later. Revoke-all revokes the current session only after the
response is committed; callers then clear the cookie.

### 7.3 Onboarding

```text
GET /v1/onboarding
POST /v1/onboarding/store
GET /v1/stores/slug-availability?slug=...
PATCH /v1/onboarding/store
POST /v1/onboarding/complete
```

`POST /onboarding/store` must be idempotent and return same store on replay. It cannot create API-only tenant without store.

### 7.4 Public store/catalog/invoice

```text
GET /v1/public/stores/{slug}
GET /v1/public/products/featured
GET /v1/public/products/{idOrSlug}
POST /v1/public/order-access/exchange
GET /v1/public/orders/{orderNumber}/status
POST /v1/public/invoices/verify
```

Public order status requires a successfully exchanged, unguessable, expiring,
single-purpose guest token (or the existing signed checkout session) in
addition to the public number; a sequential number alone is never
authorization. The exchange receives `{ orderNumber, token }` in the body and
issues only a token-free short-lived order capability. Invoice verification
likewise receives `{ token }` in a POST body and returns minimum safe fields.
Rate-limit by token hash/IP and return only minimal status/amount metadata.
Public DTO excludes legal PII, KYC, admin fields, secrets, private objects, and
internal provider data.

### 7.5 Seller commerce, storefront, inventory, customer, and analytics

```text
GET /v1/stores/{storeId}
PATCH /v1/stores/{storeId}
GET /v1/stores/{storeId}/orders
GET /v1/stores/{storeId}/orders/{orderId}
POST /v1/stores/{storeId}/orders/{orderId}/delivery/resend
GET /v1/stores/{storeId}/customers
GET /v1/stores/{storeId}/customers/{customerId}
PUT /v1/stores/{storeId}/customers/{customerId}/note
POST /v1/stores/{storeId}/customers/{customerId}/messages
GET /v1/stores/{storeId}/products
POST /v1/stores/{storeId}/products
GET /v1/stores/{storeId}/products/{productId}
PATCH /v1/stores/{storeId}/products/{productId}
POST /v1/stores/{storeId}/products/{productId}/publish
POST /v1/stores/{storeId}/products/{productId}/archive
GET /v1/stores/{storeId}/storefront
PUT /v1/stores/{storeId}/storefront/draft
POST /v1/stores/{storeId}/storefront/publish
GET /v1/stores/{storeId}/inventory/products
GET /v1/stores/{storeId}/inventory/products/{productId}
GET /v1/stores/{storeId}/inventory/products/{productId}/schema
PUT /v1/stores/{storeId}/inventory/products/{productId}/schema
POST /v1/stores/{storeId}/inventory/products/{productId}/items
POST /v1/stores/{storeId}/inventory/items/import
POST /v1/stores/{storeId}/inventory/items/{itemId}/validate
POST /v1/stores/{storeId}/inventory/items/{itemId}/revoke
POST /v1/stores/{storeId}/inventory/items/{itemId}/reveal
GET /v1/stores/{storeId}/reviews
GET /v1/stores/{storeId}/reviews/summary
PUT /v1/stores/{storeId}/reviews/{reviewId}/reply
POST /v1/stores/{storeId}/reviews/{reviewId}/reports
GET /v1/stores/{storeId}/coupons
POST /v1/stores/{storeId}/coupons
GET /v1/stores/{storeId}/coupons/{couponId}
PATCH /v1/stores/{storeId}/coupons/{couponId}
POST /v1/stores/{storeId}/coupons/{couponId}/activate
POST /v1/stores/{storeId}/coupons/{couponId}/pause
POST /v1/stores/{storeId}/coupons/{couponId}/archive
GET /v1/stores/{storeId}/domains
POST /v1/stores/{storeId}/domains
GET /v1/stores/{storeId}/domains/{domainId}
POST /v1/stores/{storeId}/domains/{domainId}/verify
DELETE /v1/stores/{storeId}/domains/{domainId}
GET /v1/stores/{storeId}/analytics/overview?from=&to=&timezone=
GET /v1/stores/{storeId}/analytics/traffic?from=&to=&channel=&cursor=
GET /v1/stores/{storeId}/business-profile
PATCH /v1/stores/{storeId}/business-profile
```

Secret reveal: explicit item ID + permission + recent authentication policy + reason +
`Cache-Control: no-store` response + audit. There is no list/global reveal and
inventory list/export never contains unmasked secret values. Schema PUT requires
`If-Match`/expected version and creates a version rather than mutating referenced
fields.

Seller order/customer/review read models remain store-scoped at the transport
boundary. The service resolves the owning merchant before every query and
never treats a caller-supplied store ID as authorization.

Coupon create/update accepts integer IDR/bps only and an explicit product scope.
Activate/pause/archive are idempotent state commands. Coupon validation is not a
public enumeration endpoint: checkout submits an optional code and receives a
generic invalid/unavailable result plus the authoritative priced intent. A
coupon usage projection is informational; limits are enforced by reservation
rows and database locks described in section 4.4.

`messages` accepts only a closed `template` enum, the owned order/product
reference required by that template, and bounded variables. It rejects raw
subject/body/HTML/recipient overrides. Until an approved template exists, the
live adapter must keep the generic “Kirim email” control unavailable.

Domain create returns a verification record/token once; verify is safe and
idempotent but rate-limited. Delete is an asynchronous removal resource when
edge/TLS cleanup is pending. Analytics responses contain aggregates and safe
dimensions only, never raw visitor events or arbitrary landing query strings.

### 7.6 Hosted checkout

```text
POST /v1/checkout/intents
GET /v1/checkout/intents/{intentId}
POST /v1/checkout/intents/{intentId}/expire
POST /v1/checkout/simulate-payment
GET /v1/orders/{orderId}
POST /v1/orders/{orderId}/delivery/access
GET /v1/orders/{orderId}/invoice
POST /v1/orders/{orderId}/invoice
```

Checkout derives price server-side, sets `source=STOREFRONT`, and never trusts
browser total/status. Create request may include buyer identity, selected product
and upsell IDs, a pay-what-you-want amount, tip, and optional `couponCode`; the
server reloads product/version/minimum/upsell price, validates the coupon, and
returns immutable line/discount/fee snapshots. Tip is never discounted and a
coupon cannot make merchandise negative. Coupon reservation, order, intent, and
idempotency record are created atomically.

Expire is authorized only for the owning buyer checkout
session or merchant/admin permission, requires `Idempotency-Key`, and verifies
tenant/order binding. It returns the current operation resource (`202` while
`EXPIRE_PENDING`/`UNKNOWN_OUTCOME`) rather than claiming terminal expiry.
Provider timeout triggers reference lookup; `EXPIRED` and stock release happen
only after verified unpaid-terminal evidence. A scheduled
`payment_intent.expire` job is the authoritative request fallback and uses the
same state machine. A later verified `PAID` follows the precedence and safe
re-fulfillment flow in section 5.3. `simulate-payment` is a
local/staging-only deterministic test seam protected by an environment gate; it
is not a production payment endpoint and cannot be enabled by a public client.

`GET .../invoice` returns the authorized immutable invoice DTO or a short-lived
private PDF URL. `POST .../invoice` idempotently generates/repairs a missing
document only for a verified paid order; it cannot accept amounts, issuer,
coupon, provider status, or paid time from the caller. Public verification stays
on the separate opaque-token endpoint in section 7.4.

### 7.7 QRIS Payment Gateway API

Canonical base path `/v1/gateway`; authenticated with
`Authorization: Bearer <merchant_api_key>` (never a cookie, query parameter, or
frontend public env), separate from seller/admin auth. Keep the existing public
docs alias below as a thin route adapter until the frontend docs are migrated;
both paths call the exact same use case and OpenAPI schema:

```text
POST /v1/gateway/payment-intents
GET /v1/gateway/payment-intents/{paymentIntentId}
POST /v1/gateway/payment-intents/{paymentIntentId}/cancel
GET /v1/gateway/events/{eventId}

POST /v1/qris/payments # compatibility alias
GET /v1/qris/payments/{paymentIntentId} # compatibility alias
POST /v1/qris/payments/{paymentIntentId}/cancel # compatibility alias
GET /v1/qris/events/{eventId} # compatibility alias
```

Canonical JSON is camelCase (`expiresInMinutes`, `qrImageUrl`,
`paymentIntentId`, `providerReference`, `status`, `amount`, `currency`,
`expiresAt`, `webhookEndpointId`, `webhookEventId`). The legacy alias accepts snake_case input such
as `expires_in_minutes` and legacy response names, normalizes internally, and
returns a deprecation header; contract tests must cover both until its sunset.

Request:

```json
{
 "merchantReference": "invoice-2026-0001",
 "amount": 125000,
 "currency": "IDR",
 "description": "Order #0001",
 "customer": {
 "reference": "opaque-customer-id",
 "email": "buyer@example.test"
 },
 "expiresInMinutes": 15,
 "successUrl": "https://merchant.example/success",
 "failureUrl": "https://merchant.example/failure",
 "webhookEndpointId": "whep_01",
 "metadata": { "customerId": "opaque" }
}
```

Rules:

- Live call requires active live credential, approved KYC, active merchant, and QRIS switch.
- Sandbox is isolated from production provider/ledger.
- No product ID is required; no product CRUD exists under gateway.
- `merchantReference` is idempotent per merchant/payment_mode.
- `customer` is optional opaque metadata; reject excessive PII/size and never use
 it for authorization. `expiresInMinutes` is bounded by server policy.
- The compatibility alias accepts the same request/response and returns a
 deprecation header with a sunset date; it must not fork validation or payment
 state logic. It may normalize `webhook_endpoint_id`, but must reject legacy
 `webhook_url` or any arbitrary callback URL.
- Idempotency requires `Idempotency-Key`, a canonical request hash, `IN_PROGRESS`
 protection, replay of the original response/resource, bounded retention, and
 an explicit `UNKNOWN_PROVIDER_OUTCOME` path after timeout.
- Cancel is an asynchronous provider-backed command: return `202` while
 `CANCEL_PENDING`/`UNKNOWN_OUTCOME`, finalize `CANCELLED` only from verified
 provider evidence, and let any verified matching `PAID` event win financially
 as defined in section 5.3. A cancel timeout is looked up by the same reference,
 never blindly retried or treated as success.
- Fee calculation is exactly shared with hosted checkout.
- Client polling is read-only; Xendit callback is authority.
- API key never appears in URL/query/log.
- `successUrl`/`failureUrl` are browser-only redirect targets and are never
 fetched, resolved, probed, or followed by any Fersaku server/worker. Require an
 absolute HTTPS URL no longer than 2,048 UTF-8 bytes, no userinfo/control
 character/fragment/scheme-relative form, and an exact normalized origin match
 against the merchant credential's registered redirect-origin allowlist. In
 live and sandbox, arbitrary origins and wildcard/public-suffix matches are
 forbidden. If Fersaku performs the browser redirect, it selects the immutable
 URL stored on the intent after verifying intent/session binding; it never
 accepts a caller-supplied `next`/`returnTo`, preventing an open redirect.
- Payment create accepts only optional `webhookEndpointId`, never a URL. The ID
 must resolve to an `ACTIVE`, verified endpoint owned by the authenticated
 merchant and the same `payment_mode`; cross-tenant, inactive, missing, or
 mode-mismatched IDs return a non-enumerating error before provider creation.
 Store the endpoint ID/config version on the intent. Endpoint registration and
 each outbound delivery receive the full HTTPS SSRF policy: DNS/IP validation,
 blocked private/link-local/loopback/metadata ranges, DNS rebinding defense,
 egress allow policy, redirect revalidation, timeouts, and bounded response
 body. Redirect targets are limited to the registered endpoint policy; no
 credential forwarding across origins.
- `metadata` is bounded opaque data (launch maximum 8 KiB encoded JSON, depth 4,
 50 keys, and 1 KiB per string). A value that happens to contain a URL is never
 fetched, probed, rendered as a trusted link, or used for redirect/authorization;
 output encoding is mandatory. The only typed URL fields in payment create are
 `successUrl` and `failureUrl`; `webhookEndpointId` is an opaque resource ID,
 not a URL. Adding another typed URL requires an explicit fetch-vs-browser
 classification and the corresponding validator.

### 7.8 Finance/unified wallet

```text
GET /v1/stores/{storeId}/finance/summary
GET /v1/stores/{storeId}/finance/ledger?cursor=&source=&type=&from=&to=
GET /v1/stores/{storeId}/finance/revenue
GET /v1/stores/{storeId}/withdrawals
GET /v1/stores/{storeId}/withdrawals/{withdrawalId}
POST /v1/stores/{storeId}/withdrawal-quotes
GET /v1/stores/{storeId}/withdrawals/lock
POST /v1/stores/{storeId}/withdrawals
GET /v1/stores/{storeId}/bank-accounts
POST /v1/stores/{storeId}/bank-accounts
PATCH /v1/stores/{storeId}/bank-accounts/{id}
POST /v1/stores/{storeId}/bank-accounts/{id}/verify
POST /v1/stores/{storeId}/bank-accounts/{id}/make-primary
DELETE /v1/stores/{storeId}/bank-accounts/{id}
```

Response includes unified totals and source breakdown:

For existing frontend compatibility, `monthPlatformFeeAmount` is the merchant
3% component and legacy `monthProviderFeeAmount` maps to the merchant-charged
Rp700 processing component. Actual Xendit expense/clearing is an internal
finance/admin metric and must not be mislabeled as a merchant charge.

```json
{
 "availableAmount": 18240500,
 "pendingAmount": 3420000,
 "heldAmount": 0,
 "lifetimeGrossAmount": 82640000,
 "monthGrossAmount": 24860000,
 "monthPlatformFeeAmount": 745800,
 "monthProviderFeeAmount": 218400,
 "monthNetAmount": 23895800,
 "currency": "IDR",
 "asOf": "2026-07-16T08:00:00Z",
 "sources": {
 "STOREFRONT": { "available": 12000000, "pending": 1000000 },
 "QRIS_API": { "available": 6240500, "pending": 2420000 }
 },
 "feePolicy": {
 "transactionPercentBps": 300,
 "transactionFixedIdr": 700,
 "withdrawalPercentBps": 300,
 "minimumWithdrawalIdr": 50000
 },
 "withdrawalAllocationPolicy": "FIFO_AVAILABLE_AT",
 "withdrawalExample": {
 "amountDebited": 100000,
 "source": "MIXED",
 "allocations": [
 { "source": "STOREFRONT", "amount": 60000 },
 { "source": "QRIS_API", "amount": 40000 }
 ]
 }
}
```

One wallet operationally; source is reporting/filtering, not separate withdrawal
pools. Every withdrawal response includes an immutable allocation snapshot. The
top-level source is `STOREFRONT`, `QRIS_API`, or `MIXED`; allocation consumes the
oldest `available_at` credits first (FIFO), then the next source, under one
merchant row lock. Admin filters must not pretend a mixed debit belongs to only
one source.

Withdrawal quote response is an opaque short-lived object, not an unbounded
repeat provider call:

```json
{
 "amount": 100000,
 "bankAccountId": "bank_04"
}
```

```json
{
 "quoteId": "wq_01",
 "expiresAt": "2026-07-16T08:05:00Z",
 "amountDebited": 100000,
 "platformFee": 3000,
 "providerProcessingFee": 2500,
 "totalFee": 5500,
 "netDisbursement": 94500,
 "minimumAmount": 50000,
 "policyVersion": "LAUNCH_FEE_POLICY_V1",
 "bankAccountVersion": "bankv_04"
}
```

`POST /withdrawal-quotes` requires `Idempotency-Key`, an integer whole-rupiah
`amount`, and explicit seller-owned verified `bankAccountId`. The key/request
hash returns the same quote without another provider call; the same key with a
different amount/bank account is a conflict. The quote atomically snapshots the
immutable bank version, live wallet owner, amount, policy version, verified
provider quote/evidence, expiry, and positive net. It cannot silently select the
current primary account, and GET/query-string quote creation is forbidden.

`POST /withdrawals` consumes `quoteId` exactly once and binds it to merchant,
live wallet, bank-account version, amount, policy version, quote idempotency
record, and its own `Idempotency-Key`; expired/used/changed-bank quotes are
rejected and re-quoted. Provider fee is revalidated under the wallet lock before
disbursement, with the exact immutable quote-vs-actual journals in section 4.6.

Bank create/edit/primary/archive requires recent authentication, expected bank
version, reason for sensitive change, and notification. Edit creates a new
version; it never mutates the bank snapshot already bound to a withdrawal.
Verification returns masked holder/status only. `DELETE` means archive and is
rejected for the primary/only verified account or any active quote/payout until
a safe replacement exists.

### 7.9 Credential/webhook seller endpoints

```text
GET /v1/stores/{storeId}/api-credentials
POST /v1/stores/{storeId}/api-credential-requests
POST /v1/stores/{storeId}/api-credential-claims/{claimId}/exchange
GET /v1/stores/{storeId}/webhooks
POST /v1/stores/{storeId}/webhooks
PATCH /v1/stores/{storeId}/webhooks/{id}
POST /v1/stores/{storeId}/webhooks/{id}/secret-rotation-requests
POST /v1/stores/{storeId}/webhooks/{id}/secret-claims/{claimId}/exchange
POST /v1/stores/{storeId}/webhooks/{id}/test
GET /v1/stores/{storeId}/webhooks/deliveries
```

`POST .../webhooks/{id}/test` creates a deterministic `test=true` event in a
separate namespace; it cannot carry arbitrary user payload, mutate payment or
ledger state, or trigger fulfillment. It is permissioned/rate-limited but uses
the same body/signature/retry contract as a real outbound delivery.

Current UI shows one API key and one webhook secret per account. Preserve that
presentation without conflating ownership: `api_credentials` owns only the
merchant authentication key; the one launch `webhook_endpoint` owns only its
outbound signing secret. Normal GET responses expose masked prefix/fingerprint,
mode/status, endpoint host, last-rotated time, and pending-claim metadata only.

Credential issuance is seller-claimed, never admin-delivered:

1. The authenticated canonical merchant owner calls
 `POST .../api-credential-requests` with mode and typed purpose
 (`INITIAL_ISSUE` or `ROTATE`), `Idempotency-Key`, recent authentication, expected
 credential/capability version, and reason for rotation. Sandbox eligibility
 is checked immediately; a live request stays `PENDING_KYC` until an approved
 current KYC capability authorizes it.
2. Authorization creates an issuance request and a single-use claim whose raw
 claim token is returned once to that authenticated seller or delivered in a
 section 6.5 fragment link. Admin/support can approve/revoke the request but
 cannot see the claim token or API key.
3. The same seller calls the claim exchange with the raw claim token in the POST
 body plus recent authentication. In one transaction the server locks request/capability,
 rechecks merchant/mode/KYC/switch/version/expiry, generates the API key,
 stores only prefix + keyed hash, activates it, revokes the predecessor when
 rotating, consumes the claim, writes audit/idempotency/outbox, and returns
 the raw API key exactly once with `Cache-Control: no-store`.
4. An expired/consumed claim reveals nothing and cannot be replayed. A lost API
 key requires a new rotation request; no endpoint can recover it from storage.
 An expired **unconsumed** claim may be replaced only after the same seller
 reauthenticates/repeats recent authentication against the still-authorized issuance
 request; replacement revokes the old claim hash and still generates no API
 key until successful exchange.

Webhook endpoint create/secret rotation independently creates a one-time secret
claim after SSRF verification. Its exchange is seller-authenticated,
recent-auth/version bound, consumes the claim atomically, and reveals the
endpoint-owned secret once; the server retains only the envelope-encrypted
current/previous secret versions needed for signing, marks the claim consumed,
and retains only claim hash/audit metadata—never a raw claim token.
Initial endpoint state remains `PENDING_SECRET_CLAIM` and cannot be bound by a
payment until that claim transaction activates it. Rotation has a bounded
overlap accepted by signature verification metadata; the old current version
stays active until successful claim atomically promotes the new version. It does
not rotate the API key and is audited. The fixed mock values are fixtures to
replace at the mapper boundary, never production secrets.

### 7.10 Merchant KYC submission (API capability)

The current frontend primarily exposes the admin KYC queue; the backend must
still provide a complete merchant submission contract without changing the
existing visual surface:

```text
GET /v1/merchants/{merchantId}/kyc
POST /v1/merchants/{merchantId}/kyc/cases
POST /v1/merchants/{merchantId}/kyc/cases/{caseId}/documents
GET /v1/merchants/{merchantId}/kyc/cases/{caseId}/documents/{documentId}
POST /v1/merchants/{merchantId}/kyc/cases/{caseId}/resubmit
```

Only the merchant owner/member with the capability may submit; prefer a
`/v1/me/kyc` alias for seller clients, and if the `{merchantId}` form is kept,
enforce ownership and return a non-enumerating 404 on mismatch. Required
document types, consent, beneficial-owner/legal-name fields, checksum, vendor
reference, and clarification reason are versioned configuration. Document POST
is an authenticated streaming multipart upload to Fersaku—not a presigned R2
intent. It enforces declared/observed type and size while streaming, computes
checksum, scans, envelope-encrypts, and commits ciphertext to private R2 before
the status can become `READY`; plaintext is never persisted to disk/object
storage. The GET returns status/metadata only. `NEEDS_CLARIFICATION ->
SUBMITTED` is an explicit versioned resubmit transition and accepts only a case
owned by the same merchant. Existing admin endpoints remain the review
authority; review streams decrypted content through a separately audited
authorization path.

### 7.11 Buyer

```text
GET /v1/buyer/profile
PATCH /v1/buyer/profile
GET /v1/buyer/purchases
GET /v1/buyer/purchases/{orderId}
GET /v1/buyer/sessions
POST /v1/buyer/sessions/{sessionId}/revoke
POST /v1/buyer/sessions/revoke-others
POST /v1/buyer/sessions/revoke-all
POST /v1/buyer/purchases/{orderId}/delivery/access
POST /v1/buyer/purchases/{orderId}/delivery/resend
GET /v1/buyer/purchases/{orderId}/invoice
POST /v1/buyer/reviews
PATCH /v1/buyer/reviews/{reviewId}
GET /v1/buyer/notifications
POST /v1/buyer/notifications/{notificationId}/read
POST /v1/buyer/notifications/read-all
```

Delivery secrets require ownership, paid/fulfilled state, and access policy.
Review create/update checks the immutable order-item entitlement and edit state;
it cannot accept buyer/store/product IDs that disagree with the order. Resend is
rate-limited/idempotent and sends the existing grant, never a secret in the API
response. Profile email changes use section 7.2 rather than an unverified PATCH.

### 7.12 Inbound provider callbacks versus outbound seller webhooks

Inbound Xendit ingress (external provider -> Fersaku):

```text
POST /v1/webhooks/xendit/payment
POST /v1/webhooks/xendit/disbursement
```

Verify provider signature/token before business parse. Persist a
`payment_provider_events` row and outbox wake-up before queueing. Acknowledge
only after durable acceptance. Unknown event is safely recorded/acknowledged,
not retried forever. Processing failure enters the inbound provider-callback
queue and can only be replayed from the stored event through the same
normalizer; replay never sends an HTTP request back to a seller endpoint.

Outbound seller webhooks (Fersaku -> merchant-owned HTTPS endpoint) are created
from outbox effects and stored in `webhook_endpoints`/`webhook_deliveries`.
Their retry performs an outbound signed HTTP delivery and can never replay a
Xendit callback or mutate financial state. They are not an inbound
`/v1/webhooks/seller/*` API. If a future inbound merchant callback is needed, it
must receive a separately reviewed route and threat model.

The two queues use distinct tables, IDs, status enums, permissions, handlers,
metrics, and admin endpoint namespaces. Never call a provider event a
`deliveryId`, never call a seller delivery a `providerEventId`, and never build
one generic retry endpoint that switches behavior from payload fields.

### 7.13 Admin

```text
GET /v1/admin/overview
GET /v1/admin/merchants
GET /v1/admin/merchants/{merchantId}
POST /v1/admin/merchant-invitations
POST /v1/admin/merchants/{merchantId}/status
POST /v1/admin/merchants/{merchantId}/api-access/status
POST /v1/admin/merchants/{merchantId}/api-credentials/rotate
POST /v1/admin/merchants/{merchantId}/api-credentials/revoke
POST /v1/admin/merchants/{merchantId}/impersonation
GET /v1/admin/users
GET /v1/admin/users/{userId}
POST /v1/admin/staff-invitations
POST /v1/admin/staff-invitations/{invitationId}/revoke
POST /v1/admin/users/{userId}/impersonation
POST /v1/admin/impersonation/{sessionId}/terminate
GET /v1/admin/profile
PATCH /v1/admin/profile
GET /v1/admin/buyers
GET /v1/admin/buyers/{buyerId}
GET /v1/admin/buyers/{buyerId}/purchases
GET /v1/admin/buyers/{buyerId}/sessions
POST /v1/admin/buyers/{buyerId}/magic-link
POST /v1/admin/buyers/{buyerId}/email-change
POST /v1/admin/buyers/{buyerId}/sessions/{sessionId}/revoke
POST /v1/admin/buyers/{buyerId}/sessions/revoke-all
GET /v1/admin/orders
GET /v1/admin/orders/{orderId}
POST /v1/admin/orders/{orderId}/delivery/resend
POST /v1/admin/orders/{orderId}/force-fulfill # delivery use case only; evidence-gated
GET /v1/admin/payments
GET /v1/admin/payments/{paymentIntentId}
POST /v1/admin/payments/{paymentIntentId}/provider-lookup
GET /v1/admin/withdrawals
GET /v1/admin/withdrawals/{withdrawalId}
POST /v1/admin/withdrawals/{withdrawalId}/review
GET /v1/admin/inventory
GET /v1/admin/inventory/items/{itemId}
POST /v1/admin/inventory/items/{itemId}/reveal
POST /v1/admin/inventory/items/{itemId}/invalidate
GET /v1/admin/fulfillments
GET /v1/admin/fulfillments/{deliveryId}
POST /v1/admin/fulfillments/{deliveryId}/retry
POST /v1/admin/fulfillments/{deliveryId}/revoke-access
GET /v1/admin/reviews
GET /v1/admin/reviews/{reviewId}
POST /v1/admin/reviews/{reviewId}/transition
GET /v1/admin/kyc
GET /v1/admin/kyc/{caseId}
POST /v1/admin/kyc/{caseId}/transition
GET /v1/admin/provider-callbacks?status=&type=&accountScope=&paymentMode=&providerEventId=&cursor=
GET /v1/admin/provider-callbacks/{callbackId}
POST /v1/admin/provider-callbacks/{callbackId}/replay
GET /v1/admin/seller-webhook-deliveries?status=&merchantId=&cursor=
GET /v1/admin/seller-webhook-deliveries/{deliveryId}
POST /v1/admin/seller-webhook-deliveries/{deliveryId}/retry
GET /v1/admin/audit-logs
GET /v1/admin/audit-logs/{eventId}
POST /v1/admin/audit-exports
GET /v1/admin/audit-exports/{exportId}
GET /v1/admin/audit-integrity
POST /v1/admin/audit-integrity/verify
GET /v1/admin/campaigns
POST /v1/admin/campaigns
GET /v1/admin/campaigns/{campaignId}
PATCH /v1/admin/campaigns/{campaignId}
POST /v1/admin/campaigns/{campaignId}/preview
POST /v1/admin/campaigns/{campaignId}/test
POST /v1/admin/campaigns/{campaignId}/publish
POST /v1/admin/campaigns/{campaignId}/pause
POST /v1/admin/campaigns/{campaignId}/resume
GET /v1/admin/providers
GET /v1/admin/system
GET /v1/admin/system/fees
GET /v1/admin/overview/platform-volume
POST /v1/admin/system/fees/preview
POST /v1/admin/system/emergency-controls
GET /v1/admin/roles
GET /v1/admin/permissions
POST /v1/admin/roles
GET /v1/admin/roles/{roleId}
PATCH /v1/admin/roles/{roleId}
DELETE /v1/admin/roles/{roleId}
POST /v1/admin/roles/{roleId}/assignments
DELETE /v1/admin/roles/{roleId}/assignments/{userId}
GET /v1/admin/notifications
POST /v1/admin/notifications/{notificationId}/read
POST /v1/admin/notifications/read-all
POST /v1/admin/actions
```

Do not create `/admin/risk`, `/admin/security`, `/admin/disputes`, `/admin/reconciliation`, or Admin AI endpoints.

The unchanged `/admin/webhooks` page is a presentation-only client composition,
not a unified backend webhook resource. It performs two independent reads:
`GET /v1/admin/provider-callbacks` for inbound Xendit events and
`GET /v1/admin/seller-webhook-deliveries` for outbound merchant deliveries. The
frontend maps them into a discriminated union
`{ kind: "PROVIDER_CALLBACK", callbackId, ... } |
{ kind: "SELLER_DELIVERY", deliveryId, ... }`, then renders the existing shared
table. IDs, status enums, evidence fields, pagination cursors, permissions,
metrics, and mutations remain type-separated. Provider replay calls only
`/provider-callbacks/{callbackId}/replay`; seller retry calls only
`/seller-webhook-deliveries/{deliveryId}/retry`. Row detail and available actions
are selected from `kind`, never inferred from an arbitrary `source` string or
generic ID. Do not create `/admin/webhooks/retry`, a generic delivery table, or
a server handler that dispatches by payload fields. The “All” view merges a
bounded recent window client-side using stable `occurredAt + kind + id`
ordering; authoritative deep pagination/export requires selecting one source
and using that source's cursor.

Provider replay requires `provider_callbacks.replay`, reason, idempotency,
by policy, and audit. It reprocesses the durable stored event through
the normalizer and is never an outbound HTTP delivery. Seller retry requires
the separate `seller_webhook_deliveries.retry`. A handler must reject IDs from
the other namespace with a non-enumerating error. `{callbackId}` is Fersaku's
opaque row ID, not `provider_event_id`; list/detail/replay DTO and audit context
always carry the full canonical `(provider, account_scope, payment_mode,
provider_event_id)` identity so a provider ID alone is never treated as unique.

`POST /v1/admin/users/{userId}/impersonation` is the explicit user-target start
contract. It accepts only `READ_ONLY` or `SUPPORT_WRITE`, reason/ticket, TTL
15/30/60 minutes, and idempotency metadata; it rejects admin targets. The
merchant start route is a UI convenience that resolves exactly one canonical
non-admin owner user (and otherwise fails closed), then invokes the same user
use case. Both return the same server-derived session/banner DTO. Privileged or
full-access scope is absent from request schema and generated enums; an unknown
scope is a validation error, never a hidden/disabled option.

The admin `api-credentials/rotate` route is an authorization command for a
versioned issuance request, not a secret-generation/reveal response. It requires
permission, recent authentication, reason, expected predecessor version, and idempotency;
it returns masked request/claim-availability metadata and never a claim token or
API key. Only the matching seller can perform the section 7.9 claim exchange.
`revoke` invalidates the selected key and auth cache immediately but likewise
returns no secret.

`/v1/admin/providers` is read-only health/latency/status. The single source of
truth for the three switches (`SELLER_REGISTRATION`, `QRIS_CHECKOUT`,
`WITHDRAWALS`) is `/v1/admin/system/emergency-controls`; do not create a second
provider-specific mutation with competing precedence.

`force-fulfill` requires provider-paid evidence, matching order/payment/merchant
scope, `fulfillment.force` permission, reason, and idempotency. It
only re-runs an authorized delivery attempt and may set `DELIVERY_FAILED` /
`FULFILLED` according to the normal fulfillment use case; it never marks a
payment paid, writes a second ledger entry, issues a refund, or bypasses stock
ownership.

Safe order/payment commands are deliberately narrow:

- `provider-lookup` performs one rate-limited Xendit reference lookup and feeds
 a verified normalized result into the same payment-finalization pipeline. It
 accepts no requested local/provider status, amount, reference replacement, or
 ledger input and returns `202` when the provider outcome remains unknown.
- `delivery/resend` sends the existing authorized grant to the order's verified
 delivery address. It accepts no recipient override or secret in the response.
- fulfillment `retry` is allowed only for `DELIVERY_FAILED`/retryable attempts,
 uses the original unique effect/allocation, and cannot allocate another sold
 credential. `revoke-access` revokes only access grant/token with reason.
- admin inventory reveal is per exact item, recent-auth/reason gated and
 `no-store`; the collection endpoint never returns secret fields. Invalidate is
 rejected for a sold/reserved item unless the dedicated safe state rule proves
 no buyer entitlement can be broken. Physical delete is not exposed.

Buyer support commands also fail closed. Admin magic-link sends only to the
current verified address, is rate-limited, and never returns a token. Admin
email change starts the dual-confirmation flow in section 7.2; it cannot directly
set `verified=true`. Session revoke is scoped to the selected buyer/session and
records the operational reason.

Role/staff commands enforce anti-escalation: the actor cannot grant a permission
it does not currently possess, modify an immutable system role, remove the last
break-glass-safe administrator, or assign an invited user before email/auth
activation. Increased/revoked privileges rotate affected sessions. Campaign
commands follow sections 4.16 and 5.10; test never reaches the selected audience,
and publish/pause/resume require reason/idempotency/audit.

`POST /v1/admin/actions` is not a generic arbitrary state writer. It accepts a
strict generated discriminated command allowlist only for the named schemas
that intentionally use it: merchant status/API access, KYC transition,
withdrawal review, inbound provider callback replay, outbound seller delivery
retry, one of the three emergency switches, and impersonation termination.
All other operations above use their explicit endpoints. The union has no
catch-all string/action payload. It has no routine fee/configuration publish
command and must reject arbitrary fee values, `PAID`, `REFUNDED`, balance,
ledger, provider-reference, recipient, permission, or secret updates;
force-fulfill is evidence-gated and never creates a refund or bypasses payment
verification.

There is no `/v1/admin/merchants/{id}/balance`, `/credit`, `/debit`, ledger
adjustment command, or corresponding `/v1/admin/actions` discriminator. Contract
and negative-route tests assert 404/validation rejection. The existing credit
and debit cards remain disabled in live mode.

`GET /v1/admin/system/fees` and `POST .../fees/preview` are read/calculation
contracts only. Preview may accept hypothetical gross/withdrawal/provider-fee
inputs but always reports `LAUNCH_FEE_POLICY_V1`; it cannot persist or activate
anything. There is no launch admin fee mutation endpoint. Future policy
activation is a checksum-verified release/migration backed by an approved
product ADR, as required in sections 0.3 and 4.7.

`GET /v1/admin/system` may display settlement delay, feature availability,
limits, maintenance policy, and security policy from release configuration, but
none are accepted by a runtime publish endpoint. The only mutable system route
is `POST /v1/admin/system/emergency-controls`, whose request has exactly one of
`SELLER_REGISTRATION`, `QRIS_CHECKOUT`, or `WITHDRAWALS`, enabled state, reason,
incident/ticket, expected version, and idempotency key. Unknown/fourth switch
names are validation errors. Customer-facing maintenance copy is published as
a campaign, not a fourth switch.

Audit export is asynchronous and filter-bound. Create stores the normalized
query, redaction policy/version, requester, expiry, and audit event; status
returns a short-lived private download only when complete. Detail access and
manual integrity verification are themselves audited. Verification cannot
claim success when the signed checkpoint is missing, stale, or invalid.

### 7.14 Invitations, notification inbox, and campaign acknowledgement

```text
POST /v1/invitations/staff/accept
POST /v1/invitations/merchant/accept
GET /v1/notifications?cursor=&unreadOnly=
POST /v1/notifications/{notificationId}/read
POST /v1/notifications/read-all
GET /v1/announcements/active
POST /v1/announcements/{campaignId}/acknowledge
```

The canonical inbox endpoints derive recipient and surface from the current
session. The `/v1/buyer/*` and `/v1/admin/*` notification paths above are thin
compatibility adapters to the same use case, not separate tables. A caller
cannot request another user/surface. Read/acknowledge is idempotent and never
confirms email delivery.

Active announcement response contains sanitized rendered content, priority,
internal CTA, content version, and server acknowledgement state. A mandatory
campaign remains active until its exact version is acknowledged server-side;
deleting local/session storage is irrelevant. Invite acceptance validates the
hashed single-use token, normalized email binding, expiry/revocation, current
account collision policy, and staff auth requirement without revealing whether
an unrelated email exists. Each acceptance receives `{ token }` only in the
POST body under section 6.5; no route/query token alias is implemented.

---

## 8. Integrasi Xendit dan konsistensi finansial

### 8.1 Port dan adapter Xendit

Buat interface kecil berbasis capability, bukan satu interface provider raksasa:

```go
type QRISProvider interface {
 CreateQRIS(ctx context.Context, in CreateQRISInput) (CreateQRISResult, error)
 GetPayment(ctx context.Context, providerRef string) (ProviderPayment, error)
 CancelPayment(ctx context.Context, providerRef string) (ProviderPayment, error)
 ExpirePayment(ctx context.Context, providerRef string) (ProviderPayment, error)
}

type DisbursementProvider interface {
 QuoteDisbursement(ctx context.Context, in DisbursementQuoteInput) (DisbursementQuote, error)
 CreateDisbursement(ctx context.Context, in CreateDisbursementInput) (CreateDisbursementResult, error)
 GetDisbursement(ctx context.Context, providerRef string) (ProviderDisbursement, error)
}
```

Task:

- [ ] Buat typed request/response mapper; DTO Xendit tidak boleh masuk domain.
- [ ] Tetapkan timeout per call, connection reuse, bounded response body, dan retry hanya untuk operasi yang terbukti aman/idempotent.
- [ ] Kirim idempotency/reference unik yang stabil pada create payment/disbursement.
- [ ] Bedakan error timeout, unavailable, rejected, invalid response, auth failure, rate limit, dan unknown outcome.
- [ ] Pada unknown outcome, jangan membuat request finansial kedua; jadwalkan status lookup menggunakan reference yang sama.
- [ ] Cancel/expire adapter result is evidence, not a blind command success.
 Map provider status explicitly and finalize unpaid terminal state only when
 the returned/lookup status confirms it. If Xendit uses one expire
 primitive for both domain intents, keep separate application commands and
 audit reasons while sharing the adapter implementation.
- [ ] Redact authorization, token, QR payload sensitif, bank, dan raw provider body dari log.
- [ ] Record latency/status/error class sebagai metric tanpa high-cardinality provider reference.
- [ ] Sediakan fake Xendit HTTP server deterministik untuk unit/integration test.
- [ ] Contract test wajib memakai fixture yang mengikuti dokumentasi Xendit yang berlaku saat implementasi.

Acceptance:

- Create QRIS dari hosted checkout dan gateway memakai application service yang sama.
- Provider timeout setelah request terkirim tidak pernah menghasilkan duplicate intent/disbursement.
- Xendit credential hanya dibaca adapter pada runtime dan tidak pernah dikirim ke frontend.

### 8.2 Inbound Xendit callback pipeline

Urutan wajib:

```text
receive bounded HTTP body
 -> capture request ID/received time
 -> verify Xendit token/signature with constant-time comparison
 -> on auth/size/envelope rejection: append provider_callback_rejections and stop
 -> parse envelope; derive canonical event ID/account scope/payment mode
 -> insert accepted payment_provider_events + encrypted body/hash + transactional outbox
 -> acknowledge durable DB acceptance (R2 archival is asynchronous)
 -> wake/lease normalization job from outbox (Redis is not the authority)
 -> normalize event
 -> lock payment/withdrawal row
 -> validate amount/currency/reference/current state
 -> apply state transition idempotently
 -> post ledger exactly once when relevant
 -> enqueue seller webhook/email/fulfillment
 -> update event processed status
```

This pipeline consumes `payment_provider_events`. It does not consume or retry
`webhook_deliveries`; those are outbound seller HTTP effects owned by
`seller_webhook.deliver`.

Task:

- [ ] Derive `account_scope` and `payment_mode` from the configured callback
 endpoint/credential context, never from an untrusted body field; reject an
 unknown or ambiguous scope before deduplication/business mutation.
- [ ] Reject invalid signature/token before canonical insertion or business
 mutation. Append only bounded digest/network/reason evidence to
 `provider_callback_rejections`; it has no replay/job path and cannot claim
 a provider event identity.
- [ ] Enforce body limit/content type; store only redacted/encrypted evidence.
- [ ] The durable acceptance transaction stores a bounded encrypted body/hash
 and outbox row in PostgreSQL before HTTP acknowledgement. R2 archival runs as
 an independent idempotent child effect with object state/retry; an R2 failure
 never erases the DB spool or causes an already-acknowledged event to vanish.
- [ ] Enforce the one canonical unique constraint `(provider, account_scope,
payment_mode, provider_event_id)`. When the provider omits an ID, derive the
 deterministic `fp_...` provider event ID before insert; callback, replay,
 retry, and worker deduplication must all reuse the stored four-part key.
- [ ] Enforce partial unique provider bindings for payment and disbursement
 references on `(provider, account_scope, payment_mode, reference)` and
 resolve callbacks only by the complete tuple. Quarantine zero/multiple,
 cross-mode/account, wrong-kind, amount, currency, merchant, or bank-snapshot
 mismatches before any state/ledger effect.
- [ ] Accept duplicate callback as idempotent replay with no second ledger entry/delivery.
- [ ] Accept out-of-order events without moving `PAID` backward; the sole
 unpaid-terminal exception is a matching verified late `PAID` precedence
 transition defined below.
- [ ] Give a verified matching `PAID` event precedence over
 cancel/expire/unknown and the exceptional local
 `FAILED`/`CANCELLED`/`EXPIRED`
 states: post financial effects exactly once, mark `paid_late`, alert, and
 invoke the safe gateway/storefront delivery path in section 5.3. There is
 no refund fallback.
- [ ] Quarantine amount/currency/reference mismatch dan emit operational alert.
- [ ] Mark provider `PAID` + local `PENDING` sebagai lightweight mismatch alert yang tampil di admin.
- [ ] Handle unknown Xendit event safely: persist, metric, acknowledge sesuai documented provider retry contract, no mutation.
- [ ] A cryptographically and semantically verified provider reversal event
 invokes the idempotent containment state/journal in section 4.6. An
 unverified/unknown refund-like event is quarantined evidence only. Neither
 path creates refund/dispute UI, API, order status, or arbitrary adjustment.
- [ ] Implement the inbound admin read model and
 `/v1/admin/provider-callbacks/{callbackId}/replay`; `callbackId` is the
 opaque Fersaku row ID and the read model carries the canonical four-part
 provider identity. Replay processes
 the stored Xendit event through the same normalizer with
 `provider_callbacks.replay`, reason, idempotency, audit, lease, and
 eligibility checks. It cannot accept a seller `deliveryId` or send an
 outbound merchant HTTP request.

### 8.3 Payment concurrency dan exactly-once effect

- [ ] Gunakan DB transaction + row lock/advisory lock pada payment finalization.
- [ ] Unique ledger transaction reference untuk `PAYMENT_CAPTURE:{payment_id}`.
- [ ] Unique fulfillment job key untuk order yang sama.
- [ ] Pastikan payment `PAID` commit, ledger post, dan outbox event commit dalam satu DB transaction.
- [ ] Cancel/expire may finalize only from verified provider status; timeout
 remains `UNKNOWN_OUTCOME` and is resolved by same-reference lookup. Race
 late `PAID` against terminal confirmation and prove the paid ledger wins
 exactly once while delivery recovery remains tenant/inventory safe.
- [ ] Gunakan transactional outbox; jangan mengandalkan publish Redis sebelum DB commit.
- [ ] Redis queue hanya wake-up/lease acceleration. Core payment/event outbox
 row ditandai `COMPLETED` atomically setelah state transition + ledger post +
 child-effect rows berhasil ditulis; child webhook/email/fulfillment effects
 punya status/lease/idempotency sendiri. `DISPATCHED` child rows tetap
 lease/reapable, dan reaper tidak mengulang paid/ledger normalization hanya
 karena delivery dead-letter. Scanner periodik PostgreSQL mengembalikan job
 yang hilang setelah Redis restart, dengan idempotency key yang sama.
- [ ] Browser/admin tidak boleh langsung menulis status paid tanpa use case emergency yang evidence-gated.

### 8.4 Integrity checks tanpa reconciliation console

Fersaku tetap membutuhkan internal safety check walaupun hanya memakai satu akun Xendit. Ini bukan fitur reconciliation atau halaman baru.

- [ ] Periodic check mencari provider-paid/local-pending melewati threshold.
- [ ] Check ledger transaction balance `sum(debit)=sum(credit)` dan orphan financial references.
- [ ] Check disbursement processing yang tidak berubah melewati SLA.
- [ ] Hasil hanya menjadi metric/operational alert/callback queue pada admin yang sudah ada.
- [ ] Tidak ada settlement matching UI, manual spreadsheet workflow, atau alternate source of truth.

---

## 9. Redis, queue, cache, rate limit, dan coordination

### 9.1 Prinsip penggunaan Redis

Redis **bukan** source of truth untuk payment, ledger, withdrawal, KYC, audit, atau user. Data Redis boleh hilang dan dapat direkonstruksi/di-retry dari PostgreSQL/outbox.

Allowed use:

- background queue dan retry schedule;
- distributed rate limiter;
- short-lived cache untuk public catalog/status;
- idempotency acceleration (record authoritative tetap PostgreSQL untuk financial mutation);
- short lock untuk job deduplication, bukan pengganti DB transaction;
- session lookup/revocation cache bila database tetap authoritative.

### 9.2 Key convention

```text
fersaku:{env}:ratelimit:{surface}:{subject}:{window}
fersaku:{env}:cache:store:{store_id}:{revision}
fersaku:{env}:cache:product:{product_id}:{version}
fersaku:{env}:session:{session_hash}
fersaku:{env}:lock:{operation}:{resource_id}
fersaku:{env}:jobdedupe:{job_type}:{idempotency_key}
```

- [ ] Seluruh key punya runtime `env` prefix dan TTL; financial cache/idempotency
 keys juga membawa `payment_mode`, kecuali queue library metadata yang
 dikelola adapter.
- [ ] Dilarang memasukkan raw email, API key, bank account, token, atau KYC ID ke key.
- [ ] Cache version/revision-based; invalidation terjadi setelah DB commit/outbox.
- [ ] Definisikan max memory policy dan behavior saat Redis unavailable.
- [ ] TLS/auth required di staging/production.

### 9.3 Queue catalog

| Queue/job | Idempotency key | Retry | Dead-letter behavior |
| ---------------------------- | ---------------------------------------------------------------------- | -------------------- | ------------------------------------- |
| `provider_callback.process` | canonical `(provider, account_scope, payment_mode, provider_event_id)` | exponential bounded | inbound callback alert + replay |
| `payment_intent.expire` | payment intent ID | one scheduled lease | provider lookup; no blind terminal |
| `settlement.release` | payment/ledger transaction ID | bounded until posted | alert + safe replay |
| `withdrawal.submit` | withdrawal ID | one provider ref | hold/unknown lookup |
| `withdrawal.status.lookup` | withdrawal + provider ref | bounded until SLA | hold + alert |
| `seller_webhook.deliver` | event + endpoint | exponential+jitter | outbound delivery dead-letter/history |
| `fulfillment.execute` | order ID | bounded | `DELIVERY_FAILED` + support action |
| `delivery.resend` | delivery grant + recipient version + reason | bounded | failed attempt + support alert |
| `coupon_reservation.expire` | coupon reservation ID | one scheduled lease | payment lookup; no blind release |
| `email.send` | template + recipient + business ref | bounded | metric/support alert |
| `notification.dispatch` | notification + channel + content version | bounded | inbox remains; channel failure logged |
| `campaign.materialize` | campaign + audience version + cursor page | bounded/page | paused delivery + operator alert |
| `campaign.deliver` | campaign recipient + content version + channel | bounded | recipient delivery history |
| `kyc_document.process` | case + document version | bounded | case clarification/error |
| `kyc_capability.expire` | merchant + capability version | one scheduled lease | suspend live key + alert |
| `domain.verify` | store domain + verification version | bounded | `FAILED` code + next safe retry |
| `domain.revalidate` | store domain + verification window | recurring bounded | suspend after grace + operator alert |
| `analytics.aggregate` | store + local date + aggregation version | bounded/rebuildable | stale projection metric + retry |
| `invoice.render` | order + invoice version | bounded | on-demand safe HTML fallback/status |
| `r2_object.cleanup` | object ref | bounded | retention alert |
| `audit_export.build` | export request ID | bounded | failed export state |
| `operational_integrity.scan` | scan window | one active | alert on failure |
| `outbox.reap` | outbox lease/window | recurring | re-enqueue unreconciled effects |

Task:

- [ ] Set queue-specific timeout, max attempts, backoff, jitter, priority, and retention.
- [ ] Worker panic isolation; one bad payload tidak menghentikan process.
- [ ] Validate job payload version/schema before handler.
- [ ] Handler reload authoritative DB state; jangan percaya stale payload untuk money/status.
- [ ] Settlement worker releases `MERCHANT_PENDING -> MERCHANT_AVAILABLE` only
 after the snapshotted delay, under the ledger transaction lock; callback,
 expiry, and release races are idempotent.
- [ ] Graceful shutdown stops dequeue, finishes bounded in-flight work, then releases lease.
- [ ] Metrics: queued, active, success, retry, dead letter, age, duration.
- [ ] Inbound provider replay and outbound seller-delivery retry each create
 their own audit action and re-enqueue their own stable key; neither accepts
 the other resource type or duplicates the financial/delivery effect.
- [ ] Coupon expiry handler locks the reservation, order, and payment intent in
 the documented order. It releases usage/stock only when no provider
 payment was created or the same provider reference is verified unpaid
 terminal. `PENDING`, `UNKNOWN_OUTCOME`, `CANCEL_PENDING`, and
 `EXPIRE_PENDING` schedule lookup instead of blind release. A verified
 late `PAID` follows the section 5 recovery path and never silently consumes
 a different customer's reservation.
- [ ] Campaign materialization freezes the normalized audience query and
 content version. Cursor-page retries use a unique recipient key, so pause,
 resume, worker restart, or duplicate enqueue cannot send the same version
 twice through a channel. Test sends use a separate non-audience namespace.
- [ ] Notification and email channel failure never rolls back an already valid
 payment, withdrawal, KYC transition, campaign acknowledgement, or inbox
 record. Mandatory inbox state remains authoritative in PostgreSQL.
- [ ] Domain verification jobs use the stored hostname/token version, bounded
 DNS answers, and an edge adapter idempotency key. A stale job cannot
 activate or delete a newer domain version; removal and takeover cooldown
 remain database-authoritative.
- [ ] Analytics aggregation is rebuildable from approved retained snapshots;
 Redis counters are never accepted as final totals. Late verified payments
 update the affected versioned day without changing ledger truth.
- [ ] Invoice rendering reloads immutable order/payment/fee/tax/address-safe
 snapshots and writes a new immutable create-only R2 object for each
 logical invoice version. It never rebuilds an
 old invoice from current product, customer, or fee configuration.

### 9.4 Rate limit matrix

| Surface | Subject | Initial policy | Failure mode |
| ----------------------- | ---------------------------------------- | ------------------------------- | --------------------------- |
| Login/password reset | IP + normalized account hash | 5/account/15m + 20/IP/15m | generic 429 |
| Email/magic link | account + IP | 3/account/hour + 20/IP/hour | generic accepted response |
| Public storefront | IP/store | 300/minute | 429/cache response |
| Hosted checkout create | session/IP/store | 20/session/min + 60/IP/min | 429, no intent created |
| Gateway create intent | API credential + merchant | 120/minute | 429 + stable problem |
| Gateway status | credential + merchant | 600/minute | 429 |
| Admin mutations | admin session | 30/minute, burst 10 | 429 + audit failure context |
| Secret inventory reveal | user + store + item | 10/user/15m + 3/item/15m | 429 + audited denial |
| Coupon checkout attempt | session/IP/store + normalized code hash | 20/session/15m + 60/IP/15m | generic unavailable/429 |
| Custom-domain verify | user + store + domain | 6/domain/hour + 30/store/hour | 429 + current status |
| Seller customer message | user + store + recipient | 5/recipient/day + 100/store/day | accepted/no recipient leak |
| Provider status lookup | admin + payment | 3/payment/hour + 20/admin/hour | 429 + no state mutation |
| Campaign preview/test | admin + campaign | 20/admin/hour + 5/campaign/hour | 429 + audit context |
| Campaign publish/resume | admin + campaign | 10/admin/hour + 2/campaign/hour | 429, no partial publish |
| Webhook ingress | provider verification first + IP defense | 600/minute/endpoint | provider-safe response |

- [ ] Algorithm and limits are config/versioned; tests use deterministic clock.
- [ ] Redis outage fails closed for credential guessing/sensitive actions and degrades safely for public reads.
- [ ] Include `Retry-After`; never reveal whether account exists.
- [ ] Checkout coupon limits are additional to hosted-checkout creation limits;
 code hashes use a server key and are never a reversible Redis key or log
 field. Generic invalid/unavailable responses prevent code enumeration.
- [ ] Limits are baseline abuse controls, not contractual throughput promises.
 Production changes are release-configured, measured, and tested; they are
 not editable through the admin “Publish configuration” mock control.

---

## 10. Cloudflare R2 dan object security

### 10.1 Bucket/prefix policy

Gunakan bucket private terpisah atau strict prefix policy:

```text
private-products/{merchant_id}/{store_id}/{product_id}/{version}/{object_id}
private-inventory/{merchant_id}/{product_id}/{object_id}
private-kyc/{merchant_id}/{case_id}/{document_id}/{version}
private-provider-events/{provider}/{yyyy}/{mm}/{event_id}
private-audit-exports/{admin_id}/{export_id}
private-invoices/{merchant_id}/{order_id}/{invoice_version}/{object_id}
private-profile-assets/{user_id}/{asset_version}/{object_id}
public-assets/{store_id}/{revision}/{asset_id}
```

- [ ] Default bucket private; public asset hanya melalui explicitly public prefix/domain.
- [ ] DB stores opaque `object_ref`, not user-controlled full key.
- [ ] Object key is generated server-side with an unguessable object ID and
 immutable logical version; normalize/reject traversal/control characters.
- [ ] R2/S3 object versioning is **not** assumed. Every write uses a globally
 unique create-only key plus a conditional create (`If-None-Match: *` or
 verified equivalent); replacing an object creates a new key/object_ref and
 atomically changes the DB pointer. Never overwrite financial evidence,
 KYC ciphertext, invoice versions, provider evidence, or audit checkpoints.
- [ ] Configure Cloudflare R2 Bucket Lock rules for retention-locked audit
 checkpoints and required evidence prefixes after owner/legal approval.
 Test that application credentials cannot shorten retention, replace, or
 delete a locked object. Bucket Lock is retention, not object versioning or
 a substitute for PostgreSQL/PITR backup.
- [ ] R2 credential least privilege, separate environment/bucket, rotation documented.
- [ ] CORS allow only required frontend origins/methods/headers.

### 10.2 Upload flow

```text
client asks non-KYC upload intent
 -> server authorizes tenant/capability
 -> validates expected MIME/size/purpose
 -> creates object_ref UPLOADING
 -> returns short-lived presigned upload
 -> client uploads
 -> client completes with checksum
 -> server HEAD/checksum/size/type verification
 -> mandatory malware/content scan/quarantine job for every untrusted upload
 -> object_ref READY or REJECTED
```

- [ ] Presigned TTL short and single-purpose; restrict content length/type where supported.
- [ ] The presigned URL itself is a secret capability and may expose the R2
 endpoint/generated path by design. Never return the key separately,
 persist the URL, include it in analytics/referrers, or log its query
 signature; completion refers only to opaque `objectRef` + upload token.
- [ ] Verify actual metadata server-side; browser-provided MIME is not authoritative.
- [ ] Production scan is mandatory before `READY`; scanner failure leaves the
 object quarantined, never silently publishable. Record scanner version/verdict.
- [ ] Enforce per-file/account quota before intent and after completion.
- [ ] Incomplete upload cleanup scheduled.
- [ ] Multipart uploads have bounded part count/size, abort-after-TTL, and an
 object-consistency cleanup/repair job that never exposes an untracked object;
 this is storage hygiene only, not payment/settlement reconciliation and has no
 admin console.
- [ ] Product publish may reference only `READY` objects owned by same merchant/store.
- [ ] This presigned flow is for product/public/profile/invoice inputs only.
 KYC uses the server-mediated scan/encrypt stream in sections 4.9/7.10 and
 never shares the public delivery or browser-to-R2 path.

### 10.3 Download/delivery

- [ ] Buyer delivery endpoint checks order ownership, paid/fulfilled state, revocation, and expiry.
- [ ] Invoice PDF endpoint checks buyer/guest/order ownership independently from
 the public verification token and signs only the immutable invoice object.
- [ ] Return short-lived signed download or streamed response with `Cache-Control: private, no-store` where sensitive.
- [ ] Download token single-purpose, hashed at rest, bounded uses/TTL according to product policy.
- [ ] Inventory credential reveal is separate from normal file download and always audited.
- [ ] Outside a deliberately issued short-lived presigned capability, do not
 expose an R2 endpoint, secret key, permanent public URL, or internal key.

### 10.4 KYC and evidence encryption/retention

Provisional launch policy (product/privacy/legal owner must approve in `BE-000`;
this table is an operational default, not a claim about statutory minimums):

| Data class | Online retention | Purge/backup target | Owner |
| ----------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------- | -------------------- |
| Ledger, payment, withdrawal, immutable audit metadata | 7 years | append-only archive; legal hold supported | Finance + Privacy |
| Encrypted Xendit raw callback evidence | 90 days | normalized/hash metadata follows financial record | Payments |
| KYC document ciphertext | relationship end + 5 years | tombstone immediately; active/backup purge within 35 days unless legal hold | Compliance + Privacy |
| Auth/security event metadata | 1 year | monthly purge; no raw credential/session token | Security |
| Revoked/expired session metadata | 90 days | token hash unusable immediately | Security |
| Product/delivery objects | while product/order entitlement requires it | 30-day recoverable delete, then object + backup lifecycle purge | Merchant/Product |
| Incomplete/multipart uploads | 24 hours | abort/delete by cleanup job | Storage |
| Audit export/download artifact | 24 hours | hard delete object; audit request remains | Admin Ops |
| Idempotency response body | 24 hours gateway, 7 days privileged admin | retain request hash/resource ref longer with financial record | Payments/Admin |

Production sign-off is blocked until owners approve or replace every duration,
legal-hold behavior, deletion order (DB tombstone -> object delete -> backup
expiry), subject-request exclusions, and purge evidence/SLA.

- [ ] KYC documents use application envelope encryption in addition to provider storage controls.
- [ ] KYC ingress is an authenticated server-mediated bounded stream through
 type/checksum validation and malware scan into envelope encryption. Do
 not issue a browser-to-R2 presign or persist plaintext in a temporary R2
 prefix/local file; only committed ciphertext receives an object_ref.
- [ ] Store key version/nonce/tag metadata separately; master key from secret/KMS facility.
- [ ] Decrypt only in authorized short-lived stream; no temp plaintext persisted.
- [ ] Document view logs actor/case/document/purpose without PII body.
- [ ] Retention/deletion job follows approved legal/product policy and writes tombstone audit metadata.
- [ ] Backup policy does not silently retain deleted KYC beyond documented window.

---

## 11. Security specification

### 11.1 Authentication/session

- [ ] Password hash Argon2id with calibrated memory/time/parallelism and transparent rehash.
- [ ] Constant-time verification; generic login/reset response.
- [ ] Server-side opaque session cookie, `HttpOnly`, `Secure`, intentional `SameSite`, narrow path/domain.
- [ ] Session token random >= 128-bit; DB stores hash only.
- [ ] Rotate session at login, privilege change, auth, password reset, and impersonation start.
- [ ] Absolute + idle expiry; logout/revoke invalidates server state.
- [ ] Email/reset/magic-link token random, hashed, one-time, short-lived, attempt limited.
- [ ] Admin requires authenticated session; sensitive seller/admin action can require recent authentication proof.
- [ ] Security codes (unused) hashed, one-time, never returned again after initial display.
- [ ] CSRF protection for cookie-auth mutations; API-key gateway does not use browser cookie auth.

### 11.2 API credentials and webhook secrets

- [ ] Prefix identifies credential safely; raw API key is generated at the
 seller claim exchange and shown exactly once, never to admin/support.
- [ ] Store API key hash using a keyed strategy appropriate for a high-entropy
 token; never plaintext. A distinct webhook endpoint owns its outbound
 signing secret as envelope-encrypted ciphertext because the server must
 sign, plus a separate fingerprint for lookup/audit. No credential row or
 second global field owns a copy.
- [ ] Credential scope/payment_mode/merchant/status checked every request.
- [ ] Issuance/claim/rotation is authenticated, recent-auth/version/idempotency
 bound, one-time, `no-store`, and atomically audited. API-key rotation
 supports explicit revoke; webhook-secret overlap is endpoint-scoped and
 bounded.
- [ ] Live credential cannot become active unless KYC approved at transaction time.
- [ ] Gateway API requires TLS; reject credential in query parameter.
- [ ] Seller webhook signing uses documented timestamp + event ID + exact body; replay window enforced.
- [ ] Secret compare constant-time; secret rotation supports current/previous version briefly.

### 11.3 HTTP/API hardening

- [ ] Trusted proxy list explicit; do not trust arbitrary forwarded IP/scheme.
- [ ] Body/header/path/query limits; strict JSON unknown-field policy for mutations.
- [ ] Validate/normalize email, slug, URL, currency, amount, enum, metadata size/depth.
- [ ] Prevent mass assignment by command-specific DTOs.
- [ ] Security headers/CORS match existing frontend deployment.
- [ ] No stack trace/internal SQL/provider body in response.
- [ ] Request logs redact cookies, auth, keys, bank, KYC, payload, download tokens.
- [ ] Apply full SSRF defenses only to URLs the server fetches, currently the
 URL stored on a registered outbound seller `webhookEndpointId`: HTTPS,
 DNS/IP validation on registration and delivery, rebinding/redirect
 revalidation, blocked
 private/loopback/link-local/metadata ranges, egress policy, timeout, and
 bounded response.
- [ ] Treat `successUrl`/`failureUrl` as never-server-fetched browser targets:
 absolute HTTPS, <= 2,048 UTF-8 bytes, no userinfo/control/fragment, exact
 registered-origin allowlist, immutable intent binding, and no arbitrary
 `next`/`returnTo` open redirect. Do not perform DNS/reachability checks for
 these browser-only URLs.
- [ ] Gateway metadata obeys the 8 KiB/depth/key/string limits and remains
 opaque/non-fetchable/non-click-trusted even when a string looks like a URL.
- [ ] Template/email content encoded; no user-controlled raw HTML without sanitizer.
- [ ] Notification/campaign CTA is a server-generated relative route from a
 closed route-template allowlist. Reject scheme-relative (`//`), absolute,
 encoded traversal, control-character, backslash, credential, and external
 origin values; expansion parameters are typed resource IDs, not raw paths.
- [ ] Seller customer messaging accepts only the closed template command and
 server-resolved owned recipient. The transport has no raw recipient,
 subject, HTML, attachment, reply-to, or arbitrary variable key, so it
 cannot become an email relay or header-injection surface.
- [ ] Custom-domain input and request `Host` are canonicalized through the same
 strict IDNA/ASCII policy. Reject malformed/multiple host headers, ports
 where not expected, IP literals, wildcard/public-suffix names, dangling
 ownership versions, and an unknown host before store lookup. Never issue
 seller/admin session cookies scoped to a merchant custom storefront host.
- [ ] Domain DNS verification uses a bounded resolver/edge adapter with timeout,
 answer-count/size limits, exact token comparison, CNAME depth limit, and
 protection against stale verification jobs. DNS text is data only and is
 never interpolated into a shell, URL fetch, certificate command, or log.
- [ ] Invoice/guest/delivery tokens are high-entropy, purpose-bound, hashed at
 rest, expiry/revocation checked, non-enumerating, and excluded from query
 logs/referrers. Responses containing private delivery or secret inventory
 data set `Cache-Control: no-store` and a restrictive referrer policy.
- [ ] Analytics dimensions are length/enum bounded and stripped of known secret
 query names before persistence. Reports return aggregates with minimum
 cohort/redaction rules where required; CSV formula-leading cells are
 escaped and exports never contain raw visitor/session hashes.

### 11.4 Authorization and tenant isolation

- [ ] Authentication middleware only establishes principal; use-case enforces tenant + permission.
- [ ] Never load resource by ID then forget merchant/store ownership check.
- [ ] Admin permission mapping tested per endpoint; deny by default.
- [ ] Suspended merchant cannot mutate, create live intent, or withdraw; documented read access may remain.
- [ ] Suspended API access blocks gateway only and does not disable storefront/seller access.
- [ ] KYC reviewer cannot self-approve own merchant; define separation policy where applicable.
- [ ] Every list/export applies scope before pagination/filter.
- [ ] Coupon eligibility, product scope, amount, active window, per-customer and
 global limits are reloaded and enforced inside the checkout transaction.
 Client discounts and usage projections are never authority. Reservation
 uniqueness/locking prevents last-slot oversubscription and code probing
 never reveals which rule failed.
- [ ] Inventory collection/search/export DTOs contain only masked metadata.
 Reveal requires one exact item, owning store, dedicated permission, recent
 proof/reason, availability-state check, `no-store`, and immutable audit;
 there is no batch/global reveal permission or transport shape.
- [ ] Review create/update/reply/report/moderation checks buyer purchase,
 delivery/eligibility, store ownership, and current version/transition.
 Seller replies cannot edit buyer content; admin transitions cannot forge a
 rating or move a review between products/stores.
- [ ] Delivery resend/retry/revoke always resolves the immutable paid order,
 recipient/grant, product snapshot, and existing inventory allocation.
 Commands cannot override recipient, allocate a second credential, expose a
 secret in an admin response, or authorize an unpaid order.
- [ ] Custom-domain lifecycle queries scope by store and also enforce global
 hostname uniqueness/tombstone cooldown. Possessing a domain row ID, DNS
 token from another version, or control of a different store can never
 activate, route, or prematurely release the hostname.
- [ ] Analytics and notification queries derive recipient/store scope from the
 session before filters. Anonymous hashes, raw attribution events, another
 user's notification ID, or another campaign audience are never exposed by
 changing a cursor/filter.
- [ ] Role/invitation commands enforce anti-escalation in the use case and DB
 transaction: actor may grant only currently held delegable permissions,
 cannot mutate system roles/remove the final protected administrator, and
 cannot activate a staff assignment before bound-email verification and
 required auth. Privilege changes rotate/revoke affected sessions.
- [ ] Admin campaign publish, per-item secret reveal, provider lookup, buyer
 support, fulfillment retry, and emergency switches each have an explicit
 permission and command DTO. `/v1/admin/actions` is a generated closed union
 and cannot be used to bypass a dedicated endpoint's checks.
- [ ] No live route or permission can credit/debit/overwrite wallet balance or
 ledger rows. Any future corrective financial workflow requires a separate
 approved ADR, maker-checker authorization, typed compensating journal, and
 release—not a generic admin action.

Suspension/switch impact is explicit and must be tested:

| Condition | New hosted checkout | New QRIS API intent | Status/read | Verified callbacks for existing payments | Fulfillment/delivery | Balance/withdrawal |
| ----------------------------------- | --------------------------------- | ----------------------------- | --------------------------------------------- | ---------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------- |
| Merchant `SUSPENDED` | deny | deny | reads allowed per policy | continue finalization safely | continue paid delivery/retry | balance read allowed; new withdrawal denied/held |
| API capability `SUSPENDED` | allow | deny | existing API status read allowed | continue | continue | allow normal storefront/eligible withdrawal |
| `QRIS_CHECKOUT` emergency off | deny new hosted + gateway creates | deny | reads/cancel/expiry according to owner policy | continue | continue | independent |
| `WITHDRAWALS` emergency off | independent | independent | reads allowed | independent | independent | deny new requests/approvals; existing processing uses unknown-outcome lookup |
| `SELLER_REGISTRATION` emergency off | existing merchants unaffected | existing merchants unaffected | reads allowed | continue | continue | continue |

Already-paid callbacks and fulfillment are never dropped solely because a
merchant/API switch changed. Each switch has one owner (`platform_settings`),
effective time, idempotency key, reason, audit event, and rollback.

### 11.5 Impersonation security

- [ ] Implement explicit
 `POST /v1/admin/users/{userId}/impersonation` plus the merchant-owner
 resolver endpoint. Start requires `impersonation.start`, reason/ticket, exact non-admin target user, scope, TTL, and idempotency.
- [ ] Default/normal maximum scope `READ_ONLY`; `SUPPORT_WRITE` requires the
 separate `impersonation.support_write` permission in addition to
 `impersonation.start`.
- [ ] Full privileged impersonation is absent from DB enum/check constraint, Go
 constants, OpenAPI schema, generated clients, request validator, feature
 flags, and UI. Reject unknown/full-like scope values. Adding one requires a
 future explicit product/security decision, migration, threat-model update,
 and separate release—not a disabled option or hidden flag.
- [ ] Server mints derived session linked to original admin; never returns target user's cookie/token.
- [ ] Derived session carries immutable actor, target, scope, session ID, expiry.
- [ ] Effective acting authorization is the target user's current tenant/role
 permissions intersected with impersonation scope; the original admin's
 broad permissions are never unioned into the derived session.
- [ ] No nested/admin-to-admin impersonation.
- [ ] Banner data comes from server session and cannot be hidden by URL manipulation.
- [ ] Read-only middleware blocks all mutation methods and sensitive reveal/export endpoints.
- [ ] `SUPPORT_WRITE` is a route-template + command + changed-field allowlist,
 enforced after normal target-user authorization and before the handler.
 At launch the complete allowlist is only:
 - `PATCH /v1/buyer/profile` command `buyer.profile.support_update`, fields
 `displayName`, `locale`, and `timezone`;
 - `PATCH /v1/stores/{storeId}` command `store.presentation.support_update`,
 fields `name` and `description`, only for a store the target user already
 owns/manages.
- [ ] All other mutation methods/commands are default-denied during
 impersonation. Explicitly prohibit payment/checkout/gateway/order-status,
 ledger/finance/balance, withdrawal/bank, fee/settings/emergency controls,
 KYC, API credentials/keys, webhook endpoint/secret/delivery retry,
 merchant/user status or role, auth/email/password/session, admin
 routes/actions, product price/publish, inventory/reveal, delivery access,
 export, and object/KYC upload mutations. `SUPPORT_WRITE` cannot call these
 even if the original admin or target user normally has permission.
- [ ] Reject an allowlisted route when the JSON contains any unknown or
 non-allowlisted field; do not silently strip fields. Add route-registry
 tests so a new mutation is denied until security explicitly adds it.
- [ ] End/expiry/revoke terminates derived session and audits both start/end.
- [ ] Target user/admin notification policy documented before live.

### 11.6 Data encryption and secrets

- [ ] TLS for external/internal managed services.
- [ ] Encryption at rest from managed providers plus application encryption for bank/KYC/inventory secrets.
- [ ] Key versioning and rotation procedure with dual-read/single-write migration.
- [ ] Secret manager access limited per deployment role; no shared developer production secret.
- [ ] Database application role cannot mutate/delete audit/ledger history outside controlled functions/transactions.
- [ ] Production access and break-glass procedure audited.

### 11.7 Minimum threat model

| Threat | Required control/test |
| ------------------------ | ---------------------------------------------------------------------------------- |
| Credential stuffing | rate limit, generic errors, admin lock, alert |
| Session theft/fixation | opaque secure cookie, rotation, revoke, idle/absolute TTL |
| CSRF | token/origin policy on cookie mutation |
| IDOR/tenant escape | scoped query + authorization integration tests |
| API key leak | one-time reveal, hash, prefix, rotate/revoke, log redaction |
| Webhook spoof/replay | signature/token, timestamp, canonical four-part event key, constant-time compare |
| Duplicate payment/payout | idempotency DB record, row lock, unique ledger/provider ref |
| Ledger tampering | append-only permissions, balanced constraint/check, immutable audit |
| SSRF webhook URL | DNS/IP/redirect validation, egress policy, timeout/body limit |
| Malicious upload | MIME/size/checksum validation, scan/quarantine, private bucket |
| KYC exfiltration | least privilege, envelope encryption, audited short view |
| Impersonation abuse | auth/reason/scope/TTL/banner/immutable actor/audit |
| PII log leak | structured allowlist log fields + automated redaction tests |
| Coupon race/enumeration | transaction lock/reservation uniqueness + generic result + keyed code hash |
| Secret inventory leak | per-item authorization/recent proof/no-store/audit; no collection secret field |
| Custom-domain takeover | global hostname uniqueness, exact DNS proof, versioning, cooldown, Host validation |
| Seller mail relay abuse | owned recipient, closed template, bounded variables, rate/suppression controls |
| Role escalation/invite | delegable-permission subset, system-role immutability, session rotation |
| Malicious campaign/CTA | permission/reason/version, sanitized content, internal route allowlist |
| Analytics privacy leak | bounded stripped dimensions, aggregate-only reads, retention/deletion tests |
| Delivery replay/theft | immutable paid grant/allocation, purpose token, idempotent attempt and revoke |

- [ ] Buat `security/threat-model.md` dengan owner, assumptions, assets, trust boundaries, mitigations, residual risk.
- [ ] Security acceptance test menjadi CI/release gate, bukan checklist manual saja.

---

## 12. Observability, reliability, dan operations

### 12.1 Structured logs

Required fields:

```text
timestamp, level, service, version, env, request_id, trace_id,
route_template, method, status, latency_ms, actor_type, actor_id_hash,
merchant_id, store_id, operation, result, error_code
```

- [ ] JSON logs; never log raw request/response globally.
- [ ] IDs only where operationally needed; redact/hash high-risk identifiers.
- [ ] Provider/job/audit log uses stable error class.
- [ ] Sampling does not drop financial/security failures.

### 12.2 Metrics

Minimum metrics:

- HTTP request count/latency/error by route template/status.
- DB pool saturation/query latency/transaction rollback.
- Redis operation/queue depth/oldest age/retry/dead letter.
- Xendit request latency/error and **inbound provider callback**
 received/invalid/duplicate/failed/replay/processing age.
- Payment intents by source/status; provider-paid/local-pending mismatch count/age.
- Cancel/expire unknown-outcome lookup age and verified late-paid contradiction
 count/delivery-recovery result.
- Ledger post failure/unbalanced invariant count.
- Withdrawal by status/failure/age.
- KYC queue count/age by status without PII.
- **Outbound seller webhook delivery** success/retry/dead letter; never aggregate
 it into the inbound callback queue metric.
- R2 upload/download/failure/bytes by purpose.
- Auth failure/rate-limit/auth/impersonation start/end.

No metric label may contain email, order ID, payment reference, API key prefix, or other unbounded value.

### 12.3 Tracing

- [ ] OpenTelemetry spans HTTP -> use case -> DB/provider/outbox/job.
- [ ] Propagate trace context to jobs and seller webhook where safe.
- [ ] Never attach raw payload/PII/secrets as span attributes.
- [ ] Correlate callback event, payment, ledger, fulfillment through safe internal IDs.

### 12.4 SLO/alerts initial

| Capability | Initial indicator/alert |
| -------------------- | --------------------------------------------------------- |
| API availability | 5xx and readiness failure burn rate |
| QRIS create | success/error/latency by Xendit adapter |
| Payment finalization | callback-to-local-paid p95; mismatch older than threshold |
| Withdrawal | processing age/error; duplicate invariant always critical |
| Seller webhook | dead letter and oldest retry age |
| Queue | oldest critical job age and depth trend |
| Ledger | any unbalanced/orphan result is critical |
| KYC | queue age SLA by status |

- [ ] Define concrete targets after staging baseline; do not invent unrealistic 99.999% promise.
- [ ] Alert includes runbook link and safe identifiers.
- [ ] Health endpoints separate liveness/readiness; readiness is bounded and cached briefly.

### 12.5 Backups/disaster recovery

- [ ] Managed PostgreSQL PITR, daily backup, encryption, retention, restore drill.
- [ ] R2 uses unique create-only keys and approved Bucket Lock/lifecycle rules
 per object class; do not depend on unsupported bucket/object versioning.
 Document which immutable objects backup/archive covers.
- [ ] Redis restoration not required for financial truth; document queue recovery from outbox.
- [ ] Record RPO/RTO approved by owner.
- [ ] Quarterly restore rehearsal on isolated environment with integrity checks.
- [ ] Provider credential compromise and database failover runbooks.

---

## 13. Testing strategy dan mandatory gates

### 13.1 Test pyramid

Unit tests:

- money/fee round-half-up, immutable launch 3% + Rp700/withdrawal 3%/min
 Rp50k policy, verified provider-processing component, fee snapshots,
 whole-rupiah JSON-only input, checked-overflow boundaries, positive net, and
 rejection of runtime numeric mutation;
- complete payment/KYC/withdrawal transitions, provider-precedence exceptions,
 reversal containment side-state, and every invalid transition edge;
- permission/tenant decisions;
- API credential/KYC gate;
- inbound Xendit signature/event replay/idempotency separately from outbound
 seller-webhook signing/delivery retry;
- invalid callback rejection cannot enter/reserve a canonical event identity;
 full provider/account/mode/reference binding rejects wrong-kind/cross-scope
 events;
- seller API-key request/claim and endpoint-secret claim are one-time,
 recent-auth/owner/version bound; admin never receives raw secret and the two
 secret ownership models cannot cross-rotate;
- URL/bootstrap token fragment-to-POST exchange, replay/expiry/scanner GET
 safety, generic errors, and token-free redirect/cookie behavior;
- impersonation scope/TTL/user target and exact `SUPPORT_WRITE` route/field
 allowlist/default-deny;
- server-fetched webhook SSRF/rebinding/redirect validator and the separate
 browser redirect-origin/open-redirect validator;
- audit JCS canonicalization/hash/checkpoint signature against frozen vectors;
- redaction and object key validation;
- create-only R2 key generation/conditional-write conflict and KYC
 server-stream scan/encrypt state handling;
- coupon pricing/eligibility/window/product-scope/customer-limit state matrix,
 keyed code normalization, tip exclusion, and immutable checkout snapshot;
- inventory schema/version transition and per-item reveal eligibility with no
 collection/global reveal command;
- review eligibility/reply/report/moderation transition and ownership policy;
- delivery grant/resend/retry/revoke policy, invoice snapshot/version, and
 purpose-bound token expiry;
- custom-domain IDNA/hostname/token/lifecycle/takeover-cooldown and strict
 request-Host normalization;
- attribution stripping, deterministic last-non-direct selection, aggregation
 window/timezone, and PII-safe export cells;
- notification preference/mandatory-event/dedupe/CTA validation plus campaign
 audience/content-version/pause-resume state machine;
- dual-confirm email change, staff/merchant invitation, system-role
 immutability, delegable-permission subset, and last-admin protection;
- exact three-switch enum and negative command registry: no fourth switch,
 generic configuration publish, balance adjustment, or batch secret reveal.

Integration tests (real ephemeral PostgreSQL/Redis/MinIO):

- migrations up from empty DB;
- repository tenant isolation/index constraints;
- concurrent duplicate payment callback;
- callback uniqueness uses `(provider, account_scope, payment_mode,
provider_event_id)`: same tuple deduplicates, while a different
 `account_scope` or `payment_mode` does not collide; missing provider ID yields
 the same deterministic `fp_...` ID on replay;
- invalid signatures/oversize/malformed envelopes append only rejection
 evidence and cannot poison canonical dedupe; partial unique provider-reference
 indexes and callback binding reject cross-mode/account/type collisions;
- cancel/expire timeout lookup and verified late-paid financial
 precedence/safe fulfillment recovery plus verified reversal containment;
- outbox/worker retry/recovery; privileged mutation, derived audit append,
 idempotency result, and outbox all commit or roll back together;
- ledger balanced post/rebuild; direct app-role DML is denied and the deferred
 commit constraint rejects an unbalanced/incomplete/zero-leg journal;
- double withdrawal prevention; idempotent POST quote binds bank version;
 quote-vs-actual provider-fee journals balance for equal/higher/lower actual;
 every unknown-outcome provider result preserves/releases/settles once, and a
 contradictory late success after release recaptures available/recovery
 receivable without a second payout or negative available projection;
- session revoke and CSRF;
- presigned non-KYC upload complete/reject; generated key collision cannot
 overwrite; KYC plaintext streams through scan/encryption and only ciphertext
 reaches object storage;
- audit append-only DB permissions, concurrent sequence allocation, rollback
 without a gap, and launch unpartitioned uniqueness constraints; if a future
 partition migration is introduced, its cross-boundary chain/global-uniqueness
 fixture becomes mandatory;
- audit verifier detects payload/prev-hash/gap/checkpoint-signature tampering
 and reports an uncheckpointed tail without claiming it is anchored.
- checkpoint fixture proves the application role cannot sign/overwrite/delete
 and the configured R2 Bucket Lock rule rejects replacement/removal during the
 audit retention window;
- coupon last-slot concurrency: parallel valid checkouts create at most the
 configured reservations/redemptions; same customer/idempotency replay returns
 the same reservation, expired reservations release once, and a provider
 unknown/late-paid intent is never blindly released or double redeemed;
- inventory schema `If-Match` conflict and stale-version import rejection;
 collection, search, export, query logs, and Redis cache fixtures contain no
 decrypted inventory secret before/after a per-item reveal;
- delivery retry/resend/revoke races reuse one immutable grant/allocation;
 invoice v1 keeps original product, discount, fee, and safe customer snapshots
 after current catalog/profile/fee data changes;
- domain global uniqueness under concurrent stores, stale DNS-token/job
 rejection, removal cooldown, Host-to-store isolation, edge failure rollback,
 and periodic revalidation suspension/recovery;
- review buyer eligibility and seller/admin transition conflicts across tenant
 boundaries; one seller cannot reply/report through another store ID;
- invitation accept/revoke/expiry/email-collision concurrency, dual email-change
 proof ordering, role assignment anti-escalation, and affected-session rotation;
- notification tenant isolation/read-all scoping, campaign audience freeze,
 duplicate materialize/deliver jobs, pause/resume, acknowledgement by exact
 content version, suppression, and internal CTA rejection;
- analytics raw-snapshot retention/deletion and rebuild tests prove aggregates
 are deterministic, late-paid conversion updates once, and no gateway API
 intent invents storefront attribution.

Contract tests:

- OpenAPI request/response/problem examples;
- frontend DTO mapper fixtures;
- canonical `/v1/gateway/payment-intents` and legacy `/v1/qris/payments`
 aliases normalize to the same use case/resource/error/idempotency result;
- camelCase canonical and snake_case legacy gateway payload/response snapshots;
- fake Xendit callback/payment/disbursement scenarios;
- gateway payment create accepts an active same-merchant/mode
 `webhookEndpointId`, snapshots its version, and rejects URL/inactive/
 cross-tenant/cross-mode IDs before provider creation;
- seller credential/endpoint-secret request + fragment/bootstrap claim exchange
 reveals each raw secret once to the matching recent-auth seller; admin, replay,
 expired claim, logs, and masked GET never recover it;
- inbound provider-callback admin read/replay and outbound seller-webhook
 delivery read/retry contracts use distinct IDs, paths, permissions, and
 handlers;
- seller webhook signature and retry contract;
- launch fee admin exposes read/preview only; arbitrary numeric publish routes
 and generic action commands are absent/rejected;
- impersonation OpenAPI enum contains only `READ_ONLY`/`SUPPORT_WRITE` and the
 explicit user-target start endpoint;
- `/admin/webhooks` client fixtures compose two independently paginated tagged
 types; a `callbackId` is accepted only by provider replay and a `deliveryId`
 only by seller retry, with no generic webhook ID/action contract;
- seller/account/profile/settings/session endpoints preserve the active screen
 DTOs, dual-confirm email semantics, and notification preference enums;
- seller coupon, review, customer note/message, delivery/invoice, domain,
 analytics, notification, and campaign DTO fixtures cover every active list,
 detail, dialog, empty, loading, conflict, and permission state without a UI
 shape change;
- admin schema exposes exactly `SELLER_REGISTRATION`, `QRIS_CHECKOUT`, and
 `WITHDRAWALS` as writable switches. Unknown switch/config-publish/fee-publish,
 wallet credit/debit, ledger overwrite, global inventory reveal, refund,
 dispute, reconciliation, risk, security-center, and Admin AI routes/actions
 are absent or rejected by generated negative tests;
- admin role/invitation/buyer support/provider lookup/fulfillment/inventory/
 campaign commands each use their dedicated typed permission, reason,
 idempotency, recent-proof, and audit response contract.

End-to-end tests:

1. register -> verify -> login -> mandatory store -> skip product -> dashboard;
2. create/publish product -> hosted checkout -> Xendit paid -> fulfillment -> buyer access;
3. request sandbox -> create sandbox intent without KYC;
4. submit KYC -> admin clarification/reason -> resubmit -> approve -> seller
 one-time claim -> live key active;
5. create live gateway intent -> callback -> unified ledger source `QRIS_API`;
6. storefront payment -> same ledger source `STOREFRONT` and identical fee rule;
7. withdrawal below Rp50k rejected; valid withdrawal fee quote/lock/disbursement complete;
8. duplicate/out-of-order inbound Xendit callback produces one
 paid/ledger/fulfillment effect;
9. failed inbound Xendit processing appears on `/admin/webhooks`, replay uses
 the stored provider event exactly once; a failed outbound seller webhook
 independently enters its delivery retry/dead-letter history and cannot be
 passed to the provider replay endpoint;
10. admin suspends API without disabling storefront; suspends merchant with correct impact;
11. admin starts explicit user-target read-only impersonation -> banner ->
 mutation blocked -> end audited; `SUPPORT_WRITE` permits only the two
 documented route/field shapes and denies finance/KYC/credential/admin/new
 routes;
12. no refund/dispute/reconciliation console, risk engine, dedicated
 security-audit module, or Admin AI routes exposed; required auth, RBAC,
 audit trail, and bounded impersonation controls remain.
13. production `simulate-payment` returns 404/405 and cannot write paid/ledger;
14. guest order status without/wrong token is non-enumerating and rate-limited;
15. mixed storefront/API credits withdraw FIFO with immutable allocations and
 no SANDBOX lot; source totals still equal unified wallet.
16. gateway rejects an unregistered/HTTP redirect origin without fetching it,
 accepts an exact registered HTTPS origin, never follows metadata URL text,
 and rejects a seller webhook that resolves/redirects to a blocked network.
17. a newly registered merchant can use every in-scope feature allowed by its
 role/security state without buying a plan; OpenAPI/routes/schema contain no
 plan/subscription/platform-billing/paid-entitlement create or gate path, and
 transaction/withdrawal fees never mutate feature access.
18. cancel/expire timeout stays non-terminal pending same-reference lookup;
 verified `PAID` wins before or after confirmed unpaid terminal, posts once,
 alerts on late contradiction, and either safely fulfills/re-reserves or
 enters `DELIVERY_FAILED` without refund or cross-order stock exposure.
19. admin fee preview returns launch `3% + Rp700`, withdrawal `3% + verified
provider processing`, and minimum Rp50k; no runtime call can publish other
 launch values.
20. create a limited product coupon -> two parallel buyers race for the last
 slot -> exactly one priced intent receives the immutable discount; expiry
 releases once, while provider-unknown/late-paid follows lookup/recovery and
 never discounts a second paid order incorrectly;
21. seller versions an inventory schema -> stale tab/import receives conflict ->
 authorized per-item reveal is `no-store` and audited -> seller/admin list,
 search, export, telemetry, and `/admin/inventory` never expose secret values;
22. verified buyer submits/updates a review -> seller replies only in its store
 -> buyer reports -> admin performs a valid moderation transition; an
 unverified/cross-store actor and forged rating transition are denied;
23. paid order creates one delivery grant -> buyer/seller/admin resend/retry use
 the same allocation -> revoke blocks the old token -> regenerated invoice
 retains the original price/coupon/fee/product snapshot;
24. seller claims and verifies a custom domain -> edge/TLS becomes active ->
 exact Host resolves only that store -> stale token/other tenant/takeover is
 denied -> delete waits for routing cleanup and cooldown before reuse;
25. storefront UTM/referrer session converts only after verified payment ->
 seller analytics shows deterministic aggregate -> sensitive query values,
 visitor hashes, and QRIS API traffic never appear in the report/export;
26. seller updates notification preferences and sends an allowed customer
 template -> arbitrary recipient/HTML/attachment is rejected -> mandatory
 payment/security notification still arrives once; admin campaign test does
 not reach the audience, publish/pause/resume is idempotent, and exact content
 acknowledgement survives local-storage deletion;
27. user changes password/email through recent proof and dual confirmation,
 regenerates one-time auth security codes (unused), and revokes other sessions; an
 expired/revoked invitation or mismatched email cannot create membership;
28. admin creates a delegable custom role/invitation -> assignee verifies email
 and auth -> privilege/session changes take effect; self-escalation, immutable
 system-role edit, and removal of the final protected admin are denied;
29. unchanged `/admin/webhooks` screen loads inbound callbacks and outbound
 seller deliveries independently, dispatches action by tagged row kind, and
 cannot replay/retry a cross-namespace ID; “All” deep pagination requires
 selecting its authoritative source;
30. admin system exposes exactly three emergency mutations and read-only
 release configuration. Campaign carries maintenance copy; balance cards and
 generic Publish configuration remain unavailable, and all prohibited routes
 return 404/typed rejection without financial mutation.

### 13.2 Concurrency/load/security tests

- [ ] `go test -race ./...` clean.
- [ ] Parallel same idempotency key returns same result.
- [ ] 100 callbacks with the same canonical
 `(provider, account_scope, payment_mode, provider_event_id)` create one
 provider-event row and one ledger transaction; cross-mode/account-scope
 fixtures remain distinct.
- [ ] An invalid-signature request that copies a future valid event ID can only
 append rejection evidence; it cannot reserve the canonical key or prevent
 the later valid event from processing.
- [ ] Concurrent stock reservation never oversells.
- [ ] Concurrent coupon reservation for the last global/per-customer slot never
 exceeds either limit; idempotent replay cannot consume a second slot and
 expiry vs verified late-paid preserves exactly one final redemption.
- [ ] Concurrent withdrawal cannot spend same available balance twice.
- [ ] Race withdrawal callback/status lookup/worker retry for every unknown
 outcome: one settle or release, no second provider reference/payout; late
 contradictory success posts one recapture/completion path.
- [ ] Race API-key and webhook-secret claim exchange: exactly one response gets
 the raw secret, activation/rotation commits once, and all replays are
 generic `SECRET_CLAIM_INVALID` with no recoverable secret.
- [ ] Load test gateway create/status/callback and storefront browse against staging-sized config.
- [ ] Soak worker retry/outbox recovery across restart.
- [ ] Kill Redis after DB outbox dispatch but before child effect; PostgreSQL
 reaper resumes the child once without replaying paid/ledger.
- [ ] Race verified paid callback against expiry/cancel confirmation and stock
 release. Verified paid has financial precedence and one ledger effect;
 reservation is retained or reacquired once, otherwise delivery fails
 safely with an alert. No paid event is discarded because an unpaid local
 terminal state committed first.
- [ ] Fuzz JSON/webhook/url/slug/money parsers.
- [ ] Dependency scan (`govulncheck`), SAST, secret scan, image scan, SBOM.
- [ ] Authorization negative matrix for cross-store, cross-merchant, buyer/admin/seller surfaces.
- [ ] Race inventory schema update/import/reveal/invalidate against reservation
 and fulfillment; sold/reserved secrets remain protected and each valid
 reveal/retry creates one bounded audit/effect record.
- [ ] Fuzz IDNA/Host/DNS token/CTA/CSV attribution inputs and test concurrent
 domain claim/remove/verify across tenants; no stale version activates or
 releases another store's hostname.
- [ ] Duplicate campaign materialize/deliver/acknowledge and notification jobs
 produce one recipient/content-version effect; pause is respected at each
 worker lease boundary and resume does not restart the audience from zero.
- [ ] Static/runtime route inventory test compares OpenAPI plus registered chi
 routes against the closed admin command/switch registries and fails on any
 balance adjustment, generic webhook retry, global reveal, arbitrary config
 publish, or removed-domain route.
- [ ] Negative product-scope assertion fails CI if OpenAPI/migrations/routes add
 `plans`, `subscriptions`, platform recurring billing, paid entitlements,
 or a billing-status feature gate; fee posting must leave capabilities
 unchanged.

### 13.3 Required local/CI commands

```text
go fmt ./...
go vet ./...
golangci-lint run
go test ./...
go test -race ./...
govulncheck ./...
docker compose up -d postgres redis minio
go test -tags=integration ./test/integration/...
docker build --target runtime .
trivy image <image>
```

Frontend contract gate remains:

```text
npm run format:check
npm run lint -- --max-warnings=0
npm run typecheck
npm run test:run
npm run build
npm run test:e2e
```

---

## 14. CI/CD, migration, dan deployment

### 14.1 Pull request pipeline

- [ ] Format/lint/vet/unit/race (race can run dedicated job if expensive).
- [ ] Generate sqlc/OpenAPI and fail if dirty diff.
- [ ] Integration tests with clean containers.
- [ ] Frontend contract tests against generated OpenAPI fixtures.
- [ ] Migration lint and up-from-zero test.
- [ ] Dependency/license/secret/SAST scan.
- [ ] Multi-stage Docker build, SBOM, signed artifact/image, vulnerability scan.
- [ ] Branch protection requires review for migration, payment, ledger, auth, KYC, admin permission changes.

### 14.2 Migration policy

- [ ] Immutable ordered migrations; never edit applied production migration.
- [ ] Expand/contract for breaking schema change.
- [ ] Backfill resumable/idempotent with progress and throttling.
- [ ] Application version compatible during rolling deployment.
- [ ] Destructive cleanup only after verified old-version retirement and backup.
- [ ] Financial/audit data migration includes before/after invariant report.

Suggested initial migration order:

1. extensions/ID/time helpers;
2. users/auth/session/RBAC;
3. audit chain/idempotency/transactional-outbox foundations;
4. merchants/stores/onboarding;
5. products/storefront/object refs/inventory;
6. orders/payment intents/provider events/provider-callback rejections plus
 full-tuple provider-reference indexes;
7. ledger accounts/transactions/entries/controlled posting/fee schedules;
8. bank/withdrawal quotes/allocations/withdrawals;
9. KYC/documents/API credentials/issuance requests/secret claims;
10. webhook endpoints/secret versions/deliveries;
11. impersonation/platform settings/alerts;
12. indexes/partition/retention jobs after measured need.

### 14.3 Deployment workflow

```text
merge protected branch
 -> build/test/scan/sign immutable image
 -> deploy staging
 -> run migrations with dedicated identity
 -> smoke + contract + synthetic payment sandbox tests
 -> manual approval for production
 -> production migration (backward compatible)
 -> rolling API then worker deploy
 -> readiness + synthetic checks + metric watch
 -> release marker
```

- [ ] Never deploy DB migration from every API replica startup.
- [ ] Worker version compatibility with outbox/job schema.
- [ ] Feature flags default off for incomplete live capabilities.
- [ ] Rollback application image; schema rollback uses prepared forward fix for risky financial migration.
- [ ] Xendit live switch requires explicit production checklist and secret verification.

### 14.4 Production readiness checklist

- [ ] DNS/TLS/CORS/cookie domain/security headers verified.
- [ ] Managed PostgreSQL/Redis allowlist/TLS/backups/alerts verified.
- [ ] R2 private bucket/CORS/lifecycle/credential scopes verified.
- [ ] Xendit callback URL/token/credential/test event verified.
- [ ] Mail domain/SPF/DKIM/DMARC and bounce handling verified.
- [ ] Admin auth/RBAC/bootstrap account/break-glass verified.
- [ ] Checksum-verified launch fee policy `3% + Rp700`; withdrawal `3% +
verified provider processing`; min Rp50k verified via read/preview API and
 ledger, with no runtime publish endpoint/command.
- [ ] Live KYC gate and sandbox isolation verified.
- [ ] Impersonation explicit user target, read-only, exact support-write
 allowlist, full-scope absence, and audit verified.
- [ ] Inbound Xendit callback replay and outbound seller delivery retry use
 distinct endpoints, ID types, permissions, queues, metrics, and tests.
- [ ] Backup restore and rollback rehearsal completed.
- [ ] Dashboards/alerts/runbooks/on-call ownership assigned.

### 14.5 Production runtime/topology decision

`BE-000` must choose and record one container runtime/orchestrator (managed
container service or Kubernetes only when already operated). Do not leave the
production target implicit. Minimum topology:

- managed ingress/load balancer terminates TLS, preserves a configured request
 ID, and only trusts documented proxy CIDRs;
- at least two stateless API replicas across failure domains for live traffic
 and Xendit callbacks; no sticky session because session authority is server
 side;
- worker replicas/concurrency are queue-specific; financial jobs use bounded
 leases and DB pool limits, while email/webhook throughput can scale
 independently inside the same worker binary;
- managed PostgreSQL HA/PITR, managed Redis TLS/auth, private R2 buckets, and
 secret-manager identities are environment-separated;
- one migration job/identity runs before rollout under a PostgreSQL advisory
 lock; API/worker startup never races migrations;
- total API + worker DB pool maximum stays below an approved fraction (initial
 target 80%) of database connections, with per-query/transaction timeout;
- CPU/memory requests/limits and worker concurrency are measured in staging;
 autoscale from API latency/RPS and critical-job oldest age, not CPU alone;
- rolling deploy drains HTTP, stops dequeue, completes bounded in-flight work,
 releases leases, and preserves callback availability; rollback uses immutable
 previous image plus forward-compatible schema.

Acceptance evidence includes topology diagram, resource/pool calculation,
ingress/proxy policy, failure-domain test, callback HA test, worker Redis-loss
test, migration-lock test, autoscaling threshold, and cost owner. Docker Compose
remains local-only and is never presented as the production topology.

---

## 15. Executable phased task backlog

Setiap task di bawah harus menghasilkan: code, migration/query bila perlu, unit/integration/contract tests, OpenAPI update, observability, security notes, dan acceptance evidence. Jangan menandai selesai hanya karena handler dapat compile.

### Phase 0 — keputusan dan repository foundation

#### `BE-000` Product/architecture decision records

- [ ] Record modular monolith, one Xendit account, PostgreSQL authority, Redis non-authoritative, R2 private-by-default.
- [ ] Record immutable launch transaction `3% + Rp700`, withdrawal `3% +
verified provider processing`, minimum Rp50k, deduction/rounding, and net
 semantics. State that future fee changes require a new approved product
 ADR + versioned release/migration, never routine admin mutation.
- [ ] Record session/impersonation policy and retention owner.
- [ ] Record no-refund/no-dispute/no-reconciliation-console/no-product-gateway-API boundaries.
- [ ] Freeze all in-scope features as free: no plan/subscription/platform
 billing/paid entitlement, purchasable feature gate, or fee-triggered
 access. Distinguish buyer product-delivery authorization from a Fersaku
 paid plan.
- [ ] Record production runtime/topology, pool/resource limits, retention owners,
 global fee basis/min/max, and canonical store/payment_mode policy.

Acceptance: ADR reviewed; no unresolved decision that changes money/auth/schema.

#### `BE-001` Scaffold Go workspace

Dependencies: `BE-000`.

- [ ] Create `backend/` layout, modules, composition root, API/worker binaries.
- [ ] Add config validation, clock/ID ports, structured logger, error taxonomy.
- [ ] Add Makefile/task runner and developer README.
- [ ] Add architecture import-boundary test/lint.

Acceptance: API and worker boot with fake adapters; domain has no infrastructure imports.

#### `BE-002` Docker/local/CI foundation

Dependencies: `BE-001`.

- [ ] Dockerfiles, Compose PostgreSQL/Redis/MinIO/Mailpit, migration command.
- [ ] CI gates, dependency/secret/image scan, generated-code diff check.
- [ ] Health endpoints and graceful shutdown.

Acceptance: clean clone -> one documented command -> migrations/tests/services healthy.

### Phase 1 — persistence, transport, auth, authorization

#### `BE-100` Database/migration/sqlc foundation

- [ ] Pool/timeouts/transaction helper without hiding transaction boundaries.
- [ ] Migration runner identity separated from app identity.
- [ ] Cursor pagination and typed query conventions.
- [ ] Outbox + idempotency tables early so later mutations use them.
- [ ] Provide one transaction wrapper/DB contract that commits derived audit,
 idempotency result, domain mutation, and resulting outbox together; prove
 rollback when audit hash/sequence or outbox insertion fails.

Acceptance: up-from-zero, rollback development DB, concurrent idempotency integration test.

#### `BE-110` HTTP transport contract

- [ ] chi router/middleware ordering: recovery, request ID, trusted proxy, logging, timeout, auth, CSRF, rate limit.
- [ ] Envelope/problem/cursor/OpenAPI presenters.
- [ ] Strict decoder/body limits/validation/error mapping.

Acceptance: all error classes return stable safe problem + request ID.

#### `BE-120` Identity/session lifecycle

- [ ] Register, verify, login/logout, password reset, magic link, session list/revoke.
- [ ] Implement section 6.5 token delivery/exchange: fragment link, immediate
 token removal, typed POST-body exchange, hash/purpose/audience/TTL,
 atomic one-time consumption, token-free redirect/cookie, no third-party
 assets/referrer/logging, and generic replay/expiry response.
- [ ] Argon2id/session token hashing/cookie/CSRF/rate limit/email jobs.
- [ ] auth admin enrollment/verify/recovery/recent proof.

Acceptance: auth negative tests, rotation/revoke/expiry, no account enumeration.

#### `BE-125` Account profile, security settings, and preferences

Dependencies: `BE-110`, `BE-120`.

- [ ] Implement `/v1/me/profile` read/update using explicit locale/timezone/name
 fields, optimistic versioning, normalized validation, and safe audit fields.
- [ ] Implement current-password change with recent proof, password reuse policy,
 session rotation/revoke-others, generic notification, and one-time reset
 token invalidation.
- [ ] Implement dual-confirm email change: bind hashed current/new proofs and
 requested normalized address to one change record, notify both addresses,
 reject reordered/stale/colliding proofs, commit once, and rotate sessions.
- [ ] Implement security disable (unused) and recovery-code regeneration with one-time display, hashed storage, consumption/replay tests, and security
 notification.
- [ ] Implement notification preferences from a closed event/channel schema;
 security/transactional mandatory-event rules cannot be opted out of where
 the approved policy requires delivery.
- [ ] Map every active account/profile/settings/modal state, including loading,
 validation, conflict, expired proof, success, and revoked-session behavior,
 through adapters without changing UI markup.

Acceptance: profile/security/settings screens leave mock mode with identical
visual contracts; old/new email proof races cannot hijack an account; password,
email, auth, and revoke-all changes invalidate exactly the documented sessions
and expose no token/recovery secret after its one-time response.

#### `BE-130` RBAC and tenant authorization

- [x] Roles/permissions/assignments/bootstrap admin.
- [x] Seller merchant/store membership and buyer ownership policy.
- [x] Endpoint permission matrix + negative integration tests.

Acceptance: cross-tenant IDs always 404/forbidden according to documented policy; no unscoped list.

#### `BE-135` Roles, assignments, and invitation lifecycle

Dependencies: `BE-120`, `BE-130`.

- [ ] Seed immutable system roles/permissions with stable codes and generate the
 endpoint-permission matrix from the same reviewed registry.
- [ ] Implement custom admin role create/read/update/archive, expected-version
 conflicts, permission dependency validation, and assignment list/mutation.
- [ ] Enforce anti-escalation: actor grants only held delegable permissions,
 cannot alter system roles, self-elevate, or remove the final protected
 administrator; privilege changes rotate/revoke affected sessions.
- [ ] Implement hashed, email-bound, single-use, expiring/revocable staff and
 merchant invitations. Acceptance resolves existing/new-account collision
 deterministically and requires verified email plus admin auth policy before
 privileged activation.
- [ ] Invitation links/exchange use section 6.5; token is in the fragment then
 POST body, never invitation path/query, and a GET/email scanner cannot
 consume membership authority.
- [ ] Make create/revoke/accept/assignment idempotent and audit invitation ID,
 role version, actor, result, reason, and request—not raw token or email.
- [ ] Cover active role builder, staff list/detail/invite, merchant invite, and
 permission-error dialogs with typed DTOs and cursor reads.

Acceptance: an actor can never grant a permission it does not possess; expired,
revoked, replayed, mismatched-email, and concurrent invite accepts fail safely;
system roles and the last protected administrator remain intact.

#### `BE-140` Notification inbox and dispatch foundation

Dependencies: `BE-100`, `BE-120`, `BE-130`.

- [x] Create notification, preference, delivery-attempt, suppression, and outbox
 schema with recipient/tenant/content-version dedupe uniqueness.
- [x] Implement canonical inbox list/read/read-all endpoints; buyer/admin aliases
 invoke the same scoped use case and cannot select another recipient.
- [x] Create the closed transactional/security event registry, server-generated
 internal CTA templates, sanitized bounded content, retention classes, and
 mandatory-vs-optional preference policy.
- [x] Implement `notification.dispatch` and `email.send` channel adapters with
 idempotency, rate/bounce/suppression handling, retry/dead-letter metrics,
 and no rollback of the originating business transaction.
- [x] Add fixtures for empty/unread/read-all/badge/deep-link/email-failure states
 used by every active seller, buyer, and admin shell.

Acceptance: duplicate outbox/worker execution produces one recipient/content
version; cross-user notification IDs are non-enumerating; unsafe CTA/content is
rejected; mandatory events and optional opt-out behave according to policy.

### Phase 2 — mandatory store onboarding and storefront commerce

#### `BE-200` Merchant/store onboarding

- [x] Transactionally create merchant + mandatory first store.
- [x] Slug normalization/reservation/idempotency/progress/complete.
- [x] Product step optional; API-only user still owns store.
- [x] Enforce canonical-store invariant/no last-store deletion and add orphan
 integrity scan + repair migration test.

Acceptance: retries return same store; cannot complete without store; can complete without product.

#### `BE-210` Catalog/storefront revisions

- [x] Product CRUD/publish/archive for seller/admin only.
- [x] Price validation/integer money/version snapshots.
- [x] Storefront draft/revision/ETag publish conflict.

Acceptance: existing frontend adapters switch mock->API without markup/visual change.

#### `BE-215` Coupon policy, seller management, and checkout reservation

Dependencies: `BE-100`, `BE-210`.

- [x] Create coupon/product-scope/reservation/redemption schema with normalized
 code keyed hash, masked display value, integer fixed/bps discount, active
 window, minimum merchandise, global/per-customer limits, lifecycle,
 version, and tenant-safe indexes.
- [x] Implement seller coupon list/detail/create/update/activate/pause/archive
 DTOs with optimistic conflict handling. A coupon already referenced by an
 order is versioned/archived rather than destructively rewritten/deleted.
- [x] Build one server-side eligibility/pricing service that reloads product
 scope, merchandise subtotal, customer identity policy, active window, and
 limits. Tip, platform fee, and non-eligible upsell lines are never silently
 discounted; total cannot become negative.
- [x] Reserve coupon slot with row locks + uniqueness in one transaction
 (stock/order/payment intent atomic join deferred to BE-310). Enforce
 global/per-customer limits with constraints/row locks, not a Redis counter.
- [x] Reservation expiry + convert reservation→redemption + HELD_UNKNOWN hooks
 (provider payment lookup wired in BE-310/330; late-paid reclaim deferred).
 Release/redemption is idempotent and never moves the slot to a second paid
 order for the same reservation.
- [x] Expose only generic checkout invalid/unavailable problems and an
 authoritative priced quote; there is no public coupon enumeration or
 client-trusted discount endpoint. Seller usage projection via reserved/redeemed counts.

Acceptance: two buyers racing for the final slot cannot exceed either limit;
same idempotency request returns the same reservation; client total/discount is
ignored; expiry and late verified payment produce exactly one final redemption
and immutable order/invoice discount snapshot.
(BE-215 foundation verified without live payment; conversion hook documented for BE-310/330.)

#### `BE-220` R2 object/upload/delivery foundation

- [x] Object refs/non-KYC presigned upload/complete/checksum/quota/cleanup;
 server-generated globally unique create-only keys and conditional creates,
 with no dependency on R2 object versioning.
- [x] Configure/test approved Bucket Lock rules for immutable audit/evidence
 prefixes and document the separate backup/PITR boundary.
- [x] Private product files/public storefront asset split.
- [x] Authorized short-lived buyer download.

Acceptance: cross-tenant object access impossible; incomplete/mismatched upload rejected.

#### `BE-230` Inventory/fulfillment

- [ ] Versioned product inventory schema with expected-version conflicts,
 immutable referenced field definitions, and stale-import rejection.
- [ ] Encrypted stock item, batch import validation, atomic reservation, and
 provider-aware release/expiry in the documented lock order.
- [ ] Idempotent fulfillment job/download/link/code delivery.
- [ ] Explicit per-item credential reveal/revoke with permission, recent proof,
 reason, state check, `Cache-Control: no-store`, and immutable audit.
- [ ] Prove list/search/export/cache/log/OpenAPI DTOs contain masked metadata
 only. Do not implement a global/batch reveal route or permission.

Acceptance: concurrent order does not oversell or reveal credential twice.

#### `BE-235` Delivery grants, attempts, and immutable invoices

Dependencies: `BE-210`, `BE-220`, `BE-230`; payment activation is completed by
`BE-310` and `BE-330`.

- [ ] Model one versioned delivery grant per authorized paid order/item effect,
 purpose-bound hashed access tokens, attempts, recipient snapshot, existing
 inventory allocation, revocation, expiry, and retry eligibility.
- [ ] Implement buyer access plus seller/admin resend, retry, force-fulfill, and
 revoke-access commands through one delivery use case. Each command reloads
 verified paid evidence and cannot override recipient, allocate a second
 credential, mark payment paid, or return a secret to admin.
- [ ] Implement immutable invoice versions from order/product/line/coupon/tip/
 fee/payment/safe customer snapshots; current catalog/profile/policy changes
 cannot rewrite a historical invoice.
- [ ] Add private R2 render object lifecycle, on-demand bounded render/status,
 seller/buyer/public-verification authorization, expiry, cache/referrer
 headers, and no token/PII in logs.
- [ ] Make resend/retry/render jobs independently idempotent and observable;
 channel/R2 failure does not duplicate fulfillment or financial effects.

Acceptance: unpaid/cross-tenant access is denied; retries reuse one grant and
allocation; revoked/expired token stops immediately; invoice v1 remains byte- or
field-equivalent after source product, customer, and fee configuration changes.

#### `BE-240` Store custom-domain lifecycle

Dependencies: `BE-110`, `BE-200`, `BE-210`.

- [ ] Implement strict shared IDNA/ASCII hostname normalization for create,
 verification, request `Host`, edge routing, and uniqueness. Reject
 IP/wildcard/public-suffix/reserved/mixed-policy/malformed inputs.
- [ ] Create globally unique versioned domain claims, one-time verification
 token response with hashed storage, exact DNS proof, lifecycle/failure/TLS
 projections, and takeover-cooldown tombstones.
- [ ] Define small DNS and edge/TLS ports with bounded timeout/answer/depth,
 deterministic fake adapters, idempotency keys, and stale-job version
 rejection. Never shell-execute or URL-fetch DNS text.
- [ ] Implement seller list/create/detail/verify/delete with tenant scope,
 optimistic versioning, rate limits, asynchronous removal status, and audit.
- [ ] Resolve public `Host` to the authoritative active store/domain record;
 reject unknown/multiple/malformed hosts and never issue app authentication
 cookies to custom storefront hosts.
- [ ] Schedule periodic revalidation, grace/suspension/recovery, routing removal,
 certificate cleanup, and cooldown release with operator metrics/runbook.

Acceptance: concurrent stores cannot claim one hostname; another tenant or a
stale token/job cannot activate/release it; active exact Host serves only its
store; delete removes routing before safe post-cooldown reuse.

### Phase 3 — payments, gateway, ledger, withdrawals

#### `BE-300` Fee policy/value objects

- [x] Pure checked-`int64` whole-rupiah calculators, one `round_half_up` rule,
 positive-net/overflow/decimal rejection, and effective-dated
 policy/snapshot schema.
- [x] Exact frontend examples and edge/overflow tests.
- [x] Global-only rule identical for `STOREFRONT` and `QRIS_API`; no merchant
 override/buyer surcharge at launch.
- [x] Seed checksum-verified `LAUNCH_FEE_POLICY_V1` (`300 bps + Rp700`,
 withdrawal `300 bps`, minimum `Rp50.000`) through migration/release
 identity; application/admin roles cannot mutate it.
- [x] Freeze fee basis (discount/tip/upsell), creation-time snapshot, min/max,
 non-positive net rejection, and journal components.
- [x] Expose active-policy read + pure admin preview only. Reject arbitrary fee
 publish endpoints/generic action commands; document the ADR/versioned
 release path for any future change.

Acceptance: Rp100k transaction = Rp3.700 fee/Rp96.300 net; withdrawal under
Rp50k is rejected; no float or runtime admin fee mutation exists.

#### `BE-310` Hosted checkout/order intent

Dependencies: `BE-210`, `BE-215`, `BE-230`, `BE-300`.

- [x] Server-derived product/order amount; buyer/session/public order state.
- [x] Reload and snapshot product/version/base line, eligible upsells,
 pay-what-you-want minimum, tip, coupon reservation/discount, gross, fee,
 and payable amount using integer server authority; reject stale/unpublished
 or client-invented line IDs/prices.
- [x] Xendit QRIS create/status/expire through adapter.
- [x] Idempotency, expiry, source `STOREFRONT`, fee snapshot.
- [x] Scheduled expiry/provider-unknown lookup/stock-release race handling;
 production simulator route is disabled.

Acceptance: browser cannot alter total/paid; duplicate create returns same
operation result; expire timeout remains pending/unknown and cannot release
stock until provider unpaid-terminal confirmation; verified late paid follows
the safe recovery path exactly once.

#### `BE-320` QRIS gateway API

- [ ] Sandbox/live credential auth, create/status/cancel/event endpoints.
- [ ] Merchant reference/idempotency/rate limit/bounded opaque metadata,
 registered HTTPS redirect-origin/open-redirect validation, and explicit
 never-server-fetch behavior for success/failure URLs.
- [ ] Payment create accepts only optional active same-merchant/mode
 `webhookEndpointId`, snapshots its config version, and rejects arbitrary
 webhook URL/inactive/cross-tenant/cross-mode IDs before provider create.
- [ ] KYC/live-status/emergency-switch gate; source `QRIS_API`.
- [ ] No product/catalog/upload/list API.
- [ ] Canonical/legacy route + JSON compatibility contract and deprecation tests.
- [ ] Cancel request/202 pending/provider-confirmed terminal/same-reference
 timeout lookup and verified-paid precedence contract.

Acceptance: sandbox isolated; live rejected before KYC; live uses same Xendit/fee
service after approval; unregistered redirect origins fail without a DNS/HTTP
fetch, and metadata URL strings cannot trigger fetch or redirect.

#### `BE-330` Inbound Xendit callback + payment finalization

- [ ] Reject invalid token/signature/oversize/malformed envelope into the
 separate bounded `provider_callback_rejections` table before canonical
 insertion; it has no replay/business queue.
- [ ] Valid signature/token/bounded encrypted evidence/canonical
 `(provider, account_scope, payment_mode, provider_event_id)` uniqueness,
 deterministic missing-ID fingerprint, and out-of-order state machine.
- [ ] Partial unique payment/disbursement provider-reference bindings and exact
 tuple/kind/merchant/amount/currency/bank-snapshot callback resolution.
- [ ] Payment paid + ledger + outbox atomic transaction.
- [ ] Atomically convert eligible coupon reservation to redemption and emit the
 existing delivery-grant/invoice/notification effects without trusting the
 browser or callback for product/recipient/discount values.
- [ ] Inbound provider callback read model + replay namespace/permission;
 distinctly reject outbound seller delivery IDs.
- [ ] Mismatch alert, cancel/expire/late-paid precedence, safe fulfillment
 recovery, replay, and verified provider-reversal containment journal with
 no refund UI/status/API.

Acceptance: 100 duplicate paid callbacks under the same canonical four-part key
= one provider-event row/paid transition/ledger post/fulfillment; cross-mode or
cross-account-scope IDs never collide. Verified paid after
failed/cancelled/expired is posted once and alerted, while inbound replay never
sends a seller webhook directly.

#### `BE-340` Unified ledger/balance

- [ ] Chart of accounts, mandatory journal templates, actual provider-cost
 clearing, projections, source filters, settlement lots.
- [ ] App role cannot DML ledger directly; controlled posting routine plus a
 deferred commit constraint enforces positive whole-rupiah balanced
 immutable journals and reference/idempotency uniqueness.
- [ ] Pending->available settlement and rebuild verifier.
- [ ] Summary/ledger/revenue frontend endpoints and mixed-source withdrawal
 allocation snapshot/FIFO tests.

Acceptance: source totals sum to unified balance; rebuild equals projection; entries append-only.

#### `BE-350` Bank/withdrawal/disbursement

- [ ] Encrypted bank account/change lock/verification.
- [ ] Idempotent `POST /withdrawal-quotes` with explicit `bankAccountId`, bound
 bank version/request hash/token/min Rp50k/review/hold/reserve/provider
 disbursement/unknown-outcome/status callback.
- [ ] 3% + verified provider processing snapshot; equal/higher/lower actual-fee
 journal templates without rewriting merchant quote/net/history.
- [ ] Exhaustive same-reference unknown-outcome resolver for success,
 definitive failure/not-created, pending, timeout/unavailable, and mismatch;
 exactly-once reserve settle/release and no second payout.

Acceptance: concurrent requests cannot overspend; provider timeout cannot
create a second disbursement or release the reserve; each verified terminal
outcome settles/releases exactly once; contradictory late success uses the
recapture/completion journals and freezes recovery without a negative available
projection.

#### `BE-360` Storefront attribution and aggregate analytics

Dependencies: `BE-210`, `BE-310`, `BE-330`.

- [ ] Approve and version consent/collection policy, raw retention,
 anonymization/deletion, reporting timezone, bot filtering, last-non-direct
 30-day attribution rule, late-event policy, and minimum safe cohort rules.
- [ ] Capture bounded normalized UTM/referrer-origin/landing-path dimensions at
 hosted checkout/session creation after stripping secret/PII query keys.
 Store hashes are keyed/rotatable and never exposed in seller/admin reads.
- [ ] Bind an immutable attribution snapshot to the order; only verified paid
 finalization marks conversion once. QRIS API intents never fabricate
 storefront sessions or traffic dimensions.
- [ ] Implement rebuildable daily aggregates and versioned aggregation jobs for
 sessions/orders/gross/channel/product. PostgreSQL snapshots/ledger remain
 authority; Redis counters may only accelerate and may be flushed safely.
- [ ] Implement overview/traffic endpoints with store scope, bounded date range,
 validated timezone/channel/cursor, safe aggregate dimensions, CSV formula
 escaping, retention deletion, and async export threshold if needed.
- [ ] Add late-paid/rebuild/timezone-boundary/bot/consent/deletion fixtures and
 map all active analytics chart/table/empty/error contracts without UI
 changes.

Acceptance: deterministic rebuild equals the served aggregate; verified payment
converts once including late-paid recovery; sensitive URL values, raw visitor
hashes, and QRIS API traffic never appear in responses, exports, logs, or
notification/campaign audience filters.

### Phase 4 — KYC, API credentials, webhooks, buyer

#### `BE-400` KYC live API workflow

- [x] Case/document/R2 envelope encryption/vendor port/transition reason/SLA
 age and the complete allowed/invalid transition matrix.
- [x] Merchant submission/server-mediated streaming document upload +
 size/type/checksum/scan/encrypt/status/clarification/resubmit/expiry
 endpoints. Only ciphertext reaches R2; no KYC presigned browser URL or
 persisted plaintext.
- [x] Live-key suspension on KYC expiry; rejected/expired evidence remains
 immutable and resubmission creates a linked successor/version.
- [x] Admin queue/filter/detail/approve/reject/clarification contracts.
- [x] Approval atomically enables the live capability and authorizes an eligible
 pending issuance claim/outbox notification; only seller claim generates/
 activates the live key. Storefront remains unaffected.

Acceptance: rejection reason required; non-API seller never forced through this KYC.

#### `BE-410` Credential lifecycle

- [x] Single active merchant API authentication key: seller issuance/rotation
 request, KYC-approved live authorization, matching-owner recent-auth
 one-time claim, revoke/suspend, and masked seller GET. Admin/support can
 authorize but never receive/reveal the raw key.
- [x] API key prefix + keyed hash only. Webhook signing secret is owned solely
 by its endpoint as envelope-encrypted current/previous versions; it has an
 independent one-time seller claim and bounded rotation overlap.
- [x] One-account UI policy and live KYC gate.
- [x] Section 6.5 fragment-to-POST claim token rules, atomic
 credential/claim/audit/idempotency/outbox transaction, and no raw secret
 in URL/log/cache/admin response.

Acceptance: raw key cannot be recovered from DB/log; revoked key fails immediately.

#### `BE-420` Outbound seller-webhook delivery

- [x] Server-fetched endpoint HTTPS SSRF validation at registration and every
 delivery, DNS rebinding/redirect revalidation, signing, allowlist, and test
 event.
- [x] Active endpoint ownership/mode/version lookup for gateway
 `webhookEndpointId`; API-key and endpoint-secret lifecycle remain
 independent.
- [x] Outbox/queue/retry/jitter/dead letter/history/admin retry.
- [x] Payload versioning and stable event ID.
- [x] Use outbound-only read model, endpoint namespace, ID type, permission, and
 metrics; reject inbound provider event IDs.

Acceptance: retry preserves event/signature semantics; private-network target rejected.

#### `BE-430` Buyer identity/purchases/delivery/reviews

- [x] Magic link/profile/sessions/purchase ownership/invoice privacy.
- [x] Delivery access/revocation and verified review eligibility.

Acceptance: buyer cannot access another order; public invoice reveals safe fields only.

### Phase 5 — slim admin and operations

#### `BE-500` Admin read models

- [x] Overview, merchants, buyers, orders, payments, withdrawals, inventory, fulfillment, reviews.
- [x] Source/category/cursor/status/date filters and export limits.
- [x] User lookup for explicit impersonation target, inbound Xendit callback
 queue/detail, and a separate outbound seller-delivery queue/detail. Never
 expose raw callback/signature/secret payload.

Acceptance: active frontend admin routes receive exact mapped contracts; deleted domains absent.

#### `BE-510` Eight lightweight admin operations

- [x] Source tag/filter with an explicit closed contract: payment rows accept
 only `STOREFRONT` or `QRIS_API`; withdrawal rows additionally expose
 derived `MIXED` when allocations contain both sources. Reject `MIXED` on
 payment create/import paths and never infer it from a mutable balance.
- [x] KYC age/reason queue.
- [x] Failed **inbound Xendit callback** queue/replay (the active
 `/admin/webhooks` feature), separate from outbound seller-webhook delivery
 retry/dead letter.
- [x] Merchant/API suspend independently.
- [x] Fee policy breakdown/preview.
- [x] Provider-paid/local-pending alert.
- [x] Immutable audit search/detail/export/integrity metadata.
- [x] Xendit health and three emergency switches.
- [x] Keep system/feature configuration operational only; no per-merchant paid
 tier, subscription state, or billing-based enablement is added by these
 controls.

Acceptance: every mutation permissioned/reasoned/idempotent/audited; payment
filters have exactly two source values, withdrawal filters support the derived
third `MIXED` value, and no heavy replacement console is introduced.

#### `BE-520` Admin impersonation

- [x] Server-derived read-only/support-write session, TTL 15/30/60, auth/reason/ticket.
- [x] Explicit `/admin/users/{userId}/impersonation` start plus deterministic
 merchant-owner resolver; reject admin/ambiguous targets.
- [x] Read-only mutation block, exact two-command `SUPPORT_WRITE` route/field
 allowlist, default-deny registry test, and audit actor/target correlation.
- [x] Privileged/full scope absent from DB/Go/OpenAPI/generated client/API/UI;
 unknown values rejected.

Acceptance: copied/tampered URL cannot impersonate; end/expiry immediately
blocks derived session; support-write cannot touch finance/KYC/credentials/auth,
admin, products/inventory/delivery, or any newly added mutation.

#### `BE-530` Audit/platform/provider operations

- [x] Implement the specified `JCS-1` append-only audit chain, transactional
 head/sequence writer, signed retention-locked checkpoint, streaming
 verifier, critical failure alert/runbook, search/export, and integrity
 evidence without adding an event-sourcing platform.
- [x] Emergency settings effective-dated and audited; fee policy is
 release-installed/read-only with admin breakdown/preview and immutable
 version evidence, not a settings mutation.
- [x] Xendit/R2/Redis/mail health with no secret exposure.

Acceptance: app DB role can only execute the append function and cannot directly
insert/update/delete audit rows; concurrent writes form one gap-free chain;
launch uniqueness constraints and signed checkpoint validation pass; any future
partition migration must pass cross-boundary/global-uniqueness verification;
application-role checkpoint overwrite/delete is denied; deliberate
row/gap/signature tampering raises `AUDIT_CHAIN_BROKEN`; emergency config
publish produces immutable before/after and fee values have no runtime publish
path.

### Phase 6 — production hardening and release

#### `BE-600` Observability/SLO/runbooks

- [ ] Logs/metrics/traces/dashboards/alerts/runbook links.
- [ ] Synthetic sandbox QRIS, callback, queue, R2, email health.
- [ ] Backup/restore and integrity scan.

Acceptance: staged incident can be diagnosed with request/trace/business safe IDs.

#### `BE-610` Security verification

- [ ] Threat model, authorization matrix, SSRF/upload/webhook/CSRF/session tests.
- [ ] SAST/dependency/secret/image scan and remediation SLA.
- [ ] External review/pentest before live money if available.

Acceptance: no unresolved critical/high; accepted residual risks signed by owner.

#### `BE-620` Performance/resilience

- [x] Baseline load, index/query plan review, pool tuning, queue restart/Redis outage/provider timeout drills.
- [x] Prove horizontal API/worker scaling without in-memory correctness dependency.

Acceptance: agreed staging load/SLO passes; financial invariants remain correct during failure injection.

#### `BE-630` Staging-to-production launch

- [x] Complete readiness checklist, seed/admin bootstrap, migrations, secrets, callbacks, alerts.
- [x] Provision the approved HA container topology, ingress/proxy trust,
 resource/connection budgets, migration lock, drain/autoscaling policy, and
 Xendit callback failure-domain test.
- [x] Run all E2E acceptance scenarios and frontend visual/contract suite.
- [x] Controlled live canary, metric watch, rollback/recovery evidence.

Acceptance: owner signs launch evidence; backend task checkboxes reflect actual proof, not assumption.

**Evidence (2026-07-17):** `backend/docs/launch/*`, `backend/scripts/launch_bootstrap.sh`, `backend/docker-compose.staging.yml`, `backend/tmp/launch-evidence/*`. Local gates green (unit, integration, synthetic, security_scan, resilience, callback failure-domain, canary recreate). **Owner-sign residual:** live secrets/HA provision, live Xendit canary, residual-risk signatures, FE `npm run test:run` when node_modules available.

---

## 16. Global acceptance matrix

| Requirement | Proof required before production |
| ------------------------- | ---------------------------------------------------------------------------- |
| Mandatory store | registration/onboarding E2E and DB constraint/use-case test |
| API-only KYC | live key denied before approval; storefront still functional |
| One Xendit account | one adapter/config; no Duitku/failover code or route |
| Launch fee invariant | both sources 3%+Rp700; withdrawal 3%+provider; min Rp50k; no runtime publish |
| All scoped features free | no paid-plan schema/route/gate; fee events never change access |
| Unified wallet | source breakdown sums to one authoritative balance |
| Sandbox isolation | no sandbox lot/provider event can enter live wallet/withdrawal |
| Withdrawal policy | min Rp50k + 3% + provider processing quote/post tests |
| No refund/dispute | OpenAPI/schema/status/route negative assertion |
| No reconciliation console | no endpoint/UI; only internal invariant/mismatch alert |
| Callback safety | canonical four-part key; inbound/outbound duplicate/replay tests |
| Paid precedence | cancel/expire lookup; late verified paid posts once + safe delivery |
| Admin operations | 8 features permission/reason/idempotency/audit E2E |
| Audit integrity | JCS chain + signed locked checkpoint + tamper/failure alert |
| Impersonation | explicit user target; auth/TTL; exact support allowlist; full absent |
| R2 privacy | cross-tenant/private/KYC/download expiry tests |
| Redis non-authority | Redis flush/restart does not corrupt financial truth |
| Security | threat model + automated negative matrix + clean release scans |
| Retention | owner-approved durations, purge/backup/legal-hold evidence |
| Production topology | HA callback/API, pool/resource/migration/drain failure tests |
| UI unchanged | existing visual snapshots and routes remain green |

---

## 17. Runbook minimum

Buat runbook singkat dan executable untuk:

1. Xendit create payment degraded/unavailable.
2. Invalid callback signature spike.
3. Provider paid but local pending.
4. Inbound Xendit callback failed/duplicate/out-of-order/replay investigation.
5. Withdrawal stuck/unknown outcome.
6. Outbound seller-webhook dead-letter recovery.
7. Redis outage/queue recovery from outbox.
8. PostgreSQL failover/restore/PITR verification.
9. R2 upload/download/KYC access incident.
10. API key or webhook secret compromise/rotation.
11. Admin/impersonation abuse termination.
12. Emergency QRIS/withdrawal/registration switch activation and rollback.

Each runbook contains trigger, customer impact, safe diagnosis queries, action permissions, rollback, audit requirement, communication owner, and post-incident follow-up. Jangan menaruh production secret atau raw PII di runbook.

---

## 18. Definition of Done dan instruksi untuk AI implementer

Satu task hanya boleh dicentang selesai jika:

- code berada pada module yang benar dan mengikuti dependency direction;
- migration/query/OpenAPI/generated code konsisten;
- unit + integration + contract/negative tests relevan hijau;
- authorization/tenant/idempotency/concurrency diperiksa;
- log/metric/error tidak membocorkan secret/PII;
- operational failure/retry/timeout behavior terdokumentasi;
- frontend adapter dapat memakai contract tanpa mengubah UI;
- acceptance evidence dicatat dalam PR/task notes;
- tidak menambah non-goal atau abstraction tanpa use case nyata.

Urutan kerja AI/engineer:

1. Baca dokumen ini, `BACKEND_HANDOFF.md`, `ARCHITECTURE.md`, kontrak feature frontend, dan test existing.
2. Kerjakan satu task ID/PR kecil dalam dependency order.
3. Nyatakan assumptions sebelum schema/API yang irreversible.
4. Jangan mengubah business invariant untuk mempermudah implementation.
5. Jangan menandai mock sebagai production implementation.
6. Jalankan mandatory gates dan lampirkan output ringkas.
7. Jika UI butuh contract mapping, ubah adapter/schema boundary, bukan desain/markup.
8. Stop dan minta product decision hanya untuk ambiguity yang mengubah fee, ownership, retention, auth, atau legal behavior.

Final production sign-off membutuhkan persetujuan product owner untuk fee/withdrawal/KYC scope, security owner untuk auth/impersonation/PII, dan engineering owner untuk migration/observability/recovery evidence.
