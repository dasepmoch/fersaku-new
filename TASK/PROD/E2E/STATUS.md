# E2E status board (real browser + live API)

| ID | Title | P | Status | Owner | Evidence |
| -- | ----- | - | ------ | ----- | -------- |
| E2E-00 | Preflight FE+API+seed | P0 | done | @opencode | `evidence/E2E-00/20260719-fullsuite.md` |
| E2E-01 | Public landing + storefront | P0 | done | @opencode | `evidence/E2E-01/20260719-fullsuite.md` |
| E2E-02 | Seller login + dashboard | P0 | done | @opencode | `evidence/E2E-02/20260719-fullsuite.md` |
| E2E-03 | Admin login + console | P0 | done | @opencode | `evidence/E2E-03/20260719-fullsuite.md` |
| E2E-04 | Buyer login | P0 | done | @opencode | `evidence/E2E-04/20260719-fullsuite.md` |
| E2E-05 | Checkout QRIS pending (UI) | P0 | done | @opencode | `evidence/E2E-05/20260719-fullsuite.md` |
| E2E-06 | Checkout PAID via Duitku callback | P0 | done | @opencode | `evidence/E2E-06/20260719-fullsuite.md` |
| E2E-07 | Seller orders + balance after paid | P0 | done | @opencode | `evidence/E2E-07/20260719-fullsuite.md` |
| E2E-08 | Seller withdrawal quote UI | P0 | done | @opencode | `evidence/E2E-08/20260719-fullsuite.md` |
| E2E-09 | Admin payments/withdrawals | P1 | done | @opencode | `evidence/E2E-09/20260719-fullsuite.md` |
| E2E-10 | Seller products CRUD smoke | P1 | done | @opencode | `evidence/E2E-10/20260719-fullsuite.md` |
| E2E-11 | Session CSRF logout | P1 | done | @opencode | `evidence/E2E-11/20260719-fullsuite.md` |
| E2E-12 | Negative auth / isolation | P1 | done | @opencode | `evidence/E2E-12/20260719-fullsuite.md` |
| E2E-13 | Mock mode regression | P2 | done | @opencode | `evidence/E2E-13/20260719-fullsuite.md` |

**Legend:** `pending` · `in_progress` · `done` · `blocked` · `failed`

**Last update:** 2026-07-19 — **FULL SUITE 14/14 PASS** (Playwright headed + API; E2E-05/06/08 re-verified after restock/bank fix)

### Full suite highlights
| Case | Proof |
|------|--------|
| E2E-05/06 | `pi_01KXXBAPZ3ATPVHHC39TCM7PSZ` DUITKU → PAID `ORD-C39TCM7PSY` settlement×1 |
| E2E-08 | quote 201 on verified bank `bank_01KXXB1DYG…` |
| E2E-10 | draft `E2E-10-FULL-*` created + listed |
| E2E-13 | dual-mode unit; :3100 mock FE not claimed (Canbot) |
