# Frontend Architecture

Fersaku uses Next.js App Router as a presentation application. Production commerce, payment, ledger, fulfillment, KYC, provider credentials, and privileged authorization remain in the separate Go API.

## Boundaries

```txt
app/                URL ownership, layouts, loading/error boundaries, metadata
features/           Business-domain screens, contracts, api modules, hooks
  catalog/          Product contracts, api module, query hooks
  orders/           Order contracts, api module, query hooks
  finance/          Balance, ledger, withdrawal contracts + api + hooks
  seller/           Seller screens, storefront studio, route metadata
  admin/            Admin screens, operations, commerce tools, route metadata
  buyer/            Buyer account surfaces
  commerce/         Checkout and buyer-commerce experiences
shared/             Framework-wide API, query, UI primitives, formatters
components/         Cross-surface visual shells; domain modules re-export from features/
lib/                Deterministic fixtures and compatibility utilities
tests/unit/         Pure contracts, route policy, api modules, calculations
tests/e2e/          Browser-level critical commerce and administration flows
```

Seller and administrator pages use explicit file-based routes. Catch-all route switches are prohibited for primary product surfaces because they prevent route-level ownership, lifecycle boundaries, permission mapping, and effective code splitting.

## Data Flow

```txt
App Router page
  -> domain screen
  -> TanStack Query hook (features/*/hooks)
  -> feature API module (features/*/api.ts)
       -> mock fixtures by default
       -> shared HTTP client when NEXT_PUBLIC_DATA_SOURCE=api
  -> OpenAPI-compatible Go platform endpoint
```

No repository interfaces. Each domain exposes plain async functions in `api.ts`. Screens never embed URLs. Mock mode may supply `placeholderData` so first paint stays stable.

## Server and Client Components

- Route pages and layouts are Server Components by default.
- Client Components are used only for browser state, forms, charts, modals, and interactive controls.
- Initial production reads should be prefetched on the server and hydrated into TanStack Query when authentication is connected.
- Payment, balance, ledger, KYC, authorization, and provider decisions are never trusted from client state.

## API Rules

- API responses use typed envelopes and cursor pagination.
- Requests include cookies, request correlation, timeouts, and structured errors.
- Money uses integer IDR values.
- Feature API functions accept `AbortSignal` and remain tenant/store scoped.
- OpenAPI-generated request/response types should replace handwritten transport DTOs when the Go specification is available.

## Route Security

Admin route metadata declares the minimum permission required by each surface. The frontend boundary hides unauthorized UI, while the Go backend remains the authoritative enforcement point for every request. Sensitive mutations additionally require reason, recent MFA, idempotency, and immutable audit metadata.

## Quality Gates

Run `npm run verify` before merging. Critical browser flows run through Playwright with desktop and mobile projects. Production CI should additionally install Playwright Chromium and run `npm run test:e2e` after the build.
