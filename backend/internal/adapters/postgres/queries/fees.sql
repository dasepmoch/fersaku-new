-- name: FeeGetPolicyByVersion :one
SELECT
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
FROM fee_policies
WHERE version_id = $1;

-- name: FeeGetActivePolicy :one
-- Active = effective_from <= now AND (effective_to IS NULL OR effective_to > now).
SELECT
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
FROM fee_policies
WHERE scope = 'GLOBAL'
  AND effective_from <= $1
  AND (effective_to IS NULL OR effective_to > $1)
ORDER BY effective_from DESC
LIMIT 1;

-- name: FeeInsertSnapshot :one
INSERT INTO fee_snapshots (
    id,
    policy_version_id,
    scope,
    kind,
    payment_source,
    gross_or_amount_idr,
    percent_bps,
    percent_component_idr,
    fixed_component_idr,
    provider_fee_idr,
    total_fee_idr,
    net_idr,
    currency,
    checksum,
    created_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
)
RETURNING
    id,
    policy_version_id,
    scope,
    kind,
    payment_source,
    gross_or_amount_idr,
    percent_bps,
    percent_component_idr,
    fixed_component_idr,
    provider_fee_idr,
    total_fee_idr,
    net_idr,
    currency,
    checksum,
    created_at;

-- name: FeeGetSnapshotByID :one
SELECT
    id,
    policy_version_id,
    scope,
    kind,
    payment_source,
    gross_or_amount_idr,
    percent_bps,
    percent_component_idr,
    fixed_component_idr,
    provider_fee_idr,
    total_fee_idr,
    net_idr,
    currency,
    checksum,
    created_at
FROM fee_snapshots
WHERE id = $1;
