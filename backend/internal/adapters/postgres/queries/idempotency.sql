-- name: InsertIdempotencyRecord :one
INSERT INTO idempotency_records (
    id, subject_type, subject_id, operation, payment_mode,
    key_hash, request_hash, status, resource_type, resource_id,
    response_status, response_body, request_id, lease_expires_at,
    expires_at, created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5,
    $6, $7, $8, $9, $10,
    $11, $12, $13, $14,
    $15, now(), now()
)
RETURNING id, subject_type, subject_id, operation, payment_mode,
          key_hash, request_hash, status, resource_type, resource_id,
          response_status, response_body, request_id, lease_expires_at,
          expires_at, created_at, updated_at;

-- name: GetIdempotencyByScope :one
SELECT id, subject_type, subject_id, operation, payment_mode,
       key_hash, request_hash, status, resource_type, resource_id,
       response_status, response_body, request_id, lease_expires_at,
       expires_at, created_at, updated_at
FROM idempotency_records
WHERE subject_type = $1
  AND subject_id = $2
  AND operation = $3
  AND payment_mode IS NOT DISTINCT FROM sqlc.narg('payment_mode')::text
  AND key_hash = $4;

-- name: TryInsertIdempotencyRecord :one
INSERT INTO idempotency_records (
    id, subject_type, subject_id, operation, payment_mode,
    key_hash, request_hash, status, resource_type, resource_id,
    response_status, response_body, request_id, lease_expires_at,
    expires_at, created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5,
    $6, $7, $8, $9, $10,
    $11, $12, $13, $14,
    $15, now(), now()
)
ON CONFLICT ON CONSTRAINT idempotency_records_scope_uidx
DO NOTHING
RETURNING id, subject_type, subject_id, operation, payment_mode,
          key_hash, request_hash, status, resource_type, resource_id,
          response_status, response_body, request_id, lease_expires_at,
          expires_at, created_at, updated_at;

-- name: CompleteIdempotencyRecord :one
UPDATE idempotency_records
SET status = $2,
    resource_type = $3,
    resource_id = $4,
    response_status = $5,
    response_body = $6,
    updated_at = now(),
    lease_expires_at = NULL
WHERE id = $1
RETURNING id, subject_type, subject_id, operation, payment_mode,
          key_hash, request_hash, status, resource_type, resource_id,
          response_status, response_body, request_id, lease_expires_at,
          expires_at, created_at, updated_at;
