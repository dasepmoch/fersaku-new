-- BE-340 Unified double-entry ledger / merchant wallet balance.
-- Chart of accounts, balanced journals/entries, settlement lots, balance projections.
-- App posts only via post_ledger_transaction(...) SECURITY DEFINER routine.
-- Money: bigint whole IDR. Append-only entries. Sandbox isolated via payment_mode.

-- ---------------------------------------------------------------------------
-- chart_of_accounts (system + per-merchant wallet legs)
-- ---------------------------------------------------------------------------
CREATE TABLE chart_of_accounts (
    code            text        PRIMARY KEY,
    name            text        NOT NULL,
    account_type    text        NOT NULL,
    normal_balance  text        NOT NULL,
    is_system       boolean     NOT NULL DEFAULT true,
    merchant_id     text        REFERENCES merchants (id),
    payment_mode    text,
    currency        text        NOT NULL DEFAULT 'IDR',
    active          boolean     NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chart_of_accounts_type_check CHECK (
        account_type IN (
            'ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE', 'CLEARING'
        )
    ),
    CONSTRAINT chart_of_accounts_normal_check CHECK (normal_balance IN ('DEBIT', 'CREDIT')),
    CONSTRAINT chart_of_accounts_currency_check CHECK (currency = 'IDR'),
    CONSTRAINT chart_of_accounts_mode_check CHECK (
        payment_mode IS NULL OR payment_mode IN ('SANDBOX', 'LIVE')
    ),
    CONSTRAINT chart_of_accounts_name_nonempty CHECK (name <> '')
);

CREATE INDEX chart_of_accounts_merchant_idx
    ON chart_of_accounts (merchant_id, payment_mode)
    WHERE merchant_id IS NOT NULL;

-- System COA seed (mandatory templates §4.6)
INSERT INTO chart_of_accounts (code, name, account_type, normal_balance, is_system) VALUES
    ('XENDIT_RECEIVABLE',              'Xendit receivable (gross capture)',           'ASSET',    'DEBIT',  true),
    ('XENDIT_CASH',                    'Xendit cash / settled funds',                 'ASSET',    'DEBIT',  true),
    ('XENDIT_PROVIDER_EXPENSE',        'Actual Xendit provider cost',                 'EXPENSE',  'DEBIT',  true),
    ('MERCHANT_PENDING',               'Merchant pending wallet (all merchants)',     'LIABILITY','CREDIT', true),
    ('MERCHANT_AVAILABLE',             'Merchant available wallet (all merchants)',   'LIABILITY','CREDIT', true),
    ('MERCHANT_HELD',                  'Merchant held / containment wallet',          'LIABILITY','CREDIT', true),
    ('MERCHANT_RECOVERY_RECEIVABLE',   'Merchant recovery receivable',               'ASSET',    'DEBIT',  true),
    ('PLATFORM_FEE_REVENUE',           'Platform fee revenue (3% component)',         'REVENUE',  'CREDIT', true),
    ('PAYMENT_PROCESSING_REVENUE',     'Payment processing revenue (Rp700)',          'REVENUE',  'CREDIT', true),
    ('PROVIDER_DISBURSEMENT_PAYABLE',  'Provider disbursement payable',              'LIABILITY','CREDIT', true),
    ('PROVIDER_FEE_VARIANCE_INCOME',   'Provider fee variance income',               'REVENUE',  'CREDIT', true),
    ('PLATFORM_PROVIDER_SUBSIDY',      'Platform absorbs provider fee overage',      'EXPENSE',  'DEBIT',  true),
    ('PLATFORM_SUBSIDY',               'Platform-funded checkout discount',          'EXPENSE',  'DEBIT',  true),
    ('PROVIDER_REVERSAL_CLEARING',     'Provider reversal clearing',                 'CLEARING', 'CREDIT', true),
    ('WITHDRAWAL_CLEARING',            'Withdrawal reserve clearing',                'CLEARING', 'CREDIT', true);

-- ---------------------------------------------------------------------------
-- ledger_journals (posted double-entry headers)
-- ---------------------------------------------------------------------------
CREATE TABLE ledger_journals (
    id                  text        PRIMARY KEY,
    merchant_id         text        NOT NULL REFERENCES merchants (id),
    store_id            text,
    payment_mode        text        NOT NULL,
    source              text        NOT NULL,
    template_code       text        NOT NULL,
    reference_type      text        NOT NULL,
    reference_id        text        NOT NULL,
    journal_reference   text        NOT NULL,
    idempotency_key     text        NOT NULL,
    status              text        NOT NULL DEFAULT 'POSTED',
    currency            text        NOT NULL DEFAULT 'IDR',
    description         text        NOT NULL DEFAULT '',
    payment_intent_id   text,
    order_id            text,
    settlement_lot_id   text,
    fee_snapshot_id     text,
    gross_idr           bigint,
    fee_percent_idr     bigint,
    fee_fixed_idr       bigint,
    merchant_net_idr    bigint,
    posted_at           timestamptz NOT NULL DEFAULT now(),
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ledger_journals_mode_check CHECK (payment_mode IN ('SANDBOX', 'LIVE')),
    CONSTRAINT ledger_journals_source_check CHECK (
        source IN ('STOREFRONT', 'QRIS_API', 'MIXED', 'SYSTEM')
    ),
    CONSTRAINT ledger_journals_status_check CHECK (status IN ('POSTED')),
    CONSTRAINT ledger_journals_currency_check CHECK (currency = 'IDR'),
    CONSTRAINT ledger_journals_ref_nonempty CHECK (
        journal_reference <> '' AND idempotency_key <> '' AND reference_type <> '' AND reference_id <> ''
    ),
    CONSTRAINT ledger_journals_template_nonempty CHECK (template_code <> '')
);

CREATE UNIQUE INDEX ledger_journals_reference_uidx
    ON ledger_journals (journal_reference);

CREATE UNIQUE INDEX ledger_journals_idempotency_uidx
    ON ledger_journals (idempotency_key);

CREATE INDEX ledger_journals_merchant_posted_idx
    ON ledger_journals (merchant_id, payment_mode, posted_at DESC, id DESC);

CREATE INDEX ledger_journals_merchant_source_idx
    ON ledger_journals (merchant_id, payment_mode, source, posted_at DESC);

CREATE INDEX ledger_journals_template_idx
    ON ledger_journals (template_code, posted_at DESC);

CREATE INDEX ledger_journals_intent_idx
    ON ledger_journals (payment_intent_id)
    WHERE payment_intent_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- ledger_entries (append-only legs; positive whole IDR only)
-- ---------------------------------------------------------------------------
CREATE TABLE ledger_entries (
    id                  text        PRIMARY KEY,
    journal_id          text        NOT NULL REFERENCES ledger_journals (id),
    account_code        text        NOT NULL REFERENCES chart_of_accounts (code),
    side                text        NOT NULL,
    amount_idr          bigint      NOT NULL,
    currency            text        NOT NULL DEFAULT 'IDR',
    fee_component       text,
    source              text        NOT NULL,
    payment_mode        text        NOT NULL,
    merchant_id         text        NOT NULL REFERENCES merchants (id),
    settlement_lot_id   text,
    available_at        timestamptz,
    line_no             integer     NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ledger_entries_side_check CHECK (side IN ('DEBIT', 'CREDIT')),
    CONSTRAINT ledger_entries_amount_pos CHECK (amount_idr > 0),
    CONSTRAINT ledger_entries_currency_check CHECK (currency = 'IDR'),
    CONSTRAINT ledger_entries_mode_check CHECK (payment_mode IN ('SANDBOX', 'LIVE')),
    CONSTRAINT ledger_entries_source_check CHECK (
        source IN ('STOREFRONT', 'QRIS_API', 'MIXED', 'SYSTEM')
    ),
    CONSTRAINT ledger_entries_line_pos CHECK (line_no > 0),
    CONSTRAINT ledger_entries_fee_component_check CHECK (
        fee_component IS NULL OR fee_component IN (
            'GROSS', 'MERCHANT_NET', 'FEE_PERCENT', 'FEE_FIXED', 'PROVIDER_COST',
            'WITHDRAWAL', 'PLATFORM_FEE', 'PROVIDER_FEE', 'VARIANCE', 'RECOVERY'
        )
    )
);

CREATE UNIQUE INDEX ledger_entries_journal_line_uidx
    ON ledger_entries (journal_id, line_no);

CREATE INDEX ledger_entries_journal_idx ON ledger_entries (journal_id);
CREATE INDEX ledger_entries_merchant_account_idx
    ON ledger_entries (merchant_id, payment_mode, account_code, created_at DESC);
CREATE INDEX ledger_entries_lot_idx
    ON ledger_entries (settlement_lot_id)
    WHERE settlement_lot_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- settlement_lots: merchant credit lots for FIFO withdrawal allocation
-- ---------------------------------------------------------------------------
CREATE TABLE settlement_lots (
    id                  text        PRIMARY KEY,
    merchant_id         text        NOT NULL REFERENCES merchants (id),
    store_id            text,
    payment_mode        text        NOT NULL,
    source              text        NOT NULL,
    payment_intent_id   text,
    order_id            text,
    -- journal ids set after post (no FK to avoid insert-order cycles with journals)
    capture_journal_id  text,
    release_journal_id  text,
    original_amount_idr bigint      NOT NULL,
    remaining_amount_idr bigint     NOT NULL,
    currency            text        NOT NULL DEFAULT 'IDR',
    status              text        NOT NULL DEFAULT 'PENDING',
    available_at        timestamptz NOT NULL,
    released_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT settlement_lots_mode_check CHECK (payment_mode IN ('SANDBOX', 'LIVE')),
    CONSTRAINT settlement_lots_source_check CHECK (source IN ('STOREFRONT', 'QRIS_API')),
    CONSTRAINT settlement_lots_currency_check CHECK (currency = 'IDR'),
    CONSTRAINT settlement_lots_amount_pos CHECK (
        original_amount_idr > 0 AND remaining_amount_idr >= 0
        AND remaining_amount_idr <= original_amount_idr
    ),
    CONSTRAINT settlement_lots_status_check CHECK (
        status IN ('PENDING', 'AVAILABLE', 'PARTIALLY_CONSUMED', 'CONSUMED', 'HELD')
    )
);

CREATE INDEX settlement_lots_fifo_idx
    ON settlement_lots (merchant_id, payment_mode, status, available_at ASC, id ASC)
    WHERE remaining_amount_idr > 0;

CREATE INDEX settlement_lots_merchant_source_idx
    ON settlement_lots (merchant_id, payment_mode, source, status);

CREATE UNIQUE INDEX settlement_lots_intent_uidx
    ON settlement_lots (payment_intent_id)
    WHERE payment_intent_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- merchant_balances: projection (rebuildable from journals)
-- Unified totals per merchant+mode; source breakdown in merchant_balance_sources
-- ---------------------------------------------------------------------------
CREATE TABLE merchant_balances (
    merchant_id             text        NOT NULL REFERENCES merchants (id),
    payment_mode            text        NOT NULL,
    available_idr           bigint      NOT NULL DEFAULT 0,
    pending_idr             bigint      NOT NULL DEFAULT 0,
    held_idr                bigint      NOT NULL DEFAULT 0,
    lifetime_gross_idr      bigint      NOT NULL DEFAULT 0,
    lifetime_fee_percent_idr bigint     NOT NULL DEFAULT 0,
    lifetime_fee_fixed_idr  bigint      NOT NULL DEFAULT 0,
    lifetime_net_idr        bigint      NOT NULL DEFAULT 0,
    month_gross_idr         bigint      NOT NULL DEFAULT 0,
    month_fee_percent_idr   bigint      NOT NULL DEFAULT 0,
    month_fee_fixed_idr     bigint      NOT NULL DEFAULT 0,
    month_net_idr           bigint      NOT NULL DEFAULT 0,
    month_bucket            text        NOT NULL DEFAULT '',
    currency                text        NOT NULL DEFAULT 'IDR',
    version                 bigint      NOT NULL DEFAULT 0,
    updated_at              timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (merchant_id, payment_mode),
    CONSTRAINT merchant_balances_mode_check CHECK (payment_mode IN ('SANDBOX', 'LIVE')),
    CONSTRAINT merchant_balances_currency_check CHECK (currency = 'IDR'),
    CONSTRAINT merchant_balances_nonneg CHECK (
        available_idr >= 0 AND pending_idr >= 0 AND held_idr >= 0
        AND lifetime_gross_idr >= 0 AND lifetime_net_idr >= 0
        AND lifetime_fee_percent_idr >= 0 AND lifetime_fee_fixed_idr >= 0
        AND month_gross_idr >= 0 AND month_net_idr >= 0
        AND month_fee_percent_idr >= 0 AND month_fee_fixed_idr >= 0
    )
);

CREATE TABLE merchant_balance_sources (
    merchant_id     text        NOT NULL REFERENCES merchants (id),
    payment_mode    text        NOT NULL,
    source          text        NOT NULL,
    available_idr   bigint      NOT NULL DEFAULT 0,
    pending_idr     bigint      NOT NULL DEFAULT 0,
    held_idr        bigint      NOT NULL DEFAULT 0,
    lifetime_net_idr bigint     NOT NULL DEFAULT 0,
    currency        text        NOT NULL DEFAULT 'IDR',
    updated_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (merchant_id, payment_mode, source),
    CONSTRAINT merchant_balance_sources_mode_check CHECK (payment_mode IN ('SANDBOX', 'LIVE')),
    CONSTRAINT merchant_balance_sources_source_check CHECK (source IN ('STOREFRONT', 'QRIS_API')),
    CONSTRAINT merchant_balance_sources_currency_check CHECK (currency = 'IDR'),
    CONSTRAINT merchant_balance_sources_nonneg CHECK (
        available_idr >= 0 AND pending_idr >= 0 AND held_idr >= 0 AND lifetime_net_idr >= 0
    )
);

-- ---------------------------------------------------------------------------
-- Immutable POSTED journals/entries: block UPDATE/DELETE
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ledger_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'ledger append-only: % on % is forbidden', TG_OP, TG_TABLE_NAME
        USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE TRIGGER ledger_journals_no_update
    BEFORE UPDATE ON ledger_journals
    FOR EACH ROW EXECUTE FUNCTION ledger_reject_mutation();

CREATE TRIGGER ledger_journals_no_delete
    BEFORE DELETE ON ledger_journals
    FOR EACH ROW EXECUTE FUNCTION ledger_reject_mutation();

CREATE TRIGGER ledger_entries_no_update
    BEFORE UPDATE ON ledger_entries
    FOR EACH ROW EXECUTE FUNCTION ledger_reject_mutation();

CREATE TRIGGER ledger_entries_no_delete
    BEFORE DELETE ON ledger_entries
    FOR EACH ROW EXECUTE FUNCTION ledger_reject_mutation();

-- Deferred balance check at commit
CREATE OR REPLACE FUNCTION ledger_assert_journal_balanced()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    d bigint;
    c bigint;
    n int;
BEGIN
    SELECT
        COALESCE(SUM(CASE WHEN side = 'DEBIT' THEN amount_idr ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN side = 'CREDIT' THEN amount_idr ELSE 0 END), 0),
        COUNT(*)::int
    INTO d, c, n
    FROM ledger_entries
    WHERE journal_id = NEW.id;

    IF n < 2 THEN
        RAISE EXCEPTION 'ledger journal % must have at least 2 entries (got %)', NEW.id, n
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF d <> c THEN
        RAISE EXCEPTION 'ledger journal % unbalanced: debit=% credit=%', NEW.id, d, c
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ledger_journals_balanced_defer
    AFTER INSERT ON ledger_journals
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION ledger_assert_journal_balanced();

-- ---------------------------------------------------------------------------
-- post_ledger_transaction: controlled posting routine (app EXECUTE only)
-- p_entries: jsonb array of {account_code, side, amount_idr, fee_component?,
--            settlement_lot_id?, available_at?}
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION post_ledger_transaction(
    p_journal_id         text,
    p_merchant_id        text,
    p_store_id           text,
    p_payment_mode       text,
    p_source             text,
    p_template_code      text,
    p_reference_type     text,
    p_reference_id       text,
    p_journal_reference  text,
    p_idempotency_key    text,
    p_description        text,
    p_payment_intent_id  text,
    p_order_id           text,
    p_settlement_lot_id  text,
    p_fee_snapshot_id    text,
    p_gross_idr          bigint,
    p_fee_percent_idr    bigint,
    p_fee_fixed_idr      bigint,
    p_merchant_net_idr   bigint,
    p_posted_at          timestamptz,
    p_entries            jsonb
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_existing text;
    v_entry    jsonb;
    v_line     int := 0;
    v_debit    bigint := 0;
    v_credit   bigint := 0;
    v_side     text;
    v_amt      bigint;
    v_acct     text;
    v_entry_id text;
    v_lot_id   text;
    v_avail    timestamptz;
    v_fee_comp text;
    v_month    text;
BEGIN
    IF p_journal_id IS NULL OR p_journal_id = '' THEN
        RAISE EXCEPTION 'journal_id required';
    END IF;
    IF p_merchant_id IS NULL OR p_merchant_id = '' THEN
        RAISE EXCEPTION 'merchant_id required';
    END IF;
    IF p_payment_mode NOT IN ('SANDBOX', 'LIVE') THEN
        RAISE EXCEPTION 'invalid payment_mode';
    END IF;
    IF p_source NOT IN ('STOREFRONT', 'QRIS_API', 'MIXED', 'SYSTEM') THEN
        RAISE EXCEPTION 'invalid source';
    END IF;
    IF p_template_code IS NULL OR p_template_code = '' THEN
        RAISE EXCEPTION 'template_code required';
    END IF;
    IF p_journal_reference IS NULL OR p_journal_reference = '' THEN
        RAISE EXCEPTION 'journal_reference required';
    END IF;
    IF p_idempotency_key IS NULL OR p_idempotency_key = '' THEN
        RAISE EXCEPTION 'idempotency_key required';
    END IF;
    IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array' OR jsonb_array_length(p_entries) < 2 THEN
        RAISE EXCEPTION 'at least two entries required';
    END IF;

    -- Idempotent replay: return existing journal id
    SELECT id INTO v_existing FROM ledger_journals WHERE journal_reference = p_journal_reference;
    IF v_existing IS NOT NULL THEN
        RETURN v_existing;
    END IF;
    SELECT id INTO v_existing FROM ledger_journals WHERE idempotency_key = p_idempotency_key;
    IF v_existing IS NOT NULL THEN
        RETURN v_existing;
    END IF;

    -- Lock merchant balance projection row (create if missing)
    INSERT INTO merchant_balances (merchant_id, payment_mode, updated_at)
    VALUES (p_merchant_id, p_payment_mode, COALESCE(p_posted_at, now()))
    ON CONFLICT (merchant_id, payment_mode) DO NOTHING;

    PERFORM 1 FROM merchant_balances
    WHERE merchant_id = p_merchant_id AND payment_mode = p_payment_mode
    FOR UPDATE;

    IF p_source IN ('STOREFRONT', 'QRIS_API') THEN
        INSERT INTO merchant_balance_sources (merchant_id, payment_mode, source, updated_at)
        VALUES (p_merchant_id, p_payment_mode, p_source, COALESCE(p_posted_at, now()))
        ON CONFLICT (merchant_id, payment_mode, source) DO NOTHING;
        PERFORM 1 FROM merchant_balance_sources
        WHERE merchant_id = p_merchant_id AND payment_mode = p_payment_mode AND source = p_source
        FOR UPDATE;
    END IF;

    INSERT INTO ledger_journals (
        id, merchant_id, store_id, payment_mode, source, template_code,
        reference_type, reference_id, journal_reference, idempotency_key,
        status, currency, description, payment_intent_id, order_id,
        settlement_lot_id, fee_snapshot_id, gross_idr, fee_percent_idr,
        fee_fixed_idr, merchant_net_idr, posted_at, created_at
    ) VALUES (
        p_journal_id, p_merchant_id, NULLIF(p_store_id, ''), p_payment_mode, p_source, p_template_code,
        p_reference_type, p_reference_id, p_journal_reference, p_idempotency_key,
        'POSTED', 'IDR', COALESCE(p_description, ''), NULLIF(p_payment_intent_id, ''), NULLIF(p_order_id, ''),
        NULLIF(p_settlement_lot_id, ''), NULLIF(p_fee_snapshot_id, ''), p_gross_idr, p_fee_percent_idr,
        p_fee_fixed_idr, p_merchant_net_idr, COALESCE(p_posted_at, now()), COALESCE(p_posted_at, now())
    );

    FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
    LOOP
        v_line := v_line + 1;
        v_acct := v_entry->>'account_code';
        v_side := upper(v_entry->>'side');
        v_amt  := (v_entry->>'amount_idr')::bigint;
        v_fee_comp := NULLIF(v_entry->>'fee_component', '');
        v_lot_id := NULLIF(v_entry->>'settlement_lot_id', '');
        v_avail := NULL;
        IF v_entry ? 'available_at' AND NULLIF(v_entry->>'available_at', '') IS NOT NULL THEN
            v_avail := (v_entry->>'available_at')::timestamptz;
        END IF;

        IF v_acct IS NULL OR v_acct = '' THEN
            RAISE EXCEPTION 'entry % missing account_code', v_line;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = v_acct AND active) THEN
            RAISE EXCEPTION 'unknown account_code %', v_acct;
        END IF;
        IF v_side NOT IN ('DEBIT', 'CREDIT') THEN
            RAISE EXCEPTION 'entry % invalid side', v_line;
        END IF;
        IF v_amt IS NULL OR v_amt <= 0 THEN
            RAISE EXCEPTION 'entry % amount must be positive whole IDR', v_line;
        END IF;

        IF v_side = 'DEBIT' THEN
            v_debit := v_debit + v_amt;
        ELSE
            v_credit := v_credit + v_amt;
        END IF;

        v_entry_id := p_journal_id || '_e' || lpad(v_line::text, 2, '0');
        INSERT INTO ledger_entries (
            id, journal_id, account_code, side, amount_idr, currency,
            fee_component, source, payment_mode, merchant_id,
            settlement_lot_id, available_at, line_no, created_at
        ) VALUES (
            v_entry_id, p_journal_id, v_acct, v_side, v_amt, 'IDR',
            v_fee_comp, p_source, p_payment_mode, p_merchant_id,
            v_lot_id, v_avail, v_line, COALESCE(p_posted_at, now())
        );

        -- Projection updates for merchant wallet legs
        IF v_acct = 'MERCHANT_PENDING' THEN
            IF v_side = 'CREDIT' THEN
                UPDATE merchant_balances SET
                    pending_idr = pending_idr + v_amt,
                    version = version + 1,
                    updated_at = COALESCE(p_posted_at, now())
                WHERE merchant_id = p_merchant_id AND payment_mode = p_payment_mode;
                IF p_source IN ('STOREFRONT', 'QRIS_API') THEN
                    UPDATE merchant_balance_sources SET
                        pending_idr = pending_idr + v_amt,
                        updated_at = COALESCE(p_posted_at, now())
                    WHERE merchant_id = p_merchant_id AND payment_mode = p_payment_mode AND source = p_source;
                END IF;
            ELSE
                UPDATE merchant_balances SET
                    pending_idr = pending_idr - v_amt,
                    version = version + 1,
                    updated_at = COALESCE(p_posted_at, now())
                WHERE merchant_id = p_merchant_id AND payment_mode = p_payment_mode;
                IF p_source IN ('STOREFRONT', 'QRIS_API') THEN
                    UPDATE merchant_balance_sources SET
                        pending_idr = pending_idr - v_amt,
                        updated_at = COALESCE(p_posted_at, now())
                    WHERE merchant_id = p_merchant_id AND payment_mode = p_payment_mode AND source = p_source;
                END IF;
            END IF;
        ELSIF v_acct = 'MERCHANT_AVAILABLE' THEN
            IF v_side = 'CREDIT' THEN
                UPDATE merchant_balances SET
                    available_idr = available_idr + v_amt,
                    version = version + 1,
                    updated_at = COALESCE(p_posted_at, now())
                WHERE merchant_id = p_merchant_id AND payment_mode = p_payment_mode;
                IF p_source IN ('STOREFRONT', 'QRIS_API') THEN
                    UPDATE merchant_balance_sources SET
                        available_idr = available_idr + v_amt,
                        updated_at = COALESCE(p_posted_at, now())
                    WHERE merchant_id = p_merchant_id AND payment_mode = p_payment_mode AND source = p_source;
                END IF;
            ELSE
                UPDATE merchant_balances SET
                    available_idr = available_idr - v_amt,
                    version = version + 1,
                    updated_at = COALESCE(p_posted_at, now())
                WHERE merchant_id = p_merchant_id AND payment_mode = p_payment_mode;
                IF p_source IN ('STOREFRONT', 'QRIS_API') THEN
                    UPDATE merchant_balance_sources SET
                        available_idr = available_idr - v_amt,
                        updated_at = COALESCE(p_posted_at, now())
                    WHERE merchant_id = p_merchant_id AND payment_mode = p_payment_mode AND source = p_source;
                END IF;
            END IF;
        ELSIF v_acct = 'MERCHANT_HELD' THEN
            IF v_side = 'CREDIT' THEN
                UPDATE merchant_balances SET
                    held_idr = held_idr + v_amt,
                    version = version + 1,
                    updated_at = COALESCE(p_posted_at, now())
                WHERE merchant_id = p_merchant_id AND payment_mode = p_payment_mode;
                IF p_source IN ('STOREFRONT', 'QRIS_API') THEN
                    UPDATE merchant_balance_sources SET
                        held_idr = held_idr + v_amt,
                        updated_at = COALESCE(p_posted_at, now())
                    WHERE merchant_id = p_merchant_id AND payment_mode = p_payment_mode AND source = p_source;
                END IF;
            ELSE
                UPDATE merchant_balances SET
                    held_idr = held_idr - v_amt,
                    version = version + 1,
                    updated_at = COALESCE(p_posted_at, now())
                WHERE merchant_id = p_merchant_id AND payment_mode = p_payment_mode;
                IF p_source IN ('STOREFRONT', 'QRIS_API') THEN
                    UPDATE merchant_balance_sources SET
                        held_idr = held_idr - v_amt,
                        updated_at = COALESCE(p_posted_at, now())
                    WHERE merchant_id = p_merchant_id AND payment_mode = p_payment_mode AND source = p_source;
                END IF;
            END IF;
        END IF;
    END LOOP;

    IF v_debit <> v_credit THEN
        RAISE EXCEPTION 'unbalanced journal debit=% credit=%', v_debit, v_credit;
    END IF;

    -- Lifetime / month counters on payment capture template
    IF p_template_code = 'PAYMENT_CAPTURE' AND COALESCE(p_gross_idr, 0) > 0 THEN
        v_month := to_char(COALESCE(p_posted_at, now()) AT TIME ZONE 'UTC', 'YYYY-MM');
        UPDATE merchant_balances SET
            lifetime_gross_idr = lifetime_gross_idr + COALESCE(p_gross_idr, 0),
            lifetime_fee_percent_idr = lifetime_fee_percent_idr + COALESCE(p_fee_percent_idr, 0),
            lifetime_fee_fixed_idr = lifetime_fee_fixed_idr + COALESCE(p_fee_fixed_idr, 0),
            lifetime_net_idr = lifetime_net_idr + COALESCE(p_merchant_net_idr, 0),
            month_bucket = CASE WHEN month_bucket = v_month THEN month_bucket ELSE v_month END,
            month_gross_idr = CASE
                WHEN month_bucket = v_month THEN month_gross_idr + COALESCE(p_gross_idr, 0)
                ELSE COALESCE(p_gross_idr, 0)
            END,
            month_fee_percent_idr = CASE
                WHEN month_bucket = v_month THEN month_fee_percent_idr + COALESCE(p_fee_percent_idr, 0)
                ELSE COALESCE(p_fee_percent_idr, 0)
            END,
            month_fee_fixed_idr = CASE
                WHEN month_bucket = v_month THEN month_fee_fixed_idr + COALESCE(p_fee_fixed_idr, 0)
                ELSE COALESCE(p_fee_fixed_idr, 0)
            END,
            month_net_idr = CASE
                WHEN month_bucket = v_month THEN month_net_idr + COALESCE(p_merchant_net_idr, 0)
                ELSE COALESCE(p_merchant_net_idr, 0)
            END,
            updated_at = COALESCE(p_posted_at, now())
        WHERE merchant_id = p_merchant_id AND payment_mode = p_payment_mode;

        IF p_source IN ('STOREFRONT', 'QRIS_API') THEN
            UPDATE merchant_balance_sources SET
                lifetime_net_idr = lifetime_net_idr + COALESCE(p_merchant_net_idr, 0),
                updated_at = COALESCE(p_posted_at, now())
            WHERE merchant_id = p_merchant_id AND payment_mode = p_payment_mode AND source = p_source;
        END IF;
    END IF;

    -- Non-negative wallet invariant
    IF EXISTS (
        SELECT 1 FROM merchant_balances
        WHERE merchant_id = p_merchant_id AND payment_mode = p_payment_mode
          AND (available_idr < 0 OR pending_idr < 0 OR held_idr < 0)
    ) THEN
        RAISE EXCEPTION 'merchant balance projection would go negative';
    END IF;

    RETURN p_journal_id;
EXCEPTION
    WHEN unique_violation THEN
        SELECT id INTO v_existing FROM ledger_journals WHERE journal_reference = p_journal_reference;
        IF v_existing IS NOT NULL THEN
            RETURN v_existing;
        END IF;
        SELECT id INTO v_existing FROM ledger_journals WHERE idempotency_key = p_idempotency_key;
        IF v_existing IS NOT NULL THEN
            RETURN v_existing;
        END IF;
        RAISE;
END;
$$;

REVOKE ALL ON FUNCTION post_ledger_transaction(
    text, text, text, text, text, text, text, text, text, text, text,
    text, text, text, text, bigint, bigint, bigint, bigint, timestamptz, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION post_ledger_transaction(
    text, text, text, text, text, text, text, text, text, text, text,
    text, text, text, text, bigint, bigint, bigint, bigint, timestamptz, jsonb
) TO PUBLIC;

-- ---------------------------------------------------------------------------
-- rebuild_merchant_balances: projection verifier / repair from journals
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rebuild_merchant_balances(
    p_merchant_id text,
    p_payment_mode text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_available bigint := 0;
    v_pending   bigint := 0;
    v_held      bigint := 0;
    v_life_gross bigint := 0;
    v_life_fp   bigint := 0;
    v_life_ff   bigint := 0;
    v_life_net  bigint := 0;
    v_month     text;
    v_m_gross   bigint := 0;
    v_m_fp      bigint := 0;
    v_m_ff      bigint := 0;
    v_m_net     bigint := 0;
    r RECORD;
BEGIN
    IF p_payment_mode NOT IN ('SANDBOX', 'LIVE') THEN
        RAISE EXCEPTION 'invalid payment_mode';
    END IF;
    v_month := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');

    SELECT
        COALESCE(SUM(CASE
            WHEN e.account_code = 'MERCHANT_AVAILABLE' AND e.side = 'CREDIT' THEN e.amount_idr
            WHEN e.account_code = 'MERCHANT_AVAILABLE' AND e.side = 'DEBIT' THEN -e.amount_idr
            ELSE 0 END), 0),
        COALESCE(SUM(CASE
            WHEN e.account_code = 'MERCHANT_PENDING' AND e.side = 'CREDIT' THEN e.amount_idr
            WHEN e.account_code = 'MERCHANT_PENDING' AND e.side = 'DEBIT' THEN -e.amount_idr
            ELSE 0 END), 0),
        COALESCE(SUM(CASE
            WHEN e.account_code = 'MERCHANT_HELD' AND e.side = 'CREDIT' THEN e.amount_idr
            WHEN e.account_code = 'MERCHANT_HELD' AND e.side = 'DEBIT' THEN -e.amount_idr
            ELSE 0 END), 0)
    INTO v_available, v_pending, v_held
    FROM ledger_entries e
    WHERE e.merchant_id = p_merchant_id AND e.payment_mode = p_payment_mode;

    SELECT
        COALESCE(SUM(gross_idr), 0),
        COALESCE(SUM(fee_percent_idr), 0),
        COALESCE(SUM(fee_fixed_idr), 0),
        COALESCE(SUM(merchant_net_idr), 0),
        COALESCE(SUM(CASE WHEN to_char(posted_at AT TIME ZONE 'UTC', 'YYYY-MM') = v_month THEN gross_idr ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN to_char(posted_at AT TIME ZONE 'UTC', 'YYYY-MM') = v_month THEN fee_percent_idr ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN to_char(posted_at AT TIME ZONE 'UTC', 'YYYY-MM') = v_month THEN fee_fixed_idr ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN to_char(posted_at AT TIME ZONE 'UTC', 'YYYY-MM') = v_month THEN merchant_net_idr ELSE 0 END), 0)
    INTO v_life_gross, v_life_fp, v_life_ff, v_life_net, v_m_gross, v_m_fp, v_m_ff, v_m_net
    FROM ledger_journals
    WHERE merchant_id = p_merchant_id
      AND payment_mode = p_payment_mode
      AND template_code = 'PAYMENT_CAPTURE'
      AND status = 'POSTED';

    INSERT INTO merchant_balances (
        merchant_id, payment_mode, available_idr, pending_idr, held_idr,
        lifetime_gross_idr, lifetime_fee_percent_idr, lifetime_fee_fixed_idr, lifetime_net_idr,
        month_gross_idr, month_fee_percent_idr, month_fee_fixed_idr, month_net_idr,
        month_bucket, currency, version, updated_at
    ) VALUES (
        p_merchant_id, p_payment_mode, v_available, v_pending, v_held,
        v_life_gross, v_life_fp, v_life_ff, v_life_net,
        v_m_gross, v_m_fp, v_m_ff, v_m_net,
        v_month, 'IDR', 0, now()
    )
    ON CONFLICT (merchant_id, payment_mode) DO UPDATE SET
        available_idr = EXCLUDED.available_idr,
        pending_idr = EXCLUDED.pending_idr,
        held_idr = EXCLUDED.held_idr,
        lifetime_gross_idr = EXCLUDED.lifetime_gross_idr,
        lifetime_fee_percent_idr = EXCLUDED.lifetime_fee_percent_idr,
        lifetime_fee_fixed_idr = EXCLUDED.lifetime_fee_fixed_idr,
        lifetime_net_idr = EXCLUDED.lifetime_net_idr,
        month_gross_idr = EXCLUDED.month_gross_idr,
        month_fee_percent_idr = EXCLUDED.month_fee_percent_idr,
        month_fee_fixed_idr = EXCLUDED.month_fee_fixed_idr,
        month_net_idr = EXCLUDED.month_net_idr,
        month_bucket = EXCLUDED.month_bucket,
        version = merchant_balances.version + 1,
        updated_at = now();

    -- Source breakdown
    FOR r IN
        SELECT src AS source FROM (VALUES ('STOREFRONT'), ('QRIS_API')) AS s(src)
    LOOP
        SELECT
            COALESCE(SUM(CASE
                WHEN e.account_code = 'MERCHANT_AVAILABLE' AND e.side = 'CREDIT' THEN e.amount_idr
                WHEN e.account_code = 'MERCHANT_AVAILABLE' AND e.side = 'DEBIT' THEN -e.amount_idr
                ELSE 0 END), 0),
            COALESCE(SUM(CASE
                WHEN e.account_code = 'MERCHANT_PENDING' AND e.side = 'CREDIT' THEN e.amount_idr
                WHEN e.account_code = 'MERCHANT_PENDING' AND e.side = 'DEBIT' THEN -e.amount_idr
                ELSE 0 END), 0),
            COALESCE(SUM(CASE
                WHEN e.account_code = 'MERCHANT_HELD' AND e.side = 'CREDIT' THEN e.amount_idr
                WHEN e.account_code = 'MERCHANT_HELD' AND e.side = 'DEBIT' THEN -e.amount_idr
                ELSE 0 END), 0)
        INTO v_available, v_pending, v_held
        FROM ledger_entries e
        WHERE e.merchant_id = p_merchant_id
          AND e.payment_mode = p_payment_mode
          AND e.source = r.source;

        SELECT COALESCE(SUM(merchant_net_idr), 0)
        INTO v_life_net
        FROM ledger_journals
        WHERE merchant_id = p_merchant_id
          AND payment_mode = p_payment_mode
          AND source = r.source
          AND template_code = 'PAYMENT_CAPTURE'
          AND status = 'POSTED';

        INSERT INTO merchant_balance_sources (
            merchant_id, payment_mode, source, available_idr, pending_idr, held_idr,
            lifetime_net_idr, currency, updated_at
        ) VALUES (
            p_merchant_id, p_payment_mode, r.source, v_available, v_pending, v_held,
            v_life_net, 'IDR', now()
        )
        ON CONFLICT (merchant_id, payment_mode, source) DO UPDATE SET
            available_idr = EXCLUDED.available_idr,
            pending_idr = EXCLUDED.pending_idr,
            held_idr = EXCLUDED.held_idr,
            lifetime_net_idr = EXCLUDED.lifetime_net_idr,
            updated_at = now();
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION rebuild_merchant_balances(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rebuild_merchant_balances(text, text) TO PUBLIC;

-- ---------------------------------------------------------------------------
-- Link payment_settlements to ledger journals (dual-write bridge)
-- ---------------------------------------------------------------------------
ALTER TABLE payment_settlements
    ADD COLUMN IF NOT EXISTS ledger_journal_id text REFERENCES ledger_journals (id),
    ADD COLUMN IF NOT EXISTS fee_percent_idr bigint,
    ADD COLUMN IF NOT EXISTS fee_fixed_idr bigint,
    ADD COLUMN IF NOT EXISTS settlement_lot_id text,
    ADD COLUMN IF NOT EXISTS available_at timestamptz;

-- Platform settlement delay setting (seconds); 0 = immediate available.
INSERT INTO schema_meta (key, value, updated_at) VALUES
    ('settlement_delay_seconds', '86400', now()),
    ('ledger', 'BE-340', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
