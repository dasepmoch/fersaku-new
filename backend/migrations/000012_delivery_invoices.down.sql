-- BE-235 down: delivery grants / immutable invoices / minimal orders.

ALTER TABLE object_refs DROP CONSTRAINT IF EXISTS object_refs_purpose_check;
ALTER TABLE object_refs ADD CONSTRAINT object_refs_purpose_check CHECK (purpose IN (
    'PRODUCT_FILE',
    'PUBLIC_ASSET',
    'PROFILE_ASSET',
    'INVOICE_INPUT'
));

DROP TABLE IF EXISTS invoice_versions;
DROP TABLE IF EXISTS invoices;
DROP TABLE IF EXISTS delivery_attempts;
DROP TABLE IF EXISTS delivery_grants;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;

DELETE FROM schema_meta WHERE key = 'delivery_invoices';
