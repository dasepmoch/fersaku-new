# Frontend Architecture

Source lives under `frontend/`. Backend Go services live under `backend/`.


Fersaku uses Next.js App Router as a presentation application. Production commerce, payment, ledger, fulfillment, KYC, provider credentials, and privileged authorization remain in the separate Go API.

## Boundaries

```txt
frontend/
  app/                URL ownership, layouts, loading/error boundaries, metadata
features/           Business-domain screens, contracts, api modules, hooks
  catalog/          Product contracts, api module, query hooks
  orders/           Order contracts, api module, query hooks
  finance/          Balance, ledger, withdrawal contracts + api + hooks
  seller/           Seller screens, storefront studio, customers/reviews data, route metadata
  admin/
    data/           Merchants, buyers, orders, withdrawals, payments api + hooks
    ui/             Shared admin chrome (AdminStatus, Metric, tables) — no visual variance
    screens/        Route-facing console surfaces (list/detail split where large)
    operations/     QRIS API KYC, webhooks, emergency tools
    commerce/       Campaigns and global fee-policy visibility
  buyer/
    data/           Purchases, profile, sessions api + hooks
    screens/        Buyer account surfaces
  commerce/         Checkout and buyer-commerce experiences
shared/             Framework-wide API, query, UI primitives, formatters
  format/status.ts  Pure status classification used by AdminStatus
components/         Cross-surface visual shells; domain modules re-export from features/
lib/                Deterministic fixtures and compatibility utilities
shared/mock/         Deterministic latency/scenario runtime used only by mock adapters
shared/storage/     Versioned, schema-validated browser storage adapters
shared/observability/ Safe no-op reporter with recursive redaction
tests/unit/         Pure contracts, route policy, api modules, calculations
tests/e2e/          Browser-level critical commerce and administration flows
```

Seller and administrator pages use explicit file-based routes. Catch-all route switches are prohibited for primary product surfaces because they prevent route-level ownership, lifecycle boundaries, permission mapping, and effective code splitting.

## Data Flow

```txt
App Router page
  -> domain screen
  -> TanStack Query hook (features/*/hooks or features/*/data/hooks)
  -> feature API module (features/*/api.ts or features/*/data/*.ts)
       -> mock fixtures by default
       -> shared HTTP client when NEXT_PUBLIC_DATA_SOURCE=api
  -> OpenAPI-compatible Go platform endpoint
```

No repository interfaces. Each domain exposes plain async functions in `api.ts` (or split modules under `data/`). Screens never embed URLs. Mock mode may supply `placeholderData` so first paint stays stable.

Mock/API selection is centralized in the feature API module. Screens import hooks and domain contracts only; a mock adapter may bridge legacy fixtures while migration is in progress, but fixture imports are forbidden in presentation. `shared/mock/runtime` provides deterministic scenario, clock, ID, latency, and abort helpers without becoming a production business engine.

Admin list screens (merchants, buyers, orders, withdrawals, payments), buyer purchases, and seller customers/reviews read through hooks with the same mock fallback so UI appearance is unchanged until live API is enabled.

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

Run `npm run verify` before merging. Critical browser flows run through Playwright with desktop and mobile projects; `npm run test:e2e:a11y` scans representative surfaces with axe, and `npm run test:e2e:visual` protects approved desktop/mobile screenshots. Production CI installs Playwright Chromium and runs the full E2E suite after the build. Backend contracts and ownership invariants are recorded in [`docs/BACKEND_HANDOFF.md`](docs/BACKEND_HANDOFF.md); the implementation-ready production backlog is in [`docs/BACKEND_PRODUCTION_TASKS.md`](docs/BACKEND_PRODUCTION_TASKS.md).
