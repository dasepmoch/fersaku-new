# Domain Tasks — Admin Console

Admin adalah surface privileged. UI hiding hanya UX; Go backend wajib memverifikasi permission, tenant/target scope, MFA freshness, reason, idempotency, transition, dan audit pada setiap command.

**Dependency rule:** gunakan dependency per-row pada `09-EXECUTION-STATUS.md`; UI freeze dan security foundation tetap entry gate.
**Live dependency:** real runtime/health/callback adapters dan scheduler `INT-180/INT-185` sesuai operation.

Pertahankan `AdminShell`, `AdminPermissionBoundary`, `ControlDialog`, status/table/form primitives, route layout/loading/error, copy, dan responsive behavior exact.

**Pagination profile rule:** existing `TablePagination` screens use authoritative `NumberedPageList`; only a real prev/next/infinite component may use `CursorList`. Admin reviews, KYC board, role list, and any screen without a paging control require bounded-result launch invariant or `UI-080`; backend cursor alone does not make hidden rows reachable.

---

## ADM-100 — Admin login, MFA, session, route guard, logout

**Priority:** P0
**Routes UI:** `/admin/login`, `/admin/**` (filesystem group `(console)` tidak muncul pada URL)
**Backend:** auth login/session/MFA/logout

### Current state

Admin login hanya link/default value; permission boundary selalu mock session. Router auth config belum menjamin admin MFA pada seluruh console/sensitive route.

### Checklist FE

- [x] Wire existing admin login form to auth API with `surface=ADMIN`; no default/mock credential on API path.
- [x] Do not treat session as console-ready until admin surface + email/status + MFA verification pass.
- [ ] Admin/invited staff without an enrolled factor enters the explicit pre-enrollment ticket ceremony from `INT-140`; login must not dead-end because `/mfa/enroll` is only available after full authentication. The ticket cannot access console/business routes. *(deferred: BE 403 “Admin MFA enrollment required”; no pre-enrollment ticket UI until AUT-120/UI-080)*
- [x] Do not rely on UI/layout guard: backend snapshot issues a usable session/roles before MFA. `INT-140` must install pre-MFA ticket or global `MFA_PENDING` allowlist gate so direct HTTP business/admin routes fail before verification.
- [x] Server guard every console route/layout; safe relative `returnTo` only.
- [x] Session provider supplies actor, permission codes, roles, MFA, session ID, impersonation metadata.
- [x] Logout backend-side, clear all admin/private/secret/impersonation caches and redirect.
- [x] `401` opens/reaches existing login, `403` existing permission panel, `MFA_REQUIRED` actual MFA flow. *(MFA verify UI still AUT-120; gate stays on login)*
- [x] Multi-tab revoke/logout and session rotation handled without token storage.
- [x] Snapshot `AdminLogin` is not a working form: it has default credentials, a plain link to `/admin`, and “Mock access”, with no pending/error/MFA region. Remove its mock authority on API path, but do not invent form/error markup in wiring. API/live admin auth remains blocked/disabled until `UXE-011/UI-080` resolves real submit and all negative/pre-MFA states using the exact approved composition. *(wired submit; API defaults empty; mock keeps snapshot defaults; negative regions still UXE-011)*

### Checklist BE

- [ ] Admin login rate limit, surface isolation, mandatory MFA policy.
- [ ] Suspended/disabled staff denied; role/permission changes invalidate or refresh sessions promptly.
- [ ] Cookie/CSRF/session rotation and audit login/security events.
- [ ] No SUPER_ADMIN bootstrap logic exposed through HTTP.

### Tests/AC

- Non-admin/wrong surface/no MFA/disabled/revoked/expired session denied.
- Hard refresh retains valid session/CSRF and console access.
- Existing admin login/console visual unchanged.

---

## ADM-110 — Permission boundary dan least-privilege navigation

**Priority:** P0
**Backend:** permission/role claims and endpoint middleware/service authorization

### Checklist

- [x] Replace `createMockSession("admin")` on API path with session claims.
- [x] Map `features/admin/config/routes.ts` minimum permission to exact backend permission registry.
- [x] Resolve the current FE↔BE permission-code drift before enabling any admin route. Snapshot FE asks for `profile.read`, `campaigns.read`, `withdrawals.read`, `kyc.read`, `providers.read`, and `system.read`; `AllPermissionCodes`/router currently expose no first-class codes for those (GET withdrawals uses `withdrawals.review`, KYC uses `kyc.review`, providers uses `payments.read`, system uses `platform.emergency`, and campaigns has no route). Do not silently broaden a role or hide a 403: choose one of (a) add narrowly scoped backend read codes and attach them to GET routes, or (b) update the FE route registry to the exact existing code, with separate mutation codes, migration/role seed, OpenAPI, and direct-HTTP tests in the same slice.
- [x] Keep `campaigns.read` explicitly `DecisionPending`/disabled until ADM-380 defines a route and permission; `campaigns.publish` alone must not make the current list UI look available.
- [x] Remove unknown mock-only codes (`merchants.update`, `providers.read`, `audit.export`, `kyc.read`, and any similar alias) from API-mode fixtures; mock fixtures may be retained only behind a non-live adapter and must be validated against the generated canonical permission registry.
- [x] Hide/disable navigation/action through existing boundary, but always call protected endpoint that rechecks permission.
- [x] Distinguish read vs write/review/force/reveal/export/assign permissions.
- [ ] Treat `POST /v1/admin/actions` as a temporary compatibility hazard: its `action` value must resolve through a server-side allowlist to an operation-specific permission/target scope, or be replaced by typed routes. `merchants.write` alone may never authorize buyer session/magic/email, review moderation, credential, delivery, provider, withdrawal, or emergency actions. *(BE hazard noted; FE no longer maps unknown aliases; typed route guards remain domain tasks)*
- [ ] Credential permissions are separate from `kyc.review`: define `credentials.read`, `credentials.authorize`, `credentials.rotate`, `credentials.suspend`, and `credentials.revoke` (or an equivalent least-privilege registry) and test that a KYC reviewer cannot manage API keys. *(registry expansion deferred to ADM-200 / BE)*
- [x] Unknown/missing permission fails closed.
- [x] Permission changes trigger session/cache revalidation; stale tabs cannot continue mutation. *(INT-120 broadcast `session-changed` + force bootstrap; FE re-reads claims)*
- [x] Add route permission contract test: every active admin route has declared permission and matching backend operation.
- [ ] Impersonation scope cannot inherit unrestricted admin permission into seller/buyer request. *(ADM-390)*

### Snapshot permission drift that must be resolved atomically

| Admin surface/action | FE code at snapshot | Actual router middleware at snapshot | Required target decision |
| --- | --- | --- | --- |
| Own admin profile | `profile.read` | `/v1/me/profile` only requires authenticated subject; `profile.read` is absent | Prefer admin-surface session guard + subject ownership and remove the unknown page code; add a dedicated code only if policy requires it. |
| Campaign list | `campaigns.read` | No campaign route; only `campaigns.publish` exists in registry | Keep ADM-380 disabled. If implemented, add separate read/publish permissions and exact routes; publish must not imply list UI availability. |
| Withdrawal list/detail vs review | `withdrawals.read` | GET and review all use `withdrawals.review` | Prefer add `withdrawals.read` for GET and retain `withdrawals.review` for command; if intentionally combined, record the least-privilege decision and direct tests. |
| KYC list/detail vs transition | `kyc.read` | GET and transition all use `kyc.review` | Prefer add `kyc.read` for GET/document metadata and retain `kyc.review` for transition/content; do not grant review merely to render a list. |
| Provider page | `providers.read` | `GET /v1/admin/providers` uses `payments.read` | Prefer dedicated `providers.read`; otherwise document why payment-read may view provider health and test both directions. |
| System page vs emergency command | `system.read` | GET system/emergency and POST emergency all use `platform.emergency`; fee preview uses `platform.fees.preview` | Prefer `system.read` for safe reads, `platform.emergency` only for mutation, and `platform.fees.preview` only for preview. |
| Merchant mutation | mock `merchants.update` | Router uses `merchants.write` | Delete/map the unknown alias to canonical `merchants.write`; no dual code registry. |
| Audit export | mock `audit.export` | Export routes currently use `audit.read` | Decide dedicated `audit.export` permission or explicitly accept `audit.read`; migration/router/FE/mock/tests must change together. |

Acceptance: `features/admin/config/routes.ts`, `features/admin/data/access.ts`, `AllPermissionCodes`, migrations/role grants, router middleware, OpenAPI, session claims, and direct-HTTP tests expose one canonical mapping. CI fails on any unknown FE/mock permission code.

### Tests/AC

- Role matrix per route/action; direct URL/direct HTTP denied.
- UI uses existing unauthorized component and no layout change.
- Backend denial cannot be bypassed by editing client session/query cache.

---

## ADM-120 — Admin overview/read-model query foundation

**Priority:** P1
**Routes UI:** `/admin`, shared list pages
**Backend:** overview/platform volume and domain read endpoints

### Checklist

- [x] Schema/mapper every admin read model; most backend domain types are close to FE but still require runtime validation. *(ADM-120 foundation: overview + merchant/buyer/order/payment/withdrawal/review/inventory schemas; domain tasks deepen per surface)*
- [x] Server-side filter/search/sort with `NumberedPageList` for screens that render existing `TablePagination`; screens without that control use bounded result or an approved `UI-080` exception, not an invisible cursor. *(bounded list meta + filters in keys; screens still client-page until ADM-200+ wire NumberedPageList when BE numbered meta lands)*
- [x] Query keys include normalized filters/sort and the selected pagination profile; keep previous data.
- [x] Bounded list limits/stable ordering; no all-row fetch for local pagination. *(limit clamp 50/100; BE cursor pages)*
- [x] Overview aggregate has consistent `asOf`; do not fabricate zeros on partial failure.
- [x] Private admin data SSR/no-store and permission-scoped. *(surface private + claim-gated hooks on api path)*
- [x] Ensure read DTO never includes raw secret/full PII unless exact surface permission requires it. *(inventory list redacted; reveal stays mutation)*
- [x] Preserve `TablePagination` visual dengan `NumberedPageList` authoritative (`page/pageSize/totalCount/pageCount`) dari `INT-020`; gunakan cursor hanya pada surface prev/next yang memang tidak menjanjikan numbered jump. *(foundation accepts optional numbered meta; existing TablePagination chrome unchanged)*

### Tests/AC

- Empty/filter/pagination/abort/429/partial failure.
- Low-privilege admin only receives allowed projections.
- Admin overview/merchants visual baseline unchanged.

---

## ADM-200 — Merchant list/detail, status, API capability, credential support

**Priority:** P1
**Routes UI:** merchant list/detail
**Backend:** admin merchants, status/API-access commands, credential operations, finance read

### Checklist FE

- [x] Wire list/detail/filter through DTO mapper and the route's declared pagination profile; replace hardcoded detail metrics/orders with server read/query composition. *(list/detail/finance/orders composition; TablePagination client-page until BE numbered meta; filter chrome still prototype SearchInput)*
- [x] Merchant status and QRIS API capability remain independent axes.
- [x] Use typed status/API access endpoint where available, not generic action if it weakens transition contract. *(POST `/status` + `/api-access/status`; not generic actions for these)*
- [x] Existing confirmation dialog collects reason/acknowledgement; actual recent MFA proof supplied by auth layer. *(requireRecentMfa on typed commands)*
- [x] Stable idempotency key across retry; no optimistic label/button flip before response. *(idempotency held for dialog; labels from refetch after success)*
- [x] Credential authorize/rotate/suspend/revoke never returns raw key to admin. *(schema + runtime reject `fsk_live_`/`fsk_test_`; rotate via authorize metadata only)*
- [ ] Credential list/authorize/rotate/suspend/revoke routes must not reuse `kyc.review` as a blanket middleware; server operation and UI permission registry stay aligned. *(FE rotate gated `merchants.write`; BE still mounts credential routes under `kyc.review` — registry split remains BE/INT-000)*
- [x] Refetch exact merchant/list/audit/capability keys after success.
- [x] PII/bank/API metadata redacted according permission. *(masked credentials; finance projection only; no raw keys)*

### Checklist BE

- [ ] Enforce permission per action, transition allowlist, MFA, reason, idempotency, atomic append-only audit.
- [ ] Status update does not silently mutate API capability; API suspension does not close storefront merchant.
- [ ] Credential admin command authorizes request only; owner claim remains one-time.
- [ ] Return audit event/request ID.

### Tests/AC

- Missing permission/MFA/reason, invalid/no-op/concurrent transition, duplicate request.
- Generic action permission confusion and KYC-reviewer-to-credential escalation are direct-HTTP negative tests.
- Admin cannot receive raw seller key.
- Existing merchant detail dialog/cards unchanged.

---

## ADM-210 — Admin buyer support surface

**Priority:** P1
**Routes UI:** buyer list/detail
**Backend:** admin buyers, purchases/sessions, typed support actions

### Checklist

- [x] Wire list/detail/purchases/sessions schemas, filters, and declared pagination profiles.
- [x] Fix async local-state copy bug; render authoritative session query.
- [x] Purchase read never exposes delivery secret/raw credential.
- [x] Session revoke uses exact session/owner scope; bulk endpoint where applicable. *(single-session revoke via action + sessionId; bulk “all” still optimistic invalidate of query — BE bulk revoke-all not typed on FE beyond dialog title path when no sessionId)*
- [x] Magic-link/email-change support action produces server-bound, rate-limited workflow; admin never sees login token.
- [x] Existing support dialog reason + permission + recent MFA where policy requires.
- [x] Audit all actions; no browser mock audit. *(ControlDialog auditHandledExternally; mock write uses appendMockAuditEvent only on mock path)*
- [x] Mask PII based on permission; no PII query keys/log/export names. *(keys are buyerId only; email stays in response body under buyers.read)*

### Tests/AC

- Buyer/nonbuyer IDs, permission, session already revoked/current, anti-enumeration support email, cross-buyer.
- No secret in admin buyer response/cache.
- UI unchanged.

---

## ADM-220 — Staff users, invitations, roles, permissions, assignments

**Priority:** P0/P1
**Routes UI:** users, roles list/detail/new
**Backend:** users lookup/detail, permissions, role CRUD/archive/permissions, user roles, invitations

### Current gaps

User/invite data banyak hardcoded/localStorage. Role read shape differs (`{items}`, `isSystem`, flat permissions); live save intentionally throws “not connected”.

### Checklist FE

- [x] Map flat permission registry to existing grouped `AdminPermissionGroup` presentation.
- [x] Map backend role to existing view; `color` remains safe presentational mapping, member count from backend aggregate. *(members=0 on API until BE aggregate; color client-mapped)*
- [x] Wire create/update/archive/permission replace; remove API-mode throw/local role store. *(archive adapter ready; delete chrome still disabled)*
- [x] Use revision/If-Match; preserve form selections on 409. *(expectedVersion on PATCH)*
- [x] Wire staff lookup/detail, role assignment/removal, invite list/create/revoke/accept. *(accept adapter + fragment helpers; public accept page deferred to auth shell)*
- [x] Resend is a backend gap: if existing UI control remains active, add one exact resend operation in `INT-000` that atomically revokes/rotates the prior token, rate-limits delivery, uses stable idempotency, and preserves anti-enumeration. Otherwise mode-gate it to existing disabled state; do not call create twice silently. *(no resend control; create not reused as resend)*
- [x] Token invitation uses fragment scrub + one-time POST; admin never gets reusable plaintext invite token except approved delivery boundary.
- [x] Exact permission boundary for read/write/assign; sensitive privilege changes recent MFA + reason + idempotency.
- [x] Invalidate roles/users/session permission caches narrowly.

### Checklist BE/security

- [ ] System roles immutable as required; custom role code/name constraints.
- [ ] Anti-escalation: actor cannot grant permission outside own delegable scope or remove last required superadmin/admin protection.
- [ ] Separation of duties and self-modification policy explicit.
- [ ] Assignment/invitation transaction + audit atomic.
- [ ] Role changes invalidate affected authorization/session cache promptly.

### Tests/AC

- Create/edit/archive/conflict, system role immutable, last admin, self-escalation, unauthorized permission, duplicate invite, expired/revoked/used invite.
- Existing role builder/users UI unchanged.

---

## ADM-230 — Admin profile, photo, sessions, notifications, security

**Priority:** P1
**Route UI:** `/admin/profile`
**Backend:** `/v1/me/*`, auth sessions/security, notifications

### Checklist

- [x] Replace localStorage/timers with profile/preference/session hooks.
- [x] Profile PATCH with revision; dual-confirm email; password/MFA/session flows. *(email dual-confirm remains disabled chrome; password form not on this screen; MFA recovery + sessions wired)*
- [x] Photo launch disposition: `DISABLED`/`OUT-OF-SCOPE` (`INT-175` deferred). Store-scoped object endpoint remains invalid for admin profile; keep exact existing control disabled.
- [x] Admin notification alias wired to shared notification center.
- [x] Reuse shared notification adapter owned by `BUY-140` and shared security adapters owned by `AUT-120`; this task only binds admin surface/context.
- [x] Revoke current/all sessions triggers correct logout/cache clear.
- [x] No raw MFA/recovery/photo signed URL in cache/storage/log.

### Tests/AC

- Profile conflict, session revoke, MFA changes, notification isolation.
- Existing profile/menu visual unchanged.

---

## ADM-300 — Orders, payments, provider lookup, mismatch evidence

**Priority:** P0/P1
**Routes UI:** orders list/detail, payments
**Backend:** admin orders/payments, provider lookup, mismatch, delivery commands, provider callbacks

### Checklist FE

- [x] Wire server filters/source/date/status with authoritative `NumberedPageList` for orders/payments (`TablePagination` exists). *(bounded list + client TablePagination until BE numbered meta; source filter server-side on payments API path)*
- [x] Detail read model supplies immutable item/customer/amount/fee/net/payment/timeline/delivery evidence; remove hardcoded/derived guesses. *(API path uses server fields only; mock keeps prototype chrome)*
- [x] Provider lookup explicit typed command/read with permission, rate limit, recent MFA/reason if required.
- [x] Payment mismatch data from backend; UI cannot set paid or reconcile arbitrarily.
- [x] Snapshot admin order detail exposes resend and payment verification/provider lookup, not force-fulfill/revoke buttons. Wire only existing controls here; force/revoke remain unavailable on this screen and may bind only to the already-characterized fulfillment composition. Do not add an order action button/menu.
- [x] `UNKNOWN_OUTCOME`/provider unavailable shown as non-success existing status; no optimistic transition.
- [x] Exact query invalidation; audit/request ID retained.

### Checklist BE

- [ ] Payment state provider-event-driven; admin action cannot arbitrary-write status.
- [ ] Provider lookup binds full provider/account/mode reference and records evidence/audit.
- [ ] Force fulfill only on allowed verified evidence state, permission + MFA + reason + idempotency.
- [ ] Callback replay reprocesses canonical stored valid event; invalid rejection not promoted blindly.

### Tests/AC

- Cross-mode/account reference mismatch, duplicate/late callback, invalid transition, missing evidence, timeout/unknown outcome.
- No duplicate ledger/delivery.
- Existing admin order/payment visual and guarded dialog unchanged.

---

## ADM-310 — Withdrawal review/approve/hold/reject/disbursement

**Priority:** P0 money/security
**Routes UI:** withdrawal list/detail
**Backend:** admin withdrawal reads/review

### Checklist FE

- [ ] Freeze the list slash contract: router snapshot mounts `GET /v1/admin/withdrawals/` while FE calls the no-slash path. Align router/OpenAPI/FE or install a tested canonical redirect before wiring; do not rely on framework guesswork.
- [ ] Map list/detail response exactly; fee/net/provider/bank/lock/source from server.
- [ ] Server filters plus declared pagination profile; no client all-row metrics authority.
- [ ] Existing review dialog supplies allowed target, reason, actual recent MFA, stable idempotency.
- [ ] No client fee recalculation or optimistic status.
- [ ] `UNKNOWN_OUTCOME`, on hold, processing, rejected, completed mappings exhaustive and safe.
- [ ] After command, refetch exact withdrawal/detail/ledger/audit/system health.

### Checklist BE

- [ ] Allowed transition per current state; approve/hold/reject semantics explicit.
- [ ] Permission separation (`review` vs `approve` if policy), recent MFA, reason, idempotency.
- [ ] Reserve/ledger/withdrawal/audit/outbox atomic.
- [ ] Provider disbursement and signed callback full-reference dedupe.
- [ ] Unknown outcome keeps reserve; no resend/release until authoritative resolution.

### Tests/AC

- Two reviewers/concurrent version, duplicate approve, wrong state, insufficient proof/permission, callback tamper/duplicate/fee variance/unknown.
- Existing withdrawal screens unchanged.

---

## ADM-320 — Admin inventory redaction/reveal dan fulfillment operations

**Priority:** P0 secret/security, P1 operations
**Routes UI:** `/admin/inventory`, `/admin/fulfillment`

### Backend gap

FE calls `POST /v1/admin/inventory/items/{itemId}/reveal`; only store-scoped reveal exists. Buat admin-specific facade—jangan membuat FE menebak store/menyalahgunakan seller endpoint.

### Checklist BE

- [ ] Admin inventory list/read model is redacted, filtered, bounded by declared pagination profile, and scoped by permission.
- [ ] Add admin reveal facade that resolves item/store internally, checks `inventory.reveal`, actual recent MFA, reason, rate limit, audit.
- [ ] Return one item secret only, `no-store`; no secret in audit/log.
- [ ] Fulfillment list/detail fields from authoritative delivery attempts.
- [ ] Typed retry/revoke/force-fulfill transitions with evidence, permission, MFA, reason, idempotency.
- [ ] Avoid generic action that bypasses domain invariants.

### Checklist FE

- [ ] Remove `mock-recent-mfa` and body-claimed verification.
- [ ] Secret component-local TTL; clear on unmount/visibility/logout; no query cache/export.
- [ ] Split control ownership by actual JSX: `/admin/inventory` wires only its existing reveal action (disabled invalidate/delete remain disabled); `/admin/fulfillment` owns its existing retry/force/revoke composition. Do not add delivery controls to inventory or order screens.
- [ ] Wire fulfillment rows/actions through hooks; remove initial local seed in API mode.
- [ ] Preserve exact existing reveal/confirmation/fulfillment control UI.
- [ ] Refetch exact inventory/fulfillment/order/audit keys after success.

### Tests/AC

- Missing/wrong/expired proof, nonpermission, cross-target, rate limit, already delivered/revoked, retry duplicate.
- Secret never appears in list/cache/log/SSR.
- Existing UI unchanged.

---

## ADM-330 — Review moderation

**Priority:** P1
**Route UI:** `/admin/reviews`
**Backend:** admin review reads/detail and typed transition

### Checklist

- [ ] Server filter/detail mapper with declared pagination profile; no fixture source in API mode.
- [ ] Replace generic arbitrary action with backend allowed moderation transition.
- [ ] Existing `ControlDialog` reason/evidence checkbox preserved; server permission/reason/idempotency, MFA where policy requires.
- [ ] Transition request includes expected version/current state; conflict preserves dialog input.
- [ ] Public/seller/admin review caches invalidated after authoritative success.
- [ ] Audit event linked to review/action/request.

### Tests/AC

- Invalid transition/version, permission/reason, duplicate, public visibility effects.
- Existing admin confirmation critical flow unchanged.

---

## ADM-340 — KYC review dan encrypted document access

**Priority:** P0 security/PII for live QRIS API
**Route UI:** `/admin/kyc`
**Backend:** admin KYC list/detail/transition, merchant KYC upload

`kyc.review` is limited to KYC case/document review. It must not be reused as a blanket permission for `/admin/merchants/{merchantId}/api-credentials/*`; credential operations follow the separate registry defined in `ADM-200`.

### Checklist FE

- [ ] Replace `apiKycSeed` with query/schema/mapper while preserving current panels/dialog.
- [ ] Filter/status and case detail from backend under the declared bounded/pagination profile.
- [ ] Document access explicit, short-lived, `no-store`; no persistent cache/log/screenshot/telemetry URL. Snapshot backend has metadata routes only and R2 bytes are AEAD ciphertext, sehingga direct presigned URL bukan viewer.
- [ ] KYC upload seller side uses server-mediated multipart; do not use presigned general object endpoint.
- [ ] Browser `FormData` does not set multipart Content-Type manually; progress/cancel safe.
- [ ] Approve/reject/resubmit uses allowed transition + reviewer note + permission + recent MFA + idempotency + audit.
- [ ] KYC gates live QRIS API only, not storefront/withdrawal by hidden risk rule.

### Checklist BE/runtime

- [ ] Validate size/MIME/magic bytes, real malware scan, envelope encryption private storage.
- [ ] Add exact authenticated admin document-content operation via `INT-000` (for example case/document-scoped content route): permission + tenant/case scope + actual recent MFA, server-side decrypt stream, bounded bytes, `Cache-Control: no-store, private`, `X-Content-Type-Options: nosniff`, restrictive CSP/sandbox and safe `Content-Disposition`.
- [ ] Decrypt/serve only authorized reviewer; access audit contains identifiers/reason/result but never raw document/PII payload. Do not expose private R2 URL because it yields ciphertext and bypasses view policy.
- [ ] Transition allowlist/version and dual control if policy specifies.
- [ ] Retention/deletion/legal policy documented.

### Tests/AC

- MIME spoof/malware/oversize, unauthorized document, signed URL expiry, transition conflict, missing proof/reason.
- Existing KYC guarded dialog visual unchanged.

---

## ADM-350 — Provider callbacks + seller webhook deliveries console

**Priority:** P0/P1
**Route UI:** `/admin/webhooks`
**Backend:** `/v1/admin/provider-callbacks`, `/v1/admin/seller-webhook-deliveries`

### Required model

UI mengomposisikan dua resource berbeda:

```ts
type AdminWebhookRow =
  | { kind: "PROVIDER_CALLBACK"; /* provider fields */ }
  | { kind: "SELLER_DELIVERY"; /* outbound fields */ };
```

Backend tidak boleh mencampur ownership/signature/retry semantics kedua resource.

### Checklist FE

- [ ] Query kedua endpoint dengan filter dan declared pagination profile masing-masing; mapper discriminated union ke existing table.
- [ ] Stable unique row key includes kind + ID.
- [ ] Provider replay hanya pada valid stored callback dan permission.
- [ ] Seller delivery retry hanya outbound delivery endpoint.
- [ ] Force-fulfill uses order delivery command + verified evidence, not a fake local row update.
- [ ] Existing detail/guarded dialogs preserved; actual reason/MFA/idempotency.
- [ ] Response/evidence redacted; never render signature/token/full secret body.
- [ ] Partial source failure shown via existing error pattern, not silently omitted.

### Checklist BE

- [ ] Callback ingress security from `INT-180` complete.
- [ ] Replay/retry transitions idempotent and audited.
- [ ] Pagination/filter contracts independent.
- [ ] Sensitive payload evidence redacted/bounded.

### Tests/AC

- ID collision across kinds, partial failure, invalid callback replay, seller retry, force-fulfill evidence, permission/MFA/reason.
- Existing admin webhook critical flow unchanged.

---

## ADM-360 — Audit search/detail/integrity/export

**Priority:** P0/P1
**Route UI:** `/admin/audit-logs`
**Backend:** audit logs/detail/integrity/export jobs

### Current gap

FE membuat mock hash chain/export di browser. Live audit must come only from append-only backend.

### Checklist FE

- [ ] Schema/mapper canonical audit fields to existing display contract; no fabricated IP/result/hash.
- [ ] Server filter/date/actor/action/resource/request/merchant with the declared `NumberedPageList` profile where the existing table has pagination; no PII query key.
- [ ] Detail and integrity verification endpoint authoritative.
- [ ] Export creates async job with reason/permission/MFA if required; poll bounded; short signed download; no local CSV of full data.
- [ ] Remove `appendMockAuditEvent` and local chain from API path.
- [ ] Display request/audit IDs through existing UI only, with copy safe.

### Checklist BE

- [ ] Privileged command domain change + idempotency + outbox + audit atomic where required.
- [ ] Append-only DB role/constraints/hash chain/checkpoint/integrity proof.
- [ ] Export scoped, redacted, bounded, expiring, audited.
- [ ] Audit log cannot contain raw secrets/tokens/docs/full sensitive payload.

### Tests/AC

- Chain tamper detection, pagination/filter ordering, concurrent append, permission, export expiration/redaction.
- Live UI does not append client-created audit event.
- Existing audit UI unchanged.

---

## ADM-370 — Providers, system health, fees, emergency controls

**Priority:** P0 for truthful live status
**Routes UI:** providers/system
**Backend:** providers/system/emergency/fee read+preview

### Checklist FE

- [ ] Replace timers/local state with real provider/system snapshots and typed emergency commands.
- [ ] Active launch fee fields stay read-only; preview is pure and never persists configuration.
- [ ] Health reflects actual adapter, mode/account scope, last check, degraded/unavailable—never fake OK.
- [ ] Exactly approved emergency switches (`SELLER_REGISTRATION`, `QRIS_CHECKOUT`, `WITHDRAWALS`) with version/If-Match.
- [ ] Emergency mutation existing guarded dialog + permission + actual MFA + reason + incident ticket + idempotency; no optimistic success.
- [ ] Conflict refreshes version without losing reason.
- [ ] Health polling bounded and visibility-aware.

### Checklist BE

- [ ] `ComponentHealth` tests real Xendit/R2/Redis/mail/worker dependencies; readiness semantics documented.
- [ ] Production fake/noop fails boot/readiness.
- [ ] Emergency switches enforced at corresponding business entry points, not UI only.
- [ ] Fee preview pure integer math; publish/mutate fee endpoints remain rejected unless separately approved product scope.
- [ ] Immutable audit with before/after/version/ticket.

### Tests/AC

- Dependency degraded, emergency version conflict, missing proof/reason/permission, duplicate action, business endpoint enforcement.
- Existing system/provider/fee critical flow unchanged.

---

## ADM-380 — Campaign/announcement backend dependency

**Priority:** P2/P1 if launch-active
**Route UI:** `/admin/campaigns`
**Status:** backend route/domain not found at snapshot.

### Required decision

Jika campaign tidak termasuk launch scope, capability flag harus menjaga API cutover surface ini tetap unavailable melalui existing state—tanpa mock data di production. Jika termasuk scope, implement backend berikut.

### Backend task

- [ ] Define announcement/campaign aggregate: draft, audience/surface, schedule, status, content constraints, acknowledgement/read model.
- [ ] Endpoints list/detail/create/update/test/publish/pause/archive and recipient acknowledgement.
- [ ] Recipient selection bounded and privacy-safe; no arbitrary query/code execution.
- [ ] Test send rate-limited; publish permission + recent MFA + reason + idempotency + audit.
- [ ] Worker/mail/in-app delivery reliable through outbox.
- [ ] Version/concurrency and schedule timezone semantics.

### Frontend task

- [ ] Map backend contract to existing campaign/announcement UI; no new design.
- [ ] `announcements.tsx` already renders `TablePagination`; if capability is activated, use authoritative `NumberedPageList` (`page/pageSize/totalCount/pageCount`). If backend remains absent, keep the entire route/capability disabled/`DecisionPending` and do not wire a hidden cursor or mock page count.
- [ ] Replace local seed/timers with queries/mutations.
- [ ] Preserve draft inputs on conflict/error; no optimistic published status.
- [ ] Exact notification/campaign cache invalidation.

### Tests/AC

- Invalid audience/schedule, duplicate publish, pause race, permission/MFA, test rate limit, delivery dedupe/ack.
- No mock campaign visible in live if backend is disabled.

---

## ADM-390 — Server-issued impersonation lifecycle

**Priority:** P0 security
**Routes UI:** admin user/merchant dialog + seller/buyer target surface
**Backend:** start/terminate impersonation, middleware gate

### Current risk

FE stores session in `sessionStorage` and exposes target/session identifiers in URL. This is not authority and can be tampered.

### Checklist FE

- [ ] Start through backend with target type/ID, allowed scope (`READ_ONLY` default or bounded support-write), TTL, reason, actual recent MFA, idempotency.
- [ ] Backend rotates/sets scoped server session; frontend stores no raw session token/ID in URL/storage.
- [ ] Redirect target through safe internal route; banner reads session impersonation metadata.
- [ ] Read-only/support-write controls continue using existing boundary, but backend gate enforces every mutation.
- [ ] Terminate backend-side, clear target caches, restore/require admin session per secure design, redirect admin.
- [ ] Expiry detected server-side; stale browser automatically loses access and clears client state.
- [ ] No full privileged scope option.

### Checklist BE

- [ ] Actor permission, target, reason, MFA, TTL, scope, original session binding, audit.
- [ ] Strict support-write command allowlist; all unspecified mutations denied.
- [ ] Cannot chain impersonation or impersonate more privileged admin unexpectedly.
- [ ] Termination/expiry/revocation immediate; audit actor+effective subject without leaking token.

### Tests/AC

- Tampered URL/storage has no effect; direct mutation read-only denied.
- Expiry/terminate/admin session revoke/multi-tab/target disabled.
- Existing impersonation dialog/banner/critical flow appearance unchanged, but storage-based mock test replaced API-mode counterpart.

---

## Admin completion gate

- [ ] No mock admin session/permission/audit/impersonation on API path.
- [ ] Every route/action maps to backend permission and negative test.
- [ ] Sensitive action has actual recent MFA, reason, stable idempotency, allowed transition, atomic audit.
- [ ] No raw merchant key/inventory secret/KYC doc/delivery secret/token in list/cache/storage/log/export.
- [ ] All list screens use server filters behind the profile inventory in `10`: NumberedPageList for existing TablePagination, CursorList only for an existing prev/next surface, and BoundedNoPaging/UI-080 for boards without paging controls.
- [ ] Provider/system health is truthful; fake/noop cannot appear green in live.
- [ ] Campaign has explicit backend implementation or live-disabled disposition.
- [ ] Mock, API-mode, visual, a11y, RBAC, tenant, security, concurrency suites pass.
