-- BE-310 Hosted checkout / payment intents (storefront QRIS).
-- Aligns orders with full payment SM; payment_intents ready for BE-330 callbacks.
-- Does NOT implement inbound callback finalization (BE-330) or gateway API (BE-320).

-- ---------------------------------------------------------------------------
-- Extend orders for pending checkout lifecycle
-- ---------------------------------------------------------------------------
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check CHECK (payment_status IN (
    'UNPAID', 'PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED',
    'CREATED', 'PENDING_PAYMENT', 'FULFILLING', 'FULFILLED', 'DELIVERY_FAILED'
));

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS order_status text NOT NULL DEFAULT 'CREATED',
    ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'SANDBOX',
    ADD COLUMN IF NOT EXISTS fee_snapshot_id text,
    ADD COLUMN IF NOT EXISTS coupon_reservation_id text,
    ADD COLUMN IF NOT EXISTS public_token_hash text,
    ADD COLUMN IF NOT EXISTS buyer_session_id text,
    ADD COLUMN IF NOT EXISTS expires_at timestamptz,
    ADD COLUMN IF NOT EXISTS idempotency_key_hash text;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_order_status_check CHECK (order_status IN (
    'CREATED', 'PENDING_PAYMENT', 'PAID', 'FULFILLING', 'FULFILLED',
    'DELIVERY_FAILED', 'FAILED', 'EXPIRED', 'CANCELLED'
));

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_mode_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_mode_check CHECK (payment_mode IN ('SANDBOX', 'LIVE'));

CREATE INDEX IF NOT EXISTS orders_public_token_hash_idx
    ON orders (public_token_hash)
    WHERE public_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_buyer_session_idx
    ON orders (buyer_session_id, created_at DESC)
    WHERE buyer_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_pending_expires_idx
    ON orders (expires_at)
    WHERE order_status = 'PENDING_PAYMENT';

-- ---------------------------------------------------------------------------
-- payment_intents (hosted checkout + future gateway)
-- ---------------------------------------------------------------------------
CREATE TABLE payment_intents (
    id                          text        PRIMARY KEY,
    order_id                    text        NOT NULL REFERENCES orders (id),
    store_id                    text        NOT NULL REFERENCES stores (id),
    merchant_id                 text        NOT NULL REFERENCES merchants (id),
    payment_mode                text        NOT NULL,
    source                      text        NOT NULL,
    provider                    text        NOT NULL DEFAULT 'XENDIT',
    account_scope               text        NOT NULL DEFAULT 'xendit-primary',
    provider_reference          text,
    external_id                 text        NOT NULL,
    amount_idr                  bigint      NOT NULL,
    currency                    text        NOT NULL DEFAULT 'IDR',
    fee_snapshot_id             text        REFERENCES fee_snapshots (id),
    coupon_reservation_id       text,
    stock_reservation_id        text,
    status                      text        NOT NULL DEFAULT 'REQUIRES_PAYMENT',
    provider_financial_state    text        NOT NULL DEFAULT 'NORMAL',
    qr_string                   text,
    qr_image_url                text,
    expires_at                  timestamptz NOT NULL,
    cancel_requested_at         timestamptz,
    expire_requested_at         timestamptz,
    cancel_reason               text,
    expire_reason               text,
    unknown_operation           text,
    lookup_scheduled_at         timestamptz,
    lookup_attempts             integer     NOT NULL DEFAULT 0,
    paid_late                   boolean     NOT NULL DEFAULT false,
    preceding_status            text,
    buyer_user_id               text        REFERENCES users (id),
    buyer_email                 text        NOT NULL DEFAULT '',
    buyer_session_id            text,
    public_token_hash           text,
    idempotency_key_hash        text        NOT NULL,
    request_hash                text        NOT NULL,
    product_snapshot            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    price_snapshot              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    version                     integer     NOT NULL DEFAULT 1,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT payment_intents_mode_check CHECK (payment_mode IN ('SANDBOX', 'LIVE')),
    CONSTRAINT payment_intents_source_check CHECK (source IN ('STOREFRONT', 'QRIS_API')),
    CONSTRAINT payment_intents_provider_check CHECK (provider = 'XENDIT'),
    CONSTRAINT payment_intents_currency_check CHECK (currency = 'IDR'),
    CONSTRAINT payment_intents_amount_pos CHECK (amount_idr > 0),
    CONSTRAINT payment_intents_status_check CHECK (status IN (
        'REQUIRES_PAYMENT', 'PENDING', 'CANCEL_PENDING', 'EXPIRE_PENDING',
        'UNKNOWN_OUTCOME', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED'
    )),
    CONSTRAINT payment_intents_financial_state_check CHECK (provider_financial_state IN (
        'NORMAL', 'PROVIDER_REVERSAL_HELD', 'PROVIDER_REVERSAL_CONFIRMED'
    )),
    CONSTRAINT payment_intents_version_pos CHECK (version >= 1),
    CONSTRAINT payment_intents_lookup_attempts_nonneg CHECK (lookup_attempts >= 0)
);

CREATE UNIQUE INDEX payment_intents_order_uidx ON payment_intents (order_id);

CREATE UNIQUE INDEX payment_intents_provider_ref_uidx
    ON payment_intents (provider, account_scope, payment_mode, provider_reference)
    WHERE provider_reference IS NOT NULL;

CREATE UNIQUE INDEX payment_intents_external_id_uidx
    ON payment_intents (payment_mode, external_id);

CREATE UNIQUE INDEX payment_intents_idempotency_uidx
    ON payment_intents (source, payment_mode, idempotency_key_hash);

CREATE INDEX payment_intents_status_expires_idx
    ON payment_intents (status, expires_at);

CREATE INDEX payment_intents_store_created_idx
    ON payment_intents (store_id, created_at DESC, id DESC);

CREATE INDEX payment_intents_merchant_mode_idx
    ON payment_intents (merchant_id, payment_mode, created_at DESC);

CREATE INDEX payment_intents_public_token_idx
    ON payment_intents (public_token_hash)
    WHERE public_token_hash IS NOT NULL;

CREATE INDEX payment_intents_lookup_idx
    ON payment_intents (lookup_scheduled_at)
    WHERE status = 'UNKNOWN_OUTCOME';

-- ---------------------------------------------------------------------------
-- payment_provider_events stub shell for BE-330 (create empty, no ingress yet)
-- ---------------------------------------------------------------------------
CREATE TABLE payment_provider_events (
    callback_id         text        PRIMARY KEY,
    provider            text        NOT NULL DEFAULT 'XENDIT',
    account_scope       text        NOT NULL,
    payment_mode        text        NOT NULL,
    provider_event_id   text        NOT NULL,
    received_at         timestamptz NOT NULL DEFAULT now(),
    normalized_type     text,
    processing_state    text        NOT NULL DEFAULT 'ACCEPTED',
    failure_code        text,
    attempt_count       integer     NOT NULL DEFAULT 0,
    lease_owner         text,
    lease_until         timestamptz,
    next_retry_at       timestamptz,
    processed_at        timestamptz,
    payment_intent_id   text        REFERENCES payment_intents (id),
    payload_digest      text,
    encrypted_payload   bytea,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT payment_provider_events_mode_check CHECK (payment_mode IN ('SANDBOX', 'LIVE')),
    CONSTRAINT payment_provider_events_state_check CHECK (processing_state IN (
        'ACCEPTED', 'PROCESSING', 'PROCESSED', 'FAILED', 'QUARANTINED'
    )),
    CONSTRAINT payment_provider_events_attempt_nonneg CHECK (attempt_count >= 0)
);

CREATE UNIQUE INDEX payment_provider_events_canonical_uidx
    ON payment_provider_events (provider, account_scope, payment_mode, provider_event_id);

CREATE INDEX payment_provider_events_processing_idx
    ON payment_provider_events (processing_state, next_retry_at NULLS FIRST, received_at);

INSERT INTO schema_meta (key, value, updated_at) VALUES
    ('checkout', 'BE-310', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
