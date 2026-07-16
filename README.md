# Fersaku Frontend

High-fidelity frontend prototype for an Indonesian digital-product commerce platform. The project is frontend-only: checkout, payment, analytics, products, orders, withdrawals, API keys, and webhooks use realistic mock data.

The planned production backend is a separate Golang service using `net/http` + `chi`, PostgreSQL through `pgx`/`sqlc`, Redis + Asynq, `golang-migrate`, and S3-compatible Cloudflare R2. Next.js remains the frontend and does not own payment, ledger, fulfillment, KYC, or provider-secret business logic.

The application includes two intentionally separate products:

- Seller and buyer experience using Fersaku's editorial green visual system.
- Internal administration console using a dense graphite/cobalt operations system.
- Persistent light and dark appearance modes across every surface.

The codebase uses explicit file-based seller/admin routes, domain-owned modules under `features/`, TanStack Query, feature API modules (`features/*/api.ts`), route-level loading/error boundaries, and a shared HTTP client prepared for the separate Go API. See `ARCHITECTURE.md` for ownership and integration rules.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Main routes

- `/` - landing page
- `/features`, `/pricing`, `/api`, `/docs/api` - marketing and API docs
- `/about`, `/careers`, `/contact` - company pages
- `/blog`, `/blog/checkout-qris-conversion` - journal and article detail
- `/help`, `/status`, `/security`, `/changelog` - resource and trust pages
- `/privacy`, `/terms`, `/cookies` - legal placeholders
- `/login`, `/register` - mocked authentication
- `/@asep-ai-tools` - public storefront
- `/@designkit-studio` - second storefront with independent branding and products
- `/@asep-ai-tools/ai-prompt-pack` - product detail
- `/checkout/prod_01` - interactive mock QRIS checkout
- `/orders/FRS-240712-1848/invoice` - printable official PDF-ready invoice with a real verification QR
- `/invoices/verify/FRS-240712-1848-6AD891CE` - public privacy-safe invoice authenticity check
- `/orders/FRS-240712-1848/success` - delivery success state
- `/account/login` - passwordless buyer login
- `/account/purchases` - cross-store buyer purchase library
- `/account/purchases/FRS-240712-1842` - secure delivery, credential, code, and product-update detail
- `/account/purchases/FRS-240712-1842/invoice` - buyer invoice view
- `/account/profile`, `/account/security` - buyer preferences and session revocation
- `/dashboard` - responsive seller dashboard
- Seller overview includes Top Referrers/UTM attribution with clicks, paid sales, conversion rate, and attributed revenue
- `/dashboard/onboarding` - first-store setup for identity, store address, and first product
- `/dashboard/products/new` - product creation UI
- `/dashboard/products/prod_01` - product editing, delivery, pricing, and analytics
- `/dashboard/inventory` - stock health and inventory products
- `/dashboard/inventory/prod_account` - structured credential schema and secure stock editor
- `/dashboard/orders/FRS-240712-1842` - seller order detail and fulfillment timeline
- `/dashboard/customers/FRS-240712-1842` - customer detail and purchase history
- `/dashboard/reviews` - verified ratings, seller replies, and review reporting
- `/dashboard/coupons/new` - coupon creation
- `/dashboard/withdrawals/new` - withdrawal request flow with enforced bank-change security-lock state
- `/dashboard/storefront` - eight complete templates, full brand/layout/section/SEO controls, undo/redo, and real-time desktop/mobile preview
- `/dashboard/webhooks` - interactive webhook test console
- `/dashboard/settings` - bank account modal, MFA enrollment, and notifications

### Administration

- `/admin/login` - dedicated administrator login
- `/admin` - global command center and platform health
- `/admin/merchants` - all merchants with independent store and QRIS API access state
- `/admin/merchants/str_01H8A2` - merchant detail, independent access controls, and bounded impersonation actions
- `/admin/buyers`, `/admin/buyers/byr_91K2` - buyer identity, purchase ownership, and session controls
- `/admin/users` - seller accounts and role-based administrator access
- `/admin/profile` - administrator profile, MFA, sessions, and notification preferences
- `/admin/roles` - role directory and staff assignments
- `/admin/roles/new` - custom role creation and permission matrix
- `/admin/roles/role_finance` - edit an existing role
- `/admin/campaigns` - emergency broadcasts, newsletters, compliance notices, audience targeting, and email/in-app previews
- `/admin/orders` - global orders
- `/admin/orders/FRS-240712-1842` - payment, fee, customer, and fulfillment timeline
- `/admin/payments` - Xendit QRIS intent, callback, latency, and payment-status monitoring
- `/admin/withdrawals` - global seller payout queue
- `/admin/withdrawals/WD-120724-0092` - approve, hold, or reject review flow
- `/admin/inventory` - global stock and privileged secret-access controls
- `/admin/fulfillment` - delivery retry, inspection, and revocation
- `/admin/reviews` - review moderation and integrity signals
- `/admin/kyc` - KYC pipeline only for merchants requesting production QRIS API access; normal storefront sellers remain exempt
- `/admin/webhooks` - Xendit payment callbacks and seller webhook delivery with evidence-gated manual Force-Fulfill
- `/admin/audit-logs` - searchable/filterable immutable trail with inspector and export feedback
- `/admin/providers` - provider health, emergency circuit breakers for seller registration/QRIS/withdrawals, and maintenance controls without provider failover routing
- Admin providers are limited to practical infrastructure health and emergency controls for Xendit, storage, queues, and transactional email
- `/admin/system` - fees, settlement, feature flags, and emergency controls

All privileged admin actions use confirmation dialogs, mandatory reason fields, and mocked append-only audit completion states. Platform fees follow the single global policy: successful transaction fee `3% + Rp700`, withdrawal fee `3% + provider processing cost`, and minimum withdrawal `Rp50.000`. Merchant and QRIS API access can be suspended independently. Merchant/user impersonation is time-bounded, reason-gated, defaults to read-only, and does not expose a full privileged scope.

Admin in-app campaigns persist in the mock browser and render as priority-aware seller-dashboard banners. Optional notices can be dismissed, while mandatory compliance notices require explicit acknowledgement.

Super Administrators can create custom staff roles, grant granular permissions, assign staff members, require MFA, and audit permission changes. Common non-critical controls provide visible mock-operation feedback, so buttons do not fail silently.

KYC is not required to create or operate a store. Hosted storefront, Fersaku checkout, products, inventory, balances, and seller withdrawals remain fully accessible. KYC applies only before a production/live QRIS API credential is activated; sandbox API credentials remain available without KYC.

Seller, buyer, and administrator shells include working notification centers and profile menus. Seller and admin settings use interactive tabs, toggles, session controls, and visible saved states. Product pages include verified ratings, distribution, buyer review submission, seller replies, and admin moderation. Checkout supports pay-what-you-want, tips, order bumps, and an animated GoPay/OVO/DANA/ShopeePay QRIS simulator. API docs include an editable frontend-only request playground.

Every data table uses shared React client pagination (`useClientPagination` + `TablePagination`): row count, page size, page numbers, previous/next, and responsive controls. Production APIs should replace this with cursor contracts in [`docs/BACKEND_HANDOFF.md`](docs/BACKEND_HANDOFF.md).

Backend data contracts and security invariants are documented in [`docs/BACKEND_HANDOFF.md`](docs/BACKEND_HANDOFF.md). The executable production backlog for the Go modular monolith, Docker, PostgreSQL, Redis, Cloudflare R2, Xendit, security, observability, testing, deployment, and runbooks is in [`docs/BACKEND_PRODUCTION_TASKS.md`](docs/BACKEND_PRODUCTION_TASKS.md).

Traffic attribution follows a hybrid architecture: Fersaku's Go backend owns UTM/referrer-to-paid-order attribution, while PostHog, Plausible, or GA4 may be connected later as optional analytics sinks rather than the financial source of truth.

## Validation

```bash
npm run verify
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome npm run test:e2e
```

`NEXT_TEST_WASM=1` is included in the dev/build scripts for compatibility with the local execution environment.

The default prototype is deterministic mock mode. Copy `.env.example` to `.env.local` to select an explicit scenario or connect a compatible API; live deployments must use `NEXT_PUBLIC_DATA_SOURCE=api`, `NEXT_PUBLIC_APP_STAGE=live`, and an absolute `NEXT_PUBLIC_API_URL`.
