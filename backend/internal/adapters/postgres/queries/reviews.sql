-- BE-430 product reviews (verified purchase).

-- name: ReviewInsert :exec
INSERT INTO product_reviews (
    id, store_id, merchant_id, product_id, order_id, order_item_id, buyer_user_id,
    rating, title, body, status, verified_purchase, content_version, created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7,
    $8, $9, $10, $11, $12, $13, $14, $15
);

-- name: ReviewGetByID :one
SELECT id, store_id, merchant_id, product_id, order_id, order_item_id, buyer_user_id,
       rating, title, body, status, verified_purchase, content_version, created_at, updated_at
FROM product_reviews
WHERE id = $1;

-- name: ReviewGetByBuyerOrderItem :one
SELECT id, store_id, merchant_id, product_id, order_id, order_item_id, buyer_user_id,
       rating, title, body, status, verified_purchase, content_version, created_at, updated_at
FROM product_reviews
WHERE buyer_user_id = $1 AND order_item_id = $2;

-- name: ReviewUpdateContent :one
UPDATE product_reviews
SET rating = $3,
    title = $4,
    body = $5,
    content_version = content_version + 1,
    status = CASE WHEN status = 'NEEDS_EDIT' THEN 'PUBLISHED' ELSE status END,
    updated_at = $6
WHERE id = $1 AND buyer_user_id = $2 AND content_version = $7
RETURNING id, store_id, merchant_id, product_id, order_id, order_item_id, buyer_user_id,
          rating, title, body, status, verified_purchase, content_version, created_at, updated_at;

-- name: ReviewListPublicByProduct :many
SELECT id, store_id, merchant_id, product_id, order_id, order_item_id, buyer_user_id,
       rating, title, body, status, verified_purchase, content_version, created_at, updated_at
FROM product_reviews
WHERE product_id = $1
  AND status = 'PUBLISHED'
  AND (
    sqlc.narg('cursor_created_at')::timestamptz IS NULL
    OR (created_at, id) < (sqlc.narg('cursor_created_at')::timestamptz, sqlc.narg('cursor_id')::text)
  )
ORDER BY created_at DESC, id DESC
LIMIT $2;

-- name: ReviewSummaryByProduct :one
SELECT
    COUNT(*)::bigint AS count,
    COALESCE(AVG(rating), 0)::float8 AS average_rating,
    COUNT(*) FILTER (WHERE rating = 1)::bigint AS rating1,
    COUNT(*) FILTER (WHERE rating = 2)::bigint AS rating2,
    COUNT(*) FILTER (WHERE rating = 3)::bigint AS rating3,
    COUNT(*) FILTER (WHERE rating = 4)::bigint AS rating4,
    COUNT(*) FILTER (WHERE rating = 5)::bigint AS rating5
FROM product_reviews
WHERE product_id = $1 AND status = 'PUBLISHED';

-- name: ReviewGetOrderItemForBuyer :one
SELECT oi.id, oi.order_id, oi.store_id, oi.merchant_id, oi.product_id, oi.product_version,
       oi.product_title, oi.product_type, oi.unit_price_idr, oi.quantity, oi.line_subtotal_idr,
       oi.discount_allocation_idr, oi.line_total_idr, oi.delivery_kind, oi.stock_reservation_id,
       oi.stock_item_id, oi.object_id, oi.created_at,
       o.buyer_user_id, o.payment_status, o.paid_at
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
WHERE oi.id = $1 AND o.buyer_user_id = $2;

-- name: ReviewGetGrantForOrderItem :one
SELECT id, order_id, order_item_id, store_id, status, revoked_at, delivery_kind
FROM delivery_grants
WHERE order_item_id = $1;

-- name: ReviewGetReplyByReview :one
SELECT id, review_id, store_id, author_user_id, body, content_version, created_at, updated_at
FROM product_review_replies
WHERE review_id = $1;
