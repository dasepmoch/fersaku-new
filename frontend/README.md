# Fersaku frontend

Next.js App Router UI (seller, buyer, admin). Lives under monorepo `frontend/`.

## Run

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
npm run start    # production-style; must run from this directory after build
```

Root monorepo scripts (`npm run dev|build|start`) proxy here via `npm --prefix frontend`.

## Env

Copy `.env.example` → `.env.local`.

| Mode | Key vars (no secrets) |
| ---- | --------------------- |
| Mock | `NEXT_PUBLIC_DATA_SOURCE=mock`, `NEXT_PUBLIC_APP_STAGE=prototype` |
| API-live | `NEXT_PUBLIC_DATA_SOURCE=api`, `NEXT_PUBLIC_APP_STAGE=live`, `API_INTERNAL_URL=http://127.0.0.1:18080` |

Browser: same-origin `/v1` (leave `NEXT_PUBLIC_API_URL` empty). `API_INTERNAL_URL` is server-only.

See monorepo root `README.md` and `TASK/PROD/` for production readiness.
