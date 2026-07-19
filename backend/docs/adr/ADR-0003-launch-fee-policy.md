# ADR-0003: Launch fee policy LAUNCH_FEE_POLICY_V1 (immutable via admin)

| Field | Value |
| ------ | ---------- |
| Status | Accepted |
| Date | 2026-07-16 |
| Task | BE-000 |

## Context

Platform revenue at launch is transaction and withdrawal fees only. Money must be whole-rupiah `int64` IDR with one rounding rule. Admin fee UI is preview/read of the active version, not a numeric publisher. Future fee changes must be product-controlled releases, not routine settings mutations.

References: `docs/BACKEND_PRODUCTION_TASKS.md` §0.3, §4.7, §15 BE-000, §16; `docs/BACKEND_HANDOFF.md` domain invariants.

## Decision

1. **Policy id:** `LAUNCH_FEE_POLICY_V1`, scope `GLOBAL` only at launch (no merchant override, no buyer surcharge).
2. **Transaction fee (storefront and QRIS API identical):**
 ```text
 transaction_percent = round_half_up(gross_amount * 300 / 10_000)
 transaction_fee = transaction_percent + 700
 merchant_net_credit = gross_amount - transaction_fee
 ```
 - `transaction_percent_bps = 300` (3%)
 - `transaction_fixed_idr = 700`
 - For non-negative IDR integers: checked arithmetic `(gross * 300 + 5_000) / 10_000`; reject overflow before multiplication.
3. **Withdrawal fee:**
 ```text
 withdrawal_percent = round_half_up(withdrawal_amount * 300 / 10_000)
 withdrawal_fee = withdrawal_percent + xendit_processing_fee
 net_disbursement = withdrawal_amount - withdrawal_fee
 ```
 - `withdrawal_percent_bps = 300`
 - `minimum_withdrawal_idr = 50_000`
 - `xendit_processing_fee` from verified Xendit quote/response; versioned schedule fallback only via release artifact, not admin free fields.
 - `amount` is merchant wallet debit, not target net; reject below minimum and non-positive net.
4. **Money representation:** all API/domain/DB/journal amounts are `int64` whole rupiah (IDR has zero fractional digits). Reject float/decimal JSON, fractional input, amount `<= 0`, negative fee components, or net `<= 0` before provider call or ledger post.
5. **Fee basis:** `gross_amount` is the payment-intent amount after price/discount validation, before platform fee. Seller-funded discount reduces gross before fee; platform-funded discount is a separate component and must not make merchant net negative.
6. **Immutability:** app/admin DB roles cannot insert/update/delete `fee_schedules`. Launch values are checksum-verified migration/release seed. Admin may preview with the production calculator and read the active policy version only.
7. **Future change:** requires approved product ADR, new policy version, effective time, immutable seed/migration, regression tests, controlled deployment. Already-created payment/withdrawal snapshots keep their prior version.

### Launch payment amount bounds (effective-dated, approved here)

| Bound | Value (IDR whole) | Notes |
| ----- | ----------------: | ----- |
| `minimum_payment_idr` | `1_000` | Practical floor; always yields positive net under V1 fee |
| `maximum_payment_idr` | `100_000_000` | Launch single-intent ceiling; effective-dated platform setting |

Reject `gross <= 0`, `gross < minimum_payment_idr`, `gross > maximum_payment_idr`, or `gross - transaction_fee <= 0`. Bound changes require versioned release, not admin free edit.

### Mandatory test vectors

| Case | Nominal | Fee | Net |
| ---- | ------: | --: | --: |
| Storefront paid | 100_000 | 3_700 | 96_300 |
| QRIS API paid | 250_000 | 8_200 | 241_800 |
| Withdrawal, provider fee 2_500 | 100_000 | 5_500 | 94_500 |
| Withdrawal minimum | 50_000 | 3% + provider | amount − fee |

Also test boundaries: `fee == gross`, `fee > gross`, max `int64` overflow rejection, malformed decimals.

## Consequences

- Fee calculator is a single pure implementation shared by checkout, gateway, ledger posting, and admin preview.
- Snapshots travel unchanged through callback, settlement, and ledger.
- Provider fee delta after a locked quote is absorbed/recorded as `PLATFORM_PROVIDER_SUBSIDY` with audit/alert; merchant net/history is not silently rewritten.

## References

- BACKEND_PRODUCTION_TASKS §0.3, §4.7, §15 BE-000, §16 (Launch fee invariant)
