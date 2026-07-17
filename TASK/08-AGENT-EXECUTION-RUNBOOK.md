# Agent Execution Runbook

Dokumen ini adalah instruksi operasional untuk agent yang mengambil task integrasi. Baca `README.md`, UI freeze, current audit, lalu task domain terkait sebelum edit.

## 1. Cara mengambil task

1. Buka `09-EXECUTION-STATUS.md`; pilih satu task ID atau quality capability instance yang seluruh hard dependency dan entry gate-nya sudah `[x]` dengan evidence. Untuk `QLT-105/200/210/220/230/300/310/320/400/410`, claim cell capability, bukan parent row global.
2. Pastikan kolom owner kosong dan tidak ada agent lain yang mengerjakan shared file/domain yang sama. Shared foundation/generated file hanya boleh memiliki satu owner aktif.
3. Klaim row secara atomic: ubah status menjadi `[~]`, isi actor/branch, timestamp Asia/Jakarta, intended files, dan link execution note. Jangan mulai edit sebelum claim terlihat oleh agent lain.
4. Audit ulang source code aktual. Snapshot folder `TASK/` membantu, tetapi line/path bisa berubah.
5. Tulis mini execution note pada `TASK/evidence/<TASK-ID>/<YYYYMMDD-HHmm>-<actor-slug>.md` (atau immutable PR/CI URL yang diindeks di sana): endpoint/contract, files, migration, risks, tests, rollout.
6. Kerjakan vertical slice terkecil yang dapat diuji provider + consumer + E2E.
7. Jangan mengambil task dependent hanya untuk membuat test happy. Catat blocker konkret pada row dan jangan mengubah dependency menjadi selesai tanpa evidence.
8. Saat handoff, update row yang sama: `[x]` hanya setelah acceptance lulus; `[!]` harus menyebut blocker owner. Lepaskan owner bila claim dibatalkan.

## 2. File yang wajib dibaca sebelum domain task

```text
TASK/README.md
TASK/00-UI-FREEZE-CONTRACT.md
TASK/01-CURRENT-STATE-GAP-AUDIT.md
TASK/02-FOUNDATION-TRANSPORT-AUTH.md
TASK/06-ENDPOINT-CONTRACT-MATRIX.md
TASK/07-TESTING-ROLLOUT-DOD.md
TASK/09-EXECUTION-STATUS.md
TASK/10-ROUTE-AND-CONTROL-DISPOSITION.md
ARCHITECTURE.md
docs/BACKEND_HANDOFF.md
shared/api/contracts.ts
shared/api/schemas.ts
shared/api/http-client.ts
shared/query/**
backend/internal/adapters/http/router.go
backend/api/openapi.yaml
```

Lalu baca seluruh feature API/hook/contract/screen terkait serta backend handler/service/domain/store/query/migration/test terkait. Jangan hanya membaca interface atau README.

## 3. Audit pre-edit

### Repository safety

- [ ] `git status --short` dicatat; perubahan existing milik user tidak dihapus/ditimpa.
- [ ] Commit dasar dicatat.
- [ ] Tidak menggunakan reset/checkout destructive.
- [ ] Scope file visual-risk diidentifikasi.
- [ ] Baseline test yang relevan dijalankan atau kegagalan awal dicatat.

### Contract discovery

- [ ] Route benar-benar terpasang pada router untuk dependency runtime yang digunakan.
- [ ] OpenAPI valid/current; jika belum, selesaikan/block pada `INT-000`.
- [ ] Handler request strict body/query/header/status dipahami.
- [ ] Service authority/tenant/transition/idempotency diperiksa, bukan diasumsikan dari middleware.
- [ ] Response envelope/pagination/problem aktual dicatat.
- [ ] Existing frontend view model dan semua consuming components dipahami.
- [ ] Mock fixture dipakai sebagai presentation characterization, bukan backend truth.

### Security discovery

- [ ] Actor/surface/permission/tenant/ownership/capability ditentukan.
- [ ] CSRF/MFA/reason/idempotency/version requirements ditentukan.
- [ ] Secret/PII/money/state authority dan cache/log policy ditentukan.
- [ ] Negative/concurrency/unknown outcome cases didaftarkan.

## 4. Slicing perubahan yang direkomendasikan

Satu task besar dibagi menjadi reviewable slices berikut—setiap slice tetap harus build/test:

1. Contract/OpenAPI + provider tests.
2. Backend tenant/security/state fix + service/integration tests.
3. Generated DTO/schema + request/response mapper + unit consumer tests.
4. Feature API/hook/query key/mutation + tests.
5. Presentation event/data binding minimal; no visual diff.
6. API-mode E2E/visual/a11y/negative tests.
7. Observability/config/rollout/runbook.

Jangan mencampur redesign, dependency upgrade massal, refactor unrelated, atau format seluruh repository dalam slice wiring.

## 5. Pola file frontend

Struktur yang dianjurkan per domain:

```text
features/<domain>/
  contracts.ts        # stable existing view/domain model
  transport.ts        # aliases/generated DTO imports if needed
  schemas.ts          # operation-specific runtime schemas
  mappers.ts          # transport -> view model
  api.ts              # exact endpoint/request DTO, mock/API branch
  hooks.ts            # query keys, query/mutation lifecycle
  mock.ts              # prototype adapter only
  screens/**           # existing presentation; minimal binding only
```

Tidak perlu membuat semua file jika domain kecil; boundary harus tetap jelas.

### API adapter pseudocode

```ts
type ResourceDependencies = {
  source: "mock" | "api" | "disabled";
  api: ResourceApiPort;
  mock: ResourceApiPort;
};

export async function getResource(
  input: ResourceInput,
  signal: AbortSignal,
  dependencies: ResourceDependencies,
): Promise<ResourceView | null> {
  if (dependencies.source === "disabled") {
    throw new DomainUnavailableError("RESOURCE_DISABLED");
  }
  if (dependencies.source === "mock") {
    return dependencies.mock.getResource(input, signal);
  }

  try {
    const envelope = await dependencies.api.request(pathFor(input), {
      signal,
      schema: resourceEnvelopeSchema,
    });
    return mapResourceDto(envelope.data);
  } catch (error) {
    if (isExpectedResourceNotFound(error)) return null;
    throw error;
  }
}
```

Rules:

- URL hanya di feature API.
- Source berasal dari typed per-domain registry `INT-025`; jangan membuat global `isLiveApi()` atau membaca environment ad hoc di screen/hook.
- Production boot menolak source `mock`; source `disabled` memakai state existing yang ditetapkan pada route matrix dan tidak pernah memanggil fixture.
- Schema selalu dipakai di live.
- Catch hanya error yang benar-benar dinormalisasi; jangan `catch { return mock }`.
- Never return raw secret through generic cached adapter.
- Request body exact DTO, bukan `{...formState}` atau entire input view.

### Mapper rules

- Pure, deterministic, exhaustive.
- Tidak mengambil time/random/global store.
- Tidak memformat transactional amount melalui float.
- Tidak mengarang status/label risk/payment/KYC.
- Menggunakan formatter/status mapping existing.
- Melempar typed contract error untuk required data invalid.
- Unit test raw DTO -> exact view object.

### Query rules

- Tenant/actor/filter/sort/cursor/mode pada query key.
- `enabled` menunggu session/current-store.
- Abort signal selalu diteruskan.
- Keep previous data untuk paging/filter.
- Exact invalidation.
- Secret response tidak di-query-cache.

### Mutation rules

- No automatic retry.
- UUID per logical intent; same key across retry.
- Exact pending button; double submit prevented.
- Financial/privileged/secret mutations not optimistic.
- Unknown outcome resolves via read/status before new command.
- Success only after authoritative response.

## 6. Pola backend

```text
HTTP handler
  decode strict DTO + headers/query
  require auth/permission
  call application use case with actor/context

Application use case
  tenant/ownership/capability guard
  validate state/transition/MFA/idempotency/version
  transaction: domain change + audit/outbox/idempotency
  call provider through port with timeout/recovery

Presenter
  safe DTO/envelope/problem
```

### Backend checklist

- Handler tidak memiliki business rule besar.
- Service menerima actor; `storeId` dari path tidak dipercaya sendiri.
- Foreign tenant -> safe not-found when appropriate.
- DB constraints defend invariants/concurrency.
- Provider DTO/SDK tidak bocor ke domain/presenter.
- No client boolean for auth/MFA/paid/permission.
- Strict transition allowlist; unspecified edge rejected.
- Same idempotency key/body replay exact result; changed body conflict.
- Audit/raw log never stores secret.
- Private/secret response `no-store`.
- Errors map stable code/status/details/request ID.

## 7. Aturan UI selama implementasi

Sebelum mengubah `.tsx`, tanyakan:

1. Bisakah kebutuhan selesai di API/hook/mapper/provider?
2. Bisakah state diberikan melalui props/event handler existing?
3. Apakah loading/error/dialog/status component existing sudah tersedia?

Jika ya, jangan mengubah structure/style. Bila `.tsx` perlu berubah:

- pertahankan JSX hierarchy dan class strings;
- ubah data source/event/pending binding seminimal mungkin;
- reuse import component existing, jangan clone;
- jalankan visual test segera setelah slice;
- jangan update snapshot.

## 8. Test loop per task

Urutan cepat lalu lengkap:

```text
1. Targeted FE unit/contract tests
2. Targeted Go unit/service/handler tests
3. Targeted Go integration test (DB if relevant)
4. Typecheck/lint affected project
5. Targeted mock + API Playwright route/flow
6. Visual/a11y affected route desktop/mobile
7. Full project verification before handoff
```

Command canonical repository dari root frontend:

```bash
npm run format:check
npm run lint -- --max-warnings=0
npm run typecheck
npm run test:run
npm run test:coverage
npm run build
npm run check:bundle
npm run test:e2e:smoke
npm run test:e2e -- tests/e2e/critical-flows.spec.ts
npm run test:e2e:a11y
npm run test:e2e:visual
```

Command canonical dari working directory `backend/`:

```bash
make check-fmt
make vet
make test
go test -race ./...
make test-integration
make check-generated
make build
```

Daftar di atas adalah full handoff gate. Saat loop cepat, jalankan subset targeted lebih dahulu lalu full gate sesuai risiko. Jalankan melalui working directory yang benar; jangan copy `cd` berulang ke CI jika workflow mendukung `working-directory`. Gunakan versi Go exact dari `backend/go.mod`; contract/codegen commands harus ditambahkan oleh `INT-000/010` dan menjadi gate.

## 9. Evidence format untuk handoff

Gunakan format berikut:

```md
### <TASK-ID> — <title>

- Status: complete | blocked
- Base/head commit:
- Files changed:
- Contract operations:
- Migration/config changes:
- UI impact: none; visual files touched: ...
- Security decisions:
- Tests run + exact result:
- Visual/a11y evidence:
- Observability added:
- Rollout flag/order:
- Rollback:
- Known follow-ups (not hidden):
```

Untuk setiap acceptance criterion, tautkan test/path/evidence. “Tested” tanpa command/result bukan evidence. Jangan menimpa evidence lama; buat note baru saat handoff/retry.

## 10. Blocker protocol

Task dapat `[!]` hanya jika agent sudah:

- memverifikasi route/contract/code aktual;
- mencoba safe in-scope alternative;
- mengidentifikasi exact missing authority/decision/dependency;
- menjelaskan mengapa asumsi dapat mengubah produk/security/data;
- menentukan owner dan pertanyaan paling kecil yang perlu dijawab.

Contoh blocker valid:

- UI aktif campaign tetapi product owner belum menentukan apakah backend campaign termasuk launch scope; implement vs live-disable memberi outcome berbeda.
- CSRF topology decision berubah ke cross-site dan membutuhkan security/infra approval.
- Existing UI tidak memiliki mandatory step-up surface dan security tidak boleh dilewati; perlu UI exception approval.

Contoh yang bukan blocker: test lambat, code besar, perlu membaca lebih banyak file, atau satu implementation approach gagal.

## 11. Conflict/drift handling

Jika implementation menemukan task doc tidak cocok dengan kode:

1. Jangan memaksa kode mengikuti asumsi salah.
2. Beri bukti route/handler/schema/test aktual.
3. Tentukan apakah bug kode, stale OpenAPI, atau stale task matrix.
4. Perbaiki source of truth dan tests dalam scope yang tepat.
5. Update row/doc terkait bersama perubahan agar agent berikutnya tidak mengulang audit.

Perubahan contract breaking memerlukan provider + consumer review dan migration/version strategy. Jangan melakukan silent DTO rename.

## 12. Review checklist sebelum `[x]`

### Scope/UI

- [ ] Hanya scope task; unrelated user changes preserved.
- [ ] No redesign/duplicate component/new UI kit/snapshot update.
- [ ] Visual-risk diff dijelaskan dan pixel-equivalent.

### Contract/code

- [ ] OpenAPI/router/handler/DTO/schema/mapper align.
- [ ] No `any`/cast-only response path.
- [ ] No mock/demo/local authority reachable in API path.
- [ ] 404/error/pagination/strict body behavior exact.

### Security/data

- [ ] Auth/CSRF/MFA/tenant/permission/idempotency/version applied.
- [ ] Secret/PII/money/state authority policy tested.
- [ ] Negative/concurrency/unknown outcome tested.
- [ ] Logs/cache/storage/URL/telemetry redacted.

### Quality/ops

- [ ] Unit/contract/integration/E2E/visual/a11y proportional tests pass.
- [ ] Config/migration/rollout/rollback/observability documented.
- [ ] No fake/noop dependency in claimed live path.
- [ ] Acceptance evidence attached.

## 13. Suggested ownership lanes

Parallel work setelah foundation contract freeze:

| Lane | Scope | Shared hotspots yang perlu koordinasi |
| --- | --- | --- |
| Foundation | `shared/api`, session, env/proxy, OpenAPI/codegen | Semua domain; merge first |
| Public/buyer | public, checkout, order, invoice, buyer | auth/session, catalog mapper |
| Seller | current store, catalog/inventory/order/customer/review/finance | shared seller shell/query keys |
| Admin | auth/RBAC/read/mutations/ops/audit | session/MFA, admin contracts |
| Backend runtime | providers, queue, scanner, callback, readiness | checkout/withdrawal/webhooks |
| QA/release | CI, seed, cross-stack, visual/security/rollout | environment/config/tests |

Jangan dua lane mengedit generated files atau shared contract manually bersamaan; codegen owner regenerates after merged spec.

Ownership canonical, claim aktif, dependency, dan collision rule berada di `09-EXECUTION-STATUS.md`. Tabel lane ini hanya panduan pembagian; jika berbeda, registry status yang sudah diklaim lebih dahulu berlaku sampai handoff atau pelepasan eksplisit.

## 14. Final instruction to every agent

Tujuan bukan membuat tombol terlihat “berfungsi”. Tujuan adalah membuat existing UI merepresentasikan state backend yang aman, authoritative, recoverable, testable, dan operationally ready. Bila backend belum mendukungnya, implement dependency atau tandai domain belum dapat diaktifkan—jangan menutup gap dengan mock success.
