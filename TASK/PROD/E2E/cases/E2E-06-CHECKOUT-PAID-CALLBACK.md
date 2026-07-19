# E2E-06 — Checkout PAID via Duitku callback (hybrid)

| Field | Value |
|-------|--------|
| ID | E2E-06 |
| Priority | P0 |
| Type | Browser observe + API callback (signed) |
| Depends | E2E-05 |

## Goal

Prove UI follows **server PAID** after real Duitku-signed webhook (same path as B50).

## Steps

1. From E2E-05, keep `paymentIntentId` + `external_id` + amount
2. Build Duitku callback signature:  
   `MD5(merchantCode + amount + merchantOrderId + apiKey)` (keys from host secret, never commit)
3. `POST https://api.fersaku.net/v1/webhooks/duitku` or `http://127.0.0.1:18080/v1/webhooks/duitku` with `resultCode=00`
4. Expect `200` body `OK`
5. In browser: poll/refresh checkout or success route until paid/success delivery UI
6. `GET /v1/checkout/intents/{id}` → status PAID
7. DB optional: 1 settlement, 1 grant
8. Replay callback → still single settlement

## Expected

- Intent PAID
- UI leaves pending QR (success or delivery instruction)
- No double settlement on replay

## Fail if

- UI marks paid without webhook
- Settlement count > 1 after replay
- 401 on valid signature (env keys missing)

## Safety

- Sandbox only
- Do not use LIVE keys unless G40 GO

## Evidence

`evidence/E2E-06/` — intent id, HTTP codes, screenshot success (no secrets)
