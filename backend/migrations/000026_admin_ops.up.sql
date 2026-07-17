-- BE-510 Eight lightweight admin operations.
-- Merchant/API suspend independence, emergency switches, audit read metadata,
-- payment mismatch projection, reviews.moderate permission.

-- ---------------------------------------------------------------------------
-- audit_events: reasoned metadata for admin search (full JCS chain = BE-530)
-- ---------------------------------------------------------------------------
ALTER TABLE audit_events
    ADD COLUMN IF NOT EXISTS actor_user_id text,
    ADD COLUMN IF NOT EXISTS action text,
    ADD COLUMN IF NOT EXISTS resource_type text,
    ADD COLUMN IF NOT EXISTS resource_id text,
    ADD COLUMN IF NOT EXISTS reason text,
    ADD COLUMN IF NOT EXISTS request_id text,
    ADD COLUMN IF NOT EXISTS merchant_id text,
    ADD COLUMN IF NOT EXISTS metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS audit_events_created_idx
    ON audit_events (created_at DESC, sequence_no DESC);

CREATE INDEX IF NOT EXISTS audit_events_action_idx
    ON audit_events (action, created_at DESC)
    WHERE action IS NOT NULL;

CREATE INDEX IF NOT EXISTS audit_events_resource_idx
    ON audit_events (resource_type, resource_id, created_at DESC)
    WHERE resource_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS audit_events_actor_idx
    ON audit_events (actor_user_id, created_at DESC)
    WHERE actor_user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- platform_emergency_controls: exactly three runtime switches
-- ---------------------------------------------------------------------------
CREATE TABLE platform_emergency_controls (
    switch_name     text        PRIMARY KEY,
    enabled         boolean     NOT NULL DEFAULT true,
    version         bigint      NOT NULL DEFAULT 1,
    reason          text        NOT NULL DEFAULT '',
    incident_ticket text        NOT NULL DEFAULT '',
    updated_by      text,
    effective_at    timestamptz NOT NULL DEFAULT now(),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT platform_emergency_switch_check CHECK (
        switch_name IN ('SELLER_REGISTRATION', 'QRIS_CHECKOUT', 'WITHDRAWALS')
    ),
    CONSTRAINT platform_emergency_version_positive CHECK (version > 0)
);

INSERT INTO platform_emergency_controls (switch_name, enabled, version, reason, effective_at, created_at, updated_at)
VALUES
    ('SELLER_REGISTRATION', true, 1, 'launch default', now(), now(), now()),
    ('QRIS_CHECKOUT', true, 1, 'launch default', now(), now(), now()),
    ('WITHDRAWALS', true, 1, 'launch default', now(), now(), now())
ON CONFLICT (switch_name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- audit_exports: async export job metadata (download URL BE-530/R2)
-- ---------------------------------------------------------------------------
CREATE TABLE audit_exports (
    id              text        PRIMARY KEY,
    status          text        NOT NULL DEFAULT 'QUEUED',
    filter_json     jsonb       NOT NULL DEFAULT '{}'::jsonb,
    redaction_policy text       NOT NULL DEFAULT 'LAUNCH_AUDIT_REDACTION_V1',
    requester_id    text        NOT NULL,
    reason          text        NOT NULL DEFAULT '',
    row_count       bigint,
    error_message   text,
    expires_at      timestamptz,
    completed_at    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT audit_exports_status_check CHECK (
        status IN ('QUEUED', 'RUNNING', 'COMPLETE', 'FAILED', 'EXPIRED')
    ),
    CONSTRAINT audit_exports_reason_nonempty CHECK (reason <> '' OR status = 'QUEUED')
);

CREATE INDEX audit_exports_requester_idx ON audit_exports (requester_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- merchants: optional suspension reason (status already ACTIVE|SUSPENDED|CLOSED)
-- ---------------------------------------------------------------------------
ALTER TABLE merchants
    ADD COLUMN IF NOT EXISTS suspension_reason text,
    ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
    ADD COLUMN IF NOT EXISTS suspended_by text;

-- ---------------------------------------------------------------------------
-- Gateway capability upsert must preserve suspension_reason/suspended_by
-- (columns already exist on merchant_api_capabilities from BE-320)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- reviews.moderate permission
-- ---------------------------------------------------------------------------
INSERT INTO permissions (code, description, category) VALUES
    ('reviews.moderate', 'Moderate product reviews (admin)', 'reviews')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_code)
SELECT 'role_super_admin', p.code
FROM permissions p
WHERE NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = 'role_super_admin' AND rp.permission_code = p.code
);

INSERT INTO role_permissions (role_id, permission_code) VALUES
    ('role_admin_support', 'reviews.moderate'),
    ('role_admin_support', 'merchants.write'),
    ('role_admin_support', 'platform.emergency'),
    ('role_admin_support', 'audit.read'),
    ('role_admin_support', 'kyc.review'),
    ('role_admin_support', 'withdrawals.review'),
    ('role_admin_support', 'provider_callbacks.replay'),
    ('role_admin_support', 'fulfillment.force')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_code) VALUES
    ('role_admin_finance', 'audit.read'),
    ('role_admin_finance', 'withdrawals.review'),
    ('role_admin_finance', 'platform.fees.preview')
ON CONFLICT DO NOTHING;

INSERT INTO schema_meta (key, value, updated_at) VALUES
    ('admin_ops', 'BE-510', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
