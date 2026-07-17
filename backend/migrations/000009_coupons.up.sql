-- BE-215 Coupon policy, seller management, and checkout reservation.
-- Money: bigint whole IDR. Percent: integer bps (1..10000). Limits enforced with
-- row locks + reservation uniqueness, not Redis counters.

-- ---------------------------------------------------------------------------
-- coupons
-- ---------------------------------------------------------------------------
CREATE TABLE coupons (
    id                      text        PRIMARY KEY,
    store_id                text        NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
    merchant_id             text        NOT NULL REFERENCES merchants (id) ON DELETE CASCADE,
    code_display            text        NOT NULL,
    normalized_code         text        NOT NULL,
    code_hash               text        NOT NULL,
    discount_kind           text        NOT NULL,
    discount_value          bigint      NOT NULL,
    min_merchandise_idr     bigint      NOT NULL DEFAULT 0,
    max_total_uses          bigint,
    max_per_customer_uses   bigint,
    starts_at               timestamptz,
    ends_at                 timestamptz,
    state                   text        NOT NULL DEFAULT 'DRAFT',
    scope                   text        NOT NULL DEFAULT 'ALL_PRODUCTS',
    version                 integer     NOT NULL DEFAULT 1,
    policy_version          integer     NOT NULL DEFAULT 1,
    reserved_count          bigint      NOT NULL DEFAULT 0,
    redeemed_count          bigint      NOT NULL DEFAULT 0,
    created_by              text        REFERENCES users (id),
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT coupons_code_display_nonempty CHECK (code_display <> ''),
    CONSTRAINT coupons_normalized_code_nonempty CHECK (normalized_code <> ''),
    CONSTRAINT coupons_code_hash_nonempty CHECK (code_hash <> ''),
    CONSTRAINT coupons_discount_kind_check CHECK (discount_kind IN ('PERCENT', 'FIXED_IDR')),
    CONSTRAINT coupons_discount_value_pos CHECK (discount_value > 0),
    CONSTRAINT coupons_percent_bps_check CHECK (
        discount_kind <> 'PERCENT' OR (discount_value BETWEEN 1 AND 10000)
    ),
    CONSTRAINT coupons_min_merch_nonneg CHECK (min_merchandise_idr >= 0),
    CONSTRAINT coupons_max_total_pos CHECK (max_total_uses IS NULL OR max_total_uses > 0),
    CONSTRAINT coupons_max_per_customer_pos CHECK (max_per_customer_uses IS NULL OR max_per_customer_uses > 0),
    CONSTRAINT coupons_state_check CHECK (state IN ('DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED', 'ARCHIVED')),
    CONSTRAINT coupons_scope_check CHECK (scope IN ('ALL_PRODUCTS', 'SELECTED_PRODUCTS')),
    CONSTRAINT coupons_version_pos CHECK (version >= 1),
    CONSTRAINT coupons_policy_version_pos CHECK (policy_version >= 1),
    CONSTRAINT coupons_reserved_nonneg CHECK (reserved_count >= 0),
    CONSTRAINT coupons_redeemed_nonneg CHECK (redeemed_count >= 0),
    CONSTRAINT coupons_window_order CHECK (
        starts_at IS NULL OR ends_at IS NULL OR starts_at <= ends_at
    )
);

CREATE UNIQUE INDEX coupons_store_normalized_code_uidx
    ON coupons (store_id, normalized_code);
CREATE INDEX coupons_store_id_idx ON coupons (store_id);
CREATE INDEX coupons_merchant_id_idx ON coupons (merchant_id);
CREATE INDEX coupons_store_state_idx ON coupons (store_id, state);
CREATE INDEX coupons_code_hash_idx ON coupons (store_id, code_hash);

-- ---------------------------------------------------------------------------
-- coupon_product_scopes (SELECTED_PRODUCTS only)
-- ---------------------------------------------------------------------------
CREATE TABLE coupon_product_scopes (
    coupon_id   text NOT NULL REFERENCES coupons (id) ON DELETE CASCADE,
    product_id  text NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    store_id    text NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (coupon_id, product_id)
);

CREATE INDEX coupon_product_scopes_product_idx ON coupon_product_scopes (product_id);
CREATE INDEX coupon_product_scopes_store_idx ON coupon_product_scopes (store_id);

-- ---------------------------------------------------------------------------
-- coupon_reservations (checkout hold; convert to redemption on verified paid)
-- ---------------------------------------------------------------------------
CREATE TABLE coupon_reservations (
    id                      text        PRIMARY KEY,
    coupon_id               text        NOT NULL REFERENCES coupons (id),
    coupon_policy_version   integer     NOT NULL,
    store_id                text        NOT NULL REFERENCES stores (id),
    order_id                text        NOT NULL,
    idempotency_key         text        NOT NULL,
    buyer_identity_hash     text,
    product_id              text,
    discount_kind           text        NOT NULL,
    discount_value          bigint      NOT NULL,
    discount_idr            bigint      NOT NULL,
    eligible_subtotal_idr   bigint      NOT NULL,
    merchandise_idr         bigint      NOT NULL,
    tip_idr                 bigint      NOT NULL DEFAULT 0,
    upsell_idr              bigint      NOT NULL DEFAULT 0,
    gross_idr               bigint      NOT NULL,
    code_snapshot           text        NOT NULL,
    state                   text        NOT NULL DEFAULT 'RESERVED',
    expires_at              timestamptz NOT NULL,
    consumed_at             timestamptz,
    released_at             timestamptz,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT coupon_reservations_policy_version_pos CHECK (coupon_policy_version >= 1),
    CONSTRAINT coupon_reservations_order_nonempty CHECK (order_id <> ''),
    CONSTRAINT coupon_reservations_idem_nonempty CHECK (idempotency_key <> ''),
    CONSTRAINT coupon_reservations_discount_kind_check CHECK (discount_kind IN ('PERCENT', 'FIXED_IDR')),
    CONSTRAINT coupon_reservations_discount_value_pos CHECK (discount_value > 0),
    CONSTRAINT coupon_reservations_discount_nonneg CHECK (discount_idr >= 0),
    CONSTRAINT coupon_reservations_eligible_nonneg CHECK (eligible_subtotal_idr >= 0),
    CONSTRAINT coupon_reservations_merch_nonneg CHECK (merchandise_idr >= 0),
    CONSTRAINT coupon_reservations_tip_nonneg CHECK (tip_idr >= 0),
    CONSTRAINT coupon_reservations_upsell_nonneg CHECK (upsell_idr >= 0),
    CONSTRAINT coupon_reservations_gross_nonneg CHECK (gross_idr >= 0),
    CONSTRAINT coupon_reservations_state_check CHECK (
        state IN ('RESERVED', 'CONSUMED', 'RELEASED', 'HELD_UNKNOWN')
    )
);

CREATE UNIQUE INDEX coupon_reservations_coupon_order_uidx
    ON coupon_reservations (coupon_id, order_id);
CREATE UNIQUE INDEX coupon_reservations_coupon_idem_uidx
    ON coupon_reservations (coupon_id, idempotency_key);
CREATE INDEX coupon_reservations_state_expires_idx
    ON coupon_reservations (state, expires_at)
    WHERE state = 'RESERVED';
CREATE INDEX coupon_reservations_store_idx ON coupon_reservations (store_id);
CREATE INDEX coupon_reservations_buyer_idx
    ON coupon_reservations (coupon_id, buyer_identity_hash)
    WHERE buyer_identity_hash IS NOT NULL;

-- ---------------------------------------------------------------------------
-- coupon_redemptions (immutable paid snapshot)
-- ---------------------------------------------------------------------------
CREATE TABLE coupon_redemptions (
    id                      text        PRIMARY KEY,
    reservation_id          text        NOT NULL UNIQUE REFERENCES coupon_reservations (id),
    coupon_id               text        NOT NULL REFERENCES coupons (id),
    coupon_policy_version   integer     NOT NULL,
    store_id                text        NOT NULL REFERENCES stores (id),
    order_id                text        NOT NULL,
    code_snapshot           text        NOT NULL,
    discount_kind           text        NOT NULL,
    discount_value          bigint      NOT NULL,
    discount_idr            bigint      NOT NULL,
    eligible_subtotal_idr   bigint      NOT NULL,
    merchandise_idr         bigint      NOT NULL,
    tip_idr                 bigint      NOT NULL DEFAULT 0,
    upsell_idr              bigint      NOT NULL DEFAULT 0,
    gross_idr               bigint      NOT NULL,
    buyer_identity_hash     text,
    product_id              text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT coupon_redemptions_policy_version_pos CHECK (coupon_policy_version >= 1),
    CONSTRAINT coupon_redemptions_order_nonempty CHECK (order_id <> ''),
    CONSTRAINT coupon_redemptions_discount_kind_check CHECK (discount_kind IN ('PERCENT', 'FIXED_IDR')),
    CONSTRAINT coupon_redemptions_discount_value_pos CHECK (discount_value > 0),
    CONSTRAINT coupon_redemptions_discount_nonneg CHECK (discount_idr >= 0),
    CONSTRAINT coupon_redemptions_eligible_nonneg CHECK (eligible_subtotal_idr >= 0),
    CONSTRAINT coupon_redemptions_merch_nonneg CHECK (merchandise_idr >= 0),
    CONSTRAINT coupon_redemptions_tip_nonneg CHECK (tip_idr >= 0),
    CONSTRAINT coupon_redemptions_upsell_nonneg CHECK (upsell_idr >= 0),
    CONSTRAINT coupon_redemptions_gross_nonneg CHECK (gross_idr >= 0)
);

CREATE UNIQUE INDEX coupon_redemptions_order_uidx ON coupon_redemptions (order_id);
CREATE INDEX coupon_redemptions_coupon_idx ON coupon_redemptions (coupon_id);
CREATE INDEX coupon_redemptions_store_idx ON coupon_redemptions (store_id);

INSERT INTO schema_meta (key, value, updated_at) VALUES
    ('coupons', 'BE-215', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
