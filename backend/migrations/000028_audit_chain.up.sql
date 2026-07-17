-- BE-530 JCS-1 append-only audit chain.
-- SECURITY DEFINER append_audit_event locks chain head, assigns sequence, hashes payload.
-- Triggers forbid UPDATE/DELETE on audit_events and audit_checkpoints.

-- ---------------------------------------------------------------------------
-- Harden audit_events with chain integrity columns
-- ---------------------------------------------------------------------------
ALTER TABLE audit_events
    ADD COLUMN IF NOT EXISTS chain_scope text NOT NULL DEFAULT 'default',
    ADD COLUMN IF NOT EXISTS prev_hash bytea,
    ADD COLUMN IF NOT EXISTS row_hash bytea,
    ADD COLUMN IF NOT EXISTS canonical_version text NOT NULL DEFAULT 'JCS-1',
    ADD COLUMN IF NOT EXISTS canonical_payload bytea NOT NULL DEFAULT ''::bytea,
    ADD COLUMN IF NOT EXISTS jcs_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill chain fields for stub rows (pre-chain era).
UPDATE audit_events
SET
    chain_scope = COALESCE(NULLIF(chain_scope, ''), 'default'),
    prev_hash = COALESCE(prev_hash, decode(repeat('00', 32), 'hex')),
    row_hash = COALESCE(row_hash, payload_hash),
    canonical_version = COALESCE(NULLIF(canonical_version, ''), 'JCS-1'),
    canonical_payload = CASE
        WHEN octet_length(canonical_payload) = 0 THEN payload_hash
        ELSE canonical_payload
    END,
    jcs_payload = COALESCE(jcs_payload, metadata_json, '{}'::jsonb)
WHERE prev_hash IS NULL OR row_hash IS NULL;

ALTER TABLE audit_events
    ALTER COLUMN prev_hash SET NOT NULL,
    ALTER COLUMN row_hash SET NOT NULL;

ALTER TABLE audit_events
    DROP CONSTRAINT IF EXISTS audit_events_payload_hash_len;

ALTER TABLE audit_events
    ADD CONSTRAINT audit_events_payload_hash_len CHECK (octet_length(payload_hash) = 32),
    ADD CONSTRAINT audit_events_prev_hash_len CHECK (octet_length(prev_hash) = 32),
    ADD CONSTRAINT audit_events_row_hash_len CHECK (octet_length(row_hash) = 32),
    ADD CONSTRAINT audit_events_canonical_version_check CHECK (canonical_version = 'JCS-1'),
    ADD CONSTRAINT audit_events_chain_scope_nonempty CHECK (chain_scope <> '');

-- Replace global sequence uniqueness with (chain_scope, sequence_no).
DROP INDEX IF EXISTS audit_events_sequence_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS audit_events_chain_seq_uidx
    ON audit_events (chain_scope, sequence_no);

CREATE INDEX IF NOT EXISTS audit_events_chain_created_idx
    ON audit_events (chain_scope, created_at DESC, sequence_no DESC);

-- ---------------------------------------------------------------------------
-- audit_chain_heads: single-row lock target per scope
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_chain_heads (
    chain_scope     text        PRIMARY KEY,
    head_sequence   bigint      NOT NULL DEFAULT 0,
    head_hash       bytea       NOT NULL,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT audit_chain_heads_seq_nonneg CHECK (head_sequence >= 0),
    CONSTRAINT audit_chain_heads_hash_len CHECK (octet_length(head_hash) = 32),
    CONSTRAINT audit_chain_heads_scope_nonempty CHECK (chain_scope <> '')
);

INSERT INTO audit_chain_heads (chain_scope, head_sequence, head_hash, updated_at)
VALUES ('default', 0, decode(repeat('00', 32), 'hex'), now())
ON CONFLICT (chain_scope) DO NOTHING;

-- Sync head from existing events (if any).
UPDATE audit_chain_heads h
SET
    head_sequence = s.max_seq,
    head_hash = s.row_hash,
    updated_at = now()
FROM (
    SELECT chain_scope, sequence_no AS max_seq, row_hash
    FROM audit_events e1
    WHERE sequence_no = (
        SELECT MAX(sequence_no) FROM audit_events e2 WHERE e2.chain_scope = e1.chain_scope
    )
) s
WHERE h.chain_scope = s.chain_scope
  AND s.max_seq > h.head_sequence;

-- ---------------------------------------------------------------------------
-- audit_checkpoints: signed retention-locked anchors (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_checkpoints (
    id                  text        PRIMARY KEY,
    chain_scope         text        NOT NULL,
    sequence_no         bigint      NOT NULL,
    head_hash           bytea       NOT NULL,
    canonical_version   text        NOT NULL DEFAULT 'JCS-1',
    signature           bytea       NOT NULL,
    key_id              text        NOT NULL,
    signed_at           timestamptz NOT NULL,
    locked_until        timestamptz NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT audit_checkpoints_seq_positive CHECK (sequence_no > 0),
    CONSTRAINT audit_checkpoints_hash_len CHECK (octet_length(head_hash) = 32),
    CONSTRAINT audit_checkpoints_sig_nonempty CHECK (octet_length(signature) > 0),
    CONSTRAINT audit_checkpoints_version_check CHECK (canonical_version = 'JCS-1'),
    CONSTRAINT audit_checkpoints_scope_nonempty CHECK (chain_scope <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS audit_checkpoints_scope_seq_uidx
    ON audit_checkpoints (chain_scope, sequence_no);

CREATE INDEX IF NOT EXISTS audit_checkpoints_scope_created_idx
    ON audit_checkpoints (chain_scope, created_at DESC);

-- ---------------------------------------------------------------------------
-- Append-only enforcement
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'audit append-only: % on % is forbidden', TG_OP, TG_TABLE_NAME
        USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

DROP TRIGGER IF EXISTS audit_events_no_update ON audit_events;
CREATE TRIGGER audit_events_no_update
    BEFORE UPDATE ON audit_events
    FOR EACH ROW EXECUTE FUNCTION audit_reject_mutation();

DROP TRIGGER IF EXISTS audit_events_no_delete ON audit_events;
CREATE TRIGGER audit_events_no_delete
    BEFORE DELETE ON audit_events
    FOR EACH ROW EXECUTE FUNCTION audit_reject_mutation();

DROP TRIGGER IF EXISTS audit_checkpoints_no_update ON audit_checkpoints;
CREATE TRIGGER audit_checkpoints_no_update
    BEFORE UPDATE ON audit_checkpoints
    FOR EACH ROW EXECUTE FUNCTION audit_reject_mutation();

DROP TRIGGER IF EXISTS audit_checkpoints_no_delete ON audit_checkpoints;
CREATE TRIGGER audit_checkpoints_no_delete
    BEFORE DELETE ON audit_checkpoints
    FOR EACH ROW EXECUTE FUNCTION audit_reject_mutation();

DROP TRIGGER IF EXISTS audit_chain_heads_no_delete ON audit_chain_heads;
CREATE TRIGGER audit_chain_heads_no_delete
    BEFORE DELETE ON audit_chain_heads
    FOR EACH ROW EXECUTE FUNCTION audit_reject_mutation();

-- ---------------------------------------------------------------------------
-- append_audit_event: transactional head lock + JCS-1 row_hash
-- row_hash = SHA-256(
--   UTF8("fersaku.audit.v1") || 0x00 ||
--   int8send(sequence_no) || prev_hash ||
--   int4send(length(version_bytes)) || version_bytes ||
--   int8send(length(canonical_payload)) || canonical_payload
-- )
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION append_audit_event(
    p_id                 text,
    p_chain_scope        text,
    p_canonical_version  text,
    p_canonical_payload  bytea,
    p_actor_user_id      text,
    p_action             text,
    p_resource_type      text,
    p_resource_id        text,
    p_reason             text,
    p_request_id         text,
    p_merchant_id        text,
    p_metadata_json      jsonb,
    p_created_at         timestamptz
) RETURNS TABLE (
    out_id           text,
    out_sequence_no  bigint,
    out_prev_hash    bytea,
    out_row_hash     bytea,
    out_chain_scope  text,
    out_created_at   timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_scope      text;
    v_version    text;
    v_payload    bytea;
    v_prev       bytea;
    v_seq        bigint;
    v_row_hash   bytea;
    v_meta       jsonb;
    v_created    timestamptz;
    v_domain     bytea := convert_to('fersaku.audit.v1', 'UTF8');
    v_ver_bytes  bytea;
BEGIN
    IF p_id IS NULL OR p_id = '' THEN
        RAISE EXCEPTION 'audit event id required';
    END IF;

    v_scope := COALESCE(NULLIF(trim(p_chain_scope), ''), 'default');
    v_version := COALESCE(NULLIF(trim(p_canonical_version), ''), 'JCS-1');
    IF v_version <> 'JCS-1' THEN
        RAISE EXCEPTION 'unsupported canonical_version: %', v_version;
    END IF;

    v_payload := COALESCE(p_canonical_payload, ''::bytea);
    IF octet_length(v_payload) > 1048576 THEN
        RAISE EXCEPTION 'canonical_payload exceeds 1MiB';
    END IF;
    IF octet_length(v_payload) = 0 THEN
        RAISE EXCEPTION 'canonical_payload required';
    END IF;

    v_meta := COALESCE(p_metadata_json, '{}'::jsonb);
    v_created := COALESCE(p_created_at, now());
    v_ver_bytes := convert_to(v_version, 'UTF8');

    -- Ensure head row exists, then lock it.
    INSERT INTO audit_chain_heads (chain_scope, head_sequence, head_hash, updated_at)
    VALUES (v_scope, 0, decode(repeat('00', 32), 'hex'), v_created)
    ON CONFLICT (chain_scope) DO NOTHING;

    SELECT head_sequence, head_hash
    INTO v_seq, v_prev
    FROM audit_chain_heads
    WHERE chain_scope = v_scope
    FOR UPDATE;

    v_seq := v_seq + 1;

    v_row_hash := digest(
        v_domain
        || E'\\x00'::bytea
        || int8send(v_seq)
        || v_prev
        || int4send(octet_length(v_ver_bytes))
        || v_ver_bytes
        || int8send(octet_length(v_payload)::bigint)
        || v_payload,
        'sha256'
    );

    INSERT INTO audit_events (
        id, sequence_no, payload_hash, created_at,
        actor_user_id, action, resource_type, resource_id, reason, request_id, merchant_id, metadata_json,
        chain_scope, prev_hash, row_hash, canonical_version, canonical_payload, jcs_payload
    ) VALUES (
        p_id, v_seq, v_row_hash, v_created,
        NULLIF(p_actor_user_id, ''), NULLIF(p_action, ''), NULLIF(p_resource_type, ''),
        NULLIF(p_resource_id, ''), NULLIF(p_reason, ''), NULLIF(p_request_id, ''),
        NULLIF(p_merchant_id, ''), v_meta,
        v_scope, v_prev, v_row_hash, v_version, v_payload, v_meta
    );

    UPDATE audit_chain_heads
    SET head_sequence = v_seq,
        head_hash = v_row_hash,
        updated_at = v_created
    WHERE chain_scope = v_scope;

    out_id := p_id;
    out_sequence_no := v_seq;
    out_prev_hash := v_prev;
    out_row_hash := v_row_hash;
    out_chain_scope := v_scope;
    out_created_at := v_created;
    RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION append_audit_event(
    text, text, text, bytea, text, text, text, text, text, text, text, jsonb, timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION append_audit_event(
    text, text, text, bytea, text, text, text, text, text, text, text, jsonb, timestamptz
) TO PUBLIC;

-- ---------------------------------------------------------------------------
-- insert_audit_checkpoint: create-only (no overwrite); app role cannot UPDATE/DELETE
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION insert_audit_checkpoint(
    p_id                text,
    p_chain_scope       text,
    p_sequence_no       bigint,
    p_head_hash         bytea,
    p_canonical_version text,
    p_signature         bytea,
    p_key_id            text,
    p_signed_at         timestamptz,
    p_locked_until      timestamptz
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_scope text;
BEGIN
    IF p_id IS NULL OR p_id = '' THEN
        RAISE EXCEPTION 'checkpoint id required';
    END IF;
    v_scope := COALESCE(NULLIF(trim(p_chain_scope), ''), 'default');
    IF p_sequence_no IS NULL OR p_sequence_no <= 0 THEN
        RAISE EXCEPTION 'checkpoint sequence_no must be positive';
    END IF;
    IF octet_length(COALESCE(p_head_hash, ''::bytea)) <> 32 THEN
        RAISE EXCEPTION 'checkpoint head_hash must be 32 bytes';
    END IF;
    IF octet_length(COALESCE(p_signature, ''::bytea)) = 0 THEN
        RAISE EXCEPTION 'checkpoint signature required';
    END IF;

    INSERT INTO audit_checkpoints (
        id, chain_scope, sequence_no, head_hash, canonical_version,
        signature, key_id, signed_at, locked_until, created_at
    ) VALUES (
        p_id, v_scope, p_sequence_no, p_head_hash,
        COALESCE(NULLIF(p_canonical_version, ''), 'JCS-1'),
        p_signature, COALESCE(NULLIF(p_key_id, ''), 'local'),
        COALESCE(p_signed_at, now()),
        COALESCE(p_locked_until, now() + interval '365 days'),
        now()
    );

    RETURN p_id;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'checkpoint already exists for scope/sequence (overwrite denied)'
            USING ERRCODE = 'unique_violation';
END;
$$;

REVOKE ALL ON FUNCTION insert_audit_checkpoint(
    text, text, bigint, bytea, text, bytea, text, timestamptz, timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION insert_audit_checkpoint(
    text, text, bigint, bytea, text, bytea, text, timestamptz, timestamptz
) TO PUBLIC;

INSERT INTO schema_meta (key, value, updated_at) VALUES
    ('audit_chain', 'BE-530', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
