-- BE-530 JCS-1 audit chain (append uses raw SQL via AuditRepo; see audit_repo.go)

-- name: GetAuditEventByID :one
SELECT id, sequence_no, payload_hash, created_at,
       actor_user_id, action, resource_type, resource_id, reason, request_id, merchant_id, metadata_json,
       chain_scope, prev_hash, row_hash, canonical_version, canonical_payload, jcs_payload
FROM audit_events
WHERE id = $1;

-- name: GetAuditEventBySequence :one
SELECT id, sequence_no, payload_hash, created_at,
       actor_user_id, action, resource_type, resource_id, reason, request_id, merchant_id, metadata_json,
       chain_scope, prev_hash, row_hash, canonical_version, canonical_payload, jcs_payload
FROM audit_events
WHERE chain_scope = $1 AND sequence_no = $2;

-- name: ListAuditEvents :many
SELECT id, sequence_no, payload_hash, created_at,
       actor_user_id, action, resource_type, resource_id, reason, request_id, merchant_id, metadata_json,
       chain_scope, prev_hash, row_hash, canonical_version, canonical_payload, jcs_payload
FROM audit_events
WHERE chain_scope = sqlc.arg(chain_scope)
  AND (sqlc.narg('action')::text IS NULL OR action = sqlc.narg('action'))
  AND (sqlc.narg('resource_type')::text IS NULL OR resource_type = sqlc.narg('resource_type'))
  AND (sqlc.narg('resource_id')::text IS NULL OR resource_id = sqlc.narg('resource_id'))
  AND (sqlc.narg('actor_user_id')::text IS NULL OR actor_user_id = sqlc.narg('actor_user_id'))
  AND (sqlc.narg('from_at')::timestamptz IS NULL OR created_at >= sqlc.narg('from_at'))
  AND (sqlc.narg('to_at')::timestamptz IS NULL OR created_at <= sqlc.narg('to_at'))
  AND (
    sqlc.narg('cursor_at')::timestamptz IS NULL
    OR (created_at, sequence_no) < (sqlc.narg('cursor_at')::timestamptz, sqlc.narg('cursor_seq')::bigint)
  )
ORDER BY created_at DESC, sequence_no DESC
LIMIT sqlc.arg('limit_count');

-- name: StreamAuditEventsFromSeq :many
SELECT id, sequence_no, payload_hash, created_at,
       actor_user_id, action, resource_type, resource_id, reason, request_id, merchant_id, metadata_json,
       chain_scope, prev_hash, row_hash, canonical_version, canonical_payload, jcs_payload
FROM audit_events
WHERE chain_scope = $1
  AND sequence_no >= $2
ORDER BY sequence_no ASC
LIMIT $3;

-- name: GetAuditChainHead :one
SELECT chain_scope, head_sequence, head_hash, updated_at
FROM audit_chain_heads
WHERE chain_scope = $1;

-- name: GetLatestAuditCheckpoint :one
SELECT id, chain_scope, sequence_no, head_hash, canonical_version,
       signature, key_id, signed_at, locked_until, created_at
FROM audit_checkpoints
WHERE chain_scope = $1
ORDER BY sequence_no DESC
LIMIT 1;

-- name: GetAuditCheckpointBySeq :one
SELECT id, chain_scope, sequence_no, head_hash, canonical_version,
       signature, key_id, signed_at, locked_until, created_at
FROM audit_checkpoints
WHERE chain_scope = $1 AND sequence_no = $2;

-- name: CountAuditEvents :one
SELECT COUNT(*)::bigint FROM audit_events WHERE chain_scope = $1;

-- name: MinMaxAuditSequence :one
SELECT
    COALESCE(MIN(sequence_no), 0)::bigint AS min_seq,
    COALESCE(MAX(sequence_no), 0)::bigint AS max_seq
FROM audit_events
WHERE chain_scope = $1;

-- name: InsertAuditExportJob :exec
INSERT INTO audit_exports (
    id, status, filter_json, redaction_policy, requester_id, reason, created_at, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);

-- name: GetAuditExportJob :one
SELECT id, status, filter_json, redaction_policy, requester_id, reason,
       row_count, error_message, expires_at, completed_at, created_at, updated_at
FROM audit_exports
WHERE id = $1;

-- name: CompleteAuditExportJob :exec
UPDATE audit_exports
SET status = $2, row_count = $3, completed_at = $4, expires_at = $5, updated_at = $4, error_message = $6
WHERE id = $1;
