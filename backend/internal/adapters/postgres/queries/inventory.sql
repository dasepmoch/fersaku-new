-- BE-230 inventory schema / stock / reservation queries.

-- name: InventoryGetStoreByID :one
SELECT id, merchant_id, slug, name, bio, address, accent_color, status, is_canonical,
       storefront_revision, published_revision, published_revision_id,
       created_at, updated_at
FROM stores
WHERE id = $1;

-- name: InventoryUserCanAccessStore :one
SELECT EXISTS (
    SELECT 1
    FROM stores s
    JOIN merchant_members mm ON mm.merchant_id = s.merchant_id
    WHERE s.id = $1
      AND mm.user_id = $2
      AND mm.status = 'ACTIVE'
) AS ok;

-- name: InventoryUserIsPlatformAdmin :one
SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = $1
      AND r.archived_at IS NULL
      AND r.code IN ('SUPER_ADMIN', 'ADMIN_SUPPORT')
) AS ok;

-- name: InventoryGetProduct :one
SELECT id, store_id, merchant_id, slug, title, type, status, active_schema_version,
       created_at, updated_at
FROM products
WHERE id = $1 AND store_id = $2;

-- name: InventorySetProductActiveSchema :exec
UPDATE products
SET active_schema_version = $2,
    updated_at = $3
WHERE id = $1 AND store_id = $4;

-- name: InsertInventorySchema :exec
INSERT INTO inventory_schemas (
    id, product_id, store_id, merchant_id, version, fields, delimiter, checksum, created_by, created_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
);

-- name: GetInventorySchemaByVersion :one
SELECT id, product_id, store_id, merchant_id, version, fields, delimiter, checksum, created_by, created_at
FROM inventory_schemas
WHERE product_id = $1 AND version = $2;

-- name: GetInventorySchemaActive :one
SELECT s.id, s.product_id, s.store_id, s.merchant_id, s.version, s.fields, s.delimiter, s.checksum, s.created_by, s.created_at
FROM inventory_schemas s
JOIN products p ON p.id = s.product_id
WHERE p.id = $1 AND p.store_id = $2 AND p.active_schema_version = s.version;

-- name: MaxInventorySchemaVersion :one
SELECT COALESCE(MAX(version), 0)::int AS max_version
FROM inventory_schemas
WHERE product_id = $1;

-- name: InsertStockItem :exec
INSERT INTO stock_items (
    id, product_id, store_id, merchant_id, schema_version, status,
    encrypted_payload, key_version, masked_preview, unique_key_hash,
    created_by, created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10,
    $11, $12, $13
);

-- name: GetStockItemByID :one
SELECT id, product_id, store_id, merchant_id, schema_version, status,
       encrypted_payload, key_version, masked_preview, unique_key_hash,
       created_by, created_at, updated_at, reserved_at, delivered_at, revoked_at
FROM stock_items
WHERE id = $1 AND store_id = $2;

-- name: ListStockItemsByProduct :many
SELECT id, product_id, store_id, merchant_id, schema_version, status,
       encrypted_payload, key_version, masked_preview, unique_key_hash,
       created_by, created_at, updated_at, reserved_at, delivered_at, revoked_at
FROM stock_items
WHERE product_id = $1 AND store_id = $2
ORDER BY created_at DESC, id DESC
LIMIT $3;

-- name: CountStockByStatus :many
SELECT status, COUNT(*)::bigint AS cnt
FROM stock_items
WHERE product_id = $1 AND store_id = $2
GROUP BY status;

-- name: ListInventoryProductSummaries :many
SELECT p.id AS product_id, p.store_id, p.title, p.type, p.active_schema_version,
       COALESCE(SUM(CASE WHEN si.status = 'AVAILABLE' THEN 1 ELSE 0 END), 0)::bigint AS available,
       COALESCE(SUM(CASE WHEN si.status = 'RESERVED' THEN 1 ELSE 0 END), 0)::bigint AS reserved,
       COALESCE(SUM(CASE WHEN si.status = 'DELIVERED' THEN 1 ELSE 0 END), 0)::bigint AS delivered,
       COALESCE(SUM(CASE WHEN si.status = 'REVOKED' THEN 1 ELSE 0 END), 0)::bigint AS revoked,
       COALESCE(COUNT(si.id), 0)::bigint AS total
FROM products p
LEFT JOIN stock_items si ON si.product_id = p.id
WHERE p.store_id = $1
GROUP BY p.id, p.store_id, p.title, p.type, p.active_schema_version, p.created_at
ORDER BY p.created_at DESC, p.id DESC;

-- name: ClaimAvailableStockItem :one
SELECT id, product_id, store_id, merchant_id, schema_version, status,
       encrypted_payload, key_version, masked_preview, unique_key_hash,
       created_by, created_at, updated_at, reserved_at, delivered_at, revoked_at
FROM stock_items
WHERE product_id = $1
  AND store_id = $2
  AND status = 'AVAILABLE'
ORDER BY created_at ASC, id ASC
LIMIT 1
FOR UPDATE SKIP LOCKED;

-- name: UpdateStockItemStatus :execrows
UPDATE stock_items
SET status = $2,
    updated_at = $3,
    reserved_at = CASE WHEN $2 = 'RESERVED' THEN $3 ELSE reserved_at END,
    delivered_at = CASE WHEN $2 = 'DELIVERED' THEN $3 ELSE delivered_at END,
    revoked_at = CASE WHEN $2 = 'REVOKED' THEN $3 ELSE revoked_at END
WHERE id = $1 AND status = $4;

-- name: InsertStockReservation :exec
INSERT INTO stock_reservations (
    id, stock_item_id, product_id, store_id, merchant_id,
    order_id, checkout_id, idempotency_key, status, expires_at, created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5,
    $6, $7, $8, $9, $10, $11, $12
);

-- name: GetStockReservationByID :one
SELECT id, stock_item_id, product_id, store_id, merchant_id,
       order_id, checkout_id, idempotency_key, status, expires_at,
       released_at, delivered_at, created_at, updated_at
FROM stock_reservations
WHERE id = $1;

-- name: GetStockReservationByIdempotency :one
SELECT id, stock_item_id, product_id, store_id, merchant_id,
       order_id, checkout_id, idempotency_key, status, expires_at,
       released_at, delivered_at, created_at, updated_at
FROM stock_reservations
WHERE product_id = $1 AND idempotency_key = $2;

-- name: UpdateStockReservationStatus :execrows
UPDATE stock_reservations
SET status = $2,
    updated_at = $3,
    released_at = CASE WHEN $2 = 'RELEASED' THEN $3 ELSE released_at END,
    delivered_at = CASE WHEN $2 = 'DELIVERED' THEN $3 ELSE delivered_at END
WHERE id = $1 AND status = $4;

-- name: ListExpiredStockReservations :many
SELECT id, stock_item_id, product_id, store_id, merchant_id,
       order_id, checkout_id, idempotency_key, status, expires_at,
       released_at, delivered_at, created_at, updated_at
FROM stock_reservations
WHERE status = 'RESERVED' AND expires_at <= $1
ORDER BY expires_at ASC
LIMIT $2
FOR UPDATE SKIP LOCKED;

-- name: InsertStockRevealAudit :exec
INSERT INTO stock_reveal_audits (
    id, stock_item_id, store_id, product_id, actor_user_id, reason, mfa_verified, payload_hash, created_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9
);
