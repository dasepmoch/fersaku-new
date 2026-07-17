-- BE-330 down

DROP TABLE IF EXISTS payment_settlements;

DROP INDEX IF EXISTS payment_provider_events_replay_idx;
DROP INDEX IF EXISTS payment_provider_events_intent_idx;
DROP INDEX IF EXISTS payment_provider_events_provider_ref_idx;

ALTER TABLE payment_provider_events
    DROP COLUMN IF EXISTS quarantine_reason,
    DROP COLUMN IF EXISTS last_replay_reason,
    DROP COLUMN IF EXISTS last_replay_at,
    DROP COLUMN IF EXISTS replay_count,
    DROP COLUMN IF EXISTS alert_code,
    DROP COLUMN IF EXISTS mismatch_code,
    DROP COLUMN IF EXISTS currency,
    DROP COLUMN IF EXISTS amount_idr,
    DROP COLUMN IF EXISTS external_id,
    DROP COLUMN IF EXISTS provider_reference,
    DROP COLUMN IF EXISTS raw_event_type;

DROP TABLE IF EXISTS provider_callback_rejections;

DELETE FROM schema_meta WHERE key = 'callbacks';
