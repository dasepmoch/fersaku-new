-- SEL-260 seller store-scoped customer list/detail/notes (purchase-derived aggregate).
-- customer_id = encode(digest(store_id || unit-separator || lower(trim(email)), 'sha256'), 'hex')

-- name: SellerCustomerUserCanAccessStore :one
SELECT EXISTS (
    SELECT 1
    FROM stores s
    JOIN merchant_members mm ON mm.merchant_id = s.merchant_id
    WHERE s.id = $1
      AND mm.user_id = $2
      AND mm.status = 'ACTIVE'
) AS ok;

-- name: SellerCustomerUserIsPlatformAdmin :one
SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = $1
      AND r.archived_at IS NULL
      AND r.code IN ('SUPER_ADMIN', 'ADMIN_SUPPORT')
) AS ok;

-- name: SellerCustomerCountByStore :one
SELECT COUNT(*)::bigint AS total
FROM (
  SELECT lower(trim(o.buyer_email)) AS email_norm,
         (ARRAY_AGG(o.buyer_name ORDER BY COALESCE(o.paid_at, o.created_at) DESC, o.id DESC))[1] AS display_name,
         encode(digest(o.store_id || E'\x1f' || lower(trim(o.buyer_email)), 'sha256'), 'hex') AS customer_id
  FROM orders o
  WHERE o.store_id = sqlc.arg(store_id)
    AND trim(o.buyer_email) <> ''
  GROUP BY o.store_id, lower(trim(o.buyer_email))
) cust
WHERE (
  sqlc.narg(q)::text IS NULL
  OR cust.display_name ILIKE '%' || sqlc.narg(q)::text || '%'
  OR cust.email_norm ILIKE '%' || sqlc.narg(q)::text || '%'
  OR cust.customer_id ILIKE '%' || sqlc.narg(q)::text || '%'
);

-- name: SellerCustomerListByStore :many
SELECT
  encode(digest(o.store_id || E'\x1f' || lower(trim(o.buyer_email)), 'sha256'), 'hex')::text AS customer_id,
  (ARRAY_AGG(o.buyer_name ORDER BY COALESCE(o.paid_at, o.created_at) DESC, o.id DESC))[1]::text AS display_name,
  (ARRAY_AGG(o.buyer_email ORDER BY COALESCE(o.paid_at, o.created_at) DESC, o.id DESC))[1]::text AS display_email,
  COUNT(*)::bigint AS order_count,
  COALESCE(SUM(o.gross_idr), 0)::bigint AS spent_idr,
  MAX(COALESCE(o.paid_at, o.created_at))::timestamptz AS last_purchase_at,
  MIN(o.created_at)::timestamptz AS first_seen_at,
  COALESCE((
    SELECT oi.product_title::text
    FROM orders o2
    JOIN order_items oi ON oi.order_id = o2.id
    WHERE o2.store_id = o.store_id
      AND lower(trim(o2.buyer_email)) = lower(trim(o.buyer_email))
    ORDER BY COALESCE(o2.paid_at, o2.created_at) DESC, o2.id DESC, oi.created_at ASC, oi.id ASC
    LIMIT 1
  ), '')::text AS last_product_title,
  COALESCE((
    SELECT o2.gross_idr
    FROM orders o2
    WHERE o2.store_id = o.store_id
      AND lower(trim(o2.buyer_email)) = lower(trim(o.buyer_email))
    ORDER BY COALESCE(o2.paid_at, o2.created_at) DESC, o2.id DESC
    LIMIT 1
  ), 0)::bigint AS last_order_gross_idr,
  COALESCE((
    SELECT o2.payment_status::text
    FROM orders o2
    WHERE o2.store_id = o.store_id
      AND lower(trim(o2.buyer_email)) = lower(trim(o.buyer_email))
    ORDER BY COALESCE(o2.paid_at, o2.created_at) DESC, o2.id DESC
    LIMIT 1
  ), '')::text AS last_payment_status
FROM orders o
WHERE o.store_id = sqlc.arg(store_id)
  AND trim(o.buyer_email) <> ''
  AND (
    sqlc.narg(q)::text IS NULL
    OR o.buyer_name ILIKE '%' || sqlc.narg(q)::text || '%'
    OR o.buyer_email ILIKE '%' || sqlc.narg(q)::text || '%'
    OR encode(digest(o.store_id || E'\x1f' || lower(trim(o.buyer_email)), 'sha256'), 'hex') ILIKE '%' || sqlc.narg(q)::text || '%'
  )
GROUP BY o.store_id, lower(trim(o.buyer_email))
HAVING (
  sqlc.narg(q)::text IS NULL
  OR MAX(o.buyer_name) ILIKE '%' || sqlc.narg(q)::text || '%'
  OR lower(trim(MAX(o.buyer_email))) ILIKE '%' || sqlc.narg(q)::text || '%'
  OR encode(digest(o.store_id || E'\x1f' || lower(trim(o.buyer_email)), 'sha256'), 'hex') ILIKE '%' || sqlc.narg(q)::text || '%'
)
ORDER BY MAX(COALESCE(o.paid_at, o.created_at)) DESC, encode(digest(o.store_id || E'\x1f' || lower(trim(o.buyer_email)), 'sha256'), 'hex') DESC
LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: SellerCustomerSummaryByStore :one
SELECT
  COUNT(*)::bigint AS total_customers,
  COALESCE(SUM(CASE WHEN order_count >= 2 THEN 1 ELSE 0 END), 0)::bigint AS repeat_buyers,
  COALESCE(
    CASE WHEN COUNT(*) > 0
      THEN (SUM(spent_idr) / COUNT(*))::bigint
      ELSE 0
    END,
    0
  )::bigint AS avg_spend_idr
FROM (
  SELECT
    COUNT(*)::bigint AS order_count,
    COALESCE(SUM(o.gross_idr), 0)::bigint AS spent_idr
  FROM orders o
  WHERE o.store_id = sqlc.arg(store_id)
    AND trim(o.buyer_email) <> ''
  GROUP BY lower(trim(o.buyer_email))
) cust;

-- name: SellerCustomerGetByStore :one
SELECT
  encode(digest(o.store_id || E'\x1f' || lower(trim(o.buyer_email)), 'sha256'), 'hex')::text AS customer_id,
  (ARRAY_AGG(o.buyer_name ORDER BY COALESCE(o.paid_at, o.created_at) DESC, o.id DESC))[1]::text AS display_name,
  (ARRAY_AGG(o.buyer_email ORDER BY COALESCE(o.paid_at, o.created_at) DESC, o.id DESC))[1]::text AS display_email,
  COUNT(*)::bigint AS order_count,
  COALESCE(SUM(o.gross_idr), 0)::bigint AS spent_idr,
  MAX(COALESCE(o.paid_at, o.created_at))::timestamptz AS last_purchase_at,
  MIN(o.created_at)::timestamptz AS first_seen_at,
  (
    SELECT COUNT(DISTINCT oi.product_id)::bigint
    FROM orders o3
    JOIN order_items oi ON oi.order_id = o3.id
    WHERE o3.store_id = o.store_id
      AND lower(trim(o3.buyer_email)) = lower(trim(o.buyer_email))
  ) AS product_count
FROM orders o
WHERE o.store_id = sqlc.arg(store_id)
  AND trim(o.buyer_email) <> ''
  AND encode(digest(o.store_id || E'\x1f' || lower(trim(o.buyer_email)), 'sha256'), 'hex') = sqlc.arg(customer_id)
GROUP BY o.store_id, lower(trim(o.buyer_email))
LIMIT 1;

-- name: SellerCustomerOrderHistory :many
SELECT
  o.id,
  o.order_number,
  o.payment_status,
  o.gross_idr,
  o.paid_at,
  o.created_at,
  COALESCE((
    SELECT oi.product_title::text
    FROM order_items oi
    WHERE oi.order_id = o.id
    ORDER BY oi.created_at ASC, oi.id ASC
    LIMIT 1
  ), '')::text AS product_title
FROM orders o
WHERE o.store_id = sqlc.arg(store_id)
  AND trim(o.buyer_email) <> ''
  AND encode(digest(o.store_id || E'\x1f' || lower(trim(o.buyer_email)), 'sha256'), 'hex') = sqlc.arg(customer_id)
ORDER BY COALESCE(o.paid_at, o.created_at) DESC, o.id DESC
LIMIT sqlc.arg(page_limit);

-- name: SellerCustomerNoteGet :one
SELECT
  id, store_id, customer_id, body, version, author_user_id, created_at, updated_at
FROM store_customer_notes
WHERE store_id = sqlc.arg(store_id) AND customer_id = sqlc.arg(customer_id);

-- name: SellerCustomerNoteInsert :one
INSERT INTO store_customer_notes (
  id, store_id, customer_id, body, version, author_user_id, created_at, updated_at
) VALUES (
  sqlc.arg(id), sqlc.arg(store_id), sqlc.arg(customer_id), sqlc.arg(body), 1, sqlc.arg(author_user_id), sqlc.arg(created_at), sqlc.arg(created_at)
)
RETURNING id, store_id, customer_id, body, version, author_user_id, created_at, updated_at;

-- name: SellerCustomerNoteUpdate :one
UPDATE store_customer_notes
SET
  body = sqlc.arg(body),
  version = version + 1,
  author_user_id = sqlc.arg(author_user_id),
  updated_at = sqlc.arg(updated_at)
WHERE store_id = sqlc.arg(store_id)
  AND customer_id = sqlc.arg(customer_id)
  AND version = sqlc.arg(expected_version)
RETURNING id, store_id, customer_id, body, version, author_user_id, created_at, updated_at;
