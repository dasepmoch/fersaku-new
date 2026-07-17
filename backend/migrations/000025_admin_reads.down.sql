DELETE FROM role_permissions WHERE permission_code IN (
    'admin.dashboard.read',
    'buyers.read',
    'orders.read',
    'payments.read',
    'inventory.read',
    'fulfillment.read',
    'reviews.read',
    'users.read',
    'webhooks.read'
);

DELETE FROM permissions WHERE code IN (
    'admin.dashboard.read',
    'buyers.read',
    'orders.read',
    'payments.read',
    'inventory.read',
    'fulfillment.read',
    'reviews.read',
    'users.read',
    'webhooks.read'
);

DELETE FROM schema_meta WHERE key = 'admin_reads';
