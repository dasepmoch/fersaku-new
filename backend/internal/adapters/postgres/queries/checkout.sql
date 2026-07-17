-- BE-310 hosted checkout / payment intents

-- name: CheckoutInsertOrder :exec
INSERT INTO orders (
    id, order_number, store_id, merchant_id, buyer_user_id, buyer_email, buyer_name,
    payment_status, order_status, source, payment_mode, currency,
    subtotal_idr, discount_idr, tip_idr, fee_idr, gross_idr, merchant_net_idr,
    coupon_code, coupon_version, fee_snapshot_id, coupon_reservation_id,
    public_token_hash, buyer_session_id, expires_at, idempotency_key_hash,
    paid_at, created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7,
    $8, $9, $10, $11, $12,
    $13, $14, $15, $16, $17, $18,
    $19, $20, $21, $22,
    $23, $24, $25, $26,
    $27, $28, $29
);

-- name: CheckoutUpdateOrderStatus :exec
UPDATE orders
SET payment_status = $2,
    order_status = $3,
    updated_at = $4
WHERE id = $1;

-- name: CheckoutGetOrderByID :one
SELECT id, order_number, store_id, merchant_id, buyer_user_id, buyer_email, buyer_name,
       payment_status, COALESCE(order_status, 'CREATED') AS order_status,
       source, COALESCE(payment_mode, 'SANDBOX') AS payment_mode, currency,
       subtotal_idr, discount_idr, tip_idr, fee_idr, gross_idr, merchant_net_idr,
       coupon_code, coupon_version, fee_snapshot_id, coupon_reservation_id,
       public_token_hash, buyer_session_id, expires_at, idempotency_key_hash,
       paid_at, created_at, updated_at
FROM orders
WHERE id = $1;

-- name: CheckoutInsertPaymentIntent :exec
INSERT INTO payment_intents (
    id, order_id, store_id, merchant_id, payment_mode, source, provider, account_scope,
    provider_reference, external_id, amount_idr, currency, fee_snapshot_id,
    coupon_reservation_id, stock_reservation_id, status, provider_financial_state,
    qr_string, qr_image_url, expires_at, cancel_requested_at, expire_requested_at,
    cancel_reason, expire_reason, unknown_operation, lookup_scheduled_at, lookup_attempts,
    paid_late, preceding_status, buyer_user_id, buyer_email, buyer_session_id,
    public_token_hash, idempotency_key_hash, request_hash, product_snapshot, price_snapshot,
    version, created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8,
    $9, $10, $11, $12, $13,
    $14, $15, $16, $17,
    $18, $19, $20, $21, $22,
    $23, $24, $25, $26, $27,
    $28, $29, $30, $31, $32,
    $33, $34, $35, $36, $37,
    $38, $39, $40
);

-- name: CheckoutGetPaymentIntentByID :one
SELECT id, order_id, store_id, merchant_id, payment_mode, source, provider, account_scope,
       provider_reference, external_id, amount_idr, currency, fee_snapshot_id,
       coupon_reservation_id, stock_reservation_id, status, provider_financial_state,
       qr_string, qr_image_url, expires_at, cancel_requested_at, expire_requested_at,
       cancel_reason, expire_reason, unknown_operation, lookup_scheduled_at, lookup_attempts,
       paid_late, preceding_status, buyer_user_id, buyer_email, buyer_session_id,
       public_token_hash, idempotency_key_hash, request_hash, product_snapshot, price_snapshot,
       version, created_at, updated_at
FROM payment_intents
WHERE id = $1;

-- name: CheckoutGetPaymentIntentByOrder :one
SELECT id, order_id, store_id, merchant_id, payment_mode, source, provider, account_scope,
       provider_reference, external_id, amount_idr, currency, fee_snapshot_id,
       coupon_reservation_id, stock_reservation_id, status, provider_financial_state,
       qr_string, qr_image_url, expires_at, cancel_requested_at, expire_requested_at,
       cancel_reason, expire_reason, unknown_operation, lookup_scheduled_at, lookup_attempts,
       paid_late, preceding_status, buyer_user_id, buyer_email, buyer_session_id,
       public_token_hash, idempotency_key_hash, request_hash, product_snapshot, price_snapshot,
       version, created_at, updated_at
FROM payment_intents
WHERE order_id = $1;

-- name: CheckoutGetPaymentIntentByIdempotency :one
SELECT id, order_id, store_id, merchant_id, payment_mode, source, provider, account_scope,
       provider_reference, external_id, amount_idr, currency, fee_snapshot_id,
       coupon_reservation_id, stock_reservation_id, status, provider_financial_state,
       qr_string, qr_image_url, expires_at, cancel_requested_at, expire_requested_at,
       cancel_reason, expire_reason, unknown_operation, lookup_scheduled_at, lookup_attempts,
       paid_late, preceding_status, buyer_user_id, buyer_email, buyer_session_id,
       public_token_hash, idempotency_key_hash, request_hash, product_snapshot, price_snapshot,
       version, created_at, updated_at
FROM payment_intents
WHERE source = $1
  AND payment_mode = $2
  AND idempotency_key_hash = $3;

-- name: CheckoutGetPaymentIntentByProviderRef :one
SELECT id, order_id, store_id, merchant_id, payment_mode, source, provider, account_scope,
       provider_reference, external_id, amount_idr, currency, fee_snapshot_id,
       coupon_reservation_id, stock_reservation_id, status, provider_financial_state,
       qr_string, qr_image_url, expires_at, cancel_requested_at, expire_requested_at,
       cancel_reason, expire_reason, unknown_operation, lookup_scheduled_at, lookup_attempts,
       paid_late, preceding_status, buyer_user_id, buyer_email, buyer_session_id,
       public_token_hash, idempotency_key_hash, request_hash, product_snapshot, price_snapshot,
       version, created_at, updated_at
FROM payment_intents
WHERE provider = $1
  AND account_scope = $2
  AND payment_mode = $3
  AND provider_reference = $4;

-- name: CheckoutUpdatePaymentIntentStatus :one
UPDATE payment_intents
SET status = $2,
    provider_reference = COALESCE(sqlc.narg('provider_reference')::text, provider_reference),
    qr_string = COALESCE(sqlc.narg('qr_string')::text, qr_string),
    qr_image_url = COALESCE(sqlc.narg('qr_image_url')::text, qr_image_url),
    expire_requested_at = COALESCE(sqlc.narg('expire_requested_at')::timestamptz, expire_requested_at),
    expire_reason = COALESCE(sqlc.narg('expire_reason')::text, expire_reason),
    cancel_requested_at = COALESCE(sqlc.narg('cancel_requested_at')::timestamptz, cancel_requested_at),
    cancel_reason = COALESCE(sqlc.narg('cancel_reason')::text, cancel_reason),
    unknown_operation = COALESCE(sqlc.narg('unknown_operation')::text, unknown_operation),
    lookup_scheduled_at = COALESCE(sqlc.narg('lookup_scheduled_at')::timestamptz, lookup_scheduled_at),
    lookup_attempts = COALESCE(sqlc.narg('lookup_attempts')::integer, lookup_attempts),
    preceding_status = COALESCE(sqlc.narg('preceding_status')::text, preceding_status),
    version = version + 1,
    updated_at = $3
WHERE id = $1
  AND status = sqlc.arg('from_status')
RETURNING id, order_id, store_id, merchant_id, payment_mode, source, provider, account_scope,
       provider_reference, external_id, amount_idr, currency, fee_snapshot_id,
       coupon_reservation_id, stock_reservation_id, status, provider_financial_state,
       qr_string, qr_image_url, expires_at, cancel_requested_at, expire_requested_at,
       cancel_reason, expire_reason, unknown_operation, lookup_scheduled_at, lookup_attempts,
       paid_late, preceding_status, buyer_user_id, buyer_email, buyer_session_id,
       public_token_hash, idempotency_key_hash, request_hash, product_snapshot, price_snapshot,
       version, created_at, updated_at;

-- name: CheckoutForceUpdatePaymentIntent :one
UPDATE payment_intents
SET status = $2,
    provider_reference = COALESCE(sqlc.narg('provider_reference')::text, provider_reference),
    qr_string = COALESCE(sqlc.narg('qr_string')::text, qr_string),
    qr_image_url = COALESCE(sqlc.narg('qr_image_url')::text, qr_image_url),
    expire_requested_at = COALESCE(sqlc.narg('expire_requested_at')::timestamptz, expire_requested_at),
    expire_reason = COALESCE(sqlc.narg('expire_reason')::text, expire_reason),
    unknown_operation = sqlc.narg('unknown_operation')::text,
    lookup_scheduled_at = sqlc.narg('lookup_scheduled_at')::timestamptz,
    lookup_attempts = COALESCE(sqlc.narg('lookup_attempts')::integer, lookup_attempts),
    preceding_status = COALESCE(sqlc.narg('preceding_status')::text, preceding_status),
    version = version + 1,
    updated_at = $3
WHERE id = $1
RETURNING id, order_id, store_id, merchant_id, payment_mode, source, provider, account_scope,
       provider_reference, external_id, amount_idr, currency, fee_snapshot_id,
       coupon_reservation_id, stock_reservation_id, status, provider_financial_state,
       qr_string, qr_image_url, expires_at, cancel_requested_at, expire_requested_at,
       cancel_reason, expire_reason, unknown_operation, lookup_scheduled_at, lookup_attempts,
       paid_late, preceding_status, buyer_user_id, buyer_email, buyer_session_id,
       public_token_hash, idempotency_key_hash, request_hash, product_snapshot, price_snapshot,
       version, created_at, updated_at;

-- name: CheckoutGetProduct :one
SELECT id, store_id, merchant_id, slug, title, short, description, price_idr, type, status,
       version, allow_pwyt, minimum_price_idr, published_at
FROM products
WHERE id = $1 AND store_id = $2;

-- name: CheckoutGetStore :one
SELECT id, name, merchant_id
FROM stores
WHERE id = $1;

-- name: CheckoutInsertOutbox :exec
INSERT INTO outbox_events (id, topic, payload, status, available_at, created_at, dedupe_key, payment_mode)
VALUES ($1, $2, $3, 'pending', $4, now(), $5, $6);

-- name: CheckoutTryInsertIdempotency :one
INSERT INTO idempotency_records (
    id, subject_type, subject_id, operation, payment_mode,
    key_hash, request_hash, status, resource_type, resource_id,
    response_status, response_body, request_id, lease_expires_at,
    expires_at, created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5,
    $6, $7, $8, $9, $10,
    $11, $12, $13, $14,
    $15, now(), now()
)
ON CONFLICT ON CONSTRAINT idempotency_records_scope_uidx
DO NOTHING
RETURNING id, subject_type, subject_id, operation, payment_mode,
          key_hash, request_hash, status, resource_type, resource_id,
          response_status, response_body, request_id, lease_expires_at,
          expires_at, created_at, updated_at;

-- name: CheckoutGetIdempotency :one
SELECT id, subject_type, subject_id, operation, payment_mode,
       key_hash, request_hash, status, resource_type, resource_id,
       response_status, response_body, request_id, lease_expires_at,
       expires_at, created_at, updated_at
FROM idempotency_records
WHERE subject_type = $1
  AND subject_id = $2
  AND operation = $3
  AND payment_mode IS NOT DISTINCT FROM sqlc.narg('payment_mode')::text
  AND key_hash = $4;

-- name: CheckoutCompleteIdempotency :one
UPDATE idempotency_records
SET status = $2,
    resource_type = $3,
    resource_id = $4,
    response_status = $5,
    response_body = $6,
    updated_at = now(),
    lease_expires_at = NULL
WHERE id = $1
RETURNING id, subject_type, subject_id, operation, payment_mode,
          key_hash, request_hash, status, resource_type, resource_id,
          response_status, response_body, request_id, lease_expires_at,
          expires_at, created_at, updated_at;
