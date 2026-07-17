-- BE-410 Credential lifecycle: claim tokens, key versioning, secret_claims skeleton.
-- Webhook secret delivery remains BE-420; this only supports claim-path schema.

-- ---------------------------------------------------------------------------
-- merchant_api_keys: version + issuance linkage
-- ---------------------------------------------------------------------------
ALTER TABLE merchant_api_keys
    ADD COLUMN IF NOT EXISTS key_version integer NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS issuance_request_id text REFERENCES api_credential_issuance_requests (id),
    ADD COLUMN IF NOT EXISTS fingerprint text NOT NULL DEFAULT '';

ALTER TABLE merchant_api_keys
    DROP CONSTRAINT IF EXISTS merchant_api_keys_version_pos;
ALTER TABLE merchant_api_keys
    ADD CONSTRAINT merchant_api_keys_version_pos CHECK (key_version >= 1);

CREATE INDEX IF NOT EXISTS merchant_api_keys_issuance_idx
    ON merchant_api_keys (issuance_request_id)
    WHERE issuance_request_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- api_credential_issuance_requests: one-time claim token (hash only)
-- ---------------------------------------------------------------------------
ALTER TABLE api_credential_issuance_requests
    ADD COLUMN IF NOT EXISTS claim_token_hash text,
    ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz,
    ADD COLUMN IF NOT EXISTS claim_recipient_user_id text REFERENCES users (id),
    ADD COLUMN IF NOT EXISTS claim_attempts integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS claim_consumed_at timestamptz,
    ADD COLUMN IF NOT EXISTS mfa_binding_session_id text,
    ADD COLUMN IF NOT EXISTS expected_predecessor_key_id text,
    ADD COLUMN IF NOT EXISTS expected_version integer,
    ADD COLUMN IF NOT EXISTS request_version integer NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS idempotency_key_hash text,
    ADD COLUMN IF NOT EXISTS resulting_api_key_id text;

-- Purpose: keep API_KEY|ROTATION; also allow INITIAL_ISSUE alias via app (stored as API_KEY).
ALTER TABLE api_credential_issuance_requests
    DROP CONSTRAINT IF EXISTS api_cred_issuance_purpose_check;
ALTER TABLE api_credential_issuance_requests
    ADD CONSTRAINT api_cred_issuance_purpose_check CHECK (purpose IN (
        'API_KEY', 'ROTATION', 'INITIAL_ISSUE', 'ROTATE'
    ));

CREATE INDEX IF NOT EXISTS api_cred_issuance_claim_hash_idx
    ON api_credential_issuance_requests (claim_token_hash)
    WHERE claim_token_hash IS NOT NULL AND status = 'AUTHORIZED';

-- ---------------------------------------------------------------------------
-- secret_claims: general one-time claim rows (API_KEY + WEBHOOK_ENDPOINT_SECRET)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS secret_claims (
    id                      text        PRIMARY KEY,
    kind                    text        NOT NULL,
    resource_type           text        NOT NULL,
    resource_id             text        NOT NULL,
    resource_version        integer     NOT NULL DEFAULT 1,
    merchant_id             text        NOT NULL REFERENCES merchants (id),
    recipient_user_id       text        NOT NULL REFERENCES users (id),
    claim_token_hash        text        NOT NULL,
    status                  text        NOT NULL DEFAULT 'ACTIVE',
    attempts                integer     NOT NULL DEFAULT 0,
    max_attempts            integer     NOT NULL DEFAULT 5,
    expires_at              timestamptz NOT NULL,
    consumed_at             timestamptz,
    mfa_binding_session_id  text,
    issuance_request_id     text        REFERENCES api_credential_issuance_requests (id),
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT secret_claims_kind_check CHECK (kind IN ('API_KEY', 'WEBHOOK_ENDPOINT_SECRET')),
    CONSTRAINT secret_claims_status_check CHECK (status IN ('ACTIVE', 'CONSUMED', 'EXPIRED', 'REVOKED')),
    CONSTRAINT secret_claims_hash_nonempty CHECK (claim_token_hash <> ''),
    CONSTRAINT secret_claims_attempts_nonneg CHECK (attempts >= 0),
    CONSTRAINT secret_claims_version_pos CHECK (resource_version >= 1)
);

-- One active claim per resource/version/kind.
CREATE UNIQUE INDEX secret_claims_active_resource_uidx
    ON secret_claims (kind, resource_type, resource_id, resource_version)
    WHERE status = 'ACTIVE';

CREATE INDEX secret_claims_token_hash_idx
    ON secret_claims (claim_token_hash)
    WHERE status = 'ACTIVE';

CREATE INDEX secret_claims_merchant_idx
    ON secret_claims (merchant_id, kind, status);

-- ---------------------------------------------------------------------------
-- webhook_endpoint_secret_versions: skeleton for BE-420 claim path
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webhook_endpoint_secret_versions (
    id                      text        PRIMARY KEY,
    endpoint_id             text        NOT NULL REFERENCES seller_webhook_endpoints (id),
    merchant_id             text        NOT NULL REFERENCES merchants (id),
    version                 integer     NOT NULL DEFAULT 1,
    status                  text        NOT NULL DEFAULT 'PENDING_CLAIM',
    -- Envelope-encrypted signing material (server retains for outbound sign; BE-420).
    secret_ciphertext       bytea,
    secret_key_version      text        NOT NULL DEFAULT '',
    fingerprint             text        NOT NULL DEFAULT '',
    activated_at            timestamptz,
    superseded_at           timestamptz,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT webhook_secret_ver_status_check CHECK (status IN (
        'PENDING_CLAIM', 'ACTIVE', 'PREVIOUS', 'REVOKED'
    )),
    CONSTRAINT webhook_secret_ver_pos CHECK (version >= 1)
);

CREATE UNIQUE INDEX webhook_secret_ver_endpoint_version_uidx
    ON webhook_endpoint_secret_versions (endpoint_id, version);

CREATE UNIQUE INDEX webhook_secret_ver_active_uidx
    ON webhook_endpoint_secret_versions (endpoint_id)
    WHERE status = 'ACTIVE';

CREATE INDEX webhook_secret_ver_merchant_idx
    ON webhook_endpoint_secret_versions (merchant_id, endpoint_id);

INSERT INTO schema_meta (key, value, updated_at) VALUES
    ('credentials', 'BE-410', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
