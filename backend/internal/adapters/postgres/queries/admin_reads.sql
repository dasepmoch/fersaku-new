-- BE-500 admin read models (permissioned projections; never secrets/raw payloads).

-- name: AdminOverviewCounts :one
SELECT
  (SELECT COUNT(*)::bigint FROM merchants) AS merchant_count,
  (SELECT COUNT(*)::bigint FROM users u
     WHERE EXISTS (
       SELECT 1 FROM orders o WHERE o.buyer_user_id = u.id
     ) OR EXISTS (
       SELECT 1 FROM auth_sessions s WHERE s.user_id = u.id AND s.surface = 'BUYER'
     )) AS buyer_count,
  (SELECT COUNT(*)::bigint FROM orders) AS order_count,
  (SELECT COUNT(*)::bigint FROM payment_intents) AS payment_count,
  (SELECT COUNT(*)::bigint FROM withdrawals WHERE status IN (
    'REQUESTED', 'UNDER_REVIEW', 'HELD', 'APPROVED', 'PROCESSING', 'UNKNOWN_OUTCOME'
  )) AS pending_withdrawal_count,
  (SELECT COUNT(*)::bigint FROM kyc_cases WHERE status IN (
    'SUBMITTED', 'IN_REVIEW', 'VENDOR_CHECK', 'NEEDS_CLARIFICATION'
  )) AS open_kyc_count,
  (SELECT COALESCE(SUM(amount_idr), 0)::bigint FROM payment_intents WHERE status = 'PAID') AS gross_volume_paid_idr,
  (SELECT COALESCE(SUM(fee_idr), 0)::bigint FROM orders WHERE payment_status = 'PAID') AS platform_fee_paid_idr,
  (SELECT COUNT(*)::bigint FROM payment_intents WHERE status = 'PAID') AS paid_payment_count,
  (SELECT COUNT(*)::bigint FROM payment_intents WHERE status IN (
    'PAID', 'FAILED', 'EXPIRED', 'CANCELLED'
  )) AS terminal_payment_count;

-- name: AdminPlatformVolumeHours :many
SELECT COALESCE(SUM(pi.amount_idr), 0)::bigint AS volume_idr
FROM generate_series(
  date_trunc('hour', now() AT TIME ZONE 'UTC') - interval '23 hours',
  date_trunc('hour', now() AT TIME ZONE 'UTC'),
  interval '1 hour'
) AS hour_bucket
LEFT JOIN payment_intents pi
  ON pi.status = 'PAID'
 AND date_trunc('hour', COALESCE(pi.updated_at, pi.created_at) AT TIME ZONE 'UTC') = hour_bucket
GROUP BY hour_bucket
ORDER BY hour_bucket ASC;

-- name: AdminListMerchants :many
SELECT
  m.id,
  m.display_name,
  m.status,
  m.created_at,
  u.name AS owner_name,
  u.email_display AS owner_email,
  COALESCE((
    SELECT SUM(o.gross_idr) FROM orders o
    WHERE o.merchant_id = m.id AND o.payment_status = 'PAID'
  ), 0)::bigint AS volume_idr,
  COALESCE((
    SELECT COUNT(*) FROM orders o WHERE o.merchant_id = m.id
  ), 0)::bigint AS order_count,
  COALESCE((
    SELECT c.status::text FROM merchant_api_capabilities c
    WHERE c.merchant_id = m.id AND c.payment_mode = 'LIVE' AND c.capability = 'QRIS_API'
    LIMIT 1
  ), '')::text AS live_api_status
FROM merchants m
JOIN users u ON u.id = m.owner_user_id
WHERE (
    sqlc.narg('status')::text IS NULL OR m.status = sqlc.narg('status')::text
  )
  AND (
    sqlc.narg('q')::text IS NULL
    OR m.display_name ILIKE '%' || sqlc.narg('q')::text || '%'
    OR u.email_normalized ILIKE '%' || sqlc.narg('q')::text || '%'
    OR u.name ILIKE '%' || sqlc.narg('q')::text || '%'
    OR m.id = sqlc.narg('q')::text
  )
  AND (
    sqlc.narg('cursor_created_at')::timestamptz IS NULL
    OR (m.created_at, m.id) < (sqlc.narg('cursor_created_at')::timestamptz, sqlc.narg('cursor_id')::text)
  )
ORDER BY m.created_at DESC, m.id DESC
LIMIT $1;

-- name: AdminGetMerchant :one
SELECT
  m.id,
  m.display_name,
  m.status,
  m.created_at,
  m.owner_user_id,
  u.name AS owner_name,
  u.email_display AS owner_email,
  COALESCE((
    SELECT SUM(o.gross_idr) FROM orders o
    WHERE o.merchant_id = m.id AND o.payment_status = 'PAID'
  ), 0)::bigint AS volume_idr,
  COALESCE((
    SELECT COUNT(*) FROM orders o WHERE o.merchant_id = m.id
  ), 0)::bigint AS order_count,
  COALESCE((
    SELECT c.status::text FROM merchant_api_capabilities c
    WHERE c.merchant_id = m.id AND c.payment_mode = 'LIVE' AND c.capability = 'QRIS_API'
    LIMIT 1
  ), '')::text AS live_api_status
FROM merchants m
JOIN users u ON u.id = m.owner_user_id
WHERE m.id = $1;

-- name: AdminListBuyers :many
SELECT
  u.id,
  u.name,
  u.email_display,
  u.email_verified_at,
  u.last_login_at,
  u.created_at,
  COALESCE((
    SELECT COUNT(*) FROM orders o WHERE o.buyer_user_id = u.id
  ), 0)::bigint AS purchase_count,
  COALESCE((
    SELECT SUM(o.gross_idr) FROM orders o
    WHERE o.buyer_user_id = u.id AND o.payment_status = 'PAID'
  ), 0)::bigint AS spent_idr,
  COALESCE((
    SELECT COUNT(*) FROM auth_sessions s
    WHERE s.user_id = u.id AND s.surface = 'BUYER' AND s.revoked_at IS NULL AND s.expires_at > now()
  ), 0)::bigint AS active_session_count
FROM users u
WHERE (
    EXISTS (SELECT 1 FROM orders o WHERE o.buyer_user_id = u.id)
    OR EXISTS (SELECT 1 FROM auth_sessions s WHERE s.user_id = u.id AND s.surface = 'BUYER')
  )
  AND (
    sqlc.narg('q')::text IS NULL
    OR u.email_normalized ILIKE '%' || sqlc.narg('q')::text || '%'
    OR u.name ILIKE '%' || sqlc.narg('q')::text || '%'
    OR u.id = sqlc.narg('q')::text
  )
  AND (
    sqlc.narg('cursor_created_at')::timestamptz IS NULL
    OR (u.created_at, u.id) < (sqlc.narg('cursor_created_at')::timestamptz, sqlc.narg('cursor_id')::text)
  )
ORDER BY u.created_at DESC, u.id DESC
LIMIT $1;

-- name: AdminGetBuyer :one
SELECT
  u.id,
  u.name,
  u.email_display,
  u.email_verified_at,
  u.last_login_at,
  u.created_at,
  COALESCE((
    SELECT COUNT(*) FROM orders o WHERE o.buyer_user_id = u.id
  ), 0)::bigint AS purchase_count,
  COALESCE((
    SELECT SUM(o.gross_idr) FROM orders o
    WHERE o.buyer_user_id = u.id AND o.payment_status = 'PAID'
  ), 0)::bigint AS spent_idr,
  COALESCE((
    SELECT COUNT(*) FROM auth_sessions s
    WHERE s.user_id = u.id AND s.surface = 'BUYER' AND s.revoked_at IS NULL AND s.expires_at > now()
  ), 0)::bigint AS active_session_count
FROM users u
WHERE u.id = $1
  AND (
    EXISTS (SELECT 1 FROM orders o WHERE o.buyer_user_id = u.id)
    OR EXISTS (SELECT 1 FROM auth_sessions s WHERE s.user_id = u.id AND s.surface = 'BUYER')
  );

-- name: AdminListBuyerPurchases :many
SELECT
  o.id AS order_id,
  o.order_number,
  o.payment_status,
  o.created_at,
  COALESCE((
    SELECT oi.product_title::text FROM order_items oi WHERE oi.order_id = o.id
    ORDER BY oi.created_at ASC, oi.id ASC LIMIT 1
  ), '')::text AS product_title,
  COALESCE((
    SELECT s.name::text FROM stores s WHERE s.id = o.store_id
  ), '')::text AS seller_name
FROM orders o
WHERE o.buyer_user_id = $1
ORDER BY o.created_at DESC, o.id DESC
LIMIT $2;

-- name: AdminListBuyerSessions :many
SELECT
  s.id,
  s.device_label,
  s.ip_hash,
  s.last_seen_at,
  s.created_at,
  s.expires_at,
  s.revoked_at,
  s.surface
FROM auth_sessions s
WHERE s.user_id = $1 AND s.surface = 'BUYER'
ORDER BY s.last_seen_at DESC, s.id DESC
LIMIT $2;

-- name: AdminListOrders :many
SELECT
  o.id,
  o.order_number,
  o.payment_status,
  o.source,
  o.gross_idr,
  o.fee_idr,
  o.buyer_name,
  o.buyer_email,
  o.created_at,
  s.name AS store_name,
  COALESCE((SELECT oi.product_title::text FROM order_items oi WHERE oi.order_id = o.id ORDER BY oi.created_at ASC, oi.id ASC LIMIT 1), '')::text AS product_title
FROM orders o
JOIN stores s ON s.id = o.store_id
WHERE (
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
    sqlc.narg('cursor_created_at')::timestamptz IS NULL
    OR (o.created_at, o.id) < (sqlc.narg('cursor_created_at')::timestamptz, sqlc.narg('cursor_id')::text)
  )
ORDER BY o.created_at DESC, o.id DESC
LIMIT $1;

-- name: AdminGetOrder :one
SELECT
  o.id,
  o.order_number,
  o.payment_status,
  o.source,
  o.gross_idr,
  o.fee_idr,
  o.buyer_name,
  o.buyer_email,
  o.created_at,
  o.merchant_id,
  o.store_id,
  s.name AS store_name,
  COALESCE((SELECT oi.product_title::text FROM order_items oi WHERE oi.order_id = o.id ORDER BY oi.created_at ASC, oi.id ASC LIMIT 1), '')::text AS product_title
FROM orders o
JOIN stores s ON s.id = o.store_id
WHERE o.id = $1 OR o.order_number = $1;

-- name: AdminListPayments :many
SELECT
  pi.id,
  pi.provider,
  pi.provider_reference,
  pi.amount_idr,
  pi.status,
  pi.source,
  pi.created_at,
  pi.updated_at,
  m.display_name AS merchant_name
FROM payment_intents pi
JOIN merchants m ON m.id = pi.merchant_id
WHERE (
    sqlc.narg('status')::text IS NULL OR pi.status = sqlc.narg('status')::text
  )
  AND (
    sqlc.narg('source')::text IS NULL OR pi.source = sqlc.narg('source')::text
  )
  AND (
    sqlc.narg('from_ts')::timestamptz IS NULL OR pi.created_at >= sqlc.narg('from_ts')::timestamptz
  )
  AND (
    sqlc.narg('to_ts')::timestamptz IS NULL OR pi.created_at < sqlc.narg('to_ts')::timestamptz
  )
  AND (
    sqlc.narg('cursor_created_at')::timestamptz IS NULL
    OR (pi.created_at, pi.id) < (sqlc.narg('cursor_created_at')::timestamptz, sqlc.narg('cursor_id')::text)
  )
ORDER BY pi.created_at DESC, pi.id DESC
LIMIT $1;

-- name: AdminGetPayment :one
SELECT
  pi.id,
  pi.provider,
  pi.provider_reference,
  pi.amount_idr,
  pi.status,
  pi.source,
  pi.created_at,
  pi.updated_at,
  pi.merchant_id,
  pi.order_id,
  m.display_name AS merchant_name
FROM payment_intents pi
JOIN merchants m ON m.id = pi.merchant_id
WHERE pi.id = $1;

-- name: AdminListWithdrawalsFE :many
SELECT
  w.id,
  w.amount_idr,
  w.status,
  w.source,
  w.bank_code,
  w.bank_name,
  w.account_holder_name,
  w.account_number_masked,
  w.provider_fee_quoted_idr,
  w.provider_fee_actual_idr,
  w.provider_disbursement_reference,
  w.created_at,
  m.display_name AS merchant_name,
  u.name AS owner_name
FROM withdrawals w
JOIN merchants m ON m.id = w.merchant_id
JOIN users u ON u.id = m.owner_user_id
WHERE (
    sqlc.narg('status')::text IS NULL OR w.status = sqlc.narg('status')::text
  )
  AND (
    sqlc.narg('source')::text IS NULL OR w.source = sqlc.narg('source')::text
  )
  AND (
    sqlc.narg('from_ts')::timestamptz IS NULL OR w.created_at >= sqlc.narg('from_ts')::timestamptz
  )
  AND (
    sqlc.narg('to_ts')::timestamptz IS NULL OR w.created_at < sqlc.narg('to_ts')::timestamptz
  )
  AND (
    sqlc.narg('cursor_created_at')::timestamptz IS NULL
    OR (w.created_at, w.id) < (sqlc.narg('cursor_created_at')::timestamptz, sqlc.narg('cursor_id')::text)
  )
ORDER BY w.created_at DESC, w.id DESC
LIMIT $1;

-- name: AdminGetWithdrawalFE :one
SELECT
  w.id,
  w.amount_idr,
  w.status,
  w.source,
  w.bank_code,
  w.bank_name,
  w.account_holder_name,
  w.account_number_masked,
  w.provider_fee_quoted_idr,
  w.provider_fee_actual_idr,
  w.provider_disbursement_reference,
  w.created_at,
  w.merchant_id,
  m.display_name AS merchant_name,
  u.name AS owner_name
FROM withdrawals w
JOIN merchants m ON m.id = w.merchant_id
JOIN users u ON u.id = m.owner_user_id
WHERE w.id = $1;

-- name: AdminInventoryProducts :many
SELECT
  p.id,
  p.title,
  p.type AS product_type,
  COALESCE((SELECT COUNT(*) FROM stock_items si WHERE si.product_id = p.id AND si.status = 'AVAILABLE'), 0)::bigint AS available,
  COALESCE((SELECT COUNT(*) FROM stock_items si WHERE si.product_id = p.id AND si.status = 'RESERVED'), 0)::bigint AS reserved,
  COALESCE((SELECT COUNT(*) FROM stock_items si WHERE si.product_id = p.id AND si.status = 'DELIVERED'), 0)::bigint AS sold,
  COALESCE((SELECT COUNT(*) FROM stock_items si WHERE si.product_id = p.id AND si.status = 'REVOKED'), 0)::bigint AS invalid
FROM products p
WHERE p.status <> 'archived'
ORDER BY p.updated_at DESC, p.id DESC
LIMIT $1;

-- name: AdminInventoryItems :many
SELECT
  si.id,
  si.status,
  si.created_at,
  si.masked_preview,
  (
    SELECT r.order_id FROM stock_reservations r
    WHERE r.stock_item_id = si.id
    ORDER BY r.created_at DESC
    LIMIT 1
  ) AS order_id
FROM stock_items si
ORDER BY si.created_at DESC, si.id DESC
LIMIT $1;

-- name: AdminInventorySchemaJSON :one
SELECT fields
FROM inventory_schemas
ORDER BY created_at DESC
LIMIT 1;

-- name: AdminListFulfillments :many
SELECT
  g.id,
  g.order_id,
  g.delivery_kind,
  g.status,
  g.created_at,
  g.updated_at,
  COALESCE((
    SELECT COUNT(*) FROM delivery_attempts da WHERE da.grant_id = g.id
  ), 0)::bigint AS attempt_count,
  m.display_name AS merchant_name,
  COALESCE((SELECT oi.product_title::text FROM order_items oi WHERE oi.id = g.order_item_id), '')::text AS product_title,
  o.order_number
FROM delivery_grants g
JOIN merchants m ON m.id = g.merchant_id
JOIN orders o ON o.id = g.order_id
WHERE (
    sqlc.narg('status')::text IS NULL OR g.status = sqlc.narg('status')::text
  )
  AND (
    sqlc.narg('cursor_created_at')::timestamptz IS NULL
    OR (g.created_at, g.id) < (sqlc.narg('cursor_created_at')::timestamptz, sqlc.narg('cursor_id')::text)
  )
ORDER BY g.created_at DESC, g.id DESC
LIMIT $1;

-- name: AdminGetFulfillment :one
SELECT
  g.id,
  g.order_id,
  g.delivery_kind,
  g.status,
  g.created_at,
  g.updated_at,
  COALESCE((
    SELECT COUNT(*) FROM delivery_attempts da WHERE da.grant_id = g.id
  ), 0)::bigint AS attempt_count,
  g.merchant_id,
  m.display_name AS merchant_name,
  COALESCE((SELECT oi.product_title::text FROM order_items oi WHERE oi.id = g.order_item_id), '')::text AS product_title,
  o.order_number
FROM delivery_grants g
JOIN merchants m ON m.id = g.merchant_id
JOIN orders o ON o.id = g.order_id
WHERE g.id = $1;

-- name: AdminListReviews :many
SELECT
  r.id,
  r.product_id,
  r.rating,
  r.title,
  r.body,
  r.status,
  r.verified_purchase,
  r.created_at,
  p.title AS product_title,
  m.display_name AS seller_name,
  u.name AS buyer_name,
  COALESCE((
    SELECT rr.body::text FROM product_review_replies rr WHERE rr.review_id = r.id LIMIT 1
  ), '')::text AS seller_reply
FROM product_reviews r
JOIN products p ON p.id = r.product_id
JOIN merchants m ON m.id = r.merchant_id
JOIN users u ON u.id = r.buyer_user_id
WHERE (
    sqlc.narg('status')::text IS NULL OR r.status = sqlc.narg('status')::text
  )
  AND (
    sqlc.narg('cursor_created_at')::timestamptz IS NULL
    OR (r.created_at, r.id) < (sqlc.narg('cursor_created_at')::timestamptz, sqlc.narg('cursor_id')::text)
  )
ORDER BY r.created_at DESC, r.id DESC
LIMIT $1;

-- name: AdminGetReview :one
SELECT
  r.id,
  r.product_id,
  r.rating,
  r.title,
  r.body,
  r.status,
  r.verified_purchase,
  r.created_at,
  p.title AS product_title,
  m.display_name AS seller_name,
  u.name AS buyer_name,
  COALESCE((
    SELECT rr.body::text FROM product_review_replies rr WHERE rr.review_id = r.id LIMIT 1
  ), '')::text AS seller_reply
FROM product_reviews r
JOIN products p ON p.id = r.product_id
JOIN merchants m ON m.id = r.merchant_id
JOIN users u ON u.id = r.buyer_user_id
WHERE r.id = $1;

-- name: AdminLookupUsers :many
SELECT
  u.id,
  u.name,
  u.email_display,
  u.status,
  u.created_at,
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles ro ON ro.id = ur.role_id
    WHERE ur.user_id = u.id AND ro.code IN ('SUPER_ADMIN', 'ADMIN_SUPPORT', 'ADMIN_FINANCE')
  ) AS is_admin
FROM users u
WHERE (
    sqlc.narg('q')::text IS NULL
    OR u.email_normalized ILIKE '%' || sqlc.narg('q')::text || '%'
    OR u.name ILIKE '%' || sqlc.narg('q')::text || '%'
    OR u.id = sqlc.narg('q')::text
  )
ORDER BY u.created_at DESC, u.id DESC
LIMIT $1;

-- name: AdminGetUser :one
SELECT
  u.id,
  u.name,
  u.email_display,
  u.status,
  u.created_at,
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles ro ON ro.id = ur.role_id
    WHERE ur.user_id = u.id AND ro.code IN ('SUPER_ADMIN', 'ADMIN_SUPPORT', 'ADMIN_FINANCE')
  ) AS is_admin,
  (
    SELECT m.id FROM merchants m WHERE m.owner_user_id = u.id ORDER BY m.created_at ASC LIMIT 1
  ) AS owner_merchant_id
FROM users u
WHERE u.id = $1;
