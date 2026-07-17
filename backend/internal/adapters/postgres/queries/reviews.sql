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

-- SEL-270 seller store-scoped review list/summary/reply/report.

-- name: SellerReviewUserCanAccessStore :one
SELECT EXISTS (
    SELECT 1
    FROM stores s
    JOIN merchant_members mm ON mm.merchant_id = s.merchant_id
    WHERE s.id = $1
      AND mm.user_id = $2
      AND mm.status = 'ACTIVE'
) AS ok;

-- name: SellerReviewUserIsPlatformAdmin :one
SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = $1
      AND r.archived_at IS NULL
      AND r.code IN ('SUPER_ADMIN', 'ADMIN_SUPPORT')
) AS ok;

-- name: SellerReviewListByStore :many
SELECT
    r.id,
    r.store_id,
    r.merchant_id,
    r.product_id,
    r.order_id,
    r.order_item_id,
    r.buyer_user_id,
    r.rating,
    r.title,
    r.body,
    r.status,
    r.verified_purchase,
    r.content_version,
    r.created_at,
    r.updated_at,
    p.title::text AS product_title,
    s.name::text AS store_name,
    COALESCE(
        NULLIF(trim(o.buyer_name), ''),
        NULLIF(trim(u.name), ''),
        'Pembeli'
    )::text AS buyer_display,
    COALESCE(rep.body, '')::text AS seller_reply_body,
    rep.content_version AS reply_content_version
FROM product_reviews r
JOIN products p ON p.id = r.product_id
JOIN stores s ON s.id = r.store_id
JOIN orders o ON o.id = r.order_id
LEFT JOIN users u ON u.id = r.buyer_user_id
LEFT JOIN product_review_replies rep ON rep.review_id = r.id
WHERE r.store_id = $1
  AND r.status <> 'REMOVED'
  AND (
    sqlc.narg('status')::text IS NULL
    OR r.status = sqlc.narg('status')::text
  )
  AND (
    sqlc.narg('rating')::int IS NULL
    OR r.rating = sqlc.narg('rating')::int
  )
  AND (
    sqlc.narg('q')::text IS NULL
    OR r.title ILIKE '%' || sqlc.narg('q')::text || '%'
    OR r.body ILIKE '%' || sqlc.narg('q')::text || '%'
    OR p.title ILIKE '%' || sqlc.narg('q')::text || '%'
    OR COALESCE(o.buyer_name, '') ILIKE '%' || sqlc.narg('q')::text || '%'
  )
ORDER BY r.created_at DESC, r.id DESC
LIMIT $2;

-- name: SellerReviewSummaryByStore :one
SELECT
    COUNT(*)::bigint AS count,
    COALESCE(AVG(rating), 0)::float8 AS average_rating,
    COUNT(*) FILTER (WHERE rating = 1)::bigint AS rating1,
    COUNT(*) FILTER (WHERE rating = 2)::bigint AS rating2,
    COUNT(*) FILTER (WHERE rating = 3)::bigint AS rating3,
    COUNT(*) FILTER (WHERE rating = 4)::bigint AS rating4,
    COUNT(*) FILTER (WHERE rating = 5)::bigint AS rating5
FROM product_reviews
WHERE store_id = $1 AND status = 'PUBLISHED';

-- name: SellerReviewGetByStoreAndID :one
SELECT id, store_id, merchant_id, product_id, order_id, order_item_id, buyer_user_id,
       rating, title, body, status, verified_purchase, content_version, created_at, updated_at
FROM product_reviews
WHERE id = $1 AND store_id = $2 AND status <> 'REMOVED';

-- name: SellerReviewReplyInsert :one
INSERT INTO product_review_replies (
    id, review_id, store_id, author_user_id, body, content_version, created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, 1, $6, $6
)
RETURNING id, review_id, store_id, author_user_id, body, content_version, created_at, updated_at;

-- name: SellerReviewReplyUpdate :one
UPDATE product_review_replies
SET body = $3,
    content_version = content_version + 1,
    updated_at = $4
WHERE review_id = $1
  AND store_id = $2
  AND content_version = $5
RETURNING id, review_id, store_id, author_user_id, body, content_version, created_at, updated_at;

-- name: SellerReviewReportInsert :one
INSERT INTO product_review_reports (
    id, review_id, reporter_user_id, reason_code, context, status, created_at
) VALUES (
    $1, $2, $3, $4, $5, 'OPEN', $6
)
RETURNING id, review_id, reporter_user_id, reason_code, context, status, created_at;

-- name: SellerReviewReportGetByDedupe :one
SELECT id, review_id, reporter_user_id, reason_code, context, status, created_at
FROM product_review_reports
WHERE review_id = $1
  AND reporter_user_id = $2
  AND reason_code = $3;
