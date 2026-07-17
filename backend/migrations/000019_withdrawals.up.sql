-- BE-350 Bank accounts, withdrawal quotes, withdrawals, disbursement refs.
-- Reserve/complete journals use post_ledger_transaction (BE-340). Money: bigint whole IDR.

-- ---------------------------------------------------------------------------
-- bank_accounts (encrypted number; versioned; primary; change lock)
-- ---------------------------------------------------------------------------
CREATE TABLE bank_accounts (
    id                      text        PRIMARY KEY,
    merchant_id             text        NOT NULL REFERENCES merchants (id),
    bank_code               text        NOT NULL,
    bank_name               text        NOT NULL DEFAULT '',
    account_holder_name     text        NOT NULL,
    -- AES-GCM ciphertext of full account number (never log/return plaintext).
    account_number_ciphertext bytea     NOT NULL,
    encryption_key_version  text        NOT NULL DEFAULT 'v1',
    account_number_masked   text        NOT NULL,
    account_number_last4    text        NOT NULL,
    status                  text        NOT NULL DEFAULT 'PENDING_VERIFICATION',
    is_primary              boolean     NOT NULL DEFAULT false,
    version                 bigint      NOT NULL DEFAULT 1,
    verified_at             timestamptz,
    archived_at             timestamptz,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT bank_accounts_status_check CHECK (
        status IN ('PENDING_VERIFICATION', 'VERIFIED', 'ARCHIVED')
    ),
    CONSTRAINT bank_accounts_bank_code_nonempty CHECK (bank_code <> ''),
    CONSTRAINT bank_accounts_holder_nonempty CHECK (account_holder_name <> ''),
    CONSTRAINT bank_accounts_masked_nonempty CHECK (account_number_masked <> ''),
    CONSTRAINT bank_accounts_last4_check CHECK (account_number_last4 ~ '^[0-9]{4}$'),
    CONSTRAINT bank_accounts_version_pos CHECK (version > 0)
);

CREATE INDEX bank_accounts_merchant_idx
    ON bank_accounts (merchant_id, status, created_at DESC);

-- At most one primary verified account per merchant.
CREATE UNIQUE INDEX bank_accounts_primary_uidx
    ON bank_accounts (merchant_id)
    WHERE is_primary = true AND status = 'VERIFIED';

-- ---------------------------------------------------------------------------
-- merchant_withdrawal_locks (security lock after bank change)
-- ---------------------------------------------------------------------------
CREATE TABLE merchant_withdrawal_locks (
    merchant_id             text        PRIMARY KEY REFERENCES merchants (id),
    locked_until            timestamptz NOT NULL,
    reason                  text        NOT NULL DEFAULT 'BANK_CHANGE',
    bank_account_id         text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- withdrawal_quotes (idempotent POST; TTL; locked merchant charge)
-- ---------------------------------------------------------------------------
CREATE TABLE withdrawal_quotes (
    id                          text        PRIMARY KEY,
    merchant_id                 text        NOT NULL REFERENCES merchants (id),
    store_id                    text,
    payment_mode                text        NOT NULL DEFAULT 'LIVE',
    amount_idr                  bigint      NOT NULL,
    platform_fee_idr            bigint      NOT NULL,
    provider_fee_idr            bigint      NOT NULL,
    total_fee_idr               bigint      NOT NULL,
    net_disbursement_idr        bigint      NOT NULL,
    currency                    text        NOT NULL DEFAULT 'IDR',
    policy_version_id           text        NOT NULL,
    fee_snapshot_id             text,
    bank_account_id             text        NOT NULL REFERENCES bank_accounts (id),
    bank_account_version        bigint      NOT NULL,
    bank_code                   text        NOT NULL,
    bank_name                   text        NOT NULL DEFAULT '',
    account_holder_name         text        NOT NULL,
    account_number_masked       text        NOT NULL,
    provider_quote_reference    text,
    provider_quote_evidence     text        NOT NULL DEFAULT '',
    status                      text        NOT NULL DEFAULT 'ACTIVE',
    idempotency_key_hash        text        NOT NULL,
    request_hash                text        NOT NULL,
    expires_at                  timestamptz NOT NULL,
    consumed_withdrawal_id      text,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT withdrawal_quotes_mode_check CHECK (payment_mode IN ('SANDBOX', 'LIVE')),
    CONSTRAINT withdrawal_quotes_currency_check CHECK (currency = 'IDR'),
    CONSTRAINT withdrawal_quotes_amount_pos CHECK (amount_idr > 0),
    CONSTRAINT withdrawal_quotes_fees_nonneg CHECK (
        platform_fee_idr >= 0 AND provider_fee_idr >= 0 AND total_fee_idr >= 0
    ),
    CONSTRAINT withdrawal_quotes_net_pos CHECK (net_disbursement_idr > 0),
    CONSTRAINT withdrawal_quotes_fee_eq CHECK (
        total_fee_idr = platform_fee_idr + provider_fee_idr
        AND amount_idr = total_fee_idr + net_disbursement_idr
    ),
    CONSTRAINT withdrawal_quotes_status_check CHECK (
        status IN ('ACTIVE', 'CONSUMED', 'EXPIRED', 'INVALIDATED')
    )
);

CREATE UNIQUE INDEX withdrawal_quotes_idempotency_uidx
    ON withdrawal_quotes (merchant_id, payment_mode, idempotency_key_hash);

CREATE INDEX withdrawal_quotes_merchant_status_idx
    ON withdrawal_quotes (merchant_id, status, expires_at);

CREATE INDEX withdrawal_quotes_bank_idx
    ON withdrawal_quotes (bank_account_id, status);

-- ---------------------------------------------------------------------------
-- withdrawals
-- ---------------------------------------------------------------------------
CREATE TABLE withdrawals (
    id                          text        PRIMARY KEY,
    merchant_id                 text        NOT NULL REFERENCES merchants (id),
    store_id                    text,
    payment_mode                text        NOT NULL DEFAULT 'LIVE',
    source                      text        NOT NULL,
    quote_id                    text        NOT NULL REFERENCES withdrawal_quotes (id),
    amount_idr                  bigint      NOT NULL,
    platform_fee_idr            bigint      NOT NULL,
    provider_fee_quoted_idr     bigint      NOT NULL,
    provider_fee_actual_idr     bigint,
    total_fee_idr               bigint      NOT NULL,
    net_disbursement_idr        bigint      NOT NULL,
    currency                    text        NOT NULL DEFAULT 'IDR',
    policy_version_id           text        NOT NULL,
    fee_snapshot_id             text,
    bank_account_id             text        NOT NULL,
    bank_account_version        bigint      NOT NULL,
    bank_code                   text        NOT NULL,
    bank_name                   text        NOT NULL DEFAULT '',
    account_holder_name         text        NOT NULL,
    account_number_masked       text        NOT NULL,
    status                      text        NOT NULL DEFAULT 'REQUESTED',
    provider                    text        NOT NULL DEFAULT 'xendit',
    account_scope               text        NOT NULL DEFAULT 'xendit-primary',
    provider_disbursement_reference text,
    provider_external_id        text,
    reserve_journal_id          text,
    release_journal_id          text,
    complete_journal_id         text,
    fee_settle_journal_id       text,
    recapture_journal_id        text,
    reserve_released            boolean     NOT NULL DEFAULT false,
    review_reason               text        NOT NULL DEFAULT '',
    reject_reason               text        NOT NULL DEFAULT '',
    hold_reason                 text        NOT NULL DEFAULT '',
    reviewed_by                 text,
    reviewed_at                 timestamptz,
    submitted_at                timestamptz,
    processing_at               timestamptz,
    completed_at                timestamptz,
    failed_at                   timestamptz,
    unknown_outcome_at          timestamptz,
    next_lookup_at              timestamptz,
    lookup_attempts             integer     NOT NULL DEFAULT 0,
    idempotency_key_hash        text        NOT NULL,
    recovery_receivable_idr     bigint      NOT NULL DEFAULT 0,
    withdrawal_frozen           boolean     NOT NULL DEFAULT false,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT withdrawals_mode_check CHECK (payment_mode IN ('SANDBOX', 'LIVE')),
    CONSTRAINT withdrawals_source_check CHECK (
        source IN ('STOREFRONT', 'QRIS_API', 'MIXED')
    ),
    CONSTRAINT withdrawals_currency_check CHECK (currency = 'IDR'),
    CONSTRAINT withdrawals_amount_pos CHECK (amount_idr > 0 AND net_disbursement_idr > 0),
    CONSTRAINT withdrawals_fees_nonneg CHECK (
        platform_fee_idr >= 0 AND provider_fee_quoted_idr >= 0 AND total_fee_idr >= 0
        AND recovery_receivable_idr >= 0
    ),
    CONSTRAINT withdrawals_status_check CHECK (
        status IN (
            'REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'HELD',
            'PROCESSING', 'COMPLETED', 'FAILED', 'UNKNOWN_OUTCOME',
            'REJECTED', 'CANCELLED'
        )
    ),
    CONSTRAINT withdrawals_lookup_nonneg CHECK (lookup_attempts >= 0)
);

CREATE UNIQUE INDEX withdrawals_quote_uidx ON withdrawals (quote_id);

CREATE UNIQUE INDEX withdrawals_idempotency_uidx
    ON withdrawals (merchant_id, payment_mode, idempotency_key_hash);

-- Partial unique: one provider disbursement reference per account scope/mode.
CREATE UNIQUE INDEX withdrawals_provider_disbursement_uidx
    ON withdrawals (provider, account_scope, payment_mode, provider_disbursement_reference)
    WHERE provider_disbursement_reference IS NOT NULL;

CREATE UNIQUE INDEX withdrawals_provider_external_uidx
    ON withdrawals (provider, account_scope, payment_mode, provider_external_id)
    WHERE provider_external_id IS NOT NULL;

CREATE INDEX withdrawals_merchant_status_idx
    ON withdrawals (merchant_id, payment_mode, status, created_at DESC);

CREATE INDEX withdrawals_admin_queue_idx
    ON withdrawals (status, created_at ASC)
    WHERE status IN ('REQUESTED', 'UNDER_REVIEW', 'HELD', 'UNKNOWN_OUTCOME', 'PROCESSING');

CREATE INDEX withdrawals_lookup_idx
    ON withdrawals (next_lookup_at ASC)
    WHERE status = 'UNKNOWN_OUTCOME' AND next_lookup_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- withdrawal_allocations (immutable FIFO lot snapshot)
-- ---------------------------------------------------------------------------
CREATE TABLE withdrawal_allocations (
    id                  text        PRIMARY KEY,
    withdrawal_id       text        NOT NULL REFERENCES withdrawals (id),
    settlement_lot_id   text        NOT NULL,
    source              text        NOT NULL,
    amount_idr          bigint      NOT NULL,
    available_at        timestamptz NOT NULL,
    line_no             integer     NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT withdrawal_allocations_source_check CHECK (
        source IN ('STOREFRONT', 'QRIS_API')
    ),
    CONSTRAINT withdrawal_allocations_amount_pos CHECK (amount_idr > 0),
    CONSTRAINT withdrawal_allocations_line_pos CHECK (line_no > 0)
);

CREATE UNIQUE INDEX withdrawal_allocations_line_uidx
    ON withdrawal_allocations (withdrawal_id, line_no);

CREATE INDEX withdrawal_allocations_lot_idx
    ON withdrawal_allocations (settlement_lot_id);

CREATE INDEX withdrawal_allocations_withdrawal_idx
    ON withdrawal_allocations (withdrawal_id);

-- ---------------------------------------------------------------------------
-- schema_meta defaults for withdrawal ops
-- ---------------------------------------------------------------------------
INSERT INTO schema_meta (key, value) VALUES
    ('withdrawal_quote_ttl_seconds', '300'),
    ('bank_change_lock_seconds', '86400'),
    ('withdrawal_default_provider_fee_idr', '2500'),
    ('withdrawal_auto_approve', 'true')
ON CONFLICT (key) DO NOTHING;
