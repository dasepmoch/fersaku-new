# Domain Tasks — Seller Workspace

**Dependency rule:** gunakan dependency per-row dan pilot `co-evolve` pada `09-EXECUTION-STATUS.md`.
**Live payment/withdrawal/upload dependency:** `INT-180/INT-185` sesuai adapter/lifecycle yang dipakai.

Semua route `/dashboard/**` harus tetap memakai shell, navigation, cards, tables, dialogs, form controls, chart, copy, dan responsive behavior existing.

**Pagination profile rule:** `NumberedPageList` hanya untuk screens yang benar-benar merender existing `TablePagination`; `CursorList` hanya untuk existing prev/next/infinite interaction. Jika screen tidak memiliki paging control, server tetap mengirim bounded first result dan task wajib memilih launch invariant atau `UI-080`—jangan menambahkan pagination atau menyebut cursor history sebagai navigasi UI.

---

## SEL-100 — Merchant/current-store bootstrap dan route readiness

**Priority:** P0
**Backend:** `GET /v1/seller/me/merchant`, store lookup, onboarding status
**Current risk:** seluruh seller query menggunakan `DEMO_STORE_ID`; storefront memakai demo ID lain.

### Checklist

- [x] Buat schema/mapper untuk merchant, memberships, canonical/current store, capabilities, onboarding state.
- [x] Backend dependency: snapshot `/v1/seller/me/merchant` hanya mengembalikan first active merchant/role. Extend endpoint itu atau freeze satu endpoint bootstrap canonical di `INT-000` untuk seluruh allowed stores, scoped capabilities, `canonicalStoreId`, dan server-selected `currentStoreId`.
- [x] Backend migration/policy `INT-150` harus dapat membedakan tenant member read/write; snapshot `OWNER|STAFF` + global permission belum cukup.
- [x] Bootstrap setelah seller session dan sebelum query seller enabled.
- [x] Current store berasal dari membership backend; client-stored ID hanya preference dan harus divalidasi ulang.
- [x] Snapshot `dashboard-shell.tsx` hanya memiliki store-switch button tanpa menu/handler. Launch default is canonical single-store context with the switch control disabled/hidden through the exact existing state, or obtain `UI-080` approval for an existing menu composition; do not invent a dropdown while wiring.
- [x] Berikan store context ke hooks tanpa mengubah prop/markup shell.
- [x] Hapus `DEMO_STORE_ID` dari API-mode code path; pertahankan mock provider khusus mode mock.
- [x] Semua query keys memuat store ID; cancel/remove tenant cache saat store/actor/impersonation berubah.
- [x] Route yang membutuhkan completed onboarding redirect berdasarkan server state, bukan local flag.
- [x] Store suspended/API capability state tidak dicampur; UI hanya memakai existing badge/control mapping.
- [x] Foreign/tampered store ID ditolak backend sebagai safe 404.

### Tests/AC

- Owner/member/multi-store/foreign/no-store/unfinished onboarding.
- Store switch (if capability is enabled) does not show row/cache store lama even one frame; canonical-only disposition has a direct test that tampered preference is rejected.
- Mock screenshots tetap identik dengan demo provider.

---

## SEL-110 — Onboarding create/resume/complete

**Priority:** P0/P1
**Route UI:** `/dashboard/onboarding`
**Backend:** `GET /v1/onboarding/`, `POST /v1/onboarding/store`, `PATCH /v1/onboarding/store`, `POST /v1/onboarding/complete`, `GET /v1/stores/slug-availability`

### Checklist FE

- [x] Pertahankan `store-onboarding` layout/stepper/form exact.
- [x] GET/resume server progress pada load/refresh; jangan reset ke step awal.
- [x] Slug availability debounced, cancellable, normalization sama dengan backend; stale response tidak overwrite input terbaru.
- [x] Store create memakai idempotency key; duplicate submit tidak membuat dua store.
- [x] PATCH exact draft fields/revision; map `400 VALIDATION_FAILED` dan slug conflict ke form existing.
- [x] Completion server-authoritative; setelah success refetch merchant context lalu redirect.
- [x] Completion panel currently says “Storefront mock telah dibuat” and hardcodes “Atelier theme • Published”. In API mode, bind the same text nodes/classes to truthful returned theme/publish state and remove only the documented fake/mock claim; if exact approved copy/value mapping is unavailable, block via `UI-080`. Do not leave “Published” when backend state differs or alter geometry.
- [x] Product creation tetap optional sesuai existing product rule; canonical store mandatory.
- [x] Jika emergency registration off, gunakan hanya feedback/unavailable state yang benar-benar sudah ada dan lulus characterization; bila `StoreOnboarding` tidak memiliki composition tersebut, blokir capability atau minta `UI-080`—jangan membuat maintenance banner/copy/panel baru di wiring PR.

### Checklist BE

- [x] One canonical store invariant + tenant membership transaction.
- [x] Slug unique/normalized/race-safe; availability is advisory, create remains authoritative.
- [x] Resume state and completion idempotent.
- [x] Audit creation/completion without PII leakage.

### Tests/AC

- Refresh each step, two tabs same slug, duplicate create/complete, validation/rate limit.
- Final route uses real current store; no demo ID.
- Visual onboarding unchanged.

---

## SEL-200 — Overview metrics, revenue/order/product summary, traffic

**Priority:** P1
**Route UI:** `/dashboard`
**Backend:** seller product/order/finance reads, analytics overview/traffic

### Current gap

Sebagian query ada, tetapi metrics/traffic/chart filters masih hardcoded dan seller order read model belum tersedia.

### Checklist

- [x] Define one bounded overview read model atau parallel queries dengan consistent `asOf` timestamp; jangan calculate financial truth dari UI rows.
- [x] Map product count, order count/status, gross/net/revenue, conversion/traffic/source series ke existing cards/chart.
- [x] Range/channel filter masuk query key dan server query; keep previous chart while refetch.
- [x] Revenue/fee/net berasal ledger/read model, bukan client assumptions.
- [x] Partial query failure memakai existing error surface without fabricating zeros.
- [x] Background refresh tidak blank/shift layout.
- [x] Analytics export bila existing control aktif: server job/stream, bounded dates, permission, audit, signed short URL.

### Tests/AC

- Empty/new store, seeded store, date boundary/timezone, late payment update, partial failure.
- Cross-store isolation.
- Dashboard visual baseline unchanged.

---

## SEL-210 — Product list server search/filter/sort/bounded result

**Priority:** P1
**Route UI:** `/dashboard/products`
**Backend:** `GET /v1/stores/{storeId}/products`

### Checklist

- [x] Request query: normalized search, status/type filter, sort, bounded limit; cursor/page is allowed only after the actual product screen receives an approved paging composition (`UI-080`), because snapshot `products/list.tsx` has no `TablePagination`. *(FE: `SELLER_PRODUCT_LIST_LIMIT` + client filter map; BE list has no search/limit query yet — no invented page control.)*
- [x] Schema + mapper to existing `CatalogProduct` view; do not import fixture in presentation.
- [x] Keep existing table/card/filter. Snapshot product list has no pagination control; do not add one. If product volume requires navigation, block the flag or obtain `UI-080`, then use `NumberedPageList` authoritative (`page/pageSize/totalCount/pageCount`) from `INT-020`.
- [x] Debounce/cancel search and keep previous data.
- [x] Stable ordering + ID tie-breaker prevents duplicate/skipped rows. *(Preserve BE `created_at DESC, id DESC` order; bound first N after filter.)*
- [x] Status enum exhaustive; unknown is not mapped to published/live.
- [x] Query key includes store/filter/sort and the selected pagination profile only when a real control exists. *(profile: `bounded` only — no cursor/page key.)*
- [x] Snapshot product grid has no empty composition. Because a new store can legitimately have zero products, API activation needs a product-owner-approved non-empty launch invariant or `UXE-012/UI-080`; never inject fixtures, silently collapse the card, or add empty copy in wiring. *(Empty array → empty grid geometry only; no demo inject / no new empty copy.)*

### Tests/AC

- Bounded-result behavior (and explicit out-of-scope/UX exception if more rows must be reachable), filter reset, abort stale search, archive/publish invalidation.
- Do not fetch all products just to paginate locally.
- Visual product list baseline unchanged.

---

## SEL-220 — Product draft/create/edit/archive/publish/release

**Priority:** P1
**Routes UI:** product new/detail
**Backend:** product create/get/patch/publish/archive, object/inventory associations

### Checklist FE

- [x] Wire existing form submit to create draft; map only allowed DTO fields.
- [x] Freeze delivery-type mapping: visual option `credentials` bukan catalog product type baru. Map ke catalog `type: "code"` plus structured inventory schema/delivery kind `CREDENTIAL`; visual option `code` maps `type: "code"` plus single-field/code delivery. Jangan cast string atau menambah backend enum diam-diam.
- [x] React Hook Form/Zod client validation mirrors UX but backend remains authoritative.
- [x] Map backend field violations/slug conflict to existing controls without layout/copy change.
- [x] Save edit with expected revision/ETag; 409 preserves user input and offers existing retry/reload behavior.
- [x] Publish only after required product/inventory/object validations; response status/revision authoritative.
- [x] Archive uses explicit endpoint, confirmation existing, reason/idempotency if contract requires.
- [x] Distinguish catalog publish from file/product release; do not overload publish endpoint for a different UI command.
- [x] Detail SSR forwards cookie via server client and maps only expected 404 to `notFound()`.
- [x] Exact invalidation: list/detail/public store/product/overview as affected.

### Checklist BE

- [ ] Strict decode errors returned; do not swallow body decode.
- [ ] Tenant guard on every operation.
- [ ] Unique slug/revision transitions and publish preconditions transactionally enforced.
- [ ] Idempotency for create/publish/archive/release where duplicate has side effects.
- [ ] Published snapshot/cache invalidation/outbox atomic.

### Tests/AC

- Duplicate create/publish, stale revision, invalid transition, missing stock/object, cross-store.
- Refresh after success shows server truth.
- Form/detail UI unchanged.

---

## SEL-230 — Product/public asset upload lifecycle

**Priority:** P1
**Backend:** store object upload/create/complete/metadata/download
**Existing limits:** purpose-scoped, signed PUT, checksum, scan.

### Intended flow

```text
select existing dropzone/button
  -> validate UX bounds
  -> POST upload intent
  -> PUT bytes directly to signed URL
  -> POST complete with checksum
  -> poll/refetch scan READY
  -> attach objectId to product/draft
```

### Checklist FE

- [ ] Keep existing upload/dropzone visuals; add hidden/input behavior using same component styling.
- [ ] Client MIME/size validation for immediate feedback; server repeats magic-byte/size/checksum validation.
- [ ] Compute checksum using browser-safe streaming/worker if practical; avoid blocking main thread for large file.
- [ ] Direct PUT signed URL; do not proxy large file through Next.
- [ ] Do not manually set multipart `Content-Type`; for signed PUT follow required headers exact.
- [ ] Progress/cancel/retry map to existing controls; abort cleans request and marks orphan for server expiry.
- [ ] Never persist/log/report signed URL, object key, token, or raw bytes.
- [ ] `complete` only after upload success; poll bounded scan state.
- [ ] Attach opaque object ID, not provider bucket path.

### Checklist BE/runtime

- [ ] Global unique create-only keys, conditional writes, narrow MIME/purpose/size limits.
- [ ] Checksum and object metadata validation plus actual content magic-byte sniff after server/scanner reads the uploaded object; `HEAD` metadata saja tidak cukup.
- [ ] Freeze lifecycle sebelum FE polling. Recommended async contract: upload intent -> direct PUT -> complete validates metadata/checksum and returns `202 SCANNING` -> worker sniff/scan -> `READY|REJECTED`; jika memilih synchronous, dokumentasikan timeout/status/retry exact. Add `SCANNING` schema/migration only deliberately.
- [ ] Snapshot staging/prod saat ini returns 500 “scanner unavailable” dan tidak memiliki scan worker transition; implement real scanner/quarantine/job via `INT-180/185`, while local/test uses explicit deterministic scanner—not unconditional READY hidden as production parity.
- [ ] Scanner unavailable fails closed with recoverable typed state; duplicate complete/poll idempotent.
- [ ] Signed URL short TTL, private/public bucket policy correct.
- [ ] Orphan intent/object cleanup worker.

### Tests/AC

- valid, oversize, MIME spoof, checksum mismatch, cancelled, expired URL, duplicate complete, malware, scanner unavailable.
- No signed URL/raw key in telemetry/storage.
- Existing upload component layout unchanged.

---

## SEL-240 — Inventory read model, schema, import, item reveal/revoke

**Priority:** P0/P1
**Routes UI:** inventory list/detail
**Backend:** store inventory product/schema/items/import/reveal/revoke

### Current mismatch

FE inventory contract berasal dari mock shape; backend summary/detail memiliki shape berbeda. Detail screen mengimpor mock schema/items. Reveal security mempercayai client claim pada snapshot.

### Checklist BE

- [x] Add/extend seller inventory read DTO yang menyediakan fields needed existing UI: product title/type, count available/reserved/sold-or-delivered/invalid-or-revoked, threshold/delivery config, schema version.
- [x] Join catalog safely in read model; no per-row N+1.
- [x] Split list profiles by actual JSX: inventory product list is bounded/no-paging; only detail `StockItemsTab` uses authoritative `NumberedPageList`. Secrets always redacted.
- [x] Schema GET/PUT with version/If-Match; validate field definitions/limits.
- [x] Import atomic policy documented: all-or-nothing or partial with exact row errors; idempotency and dedupe.
- [x] Reveal verifies tenant + permission + actual recent MFA server-side; remove client boolean authority.
- [x] Revoke/invalid transitions explicit, audited, concurrency-safe.

### Checklist FE

- [x] Define transport DTO/schema and mapper to existing `InventoryProduct`; decouple contract from `typeof stockProducts`.
- [x] Remove presentation import of mock schema/items; mock goes behind adapter.
- [x] Wire inventory list as bounded/no-paging and detail stock items with the exact existing `TablePagination`/`NumberedPageList`; do not add pagination to the list screen.
- [x] Inventory product list has no empty composition; zero products require `UXE-012` launch invariant/disable/UI-080 before canary.
- [x] No copy control exists in the snapshot inventory UI. Do not add one; raw reveal stays component-local and any future copy action requires characterization/UI-080.
- [x] Reveal response component-local `no-store`, TTL cleanup; no React Query cache/storage/log/export.
- [x] Use actual step-up proof from `INT-140`; same exact reveal dialog/control.
- [x] Invalidate exact inventory/product/overview keys after import/revoke.

### Tests/AC

- owner/member/foreign permission matrix; reveal missing/expired/wrong-purpose proof.
- schema conflict, import duplicate/row invalid/concurrent reserve, revoke delivered/reserved.
- secret absence in list/cache/log/SSR.
- Inventory UI pixel-equivalent for normalized data.

---

## SEL-250 — Seller order list/detail read model dan delivery actions

**Priority:** P0 backend gap, P1 wiring
**Routes UI:** seller orders list/detail
**Missing backend:** `GET /v1/stores/{storeId}/orders[/{orderId}]`
**Existing backend:** delivery resend/retry/revoke subroutes

### Backend task

- [x] Implement store-scoped order list with search/status/source/date filters and authoritative `NumberedPageList` (`TablePagination` exists), bounded limit, stable ordering.
- [x] Implement detail read model containing immutable order/item/customer display snapshot, amount/discount/tip/fee/net integer IDR, payment state/reference summary, timeline, delivery state/attempts, invoice/review metadata—no raw delivery secret.
- [x] Enforce store membership; foreign ID -> safe 404.
- [x] Avoid N+1 with dedicated query/read model.
- [x] Define status/source enums and late provider event behavior.
- [x] Delivery resend/retry/revoke transition, idempotency, rate limit, reason/audit as applicable. *(existing BE-235 commands retained; UI wires resend only)*

### Frontend task

- [x] Update `features/orders/api.ts` schema/mapper; normalize backend list/meta to `NumberedPageList<SellerOrder>` behind adapter.
- [x] Extend existing view model only as presentation needs; do not show arbitrary backend fields.
- [x] Wire existing filters/table/pagination/timeline/detail panels.
- [x] Current seller order UI exposes resend email delivery, but no characterized retry/revoke control. Wire resend only; keep retry/revoke backend operations out-of-scope/disabled for this UI until an existing dialog/control is approved—do not add buttons or infer `MoreHorizontal` behavior.
- [x] Never calculate net/fee from UI guesses; use immutable server snapshot.
- [x] Detail SSR server client/cookie/no-store.
- [x] Mutation no optimistic success; invalidate exact list/detail/overview.

### Tests/AC

- empty/filter/profile tie-breaker, cross-store, payment pending/paid/late, delivery transitions, duplicate resend.
- no raw secret in order reads.
- Existing seller order visual/critical pagination behavior preserved.

---

## SEL-260 — Seller customer list/detail, history, notes, communication

**Priority:** P1 backend gap
**Routes UI:** customer list/detail
**Missing backend:** seller customer domain/read routes

### Backend task

- [x] Define customer as store-scoped aggregate derived from purchases, not global buyer profile exposure.
- [x] List: stable ID, display name/email masking policy, purchase count/spend/last purchase, consent/status, bounded search/sort and declared pagination profile.
- [x] Detail: bounded order history, metrics, internal notes with version/audit, consent-aware contact actions.
- [x] Decide guest/customer identity merge semantics and privacy retention. *(merge key: lower(trim(email)) within store; guest rows with empty email excluded)*
- [x] Add `GET /v1/stores/{storeId}/customers`, detail, notes command, optional bounded export/contact command only if UI control active. *(export/email remain unwired — no characterized action)*
- [x] Tenant guard + PII permission/redaction + rate limit/audit. *(membership + safe 404; notes versioned)*

### Frontend task

- [x] Schema/mapper to existing `SellerCustomer`; use server customer ID, not order ID as pseudo identifier.
- [x] Wire list/detail/metrics/history/notes to hooks; remove hardcoded/local notes in API mode.
- [x] Preserve table/detail composition and existing modal/form.
- [x] Server search plus declared pagination profile; do not load all customers locally.
- [x] No raw PII in query keys/telemetry/export filename.

### Tests/AC

- Guest/buyer/repeat customer, consent absent, foreign store, note conflict, PII redaction/export permission.
- UI list/detail unchanged.

---

## SEL-270 — Seller reviews summary/list/reply/report

**Priority:** P1 backend gap
**Route UI:** `/dashboard/reviews`

### Current issue

Screen memanggil query tetapi menginisialisasi/merender demo state; backend tidak memiliki seller read/summary/reply/report routes.

### Backend task

- [x] Store-scoped review list joined with product and safe buyer display; bounded filter/status/rating. Snapshot has no pagination control, so no hidden cursor/page navigation.
- [x] Store summary aggregate compatible with UI distribution.
- [x] Seller reply create/update with version and transition policy.
- [x] Report command with reason/category, idempotency, audit; no arbitrary moderation status.
- [x] Permission/tenant/privacy enforcement.

### Frontend task

- [x] Use query data as authority; no initial demo copy in API mode.
- [x] Mapper backend IDs/fields to existing `SellerReview` and `SellerRatingSummary`.
- [x] Replace every hardcoded summary truth (`4.8`, `186`, `82.8%`, verified percentage/count) with the authoritative mapped summary; zero denominator must never render `NaN`/success-like claims.
- [x] Snapshot has no empty composition. A zero-review store requires a truthful non-empty launch invariant or `UXE-012/UI-080` before API activation; do not retain demo rows/summary or invent an empty card.
- [x] Wire reply/report through existing controls/dialog; pending/failure not success.
- [x] Exact invalidate seller/public summary/list as state permits.
- [x] Keep local draft text only until submit; server reply version after success.

### Tests/AC

- verified/nonverified, no reply/update conflict, report duplicate/permission, moderation changes.
- Cross-store isolation and PII safety.
- Existing review screen visual unchanged.

---

## SEL-280 — Coupon lifecycle dan checkout redemption

**Priority:** P1
**Routes UI:** coupon list/new
**Backend:** store coupon CRUD/status, checkout quote/reservation

### Checklist

- [x] Define schemas/mappers for list/detail/create/patch/activate/pause/archive and usage metrics.
- [x] Wire existing form/list/toggle/actions; remove local-only source in API mode.
- [x] Server validation: code normalization/unique, date range/timezone, type/value bounds, min spend, max discount, products, total/per-buyer limits. *(BE CouponService; FE maps integers only)*
- [x] Status transition explicit; no arbitrary status patch.
- [x] Optimistic concurrency on edit; stable idempotency create/status actions.
- [x] Checkout uses server reservation/redemption transaction; UI never decrements usage as authority. *(checkout coupon UI remains DISABLED/OUT-OF-SCOPE per CHK-100; quote/reserve BE path unchanged)*
- [x] Search/filter and declared pagination profile if dataset grows; query keys store scoped. *(BE full list + client TablePagination; NumberedPageList when BE meta lands)*
- [x] Exact invalidation list/detail/checkout quote where relevant. *(list+detail invalidate; checkout quote N/A without coupon UI)*

### Tests/AC

- Concurrent last-use, expired/not-started/paused/product mismatch/minimum, duplicate code, stale edit. *(unit: lifecycle, foreign 404, mock path, stale patch; BE integration remains coupons_test.go)*
- UI list/form unchanged.

---

## SEL-300 — Storefront studio draft, autosave, revision, publish

**Priority:** P1
**Route UI:** `/dashboard/storefront`
**Backend:** storefront GET, PUT draft, POST publish

### Current state

Draft/undo/audit disimpan localStorage; only publish API seam exists dan request body tidak align strict backend.

### Checklist FE

- [x] GET studio/draft/revision on load; map to existing `BuilderConfig` without changing builder UI.
- [x] Local undo/redo remains client-only presentation history; authoritative draft is backend.
- [x] Debounced/cancellable PUT draft with `expectedRevision`/`If-Match`; do not autosave every keystroke without coalescing.
- [x] Offline/network failure retains local in-memory edits and existing saved/error indicator; no permanent local authority.
- [x] 409 conflict preserves both local draft and server revision; use existing panel/dialog path per UI freeze.
- [x] POST publish exact revision/config contract, stable idempotency, reason header if needed.
- [x] Stop sending unknown view fields; fix backend swallowed decode error to fail strict.
- [x] Preview products from current seller catalog, not demo imports on API path.
- [x] Public cache/tag invalidation after publish.

### Checklist BE

- [x] Strict decode and revision/ETag conflict.
- [x] Draft/published immutable revision semantics.
- [x] Tenant guard and atomic publish/outbox/cache invalidation.

### Tests/AC

- Two tabs conflict, debounce race, offline/reconnect, duplicate publish, stale revision, refresh recovery.
- Existing storefront undo/redo critical flow and visual baseline unchanged.

---

## SEL-310 — Store presentation, custom domains, SEO/settings

**Priority:** P2/P1 if active launch scope
**Backend:** store presentation patch, domain CRUD/verify/host resolve

### Checklist

- [ ] Wire store name/slug/logo/theme/SEO/custom links through request mapper + revision.
- [ ] Domain create validates normalized host and ownership; reject public suffix/internal/unsafe hosts.
- [ ] Verification status/DNS instructions/TLS state map to existing UI components.
- [ ] Verify is idempotent/rate-limited; background state refresh bounded.
- [ ] Delete/unbind reason/audit and public cache/host resolution update.
- [ ] Real DNS/edge adapter required for staging/live; fake only local/test.
- [ ] Asset/logo uses `SEL-230` object lifecycle.

### Tests/AC

- domain ownership conflict, DNS propagation, TLS pending/fail, delete/re-add, host spoof.
- No UI redesign; custom domain not rolled out if real adapter unavailable.

---

## SEL-320 — Outbound seller webhooks

**Priority:** P1
**Route UI:** `/dashboard/webhooks`
**Backend:** endpoints list/create/update/test, deliveries, secret rotation/claim

### Checklist FE

- [ ] Replace seed/timer/local deliveries with schemas/hooks while preserving existing list/form/detail UI.
- [ ] List returns masked endpoint/signing state only; raw secret never on GET.
- [ ] Create/rotation uses request -> one-time claim -> component-local display; no cache/storage/log.
- [ ] Map delivery history/status/attempt safely; route's declared pagination profile/filter.
- [ ] Test event mutation stable idempotency and actual response status from server.
- [ ] Seller retry only if endpoint exists/permission contract allows; otherwise UI control mapped to supported action.
- [ ] Clear claimed secret on TTL/unmount/visibility/logout.

### Checklist BE/security

- [ ] HTTPS URL allowlist, DNS resolve + SSRF protections, redirect policy, private/link-local/metadata IP block, re-resolution.
- [ ] Envelope-encrypted signing secret owned by endpoint; distinct from API credential.
- [ ] Durable delivery/outbox, retry schedule/DLQ, signature/timestamp/replay protection.
- [ ] Request/response headers/body evidence redacted/bounded.
- [ ] Tenant guard, rate limit, audit.

### Tests/AC

- SSRF variants/redirect/DNS rebinding, secret one-time/replay/expiry, delivery retry/DLQ.
- No raw secret outside claim component.
- UI unchanged.

---

## SEL-330 — Seller QRIS API credentials dan KYC capability

**Priority:** P1
**Route UI:** `/dashboard/api-keys`
**Backend:** credentials list/request/claim/revoke, KYC status/case

### Checklist FE

- [ ] List masked credential metadata/status only; remove fixed fake raw key on API path.
- [ ] Request issuance requires eligibility/KYC/recent MFA according to backend policy.
- [ ] Claim endpoint one-time; raw key component-local with TTL and explicit copy/download using existing `SecretRow`.
- [ ] Revoke/rotate confirmation existing, actual step-up, stable idempotency, no optimistic success.
- [ ] Separate API auth key from outbound webhook signing secret in mapper/lifecycle.
- [ ] KYC status for live QRIS API only; storefront functionality not incorrectly gated.
- [ ] Never put key/claim/MFA token in URL/query/storage/query cache/log/telemetry.

### Checklist BE

- [ ] Admin may authorize but never receives raw seller key.
- [ ] Claim purpose/owner/session/MFA bound, hashed one-time expiry.
- [ ] Key lookup hash/encryption, status/capability/mode isolation, rotation grace policy explicit.
- [ ] KYC document via server-mediated upload (`SEL-330`/`ADM-340`), not presign.

### Tests/AC

- claim success/replay/expired/wrong user, revoke/rotate, admin cannot claim, API mode sandbox/live isolation.
- Raw key disappears on cleanup and never returns from list.

---

## SEL-340 — Seller web profile/settings/security/bank preferences

**Priority:** P1
**Route UI:** `/dashboard/settings`
**Backend:** `/v1/me/profile`, preferences, auth security, bank accounts

### Checklist

- [ ] Map personal/business profile to existing forms; revision/conflict behavior.
- [ ] Notification preferences server-persisted; theme remains safe local preference.
- [ ] Password/email/MFA/session flows reuse `AUT-120`/security adapters.
- [ ] Bank CRUD/verify/make-primary/delete uses server validation/lookup; never trust typed bank label/account owner.
- [ ] Mask account number; raw values not log/query key; sensitive changes require recent proof and trigger withdrawal lock according to backend policy.
- [ ] Remove fake audit append/local saved truth on API path.
- [x] Personal avatar launch disposition: `DISABLED`/`OUT-OF-SCOPE` (`INT-175` deferred). Business/store logo remains store-scoped `SEL-230`. Never use store object ownership for personal avatar.
- [ ] Reuse shared auth/security adapters dari `AUT-120`; task ini hanya bind seller settings screens.

### Tests/AC

- profile conflict, bank invalid/duplicate/verification mismatch/primary/delete, MFA/session change, withdrawal lock consequence.
- Existing settings tabs/forms/dialogs unchanged.

---

## SEL-400 — Finance summary, revenue, ledger normalization

**Priority:** P0 authorization, P1 wiring
**Routes UI:** `/dashboard/balance`, overview
**Backend:** store finance summary/ledger/revenue

### Checklist BE

- [x] Apply actor/store tenant guard to summary/ledger/revenue; permission-only is insufficient.
- [x] Read model integer IDR from authoritative ledger, with source (`STOREFRONT`, `QRIS_API`, mixed allocation).
- [x] Stable ordering and filter/range/source under the declared pagination profile; no mutable derived client totals.

### Checklist FE

- [x] Schema/mapper for summary/revenue/ledger including `SETTLEMENT_RELEASE` and future exhaustive status handling.
- [x] Normalize backend pagination shape to existing ledger UI.
- [x] Query key store/range/source and selected pagination profile.
- [x] Money formatting via existing formatter; never float/recompute balance.
- [x] Keep previous chart/table during refresh; no zero fallback on error.

### Tests/AC

- Cross-store denied, empty/new store, mixed source, settlement release, pagination profile, integer overflow/boundary.
- Balance/overview visuals unchanged.

---

## SEL-410 — Withdrawal quote -> recent auth -> create -> history/lock

**Priority:** P0 security/money, P1 UI wiring
**Routes UI:** withdrawal list/new
**Backend:** bank, quote, withdrawal list/detail/lock/create, disbursement callback

### Current mismatches

- Quote/list/lock response fields/status/wrapping berbeda.
- FE sends unknown `reauthProof` JSON field to strict backend.
- Fake password proof and `Date.now()` idempotency.
- Tenant guard/callback auth need hardening.

### Checklist FE

- [ ] Mapper quote: `quoteId`, amount debited, fees, net disbursement, expiry/status -> existing view fields.
- [ ] Mapper list/detail/status/bank mask/source/timestamps -> existing rows without client financial calculation.
- [ ] Load actual primary/selected bank from API, not demo ID.
- [ ] Quote request stable idempotency and explicit bank ID; server fee verified.
- [ ] Quote expiry countdown invalidates submit and requires requote.
- [ ] Obtain actual recent proof from `INT-140`; send via canonical header/body contract only.
- [ ] Create withdrawal uses UUID logical-intent key retained across timeout/retry, not timestamp.
- [ ] Unknown outcome checks withdrawal/idempotency status before new request.
- [ ] No optimistic history/success; only authoritative create result.
- [ ] Exact invalidate summary/ledger/withdrawal/lock.

### Checklist BE

- [ ] Actor/store guard, balance/minimum/lock/bank ownership/quote validity/consumed checks transactionally.
- [ ] Same key/body replay; different body conflict; concurrent overspend prevented.
- [ ] Recent proof verified server-side.
- [ ] Provider fee variance/unknown outcome/reserve/ledger rules explicit.
- [ ] Signed/authenticated disbursement callback with dedupe/full reference.

### Tests/AC

- below min, insufficient, locked, no verified bank, expired/consumed quote, fee change, double click, timeout/retry, concurrent withdrawals, cross-store, callback duplicate/tamper/unknown.
- Existing verified-quote -> submit -> history critical UI flow preserved with API truth.

---

## SEL-420 — Seller notifications/profile/logout shell

**Priority:** P1
**Depends on:** BUY-140/INT-120

### Checklist

- [ ] Use seller notification alias and session/current-store mapped identity.
- [ ] Preserve dashboard shell menus and all classes/copy.
- [ ] Mark read/read-all and logout actual backend actions.
- [ ] Mode-gate mock interaction feedback.
- [ ] Store suspension/impersonation banner derives server session state, not URL/sessionStorage.
- [ ] Clear seller cache/secret claims on logout/actor/store switch.

### Tests/AC

- Notifications isolated by recipient/surface.
- Logout/revocation/multi-tab behavior.
- Existing theme/notification/profile critical flow visual and interaction unchanged.

---

## Seller completion gate

- [ ] No `DEMO_STORE_ID` reachable in API-mode seller path.
- [ ] No seller presentation imports fixture/mock/local audit.
- [ ] Missing seller order/customer/review dependencies implemented and contract-tested; admin inventory reveal tetap gate independen `ADM-320`.
- [ ] StoreAccessGuard covers every store-scoped service.
- [ ] Product/object/inventory/storefront revisions and idempotency tested.
- [ ] Finance/withdrawal exact money, recent MFA, callback security tested.
- [ ] Raw inventory/API/webhook/delivery secret never enters cache/storage/log.
- [ ] All seller routes smoke/a11y; selected routes pixel-identical desktop/mobile.
- [ ] Full API-mode seller E2E: login -> onboarding/store -> product/upload/inventory/publish -> order/delivery -> customer/review -> balance/withdrawal -> settings/webhook/key.
