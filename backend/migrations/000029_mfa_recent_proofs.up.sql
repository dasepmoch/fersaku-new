-- INT-140: opaque recent MFA step-up proofs (hash at rest; session/purpose bound).
CREATE TABLE IF NOT EXISTS mfa_recent_proofs (
    id            text        PRIMARY KEY,
    user_id       text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    session_id    text        NOT NULL REFERENCES auth_sessions (id) ON DELETE CASCADE,
    purpose       text        NOT NULL,
    proof_hash    text        NOT NULL,
    factor        text        NOT NULL,
    expires_at    timestamptz NOT NULL,
    consumed_at   timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT mfa_recent_proofs_purpose_chk CHECK (
        purpose IN (
            'inventory.reveal',
            'credentials.rotate',
            'bank.change',
            'withdrawal.create',
            'admin.command'
        )
    ),
    CONSTRAINT mfa_recent_proofs_factor_chk CHECK (
        factor IN ('totp', 'recovery', 'password')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS mfa_recent_proofs_hash_uidx
    ON mfa_recent_proofs (proof_hash);

CREATE INDEX IF NOT EXISTS mfa_recent_proofs_session_idx
    ON mfa_recent_proofs (session_id)
    WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS mfa_recent_proofs_expires_idx
    ON mfa_recent_proofs (expires_at);
