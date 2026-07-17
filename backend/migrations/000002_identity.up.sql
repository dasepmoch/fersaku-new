-- BE-120 identity/session lifecycle.
-- IDs are text ULIDs. Raw session/challenge tokens are never stored (hash only).

CREATE TABLE users (
    id                 text        PRIMARY KEY,
    email_normalized   text        NOT NULL,
    email_display      text        NOT NULL,
    password_hash      text,
    name               text        NOT NULL DEFAULT '',
    status             text        NOT NULL DEFAULT 'PENDING_VERIFICATION',
    email_verified_at  timestamptz,
    mfa_enabled        boolean     NOT NULL DEFAULT false,
    last_login_at      timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT users_status_check
        CHECK (status IN ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'CLOSED')),
    CONSTRAINT users_email_normalized_nonempty
        CHECK (email_normalized <> '')
);

CREATE UNIQUE INDEX users_email_normalized_uidx ON users (email_normalized);

CREATE TABLE auth_sessions (
    id                text        PRIMARY KEY,
    user_id           text        NOT NULL REFERENCES users (id),
    surface           text        NOT NULL,
    token_hash        text        NOT NULL,
    expires_at        timestamptz NOT NULL,
    revoked_at        timestamptz,
    mfa_verified_at   timestamptz,
    last_seen_at      timestamptz NOT NULL DEFAULT now(),
    absolute_expires_at timestamptz NOT NULL,
    ip_hash           text,
    ua_hash           text,
    device_label      text,
    csrf_token_hash   text        NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT auth_sessions_surface_check
        CHECK (surface IN ('BUYER', 'SELLER', 'ADMIN'))
);

CREATE UNIQUE INDEX auth_sessions_token_hash_uidx ON auth_sessions (token_hash);
CREATE INDEX auth_sessions_user_id_idx ON auth_sessions (user_id);
CREATE INDEX auth_sessions_user_active_idx
    ON auth_sessions (user_id, created_at DESC)
    WHERE revoked_at IS NULL;

CREATE TABLE auth_challenges (
    id            text        PRIMARY KEY,
    user_id       text        REFERENCES users (id),
    purpose       text        NOT NULL,
    token_hash    text        NOT NULL,
    audience      text        NOT NULL DEFAULT '',
    expires_at    timestamptz NOT NULL,
    consumed_at   timestamptz,
    attempts      integer     NOT NULL DEFAULT 0,
    max_attempts  integer     NOT NULL DEFAULT 5,
    payload       jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT auth_challenges_purpose_check
        CHECK (purpose IN (
            'EMAIL_VERIFY',
            'PASSWORD_RESET',
            'MAGIC_LINK',
            'MFA_ENROLL'
        )),
    CONSTRAINT auth_challenges_attempts_check
        CHECK (attempts >= 0 AND max_attempts > 0)
);

CREATE UNIQUE INDEX auth_challenges_token_hash_uidx ON auth_challenges (token_hash);
CREATE INDEX auth_challenges_purpose_hash_idx ON auth_challenges (purpose, token_hash);
CREATE INDEX auth_challenges_user_purpose_idx ON auth_challenges (user_id, purpose)
    WHERE consumed_at IS NULL;

CREATE TABLE mfa_factors (
    id              text        PRIMARY KEY,
    user_id         text        NOT NULL REFERENCES users (id),
    factor_type     text        NOT NULL DEFAULT 'TOTP',
    secret_enc      text        NOT NULL,
    label           text        NOT NULL DEFAULT 'Authenticator',
    confirmed_at    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT mfa_factors_type_check CHECK (factor_type IN ('TOTP'))
);

CREATE UNIQUE INDEX mfa_factors_user_type_uidx
    ON mfa_factors (user_id, factor_type)
    WHERE confirmed_at IS NOT NULL;
CREATE INDEX mfa_factors_user_id_idx ON mfa_factors (user_id);

CREATE TABLE mfa_recovery_codes (
    id            text        PRIMARY KEY,
    user_id       text        NOT NULL REFERENCES users (id),
    code_hash     text        NOT NULL,
    consumed_at   timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX mfa_recovery_codes_hash_uidx ON mfa_recovery_codes (code_hash);
CREATE INDEX mfa_recovery_codes_user_id_idx ON mfa_recovery_codes (user_id);

INSERT INTO schema_meta (key, value, updated_at) VALUES
    ('identity', 'BE-120', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
