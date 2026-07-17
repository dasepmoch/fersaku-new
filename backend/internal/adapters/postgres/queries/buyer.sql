-- BE-430 buyer purchases list/detail (ownership via buyer_user_id).

-- name: BuyerListOrders :many
SELECT id, order_number, store_id, merchant_id, buyer_user_id, buyer_email, buyer_name,
       payment_status, source, currency, subtotal_idr, discount_idr, tip_idr, fee_idr,
       gross_idr, merchant_net_idr, coupon_code, coupon_version, paid_at, created_at, updated_at
FROM orders
WHERE buyer_user_id = $1
  AND (
    sqlc.narg('cursor_created_at')::timestamptz IS NULL
    OR (created_at, id) < (sqlc.narg('cursor_created_at')::timestamptz, sqlc.narg('cursor_id')::text)
  )
ORDER BY created_at DESC, id DESC
LIMIT $2;

-- name: BuyerGetOrderByID :one
SELECT id, order_number, store_id, merchant_id, buyer_user_id, buyer_email, buyer_name,
       payment_status, source, currency, subtotal_idr, discount_idr, tip_idr, fee_idr,
       gross_idr, merchant_net_idr, coupon_code, coupon_version, paid_at, created_at, updated_at
FROM orders
WHERE id = $1 AND buyer_user_id = $2;

-- name: BuyerListOrderItems :many
SELECT id, order_id, store_id, merchant_id, product_id, product_version, product_title,
       product_type, unit_price_idr, quantity, line_subtotal_idr, discount_allocation_idr,
       line_total_idr, delivery_kind, stock_reservation_id, stock_item_id, object_id, created_at
FROM order_items
WHERE order_id = $1
ORDER BY created_at ASC, id ASC;

-- name: BuyerListGrantsByOrder :many
SELECT id, order_id, order_item_id, store_id, merchant_id, product_id, buyer_user_id, buyer_email,
       delivery_kind, status, stock_item_id, stock_reservation_id, object_id, fulfillment_effect_key,
       access_token_hash, access_token_expires_at, max_accesses, access_count,
       recipient_snapshot, product_snapshot, revoked_at, revoke_reason, expires_at,
       last_accessed_at, activated_at, failed_at, fail_reason, version, created_at, updated_at
FROM delivery_grants
WHERE order_id = $1
ORDER BY created_at ASC, id ASC;

-- name: BuyerGetStoreName :one
SELECT id, name FROM stores WHERE id = $1;
