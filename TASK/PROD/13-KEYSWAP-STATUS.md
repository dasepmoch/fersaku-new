# 13 — KEYSWAP / full-prod readiness status board

> Claim / finish here. Evidence: `TASK/PROD/evidence/<KEY-ID>/`  
> Program doc: [`12-FULL-PROD-KEYSWAP-PROGRAM.md`](12-FULL-PROD-KEYSWAP-PROGRAM.md)  
> Ops pack: [`ops/README.md`](ops/README.md)

**Last update:** 2026-07-19 — KEY-11..14 detailed runbooks + local drills  
**Target:** key-swap only at KEY-62  
**Pre-LIVE GO:** **NOT READY** until managed cloud provision + human signs (see KEY-61)

---

## Legend

`pending` · `in_progress` · `done` · `blocked` · `deferred` · `waived`

**Note on KEY-11..14 `done`:** means **runbook + local/code verification complete**.  
Managed cloud provision remains **human residual** inside each evidence file — do not treat as “AWS already live”.

---

## K0 — Docs & policy

| ID | Title | P | Status | Owner | Evidence |
| -- | ----- | - | ------ | ----- | -------- |
| KEY-00 | Key-swap DoD freeze | P0 | done | @opencode | `evidence/KEY-00/` |
| KEY-01 | Reconcile residual docs (post-B50) | P1 | done | @opencode | `evidence/KEY-01/` |
| KEY-02 | DISABLED/non-goal launch freeze | P1 | done | @opencode | `evidence/KEY-02/` |

## K1 — Ops platform

| ID | Title | P | Status | Owner | Evidence |
| -- | ----- | - | ------ | ----- | -------- |
| KEY-10 | Secret manager inventory + populate | P0 | done | @opencode | `evidence/KEY-10/` + `ops/01-secret-manager-templates.md` |
| KEY-11 | Managed Postgres + PITR drill | P0 | done | @opencode | `evidence/KEY-11/` + `ops/02-postgres-pitr-runbook.md` (local drill; managed residual) |
| KEY-12 | Managed Redis | P0 | done | @opencode | `evidence/KEY-12/` + `ops/03-redis-runbook.md` |
| KEY-13 | R2 production (no MinIO) | P0 | done | @opencode | `evidence/KEY-13/` + `ops/04-r2-object-storage-runbook.md` |
| KEY-14 | Production SMTP | P0 | done | @opencode | `evidence/KEY-14/` + `ops/05-smtp-mail-runbook.md` |

## K2 — Identity & staging parity

| ID | Title | P | Status | Owner | Evidence |
| -- | ----- | - | ------ | ----- | -------- |
| KEY-20 | Prod identity bootstrap (no seed) | P0 | done | @opencode | `evidence/KEY-20/` + `cmd/bootstrap-admin` |
| KEY-21 | KYC/stock encryption keys | P0 | done | @opencode | `evidence/KEY-21/` |
| KEY-22 | Staging dual-provider sandbox parity | P0 | pending | human | dedicated staging; KEY-40 = public demo |
| KEY-23 | Kill seed from public prod surfaces | P1 | done | @opencode | `evidence/KEY-23/` |

## K3 — Deploy contract

| ID | Title | P | Status | Owner | Evidence |
| -- | ----- | - | ------ | ----- | -------- |
| KEY-30 | FE force-api live env | P0 | done | @opencode | `evidence/KEY-30/` |
| KEY-31 | API production env fail-closed | P0 | done | @opencode | `evidence/KEY-31/` |
| KEY-32 | Cookie/HTTPS/CSRF on real domain | P0 | done | @opencode | `evidence/KEY-32/` |
| KEY-33 | Public edge TLS + /v1 proxy | P0 | done | @opencode | `evidence/KEY-33/` |

## K4 — Provider dashboards

| ID | Title | P | Status | Owner | Evidence |
| -- | ----- | - | ------ | ----- | -------- |
| KEY-40 | Duitku callback + sandbox paid | P0 | done | @opencode | `evidence/KEY-40/` |
| KEY-41 | Xendit disbursement webhook + sandbox | P0 | done | @opencode | `evidence/KEY-41/` |
| KEY-42 | C30b sandbox bank disbursement proof | P1 | done | @opencode | `evidence/KEY-42/` (SANDBOX COMPLETED) |

## K5 — Quality close / waive

| ID | Title | P | Status | Owner | Evidence |
| -- | ----- | - | ------ | ----- | -------- |
| KEY-50 | Map PROD F + E2E → launch quality | P0 | done | @opencode | `evidence/KEY-50/` |
| KEY-51 | Launch-subset decision | P0 | done | @opencode | `evidence/KEY-51/` (human sign residual) |
| KEY-52 | Staging headed E2E re-run | P0 | pending | — | needs KEY-22 |

## K6 — Sign + LIVE canary

| ID | Title | P | Status | Owner | Evidence |
| -- | ----- | - | ------ | ----- | -------- |
| KEY-60 | Residual risk human signatures | P0 | done | @opencode | `evidence/KEY-60/` (signatures blank) |
| KEY-61 | Pre-flight LIVE checklist | P0 | done | @opencode | `evidence/KEY-61/` + `ops/06-go-live-keyswap-checklist.md` |
| KEY-62 | Live money canary | P0 | **blocked** | human | needs `GO LIVE CANARY` |

## K7 — Post-canary

| ID | Title | P | Status | Owner | Evidence |
| -- | ----- | - | ------ | ----- | -------- |
| KEY-70 | Post-canary browser smoke | P1 | pending | — | after KEY-62 |
| KEY-71 | 24–72h watch window | P1 | pending | — | after KEY-62 |

---

## Progress snapshot

| Phase | Done / Total |
|-------|--------------|
| K0 | 3 / 3 |
| K1 | **5 / 5** |
| K2 | 3 / 4 |
| K3 | 4 / 4 |
| K4 | 3 / 3 |
| K5 | 2 / 3 |
| K6 | 2 / 3 (62 blocked) |
| K7 | 0 / 2 |
| **All** | **22 / 27** |

---

## What “detail done” means vs “cloud live”

| Layer | State |
|-------|--------|
| Code + sandbox money (pay + payout) | **proven** |
| Ops runbooks + local drills + SM templates | **done (this update)** |
| Managed AWS/GCP/R2/SMTP accounts | **human provision** |
| Human product/security ink | KEY-51/60 |
| LIVE money | KEY-62 only |

---

## Human next (only path to true key-swap)

1. Fill SM using `ops/01-secret-manager-templates.md`  
2. Provision managed PG/Redis/R2/SMTP per `ops/02`–`05`  
3. Sign KEY-51 + KEY-60  
4. Staging boot + KEY-22/52  
5. Message **`GO LIVE CANARY`** → KEY-62 using `ops/06-go-live-keyswap-checklist.md`
