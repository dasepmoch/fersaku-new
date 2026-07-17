DROP TABLE IF EXISTS mfa_recovery_codes;
DROP TABLE IF EXISTS mfa_factors;
DROP TABLE IF EXISTS auth_challenges;
DROP TABLE IF EXISTS auth_sessions;
DROP TABLE IF EXISTS users;
DELETE FROM schema_meta WHERE key = 'identity';
