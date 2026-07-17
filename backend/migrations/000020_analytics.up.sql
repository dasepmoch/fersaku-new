-- BE-360 Storefront attribution and rebuildable aggregate analytics.
-- PostgreSQL is authority; Redis counters (if any) are non-authoritative accelerators only.
-- QRIS_API payments never invent storefront sessions or traffic dimensions.

-- ---------------------------------------------------------------------------
-- Versioned collection / consent / retention policy (immutable rows; activate by version)
-- ---------------------------------------------------------------------------
CREATE TABLE analytics_collection_policies (
    version_id                  text        PRIMARY KEY,
    consent_notice_version      text        NOT NULL,
    collection_version          text        NOT NULL,
    reporting_timezone          text        NOT NULL DEFAULT 'Asia/Jakarta',
    raw_retention_days          integer     NOT NULL DEFAULT 90,
    aggregate_retention_days    integer     NOT NULL DEFAULT 730,
    last_non_direct_window_days integer     NOT NULL DEFAULT 30,
    min_cohort_size             integer     NOT NULL DEFAULT 1,
    bot_filter_enabled          boolean     NOT NULL DEFAULT true,
    late_event_policy           text        NOT NULL DEFAULT 'CONVERT_ONCE_ON_PAID',
    anonymize_on_delete         boolean     NOT NULL DEFAULT true,
    checksum_sha256             text        NOT NULL,
    is_active                   boolean     NOT NULL DEFAULT false,
    effective_from              timestamptz NOT NULL DEFAULT now(),
    created_at                  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT analytics_policies_retention_pos CHECK (
        raw_retention_days > 0 AND aggregate_retention_days > 0
    ),
    CONSTRAINT analytics_policies_window_pos CHECK (last_non_direct_window_days > 0),
    CONSTRAINT analytics_policies_cohort_pos CHECK (min_cohort_size >= 1),
    CONSTRAINT analytics_policies_late_check CHECK (
        late_event_policy IN ('CONVERT_ONCE_ON_PAID', 'IGNORE_AFTER_EXPIRE')
    )
);

-- At most one active policy.
CREATE UNIQUE INDEX analytics_collection_policies_active_uidx
    ON analytics_collection_policies ((is_active))
    WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- storefront_sessions — bounded session rows (hashed visitor/session only)
-- ---------------------------------------------------------------------------
CREATE TABLE storefront_sessions (
    id                      text        PRIMARY KEY,
    store_id                text        NOT NULL REFERENCES stores (id),
    merchant_id             text        NOT NULL REFERENCES merchants (id),
    visitor_hash            text        NOT NULL,
    session_hash            text        NOT NULL,
    hash_key_version        text        NOT NULL DEFAULT 'v1',
    landing_path            text        NOT NULL DEFAULT '/',
    referrer_origin         text        NOT NULL DEFAULT '',
    utm_source              text        NOT NULL DEFAULT '',
    utm_medium              text        NOT NULL DEFAULT '',
    utm_campaign            text        NOT NULL DEFAULT '',
    utm_content             text        NOT NULL DEFAULT '',
    utm_term                text        NOT NULL DEFAULT '',
    channel                 text        NOT NULL DEFAULT 'direct',
    is_bot                  boolean     NOT NULL DEFAULT false,
    collection_version      text        NOT NULL,
    consent_notice_version  text        NOT NULL,
    policy_version_id       text        NOT NULL REFERENCES analytics_collection_policies (version_id),
    first_seen_at           timestamptz NOT NULL,
    last_seen_at            timestamptz NOT NULL,
    created_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT storefront_sessions_channel_check CHECK (
        channel IN ('direct', 'organic', 'referral', 'utm', 'social', 'email', 'paid', 'other')
    ),
    CONSTRAINT storefront_sessions_path_len CHECK (char_length(landing_path) <= 512),
    CONSTRAINT storefront_sessions_origin_len CHECK (char_length(referrer_origin) <= 255),
    CONSTRAINT storefront_sessions_utm_len CHECK (
        char_length(utm_source) <= 128
        AND char_length(utm_medium) <= 128
        AND char_length(utm_campaign) <= 128
        AND char_length(utm_content) <= 128
        AND char_length(utm_term) <= 128
    )
);

CREATE INDEX storefront_sessions_store_seen_idx
    ON storefront_sessions (store_id, last_seen_at DESC, id DESC);

CREATE INDEX storefront_sessions_store_day_idx
    ON storefront_sessions (store_id, (first_seen_at AT TIME ZONE 'UTC'));

CREATE INDEX storefront_sessions_visitor_idx
    ON storefront_sessions (store_id, visitor_hash, first_seen_at DESC);

CREATE UNIQUE INDEX storefront_sessions_store_session_uidx
    ON storefront_sessions (store_id, session_hash);

-- ---------------------------------------------------------------------------
-- attribution_events — raw click/page/session events (retention-managed)
-- ---------------------------------------------------------------------------
CREATE TABLE attribution_events (
    id                      text        PRIMARY KEY,
    store_id                text        NOT NULL REFERENCES stores (id),
    merchant_id             text        NOT NULL REFERENCES merchants (id),
    session_id              text        REFERENCES storefront_sessions (id),
    product_id              text,
    visitor_hash            text        NOT NULL,
    session_hash            text        NOT NULL,
    hash_key_version        text        NOT NULL DEFAULT 'v1',
    event_type              text        NOT NULL,
    landing_path            text        NOT NULL DEFAULT '/',
    referrer_origin         text        NOT NULL DEFAULT '',
    utm_source              text        NOT NULL DEFAULT '',
    utm_medium              text        NOT NULL DEFAULT '',
    utm_campaign            text        NOT NULL DEFAULT '',
    utm_content             text        NOT NULL DEFAULT '',
    utm_term                text        NOT NULL DEFAULT '',
    channel                 text        NOT NULL DEFAULT 'direct',
    is_bot                  boolean     NOT NULL DEFAULT false,
    is_direct               boolean     NOT NULL DEFAULT true,
    collection_version      text        NOT NULL,
    consent_notice_version  text        NOT NULL,
    policy_version_id       text        NOT NULL REFERENCES analytics_collection_policies (version_id),
    occurred_at             timestamptz NOT NULL,
    created_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT attribution_events_type_check CHECK (
        event_type IN ('PAGE_VIEW', 'SESSION_START', 'CHECKOUT_START', 'PRODUCT_VIEW')
    ),
    CONSTRAINT attribution_events_channel_check CHECK (
        channel IN ('direct', 'organic', 'referral', 'utm', 'social', 'email', 'paid', 'other')
    ),
    CONSTRAINT attribution_events_path_len CHECK (char_length(landing_path) <= 512),
    CONSTRAINT attribution_events_origin_len CHECK (char_length(referrer_origin) <= 255)
);

CREATE INDEX attribution_events_store_occurred_idx
    ON attribution_events (store_id, occurred_at DESC, id DESC);

CREATE INDEX attribution_events_visitor_window_idx
    ON attribution_events (store_id, visitor_hash, occurred_at DESC, id DESC)
    WHERE is_bot = false AND is_direct = false;

CREATE INDEX attribution_events_retention_idx
    ON attribution_events (occurred_at);

-- ---------------------------------------------------------------------------
-- order_attribution_snapshots — immutable bind to order; convert once on PAID
-- ---------------------------------------------------------------------------
CREATE TABLE order_attribution_snapshots (
    id                      text        PRIMARY KEY,
    order_id                text        NOT NULL REFERENCES orders (id),
    payment_intent_id       text        REFERENCES payment_intents (id),
    store_id                text        NOT NULL REFERENCES stores (id),
    merchant_id             text        NOT NULL REFERENCES merchants (id),
    product_id              text,
    source                  text        NOT NULL DEFAULT 'STOREFRONT',
    visitor_hash            text        NOT NULL DEFAULT '',
    session_hash            text        NOT NULL DEFAULT '',
    hash_key_version        text        NOT NULL DEFAULT 'v1',
    landing_path            text        NOT NULL DEFAULT '/',
    referrer_origin         text        NOT NULL DEFAULT '',
    utm_source              text        NOT NULL DEFAULT '',
    utm_medium              text        NOT NULL DEFAULT '',
    utm_campaign            text        NOT NULL DEFAULT '',
    utm_content             text        NOT NULL DEFAULT '',
    utm_term                text        NOT NULL DEFAULT '',
    channel                 text        NOT NULL DEFAULT 'direct',
    attribution_model       text        NOT NULL DEFAULT 'LAST_NON_DIRECT_30D',
    attributed_event_id     text        REFERENCES attribution_events (id),
    collection_version      text        NOT NULL,
    consent_notice_version  text        NOT NULL,
    policy_version_id       text        NOT NULL REFERENCES analytics_collection_policies (version_id),
    converted               boolean     NOT NULL DEFAULT false,
    converted_at            timestamptz,
    paid_late               boolean     NOT NULL DEFAULT false,
    gross_idr               bigint      NOT NULL DEFAULT 0,
    captured_at             timestamptz NOT NULL,
    created_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT order_attribution_source_check CHECK (source IN ('STOREFRONT', 'QRIS_API')),
    CONSTRAINT order_attribution_channel_check CHECK (
        channel IN ('direct', 'organic', 'referral', 'utm', 'social', 'email', 'paid', 'other')
    ),
    CONSTRAINT order_attribution_model_check CHECK (
        attribution_model IN ('LAST_NON_DIRECT_30D', 'DIRECT', 'NONE')
    ),
    CONSTRAINT order_attribution_gross_nonneg CHECK (gross_idr >= 0),
    -- QRIS_API snapshots never carry storefront traffic dimensions.
    CONSTRAINT order_attribution_qris_no_traffic CHECK (
        source <> 'QRIS_API'
        OR (
            visitor_hash = ''
            AND session_hash = ''
            AND landing_path = '/'
            AND referrer_origin = ''
            AND utm_source = ''
            AND utm_medium = ''
            AND utm_campaign = ''
            AND utm_content = ''
            AND utm_term = ''
            AND channel = 'direct'
            AND attribution_model = 'NONE'
            AND attributed_event_id IS NULL
        )
    )
);

CREATE UNIQUE INDEX order_attribution_snapshots_order_uidx
    ON order_attribution_snapshots (order_id);

CREATE UNIQUE INDEX order_attribution_snapshots_intent_uidx
    ON order_attribution_snapshots (payment_intent_id)
    WHERE payment_intent_id IS NOT NULL;

CREATE INDEX order_attribution_snapshots_store_converted_idx
    ON order_attribution_snapshots (store_id, converted, converted_at DESC)
    WHERE converted = true AND source = 'STOREFRONT';

-- ---------------------------------------------------------------------------
-- store_traffic_daily — rebuildable daily aggregates (authority projection)
-- ---------------------------------------------------------------------------
CREATE TABLE store_traffic_daily (
    id                  text        PRIMARY KEY,
    store_id            text        NOT NULL REFERENCES stores (id),
    merchant_id         text        NOT NULL REFERENCES merchants (id),
    day                 date        NOT NULL,
    timezone            text        NOT NULL DEFAULT 'Asia/Jakarta',
    channel             text        NOT NULL DEFAULT 'all',
    product_id          text        NOT NULL DEFAULT '',
    sessions            bigint      NOT NULL DEFAULT 0,
    page_views          bigint      NOT NULL DEFAULT 0,
    checkouts           bigint      NOT NULL DEFAULT 0,
    orders              bigint      NOT NULL DEFAULT 0,
    gross_idr           bigint      NOT NULL DEFAULT 0,
    policy_version_id   text        NOT NULL REFERENCES analytics_collection_policies (version_id),
    aggregation_version text        NOT NULL DEFAULT 'v1',
    rebuilt_at          timestamptz NOT NULL DEFAULT now(),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT store_traffic_daily_channel_check CHECK (
        channel IN ('all', 'direct', 'organic', 'referral', 'utm', 'social', 'email', 'paid', 'other')
    ),
    CONSTRAINT store_traffic_daily_nonneg CHECK (
        sessions >= 0 AND page_views >= 0 AND checkouts >= 0 AND orders >= 0 AND gross_idr >= 0
    )
);

CREATE UNIQUE INDEX store_traffic_daily_uidx
    ON store_traffic_daily (store_id, day, timezone, channel, product_id, aggregation_version);

CREATE INDEX store_traffic_daily_store_day_idx
    ON store_traffic_daily (store_id, day DESC);

-- ---------------------------------------------------------------------------
-- analytics_retention_runs — deletion/anonymization job evidence
-- ---------------------------------------------------------------------------
CREATE TABLE analytics_retention_runs (
    id                  text        PRIMARY KEY,
    policy_version_id   text        NOT NULL REFERENCES analytics_collection_policies (version_id),
    cutoff_at           timestamptz NOT NULL,
    events_deleted      bigint      NOT NULL DEFAULT 0,
    sessions_anonymized bigint      NOT NULL DEFAULT 0,
    status              text        NOT NULL DEFAULT 'COMPLETED',
    started_at          timestamptz NOT NULL,
    finished_at         timestamptz NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT analytics_retention_runs_status_check CHECK (
        status IN ('COMPLETED', 'FAILED', 'PARTIAL')
    )
);

-- ---------------------------------------------------------------------------
-- Seed LAUNCH_ANALYTICS_POLICY_V1
-- ---------------------------------------------------------------------------
INSERT INTO analytics_collection_policies (
    version_id, consent_notice_version, collection_version, reporting_timezone,
    raw_retention_days, aggregate_retention_days, last_non_direct_window_days,
    min_cohort_size, bot_filter_enabled, late_event_policy, anonymize_on_delete,
    checksum_sha256, is_active, effective_from, created_at
) VALUES (
    'LAUNCH_ANALYTICS_POLICY_V1',
    'CONSENT_NOTICE_V1',
    'COLLECTION_V1',
    'Asia/Jakarta',
    90,
    730,
    30,
    1,
    true,
    'CONVERT_ONCE_ON_PAID',
    true,
    'a3f1c8e2b9d04756e8a1c2d3f4b5a69708192a3b4c5d6e7f8091a2b3c4d5e6f7',
    true,
    now(),
    now()
);

INSERT INTO schema_meta (key, value, updated_at) VALUES
    ('analytics', '000020', now()),
    ('analytics_aggregation_version', 'v1', now()),
    ('analytics_hash_key_version', 'v1', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
