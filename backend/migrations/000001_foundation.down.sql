DROP TABLE IF EXISTS audit_events;
DROP TABLE IF EXISTS idempotency_records;
DROP TABLE IF EXISTS outbox_events;
DROP TABLE IF EXISTS schema_meta;
-- pgcrypto left installed (shared extension); not dropped on down.
