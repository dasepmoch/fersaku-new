# INT-030 — Official same-origin topology

## Official mapping

| Layer | Role | Port / address |
| --- | --- | --- |
| Browser | Public Next FE | `:3000` (local) / public edge host |
| Browser API path | Relative same-origin | `/v1/*` only |
| Next rewrites | Transparent proxy | `/v1/:path*` → `${API_INTERNAL_URL}/v1/:path*` |
| Go API (compose host) | Published backend | host `18080` → container `8080` |
| Go API (compose network / SSR) | Internal | `http://api:8080` |
| Edge tunnel (dev/demo) | Optional | `api.fersaku.net` → host `18080` |

```text
Browser (fersaku FE origin)
 | fetch("/v1/...", { credentials: "include" })
 v
Next.js (:3000) ──rewrite──> Go API (API_INTERNAL_URL)
 | SSR only: getApiInternalUrl() + cookie allowlist (INT-110)
 v
Go handlers / Postgres / Redis
```

## Environment profiles

| Profile | Browser base | `API_INTERNAL_URL` | Notes |
| --- | --- | --- | --- |
| Prototype mock | same-origin `""` (unused if mock) | optional; default `http://127.0.0.1:18080` | No live start |
| Local API (compose) | same-origin `/v1` | `http://127.0.0.1:18080` or unset | Next rewrites to host-mapped API |
| Local API (native Go) | same-origin `/v1` | `http://127.0.0.1:8080` | Process listens `:8080` |
| CI | same-origin `/v1` | service DNS or `127.0.0.1:18080` | Fail closed if live+mock |
| Staging / prod | same-origin `/v1` | **required** in-cluster URL e.g. `http://api:8080` | Reject empty/placeholder |

## Env contract

| Variable | Visibility | Purpose |
| --- | --- | --- |
| `API_INTERNAL_URL` | **Server-only** | SSR base + rewrite target origin |
| `API_PROXY_TARGET` | Server-only optional | Rewrite override if split from SSR base |
| `NEXT_PUBLIC_API_URL` | **Deprecated** for browser | Absolute/cross-origin escape hatch only; leave empty for official topology |
| `NEXT_PUBLIC_DATA_SOURCE` | Public bootstrap | mock \| api (registry INT-025) |
| `NEXT_PUBLIC_APP_STAGE` | Public | prototype \| live |

**Never** set `NEXT_PUBLIC_API_INTERNAL_URL` or put internal hosts in `NEXT_PUBLIC_*`.

Production fail-closed (`assertSafePublicEnvironment` + `requireApiInternalUrl`):

- live requires `dataSource=api`
- live requires non-empty, non-placeholder `API_INTERNAL_URL`
- api mode rejects mock/placeholder internal URLs when set

## Cookie / session notes

- Prefer same-origin so session cookie is first-party; no credentialed CORS.
- Session: `HttpOnly`, `Secure` on TLS, `SameSite` aligned with topology (typically `Lax` for same-site FE+API via rewrite).
- Narrow `Path` / `Domain` per BE session config (INT-120/130).
- Browser client always `credentials: "include"` on same-origin `/v1`.
- SSR (INT-110): forward only allowlisted session cookie + `X-Request-ID` to `API_INTERNAL_URL`; never the full browser header set.

## CSP

- Official same-origin: `connect-src 'self'` (plus dev HMR websockets).
- Deprecated absolute `NEXT_PUBLIC_API_URL` may add that origin to `connect-src` only when set.
- Internal rewrite target is **not** added to browser CSP (browser never dials it).

## Proxy limits / trust

- Next rewrites are transparent; no commerce body mutation.
- Default Next rewrite timeouts apply; callback/upload routes that need large bodies should terminate on Go/edge, not via FE rewrite, when limits differ.
- Trust `X-Forwarded-*` only from trusted proxy CIDR on the Go side (BE config).
- Host header: API should not treat arbitrary external hosts as trusted without allowlist.

## Cross-origin (non-default)

If org forces cross-origin absolute API:

1. Set `NEXT_PUBLIC_API_URL` to exact public API origin.
2. Implement exact-origin CORS allowlist + credentials + `Vary: Origin` on BE.
3. Negative tests for wildcard + credentials.
4. Document cookie `SameSite=None; Secure` implications.

Default backlog decision remains **same-origin** (TASK/README §8).

## Port alignment

| Surface | Port |
| --- | --- |
| FE public | 3000 |
| BE container | 8080 |
| BE compose host publish | 18080 |
| Tunnel `api.fersaku.net` | → 18080 |

## Code map

| Concern | File |
| --- | --- |
| Env contract | `shared/config/env.ts` |
| Browser URL builder | `shared/api/http-client.ts` → `buildApiUrl` |
| Rewrites + CSP | `next.config.ts` |
| Startup assert | `app/layout.tsx` → `assertSafePublicEnvironment()` |
| Tests | `tests/unit/env.test.ts`, `tests/unit/http-client.test.ts`, architecture INT-030 guard |
