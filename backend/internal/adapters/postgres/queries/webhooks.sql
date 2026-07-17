-- BE-420 outbound seller webhooks

-- name: WhInsertEndpoint :exec
INSERT INTO seller_webhook_endpoints (
    id, merchant_id, store_id, payment_mode, url, url_host, status, config_version,
    event_allowlist, current_secret_version, previous_secret_version,
    secret_overlap_expires_at, failure_count, created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
);

-- name: WhGetEndpoint :one
SELECT id, merchant_id, store_id, payment_mode, url, url_host, status, config_version,
       event_allowlist, current_secret_version, previous_secret_version,
       secret_overlap_expires_at, failure_count, last_success_at, last_failure_at,
       disabled_at, disabled_reason, created_at, updated_at
FROM seller_webhook_endpoints
WHERE id = $1;

-- name: WhListEndpointsByMerchant :many
SELECT id, merchant_id, store_id, payment_mode, url, url_host, status, config_version,
       event_allowlist, current_secret_version, previous_secret_version,
       secret_overlap_expires_at, failure_count, last_success_at, last_failure_at,
       disabled_at, disabled_reason, created_at, updated_at
FROM seller_webhook_endpoints
WHERE merchant_id = $1
ORDER BY created_at DESC, id DESC
LIMIT $2;

-- name: WhUpdateEndpoint :exec
UPDATE seller_webhook_endpoints
SET url = $2,
    url_host = $3,
    status = $4,
    config_version = $5,
    event_allowlist = $6,
    current_secret_version = $7,
    previous_secret_version = $8,
    secret_overlap_expires_at = $9,
    failure_count = $10,
    last_success_at = $11,
    last_failure_at = $12,
    disabled_at = $13,
    disabled_reason = $14,
    updated_at = $15
WHERE id = $1;

-- name: WhInsertSecretVersion :exec
INSERT INTO webhook_endpoint_secret_versions (
    id, endpoint_id, merchant_id, version, status, secret_ciphertext, secret_key_version,
    fingerprint, activated_at, superseded_at, overlap_expires_at, created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
);

-- name: WhGetSecretVersion :one
SELECT id, endpoint_id, merchant_id, version, status, secret_ciphertext, secret_key_version,
       fingerprint, activated_at, superseded_at, overlap_expires_at, created_at, updated_at
FROM webhook_endpoint_secret_versions
WHERE endpoint_id = $1 AND version = $2;

-- name: WhGetActiveSecret :one
SELECT id, endpoint_id, merchant_id, version, status, secret_ciphertext, secret_key_version,
       fingerprint, activated_at, superseded_at, overlap_expires_at, created_at, updated_at
FROM webhook_endpoint_secret_versions
WHERE endpoint_id = $1 AND status = 'ACTIVE';

-- name: WhListSecretVersions :many
SELECT id, endpoint_id, merchant_id, version, status, secret_ciphertext, secret_key_version,
       fingerprint, activated_at, superseded_at, overlap_expires_at, created_at, updated_at
FROM webhook_endpoint_secret_versions
WHERE endpoint_id = $1
ORDER BY version DESC;

-- name: WhUpdateSecretVersion :exec
UPDATE webhook_endpoint_secret_versions
SET status = $2,
    activated_at = $3,
    superseded_at = $4,
    overlap_expires_at = $5,
    updated_at = $6
WHERE id = $1;

-- name: WhInsertDelivery :exec
INSERT INTO webhook_deliveries (
    id, endpoint_id, merchant_id, store_id, payment_mode, event_id, event_type,
    payload_version, payload_body, payload_hash, source_kind, payment_intent_id,
    order_id, withdrawal_id, is_test, status, attempt_count, max_attempts,
    next_retry_at, created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
);

-- name: WhGetDelivery :one
SELECT id, endpoint_id, merchant_id, store_id, payment_mode, event_id, event_type,
       payload_version, payload_body, payload_hash, source_kind, payment_intent_id,
       order_id, withdrawal_id, is_test, status, attempt_count, max_attempts,
       next_retry_at, last_http_status, last_latency_ms, last_error_class,
       dead_letter_reason, delivered_at, cancelled_at, created_at, updated_at
FROM webhook_deliveries
WHERE id = $1;

-- name: WhGetDeliveryByEndpointEvent :one
SELECT id, endpoint_id, merchant_id, store_id, payment_mode, event_id, event_type,
       payload_version, payload_body, payload_hash, source_kind, payment_intent_id,
       order_id, withdrawal_id, is_test, status, attempt_count, max_attempts,
       next_retry_at, last_http_status, last_latency_ms, last_error_class,
       dead_letter_reason, delivered_at, cancelled_at, created_at, updated_at
FROM webhook_deliveries
WHERE endpoint_id = $1 AND event_id = $2;

-- name: WhUpdateDelivery :exec
UPDATE webhook_deliveries
SET status = $2,
    attempt_count = $3,
    next_retry_at = $4,
    last_http_status = $5,
    last_latency_ms = $6,
    last_error_class = $7,
    dead_letter_reason = $8,
    delivered_at = $9,
    cancelled_at = $10,
    updated_at = $11
WHERE id = $1;

-- name: WhListDeliveriesByMerchant :many
SELECT id, endpoint_id, merchant_id, store_id, payment_mode, event_id, event_type,
       payload_version, payload_body, payload_hash, source_kind, payment_intent_id,
       order_id, withdrawal_id, is_test, status, attempt_count, max_attempts,
       next_retry_at, last_http_status, last_latency_ms, last_error_class,
       dead_letter_reason, delivered_at, cancelled_at, created_at, updated_at
FROM webhook_deliveries
WHERE merchant_id = $1
  AND ($2 = '' OR status = $2)
ORDER BY created_at DESC, id DESC
LIMIT $3;

-- name: WhListAdminDeliveries :many
SELECT d.id, d.endpoint_id, d.merchant_id, d.store_id, d.payment_mode, d.event_id, d.event_type,
       d.status, d.attempt_count, d.next_retry_at, d.last_http_status, d.last_latency_ms,
       d.last_error_class, d.dead_letter_reason, d.is_test, d.created_at, d.updated_at,
       e.url_host
FROM webhook_deliveries d
JOIN seller_webhook_endpoints e ON e.id = d.endpoint_id
WHERE ($1 = '' OR d.status = $1)
  AND ($2 = '' OR d.merchant_id = $2)
ORDER BY d.created_at DESC, d.id DESC
LIMIT $3;

-- name: WhInsertAttempt :exec
INSERT INTO webhook_delivery_attempts (
    id, delivery_id, attempt_no, signed_timestamp, signature_header, request_url,
    http_status, latency_ms, error_class, error_detail, response_snippet,
    started_at, finished_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
);

-- name: WhListAttempts :many
SELECT id, delivery_id, attempt_no, signed_timestamp, signature_header, request_url,
       http_status, latency_ms, error_class, error_detail, response_snippet,
       started_at, finished_at
FROM webhook_delivery_attempts
WHERE delivery_id = $1
ORDER BY attempt_no ASC;

-- name: WhInsertDeadLetter :exec
INSERT INTO webhook_dead_letters (
    id, delivery_id, endpoint_id, merchant_id, event_id, event_type, reason,
    last_http_status, attempt_count, created_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
)
ON CONFLICT (delivery_id) DO NOTHING;

-- name: WhResolveDeadLetter :exec
UPDATE webhook_dead_letters
SET resolved_at = $2,
    resolved_by = $3,
    resolve_reason = $4
WHERE delivery_id = $1 AND resolved_at IS NULL;

-- name: WhInsertOutbox :exec
INSERT INTO outbox_events (id, topic, payload, status, available_at, created_at, dedupe_key, payment_mode)
VALUES ($1, $2, $3, 'pending', $4, now(), $5, $6);

-- name: WhGetStoreMerchant :one
SELECT id, merchant_id, status FROM stores WHERE id = $1;

-- name: WhMerchantMemberActive :one
SELECT role_in_merchant
FROM merchant_members
WHERE merchant_id = $1 AND user_id = $2 AND status = 'ACTIVE';

-- name: WhGetMerchantByOwner :one
SELECT id, status FROM merchants WHERE owner_user_id = $1 LIMIT 1;

-- name: WhInsertSecretClaim :exec
INSERT INTO secret_claims (
    id, kind, resource_type, resource_id, resource_version, merchant_id, recipient_user_id,
    claim_token_hash, status, attempts, max_attempts, expires_at, mfa_binding_session_id,
    created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
);

-- name: WhGetSecretClaimByHash :one
SELECT id, kind, resource_type, resource_id, resource_version, merchant_id, recipient_user_id,
       claim_token_hash, status, attempts, max_attempts, expires_at, consumed_at,
       mfa_binding_session_id, issuance_request_id, created_at, updated_at
FROM secret_claims
WHERE claim_token_hash = $1;

-- name: WhConsumeSecretClaim :exec
UPDATE secret_claims
SET status = 'CONSUMED',
    consumed_at = $2,
    updated_at = $2
WHERE id = $1 AND status = 'ACTIVE';

-- name: WhRevokeActiveSecretClaimsForResource :exec
UPDATE secret_claims
SET status = 'REVOKED',
    updated_at = $4
WHERE kind = $1
  AND resource_type = $2
  AND resource_id = $3
  AND status = 'ACTIVE';
