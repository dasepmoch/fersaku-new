-- BE-410 Credential lifecycle

-- name: CredListAPIKeysByMerchant :many
SELECT id, merchant_id, key_prefix, key_hash, payment_mode, status, name,
       last_used_at, revoked_at, expires_at, created_at, updated_at,
       key_version, issuance_request_id, fingerprint
FROM merchant_api_keys
WHERE merchant_id = $1
ORDER BY created_at DESC, id DESC
LIMIT $2;

-- name: CredGetAPIKeyByID :one
SELECT id, merchant_id, key_prefix, key_hash, payment_mode, status, name,
       last_used_at, revoked_at, expires_at, created_at, updated_at,
       key_version, issuance_request_id, fingerprint
FROM merchant_api_keys
WHERE id = $1;

-- name: CredGetActiveAPIKey :one
SELECT id, merchant_id, key_prefix, key_hash, payment_mode, status, name,
       last_used_at, revoked_at, expires_at, created_at, updated_at,
       key_version, issuance_request_id, fingerprint
FROM merchant_api_keys
WHERE merchant_id = $1 AND status = 'ACTIVE'
LIMIT 1;

-- name: CredInsertAPIKey :exec
INSERT INTO merchant_api_keys (
    id, merchant_id, key_prefix, key_hash, payment_mode, status, name,
    key_version, issuance_request_id, fingerprint, created_at, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12);

-- name: CredRevokeAPIKey :exec
UPDATE merchant_api_keys
SET status = 'REVOKED',
    revoked_at = $2,
    updated_at = $2
WHERE id = $1 AND status IN ('ACTIVE', 'SUSPENDED');

-- name: CredSuspendAPIKey :exec
UPDATE merchant_api_keys
SET status = 'SUSPENDED',
    updated_at = $2
WHERE id = $1 AND status = 'ACTIVE';

-- name: CredReactivateAPIKey :exec
UPDATE merchant_api_keys
SET status = 'ACTIVE',
    updated_at = $2
WHERE id = $1 AND status = 'SUSPENDED';

-- name: CredRevokeAllActiveKeys :exec
UPDATE merchant_api_keys
SET status = 'REVOKED',
    revoked_at = $2,
    updated_at = $2
WHERE merchant_id = $1 AND status = 'ACTIVE';

-- name: CredInsertIssuance :exec
INSERT INTO api_credential_issuance_requests (
    id, merchant_id, payment_mode, purpose, capability, status,
    kyc_case_id, kyc_version, requester_user_id, authorizer_user_id, reason,
    authorized_at, expires_at,
    claim_token_hash, claim_expires_at, claim_recipient_user_id, claim_attempts,
    mfa_binding_session_id, expected_predecessor_key_id, expected_version,
    request_version, idempotency_key_hash,
    created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10, $11,
    $12, $13,
    $14, $15, $16, $17,
    $18, $19, $20,
    $21, $22,
    $23, $24
);

-- name: CredGetIssuanceByID :one
SELECT id, merchant_id, payment_mode, purpose, capability, status,
       kyc_case_id, kyc_version, requester_user_id, authorizer_user_id, reason,
       authorized_at, claimed_at, expires_at, revoked_at, created_at, updated_at,
       claim_token_hash, claim_expires_at, claim_recipient_user_id, claim_attempts,
       claim_consumed_at, mfa_binding_session_id, expected_predecessor_key_id,
       expected_version, request_version, idempotency_key_hash, resulting_api_key_id
FROM api_credential_issuance_requests
WHERE id = $1;

-- name: CredGetIssuanceByClaimHash :one
SELECT id, merchant_id, payment_mode, purpose, capability, status,
       kyc_case_id, kyc_version, requester_user_id, authorizer_user_id, reason,
       authorized_at, claimed_at, expires_at, revoked_at, created_at, updated_at,
       claim_token_hash, claim_expires_at, claim_recipient_user_id, claim_attempts,
       claim_consumed_at, mfa_binding_session_id, expected_predecessor_key_id,
       expected_version, request_version, idempotency_key_hash, resulting_api_key_id
FROM api_credential_issuance_requests
WHERE claim_token_hash = $1
  AND status = 'AUTHORIZED'
LIMIT 1;

-- name: CredGetOutstandingIssuance :one
SELECT id, merchant_id, payment_mode, purpose, capability, status,
       kyc_case_id, kyc_version, requester_user_id, authorizer_user_id, reason,
       authorized_at, claimed_at, expires_at, revoked_at, created_at, updated_at,
       claim_token_hash, claim_expires_at, claim_recipient_user_id, claim_attempts,
       claim_consumed_at, mfa_binding_session_id, expected_predecessor_key_id,
       expected_version, request_version, idempotency_key_hash, resulting_api_key_id
FROM api_credential_issuance_requests
WHERE merchant_id = $1
  AND payment_mode = $2
  AND status IN ('PENDING_KYC', 'AUTHORIZED')
LIMIT 1;

-- name: CredListIssuancesByMerchant :many
SELECT id, merchant_id, payment_mode, purpose, capability, status,
       kyc_case_id, kyc_version, requester_user_id, authorizer_user_id, reason,
       authorized_at, claimed_at, expires_at, revoked_at, created_at, updated_at,
       claim_token_hash, claim_expires_at, claim_recipient_user_id, claim_attempts,
       claim_consumed_at, mfa_binding_session_id, expected_predecessor_key_id,
       expected_version, request_version, idempotency_key_hash, resulting_api_key_id
FROM api_credential_issuance_requests
WHERE merchant_id = $1
ORDER BY created_at DESC, id DESC
LIMIT $2;

-- name: CredMarkIssuanceClaimed :exec
UPDATE api_credential_issuance_requests
SET status = 'CLAIMED',
    claimed_at = $2,
    claim_consumed_at = $2,
    resulting_api_key_id = $3,
    updated_at = $2
WHERE id = $1
  AND status = 'AUTHORIZED';

-- name: CredUpdateIssuanceClaimToken :exec
UPDATE api_credential_issuance_requests
SET claim_token_hash = $2,
    claim_expires_at = $3,
    claim_recipient_user_id = $4,
    claim_attempts = 0,
    claim_consumed_at = NULL,
    mfa_binding_session_id = $5,
    status = COALESCE(NULLIF($6, ''), status),
    authorizer_user_id = COALESCE(sqlc.narg('authorizer_user_id'), authorizer_user_id),
    authorized_at = COALESCE(sqlc.narg('authorized_at'), authorized_at),
    expires_at = COALESCE(sqlc.narg('expires_at'), expires_at),
    reason = COALESCE(NULLIF(sqlc.arg('reason'), ''), reason),
    updated_at = $7
WHERE id = $1;

-- name: CredRevokeIssuance :exec
UPDATE api_credential_issuance_requests
SET status = 'REVOKED',
    revoked_at = $2,
    reason = COALESCE(NULLIF($3, ''), reason),
    updated_at = $2
WHERE id = $1
  AND status IN ('PENDING_KYC', 'AUTHORIZED');

-- name: CredBumpClaimAttempts :exec
UPDATE api_credential_issuance_requests
SET claim_attempts = claim_attempts + 1,
    updated_at = $2
WHERE id = $1;

-- name: CredInsertSecretClaim :exec
INSERT INTO secret_claims (
    id, kind, resource_type, resource_id, resource_version,
    merchant_id, recipient_user_id, claim_token_hash, status,
    attempts, max_attempts, expires_at, mfa_binding_session_id,
    issuance_request_id, created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5,
    $6, $7, $8, $9,
    $10, $11, $12, $13,
    $14, $15, $16
);

-- name: CredGetSecretClaimByHash :one
SELECT id, kind, resource_type, resource_id, resource_version,
       merchant_id, recipient_user_id, claim_token_hash, status,
       attempts, max_attempts, expires_at, consumed_at,
       mfa_binding_session_id, issuance_request_id, created_at, updated_at
FROM secret_claims
WHERE claim_token_hash = $1
  AND status = 'ACTIVE'
LIMIT 1;

-- name: CredConsumeSecretClaim :exec
UPDATE secret_claims
SET status = 'CONSUMED',
    consumed_at = $2,
    updated_at = $2
WHERE id = $1
  AND status = 'ACTIVE';

-- name: CredRevokeSecretClaimsForIssuance :exec
UPDATE secret_claims
SET status = 'REVOKED',
    updated_at = $2
WHERE issuance_request_id = $1
  AND status = 'ACTIVE';

-- name: CredGetMerchantOwner :one
SELECT id, owner_user_id, status
FROM merchants
WHERE id = $1;

-- name: CredGetMerchantByOwner :one
SELECT id, owner_user_id, status
FROM merchants
WHERE owner_user_id = $1
LIMIT 1;

-- name: CredMerchantMemberActive :one
SELECT role_in_merchant
FROM merchant_members
WHERE merchant_id = $1 AND user_id = $2 AND status = 'ACTIVE';

-- name: CredGetCapability :one
SELECT id, merchant_id, payment_mode, capability, status, kyc_case_id, kyc_version,
       suspension_reason, suspended_by, effective_at, expires_at, created_at, updated_at
FROM merchant_api_capabilities
WHERE merchant_id = $1 AND payment_mode = $2 AND capability = $3;

-- name: CredGetStoreMerchant :one
SELECT id, merchant_id, status
FROM stores
WHERE id = $1;

-- name: CredInsertOutbox :exec
INSERT INTO outbox_events (id, topic, payload, status, available_at, created_at, dedupe_key, payment_mode)
VALUES ($1, $2, $3, 'pending', $4, now(), $5, $6);

-- CredInsertAudit removed: CredentialRepo uses callAppendAuditEvent (BE-530).

-- name: CredTryInsertIdempotency :one
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

-- name: CredGetIdempotency :one
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

-- name: CredCompleteIdempotency :one
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
