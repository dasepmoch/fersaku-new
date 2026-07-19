# E2E-05 — Checkout QRIS pending (browser + API)

| Field | Value |
|-------|--------|
| ID | E2E-05 |
| Priority | P0 |
| Type | Real browser (+ optional network assert) |
| Depends | E2E-00, E2E-01 |

## Goal

Buyer starts checkout and sees **pending QRIS** from live API (Duitku), not mock paid.

## Steps

1. Open seed product public page
2. Start checkout (CTA → checkout route)
3. Submit buyer email if required
4. Wait for QRIS UI: QR image and/or string / payment pending state
5. Capture network: `POST /v1/checkout/intents` → 201
6. Record `paymentIntentId`, `provider` should be **DUITKU** (from response or GET intent)
7. Confirm UI has **no** “mark as paid / simulate paid” in api/live stage
8. Screenshot QR pending page

## Expected

| Check | Pass |
|-------|------|
| Intent created | 201 |
| Status | PENDING |
| Provider | DUITKU |
| QR | visible or downloadable image URL |
| Client mark-paid | absent |

## Fail if

- Mock simulate control used to force success
- Provider still XENDIT for new intents while API env is duitku
- Checkout 500

## Evidence

IDs + screenshots in `evidence/E2E-05/`
