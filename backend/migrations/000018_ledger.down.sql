-- BE-340 down: drop ledger objects.

DROP FUNCTION IF EXISTS rebuild_merchant_balances(text, text);
DROP FUNCTION IF EXISTS post_ledger_transaction(
    text, text, text, text, text, text, text, text, text, text, text,
    text, text, text, text, bigint, bigint, bigint, bigint, timestamptz, jsonb
);

DROP TRIGGER IF EXISTS ledger_journals_balanced_defer ON ledger_journals;
DROP TRIGGER IF EXISTS ledger_entries_no_delete ON ledger_entries;
DROP TRIGGER IF EXISTS ledger_entries_no_update ON ledger_entries;
DROP TRIGGER IF EXISTS ledger_journals_no_delete ON ledger_journals;
DROP TRIGGER IF EXISTS ledger_journals_no_update ON ledger_journals;
DROP FUNCTION IF EXISTS ledger_assert_journal_balanced();
DROP FUNCTION IF EXISTS ledger_reject_mutation();

ALTER TABLE payment_settlements
    DROP COLUMN IF EXISTS ledger_journal_id,
    DROP COLUMN IF EXISTS fee_percent_idr,
    DROP COLUMN IF EXISTS fee_fixed_idr,
    DROP COLUMN IF EXISTS settlement_lot_id,
    DROP COLUMN IF EXISTS available_at;

DROP TABLE IF EXISTS merchant_balance_sources;
DROP TABLE IF EXISTS merchant_balances;
DROP TABLE IF EXISTS settlement_lots;
DROP TABLE IF EXISTS ledger_entries;
DROP TABLE IF EXISTS ledger_journals;
DROP TABLE IF EXISTS chart_of_accounts;

DELETE FROM schema_meta WHERE key IN ('ledger', 'settlement_delay_seconds');
