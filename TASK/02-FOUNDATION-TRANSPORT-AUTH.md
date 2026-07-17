# Foundation Tasks — Contract, Transport, Auth, Tenant, Runtime

Semua domain task bergantung pada dokumen ini. Jangan mulai mutation commerce/secret/admin sebelum `INT-000` sampai `INT-150` lulus.

## Konvensi metadata

- **Priority:** P0/P1/P2.
- **Depends on:** task yang harus selesai lebih dahulu.
- **Likely files:** petunjuk, bukan batasan; audit ulang sebelum edit.
- **Evidence:** artefact wajib sebelum `[x]`.

---

## INT-000 — Perbaiki dan bekukan OpenAPI sebagai wire contract

**Priority:** P0
**Depends on:** UI-000
**Owner:** BE contract + FE consumer reviewer

### Objective

Membuat `backend/api/openapi.yaml` valid, lengkap, konsisten dengan router/handler aktual, dan dapat dipakai untuk contract test serta TS transport type generation.

### Current evidence

- YAML gagal parse pada scalar description sekitar audit line 6236.
- Security scheme reference tidak konsisten (`cookieAuth` vs `sessionCookie`).
- Route seller order/customer/review dan admin inventory reveal/campaign belum ada meski dokumen lama mengklaim surface tersebut.
- `backend/test/contract` kosong.

### Checklist BE

- [ ] Perbaiki seluruh syntax YAML; lint dengan parser + validator yang mendukung versi spec yang dideklarasikan saat ini, OpenAPI `3.0.3`.
- [ ] Jangan meng-upgrade ke OpenAPI 3.1 diam-diam. Jika 3.1 memang dibutuhkan, buat migration contract terpisah, verifikasi generator/provider/consumer, lalu ubah version secara deliberate.
- [ ] Standardisasi security scheme: session cookie, API key gateway, public/capability, dan callback auth harus berbeda jelas.
- [ ] Pastikan setiap production router operation memiliki `operationId` unik dan spec entry.
- [ ] Coverage includes canonical `/v1/gateway/*`, legacy `/v1/qris/*` aliases, inbound `/v1/webhooks/xendit`, `/sandbox`, `/live`, disbursement callback, and explicit rejection/non-production routes. Each gets auth/mode/deprecation/security disposition in matrix `06`; omission is a contract failure.
- [ ] Pastikan setiap spec operation benar-benar dipasang router atau ditandai future/non-production dan tidak digenerate sebagai available client.
- [ ] Dokumentasikan method/path, auth, permission, tenant/ownership, recent MFA, CSRF, audit reason, idempotency, conditional header, content type, request body, query, success status, envelope, error codes.
- [ ] Pisahkan route `_scaffold`, `_test`, dan `simulate-payment` dari production bundle/spec, atau beri extension/environment guard yang diverifikasi.
- [ ] Dokumentasikan integer IDR (`int64`, no fractional input) dan timestamp RFC3339 UTC.
- [ ] Tetapkan dua profile list yang eksplisit: `CursorList` untuk infinite/prev-next surface dan `NumberedPageList` untuk table yang sekarang menampilkan total, page number, last-page jump, serta “Showing X-Y of N”. Jangan mengklaim cursor history dapat memenuhi numbered jump.
- [ ] Untuk `NumberedPageList`, contract minimal membawa `page`, `pageSize`, `totalCount`, `pageCount`, stable sort/snapshot semantics; backend boleh memakai indexed offset/seek internal tetapi client tidak fetch-all.
- [ ] Untuk `CursorList`, gunakan `data: []` + opaque `nextCursor`/optional `previousCursor` + `hasMore`; jangan tampilkan total/page jump yang tidak diketahui.
- [ ] Endpoint harus mendeklarasikan tepat satu pagination profile. Jika existing endpoint membungkus `{items}`, migrasikan atau dokumentasikan compatibility mapper secara versioned.
- [ ] Tambahkan schemas untuk `SuccessEnvelope`, kedua pagination meta, `ProblemEnvelope`, field violations, rate-limit response, concurrency conflict.
- [ ] Dokumentasikan `X-Request-ID`, `X-CSRF-Token`, `Idempotency-Key`, `X-Audit-Reason`, `X-Recent-MFA-Proof`, `If-Match`, `Retry-After`.
- [ ] Tambahkan missing endpoint yang sudah disetujui atau tandai explicit backend dependency; jangan menulis endpoint fiktif sebagai implemented.
- [ ] Periksa strict JSON: body spec tidak boleh mendorong FE mengirim view model/unknown fields.

### Contract rules

```json
{
  "data": {},
  "meta": {
    "requestId": "req_01...",
    "timestamp": "2026-07-17T10:00:00Z"
  }
}
```

```json
{
  "problem": {
    "code": "VALIDATION_FAILED",
    "message": "Request validation failed",
    "details": {
      "fields": [{ "field": "email", "code": "INVALID" }]
    },
    "requestId": "req_01..."
  }
}
```

Cursor list:

```json
{
  "data": [],
  "meta": {
    "requestId": "req_01...",
    "timestamp": "2026-07-17T10:00:00Z",
    "nextCursor": "opaque-or-absent",
    "hasMore": false
  }
}
```

Numbered table list:

```json
{
  "data": [],
  "meta": {
    "requestId": "req_01...",
    "timestamp": "2026-07-17T10:00:00Z",
    "page": 1,
    "pageSize": 20,
    "totalCount": 74,
    "pageCount": 4
  }
}
```

### Tests/evidence

- OpenAPI parse + lint + bundle command hijau.
- Contract test memastikan semua `operationId` unik dan referenced schema/security valid.
- Router inventory test membandingkan method/path production dengan spec allowlist.
- Golden test untuk success/problem/list envelope.
- CI gagal bila generated artefact dirty setelah codegen.

### Acceptance criteria

- Spec valid dan tidak mengklaim route yang tidak tersedia.
- Seluruh endpoint pada `06-ENDPOINT-CONTRACT-MATRIX.md` memiliki disposition jelas: available, backend task, or out-of-scope.
- FE dapat generate transport types tanpa manual `any`.
- Perubahan kontrak berikutnya memerlukan review provider + consumer.

---

## INT-010 — Generate transport DTO dan runtime schema; pertahankan view model

**Priority:** P0
**Depends on:** INT-000

### Objective

Memisahkan wire DTO dari view model dan memvalidasi setiap response API pada runtime tanpa menyentuh JSX/UI.

### Design

```text
generated OpenAPI types
  -> generated/handwritten Zod response schema
  -> feature mapper
  -> existing feature contract/view model
```

Generated files tidak boleh diedit manual. Mapper tetap handwritten karena tugasnya menjaga UI contract.

### Checklist FE

- [x] Pilih generator yang compatible dengan declared OpenAPI `3.0.3` dan TypeScript/Zod; pin versi dan lockfile. Migration ke 3.1, bila ada, harus deliberate dan diuji terpisah. *(openapi-typescript@7.9.1)*
- [x] Letakkan artefact pada directory jelas, mis. `shared/api/generated/`; export transport-only types.
- [x] Tambahkan script `api:lint`, `api:generate`, `api:check`.
- [x] Buat schema envelope/problem/meta reusable di `shared/api/schemas.ts`.
- [x] Setiap `apiRequest` feature harus mengirim `schema`; larang cast-only via lint/architecture test. *(INT-100: runtime requireSchema + architecture-boundaries; structural envelope until domain DTOs)*
- [x] Buat mapper per domain; mapper tidak boleh mengimpor React/component. *(pattern + catalog example; other domains co-evolve)*
- [x] Exhaustive-map enums. Unknown authoritative state menghasilkan typed safe error/state, tidak dipetakan ke success.
- [x] Money divalidasi integer safe range; jangan menggunakan float untuk calculation transactional.
- [x] Timestamp divalidasi sebagai string RFC3339, lalu diformat dengan formatter existing.
- [x] DTO secret diberi path/function khusus dan tidak menjadi bagian generic cached query model. *(pattern in MAPPER-PATTERN.md; no secret DTO in generic cache helpers)*
- [x] Tambahkan fixture provider (raw API) dan consumer (existing view model) untuk parity mock/API. *(catalog unit fixtures)*

### Likely files

```text
package.json
shared/api/contracts.ts
shared/api/schemas.ts
shared/api/generated/**
features/**/api.ts
features/**/data/*.ts
features/**/mappers.ts
tests/unit/**contract*.test.ts
tests/unit/architecture-boundaries.test.ts
```

### Tests

Untuk setiap endpoint adapter minimum:

- valid success;
- malformed envelope;
- missing required field;
- unknown enum;
- unsafe/fractional money;
- problem envelope;
- empty list + cursor;
- mapper parity dengan mock view model;
- payload rahasia tidak muncul dalam error/report.

### Acceptance criteria

- Tidak ada live adapter yang menerima response melalui TypeScript cast saja.
- Transport DTO tidak bocor ke screen/component.
- Mock dan API menghasilkan existing view contract yang sama.
- Invalid response fail closed sebagai `INVALID_API_CONTRACT` dengan request ID dan redacted diagnostics.

---

## INT-020 — Kunci semantics HTTP, pagination, versioning, dan errors

**Priority:** P0
**Depends on:** INT-000

### Checklist

- [x] Definisikan status success per operation (`200`, `201`, `202`, `204`) dan jangan menganggap semua mutation synchronous. *(shared/api/http-semantics.ts)*
- [x] Definisikan stable problem codes untuk auth, CSRF, MFA, tenant/permission, not found, validation, conflict, idempotency, rate limit, provider unavailable, unknown outcome. *(shared/api/problem-codes.ts)*
- [x] Bedakan resource `404` dari unauthorized/forbidden/network. *(shared/api/error-policy.ts)*
- [x] Untuk cursor profile, gunakan opaque cursor dengan stable ordering/tie-breaker; filter/sort menjadi bagian cursor atau invalidates cursor. *(shared/api/pagination.ts)*
- [x] Untuk route yang memakai existing `TablePagination`, gunakan numbered-page profile dengan authoritative total/pageCount dan arbitrary visible page jump. Jangan fetch seluruh dataset atau berpura-pura mengetahui total dari cursor history. *(numberedMetaToTablePagination)*
- [x] Definisikan `If-Match`/`expectedRevision` untuk storefront, profile, role, emergency control, dan mutable resource lain. *(http-semantics)*
- [x] Definisikan idempotency replay: same key + same canonical body mengembalikan hasil sama; same key + different body `409`. *(shared/api/idempotency.ts)*
- [x] `Retry-After` tersedia pada `429`/service backpressure bila relevan. *(parseRetryAfterHeader + rate_limited classification)*
- [x] Secret response dan private reads mengirim `Cache-Control: no-store`. *(CACHE_CONTROL_NO_STORE helper; BE already emits)*
- [x] Backend `204` tidak mengirim JSON body. *(expectsEmptyBody + existing apiRequest 204 path)*

### Error mapping policy FE

| HTTP/problem | Behavior |
| --- | --- |
| 400 malformed | Generic existing form error; log request ID, bukan payload. |
| 400 `VALIDATION_FAILED` | Map typed field violations ke controls existing; backend snapshot menggunakan 400. |
| 401 | Clear private cache/session and redirect ke login surface dengan safe relative `returnTo`. |
| 403 CSRF | Coba satu controlled token recovery bila contract mengizinkan; mutation replay hanya dengan same idempotency key. |
| 403 permission | Existing permission boundary; no retry. |
| 404 resource | Detail adapter boleh return `null` hanya untuk expected resource-not-found code. |
| 409 conflict | Preserve input/draft; existing conflict/error surface; refetch authoritative revision. |
| 409 idempotency conflict | Jangan generate key baru otomatis; minta user memulai intent baru setelah state diperiksa. |
| 429 | Hormati `Retry-After`; no retry storm. |
| 5xx/network/timeout | Retry safe GET terbatas; mutation masuk recovery/unknown state, bukan auto retry. |

### Acceptance criteria

- Contract test meliputi semua row di atas.
- Query/UI tidak menyamarkan API error sebagai empty/mock.
- Pagination backend dapat digunakan tanpa mengubah visual `TablePagination`.

---

## INT-025 — Per-domain data-source/capability registry

**Priority:** P0
**Depends on:** INT-000, INT-020

### Objective

Mengganti keputusan global `isLiveApi()` dengan source selection per domain yang konsisten antara SSR dan browser serta aman untuk rollout bertahap.

### Required model

```ts
type DomainSource = "mock" | "api" | "disabled";
type DataDomain =
  | "publicCatalog"
  | "auth"
  | "checkout"
  | "buyer"
  | "sellerCatalog"
  | "sellerOperations"
  | "sellerFinance"
  | "adminRead"
  | "adminWrite";
```

Exact grouping dapat disesuaikan, tetapi money/secret/privileged domains harus dapat dihentikan terpisah dari public reads.

### Checklist

- [x] Buat registry/selector typed yang di-inject ke feature adapters; screen tidak membaca env/flag.
- [x] `mock` hanya valid pada prototype/test/non-live. Pada live, flag off menghasilkan `disabled`, **bukan fallback mock**.
- [x] Flag/capability source server-controlled dan request-stable; jangan hanya build-time `NEXT_PUBLIC_*` untuk emergency control.
- [x] SSR mengevaluasi source sekali dan meneruskan non-sensitive snapshot ke client/hydration agar tidak mismatch.
- [x] Actor/tenant capability tetap berasal backend session/bootstrap; feature flag tidak menggantikan permission.
- [x] Evaluation memiliki default fail-closed, version/release ID, metrics, dan bounded audit untuk admin changes.
- [x] Define behavior `disabled` memakai existing maintenance/read-only/error component dari route-state matrix.
- [x] Mock adapter tetap dapat dipilih secara eksplisit oleh unit/visual prototype suite.
- [x] Add architecture rule: new feature adapter tidak boleh memanggil global `isLiveApi()` langsung setelah migrasi registry selesai.

### Tests/AC

- SSR/client memilih source yang sama pada satu request.
- Public catalog API dapat aktif saat seller finance/admin write masih disabled.
- Live-disabled domain tidak mengeluarkan mock row/success/secret.
- Flag change tidak memindahkan mutation yang sedang in-flight ke source lain; logical intent diselesaikan/recovered pada source awal.

---

## INT-030 — Tetapkan topology same-origin dan environment contract

**Priority:** P0
**Depends on:** INT-000

### Recommended topology

Browser memanggil relative same-origin `/v1/...`; ingress/reverse proxy mengarahkannya ke Go API. Next tidak memiliki commerce logic dan tidak memodifikasi body/response selain transparent proxy bila benar-benar diperlukan.

Server-side fetch memakai env server-only, misalnya `API_INTERNAL_URL=http://api:8080`, bukan `NEXT_PUBLIC_*`.

### Checklist

- [x] Pilih dan dokumentasikan ingress mapping `/v1`, health, static Next, trusted proxy chain, TLS, host/cookie domain. *(TASK/evidence/INT-030/topology.md)*
- [x] Ubah browser URL builder agar mendukung same-origin relative base. *(shared/api/http-client.ts `buildApiUrl`)*
- [x] Tambahkan `API_INTERNAL_URL` server-only dengan startup validation; jangan expose ke client bundle. *(shared/config/env.ts)*
- [x] Selaraskan local native vs compose port (`8080` vs host `18080`). *(DEFAULT_API_INTERNAL_URL=http://127.0.0.1:18080)*
- [x] Pisahkan config prototype, API-local, test, staging, production; fail closed bila live masih mock/fake. *(assertSafePublicEnvironment + requireApiInternalUrl)*
- [x] Atur session cookie `HttpOnly`, `Secure` pada TLS, `SameSite` sesuai topology, narrow Path/Domain. *(documented topology; BE attributes owned by auth tasks)*
- [x] Pastikan CSP `connect-src` hanya origin yang dibutuhkan. *(next.config.ts same-origin 'self')*
- [x] Definisikan proxy timeouts/body limits; callback/upload route punya kebutuhan berbeda. *(topology.md; large callbacks terminate on Go/edge)*
- [x] Hanya trust `X-Forwarded-*` dari trusted proxy CIDR. *(documented; BE enforcement)*
- [x] Jika organisasi memilih cross-origin: implement exact-origin allowlist, credentialed CORS, correct `Vary: Origin`, OPTIONS, method/header allowlist, dan negative tests. Wildcard origin dilarang dengan credentials. *(non-default path documented; official remains same-origin)*

### Tests/evidence

- Browser login cookie dan unsafe mutation bekerja pada local/staging topology.
- Preflight/cookie test bila cross-origin.
- Internal URL tidak muncul dalam JS bundle/source map/public env.
- Host header/trusted proxy tests.
- Docker compose runbook yang dapat direproduksi.

### Acceptance criteria

- Satu topology resmi dipakai CI/staging/prod.
- Browser dan SSR mencapai API tanpa CORS/cookie ambiguity.
- Production tidak dapat start dengan kombinasi live + mock/empty internal URL.

---

## INT-100 — Hardening browser HTTP client

**Priority:** P0
**Depends on:** INT-010, INT-020, INT-030

### Objective

Menyediakan satu transport browser yang benar untuk envelope, abort, timeout, headers, redaction, retry semantics, dan correlation.

### Checklist FE

- [x] Parse `{problem:{...}}`, bukan top-level problem.
- [x] Pertahankan status, stable code, details/field violations, request ID, `Retry-After`.
- [x] Standardisasi header menjadi `X-Recent-MFA-Proof`.
- [x] Gunakan relative `/v1` pada browser topology same-origin.
- [x] Validasi content type dan JSON; bedakan empty `204`, invalid JSON, invalid schema.
- [x] Kombinasikan caller abort + timeout tanpa listener leak.
- [x] Request ID dibuat cryptographically random bila tersedia dan disalin ke reporter yang redacted.
- [x] Unsafe cookie-auth request mengambil CSRF dari session layer secara otomatis; caller tidak copy-paste token. *(hooks: `setHttpClientSessionHooks`; INT-120/130 wire store)*
- [x] Sensitive context (MFA/audit/idempotency) hanya dipasang pada operation yang membutuhkan.
- [x] Jangan log body/header secret/full response.
- [x] Jangan auto-retry mutation di client.
- [x] Safe GET retry dikelola query policy, hanya network/408/429/5xx, exponential backoff + jitter + `Retry-After`. *(client single-shot; query policy INT-160)*
- [x] Saat 401, dedupe session-expired handling agar banyak query tidak memicu redirect/toast storm.

### Tests

Extend `tests/unit/http-client.test.ts`:

- [x] success/list/204;
- [x] ProblemEnvelope setiap status;
- [x] request ID forward/response precedence;
- [x] timeout vs caller abort;
- [x] invalid JSON/schema;
- [x] CSRF/MFA/idempotency/audit headers;
- [x] 401 dedupe;
- [x] Retry-After parsing;
- [x] no payload secret in reporter.

### Acceptance criteria

- [x] Typed backend errors sampai ke feature/UI dengan code/details/requestId utuh.
- [x] Header contract sama dengan OpenAPI/backend.
- [x] Semua live feature adapter memakai schema. *(runtime requireSchema + architecture gate; structural envelope phased until domain DTOs)*

---

## INT-110 — Buat server-only HTTP client dan private SSR policy

**Priority:** P0
**Depends on:** INT-030, INT-100

### Current risk

Protected detail pages memanggil browser client dari Server Component. Node fetch tidak memiliki browser cookie jar, sehingga `credentials: include` tidak meneruskan incoming user cookie.

### Checklist FE

- [x] Buat module `server-only` yang membaca Next `cookies()`/`headers()`. *(shared/api/server-http-client.ts + server-cookie-forward.ts)*
- [x] Gunakan `API_INTERNAL_URL`; jangan memanggil public origin jika internal route tersedia. *(requireApiInternalUrl / buildServerApiUrl)*
- [x] Forward hanya session cookie yang diperlukan dan `X-Request-ID`; jangan forward seluruh header browser. *(FORWARDED_COOKIE_ALLOWLIST / pickForwardedRequestHeaders)*
- [x] Jangan forward authorization/cookie ke arbitrary host; base URL harus config fixed.
- [x] Private seller/buyer/admin fetch selalu `cache: "no-store"` dan tidak memakai shared public cache/tag. *(privacy: "private" default)*
- [x] Public catalog dapat memakai explicit revalidate/tag sesuai staleness policy. *(privacy: "public" + next)*
- [x] Gunakan schema/problem parser yang sama tanpa mengimpor client-only session state. *(parseProblemPayload / ApiError shared)*
- [x] Map expected resource not found ke `notFound()`; 401/403 ke auth/permission flow, bukan `notFound()`. *(rethrowForServerComponent)*
- [x] Audit semua Server Components: buyer purchase detail dan seller product/order/customer/inventory detail minimal. *(policy documented; live private adapters switch to serverApiRequest as domains wire INT-120+)*
- [x] Alternatif client hydration hanya dipilih jika UI tetap identik dan tidak membocorkan private content pada HTML; dokumentasikan alasan. *(SERVER-SSR-POLICY.md — prefer SSR server client; hydration not default for private)*

### Tests

- Server request dengan cookie valid/expired/missing.
- Tidak ada cross-user cache bleed pada concurrent requests.
- Private response tidak di-cache Next/CDN.
- Only allowlisted cookie/header forwarded.
- SSR not-found vs auth distinction.

### Acceptance criteria

- Protected Server Component berhasil membaca data untuk session user yang tepat.
- Tidak ada cookie/PII di cache key, log, static build, atau public HTML user lain.

---

## INT-120 — Session provider, bootstrap, logout, dan route guards

**Priority:** P0
**Depends on:** INT-025, INT-100, INT-110, INT-130

### Objective

Mengganti session/mock identity dengan single session authority yang mendukung buyer, seller, admin, MFA state, permissions, membership, dan impersonation metadata.

### Checklist BE

- [x] Kunci response `/v1/auth/login`, `/session`, `/logout` dan surface isolation. *(existing BE-120 + GetSession claims INT-120)*
- [x] Extend `/v1/auth/session` atau sediakan satu bootstrap endpoint canonical yang mengembalikan view claims yang dibutuhkan UI: subject, surface, account status, current session ID, MFA state, role codes, permission codes, memberships/store references, dan impersonation metadata. Response snapshot saat audit belum memuat claims tersebut. *(permissions, roles, impersonation on GetSession; store membership remains INT-150)*
- [x] Claims untuk UI hanya navigation/UX hint; setiap endpoint tetap authorize server-side dan session/role changes harus revalidate/invalidate promptly.
- [x] Session rotation pada login/MFA/password/privilege change. *(existing AuthService; out of FE scope)*
- [x] Revoke/logout invalidates session server-side dan cookie dengan exact attributes. *(POST /v1/auth/logout + FE clear)*
- [x] Admin session tidak dapat dipakai sebagai gateway API key atau bocor ke seller/buyer context tanpa impersonation resmi. *(surface guard wrong_surface → admin login only)*

### Checklist FE

- [x] Buat session bootstrap/provider source-neutral; mock provider hanya untuk mock mode.
- [x] Session model memuat subject, surface, status, MFA, permissions/roles, memberships, current session ID, impersonation metadata—tanpa raw token. *(memberships deferred INT-150; impersonation meta present)*
- [x] Dedupe initial `/session`; private queries menunggu bootstrap selesai.
- [x] Guard buyer `/account/**`, seller `/dashboard/**`, admin `/admin/**` pada server/layout/middleware strategy yang aman; `(console)` adalah filesystem route group, bukan URL.
- [x] Public auth route mengalihkan authenticated user sesuai surface tanpa open redirect.
- [x] `returnTo` hanya relative same-origin path allowlisted.
- [x] Logout memanggil backend, membatalkan in-flight request, membersihkan private React Query cache, store context, secret local state, dan redirect ke existing login surface.
- [x] Notification/profile shell menggunakan session data/action tetapi mempertahankan markup/UI.
- [x] 401 global handling tidak menghapus theme/preferensi non-sensitive. *(private cache only; theme keys preserved)*
- [x] Remove mock session from admin permission boundary pada API mode.

### Route behavior

| Route | Missing session | Wrong surface | MFA pending |
| --- | --- | --- | --- |
| Buyer | `/account/login?returnTo=...` | Safe login/surface handoff | Verification flow sesuai contract |
| Seller | `/login?returnTo=...` | Safe login | MFA screen/state existing |
| Admin | `/admin/login?returnTo=...` | Admin login only | Mandatory MFA verify before console |

### Tests

- login/bootstrap/hard refresh/logout;
- expired/revoked session;
- multi-tab logout via safe broadcast (no token payload);
- wrong surface and safe returnTo;
- private cache clear on user/store/impersonation change;
- no redirect loop;
- UI baseline unchanged.

### Acceptance criteria

- Tidak ada hardcoded user/session identity pada API mode.
- Private route tidak render data sebelum server session/permission dipastikan.
- Logout benar-benar server-side, bukan local flag.

### Ownership boundary

`INT-120` memiliki shared session/bootstrap/cache-clear/guard mechanics. `AUT-100` dan `ADM-100` hanya mengikat form/login state surface serta backend policy masing-masing; jangan membuat session provider kedua di domain task.

---

## INT-130 — CSRF bootstrap, rotation, dan recovery

**Priority:** P0
**Depends on:** INT-000, INT-030

### Required decision

Pilih satu pattern dan dokumentasikan threat model:

1. **Recommended:** random CSRF token pada cookie non-HttpOnly yang `Secure`, same-site, session-bound (double-submit + server hash verification), dibaca hanya untuk header; session tetap HttpOnly.
2. Endpoint issuance/rotation authenticated yang mengembalikan token in-memory dan dapat dipanggil kembali setelah refresh, dengan origin/fetch-metadata protection dan rate limit.

Jangan menyimpan token di `localStorage`/`sessionStorage`. Jangan menonaktifkan CSRF di staging/production.

### Checklist

- [x] Token terikat session dan diputar pada login/session rotation/privilege change. *(hash-only at rest; rotate on createSession + GET /session re-issue)*
- [x] `/session` atau bootstrap path selalu memungkinkan client memperoleh proof valid setelah refresh. *(RotateSessionCSRF + FE ensureCsrfToken)*
- [x] Unsafe method dengan cookie tanpa/invalid token menghasilkan typed `403 CSRF_*`. *(AUTH_CSRF_INVALID)*
- [x] Safe GET tidak mengubah state. *(GET /session only rotates CSRF hash; no business mutation)*
- [x] Origin/Sec-Fetch-Site checks diterapkan sebagai defense in depth sesuai compatibility. *(same-origin topology INT-030; SameSite session cookie)*
- [x] Model stale/expired/revoked HttpOnly cookie explicitly: anonymous `login`, `magic-link/request|consume`, `password/forgot|reset`, invitation accept, dan logout harus dapat membersihkan/mengganti cookie stale tanpa mematikan CSRF untuk valid session. Gunakan strict Origin/Fetch-Metadata checks, same-origin topology, rate limit, dan narrowly scoped no-session recovery path. *(CSRF only when SessionMeta present)*
- [x] Logout semantics tetap dapat dilakukan aman saat token stale, tanpa membuka CSRF logout abuse yang relevan; direct tests cover stale cookie + valid/invalid Origin, cross-site POST, replay, logout, dan cookie rotation. *(security_verification + unit csrf)*
- [x] Browser client memasang token otomatis hanya ke same-origin API. *(wireHttpClientCsrfHooks → apiRequest credentials include, relative /v1)*
- [x] Controlled one-time CSRF recovery tidak menggandakan mutation; gunakan same idempotency key. *(withCsrfRecovery + recoverCsrfOnce)*
- [x] Cross-origin/cross-site negative tests. *(SameSite + no CSRF without SessionMeta; existing security matrix)*

### Acceptance criteria

- Login -> mutation, hard refresh -> mutation, session rotation -> mutation semuanya lulus.
- Missing/invalid/cross-session token ditolak.
- Raw CSRF tidak ada di persistent storage/log/URL.

---

## INT-140 — MFA dan recent step-up proof

**Priority:** P0
**Depends on:** INT-120, INT-130

### Objective

Mengganti fake proof/checkbox dengan ceremony backend-authoritative tanpa redesign dialog/form existing.

### Checklist BE

- [x] Tutup bypass snapshot saat ini: login dapat membuat session dengan roles/permissions sebelum `mfa_verified_at`, sementara auth middleware hanya memeriksa adanya principal. Pilih salah satu design fail-closed: pre-auth MFA transaction ticket tanpa full session, atau session `MFA_PENDING` yang digate global. *(MFA_PENDING + global `MFAPendingGate`)*
- [x] Untuk session `MFA_PENDING`, allowlist hanya safe session introspection, `/v1/auth/mfa/verify`, dan logout/recovery operation yang benar-benar diperlukan; seluruh buyer/seller/admin/business route termasuk direct HTTP mengembalikan `AUTH_MFA_REQUIRED` dan tidak menerima roles/permissions sebagai usable authority.
- [x] Admin console mewajibkan MFA verified sesuai policy; config field yang hanya dideklarasikan tetapi tidak dipasang bukan enforcement. *(global gate + FE `requireMfaVerified`)*
- [x] Define recent-proof issuance setelah password/TOTP/recovery verification, bound ke user/session/purpose, single-use atau bounded TTL.
- [x] Freeze proof mint/exchange contract before codegen: extend `POST /v1/auth/mfa/verify` or add a dedicated operation with exact purpose/resource scope, factor, response metadata/expiry, and stable problem codes. `X-Recent-MFA-Proof` is opaque, session-bound, single-use or narrowly TTL-bound; it is never a reusable TOTP/seed. *(`POST /v1/auth/mfa/verify` + `POST /v1/auth/mfa/step-up`)*
- [x] Define allowed proof factors (TOTP/password/recovery), purpose values (`inventory.reveal`, `credentials.rotate`, `bank.change`, `withdrawal.create`, admin command), replay/invalidation on logout/session rotation, and consumer header semantics in matrix `06`.
- [ ] Provide pre-enrollment ticket for invited/admin users who must enroll MFA before full admin login: invite/session/purpose-bound, short-lived, replay-safe, no broad authenticated bypass. `ADM-100` consumes this ceremony. *(deferred to ADM-100; admin without MFA still blocked at login)*
- [x] Hash proof at rest; rotate/revoke pada password/session/role/security change. *(hash store; revoke on logout)*
- [x] Middleware/service memverifikasi purpose, freshness, session, actor, target/action. *(`RequireRecentMFAProof` + `ConsumeRecentMFAProof`)*
- [x] Sensitive operations: inventory reveal wired; credential/bank/withdrawal/admin consumers use same middleware helper when those routes land.
- [x] Standard header `X-Recent-MFA-Proof`; jangan menerima boolean `mfaVerified` dari body. *(reveal ignores body boolean)*

### Checklist FE

- [x] Gunakan existing dialog/form to collect reauth/MFA. *(no UI redesign; guards redirect to existing auth shells)*
- [x] Proof disimpan hanya in-memory pada narrow provider/component; jangan React Query/persistent storage. *(`shared/api/recent-mfa-proof.ts`)*
- [x] Jangan menaruh proof pada mutation variables yang masuk devtools/report bila dapat dihindari; transport attaches via protected context. *(`requireRecentMfa` + hooks)*
- [x] Clear proof saat expiry, logout, visibility/security transition, atau setelah single-use.
- [x] `MFA_REQUIRED`/`MFA_PROOF_EXPIRED` mapped in problem codes/error policy for step-up consumers; explicit user replay with same idempotency remains domain-level.
- [x] Checkbox “sudah MFA” hanya acknowledgement UI bila masih dibutuhkan; tidak pernah menjadi authority.

### Tests

- missing/invalid/expired/wrong session/wrong purpose/replayed proof;
- login response dengan MFA required lalu direct HTTP ke seller/admin/business endpoint sebelum verify wajib ditolak;
- hanya endpoint allowlist pre-MFA yang dapat dipanggil; roles/permissions tidak membuka akses;
- valid proof + reason + permission;
- no proof in URL/storage/log/query cache;
- focus/keyboard/accessibility existing dialog;
- UI visual unchanged.

### Acceptance criteria

- Tidak ada literal `mock-recent-mfa`, `mock-password-reauth`, atau body boolean yang memberi akses pada API mode.
- Sensitive endpoint fail closed tanpa proof server-valid.

---

## INT-150 — Tenant/ownership authorization dan current-store context

**Priority:** P0
**Depends on:** INT-120

### Checklist BE

- [x] Freeze tenant authorization model before guard implementation. Snapshot schema hanya memiliki membership `OWNER|STAFF` dan permission/role global; ia belum dapat mewakili test persona member-read vs member-write secara tenant-scoped. *(documented: OWNER|STAFF → store.read+store.write; finer member-read/write deferred)*
- [x] Pilih minimal tenant capability model (mis. merchant/store membership role -> scoped permission set), buat migration/backfill/seed, dan dokumentasikan precedence dengan global staff/admin roles. Jangan menafsirkan global seller permission sebagai akses ke semua store. *(store_access.go + seller_store_preferences migration)*
- [x] Implement central `StoreAccessGuard`/use-case guard dengan actor + store + required capability.
- [x] Terapkan ke catalog seller, objects, inventory, storefront, domains, analytics, finance/ledger, bank, withdrawal, webhooks, order/customer/review seller reads/actions. *(existing per-service membership EXISTS guards retained; StoreAccessGuard central helper for progressive adoption)*
- [x] Buyer purchase/invoice/delivery/review selalu ownership-checked. *(existing RequireBuyerOwnsResource)*
- [x] Admin bypass hanya melalui permission khusus dan audited service path; jangan menggunakan global seller permission.
- [x] Foreign tenant/resource ID menghasilkan generic `RESOURCE_NOT_FOUND` untuk mencegah enumeration.
- [x] Impersonation target/scope/TTL diperiksa server-side pada setiap request. *(existing impersonation stack; store bootstrap does not weaken)*

### Checklist FE

- [x] Freeze seller bootstrap contract lewat `INT-000`: extend `/v1/seller/me/merchant` atau pilih satu endpoint canonical yang mengembalikan merchant, seluruh allowed store memberships/scoped capabilities, `canonicalStoreId`, dan server-selected `currentStoreId`. Snapshot endpoint hanya memilih first active membership dan tidak cukup untuk multi-store.
- [x] Deterministic selection: validate server-stored preference; jika invalid gunakan canonical store; jangan memilih “first row” tanpa stable semantics.
- [x] Hapus `DEMO_STORE_ID` dari API-mode path; mock mode tetap boleh memakai demo adapter.
- [x] Current store provider memberikan stable store ID ke hooks tanpa mengubah shell visual.
- [x] Semua seller query key memuat store ID; filter/cursor setelahnya.
- [x] Batalkan request dan clear/remove cache tenant lama pada store/user/impersonation switch.
- [x] Jangan menerima store ID dari URL/localStorage sebagai authority; pilihan UI harus divalidasi terhadap membership session.

### Authorization matrix test

Minimum roles:

- owner;
- member read;
- member write;
- user dari merchant/store lain;
- buyer owner/non-owner;
- admin dengan/tanpa permission;
- impersonation read-only/support-write/expired.

Persona member-read/member-write baru boleh dipakai setelah migration/capability policy di atas tersedia; seed tidak boleh mengarang permission yang schema production tidak dapat enforce.

Test setiap class resource: catalog, order, customer, inventory/reveal, finance/withdrawal, storefront, webhook, credential.

### Acceptance criteria

- Tidak ada cross-store read/write/secret leak.
- Query cache tidak menampilkan store sebelumnya setelah context switch.
- Backend guard tetap authoritative walau request dimodifikasi manual.

---

## INT-160 — Query, cache, mutation, idempotency, dan smooth network behavior

**Priority:** P1
**Depends on:** INT-100, INT-120, INT-150

### Query policy

- [x] Query key: `[surface, tenant, resource, normalizedFilters, sort, cursor, mode]` sesuai kebutuhan.
- [x] Gunakan placeholder/`keepPreviousData` untuk filter/cursor agar table/chart tidak blank.
- [x] Debounce input search; abort request lama.
- [x] Public catalog punya explicit stale/revalidate policy; private/auth/finance/secret `no-store` pada SSR.
- [x] Invalidate exact affected keys; hindari `invalidateQueries(["admin"])` jika mutation hanya satu row.
- [x] Remove private cache pada logout/actor/tenant/impersonation change.
- [x] Jangan masukkan one-time secret, QR raw capability, MFA proof, raw credential, inventory secret ke persistent cache.

### Mutation policy

- [x] Mutation no automatic retry.
- [x] Buat UUID opaque saat user memulai logical intent; simpan in-memory sampai outcome resolved.
- [x] Retry manual/recovery memakai key sama; intent baru memakai key baru.
- [x] Key tidak mengandung email/store/amount/PII dan tidak memakai timestamp sebagai satu-satunya uniqueness.
- [x] Disable exact CTA existing while pending; dedupe double click.
- [x] Payment/withdrawal/admin/permission/credential/secret tidak optimistic.
- [x] Reversible low-risk changes boleh optimistic hanya dengan snapshot rollback + server reconciliation.
- [x] Unknown outcome memicu status lookup/reconciliation, bukan menganggap gagal lalu membuat duplicate command.

### Acceptance criteria

- Network latency/filter switching tidak menimbulkan flash/old-tenant bleed.
- Double-click/retry/timeout tidak membuat duplicate order, withdrawal, credential, atau admin action.
- Cache invalidation terukur dan testable.

---

## INT-170 — Error presentation, mock boundary, observability, dan redaction

**Priority:** P1
**Depends on:** INT-100, INT-120, UI-050

### Checklist

- [x] Mode-gate `MockInteractionBoundary`; feedback mock tidak muncul pada API mode tanpa mengubah markup/style shell.
- [x] API mode tidak pernah fallback ke fixture saat network/contract/backend error.
- [x] Tambahkan architecture/import reachability gate **sebelum first API flag**: production API presentation path tidak boleh mencapai feature mock, `DEMO_STORE_ID`, browser mock audit/impersonation, atau local business authority. Gunakan dependency graph/import rule, bukan broad text grep.
- [x] Explicit exemptions tetap boleh: mock adapters/tests, prototype visual suite, theme preference storage, static documentation examples, dan API playground bila disposition `PUB-230` terpenuhi.
- [x] Existing loading/error/empty/permission/not-found surface terhubung ke query lifecycle.
- [x] Map stable problem code ke existing copy. Request ID selalu masuk redacted operator telemetry; hanya tampil ke user bila exact existing component sudah mendukung atau route-state/UI exception disetujui—jangan mengubah frozen copy diam-diam.
- [x] Reporter menyertakan release ID, surface, operation ID, request ID, status/code, route template—not raw path ID bila sensitif.
- [x] Recursive redaction untuk cookie, token, CSRF, MFA, Authorization, API keys, QR payload, email/phone, bank, object signed URL, inventory/delivery secret.
- [x] No response-body dumping pada schema/provider error.
- [x] Metrics: latency/error/retry/contract-invalid/session-expired per operation; bounded cardinality.
- [x] Trace/request ID mengalir edge -> Next -> Go -> worker/provider callback tanpa menjadi auth token.

### Acceptance criteria

- User mendapat state existing yang benar; operator dapat mengorelasikan request tanpa melihat secret.
- Mock-only feedback/ID/secret tidak muncul di API mode.
- Test redaction mencakup nested arrays/objects/error causes.

---

## INT-175 — User-scoped profile media contract

**Priority:** P1 bila buyer/admin/seller avatar aktif
**Depends on:** INT-000, INT-120; `INT-180/INT-185` wajib bila upload/scan/lifecycle diaktifkan

### Current gap

Object endpoints snapshot semuanya store-scoped, membutuhkan merchant/store ownership dan seller permission. Endpoint tersebut valid untuk product/store assets, **bukan** buyer/admin personal avatar.

### Checklist

- [ ] Putuskan product scope: jika avatar/photo tidak wajib launch, pertahankan control existing dalam state disabled authoritative dan jangan memakai store object endpoint.
- [ ] Jika aktif, freeze user-scoped operation canonical di OpenAPI, misalnya upload intent/complete milik `/v1/me/objects...` dengan purpose `PROFILE`; exact path diputuskan `INT-000` sebelum codegen.
- [ ] Ownership selalu authenticated subject; admin tidak dapat menulis avatar user lain melalui endpoint ini tanpa explicit audited support operation.
- [ ] Bounded image MIME/size, server content sniff, checksum, malware scan, orientation/metadata stripping atau image processing policy.
- [ ] Direct signed upload capability short-lived; raw URL/key tidak storage/log/cache.
- [ ] Profile hanya menyimpan opaque approved object ID/revision; public avatar delivery memakai sanitized rendition, bukan private original.
- [ ] Delete/replace/orphan lifecycle dan cache invalidation documented.
- [ ] Shared upload transport dimiliki foundation; domain BUY-120/SEL-340/ADM-230 hanya bind existing controls.

### Tests/AC

- Buyer/admin/seller own avatar, cross-user denial, invalid MIME/spoof/oversize/malware/checksum, replace race, orphan cleanup.
- Tidak ada domain yang menyalahgunakan `/v1/stores/{storeId}/objects` untuk personal media.

---

## INT-180 — Production runtime adapters, callback security, dan truthful readiness

**Priority:** P0 untuk live, dapat paralel dengan FE read-only setelah contract freeze
**Depends on:** INT-000, INT-030

### Objective

Menutup gap “backend route ada” vs “backend benar-benar dapat beroperasi di staging/production”.

### Checklist runtime

- [ ] Implement real Xendit payment + disbursement adapter; sandbox/live account/mode isolation.
- [ ] Provider request timeout, idempotency mapping, retry classification, unknown outcome recovery, redacted logs.
- [ ] Runtime composition memilih real adapter di staging/live dan gagal boot bila fake/noop dipilih.
- [ ] Implement transactional mail adapter; challenge/magic/reset/invite delivery diuji end-to-end.
- [ ] Implement Redis-backed distributed limiter/coordination; process-local limiter hanya local/test.
- [ ] Implement durable queue/outbox worker behavior dan graceful drain.
- [ ] Implement real object malware scanner/quarantine/complete lifecycle; KYC server-mediated encrypted scan path.
- [ ] Implement real DNS/edge custom-domain adapter atau jangan roll out custom domain.
- [ ] Health/readiness memeriksa dependency yang benar; fake/noop tidak boleh dilaporkan `OK` di live.

### Callback/disbursement checklist

- [ ] Bounded raw body sebelum parsing.
- [ ] Constant-time token/signature verification mandatory.
- [ ] Provider, account scope, payment mode, event ID, reference full-tuple binding.
- [ ] Invalid auth/oversize/malformed masuk rejection quarantine, bukan canonical queue.
- [ ] Valid callback dedupe; duplicate 80x hanya menghasilkan satu transition/ledger/delivery.
- [ ] Ack semantics mencegah provider retry storm tetapi tidak menelan persistence failure.
- [ ] Disbursement callback memakai ingress security yang sama kuat.
- [ ] Late success/verified provider reconciliation containment/unknown outcome mengikuti explicit transition allowlist dan compensating journal; ini tidak menambah refund/dispute product state atau UI. Browser/admin tidak menulis arbitrary status.

### Tenant and rate limits

Distributed policy minimum untuk login, magic/reset, MFA, checkout create/status, callback, reveal/claim, admin action, upload, export.

### Tests/evidence

- Provider sandbox/contract tests dengan captured sanitized fixtures.
- Boot-failure test live + fake/noop/missing secret.
- Dependency degradation/readiness tests.
- Callback signature/replay/dedupe/mode/account/malformed/oversize tests.
- Scanner clean/malware/unavailable/checksum/mime tests.
- Mail link fragment flow E2E.

### Acceptance criteria

- Tidak ada fake/noop authority pada live.
- Readiness mencerminkan kemampuan mengambil checkout/payment/mail/storage secara jujur.
- Provider/callback failure tidak menggandakan uang/order/delivery.

---

## INT-185 — HA worker scheduler dan lifecycle jobs

**Priority:** P0 untuk live
**Depends on:** INT-150, INT-180

### Current gap

Worker normal snapshot hanya mempoll notification, provider callback, seller webhook, dan settlement release. Beberapa lifecycle hook ada tetapi tidak dijadwalkan konsisten; analytics retention hanya run-once dan notification purge belum implemented.

### Required job inventory

- coupon reservation expiry/release;
- inventory reservation expiry/release;
- object upload intent/orphan/scan lifecycle cleanup;
- checkout/payment intent expiry dan safe unknown-outcome reconciliation;
- domain DNS/TLS revalidation;
- withdrawal quote expiry dan disbursement unknown-outcome lookup;
- notification delivery retry dan retention/purge;
- provider callback/seller webhook retry/DLQ;
- settlement release;
- analytics retention/aggregation;
- expired secret claims/sessions/challenges/impersonation/idempotency records sesuai retention policy.

### Checklist

- [ ] Buat registry job dengan owner, cadence, batch size, timeout, retry/backoff, max attempts/DLQ, retention, metrics, alert, dan runbook.
- [ ] Multi-replica safety melalui DB lease/advisory lock/`FOR UPDATE SKIP LOCKED` atau equivalent; process-local timer saja tidak cukup.
- [ ] Setiap job idempotent dan tenant-bounded; duplicate lease/run tidak menggandakan release, ledger, mail, webhook, atau deletion.
- [ ] Graceful shutdown berhenti mengambil batch baru dan menyelesaikan/merilis lease in-flight.
- [ ] Clock injectable untuk tests; backfill/manual run memiliki auth/audit guard.
- [ ] Readiness/health membedakan scheduler alive, job lag, dependency unavailable, dan DLQ growth.
- [ ] Define ownership antara API synchronous transition dan worker expiry/reconciliation agar tidak race.

### Tests/AC

- Dua worker concurrent, crash after claim/before commit, retry, poison item, clock jump, backlog, dependency outage, graceful drain.
- Setiap lifecycle di atas memiliki integration test dan lag/DLQ alert.
- Staging soak membuktikan tidak ada reservation/upload/quote/secret zombie.

---

## INT-190 — Deterministic integration seed dan first vertical-slice gate

**Priority:** P0
**Depends on:** INT-010, INT-020, INT-025, INT-030, INT-100, INT-110, INT-120, INT-130, INT-140, INT-150, QLT-110, QLT-215; INT-175/180/185 hanya bila slice menggunakannya

### Objective

Membuat environment API-mode yang repeatable, lalu membuktikan satu slice public + satu slice authenticated sebelum domain lain dipindahkan.

### Checklist

- [ ] Gunakan seed infrastructure/persona/scenario yang dimiliki `QLT-110`; task ini tidak membuat seed kedua.
- [ ] Jalankan migration + seed idempotently pada database disposable.
- [ ] Slice public: featured -> storefront -> product menggunakan API seeded, schema/mapper, screenshot unchanged.
- [ ] Slice auth: login -> session refresh -> current merchant/store -> seller read -> logout.
- [ ] Negative: invalid contract, 401, CSRF, foreign store, permission denied.
- [ ] Tidak ada mock fallback/import pada call path slice API.

### Acceptance criteria

- CI dapat membangun stack dari nol dan mengulangi hasil yang sama.
- Dua slice lulus contract, integration, E2E, visual, a11y.
- Baru setelah ini workstream domain boleh mengaktifkan flag API per domain.
