-- name: InsertUserProfile :exec
INSERT INTO user_profiles (
    user_id, display_name, phone, locale, timezone, avatar_ref, version, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8
);

-- name: GetUserProfile :one
SELECT user_id, display_name, phone, locale, timezone, avatar_ref, version, updated_at
FROM user_profiles
WHERE user_id = $1;

-- name: UpdateUserProfileOptimistic :one
UPDATE user_profiles
SET display_name = $2,
    phone = $3,
    locale = $4,
    timezone = $5,
    avatar_ref = $6,
    version = version + 1,
    updated_at = $7
WHERE user_id = $1 AND version = $8
RETURNING user_id, display_name, phone, locale, timezone, avatar_ref, version, updated_at;

-- name: InsertEmailChangeRequest :exec
INSERT INTO email_change_requests (
    id, user_id, new_email_normalized, new_email_display,
    current_proof_challenge_id, new_proof_challenge_id,
    current_confirmed_at, new_confirmed_at, status, created_at, completed_at
) VALUES (
    $1, $2, $3, $4,
    $5, $6,
    $7, $8, $9, $10, $11
);

-- name: GetPendingEmailChangeByUser :one
SELECT id, user_id, new_email_normalized, new_email_display,
       current_proof_challenge_id, new_proof_challenge_id,
       current_confirmed_at, new_confirmed_at, status, created_at, completed_at
FROM email_change_requests
WHERE user_id = $1 AND status = 'PENDING'
ORDER BY created_at DESC
LIMIT 1;

-- name: GetEmailChangeByID :one
SELECT id, user_id, new_email_normalized, new_email_display,
       current_proof_challenge_id, new_proof_challenge_id,
       current_confirmed_at, new_confirmed_at, status, created_at, completed_at
FROM email_change_requests
WHERE id = $1;

-- name: GetEmailChangeByCurrentChallenge :one
SELECT id, user_id, new_email_normalized, new_email_display,
       current_proof_challenge_id, new_proof_challenge_id,
       current_confirmed_at, new_confirmed_at, status, created_at, completed_at
FROM email_change_requests
WHERE current_proof_challenge_id = $1;

-- name: GetEmailChangeByNewChallenge :one
SELECT id, user_id, new_email_normalized, new_email_display,
       current_proof_challenge_id, new_proof_challenge_id,
       current_confirmed_at, new_confirmed_at, status, created_at, completed_at
FROM email_change_requests
WHERE new_proof_challenge_id = $1;

-- name: MarkEmailChangeCurrentConfirmed :one
UPDATE email_change_requests
SET current_confirmed_at = $2
WHERE id = $1 AND status = 'PENDING' AND current_confirmed_at IS NULL
RETURNING id, user_id, new_email_normalized, new_email_display,
          current_proof_challenge_id, new_proof_challenge_id,
          current_confirmed_at, new_confirmed_at, status, created_at, completed_at;

-- name: MarkEmailChangeNewConfirmed :one
UPDATE email_change_requests
SET new_confirmed_at = $2
WHERE id = $1 AND status = 'PENDING' AND new_confirmed_at IS NULL
RETURNING id, user_id, new_email_normalized, new_email_display,
          current_proof_challenge_id, new_proof_challenge_id,
          current_confirmed_at, new_confirmed_at, status, created_at, completed_at;

-- name: CompleteEmailChangeRequest :one
UPDATE email_change_requests
SET status = 'COMPLETED', completed_at = $2
WHERE id = $1
  AND status = 'PENDING'
  AND current_confirmed_at IS NOT NULL
  AND new_confirmed_at IS NOT NULL
RETURNING id, user_id, new_email_normalized, new_email_display,
          current_proof_challenge_id, new_proof_challenge_id,
          current_confirmed_at, new_confirmed_at, status, created_at, completed_at;

-- name: CancelPendingEmailChanges :exec
UPDATE email_change_requests
SET status = 'CANCELLED', completed_at = $2
WHERE user_id = $1 AND status = 'PENDING';

-- name: UpdateUserEmail :exec
UPDATE users
SET email_normalized = $2,
    email_display = $3,
    email_verified_at = COALESCE(email_verified_at, $4),
    status = CASE WHEN status = 'PENDING_VERIFICATION' THEN 'ACTIVE' ELSE status END,
    updated_at = $4
WHERE id = $1;

-- name: UpsertNotificationPref :exec
INSERT INTO user_notification_preferences (user_id, event_code, channel, enabled, updated_at)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (user_id, event_code, channel)
DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = EXCLUDED.updated_at;

-- name: ListNotificationPrefs :many
SELECT user_id, event_code, channel, enabled, updated_at
FROM user_notification_preferences
WHERE user_id = $1
ORDER BY event_code, channel;

-- name: DeleteConfirmedMFAFactors :exec
DELETE FROM mfa_factors
WHERE user_id = $1 AND confirmed_at IS NOT NULL;

-- name: GetChallengeByID :one
SELECT id, user_id, purpose, token_hash, audience, expires_at, consumed_at,
       attempts, max_attempts, payload, created_at
FROM auth_challenges
WHERE id = $1;

-- name: CountPendingEmailChangeForEmail :one
SELECT COUNT(*)::bigint AS count
FROM email_change_requests
WHERE new_email_normalized = $1 AND status = 'PENDING' AND user_id <> $2;
