-- name: InsertUser :exec
INSERT INTO users (
    id, email_normalized, email_display, password_hash, name, status,
    email_verified_at, mfa_enabled, last_login_at, created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10, $11
);

-- name: GetUserByID :one
SELECT id, email_normalized, email_display, password_hash, name, status,
       email_verified_at, mfa_enabled, last_login_at, created_at, updated_at
FROM users
WHERE id = $1;

-- name: GetUserByEmailNormalized :one
SELECT id, email_normalized, email_display, password_hash, name, status,
       email_verified_at, mfa_enabled, last_login_at, created_at, updated_at
FROM users
WHERE email_normalized = $1;

-- name: UpdateUserPassword :exec
UPDATE users
SET password_hash = $2, updated_at = $3
WHERE id = $1;

-- name: MarkUserEmailVerified :exec
UPDATE users
SET status = 'ACTIVE',
    email_verified_at = COALESCE(email_verified_at, $2),
    updated_at = $2
WHERE id = $1;

-- name: SetUserMFAEnabled :exec
UPDATE users
SET mfa_enabled = $2, updated_at = $3
WHERE id = $1;

-- name: TouchUserLastLogin :exec
UPDATE users
SET last_login_at = $2, updated_at = $2
WHERE id = $1;

-- name: InsertSession :exec
INSERT INTO auth_sessions (
    id, user_id, surface, token_hash, expires_at, revoked_at, mfa_verified_at,
    last_seen_at, absolute_expires_at, ip_hash, ua_hash, device_label,
    csrf_token_hash, created_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7,
    $8, $9, $10, $11, $12,
    $13, $14
);

-- name: GetSessionByTokenHash :one
SELECT id, user_id, surface, token_hash, expires_at, revoked_at, mfa_verified_at,
       last_seen_at, absolute_expires_at, ip_hash, ua_hash, device_label,
       csrf_token_hash, created_at
FROM auth_sessions
WHERE token_hash = $1;

-- name: GetSessionByID :one
SELECT id, user_id, surface, token_hash, expires_at, revoked_at, mfa_verified_at,
       last_seen_at, absolute_expires_at, ip_hash, ua_hash, device_label,
       csrf_token_hash, created_at
FROM auth_sessions
WHERE id = $1;

-- name: ListSessionsByUserID :many
SELECT id, user_id, surface, token_hash, expires_at, revoked_at, mfa_verified_at,
       last_seen_at, absolute_expires_at, ip_hash, ua_hash, device_label,
       csrf_token_hash, created_at
FROM auth_sessions
WHERE user_id = $1
  AND revoked_at IS NULL
  AND expires_at > $2
  AND absolute_expires_at > $2
ORDER BY created_at DESC;

-- name: RevokeSession :execrows
UPDATE auth_sessions
SET revoked_at = $3
WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL;

-- name: RevokeOtherSessions :execrows
UPDATE auth_sessions
SET revoked_at = $3
WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL;

-- name: RevokeAllSessions :execrows
UPDATE auth_sessions
SET revoked_at = $2
WHERE user_id = $1 AND revoked_at IS NULL;

-- name: TouchSession :exec
UPDATE auth_sessions
SET last_seen_at = $2, expires_at = $3
WHERE id = $1 AND revoked_at IS NULL;

-- name: SetSessionMFAVerified :exec
UPDATE auth_sessions
SET mfa_verified_at = $2
WHERE id = $1;

-- name: InsertChallenge :exec
INSERT INTO auth_challenges (
    id, user_id, purpose, token_hash, audience, expires_at, consumed_at,
    attempts, max_attempts, payload, created_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7,
    $8, $9, $10, $11
);

-- name: GetChallengeByPurposeHash :one
SELECT id, user_id, purpose, token_hash, audience, expires_at, consumed_at,
       attempts, max_attempts, payload, created_at
FROM auth_challenges
WHERE purpose = $1 AND token_hash = $2;

-- name: ConsumeChallenge :one
UPDATE auth_challenges
SET consumed_at = $3, attempts = attempts + 1
WHERE purpose = $1
  AND token_hash = $2
  AND consumed_at IS NULL
  AND expires_at > $3
  AND attempts < max_attempts
RETURNING id, user_id, purpose, token_hash, audience, expires_at, consumed_at,
          attempts, max_attempts, payload, created_at;

-- name: BumpChallengeAttempt :exec
UPDATE auth_challenges
SET attempts = attempts + 1
WHERE id = $1 AND consumed_at IS NULL;

-- name: InvalidateOpenChallenges :exec
UPDATE auth_challenges
SET consumed_at = COALESCE(consumed_at, $3)
WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL;

-- name: InsertMFAFactor :exec
INSERT INTO mfa_factors (
    id, user_id, factor_type, secret_enc, label, confirmed_at, created_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7
);

-- name: GetPendingMFAFactor :one
SELECT id, user_id, factor_type, secret_enc, label, confirmed_at, created_at
FROM mfa_factors
WHERE user_id = $1 AND factor_type = 'TOTP' AND confirmed_at IS NULL
ORDER BY created_at DESC
LIMIT 1;

-- name: GetConfirmedMFAFactor :one
SELECT id, user_id, factor_type, secret_enc, label, confirmed_at, created_at
FROM mfa_factors
WHERE user_id = $1 AND factor_type = 'TOTP' AND confirmed_at IS NOT NULL
ORDER BY confirmed_at DESC
LIMIT 1;

-- name: ConfirmMFAFactor :exec
UPDATE mfa_factors
SET confirmed_at = $3
WHERE id = $1 AND user_id = $2 AND confirmed_at IS NULL;

-- name: DeleteUnconfirmedMFAFactors :exec
DELETE FROM mfa_factors
WHERE user_id = $1 AND confirmed_at IS NULL;

-- name: InsertRecoveryCode :exec
INSERT INTO mfa_recovery_codes (id, user_id, code_hash, consumed_at, created_at)
VALUES ($1, $2, $3, NULL, $4);

-- name: DeleteRecoveryCodesForUser :exec
DELETE FROM mfa_recovery_codes WHERE user_id = $1;

-- name: ConsumeRecoveryCode :one
UPDATE mfa_recovery_codes
SET consumed_at = $3
WHERE user_id = $1 AND code_hash = $2 AND consumed_at IS NULL
RETURNING id, user_id, code_hash, consumed_at, created_at;
