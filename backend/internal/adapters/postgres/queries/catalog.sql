-- BE-210 catalog / storefront queries.

-- name: CatalogGetStoreByID :one
SELECT id, merchant_id, slug, name, bio, address, accent_color, status, is_canonical,
       storefront_revision, published_revision, published_revision_id,
       created_at, updated_at
FROM stores
WHERE id = $1;

-- name: CatalogGetStoreBySlug :one
SELECT id, merchant_id, slug, name, bio, address, accent_color, status, is_canonical,
       storefront_revision, published_revision, published_revision_id,
       created_at, updated_at
FROM stores
WHERE slug = $1;

-- name: CatalogUserCanAccessStore :one
SELECT EXISTS (
    SELECT 1
    FROM stores s
    JOIN merchant_members mm ON mm.merchant_id = s.merchant_id
    WHERE s.id = $1
      AND mm.user_id = $2
      AND mm.status = 'ACTIVE'
) AS ok;

-- name: CatalogUserIsPlatformAdmin :one
SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = $1
      AND r.archived_at IS NULL
      AND r.code IN ('SUPER_ADMIN', 'ADMIN_SUPPORT')
) AS ok;

-- name: CatalogUpdateStorePublishedRevision :exec
UPDATE stores
SET published_revision = $2,
    published_revision_id = $3,
    storefront_revision = $4,
    updated_at = $5
WHERE id = $1;

-- name: InsertProduct :exec
INSERT INTO products (
    id, store_id, merchant_id, slug, title, short, description,
    price_idr, type, status, version, badge, palette, glyph, includes,
    allow_pwyt, minimum_price_idr, published_at, created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7,
    $8, $9, $10, $11, $12, $13, $14, $15,
    $16, $17, $18, $19, $20
);

-- name: UpdateProduct :exec
UPDATE products
SET slug = $2,
    title = $3,
    short = $4,
    description = $5,
    price_idr = $6,
    type = $7,
    status = $8,
    version = $9,
    badge = $10,
    palette = $11,
    glyph = $12,
    includes = $13,
    allow_pwyt = $14,
    minimum_price_idr = $15,
    published_at = $16,
    updated_at = $17
WHERE id = $1 AND store_id = $18;

-- name: GetProductByID :one
SELECT id, store_id, merchant_id, slug, title, short, description,
       price_idr, type, status, version, badge, palette, glyph, includes,
       allow_pwyt, minimum_price_idr, published_at, created_at, updated_at,
       active_schema_version
FROM products
WHERE store_id = $1 AND id = $2;

-- name: GetProductBySlug :one
SELECT id, store_id, merchant_id, slug, title, short, description,
       price_idr, type, status, version, badge, palette, glyph, includes,
       allow_pwyt, minimum_price_idr, published_at, created_at, updated_at,
       active_schema_version
FROM products
WHERE store_id = $1 AND slug = $2;

-- name: ListProductsByStore :many
SELECT id, store_id, merchant_id, slug, title, short, description,
       price_idr, type, status, version, badge, palette, glyph, includes,
       allow_pwyt, minimum_price_idr, published_at, created_at, updated_at,
       active_schema_version
FROM products
WHERE store_id = $1
ORDER BY created_at DESC, id DESC;

-- name: ListPublishedProductsByStore :many
SELECT id, store_id, merchant_id, slug, title, short, description,
       price_idr, type, status, version, badge, palette, glyph, includes,
       allow_pwyt, minimum_price_idr, published_at, created_at, updated_at,
       active_schema_version
FROM products
WHERE store_id = $1 AND status = 'published'
ORDER BY published_at DESC NULLS LAST, id DESC;

-- name: ListFeaturedProducts :many
-- PUB-100: published products on ACTIVE stores only; include canonical store slug.
SELECT p.id, p.store_id, p.merchant_id, p.slug, p.title, p.short, p.description,
       p.price_idr, p.type, p.status, p.version, p.badge, p.palette, p.glyph, p.includes,
       p.allow_pwyt, p.minimum_price_idr, p.published_at, p.created_at, p.updated_at,
       p.active_schema_version, s.slug AS store_slug
FROM products p
INNER JOIN stores s ON s.id = p.store_id
WHERE p.status = 'published'
  AND s.status = 'ACTIVE'
ORDER BY p.published_at DESC NULLS LAST, p.id DESC
LIMIT $1;

-- name: GetPublishedProductByID :one
SELECT p.id, p.store_id, p.merchant_id, p.slug, p.title, p.short, p.description,
       p.price_idr, p.type, p.status, p.version, p.badge, p.palette, p.glyph, p.includes,
       p.allow_pwyt, p.minimum_price_idr, p.published_at, p.created_at, p.updated_at,
       p.active_schema_version, s.slug AS store_slug
FROM products p
INNER JOIN stores s ON s.id = p.store_id
WHERE p.id = $1 AND p.status = 'published' AND s.status = 'ACTIVE';

-- name: GetPublishedProductBySlug :one
-- Global slug is first-match only; prefer GetPublishedProductByStoreAndSlug for store-bound reads.
SELECT p.id, p.store_id, p.merchant_id, p.slug, p.title, p.short, p.description,
       p.price_idr, p.type, p.status, p.version, p.badge, p.palette, p.glyph, p.includes,
       p.allow_pwyt, p.minimum_price_idr, p.published_at, p.created_at, p.updated_at,
       p.active_schema_version, s.slug AS store_slug
FROM products p
INNER JOIN stores s ON s.id = p.store_id
WHERE p.slug = $1 AND p.status = 'published' AND s.status = 'ACTIVE'
ORDER BY p.published_at DESC NULLS LAST
LIMIT 1;

-- name: GetPublishedProductByStoreAndSlug :one
SELECT p.id, p.store_id, p.merchant_id, p.slug, p.title, p.short, p.description,
       p.price_idr, p.type, p.status, p.version, p.badge, p.palette, p.glyph, p.includes,
       p.allow_pwyt, p.minimum_price_idr, p.published_at, p.created_at, p.updated_at,
       p.active_schema_version, s.slug AS store_slug
FROM products p
INNER JOIN stores s ON s.id = p.store_id
WHERE s.slug = $1 AND p.slug = $2 AND p.status = 'published' AND s.status = 'ACTIVE';

-- name: ProductSlugExists :one
SELECT EXISTS (
    SELECT 1 FROM products
    WHERE store_id = $1 AND slug = $2 AND ($3::text = '' OR id <> $3)
) AS exists;

-- name: GetLatestDraftRevision :one
SELECT id, store_id, revision, status, etag, config, published_at, created_by, created_at
FROM storefront_revisions
WHERE store_id = $1 AND status = 'draft'
ORDER BY revision DESC
LIMIT 1;

-- name: GetPublishedRevision :one
SELECT id, store_id, revision, status, etag, config, published_at, created_by, created_at
FROM storefront_revisions
WHERE store_id = $1 AND status = 'published'
ORDER BY revision DESC
LIMIT 1;

-- name: GetRevisionByNumber :one
SELECT id, store_id, revision, status, etag, config, published_at, created_by, created_at
FROM storefront_revisions
WHERE store_id = $1 AND revision = $2;

-- name: InsertStorefrontRevision :exec
INSERT INTO storefront_revisions (
    id, store_id, revision, status, etag, config, published_at, created_by, created_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);

-- name: UpdateStorefrontRevisionDraft :exec
UPDATE storefront_revisions
SET etag = $2,
    config = $3
WHERE id = $1 AND status = 'draft';

-- name: MarkStorefrontRevisionPublished :exec
UPDATE storefront_revisions
SET status = 'published',
    published_at = $2
WHERE id = $1 AND status = 'draft';

-- name: NextStorefrontRevisionNumber :one
SELECT COALESCE(MAX(revision), 0)::int + 1 AS next
FROM storefront_revisions
WHERE store_id = $1;
