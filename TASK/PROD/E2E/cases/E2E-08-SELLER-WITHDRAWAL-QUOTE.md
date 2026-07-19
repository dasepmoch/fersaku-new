# E2E-08 — Seller withdrawal quote UI (browser)

| Field | Value |
|-------|--------|
| ID | E2E-08 |
| Priority | P0 |
| Type | Real browser |
| Depends | E2E-07 |

## Goal

Seller can open withdrawal flow and get a **server quote** (min Rp50.000, fee breakdown).  
**Do not** require successful live bank payout.

## Steps

1. Login seller
2. Open `/dashboard/withdrawals/new` (or app path)
3. Select seeded bank account if required
4. Enter amount ≥ 50000 (within available balance)
5. Request quote — UI shows platform fee + provider fee + net
6. Screenshot quote
7. Optional: submit create only if env uses fake disbursement **or** stop at quote for xendit sandbox safety
8. Document choice in evidence

## Expected

- Quote API success or clear insufficient-balance error
- Min amount enforced
- No UI redesign; existing form states only

## Fail if

- Client-side fee math differs from server without display of server numbers
- Crash on open

## Non-goals

- Live Xendit bank credit (G40 / C30 policy)

## Evidence

`evidence/E2E-08/`
