# 03 — Phase B: Duitku payment (QRIS)

**Depends on:** Phase A (A10, A20)  
**Unblocks:** FE checkout live (Phase D), quality canary (Phase F)

---

## Outcomes

1. `ports.QRISProvider` implemented by Duitku adapter (create / get / cancel|expire as supported).
2. Inbound Duitku webhook verifies authenticity, applies payment state idempotently, drives ledger.
3. Hosted checkout + gateway create QRIS through Duitku when `PAYMENT_PROVIDER=duitku`.
4. Xendit payment webhook no longer receives new production traffic (unwired or rejected with metric).

---

## Tasks

### PROD-B10 — Duitku adapter (unit-tested)

| Field | Value |
| ----- | ----- |
| Priority | P0 |
| Depends | A20 |
| Paths | `backend/internal/adapters/duitku/` (new), wire in `app.go` |

**Do**

1. Package `adapters/duitku` implementing `ports.QRISProvider`.
2. Sandbox HTTP client: timeouts, no raw body logs, classified `ProviderError`.
3. Map Duitku statuses → domain statuses (see `01` §6).
4. Fake implementation remains for local (`PAYMENT_PROVIDER=fake`).
5. Unit tests: success create, auth failure, timeout/unknown, status mapping.

**Acceptance**

- [x] `go test ./internal/adapters/duitku/...` green.
- [x] No import of adapter from domain packages.
- [x] Evidence with redacted request/response samples (no API keys).

**Duitku API notes (implementer must verify against current Duitku docs)**

- Merchant code + API key signature rules for inquiry/create.
- QRIS method code from `DUITKU_QRIS_PAYMENT_METHOD`.
- Prefer merchantOrderId = Fersaku payment intent / external id for correlation.

---

### PROD-B20 — Webhook ingress `POST /v1/webhooks/duitku`

| Field | Value |
| ----- | ----- |
| Priority | P0 |
| Depends | B10 |
| Paths | `handlers/`, `router.go`, OpenAPI, application payment callback service |

**Do**

1. Mount routes: `/v1/webhooks/duitku` (+ optional `/sandbox` `/live` if mode split needed).
2. Auth: validate Duitku callback signature / merchant identity (document exact algorithm in evidence).
3. Bounded body; constant-time compares where applicable.
4. Idempotent apply via existing payment callback pipeline (reuse patterns from Xendit payment callback).
5. Persist provider event with `provider=duitku`.
6. OpenAPI security scheme + path docs.
7. Integration tests: good callback → PAID; bad signature → 401; replay → no double credit.

**Acceptance**

- [ ] Integration test tags green with fake clock/DB.
- [ ] Double callback does not double ledger credit.
- [ ] Admin provider-callback list can show duitku events (if admin read path is generic).

---

### PROD-B30 — Wire checkout + gateway create to Duitku provider

| Field | Value |
| ----- | ----- |
| Priority | P0 |
| Depends | B10, B20 |

**Do**

1. Composition: when `PAYMENT_PROVIDER=duitku`, inject Duitku QRIS provider into checkout + gateway services.
2. Ensure fee snapshot / intent creation unchanged (only provider edge changes).
3. Return QR string/image fields FE already expects (mapper-stable).
4. Integration: create intent → provider ref stored → callback → order PAID → balance.

**Acceptance**

- [x] Hosted checkout path integration green (fake or sandbox).
- [x] Gateway sandbox create path green if in scope.
- [x] No FE contract break (OpenAPI + FE schemas).

Unit + composition identity tests green; full DB integration skipped when `DATABASE_URL` unset (see evidence).

---

### PROD-B40 — Unwire Xendit as payment (QRIS) primary

| Field | Value |
| ----- | ----- |
| Priority | P1 |
| Depends | B30 |

**Do**

1. Stop selecting Xendit for `QRISProvider` on non-local when payment=duitku.
2. Leave disbursement Xendit intact.
3. Options (pick one in evidence):
   - **A (preferred):** keep Xendit QRIS code but unreferenced;
   - **B:** payment webhook returns 410/404 with metric `xendit_payment_webhook_rejected`.
4. Update security grep/docs that forbade Duitku (invert: Duitku payment required, Xendit payment optional/dead).

**Acceptance**

- [x] No production path creates Xendit QRIS when `PAYMENT_PROVIDER=duitku`.
- [x] Disbursement still uses Xendit.
- [x] Docs/ADR-0008 consistency check.
- [x] Option A (Xendit QRIS code kept, unreferenced when payment=duitku). Evidence: `evidence/PROD-B40/20260719-opencode.md`.

---

### PROD-B50 — Sandbox manual proof (optional same PR)

| Field | Value |
| ----- | ----- |
| Priority | P1 |
| Depends | B30 |

**Do**

1. With keys from host secret (not git), run one sandbox QRIS payment.
2. Capture: intent id, provider ref, callback receipt, order status, ledger entry ids (redact PII).
3. Evidence only — no secret material.

**Acceptance**

- [ ] Evidence shows PAID + single ledger credit.

---

## Phase B exit criteria

- [ ] B10–B30 done.
- [ ] Sandbox or integration proof of pay → credit.
- [ ] Xendit no longer primary QRIS creator.
