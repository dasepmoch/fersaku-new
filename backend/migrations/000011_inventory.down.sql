DELETE FROM role_permissions
WHERE role_id = 'role_seller_owner' AND permission_code = 'inventory.reveal';

DROP TABLE IF EXISTS stock_reveal_audits;
DROP TABLE IF EXISTS stock_reservations;
DROP TABLE IF EXISTS stock_items;
DROP TABLE IF EXISTS inventory_schemas;

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_active_schema_version_pos;
ALTER TABLE products DROP COLUMN IF EXISTS active_schema_version;

DELETE FROM schema_meta WHERE key = 'inventory';
