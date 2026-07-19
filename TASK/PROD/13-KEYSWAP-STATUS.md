# 13 — KEYSWAP / full-prod readiness status board

> Claim / finish here. Evidence: `TASK/PROD/evidence/<KEY-ID>/`  
> Program doc: [`12-FULL-PROD-KEYSWAP-PROGRAM.md`](12-FULL-PROD-KEYSWAP-PROGRAM.md)  
> Ops pack: [`ops/README.md`](ops/README.md)  
> **Truthful readiness matrix (GAP-12):** [`../GAP/evidence/12-P1-READINESS-EVIDENCE/READINESS-MATRIX.md`](../GAP/evidence/12-P1-READINESS-EVIDENCE/READINESS-MATRIX.md)

**Last update:** 2026-07-20 — GAP-12 reconcile (evidence-backed; no invented live/staging)  
**Target:** key-swap only at KEY-62  
**Pre-LIVE GO:** **NOT READY**

---

## Legend

`pending` · `in_progress` · `done` · `blocked` · `deferred` · `waived` · `OWNER`

**Meaning of `done`:** acceptance evidence exists for the **claimed layer** only.  
**Code/runbook done ≠ cloud live.** Host/demo ≠ staging/production.

| Layer | What `done` may claim |
| ----- | --------------------- |
| Code + unit/integration | Adapter/config/tests pass |
| Host/demo sandbox money | B50/E2E on demo host |
| Ops runbook + local drill | Document + local script |
| Managed cloud provision | **OWNER only** — still residual if blank |
| Human product/security ink | **OWNER only** |
| LIVE money | KEY-62 only after `GO LIVE CANARY` |

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
| KEY-10 | Secret manager inventory + templates | P0 | done (templates) / **OWNER** populate | @opencode + human | `evidence/KEY-10/` + `ops/01-…` — SM paths **not** filled |
| KEY-11 | Managed Postgres + PITR drill | P0 | done (local/runbook) / **OWNER** managed | @opencode + human | `evidence/KEY-11/` + GAP-11 local E2E; managed **BLOCKED** |
| KEY-12 | Managed Redis | P0 | done (runbook) / **OWNER** provision | @opencode + human | `evidence/KEY-12/` + `ops/03-…` |
| KEY-13 | R2 production (no MinIO) | P0 | done (runbook) / **OWNER** provision | @opencode + human | `evidence/KEY-13/` + `ops/04-…` |
| KEY-14 | Production SMTP | P0 | done (runbook) / **OWNER** provision | @opencode + human | `evidence/KEY-14/` + `ops/05-…` |

## K2 — Identity & staging parity

| ID | Title | P | Status | Owner | Evidence |
| -- | ----- | - | ------ | ----- | -------- |
| KEY-20 | Prod identity bootstrap (no seed) | P0 | done | @opencode | `evidence/KEY-20/` + `cmd/bootstrap-admin` |
| KEY-21 | KYC/stock encryption keys | P0 | done (runbook/code) / **OWNER** SM store | @opencode + human | `evidence/KEY-21/` |
| KEY-22 | Staging dual-provider sandbox parity | P0 | **pending** | **OWNER** | dedicated staging; KEY-40 = public demo **≠** staging |
| KEY-23 | Kill seed from public prod surfaces | P1 | done | @opencode | `evidence/KEY-23/` |

## K3 — Deploy contract

| ID | Title | P | Status | Owner | Evidence |
| -- | ----- | - | ------ | ----- | -------- |
| KEY-30 | FE force-api live env | P0 | done | @opencode | `evidence/KEY-30/` |
| KEY-31 | API production env fail-closed | P0 | done | @opencode | `evidence/KEY-31/` |
| KEY-32 | Cookie/HTTPS/CSRF on real domain | P0 | done (demo public edge) | @opencode | `evidence/KEY-32/` — re-verify each env |
| KEY-33 | Public edge TLS + /v1 proxy | P0 | done (demo public edge) | @opencode | `evidence/KEY-33/` |

## K4 — Provider dashboards

| ID | Title | P | Status | Owner | Evidence |
| -- | ----- | - | ------ | ----- | -------- |
| KEY-40 | Duitku callback + sandbox paid | P0 | done (host/demo) | @opencode | `evidence/KEY-40/` — not staging digest promote |
| KEY-41 | Xendit disbursement webhook + sandbox | P0 | done (host/demo) | @opencode | `evidence/KEY-41/` |
| KEY-42 | C30b sandbox bank disbursement proof | P1 | done (sandbox COMPLETED) | @opencode | `evidence/KEY-42/` — not LIVE bank |

## K5 — Quality close / waive

| ID | Title | P | Status | Owner | Evidence |
| -- | ----- | - | ------ | ----- | -------- |
| KEY-50 | Map PROD F + E2E → launch quality | P0 | done | @opencode | `evidence/KEY-50/` |
| KEY-51 | Launch-subset decision | P0 | done (package) / **OWNER** countersign | @opencode + human | `evidence/KEY-51/` — Option 1 recommended; **ink blank** |
| KEY-52 | Staging headed E2E re-run | P0 | **pending** | — | needs KEY-22; host 14/14 is **not** KEY-52 |

## K6 — Sign + LIVE canary

| ID | Title | P | Status | Owner | Evidence |
| -- | ----- | - | ------ | ----- | -------- |
| KEY-60 | Residual risk human signatures | P0 | done (doc) / **OWNER** ink | @opencode + human | `evidence/KEY-60/` + `residual-risks.md` — **signatures blank** |
| KEY-61 | Pre-flight LIVE checklist | P0 | done (scorecard) | @opencode | `evidence/KEY-61/` — GO **NOT MET** (🟥 remain) |
| KEY-62 | Live money canary | P0 | **blocked** | human | needs `GO LIVE CANARY` |

## K7 — Post-canary

| ID | Title | P | Status | Owner | Evidence |
| -- | ----- | - | ------ | ----- | -------- |
| KEY-70 | Post-canary browser smoke | P1 | pending | — | after KEY-62 |
| KEY-71 | 24–72h watch window | P1 | pending | — | after KEY-62 |

---

## Progress snapshot (truthful)

| Phase | Code/runbook done | Cloud/owner closed | Blockers |
|-------|-------------------|--------------------|----------|
| K0 | 3 / 3 | 3 / 3 | — |
| K1 | 5 / 5 runbooks | **0 / 5 managed live** | SM + PG/Redis/R2/SMTP |
| K2 | 3 / 4 | KEY-22 open | staging |
| K3 | 4 / 4 contracts | prod deploy TBD | — |
| K4 | 3 / 3 host/sandbox | dashboard human confirm 🟨 | — |
| K5 | 2 / 3 | KEY-51 ink + KEY-52 | staging E2E |
| K6 | scorecard | KEY-60/62 open | GO + signs |
| K7 | 0 / 2 | — | after canary |

**Do not read “22/27 done” as production-ready.** Count owner-closed rows separately.

---

## GAP-12 re-run (host, not production)

| Check | Result | When UTC | Evidence |
| ----- | ------ | -------- | -------- |
| deploy-gate callbacks 401 | PASS-HOST | 2026-07-19T20:10:37Z | `TASK/GAP/evidence/12-P1-READINESS-EVIDENCE/raw/` |
| unit config/middleware/malware/duitku | PASS | same | same |
| gap-08/09 FE unit | PASS (14) | same | same |
| npm-audit-gate | PASS | same | same |
| release-manifest-rc digests | PASS local Ids | same | `release-manifest-rc.json` |

---

## Human next (only path to true key-swap)

1. Fill SM using `ops/01-secret-manager-templates.md`  
2. Provision managed PG/Redis/R2/SMTP per `ops/02`–`05`  
3. Sign KEY-51 + KEY-60  
4. Staging boot + KEY-22/52 with **same image digests** as candidate  
5. Message **`GO LIVE CANARY`** → KEY-62 using `ops/06-go-live-keyswap-checklist.md`  
6. Do **not** promote using `release/dist/release-manifest.json` placeholder digests (`aaaa…`)
