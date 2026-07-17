DELETE FROM role_permissions WHERE permission_code IN ('invitations.staff', 'invitations.merchant');
DELETE FROM permissions WHERE code IN ('invitations.staff', 'invitations.merchant');
DROP TABLE IF EXISTS merchant_invitations;
DROP TABLE IF EXISTS staff_invitations;
DELETE FROM schema_meta WHERE key = 'roles_invites';
