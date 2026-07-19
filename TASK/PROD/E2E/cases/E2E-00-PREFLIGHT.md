# E2E-00 — Preflight (FE + API + seed)

| Field | Value |
|-------|--------|
| ID | E2E-00 |
| Priority | P0 |
| Type | API + process smoke (browser optional) |
| Depends | — |
| Blocks | all other E2E-* |

## Goal

Prove the stack is ready before any browser journey.

## Preconditions

- Compose API healthy on `:18080`
- Next FE serving on `:3000` with `DATA_SOURCE=api` (or tunnel `fersaku.net`)
- Seed personas present (`./scripts/seed.sh` if missing)
- `PAYMENT_PROVIDER=duitku`, `DISBURSEMENT_PROVIDER=xendit` in running API

## Steps

1. `curl -sS http://127.0.0.1:18080/health/live` → 200
2. `curl -sS http://127.0.0.1:18080/health/ready` → ready
3. `curl -sS -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:18080/v1/webhooks/duitku -H 'Content-Type: application/json' -d '{}'` → **401** (not 404)
4. `curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/` → 200
5. Login API: `POST /v1/auth/login` with seller seed → 200 + csrfToken
6. Confirm product seed id exists (DB or catalog API)

## Expected

| Check | Pass criteria |
|-------|----------------|
| API live/ready | 200 + ready |
| Duitku webhook mounted | 401 on empty body |
| FE home | 200 |
| Seed login | 200, no MFA required |
| Env dual-provider | container `PAYMENT_PROVIDER=duitku` |

## Non-goals

- Full UI journeys
- Live money canary

## Evidence

`TASK/PROD/E2E/evidence/E2E-00/`

## OpenCode note

This case can run without Playwright; shell + curl sufficient.
