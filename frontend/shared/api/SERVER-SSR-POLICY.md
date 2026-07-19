# INT-110 — Server-only HTTP client & private SSR policy

## Rule

**Private data in Server Components must use `serverApiRequest` (or feature adapters that call it), never the browser `apiRequest` alone for session-bound SSR.**

| Surface                                      | Client                                               | Base URL                                                         | Auth path                                         |
| -------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------- |
| Browser (Client Components, event handlers)  | `shared/api/http-client` → `apiRequest`              | same-origin relative `/v1`                                       | `credentials: "include"`                          |
| Server Components / Route Handlers (private) | `shared/api/server-http-client` → `serverApiRequest` | **server-only** `API_INTERNAL_URL` via `requireApiInternalUrl()` | **explicit Cookie allowlist** from `next/headers` |
| Public catalog SSR (optional)                | `serverApiRequest` with `privacy: "public"`          | same internal URL                                                | cookies optional (`skipCookies` / no session)     |

## Why

Node `fetch` has **no browser cookie jar**. `credentials: "include"` does **not** forward the end-user’s `fersaku_session` into Server Component fetches. Relying on the browser client for protected SSR yields anonymous/401 responses or wrong-user cache bleed.

## Cookie / header allowlist

Forward **only**:

- Cookie: `fersaku_session` (`FORWARDED_COOKIE_ALLOWLIST`)
- Header: `X-Request-ID` when present on the incoming request

Do **not** forward the full browser header set, `Authorization` to arbitrary hosts, or third-party cookies. Target host is always config-fixed `API_INTERNAL_URL`.

## Cache

- **Private** (default): `cache: "no-store"` — no shared public cache/tag for seller/buyer/admin.
- **Public**: optional `next.revalidate` / `next.tags` only when data is non-session and safe to share.

## Errors

- Expected resource not-found → `notFound()` via `rethrowForServerComponent` / `serverApiRequestOrNotFound`
- **401 / 403** → auth/permission flow — **never** `notFound()`

## Imports

- `server-http-client.ts` starts with `import "server-only"` — bundler fails if pulled into client.
- Do not put `API_INTERNAL_URL` on `NEXT_PUBLIC_*` or `publicEnv`.
- Client Components must not import `@/shared/api/server-http-client`.

## Migration note

Feature adapters may still call browser `apiRequest` until domain wiring (INT-120+). When a Server Component needs live private data, switch that path to `serverApiRequest` (or pass a server transport into the adapter). Mock-mode fixtures remain valid for prototype SSR without cookies.
