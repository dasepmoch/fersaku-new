-- name: InsertNotification :one
INSERT INTO notifications (
    id, recipient_user_id, tenant_type, tenant_id, surface, event_code,
    title, body, cta_path, content_version, priority, retention_class,
    read_at, created_at
) VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10, $11, $12,
    NULL, $13
)
ON CONFLICT (recipient_user_id, event_code, content_version) DO NOTHING
RETURNING id, recipient_user_id, tenant_type, tenant_id, surface, event_code,
          title, body, cta_path, content_version, priority, retention_class,
          read_at, created_at;

-- name: GetNotificationByDedupe :one
SELECT id, recipient_user_id, tenant_type, tenant_id, surface, event_code,
       title, body, cta_path, content_version, priority, retention_class,
       read_at, created_at
FROM notifications
WHERE recipient_user_id = $1
  AND event_code = $2
  AND content_version = $3;

-- name: GetNotificationForRecipient :one
SELECT id, recipient_user_id, tenant_type, tenant_id, surface, event_code,
       title, body, cta_path, content_version, priority, retention_class,
       read_at, created_at
FROM notifications
WHERE id = $1 AND recipient_user_id = $2;

-- name: ListNotifications :many
SELECT id, recipient_user_id, tenant_type, tenant_id, surface, event_code,
       title, body, cta_path, content_version, priority, retention_class,
       read_at, created_at
FROM notifications
WHERE recipient_user_id = $1
  AND (
    NOT sqlc.arg(unread_only)::boolean
    OR read_at IS NULL
  )
  AND (
    sqlc.narg(cursor_created_at)::timestamptz IS NULL
    OR (created_at, id) < (sqlc.narg(cursor_created_at)::timestamptz, sqlc.narg(cursor_id)::text)
  )
ORDER BY created_at DESC, id DESC
LIMIT sqlc.arg(page_limit);

-- name: MarkNotificationRead :one
UPDATE notifications
SET read_at = COALESCE(read_at, sqlc.arg(now_ts)::timestamptz)
WHERE id = sqlc.arg(id) AND recipient_user_id = sqlc.arg(recipient_user_id)
RETURNING id, recipient_user_id, tenant_type, tenant_id, surface, event_code,
          title, body, cta_path, content_version, priority, retention_class,
          read_at, created_at;

-- name: MarkAllNotificationsRead :execrows
UPDATE notifications
SET read_at = sqlc.arg(now_ts)::timestamptz
WHERE recipient_user_id = sqlc.arg(recipient_user_id)
  AND read_at IS NULL;

-- name: CountUnreadNotifications :one
SELECT COUNT(*)::bigint AS count
FROM notifications
WHERE recipient_user_id = $1
  AND read_at IS NULL;

-- name: InsertDeliveryAttempt :one
INSERT INTO notification_delivery_attempts (
    id, notification_id, outbox_id, channel, status, attempts,
    last_error, provider_ref, created_at, updated_at, completed_at
) VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10, $11
)
ON CONFLICT (notification_id, channel) DO UPDATE
SET updated_at = EXCLUDED.updated_at
RETURNING id, notification_id, outbox_id, channel, status, attempts,
          last_error, provider_ref, created_at, updated_at, completed_at;

-- name: GetDeliveryAttempt :one
SELECT id, notification_id, outbox_id, channel, status, attempts,
       last_error, provider_ref, created_at, updated_at, completed_at
FROM notification_delivery_attempts
WHERE notification_id = $1 AND channel = $2;

-- name: UpdateDeliveryAttempt :one
UPDATE notification_delivery_attempts
SET status = $3,
    attempts = $4,
    last_error = $5,
    provider_ref = $6,
    outbox_id = COALESCE($7, outbox_id),
    updated_at = $8,
    completed_at = $9
WHERE notification_id = $1 AND channel = $2
RETURNING id, notification_id, outbox_id, channel, status, attempts,
          last_error, provider_ref, created_at, updated_at, completed_at;

-- name: IsEmailSuppressed :one
SELECT EXISTS (
    SELECT 1
    FROM notification_suppressions s
    WHERE s.channel = 'EMAIL'
      AND (s.expires_at IS NULL OR s.expires_at > now())
      AND (
        (sqlc.narg(user_id)::text IS NOT NULL AND s.user_id = sqlc.narg(user_id))
        OR (sqlc.narg(email_normalized)::text IS NOT NULL AND s.email_normalized = sqlc.narg(email_normalized))
      )
) AS suppressed;

-- name: InsertSuppression :exec
INSERT INTO notification_suppressions (
    id, user_id, email_normalized, channel, reason, event_code, created_at, expires_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8
)
ON CONFLICT DO NOTHING;
