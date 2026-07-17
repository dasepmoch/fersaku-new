-- BE-320 QRIS gateway API

-- name: GatewayGetAPIKeyByPrefix :one
SELECT id, merchant_id, key_prefix, key_hash, payment_mode, status, name,
       last_used_at, revoked_at, expires_at, created_at, updated_at
FROM merchant_api_keys
WHERE key_prefix = $1;

-- name: GatewayTouchAPIKeyLastUsed :exec
UPDATE merchant_api_keys
SET last_used_at = $2, updated_at = $2
WHERE id = $1;

-- name: GatewayInsertAPIKey :exec
INSERT INTO merchant_api_keys (
    id, merchant_id, key_prefix, key_hash, payment_mode, status, name, created_at, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);

-- name: GatewayGetCapability :one
SELECT id, merchant_id, payment_mode, capability, status, kyc_case_id, kyc_version,
       suspension_reason, suspended_by, effective_at, expires_at, created_at, updated_at
FROM merchant_api_capabilities
WHERE merchant_id = $1 AND payment_mode = $2 AND capability = $3;

-- name: GatewayUpsertCapability :exec
INSERT INTO merchant_api_capabilities (
    id, merchant_id, payment_mode, capability, status, kyc_case_id, kyc_version,
    effective_at, created_at, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
ON CONFLICT (merchant_id, payment_mode, capability) DO UPDATE SET
    status = EXCLUDED.status,
    kyc_case_id = EXCLUDED.kyc_case_id,
    kyc_version = EXCLUDED.kyc_version,
    effective_at = EXCLUDED.effective_at,
    updated_at = EXCLUDED.updated_at;

-- name: GatewayGetRedirectOrigin :one
SELECT id, merchant_id, payment_mode, origin, status, created_by, reason, revoked_at, created_at, updated_at
FROM gateway_redirect_origins
WHERE merchant_id = $1 AND payment_mode = $2 AND origin = $3 AND status = 'ACTIVE';

-- name: GatewayInsertRedirectOrigin :exec
INSERT INTO gateway_redirect_origins (
    id, merchant_id, payment_mode, origin, status, created_by, reason, created_at, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);

-- name: GatewayGetWebhookEndpoint :one
SELECT id, merchant_id, payment_mode, url, status, config_version, event_allowlist,
       failure_count, last_success_at, last_failure_at, created_at, updated_at
FROM seller_webhook_endpoints
WHERE id = $1;

-- name: GatewayInsertWebhookEndpoint :exec
INSERT INTO seller_webhook_endpoints (
    id, merchant_id, payment_mode, url, status, config_version, event_allowlist, created_at, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);

-- name: GatewayGetCanonicalStore :one
SELECT id, name, merchant_id, status
FROM stores
WHERE merchant_id = $1 AND is_canonical = true
LIMIT 1;

-- name: GatewayGetMerchantStatus :one
SELECT id, status
FROM merchants
WHERE id = $1;

-- name: GatewayInsertOrder :exec
INSERT INTO orders (
    id, order_number, store_id, merchant_id, buyer_user_id, buyer_email, buyer_name,
    payment_status, order_status, source, payment_mode, currency,
    subtotal_idr, discount_idr, tip_idr, fee_idr, gross_idr, merchant_net_idr,
    fee_snapshot_id, expires_at, idempotency_key_hash,
    created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7,
    $8, $9, $10, $11, $12,
    $13, $14, $15, $16, $17, $18,
    $19, $20, $21,
    $22, $23
);

-- name: GatewayInsertPaymentIntent :exec
INSERT INTO payment_intents (
    id, order_id, store_id, merchant_id, payment_mode, source, provider, account_scope,
    provider_reference, external_id, amount_idr, currency, fee_snapshot_id,
    coupon_reservation_id, stock_reservation_id, status, provider_financial_state,
    qr_string, qr_image_url, expires_at, cancel_requested_at, expire_requested_at,
    cancel_reason, expire_reason, unknown_operation, lookup_scheduled_at, lookup_attempts,
    paid_late, preceding_status, buyer_user_id, buyer_email, buyer_session_id,
    public_token_hash, idempotency_key_hash, request_hash, product_snapshot, price_snapshot,
    merchant_reference, description, success_url, failure_url, webhook_endpoint_id,
    webhook_config_version, metadata,
    version, created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8,
    $9, $10, $11, $12, $13,
    $14, $15, $16, $17,
    $18, $19, $20, $21, $22,
    $23, $24, $25, $26, $27,
    $28, $29, $30, $31, $32,
    $33, $34, $35, $36, $37,
    $38, $39, $40, $41, $42,
    $43, $44,
    $45, $46, $47
);

-- name: GatewayGetPaymentIntentByID :one
SELECT id, order_id, store_id, merchant_id, payment_mode, source, provider, account_scope,
       provider_reference, external_id, amount_idr, currency, fee_snapshot_id,
       coupon_reservation_id, stock_reservation_id, status, provider_financial_state,
       qr_string, qr_image_url, expires_at, cancel_requested_at, expire_requested_at,
       cancel_reason, expire_reason, unknown_operation, lookup_scheduled_at, lookup_attempts,
       paid_late, preceding_status, buyer_user_id, buyer_email, buyer_session_id,
       public_token_hash, idempotency_key_hash, request_hash, product_snapshot, price_snapshot,
       merchant_reference, description, success_url, failure_url, webhook_endpoint_id,
       webhook_config_version, metadata,
       version, created_at, updated_at
FROM payment_intents
WHERE id = $1;

-- name: GatewayGetPaymentIntentByMerchantRef :one
SELECT id, order_id, store_id, merchant_id, payment_mode, source, provider, account_scope,
       provider_reference, external_id, amount_idr, currency, fee_snapshot_id,
       coupon_reservation_id, stock_reservation_id, status, provider_financial_state,
       qr_string, qr_image_url, expires_at, cancel_requested_at, expire_requested_at,
       cancel_reason, expire_reason, unknown_operation, lookup_scheduled_at, lookup_attempts,
       paid_late, preceding_status, buyer_user_id, buyer_email, buyer_session_id,
       public_token_hash, idempotency_key_hash, request_hash, product_snapshot, price_snapshot,
       merchant_reference, description, success_url, failure_url, webhook_endpoint_id,
       webhook_config_version, metadata,
       version, created_at, updated_at
FROM payment_intents
WHERE merchant_id = $1
  AND payment_mode = $2
  AND merchant_reference = $3
  AND source = 'QRIS_API';

-- name: GatewayGetPaymentIntentByIdempotency :one
SELECT id, order_id, store_id, merchant_id, payment_mode, source, provider, account_scope,
       provider_reference, external_id, amount_idr, currency, fee_snapshot_id,
       coupon_reservation_id, stock_reservation_id, status, provider_financial_state,
       qr_string, qr_image_url, expires_at, cancel_requested_at, expire_requested_at,
       cancel_reason, expire_reason, unknown_operation, lookup_scheduled_at, lookup_attempts,
       paid_late, preceding_status, buyer_user_id, buyer_email, buyer_session_id,
       public_token_hash, idempotency_key_hash, request_hash, product_snapshot, price_snapshot,
       merchant_reference, description, success_url, failure_url, webhook_endpoint_id,
       webhook_config_version, metadata,
       version, created_at, updated_at
FROM payment_intents
WHERE source = 'QRIS_API'
  AND payment_mode = $1
  AND idempotency_key_hash = $2
  AND merchant_id = $3;

-- name: GatewayUpdatePaymentIntentStatus :one
UPDATE payment_intents
SET status = $2,
    provider_reference = COALESCE(sqlc.narg('provider_reference')::text, provider_reference),
    qr_string = COALESCE(sqlc.narg('qr_string')::text, qr_string),
    qr_image_url = COALESCE(sqlc.narg('qr_image_url')::text, qr_image_url),
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
       merchant_reference, description, success_url, failure_url, webhook_endpoint_id,
       webhook_config_version, metadata,
       version, created_at, updated_at;

-- name: GatewayForceUpdatePaymentIntent :one
UPDATE payment_intents
SET status = $2,
    provider_reference = COALESCE(sqlc.narg('provider_reference')::text, provider_reference),
    qr_string = COALESCE(sqlc.narg('qr_string')::text, qr_string),
    qr_image_url = COALESCE(sqlc.narg('qr_image_url')::text, qr_image_url),
    cancel_requested_at = COALESCE(sqlc.narg('cancel_requested_at')::timestamptz, cancel_requested_at),
    cancel_reason = COALESCE(sqlc.narg('cancel_reason')::text, cancel_reason),
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
       merchant_reference, description, success_url, failure_url, webhook_endpoint_id,
       webhook_config_version, metadata,
       version, created_at, updated_at;

-- name: GatewayUpdateOrderStatus :exec
UPDATE orders
SET payment_status = $2,
    order_status = $3,
    updated_at = $4
WHERE id = $1;

-- name: GatewayInsertEvent :exec
INSERT INTO gateway_payment_events (
    id, merchant_id, payment_mode, payment_intent_id, event_type, payload, created_at
) VALUES ($1, $2, $3, $4, $5, $6, $7);

-- name: GatewayGetEventByID :one
SELECT id, merchant_id, payment_mode, payment_intent_id, event_type, payload, created_at
FROM gateway_payment_events
WHERE id = $1;

-- name: GatewayListEventsByIntent :many
SELECT id, merchant_id, payment_mode, payment_intent_id, event_type, payload, created_at
FROM gateway_payment_events
WHERE payment_intent_id = $1
  AND merchant_id = $2
ORDER BY created_at DESC, id DESC
LIMIT $3;

-- name: GatewayInsertOutbox :exec
INSERT INTO outbox_events (id, topic, payload, status, available_at, created_at, dedupe_key, payment_mode)
VALUES ($1, $2, $3, 'pending', $4, now(), $5, $6);

-- name: GatewayTryInsertIdempotency :one
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

-- name: GatewayGetIdempotency :one
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

-- name: GatewayCompleteIdempotency :one
UPDATE idempotency_records
SET status = $2,
    resource_type = $3,
    resource_id = $4,
    response_status = $5,
    response_body = $6,
    updated_at = now()
WHERE id = $1
RETURNING id, subject_type, subject_id, operation, payment_mode, key_hash, request_hash,
          status, resource_type, resource_id, response_status, response_body, request_id,
          lease_expires_at, expires_at, created_at, updated_at;
