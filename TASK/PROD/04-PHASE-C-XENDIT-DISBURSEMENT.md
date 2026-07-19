# 04 — Phase C: Xendit disbursement (withdrawals)

**Depends on:** Phase A  
**Co-depends:** Phase B not required for unit/integration of disbursement alone; full E2E money loop needs B.

---

## Outcomes

1. Withdrawal quote/create uses real Xendit disbursement when `DISBURSEMENT_PROVIDER=xendit`.
2. Webhook `POST /v1/webhooks/xendit/disbursement` hardened and tested.
3. UNKNOWN outcomes schedule lookup; no silent merchant balance corruption.
4. Admin withdrawal review path still permission/reason/idempotency gated (no MFA).

---

## Tasks

### PROD-C10 — Harden Xendit disbursement adapter + webhook

| Field | Value |
| ----- | ----- |
| Priority | P0 |
| Paths | `backend/internal/adapters/xendit/*`, `handlers/withdrawals.go`, `router.go` |

**Do**

1. Verify real client paths for quote/create/get (not only fake).
2. Webhook: bounded body, constant-time token (`XENDIT_WEBHOOK_TOKEN`), idempotent apply.
3. Map provider statuses → withdrawal state machine.
4. Integration tests: token fail; completed credit path; failed release/lock path; replay.

**Acceptance**

- [x] Integration suite covers happy + negative webhook. *(unit full; integration skipped when DATABASE_URL unset — see evidence)*
- [x] Fail-closed when token empty on staging/production config.

---

### PROD-C20 — Withdrawal application service audit

| Field | Value |
| ----- | ----- |
| Priority | P0 |
| Depends | C10 |

**Do**

1. Trace seller create withdrawal → quote TTL → create disbursement → webhook.
2. Confirm fee snapshot rules (platform 3% + provider fee) and min Rp50.000.
3. Confirm ledger holds/releases match states.
4. Admin review transitions still enforce permissions + reason + idempotency.
5. Fix any gap where fake provider is forced even when config says xendit.

**Acceptance**

- [x] Documented sequence diagram in evidence.
- [x] Tests for min amount, insufficient balance, expired quote.
- [x] No double disbursement on retry (idempotency key).

---

### PROD-C30 — Sandbox disbursement proof

| Field | Value |
| ----- | ----- |
| Priority | P1 |
| Depends | C20 |

**Do**

1. Using host secrets, optional sandbox disbursement to a test bank account **only if** Xendit sandbox allows; otherwise integration-only evidence.
2. Redact account numbers in evidence (mask only).

**Acceptance**

- [ ] Evidence of COMPLETED or controlled FAILED handling.

---

## Phase C exit criteria

- [x] C10–C20 done.
- [x] Disbursement path independent of Duitku payment adapter.
