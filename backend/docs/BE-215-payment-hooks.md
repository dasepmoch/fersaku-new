# BE-215 → BE-310/330 payment conversion hooks

Coupon reservation foundation is complete in BE-215. Full hosted checkout
payment intent creation (BE-310) and Xendit finalization (BE-330) should call
these application APIs inside the same DB transaction as order/payment updates.

## Lock order (documented)

1. `SELECT … FOR UPDATE` on `coupons` row (`LockCouponForReserve`)
2. Check window/state/scope/minimum/global + per-buyer limits
3. Insert `coupon_reservations` (unique on `(coupon_id, order_id)` and
 `(coupon_id, idempotency_key)`)
4. Adjust `reserved_count` (+1)
5. (BE-310) create order + payment intent + fee snapshot + idempotency record

## Hooks

| Method | When | Effect |
|--------|------|--------|
| `CouponService.Quote` | Pre-checkout price preview | No slot taken; client `discount` ignored |
| `CouponService.Reserve` | Checkout intent create | RESERVED hold; idempotent by key |
| `CouponService.MarkReservationHeldUnknown` | Provider UNKNOWN_OUTCOME | RESERVED → HELD_UNKNOWN (retain slot) |
| `CouponService.ConvertReservationToRedemption` | Verified PAID finalization | RESERVED/HELD_UNKNOWN → CONSUMED + immutable `coupon_redemptions`; reserved−1, redeemed+1 |
| `CouponService.ReleaseReservation` | Verified unpaid cancel/expire/abandon | RESERVED/HELD_UNKNOWN → RELEASED; reserved−1 |
| `CouponService.ExpireReservations` | Worker job `coupon_reservation.expire` | Releases expired RESERVED only; **must not** blind-release when payment is UNKNOWN/PENDING (BE-310 wires payment lookup first) |

## Late paid reclaim (BE-330)

If a reservation was RELEASED after abandon TTL but a verified late PAID arrives
for the same order, BE-330 may exceptionally reclaim beyond the nominal limit
and record/alert overage rather than changing paid amount. That path is **not**
implemented in BE-215 (`Convert` rejects RELEASED).

## Money rules (already enforced)

- Integer IDR or bps percent only; half-up percent math
- Tip / upsell (non-eligible) never discounted
- `gross = merchandise - discount + tip + upsell` never negative
- Seller-funded discount reduces gross before platform fee (fee calc in BE-300/310)
