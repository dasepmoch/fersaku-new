-- BE-330 Inbound Xendit callback + payment finalization.
-- provider_callback_rejections (no replay path), payment_provider_events enhancements,
-- minimal payment_settlements for exactly-once paid credit (full ledger BE-340).

-- ---------------------------------------------------------------------------
-- provider_callback_rejections (invalid auth/oversize/malformed only)
-- ---------------------------------------------------------------------------
CREATE TABLE provider_callback_rejections (
    id                  text        PRIMARY KEY,
    provider            text        NOT NULL DEFAULT 'XENDIT',
    account_scope       text,
    payment_mode        text,
    reason              text        NOT NULL,
    http_status         integer     NOT NULL,
    content_type        text,
    body_bytes          integer     NOT NULL DEFAULT 0,
    body_digest         text,
    client_ip           text,
    request_id          text,
    received_at         timestamptz NOT NULL DEFAULT now(),
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT provider_callback_rejections_provider_check CHECK (provider = 'XENDIT'),
    CONSTRAINT provider_callback_rejections_mode_check
        CHECK (payment_mode IS NULL OR payment_mode IN ('SANDBOX', 'LIVE')),
    CONSTRAINT provider_callback_rejections_reason_nonempty CHECK (reason <> ''),
    CONSTRAINT provider_callback_rejections_body_nonneg CHECK (body_bytes >= 0)
);

CREATE INDEX provider_callback_rejections_received_idx
    ON provider_callback_rejections (received_at DESC, id DESC);

CREATE INDEX provider_callback_rejections_reason_idx
    ON provider_callback_rejections (reason, received_at DESC);

-- ---------------------------------------------------------------------------
-- payment_provider_events: columns for normalize/replay evidence
-- (table shell from BE-310; four-part unique already present)
-- ---------------------------------------------------------------------------
ALTER TABLE payment_provider_events
    ADD COLUMN IF NOT EXISTS raw_event_type text,
    ADD COLUMN IF NOT EXISTS provider_reference text,
    ADD COLUMN IF NOT EXISTS external_id text,
    ADD COLUMN IF NOT EXISTS amount_idr bigint,
    ADD COLUMN IF NOT EXISTS currency text,
    ADD COLUMN IF NOT EXISTS mismatch_code text,
    ADD COLUMN IF NOT EXISTS alert_code text,
    ADD COLUMN IF NOT EXISTS replay_count integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_replay_at timestamptz,
    ADD COLUMN IF NOT EXISTS last_replay_reason text,
    ADD COLUMN IF NOT EXISTS quarantine_reason text;

ALTER TABLE payment_provider_events DROP CONSTRAINT IF EXISTS payment_provider_events_attempt_nonneg;
ALTER TABLE payment_provider_events
    ADD CONSTRAINT payment_provider_events_attempt_nonneg CHECK (attempt_count >= 0),
    ADD CONSTRAINT payment_provider_events_replay_nonneg CHECK (replay_count >= 0);

CREATE INDEX IF NOT EXISTS payment_provider_events_provider_ref_idx
    ON payment_provider_events (provider, account_scope, payment_mode, provider_reference)
    WHERE provider_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_provider_events_intent_idx
    ON payment_provider_events (payment_intent_id, received_at DESC)
    WHERE payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_provider_events_replay_idx
    ON payment_provider_events (processing_state, received_at DESC)
    WHERE processing_state IN ('ACCEPTED', 'FAILED', 'QUARANTINED');

-- ---------------------------------------------------------------------------
-- payment_settlements: minimal exactly-once paid credit stub (BE-340 expands ledger)
-- Unique reference PAYMENT_CAPTURE:{payment_intent_id} guarantees one post.
-- ---------------------------------------------------------------------------
CREATE TABLE payment_settlements (
    id                  text        PRIMARY KEY,
    payment_intent_id   text        NOT NULL REFERENCES payment_intents (id),
    order_id            text        NOT NULL REFERENCES orders (id),
    merchant_id         text        NOT NULL REFERENCES merchants (id),
    store_id            text,
    payment_mode        text        NOT NULL,
    source              text        NOT NULL,
    provider            text        NOT NULL DEFAULT 'XENDIT',
    account_scope       text        NOT NULL,
    provider_reference  text,
    provider_event_id   text,
    journal_reference   text        NOT NULL,
    gross_idr           bigint      NOT NULL,
    fee_idr             bigint      NOT NULL,
    merchant_net_idr    bigint      NOT NULL,
    currency            text        NOT NULL DEFAULT 'IDR',
    paid_late           boolean     NOT NULL DEFAULT false,
    preceding_status    text,
    status              text        NOT NULL DEFAULT 'POSTED',
    posted_at           timestamptz NOT NULL DEFAULT now(),
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT payment_settlements_mode_check CHECK (payment_mode IN ('SANDBOX', 'LIVE')),
    CONSTRAINT payment_settlements_source_check CHECK (source IN ('STOREFRONT', 'QRIS_API')),
    CONSTRAINT payment_settlements_provider_check CHECK (provider = 'XENDIT'),
    CONSTRAINT payment_settlements_currency_check CHECK (currency = 'IDR'),
    CONSTRAINT payment_settlements_money_nonneg CHECK (
        gross_idr > 0 AND fee_idr >= 0 AND merchant_net_idr >= 0
    ),
    CONSTRAINT payment_settlements_status_check CHECK (status IN ('POSTED')),
    CONSTRAINT payment_settlements_journal_nonempty CHECK (journal_reference <> '')
);

CREATE UNIQUE INDEX payment_settlements_journal_uidx
    ON payment_settlements (journal_reference);

CREATE UNIQUE INDEX payment_settlements_intent_uidx
    ON payment_settlements (payment_intent_id);

CREATE INDEX payment_settlements_merchant_posted_idx
    ON payment_settlements (merchant_id, payment_mode, posted_at DESC);

CREATE INDEX payment_settlements_order_idx
    ON payment_settlements (order_id);

-- ---------------------------------------------------------------------------
-- payment_intents: mark paid_late via existing column; ensure paid_at on orders
-- ---------------------------------------------------------------------------
-- paid_late already on payment_intents (BE-310).

-- Mark order paid with paid_at (extend checkout update path uses this column).
-- No schema change required if paid_at exists on orders (BE-235).

INSERT INTO schema_meta (key, value, updated_at) VALUES
    ('callbacks', 'BE-330', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
