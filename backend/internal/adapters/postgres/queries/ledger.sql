-- BE-340 ledger queries

-- name: LedgerGetBalance :one
SELECT
    merchant_id, payment_mode, available_idr, pending_idr, held_idr,
    lifetime_gross_idr, lifetime_fee_percent_idr, lifetime_fee_fixed_idr, lifetime_net_idr,
    month_gross_idr, month_fee_percent_idr, month_fee_fixed_idr, month_net_idr,
    month_bucket, currency, version, updated_at
FROM merchant_balances
WHERE merchant_id = $1 AND payment_mode = $2;

-- name: LedgerListSourceBalances :many
SELECT
    merchant_id, payment_mode, source, available_idr, pending_idr, held_idr,
    lifetime_net_idr, currency, updated_at
FROM merchant_balance_sources
WHERE merchant_id = $1 AND payment_mode = $2
ORDER BY source ASC;

-- name: LedgerGetJournalByReference :one
SELECT
    id, merchant_id, store_id, payment_mode, source, template_code,
    reference_type, reference_id, journal_reference, idempotency_key,
    status, currency, description, payment_intent_id, order_id,
    settlement_lot_id, fee_snapshot_id, gross_idr, fee_percent_idr,
    fee_fixed_idr, merchant_net_idr, posted_at, created_at
FROM ledger_journals
WHERE journal_reference = $1;

-- name: LedgerGetJournalByID :one
SELECT
    id, merchant_id, store_id, payment_mode, source, template_code,
    reference_type, reference_id, journal_reference, idempotency_key,
    status, currency, description, payment_intent_id, order_id,
    settlement_lot_id, fee_snapshot_id, gross_idr, fee_percent_idr,
    fee_fixed_idr, merchant_net_idr, posted_at, created_at
FROM ledger_journals
WHERE id = $1;

-- name: LedgerListJournals :many
SELECT
    id, merchant_id, store_id, payment_mode, source, template_code,
    reference_type, reference_id, journal_reference, idempotency_key,
    status, currency, description, payment_intent_id, order_id,
    settlement_lot_id, fee_snapshot_id, gross_idr, fee_percent_idr,
    fee_fixed_idr, merchant_net_idr, posted_at, created_at
FROM ledger_journals
WHERE merchant_id = $1
  AND payment_mode = $2
  AND (sqlc.narg('source')::text IS NULL OR source = sqlc.narg('source'))
  AND (sqlc.narg('template_code')::text IS NULL OR template_code = sqlc.narg('template_code'))
  AND (
    sqlc.narg('cursor_posted_at')::timestamptz IS NULL
    OR (posted_at, id) < (sqlc.narg('cursor_posted_at')::timestamptz, sqlc.narg('cursor_id')::text)
  )
ORDER BY posted_at DESC, id DESC
LIMIT $3;

-- name: LedgerListEntriesByJournal :many
SELECT
    id, journal_id, account_code, side, amount_idr, currency, fee_component,
    source, payment_mode, merchant_id, settlement_lot_id, available_at, line_no, created_at
FROM ledger_entries
WHERE journal_id = $1
ORDER BY line_no ASC;

-- name: LedgerInsertSettlementLot :one
INSERT INTO settlement_lots (
    id, merchant_id, store_id, payment_mode, source, payment_intent_id, order_id,
    capture_journal_id, release_journal_id, original_amount_idr, remaining_amount_idr,
    currency, status, available_at, released_at, created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7,
    $8, $9, $10, $11,
    $12, $13, $14, $15, $16, $17
)
RETURNING
    id, merchant_id, store_id, payment_mode, source, payment_intent_id, order_id,
    capture_journal_id, release_journal_id, original_amount_idr, remaining_amount_idr,
    currency, status, available_at, released_at, created_at, updated_at;

-- name: LedgerGetLotByIntent :one
SELECT
    id, merchant_id, store_id, payment_mode, source, payment_intent_id, order_id,
    capture_journal_id, release_journal_id, original_amount_idr, remaining_amount_idr,
    currency, status, available_at, released_at, created_at, updated_at
FROM settlement_lots
WHERE payment_intent_id = $1;

-- name: LedgerGetLotByID :one
SELECT
    id, merchant_id, store_id, payment_mode, source, payment_intent_id, order_id,
    capture_journal_id, release_journal_id, original_amount_idr, remaining_amount_idr,
    currency, status, available_at, released_at, created_at, updated_at
FROM settlement_lots
WHERE id = $1;

-- name: LedgerUpdateLotAfterCapture :exec
UPDATE settlement_lots
SET capture_journal_id = $2,
    status = $3,
    remaining_amount_idr = $4,
    updated_at = $5
WHERE id = $1;

-- name: LedgerUpdateLotAfterRelease :exec
UPDATE settlement_lots
SET release_journal_id = $2,
    status = $3,
    remaining_amount_idr = $4,
    released_at = $5,
    updated_at = $5
WHERE id = $1;

-- name: LedgerListAvailableLots :many
SELECT
    id, merchant_id, store_id, payment_mode, source, payment_intent_id, order_id,
    capture_journal_id, release_journal_id, original_amount_idr, remaining_amount_idr,
    currency, status, available_at, released_at, created_at, updated_at
FROM settlement_lots
WHERE merchant_id = $1
  AND payment_mode = $2
  AND remaining_amount_idr > 0
  AND status IN ('AVAILABLE', 'PARTIALLY_CONSUMED')
ORDER BY available_at ASC, id ASC;

-- name: LedgerListDuePendingLots :many
SELECT
    id, merchant_id, store_id, payment_mode, source, payment_intent_id, order_id,
    capture_journal_id, release_journal_id, original_amount_idr, remaining_amount_idr,
    currency, status, available_at, released_at, created_at, updated_at
FROM settlement_lots
WHERE status = 'PENDING'
  AND available_at <= $1
ORDER BY available_at ASC, id ASC
LIMIT $2;

-- name: LedgerGetSettlementDelaySeconds :one
SELECT value FROM schema_meta WHERE key = 'settlement_delay_seconds';

-- name: LedgerLinkPaymentSettlement :exec
UPDATE payment_settlements
SET ledger_journal_id = $2,
    fee_percent_idr = $3,
    fee_fixed_idr = $4,
    settlement_lot_id = $5,
    available_at = $6
WHERE id = $1;

-- name: LedgerGetStoreMerchant :one
SELECT id, merchant_id FROM stores WHERE id = $1;

-- name: LedgerRevenueByDay :many
SELECT
    to_char(posted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
    COALESCE(SUM(merchant_net_idr), 0)::bigint AS revenue,
    COUNT(*)::bigint AS orders
FROM ledger_journals
WHERE merchant_id = $1
  AND payment_mode = $2
  AND template_code = 'PAYMENT_CAPTURE'
  AND status = 'POSTED'
  AND posted_at >= $3
  AND posted_at < $4
GROUP BY 1
ORDER BY 1 ASC;
