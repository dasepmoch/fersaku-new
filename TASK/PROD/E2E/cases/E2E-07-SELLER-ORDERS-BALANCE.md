# E2E-07 — Seller orders + balance after paid (browser)

| Field | Value |
|-------|--------|
| ID | E2E-07 |
| Priority | P0 |
| Type | Real browser |
| Depends | E2E-06, E2E-02 |

## Steps

1. Login as seller seed
2. Open orders list — find order from E2E-06 (by order number/id)
3. Open order detail — payment PAID visible
4. Open finance/balance/withdrawals area — available balance reflects credit (or document delay policy)
5. Screenshot order detail + finance

## Expected

- Order visible to owning seller only
- Status paid/fulfilled path consistent with API
- Balance not zero if policy immediate available (local ForceImmediateRelease)

## Fail if

- Order missing for owner
- Shows as unpaid while API PAID

## Evidence

`evidence/E2E-07/`
