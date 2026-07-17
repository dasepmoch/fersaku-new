-- BE-530 down: remove chain infrastructure (destructive).

DROP FUNCTION IF EXISTS insert_audit_checkpoint(
    text, text, bigint, bytea, text, bytea, text, timestamptz, timestamptz
);
DROP FUNCTION IF EXISTS append_audit_event(
    text, text, text, bytea, text, text, text, text, text, text, text, jsonb, timestamptz
);

DROP TRIGGER IF EXISTS audit_chain_heads_no_delete ON audit_chain_heads;
DROP TRIGGER IF EXISTS audit_checkpoints_no_delete ON audit_checkpoints;
DROP TRIGGER IF EXISTS audit_checkpoints_no_update ON audit_checkpoints;
DROP TRIGGER IF EXISTS audit_events_no_delete ON audit_events;
DROP TRIGGER IF EXISTS audit_events_no_update ON audit_events;
DROP FUNCTION IF EXISTS audit_reject_mutation();

DROP TABLE IF EXISTS audit_checkpoints;
DROP TABLE IF EXISTS audit_chain_heads;

DROP INDEX IF EXISTS audit_events_chain_created_idx;
DROP INDEX IF EXISTS audit_events_chain_seq_uidx;

ALTER TABLE audit_events
    DROP CONSTRAINT IF EXISTS audit_events_chain_scope_nonempty,
    DROP CONSTRAINT IF EXISTS audit_events_canonical_version_check,
    DROP CONSTRAINT IF EXISTS audit_events_row_hash_len,
    DROP CONSTRAINT IF EXISTS audit_events_prev_hash_len;

ALTER TABLE audit_events
    DROP COLUMN IF EXISTS jcs_payload,
    DROP COLUMN IF EXISTS canonical_payload,
    DROP COLUMN IF EXISTS canonical_version,
    DROP COLUMN IF EXISTS row_hash,
    DROP COLUMN IF EXISTS prev_hash,
    DROP COLUMN IF EXISTS chain_scope;

CREATE UNIQUE INDEX IF NOT EXISTS audit_events_sequence_uidx ON audit_events (sequence_no);

DELETE FROM schema_meta WHERE key = 'audit_chain';
