# UI-040 — DTO-to-view parity rule

**Authority:** `TASK/00-UI-FREEZE-CONTRACT.md` §UI-040  
**Architecture:** `TASK/README.md` §7

## 1. Layering (mandatory)

```text
Backend transport DTO (wire truth)
  -> runtime schema validation (Zod / generated)
  -> explicit pure mapper
  -> existing frontend view model (features/**/contracts.ts)
  -> existing component props / JSX
```

| Layer | Owns | Must not |
| --- | --- | --- |
| Transport DTO | Wire field names, enums, envelopes | Leak into screens |
| Schema | Fail-closed parse | Coerce unknown → success |
| Mapper | Enum/label/money/time normalization | Invent KYC/paid/risk; mock fallback |
| View model | Stable shapes in `contracts.ts` | Know HTTP status codes |
| Component | Existing visual props only | Branch on data source |

## 2. Mapper obligations

1. Normalize backend enums to **existing** UI labels/status strings.
2. Format money/timestamps via **existing** formatters (`shared/format/**`), not raw server display strings.
3. Fill optional display fields only when the existing contract allows.
4. Never invent security/risk/KYC/paid state.
5. Never fall back to mock when API payload is incomplete.
6. Throw typed `INVALID_API_CONTRACT` when authoritative required fields are missing.
7. Preserve stable IDs for React keys and selection state.
8. Accept pagination/meta without forcing table UI changes.
9. Unit-test: raw DTO fixture **and** mock fixture → equivalent view model shape.

## 3. Correct vs forbidden

```ts
// Correct — transport stays UPPERCASE; view matches mock-era type
const view: SellerWithdrawal = mapWithdrawalDto(dto);
// Existing screen receives SellerWithdrawal unchanged
```

```tsx
// Forbidden — design fork by source
return isLiveApi() ? <NewLiveWithdrawalTable /> : <ExistingTable />;
```

## 4. Example A — Public catalog (PUB)

**View model (existing):** `features/catalog/contracts.ts`  
`CatalogProduct`, `PublicStorefront` (slugs, palette, glyph, includes, preset/layout tokens).

**Target layering for API mode (INT/PUB tasks implement; not done in UI-040):**

```text
GET public store/product DTO
  -> storefrontEnvelopeSchema / productDtoSchema
  -> mapPublicStorefrontDto(dto): PublicStorefront
  -> mapCatalogProductDto(dto): CatalogProduct
  -> existing store/product screens & ProductArt props
```

**Parity rules for this domain:**

| Backend concern | Mapper behavior | UI result |
| --- | --- | --- |
| Product type enum | Map to `"download" \| "link" \| "code"` only | Existing type badges/glyphs |
| Price minor units | Integer → existing `price: number` convention used by screens | Same price display helpers |
| Missing published product | `null` / not-found path | Existing `NotFound`, not empty fake card |
| Extra SEO fields | Drop or keep off-view-model | No new SEO card without UI-080 |
| Accent/theme tokens | Map to existing `preset`/`layout`/`font` unions | Storefront geometry unchanged |

**Mock characterization source today:** `features/catalog/mock.ts` → same `PublicStorefront` / `CatalogProduct`.  
API mappers must target those types, not invent parallel live types.

## 5. Example B — Seller finance / withdrawals (SEL)

**View model (existing):** `features/finance/contracts.ts`  
`SellerWithdrawal`, `SellerWithdrawalStatus`, `SellerFinanceSummary`, `SellerWithdrawalQuote`.

**Status union (frozen for presentation):**  
`"Pending" | "Completed" | "Processing" | "Failed"` — mapper must produce these strings (or exact existing screen expectations), not raw `PENDING_REVIEW`.

**Target layering:**

```text
Withdrawal list/detail DTO + finance summary DTO
  -> withdrawalDtoSchema / financeSummarySchema
  -> mapSellerWithdrawalDto / mapSellerFinanceSummaryDto
  -> SellerWithdrawal / SellerFinanceSummary
  -> features/seller/screens/finance/* existing props
```

**Parity rules:**

| Backend concern | Mapper behavior | UI result |
| --- | --- | --- |
| Status enum | Exhaustive map → `SellerWithdrawalStatus` | Existing `Status` / badge tones |
| Amounts | Integer minor units → existing number fields; format in UI helpers | No float money |
| Bank label | Compose from allowlisted bank fields already shown | Same `bankLabel` prop |
| Unknown terminal state | Fail closed / map to failed-safe existing state — never “Completed” | No false success |
| Quote/provider | `provider: "Xendit"` only if contract matches existing view | Withdrawal form geometry unchanged |
| Incomplete payload | `INVALID_API_CONTRACT` | Existing error/retry, not partial fake row |

**Current gap (documented, not fixed here):**  
`features/orders/api.ts` still casts envelope data as view types without a mapper layer. Future domain tasks must introduce `mappers.ts` + schemas per this rule rather than changing JSX.

## 6. Test expectation (for later domain tasks)

```ts
// Pseudocode acceptance for mappers
expect(mapCatalogProductDto(apiFixture)).toEqual(expectedCatalogProductView);
expect(mapSellerWithdrawalDto(apiFixture)).toEqual(expectedSellerWithdrawalView);
// mock path already returns view model; both paths equal for security-equivalent fixtures
```

## 7. Natural doc anchor (no redesign)

Canonical rule remains in `TASK/00-UI-FREEZE-CONTRACT.md` §UI-040 and this evidence file.  
Domain `mappers.ts` files (when created under INT/domain tasks) should reference this path in their module header only if a file is being created for wiring — **not** as a UI-040 product change.
