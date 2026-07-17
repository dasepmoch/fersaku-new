-- BE-235 Delivery grants, attempts, and immutable invoices.
-- Minimal paid order stubs for commerce (full checkout = BE-310/330).
-- One delivery grant per paid order item; retries reuse allocation.

-- ---------------------------------------------------------------------------
-- orders (minimal paid stub)
-- ---------------------------------------------------------------------------
CREATE TABLE orders (
    id                  text        PRIMARY KEY,
    order_number        text        NOT NULL,
    store_id            text        NOT NULL REFERENCES stores (id),
    merchant_id         text        NOT NULL REFERENCES merchants (id),
    buyer_user_id       text        REFERENCES users (id),
    buyer_email         text        NOT NULL DEFAULT '',
    buyer_name          text        NOT NULL DEFAULT '',
    payment_status      text        NOT NULL DEFAULT 'UNPAID',
    source              text        NOT NULL DEFAULT 'STOREFRONT',
    currency            text        NOT NULL DEFAULT 'IDR',
    subtotal_idr        bigint      NOT NULL DEFAULT 0,
    discount_idr        bigint      NOT NULL DEFAULT 0,
    tip_idr             bigint      NOT NULL DEFAULT 0,
    fee_idr             bigint      NOT NULL DEFAULT 0,
    gross_idr           bigint      NOT NULL DEFAULT 0,
    merchant_net_idr    bigint      NOT NULL DEFAULT 0,
    coupon_code         text,
    coupon_version      integer,
    paid_at             timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT orders_order_number_nonempty CHECK (order_number <> ''),
    CONSTRAINT orders_payment_status_check CHECK (payment_status IN (
        'UNPAID', 'PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED'
    )),
    CONSTRAINT orders_source_check CHECK (source IN ('STOREFRONT', 'QRIS_API')),
    CONSTRAINT orders_currency_check CHECK (currency = 'IDR'),
    CONSTRAINT orders_money_nonneg CHECK (
        subtotal_idr >= 0 AND discount_idr >= 0 AND tip_idr >= 0
        AND fee_idr >= 0 AND gross_idr >= 0 AND merchant_net_idr >= 0
    )
);

CREATE UNIQUE INDEX orders_order_number_uidx ON orders (order_number);
CREATE INDEX orders_store_created_idx ON orders (store_id, created_at DESC, id DESC);
CREATE INDEX orders_buyer_created_idx ON orders (buyer_user_id, created_at DESC, id DESC)
    WHERE buyer_user_id IS NOT NULL;
CREATE INDEX orders_merchant_paid_idx ON orders (merchant_id, payment_status, paid_at DESC)
    WHERE payment_status = 'PAID';

-- ---------------------------------------------------------------------------
-- order_items (immutable line snapshots)
-- ---------------------------------------------------------------------------
CREATE TABLE order_items (
    id                      text        PRIMARY KEY,
    order_id                text        NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    store_id                text        NOT NULL REFERENCES stores (id),
    merchant_id             text        NOT NULL REFERENCES merchants (id),
    product_id              text        NOT NULL REFERENCES products (id),
    product_version         text        NOT NULL DEFAULT '1.0.0',
    product_title           text        NOT NULL,
    product_type            text        NOT NULL,
    unit_price_idr          bigint      NOT NULL,
    quantity                integer     NOT NULL DEFAULT 1,
    line_subtotal_idr       bigint      NOT NULL,
    discount_allocation_idr bigint      NOT NULL DEFAULT 0,
    line_total_idr          bigint      NOT NULL,
    delivery_kind           text        NOT NULL,
    stock_reservation_id    text,
    stock_item_id           text,
    object_id               text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT order_items_title_nonempty CHECK (product_title <> ''),
    CONSTRAINT order_items_type_check CHECK (product_type IN ('download', 'link', 'code')),
    CONSTRAINT order_items_qty_pos CHECK (quantity > 0),
    CONSTRAINT order_items_money_nonneg CHECK (
        unit_price_idr >= 0 AND line_subtotal_idr >= 0
        AND discount_allocation_idr >= 0 AND line_total_idr >= 0
    ),
    CONSTRAINT order_items_delivery_kind_check CHECK (delivery_kind IN (
        'DOWNLOAD', 'PROTECTED_LINK', 'CREDENTIAL', 'CODE'
    ))
);

CREATE INDEX order_items_order_idx ON order_items (order_id);
CREATE INDEX order_items_product_idx ON order_items (product_id);
CREATE INDEX order_items_store_idx ON order_items (store_id);

-- ---------------------------------------------------------------------------
-- delivery_grants (one per paid order item)
-- ---------------------------------------------------------------------------
CREATE TABLE delivery_grants (
    id                      text        PRIMARY KEY,
    order_id                text        NOT NULL REFERENCES orders (id),
    order_item_id           text        NOT NULL REFERENCES order_items (id),
    store_id                text        NOT NULL REFERENCES stores (id),
    merchant_id             text        NOT NULL REFERENCES merchants (id),
    product_id              text        NOT NULL REFERENCES products (id),
    buyer_user_id           text        REFERENCES users (id),
    buyer_email             text        NOT NULL DEFAULT '',
    delivery_kind           text        NOT NULL,
    status                  text        NOT NULL DEFAULT 'PENDING_FULFILLMENT',
    stock_item_id           text        REFERENCES stock_items (id),
    stock_reservation_id    text        REFERENCES stock_reservations (id),
    object_id               text        REFERENCES object_refs (id),
    fulfillment_effect_key  text        NOT NULL,
    access_token_hash       text,
    access_token_expires_at timestamptz,
    max_accesses            integer     NOT NULL DEFAULT 20,
    access_count            integer     NOT NULL DEFAULT 0,
    recipient_snapshot      jsonb       NOT NULL DEFAULT '{}'::jsonb,
    product_snapshot        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    revoked_at              timestamptz,
    revoke_reason           text,
    expires_at              timestamptz,
    last_accessed_at        timestamptz,
    activated_at            timestamptz,
    failed_at               timestamptz,
    fail_reason             text,
    version                 integer     NOT NULL DEFAULT 1,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT delivery_grants_kind_check CHECK (delivery_kind IN (
        'DOWNLOAD', 'PROTECTED_LINK', 'CREDENTIAL', 'CODE'
    )),
    CONSTRAINT delivery_grants_status_check CHECK (status IN (
        'PENDING_FULFILLMENT', 'ACTIVE', 'DELIVERY_FAILED', 'EXPIRED', 'REVOKED'
    )),
    CONSTRAINT delivery_grants_effect_nonempty CHECK (fulfillment_effect_key <> ''),
    CONSTRAINT delivery_grants_access_nonneg CHECK (access_count >= 0 AND max_accesses > 0),
    CONSTRAINT delivery_grants_version_pos CHECK (version >= 1)
);

-- One grant per paid order item (retries reuse same row).
CREATE UNIQUE INDEX delivery_grants_order_item_uidx ON delivery_grants (order_item_id);
CREATE UNIQUE INDEX delivery_grants_effect_key_uidx ON delivery_grants (fulfillment_effect_key);
CREATE UNIQUE INDEX delivery_grants_access_token_hash_uidx
    ON delivery_grants (access_token_hash)
    WHERE access_token_hash IS NOT NULL;
CREATE INDEX delivery_grants_order_idx ON delivery_grants (order_id);
CREATE INDEX delivery_grants_store_idx ON delivery_grants (store_id, status);
CREATE INDEX delivery_grants_buyer_idx ON delivery_grants (buyer_user_id, created_at DESC)
    WHERE buyer_user_id IS NOT NULL;
CREATE INDEX delivery_grants_stock_item_idx ON delivery_grants (stock_item_id)
    WHERE stock_item_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- delivery_attempts (channel results; never store secrets)
-- ---------------------------------------------------------------------------
CREATE TABLE delivery_attempts (
    id              text        PRIMARY KEY,
    grant_id        text        NOT NULL REFERENCES delivery_grants (id) ON DELETE CASCADE,
    order_id        text        NOT NULL REFERENCES orders (id),
    store_id        text        NOT NULL REFERENCES stores (id),
    channel         text        NOT NULL,
    result          text        NOT NULL,
    safe_error_code text,
    retry_count     integer     NOT NULL DEFAULT 0,
    actor_user_id   text        REFERENCES users (id),
    actor_kind      text        NOT NULL DEFAULT 'SYSTEM',
    reason          text        NOT NULL DEFAULT '',
    idempotency_key text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT delivery_attempts_channel_check CHECK (channel IN (
        'PORTAL', 'EMAIL', 'RESEND', 'RETRY', 'FORCE_FULFILL', 'REVOKE', 'ACCESS'
    )),
    CONSTRAINT delivery_attempts_result_check CHECK (result IN (
        'QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED', 'REVOKED'
    )),
    CONSTRAINT delivery_attempts_actor_kind_check CHECK (actor_kind IN (
        'SYSTEM', 'BUYER', 'SELLER', 'ADMIN'
    )),
    CONSTRAINT delivery_attempts_retry_nonneg CHECK (retry_count >= 0)
);

CREATE UNIQUE INDEX delivery_attempts_idem_uidx
    ON delivery_attempts (grant_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX delivery_attempts_grant_idx ON delivery_attempts (grant_id, created_at DESC);
CREATE INDEX delivery_attempts_order_idx ON delivery_attempts (order_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- invoices + invoice_versions (immutable snapshots)
-- ---------------------------------------------------------------------------
CREATE TABLE invoices (
    id                  text        PRIMARY KEY,
    order_id            text        NOT NULL REFERENCES orders (id),
    store_id            text        NOT NULL REFERENCES stores (id),
    merchant_id         text        NOT NULL REFERENCES merchants (id),
    invoice_number      text        NOT NULL,
    public_code_hash    text        NOT NULL,
    public_code_hint    text        NOT NULL DEFAULT '',
    status              text        NOT NULL DEFAULT 'ISSUED',
    currency            text        NOT NULL DEFAULT 'IDR',
    gross_idr           bigint      NOT NULL,
    paid_at             timestamptz,
    current_version     integer     NOT NULL DEFAULT 1,
    buyer_user_id       text        REFERENCES users (id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT invoices_number_nonempty CHECK (invoice_number <> ''),
    CONSTRAINT invoices_public_hash_nonempty CHECK (public_code_hash <> ''),
    CONSTRAINT invoices_status_check CHECK (status IN ('ISSUED', 'RENDERING', 'READY', 'FAILED')),
    CONSTRAINT invoices_currency_check CHECK (currency = 'IDR'),
    CONSTRAINT invoices_gross_nonneg CHECK (gross_idr >= 0),
    CONSTRAINT invoices_version_pos CHECK (current_version >= 1)
);

CREATE UNIQUE INDEX invoices_order_uidx ON invoices (order_id);
CREATE UNIQUE INDEX invoices_number_uidx ON invoices (invoice_number);
CREATE UNIQUE INDEX invoices_public_code_hash_uidx ON invoices (public_code_hash);
CREATE INDEX invoices_store_idx ON invoices (store_id, created_at DESC);

CREATE TABLE invoice_versions (
    id                  text        PRIMARY KEY,
    invoice_id          text        NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
    version             integer     NOT NULL,
    renderer_version    text        NOT NULL DEFAULT 'v1',
    snapshot            jsonb       NOT NULL,
    payload_hash        text        NOT NULL,
    render_status       text        NOT NULL DEFAULT 'PENDING',
    render_object_id    text        REFERENCES object_refs (id),
    render_error_code   text,
    rendered_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT invoice_versions_version_pos CHECK (version >= 1),
    CONSTRAINT invoice_versions_hash_nonempty CHECK (payload_hash <> ''),
    CONSTRAINT invoice_versions_snapshot_object CHECK (jsonb_typeof(snapshot) = 'object'),
    CONSTRAINT invoice_versions_render_status_check CHECK (render_status IN (
        'PENDING', 'READY', 'FAILED', 'SKIPPED'
    ))
);

CREATE UNIQUE INDEX invoice_versions_invoice_version_uidx
    ON invoice_versions (invoice_id, version);
CREATE INDEX invoice_versions_invoice_idx ON invoice_versions (invoice_id);

-- Expand object_refs purpose for private invoice PDF render objects (create-only).
ALTER TABLE object_refs DROP CONSTRAINT IF EXISTS object_refs_purpose_check;
ALTER TABLE object_refs ADD CONSTRAINT object_refs_purpose_check CHECK (purpose IN (
    'PRODUCT_FILE',
    'PUBLIC_ASSET',
    'PROFILE_ASSET',
    'INVOICE_INPUT',
    'INVOICE_RENDER'
));

INSERT INTO schema_meta (key, value, updated_at) VALUES
    ('delivery_invoices', 'BE-235', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
