-- BE-135 Roles, assignments, and invitation lifecycle.
-- roles already has is_system/version/archived_at (BE-130); invitations are new.

CREATE TABLE staff_invitations (
    id               text        PRIMARY KEY,
    email_normalized text        NOT NULL,
    email_display    text        NOT NULL DEFAULT '',
    inviter_user_id  text        NOT NULL REFERENCES users (id),
    role_id          text        NOT NULL REFERENCES roles (id),
    token_hash       text        NOT NULL,
    status           text        NOT NULL DEFAULT 'PENDING',
    expires_at       timestamptz NOT NULL,
    accepted_at      timestamptz,
    accepted_user_id text        REFERENCES users (id),
    revoked_at       timestamptz,
    revoked_by       text        REFERENCES users (id),
    idempotency_key  text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT staff_invitations_email_nonempty CHECK (email_normalized <> ''),
    CONSTRAINT staff_invitations_token_nonempty CHECK (token_hash <> ''),
    CONSTRAINT staff_invitations_status_check
        CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'))
);

CREATE UNIQUE INDEX staff_invitations_token_hash_uidx ON staff_invitations (token_hash);
CREATE UNIQUE INDEX staff_invitations_idempotency_uidx
    ON staff_invitations (inviter_user_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';
CREATE INDEX staff_invitations_email_status_idx
    ON staff_invitations (email_normalized, status);
CREATE INDEX staff_invitations_status_expires_idx
    ON staff_invitations (status, expires_at);

CREATE TABLE merchant_invitations (
    id                 text        PRIMARY KEY,
    email_normalized   text        NOT NULL,
    email_display      text        NOT NULL DEFAULT '',
    inviter_user_id    text        NOT NULL REFERENCES users (id),
    merchant_id        text        REFERENCES merchants (id),
    role_in_merchant   text        NOT NULL,
    onboarding_purpose text        NOT NULL DEFAULT 'SELLER_ONBOARD',
    token_hash         text        NOT NULL,
    status             text        NOT NULL DEFAULT 'PENDING',
    expires_at         timestamptz NOT NULL,
    accepted_at        timestamptz,
    accepted_user_id   text        REFERENCES users (id),
    revoked_at         timestamptz,
    revoked_by         text        REFERENCES users (id),
    idempotency_key    text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT merchant_invitations_email_nonempty CHECK (email_normalized <> ''),
    CONSTRAINT merchant_invitations_token_nonempty CHECK (token_hash <> ''),
    CONSTRAINT merchant_invitations_role_check
        CHECK (role_in_merchant IN ('OWNER', 'STAFF')),
    CONSTRAINT merchant_invitations_status_check
        CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'))
);

CREATE UNIQUE INDEX merchant_invitations_token_hash_uidx ON merchant_invitations (token_hash);
CREATE UNIQUE INDEX merchant_invitations_idempotency_uidx
    ON merchant_invitations (inviter_user_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';
CREATE INDEX merchant_invitations_email_status_idx
    ON merchant_invitations (email_normalized, status);
CREATE INDEX merchant_invitations_status_expires_idx
    ON merchant_invitations (status, expires_at);
CREATE INDEX merchant_invitations_merchant_id_idx
    ON merchant_invitations (merchant_id)
    WHERE merchant_id IS NOT NULL;

-- Optional invitation management permission (still covered by roles.assign / merchants.write).
INSERT INTO permissions (code, description, category) VALUES
    ('invitations.staff', 'Create/list/revoke staff invitations', 'rbac'),
    ('invitations.merchant', 'Create/list/revoke merchant invitations', 'merchants')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_code)
SELECT 'role_super_admin', code FROM permissions
WHERE code IN ('invitations.staff', 'invitations.merchant')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_code) VALUES
    ('role_admin_support', 'invitations.staff'),
    ('role_admin_support', 'invitations.merchant')
ON CONFLICT DO NOTHING;

INSERT INTO schema_meta (key, value, updated_at) VALUES
    ('roles_invites', 'BE-135', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
