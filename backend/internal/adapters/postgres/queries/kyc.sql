-- BE-400 KYC live API workflow

-- name: KYCInsertCase :exec
INSERT INTO kyc_cases (
    id, merchant_id, store_id, capability, status, version,
    legal_name, business_name, registration_number, country_code,
    consent_version, consent_accepted_at, reason, clarification_reason,
    predecessor_case_id, created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10,
    $11, $12, $13, $14,
    $15, $16, $17
);

-- name: KYCGetCaseByID :one
SELECT id, merchant_id, store_id, capability, status, version,
       legal_name, business_name, registration_number, country_code,
       consent_version, consent_accepted_at, reviewer_user_id, vendor_ref,
       reason, clarification_reason, predecessor_case_id,
       submitted_at, reviewed_at, approved_at, rejected_at, expires_at,
       created_at, updated_at
FROM kyc_cases
WHERE id = $1;

-- name: KYCGetOpenCaseByMerchant :one
SELECT id, merchant_id, store_id, capability, status, version,
       legal_name, business_name, registration_number, country_code,
       consent_version, consent_accepted_at, reviewer_user_id, vendor_ref,
       reason, clarification_reason, predecessor_case_id,
       submitted_at, reviewed_at, approved_at, rejected_at, expires_at,
       created_at, updated_at
FROM kyc_cases
WHERE merchant_id = $1
  AND status IN ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'VENDOR_CHECK', 'NEEDS_CLARIFICATION')
ORDER BY created_at DESC
LIMIT 1;

-- name: KYCListCasesByMerchant :many
SELECT id, merchant_id, store_id, capability, status, version,
       legal_name, business_name, registration_number, country_code,
       consent_version, consent_accepted_at, reviewer_user_id, vendor_ref,
       reason, clarification_reason, predecessor_case_id,
       submitted_at, reviewed_at, approved_at, rejected_at, expires_at,
       created_at, updated_at
FROM kyc_cases
WHERE merchant_id = $1
ORDER BY created_at DESC, id DESC
LIMIT $2;

-- name: KYCListAdminQueue :many
SELECT id, merchant_id, store_id, capability, status, version,
       legal_name, business_name, registration_number, country_code,
       consent_version, consent_accepted_at, reviewer_user_id, vendor_ref,
       reason, clarification_reason, predecessor_case_id,
       submitted_at, reviewed_at, approved_at, rejected_at, expires_at,
       created_at, updated_at
FROM kyc_cases
WHERE (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status')::text)
ORDER BY submitted_at ASC NULLS LAST, created_at ASC, id ASC
LIMIT sqlc.arg('lim')::int;

-- name: KYCUpdateCaseStatus :one
UPDATE kyc_cases
SET status = sqlc.arg('status'),
    version = sqlc.arg('version'),
    reason = sqlc.arg('reason'),
    clarification_reason = sqlc.arg('clarification_reason'),
    reviewer_user_id = sqlc.narg('reviewer_user_id'),
    vendor_ref = sqlc.arg('vendor_ref'),
    submitted_at = COALESCE(sqlc.narg('submitted_at'), submitted_at),
    reviewed_at = COALESCE(sqlc.narg('reviewed_at'), reviewed_at),
    approved_at = COALESCE(sqlc.narg('approved_at'), approved_at),
    rejected_at = COALESCE(sqlc.narg('rejected_at'), rejected_at),
    expires_at = COALESCE(sqlc.narg('expires_at'), expires_at),
    legal_name = COALESCE(NULLIF(sqlc.arg('legal_name'), ''), legal_name),
    business_name = COALESCE(NULLIF(sqlc.arg('business_name'), ''), business_name),
    registration_number = COALESCE(NULLIF(sqlc.arg('registration_number'), ''), registration_number),
    consent_version = COALESCE(NULLIF(sqlc.arg('consent_version'), ''), consent_version),
    consent_accepted_at = COALESCE(sqlc.narg('consent_accepted_at'), consent_accepted_at),
    updated_at = sqlc.arg('updated_at')
WHERE id = sqlc.arg('id')
RETURNING id, merchant_id, store_id, capability, status, version,
          legal_name, business_name, registration_number, country_code,
          consent_version, consent_accepted_at, reviewer_user_id, vendor_ref,
          reason, clarification_reason, predecessor_case_id,
          submitted_at, reviewed_at, approved_at, rejected_at, expires_at,
          created_at, updated_at;

-- name: KYCInsertDocument :exec
INSERT INTO kyc_documents (
    id, case_id, merchant_id, document_type, status, content_type, size_bytes,
    checksum_sha256, storage_bucket, storage_key, encryption_key_version,
    ciphertext_size_bytes, scan_status, scan_detail, doc_version, uploaded_by,
    ready_at, created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7,
    $8, $9, $10, $11,
    $12, $13, $14, $15, $16,
    $17, $18, $19
);

-- name: KYCGetDocumentByID :one
SELECT id, case_id, merchant_id, document_type, status, content_type, size_bytes,
       checksum_sha256, storage_bucket, storage_key, encryption_key_version,
       ciphertext_size_bytes, scan_status, scan_detail, doc_version, uploaded_by,
       ready_at, created_at, updated_at
FROM kyc_documents
WHERE id = $1;

-- name: KYCListDocumentsByCase :many
SELECT id, case_id, merchant_id, document_type, status, content_type, size_bytes,
       checksum_sha256, storage_bucket, storage_key, encryption_key_version,
       ciphertext_size_bytes, scan_status, scan_detail, doc_version, uploaded_by,
       ready_at, created_at, updated_at
FROM kyc_documents
WHERE case_id = $1
ORDER BY document_type ASC, doc_version DESC, created_at DESC;

-- name: KYCUpdateDocument :exec
UPDATE kyc_documents
SET status = $2,
    content_type = $3,
    size_bytes = $4,
    checksum_sha256 = $5,
    storage_bucket = $6,
    storage_key = $7,
    encryption_key_version = $8,
    ciphertext_size_bytes = $9,
    scan_status = $10,
    scan_detail = $11,
    ready_at = $12,
    updated_at = $13
WHERE id = $1;

-- name: KYCCountReadyDocumentsByType :one
SELECT count(*)::bigint AS n
FROM kyc_documents
WHERE case_id = $1
  AND document_type = $2
  AND status = 'READY'
  AND scan_status = 'PASSED';

-- name: KYCInsertTransition :exec
INSERT INTO kyc_case_transitions (
    id, case_id, from_status, to_status, actor_user_id, reason, metadata, created_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);

-- name: KYCListTransitionsByCase :many
SELECT id, case_id, from_status, to_status, actor_user_id, reason, metadata, created_at
FROM kyc_case_transitions
WHERE case_id = $1
ORDER BY created_at ASC, id ASC;

-- name: KYCInsertIssuanceRequest :exec
INSERT INTO api_credential_issuance_requests (
    id, merchant_id, payment_mode, purpose, capability, status,
    kyc_case_id, kyc_version, requester_user_id, authorizer_user_id, reason,
    authorized_at, expires_at, created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10, $11,
    $12, $13, $14, $15
);

-- name: KYCGetOutstandingIssuance :one
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

-- name: KYCGetIssuanceByID :one
SELECT id, merchant_id, payment_mode, purpose, capability, status,
       kyc_case_id, kyc_version, requester_user_id, authorizer_user_id, reason,
       authorized_at, claimed_at, expires_at, revoked_at, created_at, updated_at,
       claim_token_hash, claim_expires_at, claim_recipient_user_id, claim_attempts,
       claim_consumed_at, mfa_binding_session_id, expected_predecessor_key_id,
       expected_version, request_version, idempotency_key_hash, resulting_api_key_id
FROM api_credential_issuance_requests
WHERE id = $1;

-- name: KYCUpdateIssuanceStatus :exec
UPDATE api_credential_issuance_requests
SET status = sqlc.arg('status'),
    kyc_case_id = COALESCE(sqlc.narg('kyc_case_id'), kyc_case_id),
    kyc_version = COALESCE(sqlc.narg('kyc_version'), kyc_version),
    authorizer_user_id = COALESCE(sqlc.narg('authorizer_user_id'), authorizer_user_id),
    reason = COALESCE(NULLIF(sqlc.arg('reason'), ''), reason),
    authorized_at = COALESCE(sqlc.narg('authorized_at'), authorized_at),
    expires_at = COALESCE(sqlc.narg('expires_at'), expires_at),
    revoked_at = COALESCE(sqlc.narg('revoked_at'), revoked_at),
    updated_at = sqlc.arg('updated_at')
WHERE id = sqlc.arg('id');

-- name: KYCGetMerchantOwnerUserID :one
SELECT owner_user_id FROM merchants WHERE id = $1;

-- name: KYCGetMerchantByOwner :one
SELECT id, owner_user_id, status
FROM merchants
WHERE owner_user_id = $1
LIMIT 1;

-- name: KYCGetCanonicalStoreID :one
SELECT id FROM stores
WHERE merchant_id = $1 AND is_canonical = true
LIMIT 1;

-- name: KYCMerchantMemberActive :one
SELECT role_in_merchant
FROM merchant_members
WHERE merchant_id = $1 AND user_id = $2 AND status = 'ACTIVE';

-- name: KYCInsertOutbox :exec
INSERT INTO outbox_events (id, topic, payload, status, available_at, created_at, dedupe_key, payment_mode)
VALUES ($1, $2, $3, 'pending', $4, now(), $5, $6);
