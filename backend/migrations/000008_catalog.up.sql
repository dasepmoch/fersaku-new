-- BE-210 Catalog / storefront revisions.
-- Products: seller/admin only mutations; public reads published only.
-- Money: bigint whole IDR (no float). Storefront publish uses revision/ETag optimistic concurrency.

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
CREATE TABLE products (
    id                  text        PRIMARY KEY,
    store_id            text        NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
    merchant_id         text        NOT NULL REFERENCES merchants (id) ON DELETE CASCADE,
    slug                text        NOT NULL,
    title               text        NOT NULL,
    short               text        NOT NULL DEFAULT '',
    description         text        NOT NULL DEFAULT '',
    price_idr           bigint      NOT NULL,
    type                text        NOT NULL,
    status              text        NOT NULL DEFAULT 'draft',
    version             text        NOT NULL DEFAULT '1.0.0',
    badge               text        NOT NULL DEFAULT '',
    palette             text        NOT NULL DEFAULT '',
    glyph               text        NOT NULL DEFAULT '',
    includes            jsonb       NOT NULL DEFAULT '[]'::jsonb,
    allow_pwyt          boolean     NOT NULL DEFAULT false,
    minimum_price_idr   bigint,
    published_at        timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT products_slug_nonempty CHECK (slug <> ''),
    CONSTRAINT products_title_nonempty CHECK (title <> ''),
    CONSTRAINT products_price_nonneg CHECK (price_idr >= 0),
    CONSTRAINT products_min_price_nonneg CHECK (minimum_price_idr IS NULL OR minimum_price_idr >= 0),
    CONSTRAINT products_type_check CHECK (type IN ('download', 'link', 'code')),
    CONSTRAINT products_status_check CHECK (status IN ('draft', 'published', 'archived')),
    CONSTRAINT products_slug_format_check CHECK (
        slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
        AND char_length(slug) BETWEEN 1 AND 80
    )
);

CREATE UNIQUE INDEX products_store_slug_uidx ON products (store_id, slug);
CREATE INDEX products_store_id_idx ON products (store_id);
CREATE INDEX products_merchant_id_idx ON products (merchant_id);
CREATE INDEX products_status_idx ON products (status);
CREATE INDEX products_published_featured_idx
    ON products (published_at DESC NULLS LAST, id DESC)
    WHERE status = 'published';

-- ---------------------------------------------------------------------------
-- storefront_revisions (optimistic concurrency via revision + etag)
-- ---------------------------------------------------------------------------
CREATE TABLE storefront_revisions (
    id            text        PRIMARY KEY,
    store_id      text        NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
    revision      integer     NOT NULL,
    status        text        NOT NULL DEFAULT 'draft',
    etag          text        NOT NULL,
    config        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    published_at  timestamptz,
    created_by    text        REFERENCES users (id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT storefront_revisions_revision_pos CHECK (revision >= 1),
    CONSTRAINT storefront_revisions_etag_nonempty CHECK (etag <> ''),
    CONSTRAINT storefront_revisions_status_check CHECK (status IN ('draft', 'published'))
);

CREATE UNIQUE INDEX storefront_revisions_store_revision_uidx
    ON storefront_revisions (store_id, revision);
CREATE INDEX storefront_revisions_store_id_idx ON storefront_revisions (store_id);
CREATE INDEX storefront_revisions_store_status_idx
    ON storefront_revisions (store_id, status, revision DESC);

-- Optional pointer to current published revision row.
ALTER TABLE stores
    ADD COLUMN IF NOT EXISTS published_revision_id text;

ALTER TABLE stores
    DROP CONSTRAINT IF EXISTS stores_published_revision_id_fkey;
ALTER TABLE stores
    ADD CONSTRAINT stores_published_revision_id_fkey
        FOREIGN KEY (published_revision_id)
        REFERENCES storefront_revisions (id)
        ON DELETE SET NULL;

INSERT INTO schema_meta (key, value, updated_at) VALUES
    ('catalog', 'BE-210', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
