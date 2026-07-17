-- BE-510 admin operations

-- name: AdminOpsGetMerchant :one
SELECT id, owner_user_id, display_name, status, suspension_reason, suspended_at, suspended_by, created_at, updated_at
FROM merchants
WHERE id = $1;

-- name: AdminOpsUpdateMerchantStatus :one
UPDATE merchants
SET status = $2,
    suspension_reason = $3,
    suspended_at = $4,
    suspended_by = $5,
    updated_at = $6
WHERE id = $1
RETURNING id, owner_user_id, display_name, status, suspension_reason, suspended_at, suspended_by, created_at, updated_at;

-- name: AdminOpsGetCapability :one
SELECT id, merchant_id, payment_mode, capability, status, kyc_case_id, kyc_version,
       suspension_reason, suspended_by, effective_at, expires_at, created_at, updated_at
FROM merchant_api_capabilities
WHERE merchant_id = $1 AND payment_mode = $2 AND capability = $3;

-- name: AdminOpsUpsertCapabilityAccess :exec
INSERT INTO merchant_api_capabilities (
    id, merchant_id, payment_mode, capability, status,
    suspension_reason, suspended_by, effective_at, created_at, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
ON CONFLICT (merchant_id, payment_mode, capability) DO UPDATE SET
    status = EXCLUDED.status,
    suspension_reason = EXCLUDED.suspension_reason,
    suspended_by = EXCLUDED.suspended_by,
    effective_at = EXCLUDED.effective_at,
    updated_at = EXCLUDED.updated_at;

-- name: AdminOpsListEmergency :many
SELECT switch_name, enabled, version, reason, incident_ticket, updated_by, effective_at, created_at, updated_at
FROM platform_emergency_controls
ORDER BY switch_name;

-- name: AdminOpsGetEmergency :one
SELECT switch_name, enabled, version, reason, incident_ticket, updated_by, effective_at, created_at, updated_at
FROM platform_emergency_controls
WHERE switch_name = $1;

-- name: AdminOpsUpdateEmergency :one
UPDATE platform_emergency_controls
SET enabled = $2,
    version = version + 1,
    reason = $3,
    incident_ticket = $4,
    updated_by = $5,
    effective_at = $6,
    updated_at = $6
WHERE switch_name = $1 AND version = $7
RETURNING switch_name, enabled, version, reason, incident_ticket, updated_by, effective_at, created_at, updated_at;

-- AdminOpsInsertAudit removed: use AuditRepo.Append / callAppendAuditEvent (BE-530).

-- name: AdminOpsListAudit :many
SELECT id, sequence_no, payload_hash, created_at,
       actor_user_id, action, resource_type, resource_id, reason, request_id, merchant_id, metadata_json,
       chain_scope, prev_hash, row_hash, canonical_version, canonical_payload, jcs_payload
FROM audit_events
WHERE (sqlc.narg('action')::text IS NULL OR action = sqlc.narg('action'))
  AND (sqlc.narg('resource_type')::text IS NULL OR resource_type = sqlc.narg('resource_type'))
  AND (sqlc.narg('resource_id')::text IS NULL OR resource_id = sqlc.narg('resource_id'))
  AND (sqlc.narg('actor_user_id')::text IS NULL OR actor_user_id = sqlc.narg('actor_user_id'))
  AND (sqlc.narg('from_at')::timestamptz IS NULL OR created_at >= sqlc.narg('from_at'))
  AND (sqlc.narg('to_at')::timestamptz IS NULL OR created_at <= sqlc.narg('to_at'))
  AND (
    sqlc.narg('cursor_at')::timestamptz IS NULL
    OR (created_at, sequence_no) < (sqlc.narg('cursor_at')::timestamptz, sqlc.narg('cursor_seq')::bigint)
  )
ORDER BY created_at DESC, sequence_no DESC
LIMIT sqlc.arg('limit_count');

-- name: AdminOpsGetAudit :one
SELECT id, sequence_no, payload_hash, created_at,
       actor_user_id, action, resource_type, resource_id, reason, request_id, merchant_id, metadata_json,
       chain_scope, prev_hash, row_hash, canonical_version, canonical_payload, jcs_payload
FROM audit_events
WHERE id = $1;



-- name: AdminOpsInsertAuditExport :exec
INSERT INTO audit_exports (
    id, status, filter_json, redaction_policy, requester_id, reason, created_at, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);

-- name: AdminOpsGetAuditExport :one
SELECT id, status, filter_json, redaction_policy, requester_id, reason,
       row_count, error_message, expires_at, completed_at, created_at, updated_at
FROM audit_exports
WHERE id = $1;

-- name: AdminOpsCompleteAuditExport :exec
UPDATE audit_exports
SET status = $2, row_count = $3, completed_at = $4, expires_at = $5, updated_at = $4, error_message = $6
WHERE id = $1;

-- name: AdminOpsListPaymentMismatches :many
SELECT
    pe.callback_id AS event_id,
    pe.payment_intent_id,
    pe.provider_reference,
    pe.amount_idr,
    pe.processing_state,
    pe.received_at,
    pe.alert_code,
    pe.mismatch_code,
    pe.replay_count,
    pi.status AS local_status,
    pi.merchant_id,
    pi.order_id,
    pi.amount_idr AS intent_amount_idr,
    m.display_name AS merchant_name
FROM payment_provider_events pe
JOIN payment_intents pi ON pi.id = pe.payment_intent_id
LEFT JOIN merchants m ON m.id = pi.merchant_id
WHERE pe.normalized_type = 'PAID'
  AND pi.status <> 'PAID'
  AND pe.payment_intent_id IS NOT NULL
ORDER BY pe.received_at DESC, pe.callback_id DESC
LIMIT $1;

-- name: AdminOpsUpdateReviewStatus :one
UPDATE product_reviews
SET status = $2, updated_at = $3
WHERE id = $1
RETURNING id, store_id, merchant_id, product_id, order_id, order_item_id, buyer_user_id,
          rating, title, body, status, verified_purchase, content_version, created_at, updated_at;

-- name: AdminOpsGetReview :one
SELECT id, store_id, merchant_id, product_id, order_id, order_item_id, buyer_user_id,
       rating, title, body, status, verified_purchase, content_version, created_at, updated_at
FROM product_reviews
WHERE id = $1;

-- name: AdminOpsGetBuyerUser :one
SELECT id, email_display, email_normalized, name, status, email_verified_at, created_at
FROM users
WHERE id = $1;

-- name: AdminOpsGetPaymentIntent :one
SELECT id, order_id, store_id, merchant_id, payment_mode, source, provider,
       account_scope, provider_reference, external_id, amount_idr, status, created_at
FROM payment_intents
WHERE id = $1;
