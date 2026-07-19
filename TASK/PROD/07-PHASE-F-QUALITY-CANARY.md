# 07 — Phase F: Quality gates & canary

**Depends on:** B30, C20, D20–D30, E10

---

## Outcomes

1. Minimum quality cells closed with evidence (not just parent harness).
2. Integration G-gates relevant to money/auth closed or explicitly deferred with owner.
3. Sandbox canary script run once; live canary blocked on owner sign (Phase G).

---

## Tasks

### PROD-F10 — Close auth/session cell

| Priority | P0 |

**Do**

1. Register/login/logout seller; admin login; buyer magic if enabled.
2. CSRF refresh; session revoke.
3. Evidence + link from `09`.

**Acceptance**

- [ ] Checklist complete; no MFA required anywhere.

---

### PROD-F20 — Close checkout-order cell

| Priority | P0 |
| Depends | B30, D20 |

**Do**

1. Create checkout → pending → Duitku paid callback → success delivery path.
2. Expired/failed paths.
3. Idempotent callback.
4. Update old G5-style gate as satisfied for PROD program.

**Acceptance**

- [ ] Automated and/or scripted proof in evidence.

---

### PROD-F30 — Close seller-finance cell

| Priority | P0 |
| Depends | C20, D30 |

**Do**

1. Balance reflects paid order.
2. Withdrawal quote/create/webhook.
3. Isolation across merchants.

**Acceptance**

- [ ] Two-merchant isolation test or documented manual isolation.

---

### PROD-F40 — Sandbox canary runbook execution

| Priority | P0 |
| Depends | F20, F30 |

**Do**

1. Write `TASK/PROD/evidence/PROD-F40/canary-sandbox.md` following `backend/docs/launch/canary-rollback.md` adapted for Duitku+Xendit.
2. Execute once on sandbox.
3. Record metrics: success, latency, errors; rollback steps dry-run.

**Acceptance**

- [ ] Canary doc signed by executor agent/human name + timestamp.
- [ ] Rollback steps verified as documented (image pin / env flip).

---

### PROD-F50 — FE mock mode regression

| Priority | P1 |

**Do**

1. `DATA_SOURCE=mock` smoke still passes critical prototype paths.
2. Ensures dual-mode not broken.

**Acceptance**

- [ ] Mock e2e smoke or manual checklist.

---

## Phase F exit criteria

- [ ] F10–F40 done.
- [ ] Open residual gates listed in `09` with owner.
