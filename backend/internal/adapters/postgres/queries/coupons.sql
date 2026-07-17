-- BE-215 coupon / reservation / redemption queries.

-- name: CouponGetStoreByID :one
SELECT id, merchant_id, slug, name, bio, address, accent_color, status, is_canonical,
       storefront_revision, published_revision, published_revision_id,
       created_at, updated_at
FROM stores
WHERE id = $1;

-- name: CouponUserCanAccessStore :one
SELECT EXISTS (
    SELECT 1
    FROM stores s
    JOIN merchant_members mm ON mm.merchant_id = s.merchant_id
    WHERE s.id = $1
      AND mm.user_id = $2
      AND mm.status = 'ACTIVE'
) AS ok;

-- name: CouponUserIsPlatformAdmin :one
SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = $1
      AND r.archived_at IS NULL
      AND r.code IN ('SUPER_ADMIN', 'ADMIN_SUPPORT')
) AS ok;

-- name: CouponProductOwnedByStore :one
SELECT EXISTS (
    SELECT 1 FROM products
    WHERE id = $1 AND store_id = $2
) AS ok;

-- name: CouponGetProductPrice :one
SELECT price_idr, status
FROM products
WHERE id = $1 AND store_id = $2;

-- name: InsertCoupon :exec
INSERT INTO coupons (
    id, store_id, merchant_id, code_display, normalized_code, code_hash,
    discount_kind, discount_value, min_merchandise_idr,
    max_total_uses, max_per_customer_uses, starts_at, ends_at,
    state, scope, version, policy_version, reserved_count, redeemed_count,
    created_by, created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9,
    $10, $11, $12, $13,
    $14, $15, $16, $17, $18, $19,
    $20, $21, $22
);

-- name: UpdateCoupon :execrows
UPDATE coupons
SET code_display = $2,
    normalized_code = $3,
    code_hash = $4,
    discount_kind = $5,
    discount_value = $6,
    min_merchandise_idr = $7,
    max_total_uses = $8,
    max_per_customer_uses = $9,
    starts_at = $10,
    ends_at = $11,
    state = $12,
    scope = $13,
    version = $14,
    policy_version = $15,
    updated_at = $16
WHERE id = $1 AND store_id = $17 AND version = $18;

-- name: GetCouponByID :one
SELECT id, store_id, merchant_id, code_display, normalized_code, code_hash,
       discount_kind, discount_value, min_merchandise_idr,
       max_total_uses, max_per_customer_uses, starts_at, ends_at,
       state, scope, version, policy_version, reserved_count, redeemed_count,
       created_by, created_at, updated_at
FROM coupons
WHERE id = $1 AND store_id = $2;

-- name: GetCouponByNormalizedCode :one
SELECT id, store_id, merchant_id, code_display, normalized_code, code_hash,
       discount_kind, discount_value, min_merchandise_idr,
       max_total_uses, max_per_customer_uses, starts_at, ends_at,
       state, scope, version, policy_version, reserved_count, redeemed_count,
       created_by, created_at, updated_at
FROM coupons
WHERE store_id = $1 AND normalized_code = $2;

-- name: ListCouponsByStore :many
SELECT id, store_id, merchant_id, code_display, normalized_code, code_hash,
       discount_kind, discount_value, min_merchandise_idr,
       max_total_uses, max_per_customer_uses, starts_at, ends_at,
       state, scope, version, policy_version, reserved_count, redeemed_count,
       created_by, created_at, updated_at
FROM coupons
WHERE store_id = $1
ORDER BY created_at DESC, id DESC;

-- name: LockCouponForReserve :one
SELECT id, store_id, merchant_id, code_display, normalized_code, code_hash,
       discount_kind, discount_value, min_merchandise_idr,
       max_total_uses, max_per_customer_uses, starts_at, ends_at,
       state, scope, version, policy_version, reserved_count, redeemed_count,
       created_by, created_at, updated_at
FROM coupons
WHERE id = $1
FOR UPDATE;

-- name: AdjustCouponCounters :exec
UPDATE coupons
SET reserved_count = reserved_count + sqlc.arg(reserved_delta),
    redeemed_count = redeemed_count + sqlc.arg(redeemed_delta),
    updated_at = now()
WHERE id = sqlc.arg(id)
  AND reserved_count + sqlc.arg(reserved_delta) >= 0
  AND redeemed_count + sqlc.arg(redeemed_delta) >= 0;

-- name: CountBuyerCouponUsage :one
SELECT COUNT(*)::bigint AS n
FROM coupon_reservations
WHERE coupon_id = $1
  AND buyer_identity_hash = $2
  AND state IN ('RESERVED', 'HELD_UNKNOWN', 'CONSUMED');

-- name: DeleteCouponProductScopes :exec
DELETE FROM coupon_product_scopes WHERE coupon_id = $1;

-- name: InsertCouponProductScope :exec
INSERT INTO coupon_product_scopes (coupon_id, product_id, store_id)
VALUES ($1, $2, $3);

-- name: ListCouponProductScopes :many
SELECT product_id FROM coupon_product_scopes WHERE coupon_id = $1 ORDER BY product_id;

-- name: InsertCouponReservation :exec
INSERT INTO coupon_reservations (
    id, coupon_id, coupon_policy_version, store_id, order_id, idempotency_key,
    buyer_identity_hash, product_id, discount_kind, discount_value, discount_idr,
    eligible_subtotal_idr, merchandise_idr, tip_idr, upsell_idr, gross_idr,
    code_snapshot, state, expires_at, created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10, $11,
    $12, $13, $14, $15, $16,
    $17, $18, $19, $20, $21
);

-- name: GetCouponReservationByID :one
SELECT id, coupon_id, coupon_policy_version, store_id, order_id, idempotency_key,
       buyer_identity_hash, product_id, discount_kind, discount_value, discount_idr,
       eligible_subtotal_idr, merchandise_idr, tip_idr, upsell_idr, gross_idr,
       code_snapshot, state, expires_at, consumed_at, released_at, created_at, updated_at
FROM coupon_reservations
WHERE id = $1;

-- name: GetCouponReservationByIdempotency :one
SELECT id, coupon_id, coupon_policy_version, store_id, order_id, idempotency_key,
       buyer_identity_hash, product_id, discount_kind, discount_value, discount_idr,
       eligible_subtotal_idr, merchandise_idr, tip_idr, upsell_idr, gross_idr,
       code_snapshot, state, expires_at, consumed_at, released_at, created_at, updated_at
FROM coupon_reservations
WHERE coupon_id = $1 AND idempotency_key = $2;

-- name: GetCouponReservationByOrder :one
SELECT id, coupon_id, coupon_policy_version, store_id, order_id, idempotency_key,
       buyer_identity_hash, product_id, discount_kind, discount_value, discount_idr,
       eligible_subtotal_idr, merchandise_idr, tip_idr, upsell_idr, gross_idr,
       code_snapshot, state, expires_at, consumed_at, released_at, created_at, updated_at
FROM coupon_reservations
WHERE coupon_id = $1 AND order_id = $2;

-- name: UpdateCouponReservationState :execrows
UPDATE coupon_reservations
SET state = $2,
    consumed_at = CASE WHEN $2 = 'CONSUMED' THEN $3 ELSE consumed_at END,
    released_at = CASE WHEN $2 = 'RELEASED' THEN $3 ELSE released_at END,
    updated_at = $3
WHERE id = $1 AND state = $4;

-- name: ListExpiredCouponReservations :many
SELECT id, coupon_id, coupon_policy_version, store_id, order_id, idempotency_key,
       buyer_identity_hash, product_id, discount_kind, discount_value, discount_idr,
       eligible_subtotal_idr, merchandise_idr, tip_idr, upsell_idr, gross_idr,
       code_snapshot, state, expires_at, consumed_at, released_at, created_at, updated_at
FROM coupon_reservations
WHERE state = 'RESERVED' AND expires_at <= $1
ORDER BY expires_at ASC
LIMIT $2;

-- name: InsertCouponRedemption :exec
INSERT INTO coupon_redemptions (
    id, reservation_id, coupon_id, coupon_policy_version, store_id, order_id,
    code_snapshot, discount_kind, discount_value, discount_idr,
    eligible_subtotal_idr, merchandise_idr, tip_idr, upsell_idr, gross_idr,
    buyer_identity_hash, product_id, created_at
) VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10,
    $11, $12, $13, $14, $15,
    $16, $17, $18
);

-- name: GetCouponRedemptionByReservation :one
SELECT id, reservation_id, coupon_id, coupon_policy_version, store_id, order_id,
       code_snapshot, discount_kind, discount_value, discount_idr,
       eligible_subtotal_idr, merchandise_idr, tip_idr, upsell_idr, gross_idr,
       buyer_identity_hash, product_id, created_at
FROM coupon_redemptions
WHERE reservation_id = $1;
