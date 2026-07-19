# 08 — Phase G: Ops, owner-sign, go-live

**Depends on:** Phase F sandbox canary  
**Live money requires human owner — agents prepare, do not silently go live**

---

## Outcomes

1. Readiness checklist completed or explicitly deferred with dates.
2. Production secrets in secret manager (not `pg.txt`).
3. HA Postgres/Redis/R2/SMTP/DNS documented and owned.
4. Residual risks signed or accepted with names.
5. Optional live canary with real small money under owner control.

---

## Tasks

### PROD-G10 — Production secrets inventory

| Priority | P0 |
| Owner | Ops + Engineering |

**Do**

1. List every secret from matrix `10` with storage location (1Password/Vault/CF/etc.).
2. Rotate any key that ever lived only in chat logs.
3. Confirm webhook URLs on Duitku + Xendit dashboards point to production hosts.

**Acceptance**

- [ ] Inventory table in evidence (values redacted).
- [ ] No secret in git.

---

### PROD-G20 — Infrastructure HA checklist

| Priority | P0 |
| Owner | Ops |

**Do**

1. Managed Postgres + PITR backups verified (restore drill date).
2. Redis TLS multi-instance if required by config.
3. R2 buckets private-by-default; lifecycle rules.
4. SMTP production.
5. Observability: `/metrics`, logs, alerts to on-call.

**Acceptance**

- [ ] Each row in readiness checklist has owner + date.
- [ ] Backup restore drill evidence (even if staging).

---

### PROD-G30 — Residual risk sign-off

| Priority | P0 |
| Owner | Security + Product |

**Do**

1. Update `backend/docs/security/residual-risks.md` for dual-provider (Duitku availability, Xendit payout).
2. Remove MFA-on-admin residual language (already scrubbed); ensure RR text matches no-MFA policy.
3. Collect signatures (or email acceptance archived in evidence).

**Acceptance**

- [ ] Sign-off table non-empty or explicit “deferred until DATE”.

---

### PROD-G40 — Live canary (owner-gated)

| Priority | P0 |
| Depends | G10–G30, F40 |
| Owner | Product + Ops |

**Do**

1. Small real payment via Duitku live.
2. Small real withdrawal via Xendit (or hold if compliance requires).
3. Watch SLO burn; rollback plan ready.

**Acceptance**

- [ ] Written go/no-go.
- [ ] Incident contact listed.

**Agent rule:** Do **not** execute G40 without explicit human “GO LIVE CANARY” message in the task claim.

---

### PROD-G50 — Program close

| Priority | P1 |
| Depends | G40 or explicit defer |

**Do**

1. Mark program complete in `09` or list remaining debt.
2. Point root README “production” section to PROD package.
3. Optional: archive note that old Xendit-only payment ADRs are historical.

**Acceptance**

- [ ] `09` board final state accurate.

---

## Phase G exit criteria

- [ ] G10–G30 done.
- [ ] G40 done **or** deferred with date + owner.
