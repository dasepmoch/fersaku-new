-- BE-235 delivery grants / orders / invoices.

-- name: DeliveryInsertOrder :exec
INSERT INTO orders (
    id, order_number, store_id, merchant_id, buyer_user_id, buyer_email, buyer_name,
    payment_status, source, currency, subtotal_idr, discount_idr, tip_idr, fee_idr,
    gross_idr, merchant_net_idr, coupon_code, coupon_version, paid_at, created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7,
    $8, $9, $10, $11, $12, $13, $14,
    $15, $16, $17, $18, $19, $20, $21
);

-- name: DeliveryInsertOrderItem :exec
INSERT INTO order_items (
    id, order_id, store_id, merchant_id, product_id, product_version, product_title,
    product_type, unit_price_idr, quantity, line_subtotal_idr, discount_allocation_idr,
    line_total_idr, delivery_kind, stock_reservation_id, stock_item_id, object_id, created_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7,
    $8, $9, $10, $11, $12,
    $13, $14, $15, $16, $17, $18
);

-- name: DeliveryGetOrderByID :one
SELECT id, order_number, store_id, merchant_id, buyer_user_id, buyer_email, buyer_name,
       payment_status, source, currency, subtotal_idr, discount_idr, tip_idr, fee_idr,
       gross_idr, merchant_net_idr, coupon_code, coupon_version, paid_at, created_at, updated_at
FROM orders
WHERE id = $1;

-- name: DeliveryGetOrderByNumber :one
SELECT id, order_number, store_id, merchant_id, buyer_user_id, buyer_email, buyer_name,
       payment_status, source, currency, subtotal_idr, discount_idr, tip_idr, fee_idr,
       gross_idr, merchant_net_idr, coupon_code, coupon_version, paid_at, created_at, updated_at
FROM orders
WHERE order_number = $1;

-- name: DeliveryListOrderItems :many
SELECT id, order_id, store_id, merchant_id, product_id, product_version, product_title,
       product_type, unit_price_idr, quantity, line_subtotal_idr, discount_allocation_idr,
       line_total_idr, delivery_kind, stock_reservation_id, stock_item_id, object_id, created_at
FROM order_items
WHERE order_id = $1
ORDER BY created_at ASC, id ASC;

-- name: DeliveryGetOrderItem :one
SELECT id, order_id, store_id, merchant_id, product_id, product_version, product_title,
       product_type, unit_price_idr, quantity, line_subtotal_idr, discount_allocation_idr,
       line_total_idr, delivery_kind, stock_reservation_id, stock_item_id, object_id, created_at
FROM order_items
WHERE id = $1;

-- name: DeliveryInsertGrant :exec
INSERT INTO delivery_grants (
    id, order_id, order_item_id, store_id, merchant_id, product_id, buyer_user_id, buyer_email,
    delivery_kind, status, stock_item_id, stock_reservation_id, object_id, fulfillment_effect_key,
    access_token_hash, access_token_expires_at, max_accesses, access_count,
    recipient_snapshot, product_snapshot, expires_at, activated_at, version, created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8,
    $9, $10, $11, $12, $13, $14,
    $15, $16, $17, $18,
    $19, $20, $21, $22, $23, $24, $25
);

-- name: DeliveryGetGrantByID :one
SELECT id, order_id, order_item_id, store_id, merchant_id, product_id, buyer_user_id, buyer_email,
       delivery_kind, status, stock_item_id, stock_reservation_id, object_id, fulfillment_effect_key,
       access_token_hash, access_token_expires_at, max_accesses, access_count,
       recipient_snapshot, product_snapshot, revoked_at, revoke_reason, expires_at,
       last_accessed_at, activated_at, failed_at, fail_reason, version, created_at, updated_at
FROM delivery_grants
WHERE id = $1;

-- name: DeliveryGetGrantByOrderItem :one
SELECT id, order_id, order_item_id, store_id, merchant_id, product_id, buyer_user_id, buyer_email,
       delivery_kind, status, stock_item_id, stock_reservation_id, object_id, fulfillment_effect_key,
       access_token_hash, access_token_expires_at, max_accesses, access_count,
       recipient_snapshot, product_snapshot, revoked_at, revoke_reason, expires_at,
       last_accessed_at, activated_at, failed_at, fail_reason, version, created_at, updated_at
FROM delivery_grants
WHERE order_item_id = $1;

-- name: DeliveryGetGrantByOrderID :one
SELECT id, order_id, order_item_id, store_id, merchant_id, product_id, buyer_user_id, buyer_email,
       delivery_kind, status, stock_item_id, stock_reservation_id, object_id, fulfillment_effect_key,
       access_token_hash, access_token_expires_at, max_accesses, access_count,
       recipient_snapshot, product_snapshot, revoked_at, revoke_reason, expires_at,
       last_accessed_at, activated_at, failed_at, fail_reason, version, created_at, updated_at
FROM delivery_grants
WHERE order_id = $1
ORDER BY created_at ASC, id ASC
LIMIT 1;

-- name: DeliveryListGrantsByOrder :many
SELECT id, order_id, order_item_id, store_id, merchant_id, product_id, buyer_user_id, buyer_email,
       delivery_kind, status, stock_item_id, stock_reservation_id, object_id, fulfillment_effect_key,
       access_token_hash, access_token_expires_at, max_accesses, access_count,
       recipient_snapshot, product_snapshot, revoked_at, revoke_reason, expires_at,
       last_accessed_at, activated_at, failed_at, fail_reason, version, created_at, updated_at
FROM delivery_grants
WHERE order_id = $1
ORDER BY created_at ASC, id ASC;

-- name: DeliveryGetGrantByAccessTokenHash :one
SELECT id, order_id, order_item_id, store_id, merchant_id, product_id, buyer_user_id, buyer_email,
       delivery_kind, status, stock_item_id, stock_reservation_id, object_id, fulfillment_effect_key,
       access_token_hash, access_token_expires_at, max_accesses, access_count,
       recipient_snapshot, product_snapshot, revoked_at, revoke_reason, expires_at,
       last_accessed_at, activated_at, failed_at, fail_reason, version, created_at, updated_at
FROM delivery_grants
WHERE access_token_hash = $1;

-- name: DeliveryUpdateGrantStatus :one
UPDATE delivery_grants
SET status = sqlc.arg(new_status),
    revoked_at = COALESCE(sqlc.narg(revoked_at)::timestamptz, revoked_at),
    revoke_reason = COALESCE(sqlc.narg(revoke_reason), revoke_reason),
    failed_at = COALESCE(sqlc.narg(failed_at)::timestamptz, failed_at),
    fail_reason = COALESCE(sqlc.narg(fail_reason), fail_reason),
    activated_at = COALESCE(sqlc.narg(activated_at)::timestamptz, activated_at),
    stock_item_id = COALESCE(sqlc.narg(stock_item_id), stock_item_id),
    stock_reservation_id = COALESCE(sqlc.narg(stock_reservation_id), stock_reservation_id),
    access_token_hash = COALESCE(sqlc.narg(access_token_hash), access_token_hash),
    access_token_expires_at = COALESCE(sqlc.narg(access_token_expires_at)::timestamptz, access_token_expires_at),
    last_accessed_at = COALESCE(sqlc.narg(last_accessed_at)::timestamptz, last_accessed_at),
    version = version + 1,
    updated_at = sqlc.arg(updated_at)
WHERE id = sqlc.arg(id) AND status = sqlc.arg(from_status)
RETURNING id, order_id, order_item_id, store_id, merchant_id, product_id, buyer_user_id, buyer_email,
          delivery_kind, status, stock_item_id, stock_reservation_id, object_id, fulfillment_effect_key,
          access_token_hash, access_token_expires_at, max_accesses, access_count,
          recipient_snapshot, product_snapshot, revoked_at, revoke_reason, expires_at,
          last_accessed_at, activated_at, failed_at, fail_reason, version, created_at, updated_at;

-- name: DeliveryIncrementAccess :one
UPDATE delivery_grants
SET access_count = access_count + 1,
    last_accessed_at = $2,
    updated_at = $2,
    version = version + 1
WHERE id = $1
  AND status = 'ACTIVE'
  AND (revoked_at IS NULL)
  AND (expires_at IS NULL OR expires_at > $2)
  AND (access_token_expires_at IS NULL OR access_token_expires_at > $2)
  AND access_count < max_accesses
RETURNING id, order_id, order_item_id, store_id, merchant_id, product_id, buyer_user_id, buyer_email,
          delivery_kind, status, stock_item_id, stock_reservation_id, object_id, fulfillment_effect_key,
          access_token_hash, access_token_expires_at, max_accesses, access_count,
          recipient_snapshot, product_snapshot, revoked_at, revoke_reason, expires_at,
          last_accessed_at, activated_at, failed_at, fail_reason, version, created_at, updated_at;

-- name: DeliveryRotateAccessToken :one
UPDATE delivery_grants
SET access_token_hash = $2,
    access_token_expires_at = $3,
    updated_at = $4,
    version = version + 1
WHERE id = $1
  AND status IN ('ACTIVE', 'DELIVERY_FAILED', 'PENDING_FULFILLMENT')
  AND revoked_at IS NULL
RETURNING id, order_id, order_item_id, store_id, merchant_id, product_id, buyer_user_id, buyer_email,
          delivery_kind, status, stock_item_id, stock_reservation_id, object_id, fulfillment_effect_key,
          access_token_hash, access_token_expires_at, max_accesses, access_count,
          recipient_snapshot, product_snapshot, revoked_at, revoke_reason, expires_at,
          last_accessed_at, activated_at, failed_at, fail_reason, version, created_at, updated_at;

-- name: DeliveryInsertAttempt :exec
INSERT INTO delivery_attempts (
    id, grant_id, order_id, store_id, channel, result, safe_error_code, retry_count,
    actor_user_id, actor_kind, reason, idempotency_key, created_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8,
    $9, $10, $11, $12, $13
);

-- name: DeliveryGetAttemptByIdem :one
SELECT id, grant_id, order_id, store_id, channel, result, safe_error_code, retry_count,
       actor_user_id, actor_kind, reason, idempotency_key, created_at
FROM delivery_attempts
WHERE grant_id = $1 AND idempotency_key = $2;

-- name: DeliveryListAttemptsByGrant :many
SELECT id, grant_id, order_id, store_id, channel, result, safe_error_code, retry_count,
       actor_user_id, actor_kind, reason, idempotency_key, created_at
FROM delivery_attempts
WHERE grant_id = $1
ORDER BY created_at DESC, id DESC
LIMIT $2;

-- name: DeliveryInsertInvoice :exec
INSERT INTO invoices (
    id, order_id, store_id, merchant_id, invoice_number, public_code_hash, public_code_hint,
    status, currency, gross_idr, paid_at, current_version, buyer_user_id, created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7,
    $8, $9, $10, $11, $12, $13, $14, $15
);

-- name: DeliveryInsertInvoiceVersion :exec
INSERT INTO invoice_versions (
    id, invoice_id, version, renderer_version, snapshot, payload_hash,
    render_status, render_object_id, render_error_code, rendered_at, created_at
) VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10, $11
);

-- name: DeliveryGetInvoiceByID :one
SELECT id, order_id, store_id, merchant_id, invoice_number, public_code_hash, public_code_hint,
       status, currency, gross_idr, paid_at, current_version, buyer_user_id, created_at, updated_at
FROM invoices
WHERE id = $1;

-- name: DeliveryGetInvoiceByOrder :one
SELECT id, order_id, store_id, merchant_id, invoice_number, public_code_hash, public_code_hint,
       status, currency, gross_idr, paid_at, current_version, buyer_user_id, created_at, updated_at
FROM invoices
WHERE order_id = $1;

-- name: DeliveryGetInvoiceByPublicCodeHash :one
SELECT id, order_id, store_id, merchant_id, invoice_number, public_code_hash, public_code_hint,
       status, currency, gross_idr, paid_at, current_version, buyer_user_id, created_at, updated_at
FROM invoices
WHERE public_code_hash = $1;

-- name: DeliveryGetInvoiceVersion :one
SELECT id, invoice_id, version, renderer_version, snapshot, payload_hash,
       render_status, render_object_id, render_error_code, rendered_at, created_at
FROM invoice_versions
WHERE invoice_id = $1 AND version = $2;

-- name: DeliveryUpdateInvoiceRenderStatus :one
UPDATE invoice_versions
SET render_status = $3,
    render_object_id = COALESCE($4, render_object_id),
    render_error_code = $5,
    rendered_at = COALESCE($6, rendered_at)
WHERE invoice_id = $1 AND version = $2
RETURNING id, invoice_id, version, renderer_version, snapshot, payload_hash,
          render_status, render_object_id, render_error_code, rendered_at, created_at;

-- name: DeliveryUpdateInvoiceStatus :exec
UPDATE invoices
SET status = $2,
    updated_at = $3
WHERE id = $1;

-- name: DeliveryGetStoreName :one
SELECT id, name, merchant_id FROM stores WHERE id = $1;

-- name: DeliveryGetProductSnapshot :one
SELECT id, store_id, merchant_id, slug, title, type, status, version, price_idr
FROM products
WHERE id = $1 AND store_id = $2;

-- name: DeliveryUserCanAccessStore :one
SELECT EXISTS (
    SELECT 1
    FROM stores s
    JOIN merchant_members mm ON mm.merchant_id = s.merchant_id
    WHERE s.id = $1
      AND mm.user_id = $2
      AND mm.status = 'ACTIVE'
) AS ok;

-- name: DeliveryUserIsPlatformAdmin :one
SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = $1
      AND r.archived_at IS NULL
      AND r.code IN ('SUPER_ADMIN', 'ADMIN_SUPPORT')
) AS ok;

-- name: DeliveryGetStockItemPayload :one
SELECT id, product_id, store_id, merchant_id, schema_version, status, encrypted_payload, key_version, masked_preview
FROM stock_items
WHERE id = $1;

-- name: DeliveryInsertOutbox :exec
INSERT INTO outbox_events (
    id, topic, payload, status, attempts, available_at, created_at, dedupe_key
) VALUES (
    $1, $2, $3, 'pending', 0, $4, $4, $5
)
ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
