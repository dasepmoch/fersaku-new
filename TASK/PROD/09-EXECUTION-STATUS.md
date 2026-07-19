# 09 — PROD execution status board

> Update this file when claiming or finishing a task.  
> Evidence lives under `TASK/PROD/evidence/<TASK-ID>/`.

**Program:** Production readiness + Duitku payment + Xendit disbursement  
**Auth:** no MFA  
**Last board update:** 2026-07-19 (B50 CLOSED — host dual-provider E2E PAID+ledger)

---

## Legend

| Status | Meaning |
| ------ | ------- |
| `pending` | Not started |
| `in_progress` | Claimed; only one P0 money task per agent |
| `done` | Acceptance + evidence complete |
| `blocked` | Waiting on dependency or owner |
| `deferred` | Explicitly postponed with date/owner |

---

## Phase A — Foundation

| ID | Title | P | Status | Owner | Evidence |
| -- | ----- | - | ------ | ----- | -------- |
| PROD-A10 | ADR-0008 dual provider | P0 | done | @nikki/opencode | `evidence/PROD-A10/20260719-1312-opencode.md` |
| PROD-A20 | Config PAYMENT/DISBURSEMENT providers | P0 | done | @nikki/opencode | `evidence/PROD-A20/20260719-1317-opencode.md` |
| PROD-A30 | Staging topology + tunnel checklist | P1 | done | @nikki/opencode | `evidence/PROD-A30/20260719-opencode.md` |
| PROD-A40 | Frontend monorepo runbook alignment | P1 | done | @nikki/opencode | `evidence/PROD-A40/20260719-opencode.md` |
| PROD-A50 | Evidence skeleton + board bootstrap | P0 | done | @nikki/opencode | `evidence/PROD-A50/20260719-opencode.md` |

## Phase B — Duitku payment

| ID | Title | P | Status | Owner | Evidence |
| -- | ----- | - | ------ | ----- | -------- |
| PROD-B10 | Duitku QRIS adapter | P0 | done | @nikki/opencode | `evidence/PROD-B10/20260719-opencode.md` |
| PROD-B20 | Webhook `/v1/webhooks/duitku` | P0 | done | @nikki/opencode | `evidence/PROD-B20/20260719-opencode.md` |
| PROD-B30 | Wire checkout + gateway create | P0 | done | @nikki/opencode | `evidence/PROD-B30/20260719-opencode.md` |
| PROD-B40 | Unwire Xendit QRIS primary | P1 | done | @nikki/opencode | `evidence/PROD-B40/20260719-opencode.md` |
| PROD-B50 | Sandbox manual payment proof | P1 | done | @nikki | `evidence/PROD-B50/20260719-opencode.md` (PAID+ledger+settlement verified on host) |

## Phase C — Xendit disbursement

| ID | Title | P | Status | Owner | Evidence |
| -- | ----- | - | ------ | ----- | -------- |
| PROD-C10 | Harden disbursement adapter + webhook | P0 | done | @nikki/opencode | `evidence/PROD-C10/20260719-opencode.md` |
| PROD-C20 | Withdrawal service audit | P0 | done | @nikki/opencode | `evidence/PROD-C20/20260719-opencode.md` |
| PROD-C30 | Sandbox disbursement proof | P1 | done | @nikki/opencode | `evidence/PROD-C30/20260719-opencode.md` (integration-only; no live bank push) |

## Phase D — Frontend API-live

| ID | Title | P | Status | Owner | Evidence |
| -- | ----- | - | ------ | ----- | -------- |
| PROD-D10 | FE env + domain source staging | P0 | done | @nikki/opencode | `evidence/PROD-D10/20260719-opencode.md` |
| PROD-D20 | Checkout API smoke | P0 | done | @nikki/opencode | `evidence/PROD-D20/20260719-opencode.md` |
| PROD-D30 | Withdrawal API smoke | P0 | done | @nikki/opencode | `evidence/PROD-D30/20260719-opencode.md` |
| PROD-D40 | Admin money surfaces sanity | P1 | done | @nikki/opencode | `evidence/PROD-D40/20260719-opencode.md` |

## Phase E — Security

| ID | Title | P | Status | Owner | Evidence |
| -- | ----- | - | ------ | ----- | -------- |
| PROD-E10 | Cookie/CSRF/HTTPS verification | P0 | done | @nikki/opencode | `evidence/PROD-E10/20260719-opencode.md` (browser login residual) |
| PROD-E20 | Webhook security matrix | P0 | done | @nikki/opencode | `evidence/PROD-E20/20260719-opencode.md` |
| PROD-E30 | Rate limit & abuse | P1 | done | @nikki/opencode | `evidence/PROD-E30/20260719-opencode.md` |
| PROD-E40 | Secret scanning hygiene | P0 | done | @nikki/opencode | `evidence/PROD-E40/20260719-opencode.md` |

## Phase F — Quality & canary

| ID | Title | P | Status | Owner | Evidence |
| -- | ----- | - | ------ | ----- | -------- |
| PROD-F10 | Auth/session cell | P0 | done | @nikki/opencode | `evidence/PROD-F10/20260719-opencode.md` |
| PROD-F20 | Checkout-order cell | P0 | done | @nikki/opencode | `evidence/PROD-F20/20260719-opencode.md` (live PAID residual = B50) |
| PROD-F30 | Seller-finance cell | P0 | done | @nikki/opencode | `evidence/PROD-F30/20260719-opencode.md` |
| PROD-F40 | Sandbox canary execution | P0 | done | @nikki/opencode | `evidence/PROD-F40/canary-sandbox.md` (dry-run; no live money) |
| PROD-F50 | Mock mode regression | P1 | done | @nikki/opencode | `evidence/PROD-F50/20260719-opencode.md` |

## Phase G — Ops / owner-sign

| ID | Title | P | Status | Owner | Evidence |
| -- | ----- | - | ------ | ----- | -------- |
| PROD-G10 | Production secrets inventory | P0 | done | @nikki/opencode | `evidence/PROD-G10/20260719-opencode.md` (inventory; secret-manager paths TBD human) |
| PROD-G20 | Infrastructure HA checklist | P0 | done | @nikki/opencode | `evidence/PROD-G20/20260719-opencode.md` (demo host verified; managed prod TBD human) |
| PROD-G30 | Residual risk sign-off | P0 | done | @nikki/opencode | `evidence/PROD-G30/20260719-opencode.md` (doc ready; human signatures deferred) |
| PROD-G40 | Live canary (owner-gated) | P0 | blocked | human GO required | `evidence/PROD-G40/20260719-opencode.md` — **no real money; wait GO LIVE CANARY** |
| PROD-G50 | Program close | P1 | done | @nikki/opencode | `evidence/PROD-G50/20260719-opencode.md` |

---

## Suggested next

```text
Human: sign residual-risks.md (G30) → optional GO LIVE CANARY (G40)
Ops: secret manager + managed HA (G10/G20 TBD rows)
Host demo money path: DONE (B50 PAID+ledger on dual-provider API)
```

---

## Blockers log

| Date | Item | Impact | Owner |
| ---- | ---- | ------ | ----- |
| 2026-07-19 | ~~B50 full PAID+ledger needs API image rebuild~~ **CLOSED** after rebuild + migration 000033 + dual-provider env | — | @nikki |
| 2026-07-19 | ~~Live compose POST `/v1/webhooks/duitku` → 404~~ **CLOSED** (route live; empty body → 401) | — | @nikki |
| 2026-07-19 | Browser login Secure cookie capture needs real credentials | E10 residual only | human |
| 2026-07-19 | G40 live canary blocked until explicit human GO LIVE CANARY | No real-money canary | human |

---

## Phase E+F board summary (2026-07-19)

| ID | Status | One-line |
| -- | ------ | -------- |
| E10 | done | HTTPS/HSTS/CSRF/session tests; browser login residual |
| E20 | done | Duitku+Xendit webhook matrix all unit/handler PASS; no raw body logs |
| E30 | done | Token bucket + Retry-After; FE session single-flight |
| E40 | done | `security_scan.sh` exit 0; evidence clean |
| F10 | done | Identity/CSRF integration cell; no MFA required |
| F20 | done | Checkout+callback integration PASS; host PAID+ledger closed in B50 (KEY-01) |
| F30 | done | Withdrawal unit+integration + ledger; isolation notes |
| F40 | done | canary-sandbox.md dry-run only; **no live money** |
| F50 | done | 148 critical mock unit tests PASS |

## Phase G board summary (2026-07-19)

| ID | Status | One-line |
| -- | ------ | -------- |
| G10 | done | Secrets inventory presence-only; webhooks URL expectations named |
| G20 | done | HA checklist prepared; tunnel demo ≠ prod multi-replica |
| G30 | done | residual-risks.md v1.1 dual-provider; signatures deferred |
| G40 | blocked | Live canary not run; wait human GO |
| G50 | done | Program close; code-complete vs owner-gated documented |

---

## Notes

- Historical `TASK/09-EXECUTION-STATUS.md` (integration FE↔BE) is **not** this board.
- Secrets reference: host `/var/www/pg.txt` — **never** commit contents.
- UI freeze honored (no FE presentation changes this phase).
- Root production pointer: `README.md` → `TASK/PROD/`.
