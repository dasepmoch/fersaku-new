-- BE-210 catalog down.

ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_published_revision_id_fkey;
ALTER TABLE stores DROP COLUMN IF EXISTS published_revision_id;

DROP TABLE IF EXISTS storefront_revisions;
DROP TABLE IF EXISTS products;

DELETE FROM schema_meta WHERE key = 'catalog';
