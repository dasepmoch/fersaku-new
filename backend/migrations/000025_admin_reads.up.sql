-- BE-500 Admin read-model permissions (least-privilege page gates).
-- SUPER_ADMIN receives all via SELECT from permissions on bootstrap path;
-- re-seed role grants for support/finance and any missing SUPER_ADMIN rows.

INSERT INTO permissions (code, description, category) VALUES
    ('admin.dashboard.read', 'Read admin command-center overview KPIs', 'admin'),
    ('buyers.read', 'List/read buyer identities (admin)', 'buyers'),
    ('orders.read', 'List/read global orders (admin)', 'orders'),
    ('payments.read', 'List/read payment intents (admin)', 'payments'),
    ('inventory.read', 'List/read redacted global inventory (admin)', 'inventory'),
    ('fulfillment.read', 'List/read delivery grants (admin)', 'fulfillment'),
    ('reviews.read', 'List/read review moderation queue (admin)', 'reviews'),
    ('users.read', 'Lookup users for support/impersonation target (admin)', 'users'),
    ('webhooks.read', 'Read inbound/outbound webhook queues (admin)', 'webhooks')
ON CONFLICT (code) DO NOTHING;

-- SUPER_ADMIN: any new permission codes
INSERT INTO role_permissions (role_id, permission_code)
SELECT 'role_super_admin', p.code
FROM permissions p
WHERE NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = 'role_super_admin' AND rp.permission_code = p.code
);

-- ADMIN_SUPPORT: operational read surface
INSERT INTO role_permissions (role_id, permission_code) VALUES
    ('role_admin_support', 'admin.dashboard.read'),
    ('role_admin_support', 'buyers.read'),
    ('role_admin_support', 'orders.read'),
    ('role_admin_support', 'payments.read'),
    ('role_admin_support', 'inventory.read'),
    ('role_admin_support', 'fulfillment.read'),
    ('role_admin_support', 'reviews.read'),
    ('role_admin_support', 'users.read'),
    ('role_admin_support', 'webhooks.read'),
    ('role_admin_support', 'inventory.reveal')
ON CONFLICT DO NOTHING;

-- ADMIN_FINANCE: finance-oriented reads
INSERT INTO role_permissions (role_id, permission_code) VALUES
    ('role_admin_finance', 'admin.dashboard.read'),
    ('role_admin_finance', 'orders.read'),
    ('role_admin_finance', 'payments.read'),
    ('role_admin_finance', 'webhooks.read')
ON CONFLICT DO NOTHING;

INSERT INTO schema_meta (key, value, updated_at) VALUES
    ('admin_reads', 'BE-500', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
