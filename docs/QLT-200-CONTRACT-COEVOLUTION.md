# QLT-200 — Unit, mapper, provider/consumer contract (continuous co-evolution)

**Authority:** `TASK/07-TESTING-ROLLOUT-DOD.md` §QLT-200 · `TASK/09-EXECUTION-STATUS.md` §3.6–3.7

## Parent vs capability cells

| Level | Meaning when `[x]` |
| --- | --- |
| **Parent `QLT-200`** | Reusable harness, honest Vitest coverage denominator, sample foundation provider/consumer tests, co-evolution rule. **Not** full domain matrix. |
| **Capability cell** (`09` §3.7 column `QLT-200 contract`) | Domain-specific adapter/mapper/provider/consumer depth for that capability before canary. |

Parent must never wait on descendant cells. Domain tasks co-evolve contract tests as they ship endpoints.

## Continuous co-evolution rule (domain tasks)

When a domain task adds or changes a live API surface, **in the same slice**:

1. **OpenAPI** — operation + schemas (via INT-000/010 owner if shared hotspot).
2. **Runtime Zod** — `shared/api/schemas.ts` (or feature schema module) for the response envelope.
3. **Pure mapper** — `features/<domain>/mappers.ts` DTO → existing view model; fail closed `INVALID_API_CONTRACT`.
4. **FE consumer contract** — extend `tests/contract/` (or domain unit tests using the harness) for:
 - valid response → exact view model;
 - empty list/cursor;
 - malformed envelope / invalid schema → `INVALID_API_CONTRACT`;
 - problem code/details/requestId preserved;
 - unknown enum fail-safe;
 - money/timestamp boundaries;
 - request body has no view-only fields.
5. **BE provider contract** — presenter/handler DTO validates against OpenAPI required shape (extend `backend/test/contract/` sample pattern).
6. **Generated types** — `npm run api:check` dirty-diff (not line coverage).
7. **Coverage** — live `api.ts` / `mappers.ts` / policies already in Vitest include; do not shrink denominator to fake green.
8. **Mark capability cell** in `09` §3.7 when domain contract depth is proven — leave parent alone.

## Harness locations

| Role | Path |
| --- | --- |
| Vitest coverage config | `vitest.config.ts` |
| FE consumer helpers | `tests/contract/helpers/consumer.ts` |
| FE foundation sample | `tests/contract/qlt-200-consumer-foundation.test.ts` |
| FE fixtures | `tests/contract/fixtures/` |
| BE provider sample | `backend/test/contract/provider_presenter_test.go` |
| BE provider fixture out | `backend/test/fixtures/contract/` |
| OpenAPI drift / router | `backend/test/contract/openapi_contract_test.go` + `npm run api:check` |

## Coverage policy (honest denominator)

**Include:** live adapters (`features/**/api.ts`, `mappers.ts`, `*policy*`), `shared/api/**` (except generated), domain-source, query policies, auth/session pure helpers, notifications mappers.

**Exclude (written reasons):**

- `shared/api/generated/**` — drift via `api:check` + OpenAPI contract tests.
- mock/demo fixtures — not production authority.
- presentation `.tsx` — QLT-230 visual/a11y.
- type-only barrels (`index.ts`, `contracts.ts`) — no runtime to cover.

Thresholds are set against the **expanded** include set. Raising them is a domain/capability concern as cells land more tests — never shrink `include` to make thresholds pass.

## Acceptance (parent)

- Backend field rename/removal of CatalogProduct required keys breaks provider contract CI.
- Malformed FE fixture fails consumer schema/mapper before runtime cast.
- Coverage report does not claim 85%+ over only two files.
- Domain matrix cells remain separate work.
