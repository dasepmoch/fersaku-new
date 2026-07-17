-- BE-130 down: drop RBAC and minimal tenant tables (reverse of up).

DROP TABLE IF EXISTS stores;
DROP TABLE IF EXISTS merchant_members;
DROP TABLE IF EXISTS merchants;
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS permissions;

DELETE FROM schema_meta WHERE key = 'rbac';
