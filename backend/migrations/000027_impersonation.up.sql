-- BE-520 Admin impersonation sessions.
-- Scopes: READ_ONLY | SUPPORT_WRITE only (no PRIVILEGED/FULL).
-- Derived session is a separate auth_sessions row; never overwrites target's real session.

CREATE TABLE impersonation_sessions (
    id                      text        PRIMARY KEY,
    actor_admin_id          text        NOT NULL REFERENCES users (id),
    target_user_id          text        NOT NULL REFERENCES users (id),
    target_merchant_id      text        REFERENCES merchants (id),
    scope                   text        NOT NULL,
    status                  text        NOT NULL DEFAULT 'ACTIVE',
    reason                  text        NOT NULL,
    ticket                  text        NOT NULL DEFAULT '',
    mfa_at                  timestamptz NOT NULL,
    original_session_id     text        NOT NULL REFERENCES auth_sessions (id),
    derived_session_id      text        NOT NULL REFERENCES auth_sessions (id),
    session_token_hash      text        NOT NULL,
    expires_at              timestamptz NOT NULL,
    ended_at                timestamptz,
    ended_by                text        REFERENCES users (id),
    end_reason              text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT impersonation_scope_check CHECK (
        scope IN ('READ_ONLY', 'SUPPORT_WRITE')
    ),
    CONSTRAINT impersonation_status_check CHECK (
        status IN ('ACTIVE', 'EXPIRED', 'TERMINATED', 'REVOKED')
    ),
    CONSTRAINT impersonation_reason_nonempty CHECK (char_length(btrim(reason)) >= 12),
    CONSTRAINT impersonation_actor_ne_target CHECK (actor_admin_id <> target_user_id),
    CONSTRAINT impersonation_session_token_hash_unique UNIQUE (session_token_hash),
    CONSTRAINT impersonation_derived_session_unique UNIQUE (derived_session_id)
);

CREATE INDEX impersonation_sessions_actor_idx
    ON impersonation_sessions (actor_admin_id, created_at DESC);

CREATE INDEX impersonation_sessions_target_idx
    ON impersonation_sessions (target_user_id, created_at DESC);

CREATE INDEX impersonation_sessions_active_expires_idx
    ON impersonation_sessions (expires_at)
    WHERE status = 'ACTIVE' AND ended_at IS NULL;

CREATE INDEX impersonation_sessions_original_idx
    ON impersonation_sessions (original_session_id);
