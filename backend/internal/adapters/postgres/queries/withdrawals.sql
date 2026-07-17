-- BE-350 bank accounts, quotes, withdrawals

-- name: BankAccountInsert :one
INSERT INTO bank_accounts (
    id, merchant_id, bank_code, bank_name, account_holder_name,
    account_number_ciphertext, encryption_key_version, account_number_masked,
    account_number_last4, status, is_primary, version, verified_at, archived_at,
    created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
)
RETURNING
    id, merchant_id, bank_code, bank_name, account_holder_name,
    account_number_ciphertext, encryption_key_version, account_number_masked,
    account_number_last4, status, is_primary, version, verified_at, archived_at,
    created_at, updated_at;

-- name: BankAccountGetByID :one
SELECT
    id, merchant_id, bank_code, bank_name, account_holder_name,
    account_number_ciphertext, encryption_key_version, account_number_masked,
    account_number_last4, status, is_primary, version, verified_at, archived_at,
    created_at, updated_at
FROM bank_accounts
WHERE id = $1;

-- name: BankAccountListByMerchant :many
SELECT
    id, merchant_id, bank_code, bank_name, account_holder_name,
    account_number_ciphertext, encryption_key_version, account_number_masked,
    account_number_last4, status, is_primary, version, verified_at, archived_at,
    created_at, updated_at
FROM bank_accounts
WHERE merchant_id = $1
  AND status <> 'ARCHIVED'
ORDER BY is_primary DESC, created_at DESC;

-- name: BankAccountUpdate :one
UPDATE bank_accounts
SET bank_code = $2,
    bank_name = $3,
    account_holder_name = $4,
    account_number_ciphertext = $5,
    encryption_key_version = $6,
    account_number_masked = $7,
    account_number_last4 = $8,
    version = version + 1,
    updated_at = $9
WHERE id = $1 AND version = $10 AND status <> 'ARCHIVED'
RETURNING
    id, merchant_id, bank_code, bank_name, account_holder_name,
    account_number_ciphertext, encryption_key_version, account_number_masked,
    account_number_last4, status, is_primary, version, verified_at, archived_at,
    created_at, updated_at;

-- name: BankAccountSetVerified :one
UPDATE bank_accounts
SET status = 'VERIFIED',
    verified_at = $2,
    updated_at = $2
WHERE id = $1 AND status = 'PENDING_VERIFICATION'
RETURNING
    id, merchant_id, bank_code, bank_name, account_holder_name,
    account_number_ciphertext, encryption_key_version, account_number_masked,
    account_number_last4, status, is_primary, version, verified_at, archived_at,
    created_at, updated_at;

-- name: BankAccountClearPrimary :exec
UPDATE bank_accounts
SET is_primary = false, updated_at = $2
WHERE merchant_id = $1 AND is_primary = true AND status = 'VERIFIED';

-- name: BankAccountMakePrimary :one
UPDATE bank_accounts
SET is_primary = true, updated_at = $2
WHERE id = $1 AND merchant_id = $3 AND status = 'VERIFIED'
RETURNING
    id, merchant_id, bank_code, bank_name, account_holder_name,
    account_number_ciphertext, encryption_key_version, account_number_masked,
    account_number_last4, status, is_primary, version, verified_at, archived_at,
    created_at, updated_at;

-- name: BankAccountArchive :one
UPDATE bank_accounts
SET status = 'ARCHIVED',
    is_primary = false,
    archived_at = $2,
    updated_at = $2
WHERE id = $1 AND status <> 'ARCHIVED'
RETURNING
    id, merchant_id, bank_code, bank_name, account_holder_name,
    account_number_ciphertext, encryption_key_version, account_number_masked,
    account_number_last4, status, is_primary, version, verified_at, archived_at,
    created_at, updated_at;

-- name: BankAccountCountVerified :one
SELECT COUNT(*)::bigint FROM bank_accounts
WHERE merchant_id = $1 AND status = 'VERIFIED';

-- name: WithdrawalLockUpsert :one
INSERT INTO merchant_withdrawal_locks (merchant_id, locked_until, reason, bank_account_id, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $5)
ON CONFLICT (merchant_id) DO UPDATE SET
    locked_until = EXCLUDED.locked_until,
    reason = EXCLUDED.reason,
    bank_account_id = EXCLUDED.bank_account_id,
    updated_at = EXCLUDED.updated_at
RETURNING merchant_id, locked_until, reason, bank_account_id, created_at, updated_at;

-- name: WithdrawalLockGet :one
SELECT merchant_id, locked_until, reason, bank_account_id, created_at, updated_at
FROM merchant_withdrawal_locks
WHERE merchant_id = $1;

-- name: WithdrawalQuoteInsert :one
INSERT INTO withdrawal_quotes (
    id, merchant_id, store_id, payment_mode, amount_idr, platform_fee_idr,
    provider_fee_idr, total_fee_idr, net_disbursement_idr, currency,
    policy_version_id, fee_snapshot_id, bank_account_id, bank_account_version,
    bank_code, bank_name, account_holder_name, account_number_masked,
    provider_quote_reference, provider_quote_evidence, status,
    idempotency_key_hash, request_hash, expires_at, consumed_withdrawal_id,
    created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
    $19, $20, $21, $22, $23, $24, $25, $26, $27
)
RETURNING
    id, merchant_id, store_id, payment_mode, amount_idr, platform_fee_idr,
    provider_fee_idr, total_fee_idr, net_disbursement_idr, currency,
    policy_version_id, fee_snapshot_id, bank_account_id, bank_account_version,
    bank_code, bank_name, account_holder_name, account_number_masked,
    provider_quote_reference, provider_quote_evidence, status,
    idempotency_key_hash, request_hash, expires_at, consumed_withdrawal_id,
    created_at, updated_at;

-- name: WithdrawalQuoteGetByID :one
SELECT
    id, merchant_id, store_id, payment_mode, amount_idr, platform_fee_idr,
    provider_fee_idr, total_fee_idr, net_disbursement_idr, currency,
    policy_version_id, fee_snapshot_id, bank_account_id, bank_account_version,
    bank_code, bank_name, account_holder_name, account_number_masked,
    provider_quote_reference, provider_quote_evidence, status,
    idempotency_key_hash, request_hash, expires_at, consumed_withdrawal_id,
    created_at, updated_at
FROM withdrawal_quotes
WHERE id = $1;

-- name: WithdrawalQuoteGetByIdempotency :one
SELECT
    id, merchant_id, store_id, payment_mode, amount_idr, platform_fee_idr,
    provider_fee_idr, total_fee_idr, net_disbursement_idr, currency,
    policy_version_id, fee_snapshot_id, bank_account_id, bank_account_version,
    bank_code, bank_name, account_holder_name, account_number_masked,
    provider_quote_reference, provider_quote_evidence, status,
    idempotency_key_hash, request_hash, expires_at, consumed_withdrawal_id,
    created_at, updated_at
FROM withdrawal_quotes
WHERE merchant_id = $1 AND payment_mode = $2 AND idempotency_key_hash = $3;

-- name: WithdrawalQuoteMarkConsumed :one
UPDATE withdrawal_quotes
SET status = 'CONSUMED',
    consumed_withdrawal_id = $2,
    updated_at = $3
WHERE id = $1 AND status = 'ACTIVE'
RETURNING
    id, merchant_id, store_id, payment_mode, amount_idr, platform_fee_idr,
    provider_fee_idr, total_fee_idr, net_disbursement_idr, currency,
    policy_version_id, fee_snapshot_id, bank_account_id, bank_account_version,
    bank_code, bank_name, account_holder_name, account_number_masked,
    provider_quote_reference, provider_quote_evidence, status,
    idempotency_key_hash, request_hash, expires_at, consumed_withdrawal_id,
    created_at, updated_at;

-- name: WithdrawalQuoteInvalidateActiveForBank :exec
UPDATE withdrawal_quotes
SET status = 'INVALIDATED', updated_at = $2
WHERE bank_account_id = $1 AND status = 'ACTIVE';

-- name: WithdrawalQuoteInvalidateActiveForMerchant :exec
UPDATE withdrawal_quotes
SET status = 'INVALIDATED', updated_at = $2
WHERE merchant_id = $1 AND status = 'ACTIVE';

-- name: WithdrawalInsert :one
INSERT INTO withdrawals (
    id, merchant_id, store_id, payment_mode, source, quote_id,
    amount_idr, platform_fee_idr, provider_fee_quoted_idr, provider_fee_actual_idr,
    total_fee_idr, net_disbursement_idr, currency, policy_version_id, fee_snapshot_id,
    bank_account_id, bank_account_version, bank_code, bank_name, account_holder_name,
    account_number_masked, status, provider, account_scope,
    provider_disbursement_reference, provider_external_id,
    reserve_journal_id, release_journal_id, complete_journal_id, fee_settle_journal_id,
    recapture_journal_id, reserve_released, review_reason, reject_reason, hold_reason,
    reviewed_by, reviewed_at, submitted_at, processing_at, completed_at, failed_at,
    unknown_outcome_at, next_lookup_at, lookup_attempts, idempotency_key_hash,
    recovery_receivable_idr, withdrawal_frozen, created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
    $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38,
    $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49
)
RETURNING
    id, merchant_id, store_id, payment_mode, source, quote_id,
    amount_idr, platform_fee_idr, provider_fee_quoted_idr, provider_fee_actual_idr,
    total_fee_idr, net_disbursement_idr, currency, policy_version_id, fee_snapshot_id,
    bank_account_id, bank_account_version, bank_code, bank_name, account_holder_name,
    account_number_masked, status, provider, account_scope,
    provider_disbursement_reference, provider_external_id,
    reserve_journal_id, release_journal_id, complete_journal_id, fee_settle_journal_id,
    recapture_journal_id, reserve_released, review_reason, reject_reason, hold_reason,
    reviewed_by, reviewed_at, submitted_at, processing_at, completed_at, failed_at,
    unknown_outcome_at, next_lookup_at, lookup_attempts, idempotency_key_hash,
    recovery_receivable_idr, withdrawal_frozen, created_at, updated_at;

-- name: WithdrawalGetByID :one
SELECT
    id, merchant_id, store_id, payment_mode, source, quote_id,
    amount_idr, platform_fee_idr, provider_fee_quoted_idr, provider_fee_actual_idr,
    total_fee_idr, net_disbursement_idr, currency, policy_version_id, fee_snapshot_id,
    bank_account_id, bank_account_version, bank_code, bank_name, account_holder_name,
    account_number_masked, status, provider, account_scope,
    provider_disbursement_reference, provider_external_id,
    reserve_journal_id, release_journal_id, complete_journal_id, fee_settle_journal_id,
    recapture_journal_id, reserve_released, review_reason, reject_reason, hold_reason,
    reviewed_by, reviewed_at, submitted_at, processing_at, completed_at, failed_at,
    unknown_outcome_at, next_lookup_at, lookup_attempts, idempotency_key_hash,
    recovery_receivable_idr, withdrawal_frozen, created_at, updated_at
FROM withdrawals
WHERE id = $1;

-- name: WithdrawalGetByIdempotency :one
SELECT
    id, merchant_id, store_id, payment_mode, source, quote_id,
    amount_idr, platform_fee_idr, provider_fee_quoted_idr, provider_fee_actual_idr,
    total_fee_idr, net_disbursement_idr, currency, policy_version_id, fee_snapshot_id,
    bank_account_id, bank_account_version, bank_code, bank_name, account_holder_name,
    account_number_masked, status, provider, account_scope,
    provider_disbursement_reference, provider_external_id,
    reserve_journal_id, release_journal_id, complete_journal_id, fee_settle_journal_id,
    recapture_journal_id, reserve_released, review_reason, reject_reason, hold_reason,
    reviewed_by, reviewed_at, submitted_at, processing_at, completed_at, failed_at,
    unknown_outcome_at, next_lookup_at, lookup_attempts, idempotency_key_hash,
    recovery_receivable_idr, withdrawal_frozen, created_at, updated_at
FROM withdrawals
WHERE merchant_id = $1 AND payment_mode = $2 AND idempotency_key_hash = $3;

-- name: WithdrawalGetByProviderRef :one
SELECT
    id, merchant_id, store_id, payment_mode, source, quote_id,
    amount_idr, platform_fee_idr, provider_fee_quoted_idr, provider_fee_actual_idr,
    total_fee_idr, net_disbursement_idr, currency, policy_version_id, fee_snapshot_id,
    bank_account_id, bank_account_version, bank_code, bank_name, account_holder_name,
    account_number_masked, status, provider, account_scope,
    provider_disbursement_reference, provider_external_id,
    reserve_journal_id, release_journal_id, complete_journal_id, fee_settle_journal_id,
    recapture_journal_id, reserve_released, review_reason, reject_reason, hold_reason,
    reviewed_by, reviewed_at, submitted_at, processing_at, completed_at, failed_at,
    unknown_outcome_at, next_lookup_at, lookup_attempts, idempotency_key_hash,
    recovery_receivable_idr, withdrawal_frozen, created_at, updated_at
FROM withdrawals
WHERE provider = $1 AND account_scope = $2 AND payment_mode = $3
  AND provider_disbursement_reference = $4;

-- name: WithdrawalListByMerchant :many
SELECT
    id, merchant_id, store_id, payment_mode, source, quote_id,
    amount_idr, platform_fee_idr, provider_fee_quoted_idr, provider_fee_actual_idr,
    total_fee_idr, net_disbursement_idr, currency, policy_version_id, fee_snapshot_id,
    bank_account_id, bank_account_version, bank_code, bank_name, account_holder_name,
    account_number_masked, status, provider, account_scope,
    provider_disbursement_reference, provider_external_id,
    reserve_journal_id, release_journal_id, complete_journal_id, fee_settle_journal_id,
    recapture_journal_id, reserve_released, review_reason, reject_reason, hold_reason,
    reviewed_by, reviewed_at, submitted_at, processing_at, completed_at, failed_at,
    unknown_outcome_at, next_lookup_at, lookup_attempts, idempotency_key_hash,
    recovery_receivable_idr, withdrawal_frozen, created_at, updated_at
FROM withdrawals
WHERE merchant_id = $1
  AND payment_mode = $2
  AND (
    sqlc.narg('cursor_created_at')::timestamptz IS NULL
    OR (created_at, id) < (sqlc.narg('cursor_created_at')::timestamptz, sqlc.narg('cursor_id')::text)
  )
ORDER BY created_at DESC, id DESC
LIMIT $3;

-- name: WithdrawalListAdmin :many
SELECT
    id, merchant_id, store_id, payment_mode, source, quote_id,
    amount_idr, platform_fee_idr, provider_fee_quoted_idr, provider_fee_actual_idr,
    total_fee_idr, net_disbursement_idr, currency, policy_version_id, fee_snapshot_id,
    bank_account_id, bank_account_version, bank_code, bank_name, account_holder_name,
    account_number_masked, status, provider, account_scope,
    provider_disbursement_reference, provider_external_id,
    reserve_journal_id, release_journal_id, complete_journal_id, fee_settle_journal_id,
    recapture_journal_id, reserve_released, review_reason, reject_reason, hold_reason,
    reviewed_by, reviewed_at, submitted_at, processing_at, completed_at, failed_at,
    unknown_outcome_at, next_lookup_at, lookup_attempts, idempotency_key_hash,
    recovery_receivable_idr, withdrawal_frozen, created_at, updated_at
FROM withdrawals
WHERE (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
  AND (
    sqlc.narg('cursor_created_at')::timestamptz IS NULL
    OR (created_at, id) < (sqlc.narg('cursor_created_at')::timestamptz, sqlc.narg('cursor_id')::text)
  )
ORDER BY created_at DESC, id DESC
LIMIT $1;

-- name: WithdrawalSave :one
UPDATE withdrawals SET
    status = $2,
    reserve_journal_id = $3,
    release_journal_id = $4,
    complete_journal_id = $5,
    fee_settle_journal_id = $6,
    recapture_journal_id = $7,
    provider_disbursement_reference = $8,
    provider_external_id = $9,
    provider_fee_actual_idr = $10,
    reserve_released = $11,
    review_reason = $12,
    reject_reason = $13,
    hold_reason = $14,
    reviewed_by = $15,
    reviewed_at = $16,
    submitted_at = $17,
    processing_at = $18,
    completed_at = $19,
    failed_at = $20,
    unknown_outcome_at = $21,
    next_lookup_at = $22,
    lookup_attempts = $23,
    recovery_receivable_idr = $24,
    withdrawal_frozen = $25,
    updated_at = $26
WHERE id = $1
RETURNING
    id, merchant_id, store_id, payment_mode, source, quote_id,
    amount_idr, platform_fee_idr, provider_fee_quoted_idr, provider_fee_actual_idr,
    total_fee_idr, net_disbursement_idr, currency, policy_version_id, fee_snapshot_id,
    bank_account_id, bank_account_version, bank_code, bank_name, account_holder_name,
    account_number_masked, status, provider, account_scope,
    provider_disbursement_reference, provider_external_id,
    reserve_journal_id, release_journal_id, complete_journal_id, fee_settle_journal_id,
    recapture_journal_id, reserve_released, review_reason, reject_reason, hold_reason,
    reviewed_by, reviewed_at, submitted_at, processing_at, completed_at, failed_at,
    unknown_outcome_at, next_lookup_at, lookup_attempts, idempotency_key_hash,
    recovery_receivable_idr, withdrawal_frozen, created_at, updated_at;

-- name: WithdrawalLockForUpdate :one
SELECT
    id, merchant_id, store_id, payment_mode, source, quote_id,
    amount_idr, platform_fee_idr, provider_fee_quoted_idr, provider_fee_actual_idr,
    total_fee_idr, net_disbursement_idr, currency, policy_version_id, fee_snapshot_id,
    bank_account_id, bank_account_version, bank_code, bank_name, account_holder_name,
    account_number_masked, status, provider, account_scope,
    provider_disbursement_reference, provider_external_id,
    reserve_journal_id, release_journal_id, complete_journal_id, fee_settle_journal_id,
    recapture_journal_id, reserve_released, review_reason, reject_reason, hold_reason,
    reviewed_by, reviewed_at, submitted_at, processing_at, completed_at, failed_at,
    unknown_outcome_at, next_lookup_at, lookup_attempts, idempotency_key_hash,
    recovery_receivable_idr, withdrawal_frozen, created_at, updated_at
FROM withdrawals
WHERE id = $1
FOR UPDATE;

-- name: WithdrawalListUnknownDue :many
SELECT
    id, merchant_id, store_id, payment_mode, source, quote_id,
    amount_idr, platform_fee_idr, provider_fee_quoted_idr, provider_fee_actual_idr,
    total_fee_idr, net_disbursement_idr, currency, policy_version_id, fee_snapshot_id,
    bank_account_id, bank_account_version, bank_code, bank_name, account_holder_name,
    account_number_masked, status, provider, account_scope,
    provider_disbursement_reference, provider_external_id,
    reserve_journal_id, release_journal_id, complete_journal_id, fee_settle_journal_id,
    recapture_journal_id, reserve_released, review_reason, reject_reason, hold_reason,
    reviewed_by, reviewed_at, submitted_at, processing_at, completed_at, failed_at,
    unknown_outcome_at, next_lookup_at, lookup_attempts, idempotency_key_hash,
    recovery_receivable_idr, withdrawal_frozen, created_at, updated_at
FROM withdrawals
WHERE status = 'UNKNOWN_OUTCOME'
  AND next_lookup_at IS NOT NULL
  AND next_lookup_at <= $1
ORDER BY next_lookup_at ASC
LIMIT $2;

-- name: WithdrawalAllocationInsert :one
INSERT INTO withdrawal_allocations (
    id, withdrawal_id, settlement_lot_id, source, amount_idr, available_at, line_no, created_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING id, withdrawal_id, settlement_lot_id, source, amount_idr, available_at, line_no, created_at;

-- name: WithdrawalAllocationList :many
SELECT id, withdrawal_id, settlement_lot_id, source, amount_idr, available_at, line_no, created_at
FROM withdrawal_allocations
WHERE withdrawal_id = $1
ORDER BY line_no ASC;

-- name: WithdrawalCountActiveForBank :one
SELECT COUNT(*)::bigint FROM withdrawals
WHERE bank_account_id = $1
  AND status IN ('REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'HELD', 'PROCESSING', 'UNKNOWN_OUTCOME');

-- name: WithdrawalQuoteCountActiveForBank :one
SELECT COUNT(*)::bigint FROM withdrawal_quotes
WHERE bank_account_id = $1 AND status = 'ACTIVE';

-- name: WithdrawalSchemaMeta :one
SELECT value FROM schema_meta WHERE key = $1;

-- name: LedgerConsumeLotRemaining :exec
UPDATE settlement_lots
SET remaining_amount_idr = remaining_amount_idr - $2,
    status = CASE
        WHEN remaining_amount_idr - $2 <= 0 THEN 'CONSUMED'
        ELSE 'PARTIALLY_CONSUMED'
    END,
    updated_at = $3
WHERE id = $1
  AND remaining_amount_idr >= $2
  AND status IN ('AVAILABLE', 'PARTIALLY_CONSUMED');

-- name: LedgerRestoreLotRemaining :exec
UPDATE settlement_lots
SET remaining_amount_idr = remaining_amount_idr + $2,
    status = CASE
        WHEN remaining_amount_idr + $2 >= original_amount_idr THEN 'AVAILABLE'
        ELSE 'PARTIALLY_CONSUMED'
    END,
    updated_at = $3
WHERE id = $1;

-- name: LedgerLockBalance :one
SELECT merchant_id, payment_mode, available_idr, pending_idr, held_idr,
    lifetime_gross_idr, lifetime_fee_percent_idr, lifetime_fee_fixed_idr, lifetime_net_idr,
    month_gross_idr, month_fee_percent_idr, month_fee_fixed_idr, month_net_idr,
    month_bucket, currency, version, updated_at
FROM merchant_balances
WHERE merchant_id = $1 AND payment_mode = $2
FOR UPDATE;

-- name: LedgerEnsureBalance :exec
INSERT INTO merchant_balances (merchant_id, payment_mode, updated_at)
VALUES ($1, $2, $3)
ON CONFLICT (merchant_id, payment_mode) DO NOTHING;
