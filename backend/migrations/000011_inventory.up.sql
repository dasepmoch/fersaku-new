-- BE-230 Inventory / fulfillment foundation.
-- Versioned schemas, encrypted stock units, atomic reservation with row locks.
-- Full delivery grants/invoices are BE-235.

-- ---------------------------------------------------------------------------
-- inventory_schemas (immutable per product_id + version)
-- ---------------------------------------------------------------------------
CREATE TABLE inventory_schemas (
    id              text        PRIMARY KEY,
    product_id      text        NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    store_id        text        NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
    merchant_id     text        NOT NULL REFERENCES merchants (id) ON DELETE CASCADE,
    version         integer     NOT NULL,
    fields          jsonb       NOT NULL DEFAULT '[]'::jsonb,
    delimiter       text        NOT NULL DEFAULT ',',
    checksum        text        NOT NULL,
    created_by      text        REFERENCES users (id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT inventory_schemas_version_pos CHECK (version >= 1),
    CONSTRAINT inventory_schemas_checksum_nonempty CHECK (checksum <> ''),
    CONSTRAINT inventory_schemas_fields_array CHECK (jsonb_typeof(fields) = 'array')
);

CREATE UNIQUE INDEX inventory_schemas_product_version_uidx
    ON inventory_schemas (product_id, version);
CREATE INDEX inventory_schemas_store_idx ON inventory_schemas (store_id);
CREATE INDEX inventory_schemas_product_idx ON inventory_schemas (product_id);

-- Product pointer to active schema version (nullable until schema created).
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS active_schema_version integer;

ALTER TABLE products
    DROP CONSTRAINT IF EXISTS products_active_schema_version_pos;
ALTER TABLE products
    ADD CONSTRAINT products_active_schema_version_pos
        CHECK (active_schema_version IS NULL OR active_schema_version >= 1);

-- ---------------------------------------------------------------------------
-- stock_items
-- ---------------------------------------------------------------------------
CREATE TABLE stock_items (
    id                  text        PRIMARY KEY,
    product_id          text        NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    store_id            text        NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
    merchant_id         text        NOT NULL REFERENCES merchants (id) ON DELETE CASCADE,
    schema_version      integer     NOT NULL,
    status              text        NOT NULL DEFAULT 'AVAILABLE',
    encrypted_payload   bytea       NOT NULL,
    key_version         text        NOT NULL DEFAULT 'v1',
    masked_preview      jsonb       NOT NULL DEFAULT '{}'::jsonb,
    unique_key_hash     text,
    created_by          text        REFERENCES users (id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    reserved_at         timestamptz,
    delivered_at        timestamptz,
    revoked_at          timestamptz,
    CONSTRAINT stock_items_schema_version_pos CHECK (schema_version >= 1),
    CONSTRAINT stock_items_status_check CHECK (
        status IN ('AVAILABLE', 'RESERVED', 'DELIVERED', 'REVOKED')
    ),
    CONSTRAINT stock_items_payload_nonempty CHECK (octet_length(encrypted_payload) > 0)
);

CREATE INDEX stock_items_product_status_idx
    ON stock_items (product_id, status, created_at ASC, id ASC);
CREATE INDEX stock_items_store_idx ON stock_items (store_id);
CREATE INDEX stock_items_available_claim_idx
    ON stock_items (product_id, created_at ASC, id ASC)
    WHERE status = 'AVAILABLE';
CREATE UNIQUE INDEX stock_items_product_unique_key_uidx
    ON stock_items (product_id, unique_key_hash)
    WHERE unique_key_hash IS NOT NULL;

-- ---------------------------------------------------------------------------
-- stock_reservations
-- ---------------------------------------------------------------------------
CREATE TABLE stock_reservations (
    id              text        PRIMARY KEY,
    stock_item_id   text        NOT NULL REFERENCES stock_items (id),
    product_id      text        NOT NULL REFERENCES products (id),
    store_id        text        NOT NULL REFERENCES stores (id),
    merchant_id     text        NOT NULL REFERENCES merchants (id),
    order_id        text,
    checkout_id     text,
    idempotency_key text        NOT NULL,
    status          text        NOT NULL DEFAULT 'RESERVED',
    expires_at      timestamptz NOT NULL,
    released_at     timestamptz,
    delivered_at    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT stock_reservations_status_check CHECK (
        status IN ('RESERVED', 'RELEASED', 'DELIVERED', 'HELD_UNKNOWN')
    ),
    CONSTRAINT stock_reservations_idem_nonempty CHECK (idempotency_key <> ''),
    CONSTRAINT stock_reservations_ref_present CHECK (
        order_id IS NOT NULL OR checkout_id IS NOT NULL
    )
);

-- One active reservation per stock unit (prevents double claim).
CREATE UNIQUE INDEX stock_reservations_active_item_uidx
    ON stock_reservations (stock_item_id)
    WHERE status IN ('RESERVED', 'HELD_UNKNOWN', 'DELIVERED');

-- Idempotent reserve by product + key.
CREATE UNIQUE INDEX stock_reservations_product_idem_uidx
    ON stock_reservations (product_id, idempotency_key);

-- One delivered allocation per order+product (one-buyer stock policy).
CREATE UNIQUE INDEX stock_reservations_order_product_delivered_uidx
    ON stock_reservations (order_id, product_id)
    WHERE order_id IS NOT NULL AND status = 'DELIVERED';

CREATE INDEX stock_reservations_expires_idx
    ON stock_reservations (status, expires_at)
    WHERE status = 'RESERVED';
CREATE INDEX stock_reservations_store_idx ON stock_reservations (store_id);

-- ---------------------------------------------------------------------------
-- stock_reveal_audits (immutable; no plaintext secrets)
-- ---------------------------------------------------------------------------
CREATE TABLE stock_reveal_audits (
    id              text        PRIMARY KEY,
    stock_item_id   text        NOT NULL REFERENCES stock_items (id),
    store_id        text        NOT NULL REFERENCES stores (id),
    product_id      text        NOT NULL REFERENCES products (id),
    actor_user_id   text        NOT NULL REFERENCES users (id),
    reason          text        NOT NULL,
    mfa_verified    boolean     NOT NULL DEFAULT false,
    payload_hash    bytea       NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT stock_reveal_audits_reason_nonempty CHECK (reason <> ''),
    CONSTRAINT stock_reveal_audits_hash_len CHECK (octet_length(payload_hash) = 32)
);

CREATE INDEX stock_reveal_audits_item_idx ON stock_reveal_audits (stock_item_id, created_at DESC);
CREATE INDEX stock_reveal_audits_actor_idx ON stock_reveal_audits (actor_user_id, created_at DESC);

-- Seller owners may reveal their own store credentials (permissioned + audited).
INSERT INTO role_permissions (role_id, permission_code)
VALUES ('role_seller_owner', 'inventory.reveal')
ON CONFLICT DO NOTHING;

INSERT INTO schema_meta (key, value, updated_at) VALUES
    ('inventory', 'BE-230', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
