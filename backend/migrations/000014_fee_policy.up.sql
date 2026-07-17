-- BE-300 Fee policy / value objects (ADR-0003).
-- LAUNCH_FEE_POLICY_V1 is checksum-verified and immutable via app/admin API.
-- Application roles must not UPDATE/DELETE fee_policies rows; only migrate role seeds.
-- Future policy versions require approved product ADR + new migration seed + effective time.

CREATE TABLE fee_policies (
    version_id                 text        PRIMARY KEY,
    scope                      text        NOT NULL DEFAULT 'GLOBAL',
    transaction_percent_bps    bigint      NOT NULL,
    transaction_fixed_idr      bigint      NOT NULL,
    withdrawal_percent_bps     bigint      NOT NULL,
    minimum_withdrawal_idr     bigint      NOT NULL,
    minimum_payment_idr        bigint      NOT NULL,
    maximum_payment_idr        bigint      NOT NULL,
    checksum                   text        NOT NULL,
    source_adr                 text        NOT NULL DEFAULT '',
    release_reason             text        NOT NULL DEFAULT '',
    immutable                  boolean     NOT NULL DEFAULT true,
    effective_from             timestamptz NOT NULL,
    effective_to               timestamptz,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT fee_policies_scope_check CHECK (scope = 'GLOBAL'),
    CONSTRAINT fee_policies_tx_bps_nonneg CHECK (transaction_percent_bps >= 0),
    CONSTRAINT fee_policies_tx_fixed_nonneg CHECK (transaction_fixed_idr >= 0),
    CONSTRAINT fee_policies_wd_bps_nonneg CHECK (withdrawal_percent_bps >= 0),
    CONSTRAINT fee_policies_min_wd_pos CHECK (minimum_withdrawal_idr > 0),
    CONSTRAINT fee_policies_min_pay_pos CHECK (minimum_payment_idr > 0),
    CONSTRAINT fee_policies_max_pay_pos CHECK (maximum_payment_idr > 0),
    CONSTRAINT fee_policies_pay_bounds CHECK (maximum_payment_idr >= minimum_payment_idr),
    CONSTRAINT fee_policies_checksum_nonempty CHECK (checksum <> ''),
    CONSTRAINT fee_policies_effective_order CHECK (
        effective_to IS NULL OR effective_to > effective_from
    )
);

-- At most one open-ended (active) GLOBAL policy interval; no overlapping open rows.
CREATE UNIQUE INDEX fee_policies_one_open_global_uidx
    ON fee_policies (scope)
    WHERE effective_to IS NULL AND scope = 'GLOBAL';

CREATE INDEX fee_policies_effective_from_idx
    ON fee_policies (effective_from DESC);

-- Creation-time immutable fee snapshots for payments/withdrawals (used by BE-310+).
CREATE TABLE fee_snapshots (
    id                       text        PRIMARY KEY,
    policy_version_id        text        NOT NULL REFERENCES fee_policies (version_id),
    scope                    text        NOT NULL DEFAULT 'GLOBAL',
    kind                     text        NOT NULL,
    payment_source           text,
    gross_or_amount_idr      bigint      NOT NULL,
    percent_bps              bigint      NOT NULL,
    percent_component_idr    bigint      NOT NULL,
    fixed_component_idr      bigint      NOT NULL DEFAULT 0,
    provider_fee_idr         bigint      NOT NULL DEFAULT 0,
    total_fee_idr            bigint      NOT NULL,
    net_idr                  bigint      NOT NULL,
    currency                 text        NOT NULL DEFAULT 'IDR',
    checksum                 text        NOT NULL,
    created_at               timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT fee_snapshots_kind_check CHECK (kind IN ('TRANSACTION', 'WITHDRAWAL')),
    CONSTRAINT fee_snapshots_source_check CHECK (
        payment_source IS NULL OR payment_source IN ('STOREFRONT', 'QRIS_API')
    ),
    CONSTRAINT fee_snapshots_currency_check CHECK (currency = 'IDR'),
    CONSTRAINT fee_snapshots_amounts_nonneg CHECK (
        gross_or_amount_idr > 0
        AND percent_bps >= 0
        AND percent_component_idr >= 0
        AND fixed_component_idr >= 0
        AND provider_fee_idr >= 0
        AND total_fee_idr >= 0
        AND net_idr > 0
    )
);

CREATE INDEX fee_snapshots_policy_created_idx
    ON fee_snapshots (policy_version_id, created_at DESC, id DESC);

-- Checksum payload (must match domain platform.LaunchPolicyChecksum):
-- LAUNCH_FEE_POLICY_V1|GLOBAL|300|700|300|50000|1000|100000000
-- sha256 = 74db3dc26f74c349ef49b7928e3b8151ed9d6e8555564bd01c46e8baba42eeeb
INSERT INTO fee_policies (
    version_id,
    scope,
    transaction_percent_bps,
    transaction_fixed_idr,
    withdrawal_percent_bps,
    minimum_withdrawal_idr,
    minimum_payment_idr,
    maximum_payment_idr,
    checksum,
    source_adr,
    release_reason,
    immutable,
    effective_from,
    effective_to,
    created_at
) VALUES (
    'LAUNCH_FEE_POLICY_V1',
    'GLOBAL',
    300,
    700,
    300,
    50000,
    1000,
    100000000,
    '74db3dc26f74c349ef49b7928e3b8151ed9d6e8555564bd01c46e8baba42eeeb',
    'ADR-0003',
    'launch immutable fee policy; admin cannot mutate via API',
    true,
    TIMESTAMPTZ '2026-07-16 00:00:00+00',
    NULL,
    now()
);

-- Documentation: revoke DML on fee_policies for non-migrate roles in staging/production.
-- Local compose uses a single superuser; production must GRANT SELECT only to app role:
--   REVOKE INSERT, UPDATE, DELETE ON fee_policies FROM fersaku_app;
--   GRANT SELECT ON fee_policies TO fersaku_app;
--   GRANT SELECT, INSERT ON fee_snapshots TO fersaku_app;  -- snapshots written at payment create
-- fee_snapshots rows are append-only; never UPDATE after insert.
COMMENT ON TABLE fee_policies IS
    'Immutable versioned fee schedules. LAUNCH_FEE_POLICY_V1 seeded by migration only. No admin publish endpoint. Future change: ADR + new version + migration.';
COMMENT ON TABLE fee_snapshots IS
    'Creation-time fee snapshots for payments/withdrawals. Append-only; selected at intent creation (BE-310+).';
