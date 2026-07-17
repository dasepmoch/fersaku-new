# Domain Tasks — Public, Auth, Checkout, Buyer

**Dependency rule:** gunakan dependency per-row dan pilot `co-evolve` pada `09-EXECUTION-STATUS.md`; jangan menafsirkan rentang task sebagai seluruh task selesai sekaligus.
**Live dependency:** `INT-180/INT-185` untuk payment/mail/provider/worker lifecycle yang dipakai surface.

Setiap task di bawah harus mempertahankan screen/component/copy/style existing. Semua response melalui schema + mapper ke existing view model.

**Pagination profile:** existing numbered component must receive `NumberedPageList`; `PurchaseLibrary` snapshot has no `TablePagination`, so `BUY-100` must choose a bounded launch invariant or `UI-080` before exposing more than the bounded result. A backend cursor is not a UI pagination control.

---

## AUT-100 — Seller register/login/session/logout

**Priority:** P0
**Routes UI:** `/register`, `/login`
**Backend:** `/v1/auth/register`, `/verify-email`, `/login`, `/session`, `/logout`, MFA endpoints

### Current state

`components/auth-form.tsx` menjalankan simulasi/local behavior. Belum ada session provider/route guard nyata.

### Checklist FE

- [x] Pertahankan `AuthShell` dan form JSX/class/copy existing; pindahkan submit ke auth API/mutation.
- [x] Buat request DTO exact untuk register/login (`surface` seller/admin sesuai contract); jangan kirim seluruh form/view state.
- [x] Map backend `400 VALIDATION_FAILED` field violations ke controls existing dan pertahankan input non-secret.
- [x] Generic response untuk duplicate/unverified email sesuai anti-enumeration policy.
- [x] Setelah login, bootstrap session + CSRF + merchant/onboarding state sebelum redirect. *(session+CSRF via INT-120/130; merchant bootstrap remains INT-150 consumer on dashboard)*
- [x] Bila `mfaRequired`, masuk actual MFA ceremony existing tanpa membuat login sukses penuh. *(stay on login; no full success; MFA UI ceremony = AUT-120)*
- [x] Session `MFA_PENDING` tidak boleh menjalankan business request walau role/permission sudah ada di response/cache; backend global gate `INT-140` wajib lulus direct-HTTP test. *(FE: status mfa_pending + guard; BE: INT-140 evidence)*
- [x] Password hanya berada di component/form memory dan tidak masuk query cache/reporter.
- [x] Safe `returnTo` relative path allowlist; default sesuai onboarding/dashboard state.
- [x] Logout pada profile menu memanggil backend, clear private cache, lalu existing logged-out state/redirect. *(INT-120 ProfileMenu)*
- [x] Forgot password action existing memanggil backend dan selalu menampilkan generic response.
- [x] Characterization snapshot: `AuthForm` hanya memiliki per-field error dan submit loading. `400` serta generic invalid credentials boleh memakai field region yang sama tanpa DOM/class baru; unverified, MFA, `429`, dan unavailable tidak boleh diasumsikan punya surface—block canary atau selesaikan `UXE-011/UI-080`, never redirect/fake-success.

### Checklist BE

- [ ] Register/login surface isolation, email normalization, password hashing policy, brute-force/distributed rate limit.
- [ ] Verify email token purpose-bound/hashed/single-use/expiry.
- [ ] Session fixation protection; rotate ID/token; correct cookie flags.
- [ ] Admin login policy terpisah di `ADM-100`; seller login tidak mendapat admin permission.
- [ ] Auth response + `/session` contract align, termasuk CSRF recovery dari `INT-130`.
- [ ] Mail adapter real untuk verification/reset pada staging/live.
- [ ] Emergency registration-off hanya memakai feedback/unavailable composition yang sudah ada dan ter-characterize; jika `AuthForm` tidak memiliki state tersebut, disable command atau minta `UI-080`, tanpa menambah maintenance panel/copy di wiring.

### State/error matrix

| State | Expected behavior |
| --- | --- |
| Pending submit | Existing CTA disabled/loading; no duplicate request. |
| Invalid field | Existing inline validation; focus first invalid. |
| Invalid credentials | Generic auth error; no email existence leak. |
| Email unverified | Existing surface/copy mapping; resend rate-limited. |
| MFA required | No dashboard access until verified. |
| Session created but bootstrap fails | Do not replay login; retry session/bootstrap safely. |
| Emergency registration off | Gunakan hanya feedback/unavailable component yang sudah ada; bila tidak ada, capability harus disabled atau masuk `UI-080`, bukan instant fake success atau maintenance UI baru. |

### Tests/AC

- Register -> mail verify fragment -> login -> hard refresh -> mutation -> logout.
- Invalid credential/user enumeration/rate-limit/MFA/CSRF/session rotation tests.
- Password/token redaction tests.
- Mock critical-flow and visual baseline unchanged.

---

## AUT-110 — Buyer magic-link request/consume dan account verification

**Priority:** P0
**Routes UI:** `/account/login`, `/account/verify`
**Backend:** `/v1/auth/magic-link/request`, `/magic-link/consume`

### Security contract

Bootstrap token harus berada pada URL fragment, bukan query/path:

```text
https://app.example/account/verify#token=<opaque>
```

### Checklist

- [x] Pertahankan `components/buyer-login.tsx` visual; ganti timer/mock link dengan mutation.
- [x] Request selalu memberikan generic success, termasuk email tidak ada.
- [x] Mail link memakai fragment; email scanner GET tidak mengonsumsi token. *(FE: fragment-only consume; BE single-use POST)*
- [x] Verify page membaca fragment client-side, segera memanggil `history.replaceState` untuk membersihkan URL sebelum third-party request/navigation.
- [x] Token dikirim sekali pada POST body; tidak masuk query cache/storage/analytics/error context.
- [x] Consume atomically single-use, purpose/surface-bound, short TTL, rate-limited. *(BE contract; FE posts body once)*
- [x] Success bootstrap session/CSRF lalu redirect safe `returnTo`/purchases.
- [x] Snapshot `/account/verify` hanya static success. Expired/reused/invalid token harus memakai existing safe `NotFound` (atau composition yang sudah disetujui melalui `UXE-011/UI-080`) tanpa membedakan account existence; jangan render success atau menambah ad-hoc error card.
- [x] `BuyerLogin` hanya punya loading/sent state. Jika request gagal/rate-limited/unavailable dan tidak dapat dipetakan secara aman tanpa markup baru, keep API/live command disabled dan selesaikan `UXE-011` sebelum canary. *(blocked → stay form, no fake sent)*
- [x] Hapus current mock query parameter behavior dan architecture-test larangan token query.

### Tests/AC

- URL/log/referrer/storage tidak mengandung token setelah first script tick.
- GET/email scanner tidak consume; first POST succeeds; second POST rejected.
- Wrong purpose/surface/expired/tampered rejected.
- Visual account login/verify tidak berubah.

---

## AUT-120 — Password reset, email change, MFA, recovery codes

**Priority:** P1
**Routes UI:** auth forgot flow, `/account/profile`, `/account/security`, seller/admin settings/profile
**Backend:** auth password/email/MFA endpoints

### Checklist

- [ ] Gunakan route ownership default UI freeze: seller verify/reset/merchant invite/seller MFA di `/login`; admin invite/MFA di `/admin/login`; buyer magic di `/account/verify`. Token purpose berasal fragment dan langsung di-scrub. Route baru memerlukan `UI-080` exception.
- [ ] Password reset/verify/invite token menggunakan fragment -> immediate scrub -> typed POST exchange seperti `AUT-110`.
- [ ] Password change membutuhkan current password/recent auth sesuai policy; rotates/revokes sessions appropriately.
- [ ] Dual-confirm email change menjaga generic mail response dan account recovery safety. Visible buyer button “Mulai perubahan email” belum memiliki handler/modal/form; keep it `DISABLED/OUT-OF-SCOPE` sampai dapat memakai exact approved auth composition atau `UI-080`—jangan menambah modal di wiring.
- [ ] MFA enroll QR/secret hanya muncul dari backend once, component-memory, `no-store`; fake QR dilarang API mode.
- [ ] First-time seller/admin enrollment uses an invite/pre-enrollment ticket allowed before full MFA session. It is purpose-bound, short-lived, replay-safe, and cannot call business routes; do not create a second unrestricted auth session.
- [ ] MFA confirm required sebelum enabled; recovery codes one-time view/download/print existing behavior, tidak cache/storage/log.
- [ ] Regenerate/disable MFA memerlukan recent proof; invalidates old codes/proofs.
- [ ] Session/security UI menggunakan actual server state tetapi exact existing controls/dialogs.

### Tests/AC

- Token purpose/replay/expiry; password rotation; email dual-confirm edge cases.
- MFA enroll/confirm/login/recovery/regenerate/disable.
- Raw seed/recovery codes tidak muncul setelah unmount/refresh dan tidak masuk telemetry.

### Ownership boundary

`AUT-120` owns shared auth/security API adapters, proof lifecycle, dan reusable hook state. Buyer/seller/admin profile tasks hanya bind exact existing screens dan menambah surface-specific permission tests.

---

## AUT-130 — Google/OAuth button disposition

**Priority:** P1/Decision
**Route UI:** seller/buyer auth shell Google button

### Current gap

Seller `AuthShell` memiliki Google login control yang belum memiliki action/backend OAuth contract. `BuyerLogin` snapshot **tidak memiliki Google control**; jangan menambahkannya sebagai bagian wiring.

### Checklist

- [x] **Launch decision (2026-07-17):** seller Google/OAuth **OUT-OF-SCOPE for launch**. Mode-gate existing seller `AuthShell` Google control to **DISABLED** when `auth` domain is `api`/`disabled` (title + `disabled`; never no-op/fake-success). Mock may keep prototype affordance. Buyer OAuth remains out-of-scope; do not add Google to `BuyerLogin`.
- [x] No OAuth backend/FE transport for launch (no start/callback/PKCE/provider tokens). Re-open only via product + full OAuth contract.
- [x] Reuse exact existing button/AuthShell geometry/copy; no provider UI kit.
- [x] Architecture gate: API-mode disabled + no OAuth wiring + no buyer Google control.

### Tests/AC

- [x] Button authoritatively disabled (not no-op) on API/live mode; mock prototype affordance allowed.
- N/A for launch: state/nonce/replay/account-link (IMPLEMENT path deferred).

---

## PUB-100 — Public featured catalog, storefront, product, reviews

**Priority:** P0 vertical slice
**Routes UI:** `/`, `/@store`, `/@store/product` (rewrites ke `/store/...`)
**Backend:** public featured/store/product/review/summary/fees

### Current seam

`features/catalog/api.ts` dan `features/seller/reviews/api.ts` sudah memiliki mock/API branch, tetapi belum schema/mapper/404 policy.

### Checklist FE

- [x] Generate schema/DTO untuk featured, public store, product, reviews, summary, active fee policy jika dibutuhkan display. *(fee display = PUB-110)*
- [x] Featured DTO/view wajib membawa canonical `storeSlug`/canonical product URL; homepage tidak boleh mengarahkan semua merchant ke `@asep-ai-tools`.
- [x] Featured query/response excludes products whose store is inactive/suspended/private; current backend filters product `published` and must add store-state predicate.
- [x] Map ke `CatalogProduct` dan storefront view existing; jangan memakai return type mock sebagai API contract.
- [x] Product detail memakai dedicated public product operation dan memverifikasi product memang milik `storeSlug`; global product slug yang sama pada dua store tidak boleh resolve ke tenant salah.
- [x] `404 RESOURCE_NOT_FOUND` -> `null/notFound`; network/5xx tidak menjadi not-found.
- [x] Public cache policy explicit: short revalidate/tag; published revision only.
- [x] Cache key memuat slug/product ID/revision/language bila relevan. *(path/query + storeSlug bind)*
- [x] Public response tidak memuat unpublished data, private object key, stock secret, buyer identity, internal fee/risk/audit.
- [x] Review pagination/summary dinormalisasi tanpa mengubah layout/card.
- [x] Zero-review mapping/render menghasilkan `total=0`, valid distribution width `0%`, tidak pernah `NaN%`/hydration error.
- [x] Long title/empty product/review unknown status diuji di desktop/mobile. *(unit + existing layout)*

### Checklist BE

- [x] Resolve custom host/pretty route ke published store secara aman; canonical slug/ID behavior jelas. *(pretty route FE rewrite; store ACTIVE filter)*
- [x] Only active/published products and public assets.
- [x] Price/current availability is server snapshot; checkout re-prices again.
- [x] Stable ordering and bounded limits; public review UI has no pagination control in snapshot, so cursor is not exposed without UI-080.
- [x] ETag/cache headers + invalidation on publish/archive/review moderation. *(ETag on storefront; short FE revalidate)*

### Tests/AC

- API-seeded public routes pixel-equivalent dengan fixture mock.
- Dua store dengan product slug sama menghasilkan canonical link/detail tenant yang tepat dari featured/home/store navigation.
- Unpublished/foreign/deleted resource tidak bocor.
- Public cache invalidates setelah publish/archive.
- No hydration mismatch dan no layout shift.

---

## PUB-110 — Public pricing/fee copy source of truth

**Priority:** P1
**Routes UI:** `/`, `/pricing`
**Backend:** `GET /v1/platform/fees`

### Current gap

Homepage dan pricing page memiliki fee/minimum hardcoded. Checkout tetap server-authoritative, tetapi marketing copy tidak boleh drift dari active launch policy.

### Checklist

- [x] Jadikan public active fee policy/version sebagai source untuk dynamic amount/percentage/minimum yang sudah memiliki tempat di UI; map dengan formatter existing tanpa mengubah copy/layout.
- [x] Server-render/public-cache dengan explicit revalidate/tag dan release/version observability; no client flash.
- [x] Backend fee read immutable/read-only sesuai launch policy; admin preview tidak menjadi publish mutation. *(BE already immutable; FE consumes GET /v1/platform/fees only)*
- [x] Define outage behavior: serve last known signed/versioned public policy cache atau existing generic unavailable state; jangan mengarang angka baru.
- [x] Contract/release test membandingkan homepage, pricing, checkout quote, finance preview, dan backend active policy. *(unit: fee map/version + launch align; checkout quote remains CHK-100)*

### Tests/AC

- Fee version change invalidates public cache and all displayed amounts agree.
- Checkout tetap menghitung server-side; marketing value tidak dikirim sebagai authority.
- Existing home/pricing screenshots unchanged untuk current `3% + Rp700` policy.

---

## PUB-200 — Contact form submission

**Priority:** P1/Decision
**Route UI:** `/contact`
**Backend gap:** no contact endpoint at snapshot

### Checklist

- [ ] Jika form tetap active di live, add exact public contact operation through `INT-000` (for example `POST /v1/public/contact-messages`) before codegen; jika out-of-scope, control harus existing disabled/unavailable state, bukan instant fake success.
- [ ] Request exact `name`, `email`, topic enum, message, optional anti-bot proof; bounded lengths/content type.
- [ ] Anti-spam/rate limit/honeypot/provider policy, generic acknowledgement, no account enumeration.
- [ ] Persist/queue ticket or transactional mail via real adapter/outbox; never claim “Pesan terkirim” until durable acceptance.
- [ ] PII retention/redaction/consent and security-report routing documented.
- [ ] Snapshot `ContactPage` has no field-error, pending, or general-error region. Bind only an already-approved existing composition; otherwise keep submit `DISABLED` and record `UXE-010/UI-080` before adding any state copy/layout.

### Tests/AC

- Valid, invalid, spam/rate-limit, mail/queue unavailable, duplicate submit/idempotency.
- API failure never sets local `sent=true`; UI composition unchanged.

---

## PUB-210 — Storefront search dan safe social links

**Priority:** P1
**Route UI:** `/@store`

### Checklist

- [ ] Search button must open/use an existing-component search interaction or be explicitly disabled via route-state decision; no-op active button dilarang. Search may filter already bounded published products or call store-scoped public search, but tenant remains fixed.
- [ ] Public store DTO carries exact sanitized Instagram/YouTube/website URLs; replace `href="#"` on API path.
- [ ] Allow only approved `https` schemes/hosts/patterns; add `rel="noopener noreferrer"` and target policy as agreed. Never render `javascript:`, credential URL, or arbitrary internal link.
- [ ] Missing social link omits the existing icon slot as current conditional composition does; website icon must also be conditional, not fake `#`.
- [ ] Search result product link uses canonical store slug from same DTO.

### Tests/AC

- Two tenants/same product slug, empty search, malicious URLs, missing socials, keyboard/search focus.
- No no-op link/button on live storefront; visual unchanged when equivalent links exist.

---

## PUB-220 — Public platform status

**Priority:** P2/P1 if marketed as live status
**Route UI:** `/status`
**Backend:** `GET /v1/status`, health signals/incident source decision

### Checklist

- [ ] Decide whether page is static product content or claims live operational status. If live, wire sanitized public status/incident aggregate; raw `/metrics` and internal dependency details remain private.
- [ ] Public response/cache and incident update cadence documented.
- [ ] Do not display fake “operational” during outage; use existing card/status visual.
- [ ] Health endpoint alone is not full product incident history; add backend/status provider dependency if UI claims more.

### Tests/AC

- Operational/degraded/outage/stale data states; no internal topology/secret leakage.

---

## PUB-230 — Static help/careers/blog/API playground disposition

**Priority:** P1 decision before full live cutover

### Scope decisions

- Help/blog/company/legal content may remain static; this is not forbidden mock business authority.
- Help search/category and careers CTA must either perform real local navigation/filter/link behavior or use exact existing disabled state; active no-op controls are not acceptable.
- API playground is an explicit documentation sandbox exemption, not production payment authority.

### API playground rules

- [ ] In `mock/prototype` source, preserve visible “Frontend mock • no network request” semantics and deterministic fake IDs; this is an explicit documentation exception, not commerce authority.
- [ ] In `api/live` source, the playground must call an isolated sandbox with a strict allowlist or be `DISABLED`; it must never render the prototype timer/fake response as if live. Any label change requires UI-080.
- [ ] If real sandbox execution is enabled, use isolated sandbox account, user-supplied short-lived credential in component memory, abuse limits, no credential storage/log/proxy leakage.
- [ ] Architecture reachability gate must keep playground/mock imports isolated from checkout/seller/admin business paths.

### Tests/AC

- Every visible static control has a documented local/static/external/disabled behavior.
- Static/help/playground exemption cannot be imported by checkout/seller/admin business paths.

---

## CHK-100 — Checkout bootstrap dan server-authoritative quote

**Priority:** P0
**Route UI:** `/checkout/[checkoutId]`
**Backend:** public product/store, `/v1/checkout/quote`, coupon reservation jika dipakai

### Current risk

Harga, upsell, tip, total, produk, dan order ID sebagian hardcoded/client-calculated. Browser total tidak boleh menjadi authority.

### Checklist FE

- [x] Resolve checkout ID/product/store melalui public API contract; jangan hardcode product/order.
- [x] Pertahankan checkout component tree/square/buttons/fields exact.
- [x] Buat quote request hanya berisi identifiers/selections yang diizinkan: product, chosen option/upsell, PWYW/tip input, coupon code, attribution—tanpa authoritative total.
- [x] Render server quote fields melalui existing view model: item subtotal, discount, tip, fee/total/expiry.
- [x] Debounce/cancel re-quote pada selection/coupon change; response lama tidak boleh overwrite pilihan baru.
- [x] Coupon validation/reservation tetap server-atomic; UI label existing menerima mapped error. *(no coupon UI — OUT-OF-SCOPE; quote path ready; reservation remains server-side on intent)*
- [x] Snapshot audit menemukan tidak ada coupon input/error region pada `details-step.tsx`; jangan menambahkan control untuk memenuhi backend. Pilih `DISABLED/OUT-OF-SCOPE` atau dokumentasikan `UI-080` composition menggunakan komponen exact. *(DISABLED/OUT-OF-SCOPE)*
- [x] Freeze QR wallet semantics before wiring: define whether Continue creates the intent, Pay opens a provider/deep link, or the button is presentational. QR render/copy is only `IMPLEMENT` if an existing control exists; otherwise no new copy/button without `UI-080`. *(see `CHECKOUT_QR_WALLET_SEMANTICS`)*
- [x] Uang input integer IDR dan bounds divalidasi client untuk UX, server tetap authoritative.
- [x] Query/session state recoverable pada refresh tanpa menyimpan secret. *(public product/store re-resolve from route + `?store=`; quote re-fetched client-side; no secrets in URL/storage)*

### Checklist BE

- [x] Reprice published product/options/coupon/fee; ignore/reject client total. *(existing `POST /v1/checkout/quote`; public product emits `storeId` for quote bootstrap)*
- [ ] Snapshot immutable price/fee/coupon/product revision pada intent/order. *(owned by CHK-110 intent create)*
- [ ] Coupon reservation usage concurrency-safe dan expires/release. *(no FE coupon UI; BE path remains for later)*
- [x] Disposition `POST /v1/checkout/stock-reservations`: create-intent sudah harus mereservasi stock secara internal. Remove/unmount public browser route atau protect sebagai internal/capability-bound operation; browser tidak boleh mereservasi arbitrary stock terpisah dari intent. *(FE: never call; documented INTERNAL_ONLY; route remains server foundation until intent owns reservation in CHK-110)*
- [ ] Emergency QRIS checkout switch checked. *(runtime/provider — INT-180 / later)*
- [ ] Public rate limit/bot abuse controls. *(platform runtime — not FE wire)*

### Tests/AC

- [x] Tampered price/fee/discount ignored/rejected.
- [x] Stale product/coupon/stock returns typed state, not paid. *(stale re-quote sequence guard; no paid mapping from quote)*
- [x] Same selection renders existing UI values; visual baseline unchanged.

---

## CHK-110 — Create checkout intent dan idempotency

**Priority:** P0
**Depends on:** CHK-100, INT-180 Xendit sandbox
**Backend:** `POST /v1/checkout/intents`

### Checklist FE

- [x] Ganti `simulateCheckoutPayment` live branch dengan explicit `createCheckoutIntent`; simulator tetap mock/local-test only.
- [x] Request mapper mengikuti strict JSON backend; jangan mengirim view model/customer total mentah.
- [x] Buat opaque UUID idempotency key saat user pertama kali menekan bayar; same key untuk timeout/retry/recovery.
- [x] Disable existing CTA selama in-flight dan dedupe double-click/touch.
- [x] Simpan only non-secret intent identity/capability sesuai secure contract di memory; jika refresh recovery perlu, gunakan server-issued HttpOnly/session-bound mechanism atau purpose-bound capability yang tidak masuk query URL/storage.
- [x] Mutation result wajib dipakai; jangan lanjut ke QR/success bila create gagal.
- [x] Unknown network outcome melakukan lookup/recovery, bukan membuat intent baru otomatis.

### Checklist BE

- [ ] Idempotency same key/body -> same intent/order; changed body -> conflict.
- [ ] Merchant/store/product/revision/stock/coupon checked transactionally.
- [ ] Provider create timeout/unknown outcome handled without duplicate charge.
- [ ] Return QR payload/expiry/status through scoped capability/session.
- [ ] GET/expire intent memverifikasi capability/owner; ID saja tidak cukup.

### Tests/AC

- Double click, timeout, retry, replay, changed payload.
- Provider unavailable/timeout/unknown outcome.
- Satu logical click menghasilkan maksimum satu intent/order/provider reference.

---

## CHK-120 — QR render, polling, terminal state, dan smooth recovery

**Priority:** P0
**Depends on:** CHK-110
**Backend:** `GET /v1/checkout/intents/{intentId}`, optional expire

### State machine

```text
CREATING -> PENDING_PAYMENT -> PAID -> DELIVERY_READY
                      |
                      +-> EXPIRED/CANCELLED/FAILED
                      +-> UNKNOWN (recover by status lookup; never success)
```

Backend enum exact may differ; mapper must be exhaustive.

### Checklist FE

- [x] Render backend QR payload pada QR container existing; do not log/cache raw QR.
- [x] Expiry countdown memakai server `expiresAt` + calibrated server/client time, bukan arbitrary timer.
- [x] Poll safe GET dengan bounded exponential backoff + jitter; faster initially, slower in background.
- [x] Pause/reduce polling saat document hidden; immediate refresh on visible/online.
- [x] Abort poll/timer on unmount/terminal state/new intent.
- [x] Respect `Retry-After`; no overlapping polls.
- [x] Only backend `PAID` transition displays existing “Pembayaran berhasil!” state.
- [x] URL/status/client timer/provider wallet choice cannot mark paid.
- [x] Refresh/reconnect resumes exact intent securely and does not create duplicate. *(same-session memory intent id + poll; no secrets in URL/storage; hard-refresh guest capability = CHK-130)*
- [x] Expired/failed/pending/unknown tidak pernah menjadi paid atau mock success; gunakan hanya checkout feedback/inline state yang benar-benar ada, dan bila snapshot tidak punya composition maka block/disable capability melalui `UXE-003/UI-080`. *(stay on qris; no new failure card)*
- [x] Snapshot audit menemukan QR step tidak memiliki copy-QR control dan wallet/pay button masih simulator-bound; preserve existing composition only after provider semantics are frozen, or block/disable command via `UXE-003`. *(no copy-QR; pay = create-or-resume poll; mock simulator retained)*

### Checklist BE

- [ ] Provider callback is primary; polling reads canonical DB state.
- [ ] Duplicate/out-of-order/late events use allowlist and idempotency.
- [ ] `PAID` writes order/payment/ledger/outbox atomically as designed.
- [ ] Browser `expire` cannot expire paid/foreign intent and requires capability.

### Tests/AC

- Failed request never becomes paid after timer.
- Hidden/offline/refresh/slow provider/late callback/duplicate callback/expired cases.
- 80 duplicate events credit/order/delivery exactly once.
- Existing checkout critical-flow UI preserved.

---

## CHK-130 — Order result route dan guest access capability

**Priority:** P0
**Routes UI:** `/orders/[orderId]/[status]`
**Backend:** `/v1/orders/{orderId}`, delivery access endpoints

### Current risk

Page mempercayai `status` dari URL dan menampilkan hardcoded order/product data. Order ID alone tidak cukup sebagai authorization.

### Checklist

- [ ] Treat path `status` only as pretty/presentational; fetch canonical order state.
- [ ] Authorize via buyer session or opaque purpose-bound guest capability; never capability in query string/log.
- [ ] Jika fragment bootstrap diperlukan, scrub then exchange to HttpOnly/scoped access before fetch.
- [ ] Wrong path status canonicalizes/redirects safely based on backend response, tanpa open redirect.
- [ ] Unknown/foreign order returns generic not-found without enumeration.
- [ ] Map server order snapshot to existing success/pending/failure component; no hardcoded price/customer/order ID.
- [ ] Delivery secret not embedded in base order response.
- [ ] Public result responses `no-store` dan minimally disclose PII.

### Tests/AC

- Modifying URL status cannot change canonical display/authority.
- ID guessing without capability cannot distinguish order existence.
- Paid/pending/expired states mapped exact, visual unchanged.

---

## CHK-140 — Delivery access, resend, download, dan secret lifecycle

**Priority:** P0/P1
**Routes UI:** order result and buyer purchase detail
**Backend:** buyer/order delivery access/resend routes; proposed canonical buyer download exchange must be frozen in `INT-000` before enabling download/protected-link controls

**Contract gap:** snapshot buyer access returns only an object identifier while the only download-url operation is seller/store-scoped. Before enabling the existing download/protected-link button, freeze one owner/capability-bound exchange (preferred `POST /v1/buyer/purchases/{orderId}/delivery/download`) or an access response field with the same guarantees. Guest order result must use an equivalent purpose-bound capability.

### Checklist FE

- [ ] Base purchase/order query contains redacted delivery metadata only.
- [ ] Fetch credential/code/link/signed download only after explicit existing user action.
- [ ] Secret response tidak menggunakan React Query persistent/global cache; keep in component memory.
- [ ] Clear secret on expiry, unmount, logout, visibility change where policy requires, and actor/order switch.
- [ ] Signed URL opened directly; do not log/proxy/persist/copy automatically.
- [ ] Reuse existing code/link/credential UI; do not render secret in server HTML.
- [ ] Resend uses stable idempotency + rate limit; existing success/error state only after server result.
- [ ] Revoke/expired/consumed grant handled fail closed.

### Checklist BE

- [ ] Ownership/capability and delivery state verified each access.
- [ ] Per-item reveal/download audit and bounded rate limit.
- [ ] Secret encrypted at rest; raw only at explicit boundary.
- [ ] `Cache-Control: no-store`, no secret logs/audit metadata.
- [ ] Signed URL short TTL and purpose/object scoped.
- [ ] Freeze download/protected-link response: one-time or bounded-use capability, object/product scope, TTL, access count, `no-store`, audit event, rate limit, and browser-open semantics. Never return a seller-scoped URL to a buyer.

### Tests/AC

- Non-owner/expired/revoked/replayed access rejected.
- Browser cache/query devtools/storage/log has no raw secret.
- UI clears secret on TTL/unmount and maintains exact layout.

---

## CHK-150 — Invoice read, print/download, public verify

**Priority:** P1
**Routes UI:** order invoice, buyer invoice, `/invoices/verify/[token]`
**Backend:** order/buyer invoice and public verify endpoints

### Checklist

- [ ] Replace hardcoded `InvoiceView` data through mapper only; component markup unchanged.
- [ ] Authenticated invoice validates buyer/seller/admin permission/ownership.
- [ ] Guest order-result invoice CTA either exchanges the same scoped guest capability through a documented public operation or is explicitly login-gated/disabled; a valid guest purchase must not lead to an auth-only dead end.
- [ ] Public verify accepts privacy-safe code/body/capability contract; path token must not be raw bootstrap secret if logged.
- [ ] Verification response exposes minimal seller/order/amount/status/signature fields; no delivery secret/full buyer PII.
- [ ] Invoice is immutable snapshot; no client fee/total recomputation.
- [ ] Print/download uses verified server data or short-lived signed file, `no-store` as appropriate.
- [ ] Invalid/tampered/revoked code returns safe invalid state, never fabricated valid invoice.

### Tests/AC

- Snapshot totals remain correct after product/fee/profile changes.
- Public verify valid/invalid/tampered/enumeration/rate-limit.
- Existing invoice print/visual unchanged for equivalent data.

---

## BUY-100 — Buyer purchase list/detail metadata

**Priority:** P1
**Routes UI:** `/account/purchases`, detail
**Backend:** `GET /v1/buyer/purchases`, `GET /v1/buyer/purchases/{orderId}/` (router snapshot; slash policy must be frozen in INT-000)

### Checklist

- [x] Create DTO/schema/mapper from backend aggregate to existing `BuyerPurchase` view.
- [x] Refactor view contract so base purchase has redacted delivery metadata, not raw secret.
- [x] Server filter/search with bounded result; use cursor/page only when an existing/approved paging control exists.
- [x] Query keys include buyer subject/session boundary + filters and selected pagination profile.
- [x] Detail SSR uses server client/cookie/no-store or safe hydration.
- [x] Expected `RESOURCE_NOT_FOUND` -> not-found; `401` opens login, while `403` is not an auth flow—use backend safe-404 where enumeration-safe or block behind an approved existing unavailable composition/UI-080.
- [x] Keep previous page data during navigation/filter; abort stale queries.
- [x] Delivery/invoice/review action delegated to explicit adapters.

### Tests/AC

- Owner sees purchase; other buyer receives safe 404.
- Empty/loading/error preserve component geometry; pagination is an explicit bounded-result/UI-080 decision for this no-control screen.
- No secret in list/detail base response/cache.

---

## BUY-110 — Buyer reviews dan purchase actions

**Priority:** P1
**Backend:** `POST /v1/buyer/reviews`, `PATCH /v1/buyer/reviews/{reviewId}`, delivery/invoice routes

### Checklist

- [ ] Wire existing review card/form to create/update adapters.
- [ ] Eligibility, verified purchase, edit window, moderation status server-authoritative.
- [ ] Request exact rating/title/body/version; no arbitrary status.
- [ ] 409 version conflict preserves typed text and refetches authoritative review.
- [ ] Invalidate exact purchase/review/public summary keys after success.
- [ ] Do not optimistic-publish moderated review.
- [ ] Wire resend/download/invoice buttons to explicit task adapters; remove fake success.
- [ ] Treat “Gunakan versi baru” as a separate unresolved command: freeze whether it selects an already-entitled revision or requests a latest-version delivery read. It must check ownership/eligibility/revision, use idempotency if mutating, refresh delivery metadata, and never be satisfied by `setUpdated(true)`; otherwise disable the existing control.

### Tests/AC

- Non-owner/non-purchased/expired window/duplicate/create/edit conflict.
- Public summary updates only after allowed state.
- Version-update control has an exact operation/negative test or documented disabled disposition.
- Existing form/card/modal unchanged.

---

## BUY-120 — Buyer profile dan notification preferences

**Priority:** P1
**Routes UI:** `/account/profile`
**Backend:** buyer or `/v1/me/profile`, notification preferences

### Checklist

- [ ] `buyer-profile.tsx` menggunakan hook actual; jangan init hardcoded state sebagai truth.
- [ ] GET/PATCH schema + mapper; field/form names exact.
- [ ] Use revision/`If-Match`; 409 keeps user input and uses existing error surface.
- [ ] Email change melalui dual-confirm flow, bukan direct arbitrary patch.
- [ ] Do not attach a new handler/panel to “Mulai perubahan email” in this wiring slice; its canonical disposition is disabled/out-of-scope until `AUT-120` has an approved existing composition/UI-080 and negative-state evidence.
- [x] Avatar/photo launch disposition: `DISABLED`/`OUT-OF-SCOPE` (`INT-175` deferred). Do not use store-scoped object endpoint, data URL, or localStorage for personal media.
- [ ] Preferences server-persisted; theme local non-sensitive tetap boleh.
- [ ] Validate locale/timezone/phone/server constraints; PII redaction.

### Tests/AC

- Refresh shows persisted data; conflict does not lose input.
- Cross-session update visible after refetch.
- PII not logged/cached publicly; visual unchanged.

---

## BUY-130 — Buyer sessions dan account security

**Priority:** P1
**Routes UI:** `/account/security`
**Backend:** sessions list/revoke/revoke-others/revoke-all, password/MFA

### Current bug

Screen menginisialisasi local sessions sebelum async query selesai dan tidak sync. Revoke others berpotensi loop single endpoint.

### Checklist

- [ ] Map backend `{sessions:[...]}` dan fields ke existing `BuyerSession` view.
- [ ] Render authoritative query state; hindari stale copied local array.
- [ ] Current session ditentukan backend session ID, bukan device guess.
- [ ] Single revoke, bulk revoke others, revoke all menggunakan endpoint khusus.
- [ ] Revoking current/all clears session/private cache dan redirects safely.
- [ ] Mutation no optimistic removal untuk security; update after success, exact invalidate.
- [ ] Wire password/MFA dari `AUT-120` using existing panels.
- [ ] Session location/device text treated untrusted and escaped; no full raw IP if UI/privacy contract masks it.

### Tests/AC

- Current/other/all revoke; concurrent/revoked/expired session.
- Hard refresh consistent; no ghost sessions.
- Visual account-security baseline unchanged.

---

## BUY-140 — Notification center dan profile shell authority

**Priority:** P1
**Surfaces:** buyer/seller/admin shells
**Backend:** `/v1/{surface}/notifications`, unread/read-all/read

### Checklist

- [ ] Replace hardcoded notification dataset with surface-scoped query + mapper.
- [ ] Unread count and list remain backend authoritative; preserve notification center JSX/style.
- [ ] Mark one/read-all mutation after server success; exact optimistic update allowed only if rollback implemented and no security consequence.
- [ ] Load/filter behavior does not resize shell unexpectedly; any future cursor requires an approved existing control.
- [ ] Notification target URL is server-provided enum/resource mapped to allowlisted internal route, never arbitrary URL.
- [ ] Profile name/email/session/logout from session provider; no mock identity in API mode.
- [ ] Clear notification cache on logout/surface/actor/impersonation change.

### Ownership boundary

`BUY-140` memiliki shared notification API adapter/query/mutation dan binding primitive `NotificationCenter`. `SEL-420` dan `ADM-230` hanya memasok surface/session context serta acceptance tests; jangan membuat tiga adapter notification berbeda.

### Tests/AC

- Buyer cannot read seller/admin notifications and vice versa.
- Malicious external target rejected/mapped safely.
- Read/read-all race reconciles with server.
- Existing shell/menu visual and critical flow preserved.

---

## Domain completion checklist

- [ ] No production call to `simulate-payment`.
- [ ] Browser never sets paid/price/fee/ownership.
- [ ] Auth/session/CSRF/MFA hard-refresh flow works.
- [ ] All bootstrap tokens use fragment scrub + one-time POST exchange.
- [ ] Base purchase/order/invoice reads do not contain delivery secret.
- [ ] Public/auth/buyer screens use runtime schemas/mappers.
- [ ] API errors do not fallback to mock.
- [ ] Existing visual/smoke/a11y/critical suites pass unchanged.
- [ ] API-mode E2E covers public -> checkout sandbox -> paid callback -> delivery -> buyer purchase/invoice/review.
