# E2E-01 evidence (re-run)
- Date: 2026-07-19
- Agent: opencode
- Base URL: http://127.0.0.1:3000
- Result: **pass**

## Steps
| Step | Result | Notes |
|------|--------|-------|
| Open `/` landing | pass | 200 · title "Fersaku — Sell digital products beautifully" · content renders |
| Open storefront `/@seed-store-a` | pass | "Seed Merchant A Store" · product listed |
| Product detail `/@seed-store-a/seed-published-product` | pass | H1 "Seed Published Product" · buy "Beli sekarang — Rp 50.000" · 3 reviews |
| No mock simulator controls | pass | bodyHasSimulate=false |
| Network hits API (not mock) | pass | `/v1/auth/session` same-origin · mockHits=[] |

## Screenshots
- `home.png`
- `storefront.png`
- `product-detail-rerun.png`

## Residuals
- Console 401 on unauthenticated `/v1/auth/session` (expected for anonymous)

## Secrets check
- [x] no keys/cookies in this file
