DELETE FROM schema_meta WHERE key = 'admin_ops';

DELETE FROM role_permissions WHERE permission_code = 'reviews.moderate';
DELETE FROM permissions WHERE code = 'reviews.moderate';

DROP TABLE IF EXISTS audit_exports;
DROP TABLE IF EXISTS platform_emergency_controls;

DROP INDEX IF EXISTS audit_events_actor_idx;
DROP INDEX IF EXISTS audit_events_resource_idx;
DROP INDEX IF EXISTS audit_events_action_idx;
DROP INDEX IF EXISTS audit_events_created_idx;

ALTER TABLE audit_events
    DROP COLUMN IF EXISTS metadata_json,
    DROP COLUMN IF EXISTS merchant_id,
    DROP COLUMN IF EXISTS request_id,
    DROP COLUMN IF EXISTS reason,
    DROP COLUMN IF EXISTS resource_id,
    DROP COLUMN IF EXISTS resource_type,
    DROP COLUMN IF EXISTS action,
    DROP COLUMN IF EXISTS actor_user_id;

ALTER TABLE merchants
    DROP COLUMN IF EXISTS suspended_by,
    DROP COLUMN IF EXISTS suspended_at,
    DROP COLUMN IF EXISTS suspension_reason;
