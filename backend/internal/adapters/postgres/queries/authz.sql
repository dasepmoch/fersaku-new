-- BE-130 RBAC and tenant queries.

-- name: ListPermissionCodesForUser :many
SELECT DISTINCT rp.permission_code
FROM user_roles ur
JOIN role_permissions rp ON rp.role_id = ur.role_id
JOIN roles r ON r.id = ur.role_id
WHERE ur.user_id = $1
  AND r.archived_at IS NULL
ORDER BY rp.permission_code;

-- name: ListRoleCodesForUser :many
SELECT r.code
FROM user_roles ur
JOIN roles r ON r.id = ur.role_id
WHERE ur.user_id = $1
  AND r.archived_at IS NULL
ORDER BY r.code;

-- name: GetRoleByCode :one
SELECT id, code, name, description, is_system, version, archived_at, created_at, updated_at
FROM roles
WHERE code = $1;

-- name: GetRoleByID :one
SELECT id, code, name, description, is_system, version, archived_at, created_at, updated_at
FROM roles
WHERE id = $1;

-- name: AssignUserRole :exec
INSERT INTO user_roles (user_id, role_id, assigned_at, assigned_by)
VALUES ($1, $2, $3, $4)
ON CONFLICT (user_id, role_id) DO NOTHING;

-- name: UserHasRole :one
SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = $1 AND r.code = $2 AND r.archived_at IS NULL
) AS has_role;

-- name: UserHasPermission :one
SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = $1
      AND rp.permission_code = $2
      AND r.archived_at IS NULL
) AS has_permission;

-- name: CountPermissions :one
SELECT COUNT(*)::bigint FROM permissions;

-- name: CountSystemRoles :one
SELECT COUNT(*)::bigint FROM roles WHERE is_system = true;

-- name: InsertMerchant :exec
INSERT INTO merchants (
    id, owner_user_id, display_name, status,
    legal_name, business_type,
    onboarding_state, onboarding_step, onboarding_completed_at, onboarding_progress,
    created_at, updated_at
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12);

-- name: GetMerchantByID :one
SELECT id, owner_user_id, display_name, status,
       legal_name, business_type,
       onboarding_state, onboarding_step, onboarding_completed_at, onboarding_progress,
       created_at, updated_at
FROM merchants
WHERE id = $1;

-- name: GetMerchantByOwner :one
SELECT id, owner_user_id, display_name, status,
       legal_name, business_type,
       onboarding_state, onboarding_step, onboarding_completed_at, onboarding_progress,
       created_at, updated_at
FROM merchants
WHERE owner_user_id = $1
ORDER BY created_at ASC
LIMIT 1;

-- name: InsertMerchantMember :exec
INSERT INTO merchant_members (merchant_id, user_id, role_in_merchant, status, created_at)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (merchant_id, user_id) DO UPDATE
SET role_in_merchant = EXCLUDED.role_in_merchant,
    status = EXCLUDED.status;

-- name: GetMerchantMember :one
SELECT merchant_id, user_id, role_in_merchant, status, created_at
FROM merchant_members
WHERE merchant_id = $1 AND user_id = $2;

-- name: GetActiveMerchantMember :one
SELECT merchant_id, user_id, role_in_merchant, status, created_at
FROM merchant_members
WHERE merchant_id = $1 AND user_id = $2 AND status = 'ACTIVE';

-- name: ListActiveMerchantMemberships :many
SELECT merchant_id, user_id, role_in_merchant, status, created_at
FROM merchant_members
WHERE user_id = $1 AND status = 'ACTIVE'
ORDER BY created_at ASC;

-- name: InsertStore :exec
INSERT INTO stores (
    id, merchant_id, slug, name, status, is_canonical,
    bio, address, accent_color,
    onboarding_state, onboarding_step, onboarding_completed_at, onboarding_progress,
    storefront_revision, published_revision,
    created_at, updated_at
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17);

-- name: GetStoreByID :one
SELECT id, merchant_id, slug, name, status, is_canonical,
       bio, address, accent_color,
       onboarding_state, onboarding_step, onboarding_completed_at, onboarding_progress,
       storefront_revision, published_revision,
       created_at, updated_at
FROM stores
WHERE id = $1;

-- name: GetStoreBySlug :one
SELECT id, merchant_id, slug, name, status, is_canonical,
       bio, address, accent_color,
       onboarding_state, onboarding_step, onboarding_completed_at, onboarding_progress,
       storefront_revision, published_revision,
       created_at, updated_at
FROM stores
WHERE slug = $1;

-- name: GetCanonicalStoreForMerchant :one
SELECT id, merchant_id, slug, name, status, is_canonical,
       bio, address, accent_color,
       onboarding_state, onboarding_step, onboarding_completed_at, onboarding_progress,
       storefront_revision, published_revision,
       created_at, updated_at
FROM stores
WHERE merchant_id = $1 AND is_canonical = true
LIMIT 1;

-- name: GetUserIDByEmailNormalized :one
SELECT id FROM users WHERE email_normalized = $1;

-- BE-135 role/assignment/invitation queries

-- name: ListAllPermissions :many
SELECT code, description, category, created_at
FROM permissions
ORDER BY category, code;

-- name: ListRoles :many
SELECT id, code, name, description, is_system, version, archived_at, created_at, updated_at
FROM roles
WHERE ($1::boolean = true OR archived_at IS NULL)
ORDER BY is_system DESC, code ASC;

-- name: InsertRole :exec
INSERT INTO roles (id, code, name, description, is_system, version, archived_at, created_at, updated_at)
VALUES ($1, $2, $3, $4, false, 1, NULL, $5, $5);

-- name: UpdateRoleOptimistic :one
UPDATE roles
SET name = $3,
    description = $4,
    version = version + 1,
    updated_at = $5
WHERE id = $1
  AND version = $2
  AND is_system = false
  AND archived_at IS NULL
RETURNING id, code, name, description, is_system, version, archived_at, created_at, updated_at;

-- name: ArchiveRoleOptimistic :one
UPDATE roles
SET archived_at = $3,
    version = version + 1,
    updated_at = $3
WHERE id = $1
  AND version = $2
  AND is_system = false
  AND archived_at IS NULL
RETURNING id, code, name, description, is_system, version, archived_at, created_at, updated_at;

-- name: DeleteRolePermissions :exec
DELETE FROM role_permissions WHERE role_id = $1;

-- name: InsertRolePermission :exec
INSERT INTO role_permissions (role_id, permission_code)
VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- name: ListPermissionCodesForRole :many
SELECT permission_code
FROM role_permissions
WHERE role_id = $1
ORDER BY permission_code;

-- name: CountRoleAssignments :one
SELECT COUNT(*)::bigint FROM user_roles WHERE role_id = $1;

-- name: ListUserRoles :many
SELECT ur.user_id, ur.role_id, ur.assigned_at, ur.assigned_by, r.code, r.name, r.is_system
FROM user_roles ur
JOIN roles r ON r.id = ur.role_id
WHERE ur.user_id = $1
ORDER BY r.code;

-- name: RemoveUserRole :execrows
DELETE FROM user_roles
WHERE user_id = $1 AND role_id = $2;

-- name: CountUsersWithRoleCode :one
SELECT COUNT(*)::bigint
FROM user_roles ur
JOIN roles r ON r.id = ur.role_id
WHERE r.code = $1
  AND r.archived_at IS NULL;

-- name: CountUsersWithRoleCodeExcluding :one
SELECT COUNT(*)::bigint
FROM user_roles ur
JOIN roles r ON r.id = ur.role_id
WHERE r.code = $1
  AND r.archived_at IS NULL
  AND ur.user_id <> $2;

-- name: InsertStaffInvitation :exec
INSERT INTO staff_invitations (
    id, email_normalized, email_display, inviter_user_id, role_id, token_hash,
    status, expires_at, accepted_at, accepted_user_id, revoked_at, revoked_by,
    idempotency_key, created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10, $11, $12,
    $13, $14, $15
);

-- name: GetStaffInvitationByID :one
SELECT id, email_normalized, email_display, inviter_user_id, role_id, token_hash,
       status, expires_at, accepted_at, accepted_user_id, revoked_at, revoked_by,
       idempotency_key, created_at, updated_at
FROM staff_invitations
WHERE id = $1;

-- name: GetStaffInvitationByTokenHash :one
SELECT id, email_normalized, email_display, inviter_user_id, role_id, token_hash,
       status, expires_at, accepted_at, accepted_user_id, revoked_at, revoked_by,
       idempotency_key, created_at, updated_at
FROM staff_invitations
WHERE token_hash = $1;

-- name: GetStaffInvitationByIdempotency :one
SELECT id, email_normalized, email_display, inviter_user_id, role_id, token_hash,
       status, expires_at, accepted_at, accepted_user_id, revoked_at, revoked_by,
       idempotency_key, created_at, updated_at
FROM staff_invitations
WHERE inviter_user_id = $1 AND idempotency_key = $2;

-- name: ListStaffInvitations :many
SELECT id, email_normalized, email_display, inviter_user_id, role_id, token_hash,
       status, expires_at, accepted_at, accepted_user_id, revoked_at, revoked_by,
       idempotency_key, created_at, updated_at
FROM staff_invitations
ORDER BY created_at DESC
LIMIT $1;

-- name: RevokeStaffInvitation :one
UPDATE staff_invitations
SET status = 'REVOKED',
    revoked_at = $2,
    revoked_by = $3,
    updated_at = $2
WHERE id = $1
  AND status = 'PENDING'
RETURNING id, email_normalized, email_display, inviter_user_id, role_id, token_hash,
          status, expires_at, accepted_at, accepted_user_id, revoked_at, revoked_by,
          idempotency_key, created_at, updated_at;

-- name: AcceptStaffInvitation :one
UPDATE staff_invitations
SET status = 'ACCEPTED',
    accepted_at = $2,
    accepted_user_id = $3,
    updated_at = $2
WHERE id = $1
  AND status = 'PENDING'
  AND expires_at > $2
RETURNING id, email_normalized, email_display, inviter_user_id, role_id, token_hash,
          status, expires_at, accepted_at, accepted_user_id, revoked_at, revoked_by,
          idempotency_key, created_at, updated_at;

-- name: InsertMerchantInvitation :exec
INSERT INTO merchant_invitations (
    id, email_normalized, email_display, inviter_user_id, merchant_id, role_in_merchant,
    onboarding_purpose, token_hash, status, expires_at, accepted_at, accepted_user_id,
    revoked_at, revoked_by, idempotency_key, created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10, $11, $12,
    $13, $14, $15, $16, $17
);

-- name: GetMerchantInvitationByID :one
SELECT id, email_normalized, email_display, inviter_user_id, merchant_id, role_in_merchant,
       onboarding_purpose, token_hash, status, expires_at, accepted_at, accepted_user_id,
       revoked_at, revoked_by, idempotency_key, created_at, updated_at
FROM merchant_invitations
WHERE id = $1;

-- name: GetMerchantInvitationByTokenHash :one
SELECT id, email_normalized, email_display, inviter_user_id, merchant_id, role_in_merchant,
       onboarding_purpose, token_hash, status, expires_at, accepted_at, accepted_user_id,
       revoked_at, revoked_by, idempotency_key, created_at, updated_at
FROM merchant_invitations
WHERE token_hash = $1;

-- name: GetMerchantInvitationByIdempotency :one
SELECT id, email_normalized, email_display, inviter_user_id, merchant_id, role_in_merchant,
       onboarding_purpose, token_hash, status, expires_at, accepted_at, accepted_user_id,
       revoked_at, revoked_by, idempotency_key, created_at, updated_at
FROM merchant_invitations
WHERE inviter_user_id = $1 AND idempotency_key = $2;

-- name: ListMerchantInvitations :many
SELECT id, email_normalized, email_display, inviter_user_id, merchant_id, role_in_merchant,
       onboarding_purpose, token_hash, status, expires_at, accepted_at, accepted_user_id,
       revoked_at, revoked_by, idempotency_key, created_at, updated_at
FROM merchant_invitations
ORDER BY created_at DESC
LIMIT $1;

-- name: RevokeMerchantInvitation :one
UPDATE merchant_invitations
SET status = 'REVOKED',
    revoked_at = $2,
    revoked_by = $3,
    updated_at = $2
WHERE id = $1
  AND status = 'PENDING'
RETURNING id, email_normalized, email_display, inviter_user_id, merchant_id, role_in_merchant,
          onboarding_purpose, token_hash, status, expires_at, accepted_at, accepted_user_id,
          revoked_at, revoked_by, idempotency_key, created_at, updated_at;

-- name: AcceptMerchantInvitation :one
UPDATE merchant_invitations
SET status = 'ACCEPTED',
    accepted_at = $2,
    accepted_user_id = $3,
    updated_at = $2
WHERE id = $1
  AND status = 'PENDING'
  AND expires_at > $2
RETURNING id, email_normalized, email_display, inviter_user_id, merchant_id, role_in_merchant,
          onboarding_purpose, token_hash, status, expires_at, accepted_at, accepted_user_id,
          revoked_at, revoked_by, idempotency_key, created_at, updated_at;

-- name: GetUserByIDAuthz :one
SELECT id, email_normalized, email_display, password_hash, name, status,
       email_verified_at, mfa_enabled, last_login_at, created_at, updated_at
FROM users
WHERE id = $1;

-- InsertAuditEventNote removed: AuthzRepo uses callAppendAuditEvent (BE-530).

-- INT-150 store bootstrap / preference

-- name: ListStoresForMerchant :many
SELECT id, merchant_id, slug, name, status, is_canonical,
       bio, address, accent_color,
       onboarding_state, onboarding_step, onboarding_completed_at, onboarding_progress,
       storefront_revision, published_revision,
       created_at, updated_at
FROM stores
WHERE merchant_id = $1
  AND status <> 'ARCHIVED'
ORDER BY is_canonical DESC, created_at ASC, id ASC;

-- name: GetSellerPreferredStoreID :one
SELECT preferred_store_id
FROM seller_store_preferences
WHERE user_id = $1;

-- name: UpsertSellerPreferredStore :exec
INSERT INTO seller_store_preferences (user_id, preferred_store_id, updated_at)
VALUES ($1, $2, $3)
ON CONFLICT (user_id) DO UPDATE
SET preferred_store_id = EXCLUDED.preferred_store_id,
    updated_at = EXCLUDED.updated_at;
