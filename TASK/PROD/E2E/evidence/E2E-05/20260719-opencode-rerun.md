# E2E-05 evidence (re-run)
- Date: 2026-07-19
- Agent: opencode
- Base URL: http://127.0.0.1:3000
- Result: **pass**

## Steps
| Step | Result | Notes |
|------|--------|-------|
| Product → checkout | pass | `/checkout/seed-published-product?store=seed-store-a` |
| Fill name + email | pass | Buyer A Seed |
| Click Bayar + wallet | pass | GoPay selected |
| POST `/v1/checkout/intents` | pass | **201** · `pi_01KXX65BTP461D4ZBWZ1K2T8HG` |
| Provider | pass | **DUITKU** · accountScope `duitku-primary` |
| Status | pass | **PENDING** |
| QR pending UI | pass | qrImageUrl + qrString present; wallet simulator chrome |
| No client mark-paid | pass | no simulate/mark-as-paid control |

## Intent (non-secret)
- paymentIntentId: `pi_01KXX65BTP461D4ZBWZ1K2T8HG`
- orderNumber: `ORD-BWZ1K2T8HF`
- providerReference: `DS3290626BVGW1Q2DX352ZOY`
- amount: 50000

## Screenshots
- `checkout-filled.png`, `qris-pending.png`

## Residuals
- Seed stock was exhausted (prior runs); restocked 5 AVAILABLE units before re-run
- UI label "QRIS PAYMENT SIMULATOR" is wallet picker chrome; live intent still DUITKU SANDBOX

## Secrets check
- [x] no keys/cookies; publicToken not recorded
