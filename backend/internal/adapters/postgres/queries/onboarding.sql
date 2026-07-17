-- BE-200 onboarding queries (merchant + canonical store lifecycle).

-- name: UpdateMerchantOnboarding :exec
UPDATE merchants
SET display_name = $2,
    legal_name = $3,
    business_type = $4,
    onboarding_state = $5,
    onboarding_step = $6,
    onboarding_completed_at = $7,
    onboarding_progress = $8,
    updated_at = $9
WHERE id = $1;

-- name: UpdateStoreOnboarding :exec
UPDATE stores
SET slug = $2,
    name = $3,
    bio = $4,
    address = $5,
    accent_color = $6,
    onboarding_state = $7,
    onboarding_step = $8,
    onboarding_completed_at = $9,
    onboarding_progress = $10,
    updated_at = $11
WHERE id = $1 AND merchant_id = $12;

-- name: CountActiveStoresForMerchant :one
SELECT COUNT(*)::bigint
FROM stores
WHERE merchant_id = $1
  AND status <> 'ARCHIVED';

-- name: DeleteStoreByID :execrows
DELETE FROM stores
WHERE id = $1 AND merchant_id = $2;

-- name: ListMerchantsMissingCanonicalStore :many
SELECT m.id, m.owner_user_id, m.display_name, m.status, m.created_at, m.updated_at
FROM merchants m
WHERE NOT EXISTS (
    SELECT 1 FROM stores s
    WHERE s.merchant_id = m.id
      AND s.is_canonical = true
      AND s.status <> 'ARCHIVED'
)
ORDER BY m.created_at ASC;

-- name: SlugExists :one
SELECT EXISTS (
    SELECT 1 FROM stores WHERE slug = $1
) AS exists;

-- name: SlugExistsExcludingStore :one
SELECT EXISTS (
    SELECT 1 FROM stores WHERE slug = $1 AND id <> $2
) AS exists;

-- name: GetRoleIDByCode :one
SELECT id FROM roles WHERE code = $1 AND archived_at IS NULL;
