# Endpoint Contract Matrix — UI ↔ FE Seam ↔ Go API

Snapshot ini berasal dari router/handler aktual pada 17 Juli 2026. `backend/api/openapi.yaml` harus diperbaiki lewat `INT-000` sebelum menjadi source of truth generated client.

## Legend

- **A — Available:** route terpasang dan belum ada mismatch material yang teridentifikasi; tetap belum complete sampai tests/evidence.
- **M — Mismatch:** route ada tetapi contract/security/pagination/FE behavior belum align.
- **G — Gap:** route yang dibutuhkan UI/FE belum ada.
- **U — Unwired:** backend route ada, UI masih mock/local atau belum punya feature adapter lengkap.
- **T — Test-only:** route hanya local/test dan dilarang production.
- **D — Decision:** endpoint/surface harus diimplementasi atau live-disabled secara eksplisit.
- **C — Complete:** provider + consumer + security + E2E + UI evidence link tersedia.

Satu row memakai tepat satu status readiness terburuk; jangan menulis kombinasi `A/M`, `U/M`, atau mencampur priority seperti `M/P0`. Kolom terakhir menjadi task/evidence: saat `C`, ganti/tambahkan link evidence. Priority dan execution status task berada pada `09-EXECUTION-STATUS.md`.

Status bukan tanda task selesai. Route `A` tetap belum siap sampai runtime adapter, auth, tenant, contract, dan test lulus.

## 1. Contract global

| Concern | Backend snapshot | Frontend snapshot | Required resolution |
| --- | --- | --- | --- |
| Success envelope | `{data,meta:{requestId,timestamp,nextCursor?,hasMore?}}` | `ApiEnvelope.meta` hanya requestId/timestamp | Extend transport meta/schema; mapper pagination. |
| Problem envelope | `{problem:{code,message,details?,requestId}}` | Client membaca root `code/message` | `INT-100`: unwrap `.problem`. |
| JSON | Strict `application/json`, max ~1 MiB, unknown/trailing rejected | Banyak adapter mengirim input/view model mentah | Request DTO mapper per operation. |
| Session | HttpOnly cookie | `credentials: include`, no provider/guard | `INT-120`. |
| CSRF | Unsafe cookie mutation requires header/hash | Token hilang setelah refresh; caller optional | `INT-130`. |
| Recent MFA | `X-Recent-MFA-Proof` intended | `X-Recent-MFA`, fake values | `INT-140`. |
| Request ID | Middleware/envelope | Generated client ID available | Forward/correlate/redact. |
| Idempotency | Endpoint-dependent | Inconsistent; withdrawal uses time | UUID per logical intent; replay same key. |
| Pagination | Mostly cursor/meta, some `{items}` | Numbered `TablePagination` but some nested CursorPage | Freeze per-operation `CursorList` or `NumberedPageList`; numbered UI requires authoritative total/pageCount/jump, not cursor history fiction. |
| Validation | Domain validation maps to HTTP 400 | Tasks/screens previously assumed 422 | Canonical snapshot is `400 VALIDATION_FAILED`; migrate all provider/consumer together if changed. |
| Cache | Private/secret policies incomplete | Browser Query + SSR client mixed | Private `no-store`; public explicit revalidate. |
| CORS/topology | No CORS | Absolute API URL | Same-origin `/v1` via `INT-030`. |

## 2. Auth, session, profile, notifications

| Operation/UI | FE owner/seam | Backend route | Status | Contract/action required | Task/evidence |
| --- | --- | --- | --- | --- | --- |
| Seller register | `components/auth-form.tsx` | `POST /v1/auth/register` | U | Exact DTO, anti-enumeration, mail verify, field errors. | AUT-100 |
| Verify email | auth verify flow | `POST /v1/auth/verify-email` | U | Fragment token exchange, one-time, scrub URL. | AUT-100/AUT-120 |
| Seller/admin login | auth/admin login | `POST /v1/auth/login` | M | Surface, session cookie, CSRF, and pre-MFA global gate are incomplete. | AUT-100/ADM-100/INT-140 |
| Session bootstrap/stale-cookie recovery | new session provider | `GET /v1/auth/session` plus narrowly scoped auth-cookie recovery behavior | M | CSRF recovery broken after reload; stale expired/revoked cookie can currently block anonymous auth/logout before handler. Freeze safe recovery/origin/rate-limit contract. | INT-120/130 |
| Logout | profile menus | `POST /v1/auth/logout` | U | CSRF/cookie clear/cache clear. | INT-120 |
| Magic request | `buyer-login.tsx` | `POST /v1/auth/magic-link/request` | U | Generic response, real mail. | AUT-110 |
| Magic consume | account verify | `POST /v1/auth/magic-link/consume` | U | Fragment -> scrub -> POST; no query token. | AUT-110 |
| Forgot/reset password | auth/security | `POST /v1/auth/password/forgot`, `POST /v1/auth/password/reset` | U | Generic request + fragment one-time reset. | AUT-120 |
| Sessions | buyer/admin/seller security | `GET /v1/auth/sessions` | U | Shared canonical security endpoint and current session mapping. | AUT-120/BUY-130 |
| Revoke session(s) | security screens | `POST /v1/auth/sessions/{sessionId}/revoke`, `POST /v1/auth/sessions/revoke-others`, `POST /v1/auth/sessions/revoke-all` | U | Typed result, current/all behavior, CSRF. | AUT-120/BUY-130/ADM-230 |
| Invitation accept (generic) | seller/admin invite ceremony | `POST /v1/auth/invitations/accept` | U | Purpose/surface-bound fragment token, anti-escalation, one-time consume, stale-cookie/CSRF recovery, and pre-MFA enrollment handoff; do not treat as staff/merchant alias interchangeably. | AUT-120/ADM-100/ADM-220/INT-140 |
| Password/email security | settings/security | `POST /v1/auth/password/change`, `POST /v1/auth/email-change/request`, `POST /v1/auth/email-change/confirm-current`, `POST /v1/auth/email-change/confirm-new` | U | Actual recent auth, rotation, dual confirmation. | AUT-120 |
| MFA lifecycle | settings/security | `POST /v1/auth/mfa/enroll`, `POST /v1/auth/mfa/confirm`, `POST /v1/auth/mfa/verify`, `POST /v1/auth/mfa/disable`, `POST /v1/auth/mfa/recovery-codes/regenerate` | M | Add pre-MFA global gate, pre-enrollment ticket for invited/admin users, and actual proof/rotation/recovery behavior. | AUT-120/ADM-100/INT-140 |
| Recent MFA proof mint/exchange | shared step-up adapter | exact operation to be frozen: extend `POST /v1/auth/mfa/verify` or add dedicated `/v1/auth/mfa/step-up` | D | Purpose/resource scope, factor, TTL/single-use, response metadata, `X-Recent-MFA-Proof`, replay/error contract must be decided before reveal/credential/bank/withdrawal/admin commands. | INT-140 |
| Invited/admin MFA pre-enrollment | `/admin/login` or invite flow | no pre-enrollment ticket route mounted | D | Add invite/purpose-bound short-lived enrollment ticket or explicitly block admin onboarding; full admin business session must not be used to bootstrap its own MFA. | ADM-100/INT-140 |
| Me profile | profile/settings | `GET /v1/me/profile`, `PATCH /v1/me/profile` | U | Revision, PII mapping, conflict. | BUY-120/SEL-340/ADM-230 |
| Notification prefs | settings/profile | `GET /v1/me/notification-preferences`, `PATCH /v1/me/notification-preferences` | U | Schema/revision/CSRF. | BUY-120/SEL-340 |
| Notifications | shared shell | `GET /v1/notifications/`, `GET /v1/notifications/unread-count`, `POST /v1/notifications/read-all`, `POST /v1/notifications/{notificationId}/read` | M | Use shared canonical recipient-scoped routes; freeze slash policy and pagination. | BUY-140/SEL-420/ADM-230/INT-000 |
| Personal profile media | buyer/seller/admin profile | none (launch deferred; no `/v1/me/objects`) | D | **Launch decision:** `DISABLED`/`OUT-OF-SCOPE`. Keep existing disabled controls; do not mount user-scoped upload; store object route is invalid for personal media. Re-open only with explicit product + INT-180/185. | INT-175 evidence |

## 3. Public catalog, checkout, order, delivery, invoice

| Operation/UI | FE seam | Backend route | Status | Required mapping/gap | Task/evidence |
| --- | --- | --- | --- | --- | --- |
| Featured products | `features/catalog/api.ts` | `GET /v1/public/products/featured` | A | storeSlug + ACTIVE store filter + schema/mapper. | PUB-100 |
| Public store | catalog API | `GET /v1/public/stores/{slug}` | A | Published-only DTO, 404→null. | PUB-100 |
| Public product | catalog API | `GET /v1/public/products/{idOrSlug}?store=` | A | Store-bound via `store` query; storeSlug on DTO. | PUB-100 |
| Public reviews | seller reviews API | `GET /v1/public/products/{productId}/reviews` | A | DTO + mapper → existing card; cursor not exposed. | PUB-100 |
| Rating summary | seller reviews API | `GET /v1/public/products/{productId}/reviews/summary` | A | `count/averageRating/rating1..5` → `total/average/distribution`; zero-safe. | PUB-100 |
| Fee read | no full seam | `GET /v1/platform/fees` | U | Read-only active policy for public/preview mapping; checkout server quote remains authority. | PUB-110/CHK-100 |
| Marketing fee copy | home/pricing | `GET /v1/platform/fees` | U | Versioned public policy maps to frozen fee UI; prevent drift. | PUB-110 |
| Contact submission | contact form | no route mounted | D | **Launch DISABLED/OUT-OF-SCOPE (PUB-200):** API mode disables submit; mock may prototype. Add exact public contact op only if re-opened IMPLEMENT; fake local success forbidden in API/live. | PUB-200 |
| Public status | status page | `GET /v1/status` | U | Decide live operational aggregate vs static content; no fake operational claim. | PUB-220 |
| Checkout quote | checkout screen | `POST /v1/checkout/quote` | U | Server price/discount, identifiers only. | CHK-100 |
| Checkout coupon | checkout screen | `POST /v1/checkout/apply-coupon`, `POST /v1/checkout/coupon-reservations` | D | Current checkout screen has no coupon input/error/discount region; implement exact existing control only after UI-080, otherwise disabled/out-of-scope. | CHK-100/UI-080 |
| Create intent | checkout API must replace simulator | `POST /v1/checkout/intents` | U | Exact body, idempotency, scoped capability, QR/expiry. | CHK-110 |
| Standalone stock reservation | no FE seam | `POST /v1/checkout/stock-reservations` | D | Internalize/remove or capability-protect; browser create-intent owns reservation and must not call this directly. | CHK-100/INT-000 |
| Poll intent | checkout state machine | `GET /v1/checkout/intents/{intentId}` | M | Owner/capability enforcement, exhaustive states. | CHK-120 |
| Expire intent | checkout recovery | `POST /v1/checkout/intents/{intentId}/expire` | M | Capability, idempotent transition, cannot expire paid. | CHK-120 |
| Simulate payment | `simulateCheckoutPayment` | `POST /v1/checkout/simulate-payment` | T | FE body incompatible; keep only mock/local test; never live. | CHK-110 |
| Gateway payment intent API | API playground/external merchant API | `POST /v1/gateway/payment-intents`, `GET /v1/gateway/payment-intents/{paymentIntentId}`, `POST /v1/gateway/payment-intents/{paymentIntentId}/cancel`, `GET /v1/gateway/payment-intents/{paymentIntentId}/events`, `GET /v1/gateway/events/{eventId}` | U | API-key auth, payment-only scope, idempotency, mode/account binding, no product/catalog/upload authority; document/playground must use sandbox or disabled. | PUB-230/INT-000 |
| Legacy QRIS aliases | legacy API clients | `POST /v1/qris/payments`, `GET /v1/qris/payments/{paymentIntentId}`, `POST /v1/qris/payments/{paymentIntentId}/cancel`, `GET /v1/qris/events/{eventId}` | U | Same use case/security as gateway, explicit deprecation headers/expiry; never a second business implementation. | INT-000/INT-180 |
| Inbound payment callbacks | provider ingress | `POST /v1/webhooks/xendit`, `POST /v1/webhooks/xendit/sandbox`, `POST /v1/webhooks/xendit/live` | M | Constant-time signature/token, raw-body bound, account/mode/reference tuple, dedupe/quarantine/ack, no session CSRF. | INT-180 |
| Public order poll/result | order result page | `GET /v1/orders/{orderId}` | M | ID alone insufficient; session/capability; path status not authority. | CHK-130 |
| Order delivery access | result page | `POST /v1/orders/{orderId}/delivery/access` | U | Capability/ownership, secret no-store. | CHK-140 |
| Buyer delivery access/resend | purchase detail | `POST /v1/buyer/purchases/{orderId}/delivery/access`, `POST /v1/buyer/purchases/{orderId}/delivery/resend` | U | Explicit access, one-time/TTL secret, rate limit. Canonical detail path slash policy must be frozen because router currently mounts `/v1/buyer/purchases/{orderId}/`. | CHK-140/INT-000 |
| Buyer download/protected-link exchange | purchase detail | no buyer/guest download route mounted; seller-only object download route is not valid | G | Add owner/capability-bound `POST /v1/buyer/purchases/{orderId}/delivery/download` or include short-lived URL in access response; define object scope, TTL, access count, no-store, audit/rate limit. | CHK-140/INT-000 |
| Buyer invoice | purchase invoice | `GET /v1/buyer/purchases/{orderId}/invoice` | U | Ownership, immutable snapshot; guest order result needs separate capability exchange or must disable/login-gate invoice CTA. | CHK-150/CHK-130 |
| Order invoice | order/admin flows | `GET /v1/orders/{orderId}/invoice`, `POST /v1/orders/{orderId}/invoice` | U | Session permission; clarify POST generation/idempotency semantics. | CHK-150 |
| Invoice by ID | invoice view | `GET /v1/invoices/{invoiceId}` | U | Auth/ownership/permission. | CHK-150 |
| Public invoice verify | verify page | `GET /v1/invoices/verify/{code}`, `POST /v1/public/invoices/verify` | M | Privacy-safe token/code contract and rate limit. | CHK-150 |

## 4. Buyer

| Operation/UI | FE seam | Backend route | Status | Required mapping/gap | Task/evidence |
| --- | --- | --- | --- | --- | --- |
| Purchase list | `features/buyer/data/api.ts` | `GET /v1/buyer/purchases` | M | Rich flattened view; cursor/meta; no delivery secret. | BUY-100 |
| Purchase detail | buyer API + SSR | `GET /v1/buyer/purchases/{orderId}/` (router snapshot; client currently omits slash) | M | Freeze canonical slash/redirect in INT-000, then align router/OpenAPI/FE; aggregate mapper, owner 404, server cookie. | BUY-100/INT-000 |
| Buyer profile | buyer API | `GET /v1/buyer/profile`, `PATCH /v1/buyer/profile` | M | UI currently hardcoded; response mapper/revision. | BUY-120 |
| Buyer sessions | buyer API | `GET /v1/buyer/sessions` | M | Backend `{sessions}` vs FE array and field differences. | BUY-130 |
| Revoke one | buyer API | `POST /v1/buyer/sessions/{sessionId}/revoke` | M | Backend `{revoked:true}` vs FE result; exact `sessionId` path param and no generic input body. | BUY-130 |
| Revoke others/all | buyer security | `POST /v1/buyer/sessions/revoke-others`, `POST /v1/buyer/sessions/revoke-all` | U | Use bulk endpoint, not loop. | BUY-130 |
| Create/update review | buyer review UI | `POST /v1/buyer/reviews`, `PATCH /v1/buyer/reviews/{reviewId}` | U | Eligibility/version/moderation state. | BUY-110 |
| Buyer product version update | purchase detail | no canonical operation found | D | Freeze whether this is a version entitlement/read or command; require purchase ownership, latest revision, idempotency, delivery refresh, and explicit existing control, otherwise disable. | BUY-110/CHK-140 |

## 5. Seller identity/onboarding/store

| Operation/UI | FE seam | Backend route | Status | Required mapping/gap | Task/evidence |
| --- | --- | --- | --- | --- | --- |
| Current merchant/store | new store context | `GET /v1/seller/me/merchant` | M | Snapshot only returns first merchant/role; extend/freeze memberships, stores, capabilities, canonical/current semantics. | SEL-100/INT-150 |
| Seller store by ID | store context | `GET /v1/seller/stores/{storeId}` | U | Membership/404; clarify use vs canonical bootstrap. | SEL-100 |
| Onboarding state | onboarding screen | `GET /v1/onboarding/` | U | Resume server step. | SEL-110 |
| Create/patch/complete | onboarding screen | `POST /v1/onboarding/store`, `PATCH /v1/onboarding/store`, `POST /v1/onboarding/complete` | U | Idempotency/revision/route guard. | SEL-110 |
| Slug availability | onboarding/product | `GET /v1/stores/slug-availability` | U | Debounce/cancel; advisory only. | SEL-110 |
| Store presentation patch | settings/storefront | `PATCH /v1/stores/{storeId}/` | U | Strict DTO/revision. | SEL-310 |

## 6. Seller catalog, objects, inventory

| Operation/UI | FE seam | Backend route | Status | Required mapping/gap | Task/evidence |
| --- | --- | --- | --- | --- | --- |
| Product list | catalog API | `GET /v1/stores/{storeId}/products` | M | Filters/cursor/meta/schema; tenant guard. | SEL-210 |
| Product create | product form | `POST /v1/stores/{storeId}/products` | U | Exact DTO, 400 validation, credential-vs-code mapping, idempotency. | SEL-220 |
| Product detail | catalog API + SSR | `GET /v1/stores/{storeId}/products/{productId}` | M | Schema/mapper/server cookie/404. | SEL-220 |
| Product patch | detail/form | `PATCH /v1/stores/{storeId}/products/{productId}` | U | Revision/If-Match. | SEL-220 |
| Product publish | catalog API | `POST /v1/stores/{storeId}/products/{productId}/publish` | M | FE sends view input; backend discards/does not use idempotency fully. | SEL-220 |
| Product archive | detail | `POST /v1/stores/{storeId}/products/{productId}/archive` | U | Typed transition/reason/idempotency. | SEL-220 |
| Object upload intent | product/store asset | `POST /v1/stores/{storeId}/objects/uploads` | U | Store assets only; purpose/MIME/size/checksum, direct PUT. Personal profile uses `INT-175`. | SEL-230 |
| Complete/metadata/download | upload flow | `POST /v1/stores/{storeId}/objects/{objectId}/complete`, `GET /v1/stores/{storeId}/objects/{objectId}`, `GET /v1/stores/{storeId}/objects/{objectId}/download-url` | M | Implement sniff/SCANNING/real scanner lifecycle; signed URL secret. | SEL-230/INT-180/INT-185 |
| Delivery grant creation | seller delivery/object lifecycle | `POST /v1/stores/{storeId}/objects/{objectId}/delivery-grants` | U | Internal/seller-scoped grant command must verify order/entitlement, purpose, TTL, idempotency, and never expose raw object secret; wire only if an existing delivery control invokes it. | SEL-250/CHK-140 |
| Inventory product list | seller inventory API | `GET /v1/stores/{storeId}/inventory/products` | M | Backend summary fields differ; UI has no pagination/empty composition, so bounded launch + `UXE-012/UI-080`, never hidden cursor/demo rows. | SEL-240 |
| Inventory product detail | seller inventory API | `GET /v1/stores/{storeId}/inventory/products/{productId}` | M | Backend `{summary,items}` vs product view; detail `StockItemsTab` requires authoritative `NumberedPageList`. | SEL-240/INT-020 |
| Inventory schema | detail tabs | `GET /v1/stores/{storeId}/inventory/products/{productId}/schema`, `PUT /v1/stores/{storeId}/inventory/products/{productId}/schema` | U | Version, exact definitions, mapper. | SEL-240 |
| Import items | detail/import | `POST /v1/stores/{storeId}/inventory/products/{productId}/items`, `POST /v1/stores/{storeId}/inventory/items/import` | U | Atomic/partial policy, row errors/idempotency. | SEL-240 |
| Reveal item | detail | `POST /v1/stores/{storeId}/inventory/items/{itemId}/reveal` | M | Must verify server recent MFA, not body boolean; no-store. | SEL-240 |
| Revoke item | detail | `POST /v1/stores/{storeId}/inventory/items/{itemId}/revoke` | U | Transition/audit/idempotency. | SEL-240 |

## 7. Seller orders, customers, reviews, coupons

| Operation/UI | FE seam | Backend route | Status | Required mapping/gap | Task/evidence |
| --- | --- | --- | --- | --- | --- |
| Seller orders list | `features/orders/api.ts` | expected `GET /v1/stores/{storeId}/orders` | G | Implement store read model/filter/cursor. | SEL-250 |
| Seller order detail | orders API + SSR | expected `GET /v1/stores/{storeId}/orders/{orderId}` | G | Implement detail aggregate, no secret. | SEL-250 |
| Delivery grant state | order detail | `GET /v1/stores/{storeId}/orders/{orderId}/delivery` | U | Map grant state only. | SEL-250 |
| Delivery resend/retry/revoke | seller delivery backend; order UI only exposes resend | `POST /v1/stores/{storeId}/orders/{orderId}/delivery/resend`, `POST /v1/stores/{storeId}/orders/{orderId}/delivery/retry`, `POST /v1/stores/{storeId}/orders/{orderId}/delivery/revoke` | M | Wire resend through existing control. Keep retry/revoke backend-only or live-disabled until an existing control is characterized; typed transition/idempotency/rate/audit remain required. | SEL-250/UI-080 |
| Customers list/detail | seller customer API | expected `GET /v1/stores/{storeId}/customers`, `GET /v1/stores/{storeId}/customers/{customerId}` | G | Build tenant read model/history/notes/privacy. | SEL-260 |
| Seller reviews list | seller reviews API | `GET /v1/stores/{storeId}/reviews` | M | Joined store read model; BoundedNoPaging first result (limit 50); no cursor UI. | SEL-270 |
| Seller review summary | reviews API | `GET /v1/stores/{storeId}/reviews/summary` | M | Store published aggregate → total/average/distribution. | SEL-270 |
| Reply/report review | reviews screen | `PUT /v1/stores/{storeId}/reviews/{reviewId}/reply`, `POST /v1/stores/{storeId}/reviews/{reviewId}/report` | M | Versioned reply; report reason/dedupe; no moderation status change. | SEL-270 |
| Coupon list/create | coupon screens | `GET /v1/stores/{storeId}/coupons`, `POST /v1/stores/{storeId}/coupons` | M | OpenAPI non-slash canon; chi mounts trailing-slash list/create; FE uses non-slash (matches other seller resources). Schemas + create idempotency wired SEL-280. | SEL-280 |
| Coupon detail/patch | coupon UI | `GET /v1/stores/{storeId}/coupons/{couponId}`, `PATCH /v1/stores/{storeId}/coupons/{couponId}` | M | expectedVersion concurrency; validation server-side. | SEL-280 |
| Coupon activate/pause/archive | coupon UI | `POST /v1/stores/{storeId}/coupons/{couponId}/activate`, `POST /v1/stores/{storeId}/coupons/{couponId}/pause`, `POST /v1/stores/{storeId}/coupons/{couponId}/archive` | M | Explicit transitions only; no status patch. | SEL-280 |

## 8. Seller storefront, analytics, domain, webhooks, credentials

| Operation/UI | FE seam | Backend route | Status | Required mapping/gap | Task/evidence |
| --- | --- | --- | --- | --- | --- |
| Storefront studio GET | builder | `GET /v1/stores/{storeId}/storefront` | M | Map draft/revision/config. | SEL-300 |
| Save draft | builder | `PUT /v1/stores/{storeId}/storefront/draft` | M | Debounce + expected revision. | SEL-300 |
| Publish storefront | storefront API | `POST /v1/stores/{storeId}/storefront/publish` | M | Strict body + revision/idempotency; unknown root fields rejected. | SEL-300 |
| Analytics overview/traffic | overview/traffic component | `GET /v1/stores/{storeId}/analytics/overview`, `GET /v1/stores/{storeId}/analytics/traffic` | U | Range/source/filter, server aggregates. | SEL-200 |
| Traffic export | analytics control | `GET /v1/stores/{storeId}/analytics/traffic/export` | U | Bounded/audited/signed output. | SEL-200 |
| Domains CRUD/verify | settings | `GET /v1/stores/{storeId}/domains/`, `POST /v1/stores/{storeId}/domains/`, `GET /v1/stores/{storeId}/domains/{domainId}`, `POST /v1/stores/{storeId}/domains/{domainId}/verify`, `DELETE /v1/stores/{storeId}/domains/{domainId}` | M | Router/handler use `{domainId}`; freeze slash policy; real DNS/edge runtime, ownership/TLS. | SEL-310/INT-180/INT-000 |
| Seller webhook endpoints | webhooks screen | `GET /v1/stores/{storeId}/webhooks/`, `POST /v1/stores/{storeId}/webhooks/`, `PATCH /v1/stores/{storeId}/webhooks/{id}` | M | Router/handler use `{id}`; freeze slash policy; SSRF protection, schema. FE wired SEL-320. | SEL-320/INT-000 |
| Delivery history/test | webhooks screen | `GET /v1/stores/{storeId}/webhooks/deliveries`, `POST /v1/stores/{storeId}/webhooks/{id}/test` | M | Router/handler use `{id}`; bounded list; test idempotency. FE wired SEL-320. | SEL-320/INT-000 |
| Secret rotate/claim | webhooks screen | `POST /v1/stores/{storeId}/webhooks/{id}/secret-rotation-requests`, `POST /v1/stores/{storeId}/webhooks/{id}/secret-claims/{claimId}/exchange` | M | Router/handler use `{id}`; one-time component memory; never query cache. FE wired SEL-320. | SEL-320/INT-000 |
| Credential list | API key screen | `GET /v1/stores/{storeId}/api-credentials/` | U | Store-scoped route is canonical for this UI; masked-only list; freeze slash policy. | SEL-330/INT-000 |
| Credential request/claim/revoke | API key screen | `POST /v1/stores/{storeId}/api-credential-requests`, `POST /v1/stores/{storeId}/api-credential-claims/{claimId}/exchange`, `POST /v1/stores/{storeId}/api-credentials/{keyId}/revoke` | U | Owner/recent MFA/one-time raw. | SEL-330 |
| Seller KYC | KYC/API key/settings | `GET /v1/me/kyc/`, `POST /v1/me/kyc/cases`, `GET /v1/me/kyc/cases/{caseId}`, `POST /v1/me/kyc/cases/{caseId}/submit`, `POST /v1/me/kyc/cases/{caseId}/resubmit`, `POST /v1/me/kyc/cases/{caseId}/documents` | M | Use `/v1/me/kyc` as seller canonical; freeze slash policy, server multipart/encrypted real scan, API capability only. | SEL-330/ADM-340/INT-000 |

## 9. Seller finance, bank, withdrawal

| Operation/UI | FE seam | Backend route | Status | Required mapping/gap | Task/evidence |
| --- | --- | --- | --- | --- | --- |
| Finance summary | finance API | `GET /v1/stores/{storeId}/finance/summary` | M | Tenant guard; map exact fields. | SEL-400 |
| Revenue | finance API | `GET /v1/stores/{storeId}/finance/revenue` | M | Tenant guard/range/schema. | SEL-400 |
| Ledger | finance API | `GET /v1/stores/{storeId}/finance/ledger` | M | Pagination shape + enum `SETTLEMENT_RELEASE`; tenant guard. | SEL-400 |
| Bank accounts | settings/withdrawal | `GET /v1/stores/{storeId}/bank-accounts/`, `POST /v1/stores/{storeId}/bank-accounts/`, `PATCH /v1/stores/{storeId}/bank-accounts/{id}`, `DELETE /v1/stores/{storeId}/bank-accounts/{id}`, `POST /v1/stores/{storeId}/bank-accounts/{id}/verify`, `POST /v1/stores/{storeId}/bank-accounts/{id}/make-primary` | M | Router/handler use `{id}`; freeze slash policy; masking/recent MFA/withdrawal lock. | SEL-340/SEL-410/INT-000 |
| Withdrawal quote | finance API | `POST /v1/stores/{storeId}/withdrawal-quotes` | M | Quote field mapping, recent auth contract, idempotency. | SEL-410 |
| Withdrawal list/detail | finance API | `GET /v1/stores/{storeId}/withdrawals/`, `GET /v1/stores/{storeId}/withdrawals/{withdrawalId}` | M | Freeze slash policy; backend `{items}` + differing fields/status; tenant guard. | SEL-410/INT-000 |
| Withdrawal lock | finance API | `GET /v1/stores/{storeId}/withdrawals/lock` | M | Field/reason/time mapping. | SEL-410 |
| Create withdrawal | finance API | `POST /v1/stores/{storeId}/withdrawals/` | M | FE `reauthProof` unknown body; freeze slash policy; stable key; tenant guard. | SEL-410/INT-000 |
| Disbursement callback | none (server) | `POST /v1/webhooks/xendit/disbursement` | M | P0: mandatory signature/token/dedupe/full reference. | INT-180/SEL-410 |

## 10. Admin overview/read models

| Operation/UI | FE seam | Backend route | Status | Required mapping/gap | Task/evidence |
| --- | --- | --- | --- | --- | --- |
| Overview | admin hooks/screens | `GET /v1/admin/overview` | M | Schema/consistent asOf/permission. | ADM-120 |
| Platform volume | overview API | `GET /v1/admin/overview/platform-volume` | M | Schema/range, not bare guessed points. | ADM-120 |
| Merchants list/detail | admin merchants API | `GET /v1/admin/merchants`, `GET /v1/admin/merchants/{merchantId}` | M | Filter/pagination profile/detail composition. | ADM-200 |
| Buyers list/detail | admin buyers API | `GET /v1/admin/buyers`, `GET /v1/admin/buyers/{buyerId}` | M | Filter/pagination profile/PII. | ADM-210 |
| Buyer purchases/sessions | admin buyer API | `GET /v1/admin/buyers/{buyerId}/purchases`, `GET /v1/admin/buyers/{buyerId}/sessions` | M | Session/purchase DTO mapper, no secret. | ADM-210 |
| Orders list/detail | admin orders API | `GET /v1/admin/orders`, `GET /v1/admin/orders/{orderId}` | M | Filter/pagination profile/immutable detail fields. | ADM-300 |
| Payments list/detail | payments API partial | `GET /v1/admin/payments`, `GET /v1/admin/payments/{paymentIntentId}` | U | Detail adapter/filter/pagination. | ADM-300 |
| Inventory read | admin inventory API | `GET /v1/admin/inventory` | M | Redacted snapshot/filter/pagination. | ADM-320 |
| Fulfillment list/detail | fulfillment UI | `GET /v1/admin/fulfillments`, `GET /v1/admin/fulfillments/{deliveryId}` | U | Schema/hook replacing seed. | ADM-320 |
| Reviews list/detail | reviews API | `GET /v1/admin/reviews`, `GET /v1/admin/reviews/{reviewId}` | M | BoundedNoPaging first result; schema+mapper; no fixture in API mode. | ADM-330 |
| Withdrawals list/detail | withdrawal API | `GET /v1/admin/withdrawals/` (router snapshot; FE currently calls no slash), `GET /v1/admin/withdrawals/{withdrawalId}` | M | Freeze canonical slash or tested redirect, align router/OpenAPI/FE, then map DTO/status/detail. | ADM-310/INT-000 |
| Users lookup/detail | users UI | `GET /v1/admin/users`, `GET /v1/admin/users/{userId}` | U | Schema/filter/pagination. | ADM-220 |

## 11. Admin privileged operations

| Operation/UI | FE seam | Backend route | Status | Required mapping/gap | Task/evidence |
| --- | --- | --- | --- | --- | --- |
| Admin auth/permissions | admin login/boundary | `POST /v1/auth/login`, `GET /v1/auth/session`, authz middleware | M | Real pre-MFA gate/session claims/route permission. | ADM-100/ADM-110/INT-120/INT-140 |
| Merchant status/API access | typed action/detail | `POST /v1/admin/merchants/{merchantId}/status`, `POST /v1/admin/merchants/{merchantId}/api-access/status` | M | Enforce operation-specific permission/MFA/reason/idempotency/audit. | ADM-200 |
| Generic admin action dispatcher | admin operations | `POST /v1/admin/actions` | M | Snapshot route only requires `merchants.write` while dispatcher accepts unrelated buyer/review/credential/delivery/provider/withdrawal actions; replace with typed routes or strict action-to-permission allowlist tested direct HTTP. | ADM-110/ADM-200/INT-000 |
| Credentials support | merchant detail | `GET /v1/admin/merchants/{merchantId}/api-credentials/`, `POST /v1/admin/merchants/{merchantId}/api-credentials/authorize`, `POST /v1/admin/merchants/{merchantId}/api-credentials/rotate`, `POST /v1/admin/merchants/{merchantId}/api-credentials/{keyId}/suspend`, `POST /v1/admin/merchants/{merchantId}/api-credentials/{keyId}/revoke`, `POST /v1/admin/merchants/{merchantId}/api-credentials/revoke` | M | Admin authorizes only, never raw claim; router snapshot incorrectly reuses `kyc.review` for all operations—split credential permissions and audit. Freeze slash/param policy. | ADM-200/ADM-340/INT-000 |
| Roles/permissions reads | access API | `GET /v1/admin/roles`, `GET /v1/admin/permissions` | M | `{items}`, field/group mapper. | ADM-220 |
| Role read + CRUD/archive/permissions | role builder | `GET /v1/admin/roles/{id}`, `GET /v1/admin/roles/{id}/permissions`, `POST /v1/admin/roles`, `PATCH /v1/admin/roles/{id}`, `POST /v1/admin/roles/{id}/archive`, `PUT /v1/admin/roles/{id}/permissions` | U | Wire reads and saves; revision/anti-escalation/MFA. | ADM-220 |
| User role assign/remove | users/role detail | `GET /v1/admin/users/{id}/roles`, `POST /v1/admin/users/{id}/roles`, `DELETE /v1/admin/users/{id}/roles/{roleId}` | U | Permission/SoD/audit. | ADM-220 |
| Staff invitations | users/actions | `GET /v1/admin/invitations/staff`, `POST /v1/admin/invitations/staff`, `POST /v1/admin/invitations/staff/{invitationId}/revoke`, `POST /v1/invitations/staff/accept` | U | Fragment token and anti-escalation. | ADM-220 |
| Merchant invitations | users/actions | `GET /v1/admin/invitations/merchant`, `POST /v1/admin/invitations/merchant`, `POST /v1/admin/invitations/merchant/{invitationId}/revoke`, `POST /v1/invitations/merchant/accept` | U | Fragment token and merchant role/scope. | ADM-220 |
| Invitation resend | users/actions | no resend route mounted | D | Add explicit rotate-and-resend operation or live-disable existing control; do not duplicate create silently. | ADM-220 |
| Impersonation start/terminate | impersonation dialog | `POST /v1/admin/users/{userId}/impersonation`, `POST /v1/admin/merchants/{merchantId}/impersonation`, `POST /v1/admin/impersonation/{sessionId}/terminate` | M | Server session, no URL/storage token, bounded scope. | ADM-390 |
| Provider lookup | payments | `POST /v1/admin/payments/{paymentIntentId}/provider-lookup` | U | Full reference, evidence/audit. | ADM-300 |
| Payment mismatches | payments | `GET /v1/admin/payment-mismatches` | U | Replace fixture, read-only evidence. | ADM-300 |
| Delivery resend | order | `POST /v1/admin/orders/{orderId}/delivery/resend` | U | Idempotency/reason/permission. | ADM-300 |
| Force fulfill/revoke | fulfillment composition (not admin order-detail control) | `POST /v1/admin/orders/{orderId}/delivery/force-fulfill`, `POST /v1/admin/orders/{orderId}/delivery/revoke` | U | Bind only to existing fulfillment controls; order screen keeps them disabled. Verified evidence/MFA/reason/idempotency. | ADM-300/ADM-320/ADM-350 |
| Withdrawal review | detail | `POST /v1/admin/withdrawals/{withdrawalId}/review` | M | Transition/MFA/reason/idempotency/unknown outcome. | ADM-310 |
| Admin inventory reveal | inventory API | expected `POST /v1/admin/inventory/items/{itemId}/reveal`; no route mounted | G | Add admin facade; server MFA; no-store. | ADM-320 |
| Review moderation | generic action/review UI | `POST /v1/admin/reviews/{reviewId}/transition` | M | Typed status+reason; reviews.moderate; replaces generic review.moderate action on screen. | ADM-330 |
| Admin KYC | KYC UI | `GET /v1/admin/kyc/`, `GET /v1/admin/kyc/{caseId}`, `POST /v1/admin/kyc/{caseId}/transition` | M | Freeze slash policy; replace seed; document security/MFA. | ADM-340/INT-000 |
| Admin KYC document content | KYC viewer | no decrypted-content route mounted | G | Add authenticated/recent-MFA/audited server-decrypt streaming route; direct R2 URL is ciphertext/unsafe. | ADM-340 |
| Provider callbacks | webhooks UI | `GET /v1/admin/provider-callbacks/`, `GET /v1/admin/provider-callbacks/{callbackId}`, `POST /v1/admin/provider-callbacks/{callbackId}/replay` | U | Separate resource/replay permission; freeze slash policy. | ADM-350/INT-000 |
| Seller deliveries | webhooks UI | `GET /v1/admin/seller-webhook-deliveries/`, `GET /v1/admin/seller-webhook-deliveries/{deliveryId}`, `POST /v1/admin/seller-webhook-deliveries/{deliveryId}/retry` | U | Separate resource/retry permission; freeze slash policy. | ADM-350/INT-000 |
| Audit list/detail/integrity | audit UI | `GET /v1/admin/audit-logs`, `GET /v1/admin/audit-logs/{eventId}`, `GET /v1/admin/audit-integrity` | M | Mapper; server chain only. | ADM-360 |
| Audit export | audit UI | `POST /v1/admin/audit-exports`, `GET /v1/admin/audit-exports/{exportId}` | U | Async/redacted/signed/audited. | ADM-360 |
| Providers/system | provider/system UI | `GET /v1/admin/providers`, `GET /v1/admin/system` | M | Truthful real-adapter health. | ADM-370 |
| Emergency controls | system UI | `GET /v1/admin/system/emergency-controls`, `POST /v1/admin/system/emergency-controls` | U | Version/MFA/reason/ticket/idempotency. | ADM-370 |
| Fee read/preview | fee UI | `GET /v1/admin/system/fees`, `POST /v1/admin/system/fees/preview` | M | Read-only active + pure preview; no publish. | ADM-370 |
| Campaigns | campaign UI | no canonical method/path assigned or mounted | D | Implement/freeze exact campaign operations or live-disable explicitly. | ADM-380 |

### 11.1 Admin page permission-code drift

The navigation boundary and backend middleware currently speak different permission vocabularies. Resolve each row atomically across FE route metadata/mock fixtures, `AllPermissionCodes`, migration/role grants, router, OpenAPI, session claims, and direct-request tests. Granting a mutation permission only to make a read page visible is forbidden.

| Surface | FE permission snapshot | Backend guard snapshot | Status | Required resolution | Task/evidence |
| --- | --- | --- | --- | --- | --- |
| Admin own profile | `profile.read` | `/v1/me/profile` authenticated-subject only; code absent | M | Use admin-surface + subject ownership or add one deliberate profile code; remove unknown alias. | ADM-110/230 |
| Campaign list | `campaigns.read` | No route; registry only has `campaigns.publish` | D | Keep disabled until ADM-380 defines separate read/publish operations and permissions. | ADM-110/380 |
| Withdrawal list vs review | `withdrawals.read` | GET and POST review use `withdrawals.review` | M | Prefer `withdrawals.read` on list/detail and `withdrawals.review` on mutation, or document/test a deliberate combined policy. | ADM-110/310 |
| KYC list/detail vs transition | `kyc.read` | GET and POST transition use `kyc.review` | M | Prefer `kyc.read` for safe reads and `kyc.review` for transition/document content; never grant review only to render list. | ADM-110/340 |
| Provider health | `providers.read` | `GET /v1/admin/providers` uses `payments.read` | M | Add dedicated provider-read or explicitly justify/test the payment-read coupling. | ADM-110/370 |
| System read vs emergency | `system.read` | system GET/POST use `platform.emergency`; fee preview uses `platform.fees.preview` | M | Separate safe system read, emergency mutation, and fee-preview permissions. | ADM-110/370 |
| Merchant mutation alias | mock `merchants.update` | `merchants.write` | M | Delete/map unknown alias; one canonical code only. | ADM-110/200 |
| Audit export alias | mock `audit.export` | export routes use `audit.read` | M | Add deliberate export permission or explicitly retain read; align all layers/tests. | ADM-110/360 |

## 12. Operational, alias, and non-UI route disposition

These routes may not have a dedicated FE screen, but they are still part of the wire contract. `INT-000` must include them in OpenAPI/router drift coverage or explicitly mark them internal/test-only.

| Route/operation | Status | Required disposition | Task/evidence |
| --- | --- | --- | --- |
| `GET /v1/public/host-resolve` | U | Public host lookup must be bounded, cache-safe, and never reveal private store state; custom-domain rollout depends on real DNS/edge adapter. | SEL-310/INT-180 |
| `GET /v1/seller/finance/summary`, `GET /v1/seller/finance/ledger`, `GET /v1/seller/finance/revenue` | U | Compatibility aliases must use the same store access guard/read model as `/v1/stores/{storeId}/finance/*`; no second authority. | SEL-400/INT-000 |
| `GET /v1/me/credentials`, `POST /v1/me/credentials/requests`, `POST /v1/me/credentials/claim`, `POST /v1/me/credentials/{keyId}/revoke` | U | Canonical user-scoped credential aliases remain masked/one-time and must map to store-scoped UI without leaking raw key. | SEL-330/INT-000 |
| `GET/POST /v1/me/kyc/*`, `GET/POST /v1/merchants/{merchantId}/kyc/*` | M | Seller/merchant KYC aliases share encrypted server-mediated lifecycle; document content and admin review permissions remain separate. | SEL-330/ADM-340 |
| `GET/POST /v1/notifications/*`, `/v1/buyer/notifications/*`, `/v1/seller/notifications/*`, `/v1/admin/notifications/*` | M | Thin recipient-scoped aliases only; freeze slash/pagination and prevent actor/tenant switching through alias. | BUY-140/SEL-420/ADM-230/INT-000 |
| `GET /v1/buyer/resources/{ownerUserId}` | T | Ownership probe/test surface only; never expose as generic production resource endpoint or use to infer account existence. | QLT-210/INT-000 |
| `GET /v1/admin/ping` | T | Permission probe/test only; exclude from product navigation and production capability claims. | ADM-110/INT-000 |
| `GET /v1/admin/merchants/{merchantId}/finance/summary` | U | Admin projection must be permission-scoped/read-only and distinct from seller balance authority. | ADM-200/SEL-400 |
| `POST /v1/admin/fees/preview`, fee mutation rejection aliases | M | Preview is pure/read-only; explicit 405/typed rejection for publish/mutate aliases; no UI success. | ADM-370/INT-000 |
| `GET /v1/admin/invitations/*`, `/v1/admin/staff-invitations*`, `/v1/admin/merchant-invitations*` | M | Canonical/compatibility aliases share anti-escalation, fragment token, revoke, and resend decision; no duplicate invitation authority. | ADM-220/INT-000 |
| `GET /health/live`, `GET /health/ready`, `GET /metrics` | M | Operational endpoints are not UI data sources; current readiness can report fake/noop dependency health, so truthfulness/metrics access restriction must be fixed. | INT-180/QLT-320 |
| `POST /v1/_scaffold/echo`, `POST /v1/_test/paid-orders`, `POST /v1/checkout/simulate-payment`, gateway product/catalog/upload reject routes | T | Local/test-only or explicit rejection; absent from live generated client and API-mode business reachability graph. | INT-000/INT-170/QLT-300 |

## 13. Endpoint Definition of Done checklist

Setiap row baru boleh berubah menjadi “done” jika seluruh item berikut ada:

- [ ] Router route dan OpenAPI operation sama method/path.
- [ ] Operation ID unik; request/response/problem schema valid.
- [ ] Auth surface, permission, tenant/ownership/capability dipaksa backend.
- [ ] CSRF untuk unsafe cookie auth.
- [ ] Recent MFA/reason/idempotency/If-Match untuk operation yang memerlukannya.
- [ ] Strict body/query validation dan bounded limit.
- [ ] Mapper menghasilkan exact existing view model; screen tidak melihat DTO.
- [ ] Loading/empty/error/400 validation/401/403/404/409/429/5xx/abort behavior diuji.
- [ ] Secret/PII cache/log/storage/URL policy diuji.
- [ ] Unit provider + consumer contract + Go integration + cross-stack E2E sesuai risiko.
- [ ] Tenant/permission/negative/concurrency/idempotency tests lulus.
- [ ] UI mock/API visual parity lulus tanpa snapshot update.
