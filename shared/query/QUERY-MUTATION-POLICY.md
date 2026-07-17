# Query / mutation / cache / idempotency policy (INT-160)

Domain hooks inherit these defaults via `useAppQuery`, `useAppMutation`, and `AppQueryProvider`. Do not re-implement ad-hoc retry or PII-bearing idempotency keys in feature code.

## Query keys

Shape (as needed):

```text
[surface, tenant, resource, normalizedFilters, sort, cursor, mode]
```

- Seller keys already include `storeId` (INT-150). Never omit tenant for private data.
- Prefer exact invalidation of affected keys after a mutation; avoid broad prefixes like `["admin"]` when only one row changed.
- **Never** put one-time secrets, QR raw capability, MFA proof, raw credentials, inventory secrets, CSRF/MFA tokens, or Authorization material into query keys or persistent cache entries.
- Private roots (`seller`, `admin`, `buyer`, `auth`, `session`, `me`, `profile`, `notifications`) are cleared on logout / actor / impersonation change (`shared/auth/private-cache.ts`). Prior-store keys are cleared on store switch (`shared/seller/store-cache.ts`).

## Stale / revalidate

| Surface | Helper | Default staleTime |
| --- | --- | --- |
| Public catalog | `surface: "public"` | 60s |
| Private workspace | `surface: "private"` (default) | 30s |
| Finance / money | `surface: "finance"` | 15s |
| Secret / auth bootstrap | `surface: "secret"` / `"auth"` | 0 |

SSR private/auth/finance/secret reads remain `Cache-Control: no-store` at the HTTP layer (INT-020 / INT-110). Browser React Query cache is memory-only and is not a substitute for no-store.

## Smooth filter / cursor UX

- Pass `keepPrevious: true` on `useAppQuery`, or `placeholderData: keepPreviousQueryData` / `withKeepPreviousData()`.
- `queryFn` always receives `AbortSignal`; cancel in-flight GETs when the key changes (search debounce + filter switch).
- Debounce search inputs in the screen; do not mint a new query key on every keystroke without debounce.

## Safe GET retry (query only)

Owned by React Query defaults (`defaultQueryOptions` in `query-policy.ts`):

- Retry only network / `408` / `429` / `5xx`.
- Max 2 retries; exponential backoff + jitter.
- Honor `Retry-After` when present (capped).
- **Never** auto-retry mutations.

Transport HTTP client remains single-shot (INT-100); query layer owns safe GET retry.

## Mutations

| Rule | Implementation |
| --- | --- |
| No automatic retry | `useAppMutation` forces `retry: false`; provider default matches |
| Opaque idempotency key | `createIdempotencyKey()` — UUID; no email/store/amount/PII/timestamp-only |
| One key per logical intent | `createIdempotencyIntentHolder()` — reuse on manual retry; `reset()` only for new user intent |
| Body change with same key | Local `conflict_local` / server `IDEMPOTENCY_CONFLICT` → require new user intent; never auto-rotate |
| Double-click | `createPendingDedupe()` + disable exact CTA while `isPending` |
| Money / payment / withdrawal / admin / permission / credential / secret | **Not optimistic** |
| Reversible low-risk only | Optional optimistic with snapshot rollback + server reconciliation |

Unknown outcome → status lookup / reconciliation, not “assume failed then new command”.

### Bad pattern (forbidden)

```ts
// ❌ embeds product + email (PII) and invents a new semantic key shape
idempotencyKey: `checkout_${product.id}_${email}`

// ❌ timestamp-only uniqueness
idempotencyKey: `seller-withdrawal:${storeId}:${quote.id}:${Date.now()}`
```

### Good pattern

```ts
const intent = useRef(createIdempotencyIntentHolder());
const dedupe = useRef(createPendingDedupe());

function onPay() {
  if (!dedupe.current.tryBegin()) return;
  const key = intent.current.getKey(); // same key on double-click / manual retry
  mutate({ ..., idempotencyKey: key })
    .finally(() => dedupe.current.end());
  // on terminal success or intentional new CTA:
  // intent.current.reset();
}
```

## Modules

| File | Role |
| --- | --- |
| `shared/query/query-policy.ts` | stale times, keepPrevious, safe GET retry |
| `shared/query/mutation-policy.ts` | no-retry, intent holder, pending dedupe, opaque key check |
| `shared/query/create-query.ts` | `useAppQuery` defaults + abort |
| `shared/query/create-mutation.ts` | `useAppMutation` + re-exports |
| `shared/query/query-provider.tsx` | QueryClient defaults |
| `shared/api/idempotency.ts` | UUID mint + intent fingerprint (INT-020) |
| `shared/auth/private-cache.ts` | logout/actor private cache clear |
