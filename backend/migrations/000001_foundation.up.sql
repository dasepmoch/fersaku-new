-- BE-100 foundation: extensions, outbox, idempotency, minimal audit stub.
-- IDs are text ULIDs (26-char Crockford base32), matching ports.IDGenerator.
-- Money columns (when present later) are bigint whole IDR.
-- Migrations are owned by the migrate role; the app role must not CREATE TABLE
-- in production (see migrations/README.md).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Optional schema metadata for operational notes (not a substitute for migrate versioning).
CREATE TABLE schema_meta (
    key         text PRIMARY KEY,
    value       text        NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_meta (key, value) VALUES
    ('id_strategy', 'ulid_text'),
    ('money_unit', 'idr_bigint'),
    ('foundation', 'BE-100');

-- Durable transactional outbox (Postgres authority; Redis is wake-up only).
CREATE TABLE outbox_events (
    id            text        PRIMARY KEY,
    topic         text        NOT NULL,
    payload       jsonb       NOT NULL,
    status        text        NOT NULL DEFAULT 'pending',
    attempts      integer     NOT NULL DEFAULT 0,
    available_at  timestamptz NOT NULL DEFAULT now(),
    created_at    timestamptz NOT NULL DEFAULT now(),
    processed_at  timestamptz,
    dedupe_key    text,
    payment_mode  text,
    lease_owner   text,
    lease_until   timestamptz,
    last_error    text,
    CONSTRAINT outbox_events_status_check
        CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead')),
    CONSTRAINT outbox_events_payment_mode_check
        CHECK (payment_mode IS NULL OR payment_mode IN ('SANDBOX', 'LIVE')),
    CONSTRAINT outbox_events_attempts_check
        CHECK (attempts >= 0)
);

CREATE UNIQUE INDEX outbox_events_dedupe_key_uidx
    ON outbox_events (dedupe_key)
    WHERE dedupe_key IS NOT NULL;

-- Poll/lease: workers claim rows available for work.
CREATE INDEX outbox_events_poll_idx
    ON outbox_events (available_at, id)
    WHERE status IN ('pending', 'failed');

CREATE INDEX outbox_events_lease_idx
    ON outbox_events (lease_until)
    WHERE status = 'processing';

CREATE INDEX outbox_events_topic_created_idx
    ON outbox_events (topic, created_at DESC, id DESC);

-- Idempotency records: first-writer-wins under unique scope.
-- NULLS NOT DISTINCT so NULL payment_mode values collide (PG16+).
CREATE TABLE idempotency_records (
    id                 text        PRIMARY KEY,
    subject_type       text        NOT NULL,
    subject_id         text        NOT NULL,
    operation          text        NOT NULL,
    payment_mode       text,
    key_hash           text        NOT NULL,
    request_hash       text        NOT NULL,
    status             text        NOT NULL,
    resource_type      text,
    resource_id        text,
    response_status    integer,
    response_body      jsonb,
    request_id         text,
    lease_expires_at   timestamptz,
    expires_at         timestamptz NOT NULL,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT idempotency_records_status_check
        CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'FAILED', 'UNKNOWN_PROVIDER_OUTCOME')),
    CONSTRAINT idempotency_records_payment_mode_check
        CHECK (payment_mode IS NULL OR payment_mode IN ('SANDBOX', 'LIVE')),
    CONSTRAINT idempotency_records_scope_uidx
        UNIQUE NULLS NOT DISTINCT (subject_type, subject_id, operation, payment_mode, key_hash)
);

CREATE INDEX idempotency_records_expires_idx
    ON idempotency_records (expires_at);

CREATE INDEX idempotency_records_lease_idx
    ON idempotency_records (lease_expires_at)
    WHERE status = 'IN_PROGRESS';

-- Minimal audit_events stub for proving atomic commit with outbox (full JCS chain is BE-530).
CREATE TABLE audit_events (
    id            text        PRIMARY KEY,
    sequence_no   bigint      NOT NULL,
    payload_hash  bytea       NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT audit_events_sequence_positive CHECK (sequence_no > 0),
    CONSTRAINT audit_events_payload_hash_len CHECK (octet_length(payload_hash) = 32)
);

CREATE UNIQUE INDEX audit_events_sequence_uidx ON audit_events (sequence_no);
