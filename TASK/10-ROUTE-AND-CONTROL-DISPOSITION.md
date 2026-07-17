# Route, Network-State, and Active-Control Disposition

Dokumen ini memastikan setiap route dan control existing memiliki perilaku nyata ketika frontend berpindah dari mock ke API. Ia **bukan izin redesign**. Seluruh binding harus mematuhi `00-UI-FREEZE-CONTRACT.md`: pertahankan JSX hierarchy, class, copy statis, ukuran, spacing, responsive behavior, dan gunakan komponen existing yang sama persis.

## 1. Aturan keputusan

Setiap control/route pada API mode harus berakhir pada tepat satu disposition berikut:

| Disposition | Arti |
| --- | --- |
| `IMPLEMENT` | Membaca/menjalankan backend contract authoritative dan memiliki pending/error/success tests. |
| `STATIC` | Konten/navigation/client-only behavior sengaja tidak membutuhkan backend; link/action tetap nyata. |
| `DISABLED` | Capability tidak tersedia. Gunakan disabled/unavailable state dari komponen existing, dengan reason authoritative; tidak ada request atau fake success. |
| `OUT-OF-SCOPE` | Tidak diluncurkan. Karena UI tidak boleh dihapus/redesign dalam wiring PR, control harus mode-gated menjadi `DISABLED` sampai product owner menyetujui perubahan UI terpisah. |
| `DECISION` | Product/contract choice belum dikunci. API/live flag untuk surface terkait tidak boleh aktif sampai outcome berubah menjadi salah satu tiga disposition di atas. |

Larangan:

- control aktif tanpa handler, `href="#"`, timer success, local-only persistence, hardcoded “operational/paid/sent”, atau fallback mock tidak boleh terjangkau di API/live mode;
- `401`, `403`, `404`, `409`, `429`, timeout, dan invalid contract tidak boleh digabung menjadi empty/success;
- hidden/disabled control tidak menggantikan backend authorization;
- jangan menambah toast, modal, banner, skeleton, empty illustration, copy, atau route baru kecuali `UI-080` disetujui; pilih komponen existing dari registry;
- mock mode boleh tetap pixel-identical dan deterministic. API mode mempertahankan struktur/geometri/class yang sama, tetapi nilai dynamic harus truthful dan fake secret/mock label harus hilang sesuai kontrak keamanan.

## 2. State machine jaringan canonical

Feature adapter/hook memetakan transport ke state berikut. Component tidak boleh menginterpretasi raw HTTP sendiri.

| State | Trigger | Perilaku wajib |
| --- | --- | --- |
| `BOOTSTRAP` | Source/session/tenant belum resolved | Jangan fetch domain; jangan render data tenant lama. Gunakan route loading existing bila tersedia. |
| `INITIAL_LOADING` | First authoritative read | Existing skeleton/loading only; jika tidak ada, route tetap pada server navigation/current shell sampai data atau gunakan exception register. |
| `SUCCESS_NONEMPTY` | Valid schema, rows/data ada | Render exact existing view melalui mapper. |
| `SUCCESS_EMPTY` | Valid schema, collection kosong | Pertahankan shell/table/card geometry; gunakan empty composition existing. Jangan isi fixture/zero palsu. |
| `BACKGROUND_REFRESH` | Data lama valid, refetch berjalan | Keep previous data, no layout shift, abort stale request, no full-page skeleton. |
| `MUTATION_PENDING` | Command sedang berjalan | Lock hanya control terkait; `aria-busy`; no duplicate; idempotency key tetap. |
| `VALIDATION` | `400 VALIDATION_FAILED` | Map field violations ke existing field/error region; bila region tidak ada (mis. contact/checkout snapshot), block/disable atau gunakan `UI-080`; pertahankan non-secret input; focus first invalid. |
| `UNAUTHENTICATED` | `401`/session revoked | Clear private cache; existing login route + safe relative `returnTo`; jangan render stale private data. |
| `MFA_REQUIRED` | Pre-MFA/recent-proof required | Existing auth/security dialog/form composition; no command replay otomatis setelah proof kecuali contract explicitly safe. |
| `FORBIDDEN` | `403` | Admin uses existing `AdminPermissionBoundary`. Buyer/seller have no equivalent snapshot panel: backend must return safe 404 where enumeration-safe, or capability is blocked behind `UI-080`/existing unavailable composition; never silently call it an auth redirect or invent a panel. |
| `NOT_FOUND` | Declared `404` | `notFound()`/existing `app/not-found.tsx` untuk resource route; collection filter kosong tetap `SUCCESS_EMPTY`. |
| `CONFLICT` | `409` revision/state/idempotency | Preserve input; refetch authoritative state; existing dialog/inline region; financial command resolves status before new submit. |
| `RATE_LIMITED` | `429` | Existing error region/control disabled sampai server retry policy; no countdown invented unless `Retry-After` contract exists. |
| `UNAVAILABLE` | timeout/offline/5xx/dependency/disabled source | Existing route error/retry or disabled state. Retry read only; never auto-retry mutation/secret/money. |
| `INVALID_CONTRACT` | Runtime schema fails | Fail closed as `INVALID_API_CONTRACT`, report sanitized operation/request ID, show existing error state; never cast/default/fallback mock. |
| `TERMINAL` | Paid/failed/expired/completed/revoked etc. | Hanya backend/provider state machine menentukan terminal state; stop polling and render mapped existing state. |

### Retry semantics

- Read retry membuat request baru dan boleh memakai bounded backoff/jitter; reset button existing memanggil exact read again.
- Mutation retry mempertahankan logical idempotency key. Untuk unknown outcome, lakukan GET/status reconciliation sebelum menawarkan submit ulang.
- Navigation/login/session bootstrap tidak boleh menggandakan prior mutation.
- Polling hanya satu in-flight request, berhenti saat hidden/unmounted/terminal, dan tidak menyebabkan live-region spam.

## 3. Komponen state per surface

| Surface | Loading yang boleh dipakai | Error/retry yang boleh dipakai | Access/not-found | Catatan freeze |
| --- | --- | --- | --- | --- |
| Root/public | Server render tanpa skeleton tambahan; root fallback hanya bila benar-benar suspend | existing `app/error.tsx` (`GlobalError`) | existing `app/not-found.tsx` | Jangan membuat public error-card variant baru. |
| Auth | Existing `AuthShell`, `AuthForm`, `BuyerLogin`, `AdminLogin` geometry only | `AuthForm` hanya punya field errors/loading; `BuyerLogin` punya loading/sent; `AdminLogin` dan verify page masih static/mock. Gunakan field/not-found/root state hanya bila semantik aman; generic/MFA/rate/unavailable gaps mengikuti `UXE-011`, bukan panel baru | Redirect/login sesuai surface; invalid buyer token dapat safe `NotFound` | Challenge state hanya dikomposisikan setelah characterization; lihat `UXE-001` dan `UXE-011`. |
| Checkout/order | Existing `CheckoutDetailsStep`, `CheckoutQrisStep`, `CheckoutOrderSummary`, `CheckoutPaidStep` | Inline field/step state bila sudah ada; unexpected ke `GlobalError` | `NotFound` untuk invalid checkout/order capability | Timer/fake paid dilarang. Missing expected-error composition masuk `UXE-003`. |
| Buyer | Existing `BuyerShell`, purchase/profile/security cards dan pieces | Root `GlobalError` hanya unexpected; route-level lifecycle belum lengkap | Login redirect; `NotFound` untuk purchase non-owned/safe 404 | Jangan meminjam styling seller/admin. Initial/empty/error needs `UXE-002`. |
| Seller workspace | existing `app/dashboard/(workspace)/loading.tsx` | existing `app/dashboard/(workspace)/error.tsx` | Login/onboarding redirect; safe `NotFound` for foreign resource | Pertahankan `DashboardShell`/`SellerDashboardFrame`; no new loader. |
| Seller onboarding | Existing `StoreOnboarding` step shell | Existing form error regions; unexpected root `GlobalError` | Login/session/onboarding redirect | Route berada di luar workspace error/loading boundary; lihat `UXE-008`. |
| Admin console | existing `app/admin/(console)/loading.tsx` | existing `app/admin/(console)/error.tsx`, `ControlDialog` for commands | `AdminPermissionBoundary`; `NotFound` for safe resource absence | Permission boundary memakai real claims; backend rechecks. |

`GlobalError` adalah last-resort unexpected boundary, bukan component untuk validation, empty, permission, atau normal business conflict. Request ID hanya masuk reporter secara sanitized; jangan menambah visible copy tanpa `UI-080`.

## 4. Route-by-route authority dan network disposition

### 4.1 Marketing, company, resources, and developer pages

| Route(s) | Authority | Initial/empty/error contract | Control disposition | Task/gate |
| --- | --- | --- | --- | --- |
| `/` | Featured/product data dari public API; marketing sections/copy static | Server read; backend must either guarantee a bounded non-empty featured set or the missing empty composition is `UXE-009`; 5xx `GlobalError` | Featured/product links `IMPLEMENT`; navigation/theme `STATIC`; illustrative “mock” metrics require explicit static-copy exception | PUB-100, PUB-110, UI-080 |
| `/features`, `/about`, `/privacy`, `/terms`, `/cookies`, `/security`, `/changelog` | Repository static content | No backend/loading/empty state; broken route uses `NotFound` | Links/anchors/mailto `STATIC`; `/about`/home mock metrics are illustrative only or must be replaced via separate UI-080 copy decision; no fake live claim | PUB-230/UI-080 |
| `/pricing` | Layout/copy static; displayed fee/rate must use approved fee snapshot/policy | Server/public fee failure must not show stale invented rate as current; existing page/error geometry | Register links `STATIC`; fee facts `IMPLEMENT` | PUB-110 |
| `/contact` | Backend contact command or disabled launch decision | Current `ContactPage` has no field-error/pending/general-error region; use `UXE-010` (existing form composition only) or keep submit disabled until UI-080, and `sent` only after accepted backend response | **Launch:** Submit `DISABLED`/`OUT-OF-SCOPE` — mode-gated `disabled`+title when `publicCatalog` is api/disabled; mock may keep prototype `setSent`; never fake-success in API. “Kirim pesan lain” only after real success if re-opened IMPLEMENT | PUB-200/UI-080 |
| `/careers` | Static listing unless recruiting system chosen | No fabricated network state | Each role button currently no-op: `DECISION -> STATIC real link/DISABLED` | PUB-230 |
| `/help` | Static local index unless search backend is chosen | Local search/category navigation may be `STATIC`; no fake results | Search/category buttons currently no-op: `DECISION -> STATIC local behavior/DISABLED` | PUB-230 |
| `/blog`, `/blog/[slug]` | Static repository content at snapshot | Unknown slug -> `NotFound`; no backend required | Article links/back link `STATIC` | PUB-230 |
| `/status` | Real sanitized dependency/platform status or explicitly non-live informational page | Never hardcode “operational”, uptime, incident, or “last checked”; unavailable state must be truthful | Details accordion `STATIC`; status values `IMPLEMENT` before marketed live | PUB-220 |
| `/api` | Marketing static plus documented capability status | No fake capability claim; link errors use root boundary | Docs link `STATIC`; API availability facts authoritative | PUB-230/SEL-330 |
| `/docs/api` | Versioned documentation generated/aligned with valid OpenAPI | Invalid/stale contract blocks release; anchors must target real IDs | Copy buttons/TOC currently incomplete: `DECISION -> STATIC functional`; no `href="#"` | PUB-230/INT-000 |
| API playground component wherever mounted | Isolated sandbox backend/test gateway, never production credential | In explicit `prototype/mock` mode it may retain deterministic labeled no-network response; in `api/live` mode it must call sandbox or be disabled. Never mix modes or show fake IDs as live. | Send/copy/tabs `IMPLEMENT` in sandbox, `STATIC` only as explicit prototype/mock disposition, or `DISABLED` in live; timer success is never an API/live implementation | PUB-230, INT-025 |

### 4.2 Storefront and product

| Route(s) | Authority | Initial/empty/error contract | Control disposition | Task/gate |
| --- | --- | --- | --- | --- |
| `/@{storeSlug}` -> `/store/[storeSlug]` | Published store revision + published products + safe socials | Server read; store absent/suspended/private -> declared `NotFound`; empty product array has no existing empty composition, so require non-empty launch invariant or `UXE-009`; 5xx not 404 | Product links `IMPLEMENT`; search/social/website/announcement link cannot stay no-op | PUB-100, PUB-210/UI-080 |
| `/@{storeSlug}/{productSlug}` -> `/store/[storeSlug]/[productSlug]` | Dedicated public product operation bound to store | Product/store mismatch -> `NotFound`; unavailable/unpublished fail closed; review zero renders zero-safe widths | Checkout link `IMPLEMENT`; back link `STATIC` | PUB-100, CHK-100 |

### 4.3 Auth routes

| Route(s) | Authority | Initial/empty/error contract | Control disposition | Task/gate |
| --- | --- | --- | --- | --- |
| `/register`, `/login` | Seller auth/session/merchant bootstrap | `AuthForm` has field errors/loading only: field `400` and generic invalid may reuse an existing field region; unverified/rate/unavailable/MFA require `UXE-011` decision before canary | Submit/reset/logout/session `IMPLEMENT` only with safe negative-state disposition; seller Google control `DISABLED`/`OUT-OF-SCOPE` (AUT-130 launch deferral; mode-gated when auth≠mock); no buyer Google control; fake success forbidden | AUT-100, AUT-120, AUT-130/UI-080/UXE-011 |
| `/account/login`, `/account/verify` | Buyer magic-link/session | `BuyerLogin` has loading/sent only and verify page is static success; scrub fragment, consume once, map invalid/expired token to safe existing `NotFound` or approved state; request failure gap follows `UXE-011` | Request/consume `IMPLEMENT` only after negative-state disposition; mock query token forbidden | AUT-110/UI-080/UXE-011 |
| `/admin/login` | Admin surface login/pre-MFA session | Snapshot is a static link with default credentials/“Mock access”, not a real auth form. API/live login is blocked until exact same geometry supports real submit, pre-MFA, and failure semantics or separate `UI-080` approval | Mock access unreachable in API; login/MFA/logout `DECISION -> IMPLEMENT/DISABLED` | ADM-100, INT-140/UI-080/UXE-011 |

Default route ownership is fixed: seller reset/verify/invite/MFA uses `/login`; admin invitation/MFA uses `/admin/login`; buyer magic uses `/account/verify`. New auth routes require `UI-080`.

### 4.4 Checkout, order result, delivery, and invoice

| Route(s) | Authority | Initial/empty/error contract | Control disposition | Task/gate |
| --- | --- | --- | --- | --- |
| `/checkout/[checkoutId]` | Public bootstrap/quote, inventory reservation policy, provider intent | Details -> pending intent -> QR polling -> terminal backend state. Current screen has no coupon input, QR-copy control, or dedicated field/general error region; conflict/expired/unavailable must enter `UXE-003` or block flag, never render paid | Existing price/tip/upsell/continue/pay/back controls `IMPLEMENT` only after wallet/pay semantics are frozen; coupon/copy QR are `DISABLED/OUT-OF-SCOPE` unless UI-080; simulate-pay only explicit local/test | CHK-100..CHK-120/UI-080 |
| `/orders/[orderId]/[status]` | Authenticated owner or scoped guest capability; URL status is non-authoritative | Ignore/treat mismatched URL status safely; render backend order state; invalid capability -> safe not-found/login | Delivery/invoice/buy-again/product links `IMPLEMENT/STATIC` as declared; invoice must exchange guest capability or login-gate; no fake download | CHK-130, CHK-140, CHK-150 |
| `/orders/[orderId]/invoice`, `/account/purchases/[orderId]/invoice` | Backend invoice projection with owner/capability | Loading/error/no-store; print from valid projection only | Print `STATIC client`; PDF/download `IMPLEMENT` when advertised | CHK-150 |
| `/invoices/verify/[token]` | Public-safe verification token lookup | Invalid/expired -> existing not-found/invalid composition; never disclose buyer/secret | Verify/result links `IMPLEMENT`; token log/cache policy tested | CHK-150 |

### 4.5 Buyer account

| Route(s) | Authority | Initial/empty/error contract | Control disposition | Task/gate |
| --- | --- | --- | --- | --- |
| `/account` | Session-owned redirect/landing | Bootstrap before private render; unauthenticated -> `/account/login` | Redirect/navigation `STATIC` after authoritative session | INT-120, AUT-110 |
| `/account/purchases` | Buyer-owned bounded purchase result (no paging control in snapshot) | Existing `BuyerShell`; empty must not show demo purchase; background filter keeps rows; additional history requires a bounded launch invariant or `UI-080` | Filter and top search `IMPLEMENT`; purchase links `STATIC`; do not add numbered/cursor pagination in wiring | BUY-100, UXE-002/UI-080 |
| `/account/purchases/[orderId]` | Buyer-owned purchase/delivery grant | Other buyer -> backend safe 404; secret data claimed/revealed on demand only | Update/download/protected-link/reveal/copy/resend/review/invoice/store actions `IMPLEMENT`; none may only set local success | BUY-100, BUY-110, CHK-140/150 |
| `/account/profile` | Buyer profile + preference revision | Keep form on `400/409`; refetch after conflict; avatar lifecycle separate | Save/preferences `IMPLEMENT`; avatar/photo `DISABLED`/`OUT-OF-SCOPE` for launch (INT-175 deferred; no store objects for personal media); “Mulai perubahan email” has no handler/modal, so `DISABLED/OUT-OF-SCOPE` until approved dual-confirm composition/UI-080 | BUY-120/AUT-120, INT-175/UI-080 |
| `/account/security` | Buyer sessions + shared MFA/security state | Revoke current/all triggers authoritative session outcome; no stale rows | Revoke/logout/password/MFA controls `IMPLEMENT` | BUY-130, AUT-120 |
| Buyer shell notification/profile/logout | Session + notification backend | No hardcoded unread/profile actor; cache clears on logout/actor change | Notification/profile/logout `IMPLEMENT`; theme/mobile menu `STATIC` | BUY-140, INT-120 |

### 4.6 Seller routes

| Route(s) | Authority | Loading/error/access contract | Primary controls/tasks |
| --- | --- | --- | --- |
| `/dashboard/onboarding` | Onboarding/store draft + canonical membership | Existing `StoreOnboarding`; resume server state; login/validation/conflict explicit; maintenance/unavailable only if an existing characterized state exists, otherwise block/disable via `UXE-008` | slug/create/patch/complete -> SEL-110; no new maintenance panel |
| `/dashboard` | Store-scoped overview/analytics | Workspace loading/error; no-store -> onboarding; suspended/capability distinct | filters/export -> SEL-100/200 |
| `/dashboard/products`, `/dashboard/products/new`, `/dashboard/products/[productId]` | Store-scoped product catalog/commands | List snapshot has no empty composition and new stores can legitimately have zero products; require a truthful non-empty launch invariant or `UXE-012/UI-080` before API activation; no demo tenant | search/filter/create/save/publish/archive/release/upload -> SEL-210/220/230; no new page/cursor control in wiring |
| `/dashboard/inventory` | Store inventory product summary | Secret never in list/cache; zero products need a launch invariant or `UXE-012`; list has no paging control | filter and existing detail navigation only; no copy/page control may be added | SEL-240/UI-080/UXE-012 |
| `/dashboard/inventory/[productId]` | Store product/inventory detail and stock items | Reveal recent-MFA/no-store; scan/reservation state truthful; only `StockItemsTab` renders existing `TablePagination` | schema/import/reveal/revoke plus detail stock `NumberedPageList`; no copy control exists in snapshot | SEL-240/INT-020 |
| `/dashboard/orders`, `/dashboard/orders/[orderId]` | Store order/delivery read model | Foreign -> safe 404; partial delivery failure not fake completed | filter/page and existing resend control -> SEL-250; retry/revoke backend commands remain `OUT-OF-SCOPE/DISABLED` until an existing control/dialog is characterized—do not add buttons |
| `/dashboard/customers`, `/dashboard/customers/[customerId]` | Tenant customer projection/history | PII permission/bounded view; foreign -> safe 404 | search/filter/page/notes/communication disposition -> SEL-260 |
| `/dashboard/reviews` | Store review aggregate/list (bounded snapshot; no paging control) | Snapshot has no empty composition and summary contains hardcoded values; require authoritative non-empty launch invariant or `UXE-012/UI-080`, then render only mapped summary | filter/reply/report -> SEL-270; no new page/cursor control in wiring |
| `/dashboard/coupons`, `/dashboard/coupons/new` | Store coupon version/state | Conflict/concurrency and expiry authoritative | create/edit/activate/pause/archive -> SEL-280 |
| `/dashboard/storefront` | Draft revision + published revision | Keep preview/layout stable; revision conflict uses existing state/exception | edit/autosave/publish -> SEL-300 |
| `/dashboard/settings` | Store presentation/domain + seller profile/security/bank | Separate store asset from personal avatar; DNS/provider states truthful | store/domain/profile/session/preference/bank -> SEL-310/340 |
| `/dashboard/webhooks` | Seller endpoint/delivery/secret-claim state | Raw secret only once in component memory; SSRF/provider errors explicit | create/edit/test/rotate/claim/retry -> SEL-320 |
| `/dashboard/api-keys` | Store credential + KYC API capability | Masked list; claim once; KYC not fabricated | request/authorize/claim/revoke/KYC -> SEL-330 |
| `/dashboard/balance` | Server finance/ledger projection | Never derive balance from UI; partial read not zero | range/export -> SEL-400 |
| `/dashboard/withdrawals`, `/dashboard/withdrawals/new` | Quote/recent-MFA/provider state | Unknown outcome reconciled; no optimistic balance/history | quote/reauth/create/filter/detail -> SEL-410 |
| Seller shell notification/profile/logout | Session/current store/notification backend | Actor/store switch clears cache before new render | controls -> SEL-420/BUY-140/INT-120 |

For every seller row, existing `DashboardShell`, seller cards/tables/forms/dialogs, workspace loader, and workspace error are mandatory. Backend missing route is a `G` gap in `06`, not permission to keep fixture in API mode.

### 4.7 Admin routes

| Route(s) | Authority | Loading/error/access contract | Primary controls/tasks |
| --- | --- | --- | --- |
| `/admin` | Permission-scoped overview | Admin loader/error; `AdminPermissionBoundary` from real claims | ranges/read model -> ADM-100/110/120 |
| `/admin/merchants`, `/admin/merchants/[merchantId]` | Merchant support projection/typed transitions | PII/secret redaction; direct command backend-guarded | search/page/status/API access/credential authorization/impersonation -> ADM-200/390 |
| `/admin/buyers`, `/admin/buyers/[buyerId]` | Buyer support projection | Permission/PII/ownership; no raw delivery secret | search/page/session/support actions -> ADM-210 |
| `/admin/users` | Staff/invite/assignment state | Anti-escalation; resend decision; invitation token never query/log | invite/revoke/resend/assign -> ADM-220 |
| `/admin/roles`, `/admin/roles/[roleId]` | Role/permission registry | Unknown permission fails closed; protected role read-only | create/edit/archive/grant/remove -> ADM-220 |
| `/admin/profile` | Admin profile/session/MFA/notifications | Personal media `DISABLED`/`OUT-OF-SCOPE` for launch (INT-175 deferred; store objects forbidden for personal photo); session revocation authoritative | profile/security/notification -> ADM-230; photo stays disabled |
| `/admin/orders`, `/admin/orders/[orderId]`, `/admin/payments` | Immutable order/payment/provider evidence | No fake paid/provider lookup; unknown outcome explicit | existing search/filter/provider-verify/resend only -> ADM-300; force/revoke must stay disabled here and may be bound only to the already-characterized fulfillment composition |
| `/admin/withdrawals`, `/admin/withdrawals/[withdrawalId]` | Ledger/provider withdrawal state | MFA/reason/idempotency/permission; unknown outcome | review/hold/reject/approve -> ADM-310 |
| `/admin/inventory` | Redacted inventory operations | Reveal only server recent-MFA/no-store; foreign/unauthorized safe | existing reveal control -> ADM-320; disabled invalidate/delete remain disabled unless separately characterized; no retry/force/revoke controls added |
| `/admin/fulfillment` | Delivery operations | Delivery attempt/evidence state authoritative; foreign/unauthorized safe | existing retry/force/revoke composition -> ADM-320/ADM-300; guarded backend commands only |
| `/admin/reviews` | Moderation read model/state machine | Version/conflict/reason/audit | transition -> ADM-330 |
| `/admin/kyc` | Encrypted KYC metadata + server-decrypted authorized stream | No direct ciphertext object URL; MFA/audit/no-store | view/request-info/approve/reject/document -> ADM-340 |
| `/admin/webhooks` | Provider callback and seller-delivery as distinct resources | Replay/retry state distinct; payload redacted | search/detail/replay/retry/force -> ADM-350 |
| `/admin/audit-logs` | Append-only audit/integrity/export | Integrity warning truthful; export async/redacted | search/detail/verify/export -> ADM-360 |
| `/admin/providers`, `/admin/system` | Real adapter/queue/health/fee/emergency state | No fake operational status; commands versioned/MFA/reason/audit | refresh/preview/emergency -> ADM-370 |
| `/admin/campaigns` | No canonical backend at snapshot; existing announcements screen does render `TablePagination` | API flag blocked until implementation or existing controls disabled; if activated, preserve `NumberedPageList`/`TablePagination` exactly, otherwise keep the whole capability `DecisionPending`/disabled | save/publish/pause/list currently `DECISION` -> ADM-380 |

Every admin mutation uses existing `ControlDialog`/domain modal and `AdminButton` pending semantics where applicable. Hiding an action via permission boundary is supplementary; direct HTTP negative test remains mandatory.

### Pagination profile inventory (must match actual JSX)

| Profile | Existing route/screen examples | Contract rule |
| --- | --- | --- |
| `NumberedPageList` | Seller overview/orders/customers/inventory **detail StockItemsTab only**/traffic/withdrawals/coupons; admin merchants/buyers/orders/payments/inventory/fulfillment/users/withdrawals/webhooks/admin extras/campaign announcements (only if ADM-380 is activated) | Preserve exact `TablePagination`; backend provides authoritative `page/pageSize/totalCount/pageCount` and stable snapshot/sort. Seller inventory list itself has no page control. If campaigns remain disabled, no campaign request or pagination claim is allowed. |
| `CursorList` | Only a surface that already exposes prev/next/infinite interaction after characterization | Opaque cursor and `hasMore`; no arbitrary page/total claims. If no existing control, do not add one in wiring. |
| `BoundedNoPaging` | Seller products, seller reviews, buyer purchases, admin reviews, admin KYC board, admin roles/role builder (snapshot screens without `TablePagination`) | Backend returns bounded deterministic first result and records launch capacity/invariant; additional rows require `UI-080` or a separate approved UI slice. |
| `DecisionPending` | Any route where current UI has a search/filter button but no interaction (seller/admin Cmd-K, toolbar filters, storefront search) | Do not send cursor/page requests until control disposition is `IMPLEMENT` or `DISABLED`. |

The task text may mention a backend cursor for bounded/query efficiency, but it must not imply user navigation unless the route appears in this table as `CursorList` or `NumberedPageList`. Update this table and the task row together when JSX characterization changes.

## 5. Active-control disposition inventory

This table calls out controls that are currently mock/no-op/hardcoded or security-sensitive. Domain task documents contain the full operation checklist.

| Existing control/claim | Snapshot behavior/risk | Required API/live disposition | Owner |
| --- | --- | --- | --- |
| Homepage featured product links | All route through demo store slug | Canonical `storeSlug`/URL from DTO | PUB-100 |
| Marketing mock metrics/claims | Home/about contain illustrative “mock” store/payment metrics | Keep only as explicitly labeled static prototype copy; never treat as live platform truth. Removing/rewriting frozen copy requires UI-080; API/live flag must not bind fake values as authoritative | PUB-230/UI-080 |
| Seller Google button | Seller `AuthShell` visual button without OAuth action | **Launch:** `DISABLED`/`OUT-OF-SCOPE` — mode-gated `disabled`+title when auth domain is api/disabled; mock may keep prototype affordance; never no-op/fake-success in API. BuyerLogin has no such control and must not gain one. Re-open only as IMPLEMENT with full OAuth contract. | AUT-130 |
| Admin login link/default credentials/“Mock access” | Inputs are uncontrolled defaults and CTA is a plain link; no pending/error/MFA region | Mock authority unreachable in API/live; real login remains disabled/blocked until `UXE-011/UI-080` resolves same-geometry form and negative states | ADM-100/INT-140/UI-080 |
| Contact submit | `setSent(true)` locally | **Launch:** `DISABLED`/`OUT-OF-SCOPE` — mode-gated when `publicCatalog` ≠ mock; no contact endpoint; `UXE-010` open. Mock may keep prototype success. Re-open only as IMPLEMENT with exact public contact op + approved error/pending composition | PUB-200 |
| Careers role buttons | No handler/link | Real static external/internal link or disabled | PUB-230 |
| Help search/category cards | No handler | Functional local static index/search or disabled | PUB-230 |
| Docs TOC `href="#"` and copy button | No real target/copy | Real anchor/copy behavior; content aligned OpenAPI | PUB-230/INT-000 |
| API playground Send | Timer-generated success and mock IDs | Isolated sandbox request or disabled; production API credentials never embedded | PUB-230 |
| Public status uptime/incidents | Hardcoded operational claims | Sanitized authoritative status; no green default on failure | PUB-220 |
| Storefront search | Button no handler | Real product filter/search or disabled by capability | PUB-210 |
| Storefront socials/website | `href="#"` | Sanitized `https` URL allowlist + safe external attributes, absent URL -> disabled/not interactive within approved composition | PUB-210 |
| Checkout “pay/simulate” | Local simulator can drive paid | Real intent/poll/callback state; simulator test-only | CHK-110/120 |
| Order URL `[status]` | URL can imply success | Ignore as authority; reconcile backend/capability | CHK-130 |
| Buyer top search | Button no handler | Search purchases or disabled; no pagination control exists in `PurchaseLibrary`, so bounded-result invariant or UI-080 is required before claiming all purchases reachable | BUY-100/UI-080 |
| Buyer mobile logout | Link to `/` only | Backend logout then cache clear/redirect | INT-120/BUY-140 |
| Buyer product update | Local `setUpdated` | Server eligibility/version command + refreshed delivery, or disabled until contract frozen | BUY-110/CHK-140 |
| Buyer download | Local `setDownloaded` | Short-lived signed download after ownership/rate check | CHK-140 |
| Buyer protected link | No handler | Server grant/redirect with TTL; no raw long-lived URL in cache | CHK-140 |
| Buyer credential/code reveal/copy | Raw fixture value already in view | Fetch/claim on explicit action, recent policy if required, component memory, TTL clear | CHK-140 |
| Buyer resend delivery | Button no handler | Idempotent/rate-limited backend resend | CHK-140 |
| Buyer review | Local submitted flag | Eligibility/version/moderation backend command | BUY-110 |
| Buyer profile save/preferences/photo | Local saved toggles/no-op photo | Revisioned backend save; personal media `DISABLED`/`OUT-OF-SCOPE` (INT-175 launch deferral) | BUY-120 |
| Buyer “Mulai perubahan email” | Visible button has no handler/modal/form | `DISABLED/OUT-OF-SCOPE` until AUT-120 can reuse an approved dual-confirm composition/UI-080; no new modal in wiring | BUY-120/AUT-120/UI-080 |
| Buyer session revoke/logout | Local row mutation/no-op logout | Server revoke/session invalidation | BUY-130/INT-120 |
| Seller search/filter/page/export | Many local/hardcoded rows; several screens have no pagination/menu interaction | Server query with explicit `NumberedPageList`, `CursorList`, or bounded launch invariant per route; no new control without UI-080 | Matching SEL read task/UI-080 |
| Seller create/edit/publish/import/reveal/withdraw | Mock/local actions | Exact typed commands, tenant/MFA/idempotency/state/audit | SEL-220/240/280/300/410 |
| Seller settings/domain/webhook/key controls | Fake DNS/delivery/secret/key state | Real runtime operations or disabled until adapters ready | SEL-310/320/330/INT-180/185 |
| Seller store switch/help/search/traffic controls | Store switch/help/Cmd-K/traffic buttons have no complete existing interaction | Canonical store only + disabled switch, or reuse an already approved menu; no new dropdown/search panel/traffic detail without UI-080 | SEL-100/200/UI-080 |
| Seller traffic detail/export | Chart/detail affordances are partly local/hardcoded | Use bounded server aggregate/export job only where existing control has a real handler; otherwise disabled/static disposition, no raw all-event fetch | SEL-200/UI-080 |
| Seller onboarding product-option cards and “Lihat toko”/slug | Selection/link can remain local/demo | Bind to server option/store URL/canonical slug or disable; no fake product creation/demo slug | SEL-110/100 |
| Seller onboarding completion claims | Same panel says “Storefront mock telah dibuat” and hardcodes “Atelier theme • Published” | In API mode bind the same text nodes/classes to authoritative theme/publish state and remove only the documented fake/mock claim; if no approved exact copy mapping, block via UI-080 | SEL-110/UI-080 |
| Seller inventory copy / order retry-revoke | No copy control on inventory and no characterized retry/revoke controls on order screen | Do not add controls; inventory reveal only and order resend only. Future copy/retry/revoke requires existing-control characterization/UI-080 | SEL-240/250/UI-080 |
| Admin permission boundary | Always mock admin session | Real session claims + backend permission checks | ADM-100/110 |
| Admin workspace selector/search/filter/export/status controls | Mock selector/faux Cmd-K/toolbar buttons and hardcoded operational status | Implement against existing approved interaction, or disabled/static disposition; no new menu/filter/panel in wiring slice | ADM-120/370/UI-080 |
| Admin “All systems operational” shell status | Hardcoded green operational claim | Bind to truthful `ADM-370/PUB-220` health/status projection or use existing unavailable state; never display green from fake/noop dependency | ADM-370/INT-180/QLT-320 |
| Admin privileged dialogs | Some local persistence/fake operation | Exact typed backend command; MFA/reason/idempotency/audit | Matching ADM task |
| Admin invite resend | No backend route | Explicit rotate-and-resend operation or disabled | ADM-220 |
| Admin inventory reveal | No admin route | Secure admin facade or disabled | ADM-320 |
| Admin order force/revoke vs fulfillment actions | Order detail exposes resend/provider verification; force/revoke are characterized only in fulfillment composition | Keep order-screen force/revoke disabled; wire retry/force/revoke only in existing fulfillment controls | ADM-300/320 |
| Admin KYC document | Object storage ciphertext/no safe route | Server-auth/decrypt/stream/no-store route | ADM-340 |
| Admin campaigns | No canonical backend | Implement frozen contract or disable entire command capability | ADM-380 |
| Campaign preview CTAs | Preview-only buttons can look actionable | Explicit noninteractive preview or disabled existing control; never submit/publish from preview | ADM-380 |
| Theme toggle, responsive menus, static navigation, print | Genuine client/navigation behavior | `STATIC`; preserve exact existing behavior | UI-090 |

Rule for inventory maintenance: any agent finding an additional active `button`, `form`, `href="#"`, local timer success, local storage mutation, demo authority, or hardcoded live claim must add a row before enabling its surface.

## 6. UI exception/state-composition register

These are not approvals to redesign. They identify where API truth needs a state not fully represented by a route boundary today.

| ID | Situation | Default resolution under UI freeze | Status/owner |
| --- | --- | --- | --- |
| `UXE-001` | Seller/admin/buyer challenge routes for verify/reset/invite/MFA | Compose exact existing auth shell/form/dialog on `/login`, `/admin/login`, `/account/verify`; no new route/design | Pre-authorized constraint by 00; AUT-120/ADM-100 |
| `UXE-002` | Buyer routes have no route-level loading/error boundary or complete empty state | Keep previous data for client refetch; use existing `BuyerShell`/cards. Any new route file/component composition requires UI-080 characterization and pixel review | Pending implementation; BUY tasks/UI-080 |
| `UXE-003` | Checkout expected conflict/expired/provider-unavailable states may lack a complete composition | First reuse exact checkout pieces/inline region. If impossible, block API activation and request UI-080; never map to paid/global success | Pending audit per state; CHK-100..120 |
| `UXE-004` | Per-domain `disabled` mode needs user-visible behavior | Reuse existing route error/permission/disabled control. Do not invent maintenance banner; if no exact composition exists, UI-080 before rollout | INT-025/QLT-400 |
| `UXE-005` | Visible request ID/support reference | Default: reporter/log only. Adding visible text changes copy and requires UI-080 | INT-170 |
| `UXE-006` | Existing numbered `TablePagination` versus cursor-only backend | Preserve component exactly by using NumberedPageList (`page/pageSize/totalCount/pageCount`) or backend-supported adapter; do not fake total/arbitrary jump | INT-020/domain list task |
| `UXE-007` | Static/no-op marketing controls | Implement genuine static behavior in same element or disabled composition; removal/new copy/design requires UI-080 | PUB-230 |
| `UXE-008` | `/dashboard/onboarding` lies outside seller workspace loading/error boundary and `StoreOnboarding` has no guaranteed maintenance/unavailable composition | Use existing onboarding form state and root unexpected boundary. If emergency registration is off and no characterized unavailable state exists, keep the command disabled/block API activation and request `UI-080`; never add a maintenance banner, panel, or ad-hoc copy in wiring | SEL-110/UI-080 |
| `UXE-009` | Public home/storefront arrays have no existing empty composition | Before API flag, choose a server invariant that guarantees a non-empty published set, or obtain UI-080 approval for a composition using exact existing cards/section geometry. Never inject fake cards or silently collapse an advertised section. | Pending product/UX decision; PUB-100/UI-080 |
| `UXE-010` | Contact form has no field-error/pending/general-error region | First use existing form elements with an already approved shared state composition; otherwise keep command disabled and request UI-080. Do not add ad-hoc inline copy in wiring PR. | **Open** — PUB-200 chose launch `DISABLED` (no new composition); UI-080 required before IMPLEMENT |
| `UXE-011` | AuthForm/BuyerLogin/AdminLogin/verify page lack one or more generic auth, MFA, rate-limit, unavailable, or invalid-token regions; AdminLogin is currently a mock link/default-credential surface | Field validation may reuse an existing field error and invalid buyer token may use existing `NotFound`; every other missing state blocks API/live canary or needs an approved existing composition/UI-080. Never map failure to success, expose default credentials, add an auth panel, or silently replay a mutation. | Pending; AUT-100/AUT-110/ADM-100/UI-080 |
| `UXE-012` | Seller product list, seller review list/summary, and seller inventory list have no empty composition; zero rows are valid for new/low-activity stores | Before API activation choose a truthful non-empty launch invariant with product owner, or keep capability disabled/request `UI-080` using exact existing cards. Never inject demo rows, collapse geometry silently, or use hardcoded summary as authority. | Pending; SEL-210/SEL-240/SEL-270/UI-080 |

For any new exception, record: exact route/state, why mapper/hook cannot solve it, existing components considered, screenshot at both breakpoints, a11y/focus impact, product approval, owner, and rollback. Exception change must be a separate reviewed slice from data wiring.

## 7. Route/control acceptance matrix

For each route group activated in API mode, attach evidence that:

- first load, non-empty, empty, background refresh, abort, offline/timeout, `400`, `401`, `403`, declared `404`, `409`, `429`, `5xx`, invalid schema, and success have explicit expected behavior where applicable;
- every visible enabled button/link/form causes a real safe effect; every unavailable action is truly disabled and explains state through existing semantics;
- double click/retry/back/refresh/two tabs do not duplicate mutation or leak stale actor/tenant data;
- no fixture/mock/simulator request is reachable, and production config rejects `mock` source;
- desktop/mobile screenshots remain at approved baseline geometry; dynamic values are normalized, long/zero/unknown data is covered, no snapshot is updated;
- keyboard/focus/aria behavior remains correct, including pending, field error, dialog, polling, reveal, and permission state;
- backend direct-request tests prove ownership/tenant/permission/MFA/CSRF/idempotency independently of UI;
- request/cache/log/trace/screenshot assertions prove secret and PII handling;
- route/control row references a completed task and evidence in `09-EXECUTION-STATUS.md`.

No route is “wired” merely because its initial GET returns data. The route is ready only when its controls, negative states, security boundary, visual parity, observability, feature flag, and rollback behavior are all accounted for.
