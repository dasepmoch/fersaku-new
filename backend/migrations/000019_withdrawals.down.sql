-- BE-350 down: drop withdrawal/bank tables (order respects FKs).

DROP TABLE IF EXISTS withdrawal_allocations;
DROP TABLE IF EXISTS withdrawals;
DROP TABLE IF EXISTS withdrawal_quotes;
DROP TABLE IF EXISTS merchant_withdrawal_locks;
DROP TABLE IF EXISTS bank_accounts;

DELETE FROM schema_meta WHERE key IN (
    'withdrawal_quote_ttl_seconds',
    'bank_change_lock_seconds',
    'withdrawal_default_provider_fee_idr',
    'withdrawal_auto_approve'
);
