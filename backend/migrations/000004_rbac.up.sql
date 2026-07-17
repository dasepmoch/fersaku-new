-- BE-130 RBAC and tenant authorization foundation.
-- System roles/permissions are seeded here (immutable). Custom roles CRUD = BE-135.
-- Cross-tenant policy: prefer RESOURCE_NOT_FOUND over existence leak for foreign IDs;
-- use FORBIDDEN when the principal is authenticated but lacks a known permission/action.

CREATE TABLE permissions (
    code        text        PRIMARY KEY,
    description text        NOT NULL DEFAULT '',
    category    text        NOT NULL DEFAULT 'general',
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT permissions_code_nonempty CHECK (code <> ''),
    CONSTRAINT permissions_category_nonempty CHECK (category <> '')
);

CREATE TABLE roles (
    id          text        PRIMARY KEY,
    code        text        NOT NULL,
    name        text        NOT NULL,
    description text        NOT NULL DEFAULT '',
    is_system   boolean     NOT NULL DEFAULT false,
    version     bigint      NOT NULL DEFAULT 1,
    archived_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT roles_code_nonempty CHECK (code <> ''),
    CONSTRAINT roles_name_nonempty CHECK (name <> ''),
    CONSTRAINT roles_version_check CHECK (version >= 1)
);

CREATE UNIQUE INDEX roles_code_uidx ON roles (code);

CREATE TABLE role_permissions (
    role_id          text NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    permission_code  text NOT NULL REFERENCES permissions (code) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_code)
);

CREATE INDEX role_permissions_permission_idx ON role_permissions (permission_code);

CREATE TABLE user_roles (
    user_id     text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role_id     text        NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    assigned_at timestamptz NOT NULL DEFAULT now(),
    assigned_by text        REFERENCES users (id),
    PRIMARY KEY (user_id, role_id)
);

CREATE INDEX user_roles_role_id_idx ON user_roles (role_id);

-- Minimal merchant tenant (full onboarding in BE-200).
CREATE TABLE merchants (
    id            text        PRIMARY KEY,
    owner_user_id text        NOT NULL REFERENCES users (id),
    display_name  text        NOT NULL DEFAULT '',
    status        text        NOT NULL DEFAULT 'ACTIVE',
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT merchants_status_check
        CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED'))
);

CREATE INDEX merchants_owner_user_id_idx ON merchants (owner_user_id);

CREATE TABLE merchant_members (
    merchant_id      text        NOT NULL REFERENCES merchants (id) ON DELETE CASCADE,
    user_id          text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role_in_merchant text        NOT NULL,
    status           text        NOT NULL DEFAULT 'ACTIVE',
    created_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (merchant_id, user_id),
    CONSTRAINT merchant_members_role_check
        CHECK (role_in_merchant IN ('OWNER', 'STAFF')),
    CONSTRAINT merchant_members_status_check
        CHECK (status IN ('ACTIVE', 'INVITED', 'SUSPENDED', 'REMOVED'))
);

CREATE INDEX merchant_members_user_id_idx ON merchant_members (user_id);

-- Minimal store (onboarding later fills bio/revisions; tests may insert).
CREATE TABLE stores (
    id           text        PRIMARY KEY,
    merchant_id  text        NOT NULL REFERENCES merchants (id) ON DELETE CASCADE,
    slug         text        NOT NULL,
    name         text        NOT NULL DEFAULT '',
    status       text        NOT NULL DEFAULT 'ACTIVE',
    is_canonical boolean     NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT stores_slug_nonempty CHECK (slug <> ''),
    CONSTRAINT stores_status_check
        CHECK (status IN ('ACTIVE', 'SUSPENDED', 'ARCHIVED'))
);

CREATE UNIQUE INDEX stores_slug_uidx ON stores (slug);
CREATE INDEX stores_merchant_id_idx ON stores (merchant_id);
CREATE UNIQUE INDEX stores_one_canonical_per_merchant_uidx
    ON stores (merchant_id)
    WHERE is_canonical = true;

-- ---------------------------------------------------------------------------
-- Permission registry (stable codes; BE-135 role builder uses the same set)
-- ---------------------------------------------------------------------------
INSERT INTO permissions (code, description, category) VALUES
    ('admin.ping', 'Admin health/authz probe', 'admin'),
    ('merchants.read', 'List/read merchants (admin)', 'merchants'),
    ('merchants.write', 'Mutate merchant status (admin)', 'merchants'),
    ('kyc.review', 'Review KYC cases', 'kyc'),
    ('withdrawals.review', 'Review withdrawals', 'withdrawals'),
    ('impersonation.start', 'Start support impersonation', 'impersonation'),
    ('impersonation.support_write', 'Impersonation SUPPORT_WRITE scope', 'impersonation'),
    ('provider_callbacks.replay', 'Replay inbound provider callbacks', 'provider'),
    ('seller_webhook_deliveries.retry', 'Retry outbound seller webhook deliveries', 'webhooks'),
    ('roles.read', 'Read roles and permissions registry', 'rbac'),
    ('roles.write', 'Create/update custom roles (BE-135)', 'rbac'),
    ('roles.assign', 'Assign roles to users (BE-135)', 'rbac'),
    ('fulfillment.force', 'Force fulfillment retry (admin)', 'fulfillment'),
    ('inventory.reveal', 'Reveal secret inventory item', 'inventory'),
    ('campaigns.publish', 'Publish admin campaigns', 'campaigns'),
    ('platform.emergency', 'Toggle emergency platform switches', 'platform'),
    ('platform.fees.preview', 'Preview fee calculator', 'platform'),
    ('audit.read', 'Read audit events', 'audit'),
    ('seller.store.read', 'Read own merchant/store as seller', 'seller'),
    ('seller.store.write', 'Mutate own store as seller', 'seller'),
    ('buyer.purchases.read', 'Read own purchases as buyer', 'buyer');

-- ---------------------------------------------------------------------------
-- System roles (immutable; is_system=true — BE-135 must not mutate)
-- ---------------------------------------------------------------------------
INSERT INTO roles (id, code, name, description, is_system, version) VALUES
    ('role_super_admin', 'SUPER_ADMIN', 'Super Admin', 'Full platform administration', true, 1),
    ('role_admin_support', 'ADMIN_SUPPORT', 'Admin Support', 'Support ops: merchants, KYC, impersonation read/start', true, 1),
    ('role_admin_finance', 'ADMIN_FINANCE', 'Admin Finance', 'Finance ops: withdrawals, fees preview', true, 1),
    ('role_seller_owner', 'SELLER_OWNER', 'Seller Owner', 'Merchant owner surface permissions', true, 1),
    ('role_buyer', 'BUYER', 'Buyer', 'Buyer surface permissions', true, 1);

-- SUPER_ADMIN: all permissions
INSERT INTO role_permissions (role_id, permission_code)
SELECT 'role_super_admin', code FROM permissions;

-- ADMIN_SUPPORT
INSERT INTO role_permissions (role_id, permission_code) VALUES
    ('role_admin_support', 'admin.ping'),
    ('role_admin_support', 'merchants.read'),
    ('role_admin_support', 'kyc.review'),
    ('role_admin_support', 'impersonation.start'),
    ('role_admin_support', 'provider_callbacks.replay'),
    ('role_admin_support', 'seller_webhook_deliveries.retry'),
    ('role_admin_support', 'roles.read'),
    ('role_admin_support', 'fulfillment.force'),
    ('role_admin_support', 'audit.read');

-- ADMIN_FINANCE
INSERT INTO role_permissions (role_id, permission_code) VALUES
    ('role_admin_finance', 'admin.ping'),
    ('role_admin_finance', 'merchants.read'),
    ('role_admin_finance', 'withdrawals.review'),
    ('role_admin_finance', 'platform.fees.preview'),
    ('role_admin_finance', 'audit.read');

-- SELLER_OWNER
INSERT INTO role_permissions (role_id, permission_code) VALUES
    ('role_seller_owner', 'seller.store.read'),
    ('role_seller_owner', 'seller.store.write');

-- BUYER
INSERT INTO role_permissions (role_id, permission_code) VALUES
    ('role_buyer', 'buyer.purchases.read');

INSERT INTO schema_meta (key, value, updated_at) VALUES
    ('rbac', 'BE-130', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
