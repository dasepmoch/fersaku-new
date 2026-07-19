# E2E-06 evidence (re-run)
- Date: 2026-07-19
- Agent: opencode
- Base URL: FE http://127.0.0.1:3000 · API http://127.0.0.1:18080
- Result: **pass**

## Steps
| Step | Result | Notes |
|------|--------|-------|
| Intent from E2E-05 | pass | `pi_01KXX65BTP461D4ZBWZ1K2T8HG` PENDING |
| Signed Duitku callback resultCode=00 | pass | HTTP **200 OK** |
| Intent after callback | pass | **PAID** · order `ORD-BWZ1K2T8HF` |
| Settlements | pass | **1** |
| Replay callback | pass | 200 OK · settlements still **1** |
| Browser success route | pass | `/orders/ORD-BWZ1K2T8HF/success?total=50000` |

## Chain
```
checkout intent (DUITKU PENDING) → signed webhook → PAID → settlement×1 → replay idempotent
```

## Screenshots
- `success.png`, `final.png`

## Secrets check
- [x] no api keys / signatures / cookies
