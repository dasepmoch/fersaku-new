-- BE-240 store custom-domain queries.

-- name: DomainGetStoreByID :one
SELECT id, merchant_id, slug, name, status
FROM stores
WHERE id = $1;

-- name: DomainUserCanAccessStore :one
SELECT EXISTS (
    SELECT 1
    FROM stores s
    JOIN merchant_members mm ON mm.merchant_id = s.merchant_id
    WHERE s.id = $1
      AND mm.user_id = $2
      AND mm.status = 'ACTIVE'
) AS ok;

-- name: DomainUserIsPlatformAdmin :one
SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = $1
      AND r.archived_at IS NULL
      AND r.code IN ('SUPER_ADMIN', 'ADMIN_SUPPORT')
) AS ok;

-- name: DomainInsert :exec
INSERT INTO store_domains (
    id, store_id, merchant_id, hostname_normalized, hostname_display,
    status, verification_token_hash, expected_dns_name, expected_dns_value,
    version, tls_status, failure_code, last_checked_at, next_check_at,
    verified_at, edge_provisioned_at, edge_removed_at, cooldown_until,
    suspended_at, removing_at, tombstoned_at, created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5,
    $6, $7, $8, $9,
    $10, $11, $12, $13, $14,
    $15, $16, $17, $18,
    $19, $20, $21, $22, $23
);

-- name: DomainGetByID :one
SELECT id, store_id, merchant_id, hostname_normalized, hostname_display,
       status, verification_token_hash, expected_dns_name, expected_dns_value,
       version, tls_status, failure_code, last_checked_at, next_check_at,
       verified_at, edge_provisioned_at, edge_removed_at, cooldown_until,
       suspended_at, removing_at, tombstoned_at, created_at, updated_at
FROM store_domains
WHERE id = $1;

-- name: DomainGetByIDForStore :one
SELECT id, store_id, merchant_id, hostname_normalized, hostname_display,
       status, verification_token_hash, expected_dns_name, expected_dns_value,
       version, tls_status, failure_code, last_checked_at, next_check_at,
       verified_at, edge_provisioned_at, edge_removed_at, cooldown_until,
       suspended_at, removing_at, tombstoned_at, created_at, updated_at
FROM store_domains
WHERE id = $1 AND store_id = $2;

-- name: DomainGetClaimByHostname :one
SELECT id, store_id, merchant_id, hostname_normalized, hostname_display,
       status, verification_token_hash, expected_dns_name, expected_dns_value,
       version, tls_status, failure_code, last_checked_at, next_check_at,
       verified_at, edge_provisioned_at, edge_removed_at, cooldown_until,
       suspended_at, removing_at, tombstoned_at, created_at, updated_at
FROM store_domains
WHERE hostname_normalized = $1
  AND status IN (
      'PENDING_DNS', 'VERIFYING', 'ACTIVE', 'FAILED',
      'SUSPENDED', 'REMOVING', 'TOMBSTONED'
  )
LIMIT 1;

-- name: DomainGetActiveByHostname :one
SELECT id, store_id, merchant_id, hostname_normalized, hostname_display,
       status, verification_token_hash, expected_dns_name, expected_dns_value,
       version, tls_status, failure_code, last_checked_at, next_check_at,
       verified_at, edge_provisioned_at, edge_removed_at, cooldown_until,
       suspended_at, removing_at, tombstoned_at, created_at, updated_at
FROM store_domains
WHERE hostname_normalized = $1
  AND status = 'ACTIVE'
LIMIT 1;

-- name: DomainListByStore :many
SELECT id, store_id, merchant_id, hostname_normalized, hostname_display,
       status, verification_token_hash, expected_dns_name, expected_dns_value,
       version, tls_status, failure_code, last_checked_at, next_check_at,
       verified_at, edge_provisioned_at, edge_removed_at, cooldown_until,
       suspended_at, removing_at, tombstoned_at, created_at, updated_at
FROM store_domains
WHERE store_id = $1
  AND status <> 'TOMBSTONED'
ORDER BY created_at DESC, id DESC;

-- name: DomainUpdateCAS :one
UPDATE store_domains SET
    status = $3,
    verification_token_hash = $4,
    expected_dns_name = $5,
    expected_dns_value = $6,
    version = version + 1,
    tls_status = $7,
    failure_code = $8,
    last_checked_at = $9,
    next_check_at = $10,
    verified_at = $11,
    edge_provisioned_at = $12,
    edge_removed_at = $13,
    cooldown_until = $14,
    suspended_at = $15,
    removing_at = $16,
    tombstoned_at = $17,
    updated_at = $18
WHERE id = $1 AND version = $2
RETURNING id, store_id, merchant_id, hostname_normalized, hostname_display,
          status, verification_token_hash, expected_dns_name, expected_dns_value,
          version, tls_status, failure_code, last_checked_at, next_check_at,
          verified_at, edge_provisioned_at, edge_removed_at, cooldown_until,
          suspended_at, removing_at, tombstoned_at, created_at, updated_at;

-- name: DomainListDueForRevalidation :many
SELECT id, store_id, merchant_id, hostname_normalized, hostname_display,
       status, verification_token_hash, expected_dns_name, expected_dns_value,
       version, tls_status, failure_code, last_checked_at, next_check_at,
       verified_at, edge_provisioned_at, edge_removed_at, cooldown_until,
       suspended_at, removing_at, tombstoned_at, created_at, updated_at
FROM store_domains
WHERE status IN ('ACTIVE', 'SUSPENDED', 'VERIFYING', 'REMOVING')
  AND (next_check_at IS NULL OR next_check_at <= $1)
ORDER BY next_check_at NULLS FIRST, id
LIMIT $2;

-- name: DomainListExpiredTombstones :many
SELECT id, store_id, merchant_id, hostname_normalized, hostname_display,
       status, verification_token_hash, expected_dns_name, expected_dns_value,
       version, tls_status, failure_code, last_checked_at, next_check_at,
       verified_at, edge_provisioned_at, edge_removed_at, cooldown_until,
       suspended_at, removing_at, tombstoned_at, created_at, updated_at
FROM store_domains
WHERE status = 'TOMBSTONED'
  AND cooldown_until IS NOT NULL
  AND cooldown_until <= $1
ORDER BY cooldown_until, id
LIMIT $2;

-- name: DomainHardDelete :exec
DELETE FROM store_domains WHERE id = $1 AND status = 'TOMBSTONED';

-- name: DomainInsertOutbox :exec
INSERT INTO outbox_events (
    id, topic, payload, status, attempts, available_at, created_at, dedupe_key
) VALUES (
    $1, $2, $3, 'pending', 0, $4, $4, $5
)
ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
