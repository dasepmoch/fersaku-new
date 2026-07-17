# INT-010 — Transport DTO → view model mapper pattern

Authority: `TASK/00-UI-FREEZE-CONTRACT.md` §UI-040 · `TASK/evidence/UI-040/dto-view-parity.md` · `TASK/02-FOUNDATION-TRANSPORT-AUTH.md` §INT-010

## Layering

```text
generated OpenAPI types          shared/api/generated/openapi.ts
  → runtime Zod schemas          shared/api/schemas.ts
  → feature mapper (pure)        features/<domain>/mappers.ts
  → existing view model          features/<domain>/contracts.ts
  → existing screens (unchanged)
```

| Layer | Location | Must not |
| --- | --- | --- |
| Generated types | `shared/api/generated/**` | Hand-edit; import into JSX |
| Runtime schema | `shared/api/schemas.ts` + feature schemas | Coerce unknown → success |
| Transport aliases | `features/<domain>/transport.ts` | Re-export view models |
| Mapper | `features/<domain>/mappers.ts` | Import React/components |
| View model | `features/<domain>/contracts.ts` | Know HTTP status codes |
| Screen | `features/**/screens`, `app/**` | Import DTO / generated types |

## Rules

1. Live `apiRequest` must pass a Zod `schema`; fail closed as `INVALID_API_CONTRACT`.
2. Mappers are pure and deterministic; no `Date.now`, random, or global stores.
3. Enums are exhaustive; unknown authoritative state → `invalidApiContract()` (`shared/api/mappers.ts`).
4. Money stays integer IDR (`moneyIdrSchema`); no float transactional math.
5. Timestamps stay RFC3339 strings until existing formatters format them for display.
6. Secrets use dedicated paths; never put claim tokens into generic query cache models.
7. Mock adapters already return view models; API path must map to the **same** view shape.

## Example (catalog — implemented)

```ts
// features/catalog/mappers.ts
import type { CatalogProductDto } from "@/shared/api/schemas";
import { mapCatalogProductDto } from "@/features/catalog/mappers";
import type { CatalogProduct } from "@/features/catalog/contracts";

const view: CatalogProduct = mapCatalogProductDto(dto);
// screens keep using CatalogProduct — no JSX change
```

```ts
// Future live adapter (domain task; not required for INT-010 wiring of screens)
const envelope = await apiRequest("/v1/public/products/featured", {
  schema: catalogProductListEnvelopeSchema,
  signal,
});
return mapCatalogProductListDto(envelope.data);
```

## Codegen

```bash
npm run api:generate   # openapi-typescript → shared/api/generated/openapi.ts
npm run api:check      # fails if generated types are dirty
npm run api:lint       # Redocly (INT-000)
```

Generated files start with `Do not make direct changes`. Change the OpenAPI spec, then regenerate.
