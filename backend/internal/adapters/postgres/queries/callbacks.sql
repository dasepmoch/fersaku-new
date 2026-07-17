-- BE-330 inbound Xendit callbacks

-- name: CallbackInsertRejection :exec
INSERT INTO provider_callback_rejections (
    id, provider, account_scope, payment_mode, reason, http_status,
    content_type, body_bytes, body_digest, client_ip, request_id, received_at, created_at
) VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10, $11, $12, $13
);

-- name: CallbackInsertProviderEvent :one
INSERT INTO payment_provider_events (
    callback_id, provider, account_scope, payment_mode, provider_event_id,
    received_at, normalized_type, processing_state, failure_code, attempt_count,
    payment_intent_id, payload_digest, encrypted_payload,
    raw_event_type, provider_reference, external_id, amount_idr, currency,
    created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5,
    $6, $7, $8, $9, $10,
    $11, $12, $13,
    $14, $15, $16, $17, $18,
    $19, $20
)
ON CONFLICT (provider, account_scope, payment_mode, provider_event_id)
DO NOTHING
RETURNING callback_id, provider, account_scope, payment_mode, provider_event_id,
          received_at, normalized_type, processing_state, failure_code, attempt_count,
          lease_owner, lease_until, next_retry_at, processed_at, payment_intent_id,
          payload_digest, encrypted_payload, raw_event_type, provider_reference,
          external_id, amount_idr, currency, mismatch_code, alert_code,
          replay_count, last_replay_at, last_replay_reason, quarantine_reason,
          created_at, updated_at;

-- name: CallbackGetProviderEventByCanonical :one
SELECT callback_id, provider, account_scope, payment_mode, provider_event_id,
       received_at, normalized_type, processing_state, failure_code, attempt_count,
       lease_owner, lease_until, next_retry_at, processed_at, payment_intent_id,
       payload_digest, encrypted_payload, raw_event_type, provider_reference,
       external_id, amount_idr, currency, mismatch_code, alert_code,
       replay_count, last_replay_at, last_replay_reason, quarantine_reason,
       created_at, updated_at
FROM payment_provider_events
WHERE provider = $1
  AND account_scope = $2
  AND payment_mode = $3
  AND provider_event_id = $4;

-- name: CallbackGetProviderEventByID :one
SELECT callback_id, provider, account_scope, payment_mode, provider_event_id,
       received_at, normalized_type, processing_state, failure_code, attempt_count,
       lease_owner, lease_until, next_retry_at, processed_at, payment_intent_id,
       payload_digest, encrypted_payload, raw_event_type, provider_reference,
       external_id, amount_idr, currency, mismatch_code, alert_code,
       replay_count, last_replay_at, last_replay_reason, quarantine_reason,
       created_at, updated_at
FROM payment_provider_events
WHERE callback_id = $1;

-- name: CallbackLockProviderEvent :one
SELECT callback_id, provider, account_scope, payment_mode, provider_event_id,
       received_at, normalized_type, processing_state, failure_code, attempt_count,
       lease_owner, lease_until, next_retry_at, processed_at, payment_intent_id,
       payload_digest, encrypted_payload, raw_event_type, provider_reference,
       external_id, amount_idr, currency, mismatch_code, alert_code,
       replay_count, last_replay_at, last_replay_reason, quarantine_reason,
       created_at, updated_at
FROM payment_provider_events
WHERE callback_id = $1
FOR UPDATE;

-- name: CallbackUpdateProviderEventState :one
UPDATE payment_provider_events
SET processing_state = $2,
    failure_code = sqlc.narg('failure_code')::text,
    attempt_count = COALESCE(sqlc.narg('attempt_count')::integer, attempt_count),
    lease_owner = sqlc.narg('lease_owner')::text,
    lease_until = sqlc.narg('lease_until')::timestamptz,
    next_retry_at = sqlc.narg('next_retry_at')::timestamptz,
    processed_at = sqlc.narg('processed_at')::timestamptz,
    payment_intent_id = COALESCE(sqlc.narg('payment_intent_id')::text, payment_intent_id),
    normalized_type = COALESCE(sqlc.narg('normalized_type')::text, normalized_type),
    mismatch_code = sqlc.narg('mismatch_code')::text,
    alert_code = sqlc.narg('alert_code')::text,
    quarantine_reason = sqlc.narg('quarantine_reason')::text,
    replay_count = COALESCE(sqlc.narg('replay_count')::integer, replay_count),
    last_replay_at = COALESCE(sqlc.narg('last_replay_at')::timestamptz, last_replay_at),
    last_replay_reason = COALESCE(sqlc.narg('last_replay_reason')::text, last_replay_reason),
    updated_at = $3
WHERE callback_id = $1
RETURNING callback_id, provider, account_scope, payment_mode, provider_event_id,
          received_at, normalized_type, processing_state, failure_code, attempt_count,
          lease_owner, lease_until, next_retry_at, processed_at, payment_intent_id,
          payload_digest, encrypted_payload, raw_event_type, provider_reference,
          external_id, amount_idr, currency, mismatch_code, alert_code,
          replay_count, last_replay_at, last_replay_reason, quarantine_reason,
          created_at, updated_at;

-- name: CallbackListProviderEventsReady :many
SELECT callback_id, provider, account_scope, payment_mode, provider_event_id,
       received_at, normalized_type, processing_state, failure_code, attempt_count,
       lease_owner, lease_until, next_retry_at, processed_at, payment_intent_id,
       payload_digest, encrypted_payload, raw_event_type, provider_reference,
       external_id, amount_idr, currency, mismatch_code, alert_code,
       replay_count, last_replay_at, last_replay_reason, quarantine_reason,
       created_at, updated_at
FROM payment_provider_events
WHERE processing_state IN ('ACCEPTED', 'FAILED')
  AND (next_retry_at IS NULL OR next_retry_at <= $1)
ORDER BY received_at ASC, callback_id ASC
LIMIT $2;

-- name: CallbackGetPaymentIntentByProviderRefForUpdate :one
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
  AND provider_reference = $4
FOR UPDATE;

-- name: CallbackGetPaymentIntentByExternalIDForUpdate :one
SELECT id, order_id, store_id, merchant_id, payment_mode, source, provider, account_scope,
       provider_reference, external_id, amount_idr, currency, fee_snapshot_id,
       coupon_reservation_id, stock_reservation_id, status, provider_financial_state,
       qr_string, qr_image_url, expires_at, cancel_requested_at, expire_requested_at,
       cancel_reason, expire_reason, unknown_operation, lookup_scheduled_at, lookup_attempts,
       paid_late, preceding_status, buyer_user_id, buyer_email, buyer_session_id,
       public_token_hash, idempotency_key_hash, request_hash, product_snapshot, price_snapshot,
       version, created_at, updated_at
FROM payment_intents
WHERE payment_mode = $1
  AND external_id = $2
FOR UPDATE;

-- name: CallbackGetPaymentIntentByIDForUpdate :one
SELECT id, order_id, store_id, merchant_id, payment_mode, source, provider, account_scope,
       provider_reference, external_id, amount_idr, currency, fee_snapshot_id,
       coupon_reservation_id, stock_reservation_id, status, provider_financial_state,
       qr_string, qr_image_url, expires_at, cancel_requested_at, expire_requested_at,
       cancel_reason, expire_reason, unknown_operation, lookup_scheduled_at, lookup_attempts,
       paid_late, preceding_status, buyer_user_id, buyer_email, buyer_session_id,
       public_token_hash, idempotency_key_hash, request_hash, product_snapshot, price_snapshot,
       version, created_at, updated_at
FROM payment_intents
WHERE id = $1
FOR UPDATE;

-- name: CallbackMarkPaymentPaid :one
UPDATE payment_intents
SET status = 'PAID',
    paid_late = $2,
    preceding_status = $3,
    provider_financial_state = COALESCE(sqlc.narg('provider_financial_state')::text, provider_financial_state),
    unknown_operation = NULL,
    lookup_scheduled_at = NULL,
    version = version + 1,
    updated_at = $4
WHERE id = $1
  AND status <> 'PAID'
RETURNING id, order_id, store_id, merchant_id, payment_mode, source, provider, account_scope,
       provider_reference, external_id, amount_idr, currency, fee_snapshot_id,
       coupon_reservation_id, stock_reservation_id, status, provider_financial_state,
       qr_string, qr_image_url, expires_at, cancel_requested_at, expire_requested_at,
       cancel_reason, expire_reason, unknown_operation, lookup_scheduled_at, lookup_attempts,
       paid_late, preceding_status, buyer_user_id, buyer_email, buyer_session_id,
       public_token_hash, idempotency_key_hash, request_hash, product_snapshot, price_snapshot,
       version, created_at, updated_at;

-- name: CallbackMarkPaymentTerminal :one
UPDATE payment_intents
SET status = $2,
    preceding_status = COALESCE(sqlc.narg('preceding_status')::text, preceding_status),
    version = version + 1,
    updated_at = $3
WHERE id = $1
  AND status NOT IN ('PAID', 'FAILED', 'EXPIRED', 'CANCELLED')
RETURNING id, order_id, store_id, merchant_id, payment_mode, source, provider, account_scope,
       provider_reference, external_id, amount_idr, currency, fee_snapshot_id,
       coupon_reservation_id, stock_reservation_id, status, provider_financial_state,
       qr_string, qr_image_url, expires_at, cancel_requested_at, expire_requested_at,
       cancel_reason, expire_reason, unknown_operation, lookup_scheduled_at, lookup_attempts,
       paid_late, preceding_status, buyer_user_id, buyer_email, buyer_session_id,
       public_token_hash, idempotency_key_hash, request_hash, product_snapshot, price_snapshot,
       version, created_at, updated_at;

-- name: CallbackSetFinancialState :exec
UPDATE payment_intents
SET provider_financial_state = $2,
    version = version + 1,
    updated_at = $3
WHERE id = $1;

-- name: CallbackMarkOrderPaid :exec
UPDATE orders
SET payment_status = 'PAID',
    order_status = 'PAID',
    paid_at = COALESCE(paid_at, $2),
    updated_at = $2
WHERE id = $1;

-- name: CallbackMarkOrderTerminal :exec
UPDATE orders
SET payment_status = $2,
    order_status = $3,
    updated_at = $4
WHERE id = $1
  AND payment_status <> 'PAID';

-- name: CallbackInsertSettlement :one
INSERT INTO payment_settlements (
    id, payment_intent_id, order_id, merchant_id, store_id, payment_mode, source,
    provider, account_scope, provider_reference, provider_event_id, journal_reference,
    gross_idr, fee_idr, merchant_net_idr, currency, paid_late, preceding_status,
    status, posted_at, created_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7,
    $8, $9, $10, $11, $12,
    $13, $14, $15, $16, $17, $18,
    $19, $20, $21
)
ON CONFLICT (journal_reference) DO NOTHING
RETURNING id, payment_intent_id, order_id, merchant_id, store_id, payment_mode, source,
          provider, account_scope, provider_reference, provider_event_id, journal_reference,
          gross_idr, fee_idr, merchant_net_idr, currency, paid_late, preceding_status,
          status, posted_at, created_at;

-- name: CallbackGetSettlementByIntent :one
SELECT id, payment_intent_id, order_id, merchant_id, store_id, payment_mode, source,
       provider, account_scope, provider_reference, provider_event_id, journal_reference,
       gross_idr, fee_idr, merchant_net_idr, currency, paid_late, preceding_status,
       status, posted_at, created_at
FROM payment_settlements
WHERE payment_intent_id = $1;

-- name: CallbackInsertOutbox :exec
INSERT INTO outbox_events (id, topic, payload, status, available_at, created_at, dedupe_key, payment_mode)
VALUES ($1, $2, $3, 'pending', $4, now(), $5, $6)
ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

-- name: CallbackGetOrderByID :one
SELECT id, order_number, store_id, merchant_id, buyer_user_id, buyer_email, buyer_name,
       payment_status, COALESCE(order_status, 'CREATED') AS order_status,
       source, COALESCE(payment_mode, 'SANDBOX') AS payment_mode, currency,
       subtotal_idr, discount_idr, tip_idr, fee_idr, gross_idr, merchant_net_idr,
       coupon_code, coupon_version, fee_snapshot_id, coupon_reservation_id,
       public_token_hash, buyer_session_id, expires_at, idempotency_key_hash,
       paid_at, created_at, updated_at
FROM orders
WHERE id = $1;

-- name: CallbackCountSettlementsByIntent :one
SELECT count(*)::bigint AS n FROM payment_settlements WHERE payment_intent_id = $1;

-- name: CallbackCountProviderEventsByCanonical :one
SELECT count(*)::bigint AS n
FROM payment_provider_events
WHERE provider = $1
  AND account_scope = $2
  AND payment_mode = $3
  AND provider_event_id = $4;

-- name: CallbackCountRejections :one
SELECT count(*)::bigint AS n FROM provider_callback_rejections WHERE reason = $1;

-- name: CallbackListAdminProviderEvents :many
SELECT callback_id, provider, account_scope, payment_mode, provider_event_id,
       received_at, normalized_type, processing_state, failure_code, attempt_count,
       lease_owner, lease_until, next_retry_at, processed_at, payment_intent_id,
       payload_digest, encrypted_payload, raw_event_type, provider_reference,
       external_id, amount_idr, currency, mismatch_code, alert_code,
       replay_count, last_replay_at, last_replay_reason, quarantine_reason,
       created_at, updated_at
FROM payment_provider_events
ORDER BY received_at DESC, callback_id DESC
LIMIT $1;
