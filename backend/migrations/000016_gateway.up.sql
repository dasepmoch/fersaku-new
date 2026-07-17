-- BE-320 QRIS Payment Gateway API.
-- Merchant API keys, capabilities (LIVE gate stub), redirect origins, webhook endpoints.
-- Gateway-only payment columns on payment_intents. Callback finalization remains BE-330.
-- Credential lifecycle full claim flow is BE-410; this migration supports sandbox create + LIVE capability gate.

-- ---------------------------------------------------------------------------
-- payment_intents: gateway fields
-- ---------------------------------------------------------------------------
ALTER TABLE payment_intents
    ADD COLUMN IF NOT EXISTS merchant_reference text,
    ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS success_url text,
    ADD COLUMN IF NOT EXISTS failure_url text,
    ADD COLUMN IF NOT EXISTS webhook_endpoint_id text,
    ADD COLUMN IF NOT EXISTS webhook_config_version integer,
    ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS payment_intents_merchant_ref_uidx
    ON payment_intents (merchant_id, payment_mode, merchant_reference)
    WHERE merchant_reference IS NOT NULL AND merchant_reference <> '';

CREATE INDEX IF NOT EXISTS payment_intents_merchant_ref_lookup_idx
    ON payment_intents (merchant_id, payment_mode, merchant_reference)
    WHERE merchant_reference IS NOT NULL;

-- ---------------------------------------------------------------------------
-- merchant_api_keys (prefix + keyed hash only; raw key never stored)
-- ---------------------------------------------------------------------------
CREATE TABLE merchant_api_keys (
    id              text        PRIMARY KEY,
    merchant_id     text        NOT NULL REFERENCES merchants (id),
    key_prefix      text        NOT NULL,
    key_hash        text        NOT NULL,
    payment_mode    text        NOT NULL,
    status          text        NOT NULL DEFAULT 'ACTIVE',
    name            text        NOT NULL DEFAULT '',
    last_used_at    timestamptz,
    revoked_at      timestamptz,
    expires_at      timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT merchant_api_keys_mode_check CHECK (payment_mode IN ('SANDBOX', 'LIVE')),
    CONSTRAINT merchant_api_keys_status_check CHECK (status IN ('ACTIVE', 'REVOKED', 'SUSPENDED', 'EXPIRED')),
    CONSTRAINT merchant_api_keys_prefix_nonempty CHECK (key_prefix <> ''),
    CONSTRAINT merchant_api_keys_hash_nonempty CHECK (key_hash <> '')
);

CREATE UNIQUE INDEX merchant_api_keys_prefix_uidx ON merchant_api_keys (key_prefix);

-- At most one ACTIVE auth key per merchant (UI contract).
CREATE UNIQUE INDEX merchant_api_keys_active_merchant_uidx
    ON merchant_api_keys (merchant_id)
    WHERE status = 'ACTIVE';

CREATE INDEX merchant_api_keys_merchant_mode_idx
    ON merchant_api_keys (merchant_id, payment_mode, status);

-- ---------------------------------------------------------------------------
-- merchant_api_capabilities (LIVE gate; KYC case optional stub for BE-400)
-- ---------------------------------------------------------------------------
CREATE TABLE merchant_api_capabilities (
    id                  text        PRIMARY KEY,
    merchant_id         text        NOT NULL REFERENCES merchants (id),
    payment_mode        text        NOT NULL,
    capability          text        NOT NULL DEFAULT 'QRIS_API',
    status              text        NOT NULL DEFAULT 'INACTIVE',
    kyc_case_id         text,
    kyc_version         integer,
    suspension_reason   text,
    suspended_by        text,
    effective_at        timestamptz,
    expires_at          timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT merchant_api_capabilities_mode_check CHECK (payment_mode IN ('SANDBOX', 'LIVE')),
    CONSTRAINT merchant_api_capabilities_cap_check CHECK (capability = 'QRIS_API'),
    CONSTRAINT merchant_api_capabilities_status_check CHECK (status IN (
        'INACTIVE', 'PENDING_KYC', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED'
    )),
    CONSTRAINT merchant_api_capabilities_uidx UNIQUE (merchant_id, payment_mode, capability)
);

CREATE INDEX merchant_api_capabilities_status_idx
    ON merchant_api_capabilities (merchant_id, payment_mode, status);

-- ---------------------------------------------------------------------------
-- gateway_redirect_origins (allowlist for successUrl/failureUrl; never server-fetched)
-- ---------------------------------------------------------------------------
CREATE TABLE gateway_redirect_origins (
    id                  text        PRIMARY KEY,
    merchant_id         text        NOT NULL REFERENCES merchants (id),
    payment_mode        text        NOT NULL,
    origin              text        NOT NULL,
    status              text        NOT NULL DEFAULT 'ACTIVE',
    created_by          text,
    reason              text        NOT NULL DEFAULT '',
    revoked_at          timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT gateway_redirect_origins_mode_check CHECK (payment_mode IN ('SANDBOX', 'LIVE')),
    CONSTRAINT gateway_redirect_origins_status_check CHECK (status IN ('ACTIVE', 'REVOKED')),
    CONSTRAINT gateway_redirect_origins_origin_https CHECK (origin LIKE 'https://%'),
    CONSTRAINT gateway_redirect_origins_uidx UNIQUE (merchant_id, payment_mode, origin)
);

CREATE INDEX gateway_redirect_origins_lookup_idx
    ON gateway_redirect_origins (merchant_id, payment_mode, status);

-- ---------------------------------------------------------------------------
-- seller_webhook_endpoints (minimal for webhookEndpointId validation; delivery BE-420)
-- ---------------------------------------------------------------------------
CREATE TABLE seller_webhook_endpoints (
    id                  text        PRIMARY KEY,
    merchant_id         text        NOT NULL REFERENCES merchants (id),
    payment_mode        text        NOT NULL,
    url                 text        NOT NULL,
    status              text        NOT NULL DEFAULT 'PENDING_VERIFICATION',
    config_version      integer     NOT NULL DEFAULT 1,
    event_allowlist     jsonb       NOT NULL DEFAULT '[]'::jsonb,
    secret_ciphertext   bytea,
    secret_key_version  text,
    failure_count       integer     NOT NULL DEFAULT 0,
    last_success_at     timestamptz,
    last_failure_at     timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT seller_webhook_endpoints_mode_check CHECK (payment_mode IN ('SANDBOX', 'LIVE')),
    CONSTRAINT seller_webhook_endpoints_status_check CHECK (status IN (
        'PENDING_VERIFICATION', 'PENDING_SECRET_CLAIM', 'ACTIVE', 'SUSPENDED', 'REVOKED'
    )),
    CONSTRAINT seller_webhook_endpoints_url_https CHECK (url LIKE 'https://%'),
    CONSTRAINT seller_webhook_endpoints_version_pos CHECK (config_version >= 1),
    CONSTRAINT seller_webhook_endpoints_failure_nonneg CHECK (failure_count >= 0)
);

-- Launch: at most one ACTIVE endpoint per merchant/mode.
CREATE UNIQUE INDEX seller_webhook_endpoints_active_uidx
    ON seller_webhook_endpoints (merchant_id, payment_mode)
    WHERE status = 'ACTIVE';

CREATE INDEX seller_webhook_endpoints_merchant_idx
    ON seller_webhook_endpoints (merchant_id, payment_mode, status);

-- ---------------------------------------------------------------------------
-- gateway_payment_events (merchant-visible lifecycle events; not provider callbacks)
-- ---------------------------------------------------------------------------
CREATE TABLE gateway_payment_events (
    id                  text        PRIMARY KEY,
    merchant_id         text        NOT NULL REFERENCES merchants (id),
    payment_mode        text        NOT NULL,
    payment_intent_id   text        NOT NULL REFERENCES payment_intents (id),
    event_type          text        NOT NULL,
    payload             jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT gateway_payment_events_mode_check CHECK (payment_mode IN ('SANDBOX', 'LIVE')),
    CONSTRAINT gateway_payment_events_type_nonempty CHECK (event_type <> '')
);

CREATE INDEX gateway_payment_events_intent_idx
    ON gateway_payment_events (payment_intent_id, created_at DESC, id DESC);

CREATE INDEX gateway_payment_events_merchant_idx
    ON gateway_payment_events (merchant_id, payment_mode, created_at DESC, id DESC);

INSERT INTO schema_meta (key, value, updated_at) VALUES
    ('gateway', 'BE-320', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
