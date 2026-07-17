-- BE-520 admin impersonation

-- name: ImpInsertSession :exec
INSERT INTO impersonation_sessions (
    id, actor_admin_id, target_user_id, target_merchant_id, scope, status,
    reason, ticket, mfa_at, original_session_id, derived_session_id,
    session_token_hash, expires_at, ended_at, ended_by, end_reason,
    created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10, $11,
    $12, $13, $14, $15, $16,
    $17, $18
);

-- name: ImpGetByID :one
SELECT id, actor_admin_id, target_user_id, target_merchant_id, scope, status,
       reason, ticket, mfa_at, original_session_id, derived_session_id,
       session_token_hash, expires_at, ended_at, ended_by, end_reason,
       created_at, updated_at
FROM impersonation_sessions
WHERE id = $1;

-- name: ImpGetByDerivedSessionID :one
SELECT id, actor_admin_id, target_user_id, target_merchant_id, scope, status,
       reason, ticket, mfa_at, original_session_id, derived_session_id,
       session_token_hash, expires_at, ended_at, ended_by, end_reason,
       created_at, updated_at
FROM impersonation_sessions
WHERE derived_session_id = $1;

-- name: ImpGetByTokenHash :one
SELECT id, actor_admin_id, target_user_id, target_merchant_id, scope, status,
       reason, ticket, mfa_at, original_session_id, derived_session_id,
       session_token_hash, expires_at, ended_at, ended_by, end_reason,
       created_at, updated_at
FROM impersonation_sessions
WHERE session_token_hash = $1;

-- name: ImpGetActiveByActor :one
SELECT id, actor_admin_id, target_user_id, target_merchant_id, scope, status,
       reason, ticket, mfa_at, original_session_id, derived_session_id,
       session_token_hash, expires_at, ended_at, ended_by, end_reason,
       created_at, updated_at
FROM impersonation_sessions
WHERE actor_admin_id = $1
  AND status = 'ACTIVE'
  AND ended_at IS NULL
  AND expires_at > $2
ORDER BY created_at DESC
LIMIT 1;

-- name: ImpEndSession :execrows
UPDATE impersonation_sessions
SET status = $2,
    ended_at = $3,
    ended_by = $4,
    end_reason = $5,
    updated_at = $3
WHERE id = $1
  AND status = 'ACTIVE'
  AND ended_at IS NULL;

-- name: ImpMarkExpired :execrows
UPDATE impersonation_sessions
SET status = 'EXPIRED',
    ended_at = $2,
    end_reason = COALESCE(end_reason, 'expired'),
    updated_at = $2
WHERE id = $1
  AND status = 'ACTIVE'
  AND ended_at IS NULL;

-- name: ImpIsAdminUser :one
SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = $1
      AND r.code IN ('SUPER_ADMIN', 'ADMIN_SUPPORT', 'ADMIN_FINANCE')
) AS is_admin;

-- name: ImpGetMerchantOwner :one
SELECT owner_user_id
FROM merchants
WHERE id = $1;

-- name: ImpCountMerchantOwners :one
SELECT COUNT(*)::bigint AS n
FROM merchants
WHERE id = $1 AND owner_user_id IS NOT NULL AND owner_user_id <> '';

-- name: ImpGetUser :one
SELECT id, email_normalized, email_display, password_hash, name, status,
       email_verified_at, mfa_enabled, last_login_at, created_at, updated_at
FROM users
WHERE id = $1;

-- name: ImpGetStoreOwnerUserID :one
SELECT m.owner_user_id
FROM stores s
JOIN merchants m ON m.id = s.merchant_id
WHERE s.id = $1;

-- ImpInsertAudit removed: ImpersonationRepo uses callAppendAuditEvent (BE-530).
