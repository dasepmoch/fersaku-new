# PROD-A30 — Staging / demo host topology (Cloudflare tunnel)

**Scope:** This host staging/demo path only.  
**Not HA:** Production multi-replica topology remains `backend/docs/launch/topology.md` (BE-630). Tunnel is edge routing for demos — not a substitute for production HA.

**Date:** 2026-07-19  
**Host config reference (read-only, not committed):** `~/.cloudflared/fersaku.yml`

---

## 1. Text topology diagram (this host)

```text
                    Internet (HTTPS)
                           │
              ┌────────────┴────────────┐
              │  Cloudflare Tunnel      │
              │  (cloudflared → host)   │
              └────────────┬────────────┘
           ┌───────────────┼───────────────┐
           │               │               │
    fersaku.net      www.fersaku.net   api.fersaku.net
    fersaku.dasepmoch.dev              api-fersaku.dasepmoch.dev
           │               │               │
           └───────┬───────┘               │
                   ▼                       ▼
          localhost:3000            localhost:18080
          Next.js FE                Go API (compose host map)
          monorepo frontend/        container :8080
                   │                       │
                   │                       ├── Postgres / Redis / …
                   │                       └── POST /v1/webhooks/*
                   │                              (Duitku, Xendit)
                   │
            Browser clients
```

**Money callbacks (providers → public HTTPS → tunnel → API):**

```text
  Duitku  ──POST──► https://api.fersaku.net/v1/webhooks/duitku[/sandbox|/live]
  Xendit  ──POST──► https://api.fersaku.net/v1/webhooks/xendit/disbursement
  Xendit  ──POST──► https://api.fersaku.net/v1/webhooks/xendit   (legacy payment; no new traffic after cutover)
```

---

## 2. Host table

| Public hostname | Local service | Port | Notes |
| --------------- | ------------- | ---- | ----- |
| `fersaku.net` | Next.js frontend | `3000` | Production domain; monorepo `frontend/` |
| `www.fersaku.net` | Next.js frontend | `3000` | Same FE process as apex |
| `api.fersaku.net` | Go API | `18080` | Compose host map `18080→8080`; callbacks must use this HTTPS origin |
| `fersaku.dasepmoch.dev` | Next.js frontend | `3000` | Temporary zone we control |
| `api-fersaku.dasepmoch.dev` | Go API | `18080` | Temporary API alias |
| _(default catch-all)_ | `http_status:404` | — | Tunnel ingress last rule |

Verified (orchestrator / re-check): API `GET http://localhost:18080/health/live` → **200**.

---

## 3. Callback URLs (no secrets)

Register these on provider dashboards for **this** staging/demo host. Paths from `TASK/PROD/01-PROVIDER-ARCHITECTURE.md` §4.

| Provider | Purpose | Public URL |
| -------- | ------- | ---------- |
| Duitku | Payment webhook (primary) | `https://api.fersaku.net/v1/webhooks/duitku` |
| Duitku | Sandbox variant | `https://api.fersaku.net/v1/webhooks/duitku/sandbox` |
| Duitku | Live variant | `https://api.fersaku.net/v1/webhooks/duitku/live` |
| Xendit | Disbursement webhook | `https://api.fersaku.net/v1/webhooks/xendit/disbursement` |
| Xendit | Legacy payment webhook | `https://api.fersaku.net/v1/webhooks/xendit` |

**Rules:**

- Callbacks must hit **public HTTPS** (`https://api.fersaku.net/...`), not `localhost` or bare HTTP.
- Auth tokens / merchant keys stay in host env / secret store — **never** in this doc or git.
- After payment cutover (PROD-B40): no **new** traffic on legacy Xendit payment path; route may remain mounted to absorb late events.

Temp-zone equivalents (if testing under `dasepmoch.dev`): replace host with `https://api-fersaku.dasepmoch.dev` + same path.

---

## 4. Tunnel + monorepo checklist

| # | Check | Status / note |
| - | ----- | ------------- |
| 1 | Tunnel ingress: `fersaku.net` / `www` → `http://localhost:3000` | Correct in `fersaku.yml` |
| 2 | Tunnel ingress: `api.fersaku.net` → `http://localhost:18080` | Correct; host map compose **18080→8080** |
| 3 | Temp hosts under `dasepmoch.dev` still point FE:3000 / API:18080 | Present in ingress |
| 4 | FE app lives in monorepo `frontend/` (not old root-only Next) | `frontend/package.json` (`fersaku-frontend`) |
| 5 | FE start path after monorepo move | `cd frontend && npm run dev` (dev) or `npm run build && npm run start` (prod-like) |
| 6 | FE process options | **Unit:** `fersaku-frontend.service` (user unit; may be inactive). **Manual:** start Next from `frontend/` on `:3000` |
| 7 | API health on host port | `/health/live` on `:18080` returns 200 when API up |
| 8 | Provider callbacks use public HTTPS API host | See §3 |
| 9 | Production HA | Still follows `backend/docs/launch/topology.md` — **not** tunnel-as-HA |
| 10 | No tunnel credentials / tokens in git | Credentials stay under `~/.cloudflared/`; do not commit |

---

## 5. FE process notes (staging/demo)

| Mode | How | Port |
| ---- | --- | ---- |
| User systemd unit | `fersaku-frontend.service` (user) | 3000 when active |
| Manual / ad-hoc | From repo: `cd frontend && npm run start` (or `dev`) | 3000 |

If the unit is inactive, tunnel FE hostnames will fail until Next is listening on `:3000`. API callbacks only require the API process on `:18080`.

---

## 6. Relation to production HA

| Concern | This host (staging/demo) | Production |
| ------- | ------------------------ | ---------- |
| Edge | Cloudflare tunnel → localhost | Managed LB / ingress (TLS) |
| API replicas | Typically 1 (compose) | ≥ 2 stateless (`fersaku-api`) |
| Callbacks | Tunnel → single host `:18080` | LB → any healthy API replica |
| Compose | Local + staging rehearsal | **Not** production runtime |

See also: `backend/docs/launch/topology.md` § Dual-provider callbacks (PROD-A30).
