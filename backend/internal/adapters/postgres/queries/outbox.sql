-- name: InsertOutboxEvent :one
INSERT INTO outbox_events (
    id, topic, payload, status, attempts, available_at, created_at,
    dedupe_key, payment_mode
) VALUES (
    $1, $2, $3, $4, 0, $5, now(), $6, $7
)
RETURNING id, topic, payload, status, attempts, available_at, created_at,
          processed_at, dedupe_key, payment_mode, lease_owner, lease_until, last_error;

-- name: GetOutboxEvent :one
SELECT id, topic, payload, status, attempts, available_at, created_at,
       processed_at, dedupe_key, payment_mode, lease_owner, lease_until, last_error
FROM outbox_events
WHERE id = $1;

-- name: ListOutboxReady :many
SELECT id, topic, payload, status, attempts, available_at, created_at,
       processed_at, dedupe_key, payment_mode, lease_owner, lease_until, last_error
FROM outbox_events
WHERE status IN ('pending', 'failed')
  AND available_at <= $1
ORDER BY available_at ASC, id ASC
LIMIT $2;

-- name: MarkOutboxProcessing :one
UPDATE outbox_events
SET status = 'processing',
    lease_owner = $2,
    lease_until = $3,
    attempts = attempts + 1
WHERE id = $1
  AND status IN ('pending', 'failed')
RETURNING id, topic, payload, status, attempts, available_at, created_at,
          processed_at, dedupe_key, payment_mode, lease_owner, lease_until, last_error;

-- name: MarkOutboxCompleted :exec
UPDATE outbox_events
SET status = 'completed',
    processed_at = now(),
    lease_owner = NULL,
    lease_until = NULL,
    last_error = NULL
WHERE id = $1;

-- name: MarkOutboxFailed :exec
UPDATE outbox_events
SET status = 'failed',
    available_at = $2,
    lease_owner = NULL,
    lease_until = NULL,
    last_error = $3
WHERE id = $1;
