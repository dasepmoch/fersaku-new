# PROD E2E — Real browser + live API test pack

> **Honest baseline (2026-07-19):**  
> Dual-provider **money path** (checkout intent → Duitku QRIS → signed callback → PAID → settlement/ledger) is proven on **API**.  
> This pack is for **full product E2E** against the **real browser UI** + live API — **not** “already all green”.

## Goals

1. Author **test cases as markdown** first (human-readable, claimable).
2. Run **one case at a time** via OpenCode + Playwright (preferred) or browser MCP / Hermes browser tools.
3. Record evidence under `TASK/PROD/E2E/evidence/<CASE-ID>/`.
4. Never invent green for unrun cases.

## Runtime (this host)

| Piece | Value |
|-------|--------|
| FE | `http://127.0.0.1:3000` and/or `https://fersaku.net` (`DATA_SOURCE=api`) |
| API | `http://127.0.0.1:18080` / `https://api.fersaku.net` |
| Seed password (nonprod only) | `TestSeed1!` |
| Seller | `seller.owner.a@seed.fersaku.test` |
| Buyer | `buyer.a@seed.fersaku.test` |
| Admin | `admin.super@seed.fersaku.test` |
| Store slug | `seed-store-a` · id `01HQ0SEED00000000000000031` |
| Published product id | `01HQ0SEED00000000000000042` |
| Payment | `PAYMENT_PROVIDER=duitku` |
| Disbursement | `DISBURSEMENT_PROVIDER=xendit` |

**UI freeze still on** — tests must not “fix” by redesigning UI.

## Runner strategy (OpenCode)

Prefer **Playwright headed/real Chromium** against live FE+API (not mock):

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$HOME/.local/go/bin:$PATH"
# API already up on :18080; FE on :3000 with api mode
export PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000
export PLAYWRIGHT_SKIP_WEBSERVER=1
export NEXT_PUBLIC_DATA_SOURCE=api
export API_INTERNAL_URL=http://127.0.0.1:18080
export E2E_API_SKIP_WEBSERVER=1
export E2E_API_HAS_NEXT=1
export PLAYWRIGHT_API_BASE_URL=http://127.0.0.1:3000
```

Optional: Hermes `browser_*` tools or `computer-use` for exploratory visual proof when Playwright selectors lag.

## Case order (run 1-by-1)

| ID | Priority | File | Depends |
| -- | -------- | ---- | ------- |
| E2E-00 | P0 | [cases/E2E-00-PREFLIGHT.md](cases/E2E-00-PREFLIGHT.md) | — |
| E2E-01 | P0 | [cases/E2E-01-PUBLIC-LANDING-STOREFRONT.md](cases/E2E-01-PUBLIC-LANDING-STOREFRONT.md) | 00 |
| E2E-02 | P0 | [cases/E2E-02-SELLER-LOGIN-DASHBOARD.md](cases/E2E-02-SELLER-LOGIN-DASHBOARD.md) | 00 |
| E2E-03 | P0 | [cases/E2E-03-ADMIN-LOGIN-CONSOLE.md](cases/E2E-03-ADMIN-LOGIN-CONSOLE.md) | 00 |
| E2E-04 | P0 | [cases/E2E-04-BUYER-LOGIN.md](cases/E2E-04-BUYER-LOGIN.md) | 00 |
| E2E-05 | P0 | [cases/E2E-05-CHECKOUT-QRIS-PENDING.md](cases/E2E-05-CHECKOUT-QRIS-PENDING.md) | 00, 01 |
| E2E-06 | P0 | [cases/E2E-06-CHECKOUT-PAID-CALLBACK.md](cases/E2E-06-CHECKOUT-PAID-CALLBACK.md) | 05 |
| E2E-07 | P0 | [cases/E2E-07-SELLER-ORDERS-BALANCE.md](cases/E2E-07-SELLER-ORDERS-BALANCE.md) | 06, 02 |
| E2E-08 | P0 | [cases/E2E-08-SELLER-WITHDRAWAL-QUOTE.md](cases/E2E-08-SELLER-WITHDRAWAL-QUOTE.md) | 07 |
| E2E-09 | P1 | [cases/E2E-09-ADMIN-PAYMENTS-WITHDRAWALS.md](cases/E2E-09-ADMIN-PAYMENTS-WITHDRAWALS.md) | 06, 03 |
| E2E-10 | P1 | [cases/E2E-10-SELLER-PRODUCTS-CRUD-SMOKE.md](cases/E2E-10-SELLER-PRODUCTS-CRUD-SMOKE.md) | 02 |
| E2E-11 | P1 | [cases/E2E-11-SESSION-CSRF-LOGOUT.md](cases/E2E-11-SESSION-CSRF-LOGOUT.md) | 02 |
| E2E-12 | P1 | [cases/E2E-12-NEGATIVE-AUTH-ISOLATION.md](cases/E2E-12-NEGATIVE-AUTH-ISOLATION.md) | 00 |
| E2E-13 | P2 | [cases/E2E-13-MOCK-MODE-REGRESSION.md](cases/E2E-13-MOCK-MODE-REGRESSION.md) | — (separate env) |

## Status board

See [STATUS.md](STATUS.md).

## OpenCode prompts

Per-case runner prompts live under [prompts/](prompts/). Master template: [prompts/OPENCODE-RUN-ONE-CASE.md](prompts/OPENCODE-RUN-ONE-CASE.md).

## Evidence rules

- Path: `TASK/PROD/E2E/evidence/<CASE-ID>/YYYYMMDD-HHMM-agent.md`
- Attach screenshots paths (no secrets)
- Record: steps run, pass/fail, residual
- Never paste cookies, CSRF, API keys, or `/var/www/pg.txt` values

## What is NOT claimed until cases pass

- Full seller catalog/storefront builder E2E
- Full admin ops matrix
- Live bank disbursement
- Production LIVE money canary (G40)
