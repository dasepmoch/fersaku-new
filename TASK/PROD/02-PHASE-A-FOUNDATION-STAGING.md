# 02 — Phase A: Foundation & staging readiness

**Depends on:** `00`, `01`, `10` read  
**Unblocks:** Phase B (Duitku), C (Xendit disbursement)

---

## Outcomes

1. Written ADR for dual-provider money path merged.
2. Config/env matrix implemented in code with fail-closed tests.
3. Staging-oriented compose or documented deploy path without committing secrets.
4. Status board (`09`) initialized with claimed/open tasks.

---

## Tasks

### PROD-A10 — ADR-0008 dual provider (payment Duitku / disbursement Xendit)

| Field | Value |
| ----- | ----- |
| Priority | P0 |
| Estimate | S |
| Owner | backend + product |

**Do**

1. Add `backend/docs/adr/ADR-0008-duitku-payment-xendit-disbursement.md`.
2. Status: Accepted; date; supersedes payment half of ADR-0002.
3. Update `backend/docs/DECISIONS.md` index.
4. Record answers to Q1–Q4 from `00` §6 in evidence.

**Acceptance**

- [ ] ADR file exists, linked from DECISIONS.
- [ ] Explicit non-goals: no Duitku payout, no Xendit QRIS primary, no failover UI.
- [ ] Evidence `TASK/PROD/evidence/PROD-A10/`.

**Non-goals:** implementing adapters in this task.

---

### PROD-A20 — Config: PAYMENT_PROVIDER + DISBURSEMENT_PROVIDER

| Field | Value |
| ----- | ----- |
| Priority | P0 |
| Depends | A10 |
| Paths | `backend/internal/config/config.go`, `backend/.env.example`, composition `backend/internal/app/app.go` |

**Do**

1. Add env vars per `10-SECRETS-AND-ENV-MATRIX.md`.
2. Map legacy `XENDIT_MODE=fake|live` → disbursement provider during transition.
3. Fail-closed: staging/production reject `PAYMENT_PROVIDER=fake` and `DISBURSEMENT_PROVIDER=fake` (unless explicit drill flag documented).
4. Unit tests: production rejects fake; local allows fake.

**Acceptance**

- [ ] `go test` config package green.
- [ ] `.env.example` lists names only (no secrets).
- [ ] Composition selects adapters by config (fake stubs until B/C land).

---

### PROD-A30 — Staging topology doc + tunnel checklist

| Field | Value |
| ----- | ----- |
| Priority | P1 |
| Depends | A20 |

**Do**

1. Document target topology in `TASK/PROD/evidence/PROD-A30/topology.md` (or amend `backend/docs/launch/topology.md` with dual-provider section).
2. Checklist: `fersaku.net` → FE `:3000`, `api.fersaku.net` → API `:18080`, callback paths public HTTPS.
3. Confirm Cloudflare tunnel ingress hosts still correct after monorepo move (`frontend/` run path).

**Acceptance**

- [ ] Topology diagram text + host table.
- [ ] Callback URLs listed for Duitku + Xendit disbursement (no secrets).

---

### PROD-A40 — Frontend monorepo runbook alignment

| Field | Value |
| ----- | ----- |
| Priority | P1 |
| Paths | root `README.md`, `frontend/.env.example`, tunnel process docs |

**Do**

1. Ensure docs say `cd frontend && npm run dev|build|start` (or root proxy scripts).
2. Document required env for API-live FE without secrets.
3. Verify production Next process is started from `frontend/` after rebuild.

**Acceptance**

- [ ] Fresh clone instructions work for FE + BE.
- [ ] No broken paths to old root `package.json` for Next.

---

### PROD-A50 — Evidence skeleton + status board bootstrap

| Field | Value |
| ----- | ----- |
| Priority | P0 |

**Do**

1. Create `TASK/PROD/evidence/.gitkeep` structure.
2. Ensure `09-EXECUTION-STATUS.md` lists all PROD-* IDs as `pending`.

**Acceptance**

- [ ] Board matches tasks in phase files A–G.

---

## Phase A exit criteria

- [ ] A10–A20 done (P0).
- [ ] Fake providers still work on `APP_ENV=local`.
- [ ] Staging fail-closed tests exist even if real keys not yet injected.
