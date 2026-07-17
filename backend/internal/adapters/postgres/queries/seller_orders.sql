-- SEL-250 seller store-scoped order list/detail (no delivery secrets).

-- name: SellerOrderUserCanAccessStore :one
SELECT EXISTS (
    SELECT 1
    FROM stores s
    JOIN merchant_members mm ON mm.merchant_id = s.merchant_id
    WHERE s.id = $1
      AND mm.user_id = $2
      AND mm.status = 'ACTIVE'
) AS ok;

-- name: SellerOrderUserIsPlatformAdmin :one
SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = $1
      AND r.archived_at IS NULL
      AND r.code IN ('SUPER_ADMIN', 'ADMIN_SUPPORT')
) AS ok;

-- name: SellerOrderCountByStore :one
SELECT COUNT(*)::bigint AS total
FROM orders o
WHERE o.store_id = $1
  AND (
    sqlc.narg('status')::text IS NULL OR o.payment_status = sqlc.narg('status')::text
  )
  AND (
    sqlc.narg('source')::text IS NULL OR o.source = sqlc.narg('source')::text
  )
  AND (
    sqlc.narg('from_ts')::timestamptz IS NULL OR o.created_at >= sqlc.narg('from_ts')::timestamptz
  )
  AND (
    sqlc.narg('to_ts')::timestamptz IS NULL OR o.created_at < sqlc.narg('to_ts')::timestamptz
  )
  AND (
    sqlc.narg('q')::text IS NULL
    OR o.order_number ILIKE '%' || sqlc.narg('q')::text || '%'
    OR o.buyer_name ILIKE '%' || sqlc.narg('q')::text || '%'
    OR o.buyer_email ILIKE '%' || sqlc.narg('q')::text || '%'
    OR EXISTS (
      SELECT 1 FROM order_items oi
      WHERE oi.order_id = o.id
        AND oi.product_title ILIKE '%' || sqlc.narg('q')::text || '%'
    )
  );

-- name: SellerOrderListByStore :many
SELECT
  o.id,
  o.order_number,
  o.store_id,
  o.merchant_id,
  o.buyer_name,
  o.buyer_email,
  o.payment_status,
  o.source,
  o.currency,
  o.subtotal_idr,
  o.discount_idr,
  o.tip_idr,
  o.fee_idr,
  o.gross_idr,
  o.merchant_net_idr,
  o.paid_at,
  o.created_at,
  o.updated_at,
  COALESCE((
    SELECT oi.product_title::text
    FROM order_items oi
    WHERE oi.order_id = o.id
    ORDER BY oi.created_at ASC, oi.id ASC
    LIMIT 1
  ), '')::text AS product_title,
  COALESCE((
    SELECT g.status::text
    FROM delivery_grants g
    WHERE g.order_id = o.id
    ORDER BY g.created_at ASC, g.id ASC
    LIMIT 1
  ), '')::text AS delivery_status
FROM orders o
WHERE o.store_id = $1
  AND (
    sqlc.narg('status')::text IS NULL OR o.payment_status = sqlc.narg('status')::text
  )
  AND (
    sqlc.narg('source')::text IS NULL OR o.source = sqlc.narg('source')::text
  )
  AND (
    sqlc.narg('from_ts')::timestamptz IS NULL OR o.created_at >= sqlc.narg('from_ts')::timestamptz
  )
  AND (
    sqlc.narg('to_ts')::timestamptz IS NULL OR o.created_at < sqlc.narg('to_ts')::timestamptz
  )
  AND (
    sqlc.narg('q')::text IS NULL
    OR o.order_number ILIKE '%' || sqlc.narg('q')::text || '%'
    OR o.buyer_name ILIKE '%' || sqlc.narg('q')::text || '%'
    OR o.buyer_email ILIKE '%' || sqlc.narg('q')::text || '%'
    OR EXISTS (
      SELECT 1 FROM order_items oi
      WHERE oi.order_id = o.id
        AND oi.product_title ILIKE '%' || sqlc.narg('q')::text || '%'
    )
  )
ORDER BY o.created_at DESC, o.id DESC
LIMIT $2 OFFSET $3;

-- name: SellerOrderStatusCounts :many
SELECT o.payment_status, COUNT(*)::bigint AS cnt
FROM orders o
WHERE o.store_id = $1
GROUP BY o.payment_status;

-- name: SellerOrderGetByStore :one
SELECT
  o.id,
  o.order_number,
  o.store_id,
  o.merchant_id,
  o.buyer_user_id,
  o.buyer_name,
  o.buyer_email,
  o.payment_status,
  o.source,
  o.currency,
  o.subtotal_idr,
  o.discount_idr,
  o.tip_idr,
  o.fee_idr,
  o.gross_idr,
  o.merchant_net_idr,
  o.coupon_code,
  o.coupon_version,
  o.paid_at,
  o.created_at,
  o.updated_at
FROM orders o
WHERE o.store_id = $1
  AND (o.id = $2 OR o.order_number = $2);

-- name: SellerOrderListItems :many
SELECT id, order_id, store_id, merchant_id, product_id, product_version, product_title,
       product_type, unit_price_idr, quantity, line_subtotal_idr, discount_allocation_idr,
       line_total_idr, delivery_kind, stock_reservation_id, stock_item_id, object_id, created_at
FROM order_items
WHERE order_id = $1
ORDER BY created_at ASC, id ASC;

-- name: SellerOrderListGrants :many
SELECT id, order_id, order_item_id, store_id, merchant_id, product_id, buyer_user_id, buyer_email,
       delivery_kind, status, stock_item_id, stock_reservation_id, object_id, fulfillment_effect_key,
       max_accesses, access_count, revoked_at, revoke_reason, expires_at,
       last_accessed_at, activated_at, failed_at, fail_reason, version, created_at, updated_at
FROM delivery_grants
WHERE order_id = $1
ORDER BY created_at ASC, id ASC;

-- name: SellerOrderGetPaymentIntent :one
SELECT id, provider, provider_reference, status, source, amount_idr, paid_late, created_at, updated_at
FROM payment_intents
WHERE order_id = $1
ORDER BY created_at DESC
LIMIT 1;
