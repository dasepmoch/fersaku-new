# Fersaku

Monorepo for the Fersaku digital-product commerce platform (Next.js frontend + Go API).

## Layout

```text
frontend/   Next.js App Router (seller, buyer, admin UI)
backend/    Go modular monolith (API + worker)
docs/       Cross-cutting product/architecture docs
scripts/    CI and local stack helpers
TASK/       Execution evidence and task trackers (incl. production readiness)
```

## Quick start (fresh clone)

### Frontend

```bash
cd frontend
npm install
npm run dev      # http://localhost:3000
# npm run build && npm run start   # production-style
```

Or from the monorepo root (scripts proxy into `frontend/`):

```bash
npm install --prefix frontend   # first time
npm run dev
npm run build
npm run start
```

**Important:** the Next.js package and `.next` output live under `frontend/`. Always run `next start` (or root `npm run start`) with working directory `frontend/` after `npm run build` there—not from the monorepo root with a bare `npx next start`.

#### Data modes

| Mode | Env (names only) | Notes |
| ---- | ---------------- | ----- |
| Mock (default local) | `NEXT_PUBLIC_DATA_SOURCE=mock`, `NEXT_PUBLIC_APP_STAGE=prototype` | Deterministic UI without API |
| API-live | `NEXT_PUBLIC_DATA_SOURCE=api`, `NEXT_PUBLIC_APP_STAGE=live`, `API_INTERNAL_URL=http://127.0.0.1:18080` | Browser uses same-origin `/v1`; leave `NEXT_PUBLIC_API_URL` empty |

- Copy `frontend/.env.example` → `frontend/.env.local` and adjust.
- `API_INTERNAL_URL` is **server-only** (SSR + rewrites). Never put internal hosts in `NEXT_PUBLIC_*`.
- Full env notes: `frontend/.env.example`.

### Backend

```bash
cd backend
# see backend/README.md — Compose, migrate, run API/worker
```

Local Compose typically maps API to host `http://127.0.0.1:18080` (container `:8080`).

## Production readiness

Program trackers, topology, and evidence: **`TASK/PROD/`** (status board: `TASK/PROD/09-EXECUTION-STATUS.md`).

Host FE process (this machine): prefer systemd user unit with `WorkingDirectory=…/frontend` and env above; rebuild with `cd frontend && npm run build` before `next start`.

## Product surfaces (summary)

Two intentional products share the monorepo frontend:

- **Seller / buyer** — Fersaku editorial green system; storefronts, checkout, dashboard, account.
- **Admin** — dense graphite/cobalt ops console (`/admin/*`).

Light and dark appearance modes across surfaces. Domain modules under `frontend/features/`, TanStack Query, shared HTTP client for the Go API. Architecture notes live under `frontend/` and `docs/`.

### Main route groups

- Marketing: `/`, `/features`, `/pricing`, `/docs/api`, trust/legal pages
- Auth: `/login`, `/register`, `/account/*`
- Storefront: `/@…`, product detail, checkout, orders/invoices
- Seller: `/dashboard/*` (products, inventory, orders, withdrawals, storefront, webhooks, settings)
- Admin: `/admin/*` (merchants, orders, payments, withdrawals, KYC, audit, providers, system)

Platform fee policy (product): successful transaction `3% + Rp700`, withdrawal `3% + provider processing`, minimum withdrawal `Rp50.000`. KYC is required only for production QRIS API credentials, not for normal storefront operation.

## Validation (frontend)

```bash
cd frontend   # or use root npm run *
npm run verify
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome npm run test:e2e
```

`NEXT_TEST_WASM=1` is set in dev/build scripts for the local WASM toolchain.

## References

- Backend: [`backend/README.md`](backend/README.md)
- Backend contracts / handoff: [`docs/BACKEND_HANDOFF.md`](docs/BACKEND_HANDOFF.md)
- Production program: [`TASK/PROD/`](TASK/PROD/)
