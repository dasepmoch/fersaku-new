-- name: ObjectInsert :exec
INSERT INTO object_refs (
    id, bucket, object_key, purpose, visibility, content_type,
    expected_size_bytes, expected_checksum_sha256, encryption_key_version,
    retention_class, owner_merchant_id, owner_store_id, owner_user_id,
    status, upload_expires_at, created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9,
    $10, $11, $12, $13,
    $14, $15, $16, $17
);

-- name: ObjectGetByID :one
SELECT
    id, bucket, object_key, purpose, visibility, content_type,
    expected_size_bytes, actual_size_bytes, checksum_sha256, expected_checksum_sha256,
    encryption_key_version, retention_class, owner_merchant_id, owner_store_id, owner_user_id,
    status, upload_expires_at, multipart_upload_id, multipart_aborted_at,
    scan_status, scan_verdict, scan_version, scan_at, last_verified_at, rejected_reason,
    scan_attempts, scan_error_class, scan_next_retry_at,
    created_at, updated_at
FROM object_refs
WHERE id = $1;

-- name: ObjectGetByIDForStore :one
SELECT
    id, bucket, object_key, purpose, visibility, content_type,
    expected_size_bytes, actual_size_bytes, checksum_sha256, expected_checksum_sha256,
    encryption_key_version, retention_class, owner_merchant_id, owner_store_id, owner_user_id,
    status, upload_expires_at, multipart_upload_id, multipart_aborted_at,
    scan_status, scan_verdict, scan_version, scan_at, last_verified_at, rejected_reason,
    scan_attempts, scan_error_class, scan_next_retry_at,
    created_at, updated_at
FROM object_refs
WHERE id = $1 AND owner_store_id = $2;

-- name: ObjectUpdateComplete :exec
UPDATE object_refs SET
    status = $2,
    actual_size_bytes = $3,
    checksum_sha256 = $4,
    content_type = COALESCE(NULLIF($5, ''), content_type),
    scan_status = $6,
    scan_verdict = $7,
    scan_version = $8,
    scan_at = $9,
    last_verified_at = $10,
    rejected_reason = $11,
    updated_at = $12
WHERE id = $1;

-- name: ObjectUpdateScanMeta :execrows
UPDATE object_refs SET
    status = $2,
    scan_status = $3,
    scan_verdict = $4,
    scan_version = $5,
    scan_at = $6,
    scan_attempts = $7,
    scan_error_class = $8,
    scan_next_retry_at = $9,
    rejected_reason = $10,
    last_verified_at = $11,
    updated_at = $12
WHERE id = $1 AND status = ANY ($13::text[]);

-- name: ObjectListPendingScan :many
SELECT
    id, bucket, object_key, purpose, visibility, content_type,
    expected_size_bytes, actual_size_bytes, checksum_sha256, expected_checksum_sha256,
    encryption_key_version, retention_class, owner_merchant_id, owner_store_id, owner_user_id,
    status, upload_expires_at, multipart_upload_id, multipart_aborted_at,
    scan_status, scan_verdict, scan_version, scan_at, last_verified_at, rejected_reason,
    scan_attempts, scan_error_class, scan_next_retry_at,
    created_at, updated_at
FROM object_refs
WHERE status = 'SCANNING'
  AND (scan_next_retry_at IS NULL OR scan_next_retry_at <= $1)
ORDER BY COALESCE(scan_next_retry_at, updated_at) ASC
LIMIT $2;

-- name: ObjectCountScanning :one
SELECT COUNT(*)::bigint AS n
FROM object_refs
WHERE status = 'SCANNING';

-- name: ObjectMarkExpired :exec
UPDATE object_refs SET
    status = 'EXPIRED',
    updated_at = $2
WHERE id = $1 AND status = 'UPLOADING';

-- name: ObjectListExpiredUploading :many
SELECT
    id, bucket, object_key, purpose, visibility, content_type,
    expected_size_bytes, actual_size_bytes, checksum_sha256, expected_checksum_sha256,
    encryption_key_version, retention_class, owner_merchant_id, owner_store_id, owner_user_id,
    status, upload_expires_at, multipart_upload_id, multipart_aborted_at,
    scan_status, scan_verdict, scan_version, scan_at, last_verified_at, rejected_reason,
    scan_attempts, scan_error_class, scan_next_retry_at,
    created_at, updated_at
FROM object_refs
WHERE status = 'UPLOADING' AND upload_expires_at < $1
ORDER BY upload_expires_at ASC
LIMIT $2;

-- name: ObjectUserCanAccessStore :one
SELECT EXISTS (
    SELECT 1
    FROM stores s
    INNER JOIN merchant_members mm ON mm.merchant_id = s.merchant_id
    WHERE s.id = $1
      AND mm.user_id = $2
      AND mm.status = 'ACTIVE'
) AS ok;

-- name: ObjectUserIsPlatformAdmin :one
SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    INNER JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = $1
      AND r.code IN ('SUPER_ADMIN', 'ADMIN_SUPPORT', 'ADMIN_FINANCE')
) AS ok;

-- name: ObjectGetStoreByID :one
SELECT id, merchant_id, slug, name, status
FROM stores
WHERE id = $1;

-- name: ObjectQuotaGet :one
SELECT merchant_id, ready_bytes, object_count, updated_at
FROM object_quota_usage
WHERE merchant_id = $1;

-- name: ObjectQuotaUpsertAdd :exec
INSERT INTO object_quota_usage (merchant_id, ready_bytes, object_count, updated_at)
VALUES ($1, $2, 1, $3)
ON CONFLICT (merchant_id) DO UPDATE SET
    ready_bytes = object_quota_usage.ready_bytes + EXCLUDED.ready_bytes,
    object_count = object_quota_usage.object_count + 1,
    updated_at = EXCLUDED.updated_at;

-- name: ObjectGrantInsert :exec
INSERT INTO object_delivery_grants (
    id, object_id, store_id, grantee_user_id, purpose, expires_at, max_uses, use_count, created_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8);

-- name: ObjectGrantGetActive :one
SELECT id, object_id, store_id, grantee_user_id, purpose, expires_at, revoked_at, max_uses, use_count, created_at
FROM object_delivery_grants
WHERE object_id = $1
  AND grantee_user_id = $2
  AND revoked_at IS NULL
  AND expires_at > $3
  AND use_count < max_uses
ORDER BY created_at DESC
LIMIT 1;

-- name: ObjectGrantIncrementUse :exec
UPDATE object_delivery_grants
SET use_count = use_count + 1
WHERE id = $1 AND use_count < max_uses AND revoked_at IS NULL;
