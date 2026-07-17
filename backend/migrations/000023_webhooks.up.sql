-- BE-420 Outbound seller-webhook delivery.
-- Extends seller_webhook_endpoints + webhook_endpoint_secret_versions;
-- adds webhook_deliveries / attempts / dead_letter projection support.
-- Outbox topic: seller_webhook.deliver (payload in outbox_events).

-- ---------------------------------------------------------------------------
-- seller_webhook_endpoints: secret version refs + store + normalized host
-- ---------------------------------------------------------------------------
ALTER TABLE seller_webhook_endpoints
    ADD COLUMN IF NOT EXISTS store_id text REFERENCES stores (id),
    ADD COLUMN IF NOT EXISTS url_host text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS current_secret_version integer,
    ADD COLUMN IF NOT EXISTS previous_secret_version integer,
    ADD COLUMN IF NOT EXISTS secret_overlap_expires_at timestamptz,
    ADD COLUMN IF NOT EXISTS disabled_at timestamptz,
    ADD COLUMN IF NOT EXISTS disabled_reason text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS seller_webhook_endpoints_store_idx
    ON seller_webhook_endpoints (store_id)
    WHERE store_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- webhook_endpoint_secret_versions: overlap expiry for PREVIOUS
-- ---------------------------------------------------------------------------
ALTER TABLE webhook_endpoint_secret_versions
    ADD COLUMN IF NOT EXISTS overlap_expires_at timestamptz;

-- ---------------------------------------------------------------------------
-- webhook_deliveries: outbound-only (never provider callback IDs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id                      text        PRIMARY KEY,
    endpoint_id             text        NOT NULL REFERENCES seller_webhook_endpoints (id),
    merchant_id             text        NOT NULL REFERENCES merchants (id),
    store_id                text        REFERENCES stores (id),
    payment_mode            text        NOT NULL,
    -- Stable event identity (immutable across retries).
    event_id                text        NOT NULL,
    event_type              text        NOT NULL,
    payload_version         text        NOT NULL DEFAULT 'fersaku.webhook.v1',
    -- Exact body bytes for signature (immutable on retry).
    payload_body            bytea       NOT NULL,
    payload_hash            text        NOT NULL,
    -- Source references (payment/order/withdrawal); never provider_event_id as PK.
    source_kind             text        NOT NULL DEFAULT 'PAYMENT',
    payment_intent_id       text,
    order_id                text,
    withdrawal_id           text,
    is_test                 boolean     NOT NULL DEFAULT false,
    status                  text        NOT NULL DEFAULT 'QUEUED',
    attempt_count           integer     NOT NULL DEFAULT 0,
    max_attempts            integer     NOT NULL DEFAULT 8,
    next_retry_at           timestamptz,
    last_http_status        integer,
    last_latency_ms         integer,
    last_error_class        text,
    dead_letter_reason      text,
    delivered_at            timestamptz,
    cancelled_at            timestamptz,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT webhook_deliveries_mode_check CHECK (payment_mode IN ('SANDBOX', 'LIVE')),
    CONSTRAINT webhook_deliveries_status_check CHECK (status IN (
        'QUEUED', 'DELIVERED', 'RETRYING', 'DEAD_LETTER', 'CANCELLED'
    )),
    CONSTRAINT webhook_deliveries_source_check CHECK (source_kind IN (
        'PAYMENT', 'WITHDRAWAL', 'TEST', 'GATEWAY'
    )),
    CONSTRAINT webhook_deliveries_attempt_nonneg CHECK (attempt_count >= 0),
    CONSTRAINT webhook_deliveries_max_pos CHECK (max_attempts >= 1),
    CONSTRAINT webhook_deliveries_event_nonempty CHECK (event_id <> '' AND event_type <> '')
);

-- One delivery row per endpoint+event (retries update same row).
CREATE UNIQUE INDEX webhook_deliveries_endpoint_event_uidx
    ON webhook_deliveries (endpoint_id, event_id);

CREATE INDEX webhook_deliveries_status_retry_idx
    ON webhook_deliveries (status, next_retry_at NULLS FIRST, created_at ASC)
    WHERE status IN ('QUEUED', 'RETRYING');

CREATE INDEX webhook_deliveries_merchant_idx
    ON webhook_deliveries (merchant_id, payment_mode, created_at DESC, id DESC);

CREATE INDEX webhook_deliveries_endpoint_idx
    ON webhook_deliveries (endpoint_id, created_at DESC, id DESC);

-- ---------------------------------------------------------------------------
-- webhook_delivery_attempts: per-HTTP-attempt history (fresh timestamp/signature)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webhook_delivery_attempts (
    id                      text        PRIMARY KEY,
    delivery_id             text        NOT NULL REFERENCES webhook_deliveries (id),
    attempt_no              integer     NOT NULL,
    -- Fresh per attempt (not stored secret).
    signed_timestamp        text        NOT NULL,
    signature_header        text        NOT NULL,
    request_url             text        NOT NULL,
    http_status             integer,
    latency_ms              integer,
    error_class             text,
    error_detail            text,
    response_snippet        text,
    started_at              timestamptz NOT NULL,
    finished_at             timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT webhook_delivery_attempts_no_pos CHECK (attempt_no >= 1),
    CONSTRAINT webhook_delivery_attempts_uidx UNIQUE (delivery_id, attempt_no)
);

CREATE INDEX webhook_delivery_attempts_delivery_idx
    ON webhook_delivery_attempts (delivery_id, attempt_no DESC);

-- ---------------------------------------------------------------------------
-- webhook_dead_letters: terminal outbound failures (admin retry source)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webhook_dead_letters (
    id                      text        PRIMARY KEY,
    delivery_id             text        NOT NULL UNIQUE REFERENCES webhook_deliveries (id),
    endpoint_id             text        NOT NULL REFERENCES seller_webhook_endpoints (id),
    merchant_id             text        NOT NULL REFERENCES merchants (id),
    event_id                text        NOT NULL,
    event_type              text        NOT NULL,
    reason                  text        NOT NULL,
    last_http_status        integer,
    attempt_count           integer     NOT NULL DEFAULT 0,
    created_at              timestamptz NOT NULL DEFAULT now(),
    resolved_at             timestamptz,
    resolved_by             text,
    resolve_reason          text
);

CREATE INDEX webhook_dead_letters_open_idx
    ON webhook_dead_letters (merchant_id, created_at DESC)
    WHERE resolved_at IS NULL;

INSERT INTO schema_meta (key, value, updated_at) VALUES
    ('webhooks', 'BE-420', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
