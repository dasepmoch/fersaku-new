package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres/gen"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
)

// IdentityRepo is the Postgres adapter for identity/session persistence (BE-120).
type IdentityRepo struct {
	pool *pgxpool.Pool
	q    *gen.Queries
}

func NewIdentityRepo(pool *pgxpool.Pool) *IdentityRepo {
	return &IdentityRepo{pool: pool, q: gen.New(pool)}
}

func (r *IdentityRepo) queries(tx pgx.Tx) *gen.Queries {
	if tx != nil {
		return r.q.WithTx(tx)
	}
	return r.q
}

func (r *IdentityRepo) WithTx(ctx context.Context, fn func(ctx context.Context, tx pgx.Tx) error) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("identity: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := fn(ctx, tx); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("identity: commit: %w", err)
	}
	return nil
}

func (r *IdentityRepo) InsertUser(ctx context.Context, tx pgx.Tx, u auth.User) error {
	var ph *string
	if u.PasswordHash != "" {
		ph = &u.PasswordHash
	}
	return r.queries(tx).InsertUser(ctx, gen.InsertUserParams{
		ID:              u.ID,
		EmailNormalized: u.EmailNormalized,
		EmailDisplay:    u.EmailDisplay,
		PasswordHash:    ph,
		Name:            u.Name,
		Status:          string(u.Status),
		EmailVerifiedAt: timePtrToPg(u.EmailVerifiedAt),
		MfaEnabled:      u.MFAEnabled,
		LastLoginAt:     timePtrToPg(u.LastLoginAt),
		CreatedAt:       u.CreatedAt,
		UpdatedAt:       u.UpdatedAt,
	})
}

func (r *IdentityRepo) GetUserByID(ctx context.Context, id string) (auth.User, error) {
	row, err := r.q.GetUserByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return auth.User{}, auth.ErrUnauthenticated
		}
		return auth.User{}, err
	}
	return mapUser(row), nil
}

func (r *IdentityRepo) GetUserByEmail(ctx context.Context, emailNorm string) (auth.User, error) {
	row, err := r.q.GetUserByEmailNormalized(ctx, emailNorm)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return auth.User{}, errNotFound
		}
		return auth.User{}, err
	}
	return mapUser(row), nil
}

var errNotFound = errors.New("identity: not found")

func IsNotFound(err error) bool {
	return errors.Is(err, errNotFound) || errors.Is(err, pgx.ErrNoRows)
}

func (r *IdentityRepo) UpdatePassword(ctx context.Context, tx pgx.Tx, userID, hash string, now time.Time) error {
	return r.queries(tx).UpdateUserPassword(ctx, gen.UpdateUserPasswordParams{
		ID:           userID,
		PasswordHash: &hash,
		UpdatedAt:    now,
	})
}

func (r *IdentityRepo) MarkEmailVerified(ctx context.Context, tx pgx.Tx, userID string, now time.Time) error {
	return r.queries(tx).MarkUserEmailVerified(ctx, gen.MarkUserEmailVerifiedParams{
		ID:        userID,
		UpdatedAt: now,
	})
}

func (r *IdentityRepo) SetMFAEnabled(ctx context.Context, tx pgx.Tx, userID string, enabled bool, now time.Time) error {
	return r.queries(tx).SetUserMFAEnabled(ctx, gen.SetUserMFAEnabledParams{
		ID:         userID,
		MfaEnabled: enabled,
		UpdatedAt:  now,
	})
}

func (r *IdentityRepo) TouchLastLogin(ctx context.Context, tx pgx.Tx, userID string, now time.Time) error {
	return r.queries(tx).TouchUserLastLogin(ctx, gen.TouchUserLastLoginParams{
		ID:          userID,
		LastLoginAt: pgTimestamptz(now),
	})
}

func (r *IdentityRepo) InsertSession(ctx context.Context, tx pgx.Tx, s auth.Session) error {
	return r.queries(tx).InsertSession(ctx, gen.InsertSessionParams{
		ID:                s.ID,
		UserID:            s.UserID,
		Surface:           string(s.Surface),
		TokenHash:         s.TokenHash,
		ExpiresAt:         s.ExpiresAt,
		RevokedAt:         timePtrToPg(s.RevokedAt),
		MfaVerifiedAt:     timePtrToPg(s.MFAVerifiedAt),
		LastSeenAt:        s.LastSeenAt,
		AbsoluteExpiresAt: s.AbsoluteExpiresAt,
		IpHash:            strPtr(s.IPHash),
		UaHash:            strPtr(s.UAHash),
		DeviceLabel:       strPtr(s.DeviceLabel),
		CsrfTokenHash:     s.CSRFTokenHash,
		CreatedAt:         s.CreatedAt,
	})
}

func (r *IdentityRepo) GetSessionByTokenHash(ctx context.Context, hash string) (auth.Session, error) {
	row, err := r.q.GetSessionByTokenHash(ctx, hash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return auth.Session{}, errNotFound
		}
		return auth.Session{}, err
	}
	return mapSession(row), nil
}

func (r *IdentityRepo) GetSessionByID(ctx context.Context, id string) (auth.Session, error) {
	row, err := r.q.GetSessionByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return auth.Session{}, errNotFound
		}
		return auth.Session{}, err
	}
	return mapSession(row), nil
}

func (r *IdentityRepo) ListSessions(ctx context.Context, userID string, now time.Time) ([]auth.Session, error) {
	rows, err := r.q.ListSessionsByUserID(ctx, gen.ListSessionsByUserIDParams{
		UserID:    userID,
		ExpiresAt: now,
	})
	if err != nil {
		return nil, err
	}
	out := make([]auth.Session, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapSession(row))
	}
	return out, nil
}

func (r *IdentityRepo) RevokeSession(ctx context.Context, tx pgx.Tx, sessionID, userID string, now time.Time) (int64, error) {
	return r.queries(tx).RevokeSession(ctx, gen.RevokeSessionParams{
		ID:        sessionID,
		UserID:    userID,
		RevokedAt: pgTimestamptz(now),
	})
}

func (r *IdentityRepo) RevokeOtherSessions(ctx context.Context, tx pgx.Tx, userID, keepID string, now time.Time) (int64, error) {
	return r.queries(tx).RevokeOtherSessions(ctx, gen.RevokeOtherSessionsParams{
		UserID:    userID,
		ID:        keepID,
		RevokedAt: pgTimestamptz(now),
	})
}

func (r *IdentityRepo) RevokeAllSessions(ctx context.Context, tx pgx.Tx, userID string, now time.Time) (int64, error) {
	return r.queries(tx).RevokeAllSessions(ctx, gen.RevokeAllSessionsParams{
		UserID:    userID,
		RevokedAt: pgTimestamptz(now),
	})
}

func (r *IdentityRepo) TouchSession(ctx context.Context, sessionID string, lastSeen, idleExpires time.Time) error {
	return r.q.TouchSession(ctx, gen.TouchSessionParams{
		ID:         sessionID,
		LastSeenAt: lastSeen,
		ExpiresAt:  idleExpires,
	})
}

func (r *IdentityRepo) UpdateSessionCSRFHash(ctx context.Context, sessionID, csrfHash string) error {
	return r.q.UpdateSessionCSRFHash(ctx, gen.UpdateSessionCSRFHashParams{
		ID:            sessionID,
		CsrfTokenHash: csrfHash,
	})
}

func (r *IdentityRepo) SetSessionMFAVerified(ctx context.Context, tx pgx.Tx, sessionID string, at time.Time) error {
	return r.queries(tx).SetSessionMFAVerified(ctx, gen.SetSessionMFAVerifiedParams{
		ID:            sessionID,
		MfaVerifiedAt: pgTimestamptz(at),
	})
}

// InsertRecentMFAProof stores a hashed step-up proof (INT-140).
func (r *IdentityRepo) InsertRecentMFAProof(ctx context.Context, tx pgx.Tx, p auth.RecentMFAProof) error {
	const q = `
INSERT INTO mfa_recent_proofs (
    id, user_id, session_id, purpose, proof_hash, factor, expires_at, consumed_at, created_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`
	var consumed any
	if p.ConsumedAt != nil {
		consumed = *p.ConsumedAt
	}
	var err error
	if tx != nil {
		_, err = tx.Exec(ctx, q, p.ID, p.UserID, p.SessionID, p.Purpose, p.ProofHash, string(p.Factor), p.ExpiresAt, consumed, p.CreatedAt)
	} else {
		_, err = r.pool.Exec(ctx, q, p.ID, p.UserID, p.SessionID, p.Purpose, p.ProofHash, string(p.Factor), p.ExpiresAt, consumed, p.CreatedAt)
	}
	return err
}

// ConsumeRecentMFAProofByHash single-use consumes a matching proof or returns domain errors.
func (r *IdentityRepo) ConsumeRecentMFAProofByHash(ctx context.Context, tx pgx.Tx, userID, sessionID, purpose, proofHash string, now time.Time) error {
	// Inspect first for stable problem codes (expired vs invalid vs purpose).
	const sel = `
SELECT id, user_id, session_id, purpose, expires_at, consumed_at
FROM mfa_recent_proofs
WHERE proof_hash = $1
LIMIT 1`
	var (
		id, uid, sid, purp string
		expires            time.Time
		consumed           *time.Time
	)
	var err error
	if tx != nil {
		err = tx.QueryRow(ctx, sel, proofHash).Scan(&id, &uid, &sid, &purp, &expires, &consumed)
	} else {
		err = r.pool.QueryRow(ctx, sel, proofHash).Scan(&id, &uid, &sid, &purp, &expires, &consumed)
	}
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return auth.ErrMFAProofInvalid
		}
		return err
	}
	if uid != userID || sid != sessionID {
		return auth.ErrMFAProofInvalid
	}
	if purp != purpose {
		return auth.ErrMFAProofPurpose
	}
	if consumed != nil {
		return auth.ErrMFAProofInvalid
	}
	if !expires.After(now) {
		return auth.ErrMFAProofExpired
	}
	const upd = `
UPDATE mfa_recent_proofs
SET consumed_at = $2
WHERE id = $1 AND consumed_at IS NULL AND expires_at > $2`
	var cmd interface{ RowsAffected() int64 }
	if tx != nil {
		ct, e := tx.Exec(ctx, upd, id, now)
		err = e
		cmd = ct
	} else {
		ct, e := r.pool.Exec(ctx, upd, id, now)
		err = e
		cmd = ct
	}
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return auth.ErrMFAProofInvalid
	}
	return nil
}

func (r *IdentityRepo) RevokeRecentMFAProofsForSession(ctx context.Context, tx pgx.Tx, sessionID string, now time.Time) error {
	const q = `
UPDATE mfa_recent_proofs
SET consumed_at = $2
WHERE session_id = $1 AND consumed_at IS NULL`
	var err error
	if tx != nil {
		_, err = tx.Exec(ctx, q, sessionID, now)
	} else {
		_, err = r.pool.Exec(ctx, q, sessionID, now)
	}
	return err
}

func (r *IdentityRepo) RevokeRecentMFAProofsForUser(ctx context.Context, tx pgx.Tx, userID string, now time.Time) error {
	const q = `
UPDATE mfa_recent_proofs
SET consumed_at = $2
WHERE user_id = $1 AND consumed_at IS NULL`
	var err error
	if tx != nil {
		_, err = tx.Exec(ctx, q, userID, now)
	} else {
		_, err = r.pool.Exec(ctx, q, userID, now)
	}
	return err
}

func (r *IdentityRepo) InsertChallenge(ctx context.Context, tx pgx.Tx, c auth.Challenge) error {
	return r.queries(tx).InsertChallenge(ctx, gen.InsertChallengeParams{
		ID:          c.ID,
		UserID:      c.UserID,
		Purpose:     string(c.Purpose),
		TokenHash:   c.TokenHash,
		Audience:    c.Audience,
		ExpiresAt:   c.ExpiresAt,
		ConsumedAt:  timePtrToPg(c.ConsumedAt),
		Attempts:    int32(c.Attempts),
		MaxAttempts: int32(c.MaxAttempts),
		Payload:     c.Payload,
		CreatedAt:   c.CreatedAt,
	})
}

func (r *IdentityRepo) ConsumeChallenge(ctx context.Context, tx pgx.Tx, purpose auth.ChallengePurpose, tokenHash string, now time.Time) (auth.Challenge, error) {
	row, err := r.queries(tx).ConsumeChallenge(ctx, gen.ConsumeChallengeParams{
		Purpose:    string(purpose),
		TokenHash:  tokenHash,
		ConsumedAt: pgTimestamptz(now),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return auth.Challenge{}, errNotFound
		}
		return auth.Challenge{}, err
	}
	return mapChallenge(row), nil
}

func (r *IdentityRepo) InvalidateOpenChallenges(ctx context.Context, tx pgx.Tx, userID string, purpose auth.ChallengePurpose, now time.Time) error {
	return r.queries(tx).InvalidateOpenChallenges(ctx, gen.InvalidateOpenChallengesParams{
		UserID:     &userID,
		Purpose:    string(purpose),
		ConsumedAt: pgTimestamptz(now),
	})
}

func (r *IdentityRepo) InsertMFAFactor(ctx context.Context, tx pgx.Tx, f auth.MFAFactor) error {
	return r.queries(tx).InsertMFAFactor(ctx, gen.InsertMFAFactorParams{
		ID:          f.ID,
		UserID:      f.UserID,
		FactorType:  f.FactorType,
		SecretEnc:   f.SecretEnc,
		Label:       f.Label,
		ConfirmedAt: timePtrToPg(f.ConfirmedAt),
		CreatedAt:   f.CreatedAt,
	})
}

func (r *IdentityRepo) GetPendingMFAFactor(ctx context.Context, userID string) (auth.MFAFactor, error) {
	row, err := r.q.GetPendingMFAFactor(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return auth.MFAFactor{}, errNotFound
		}
		return auth.MFAFactor{}, err
	}
	return mapFactor(row), nil
}

func (r *IdentityRepo) GetConfirmedMFAFactor(ctx context.Context, userID string) (auth.MFAFactor, error) {
	row, err := r.q.GetConfirmedMFAFactor(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return auth.MFAFactor{}, errNotFound
		}
		return auth.MFAFactor{}, err
	}
	return mapFactor(row), nil
}

func (r *IdentityRepo) ConfirmMFAFactor(ctx context.Context, tx pgx.Tx, factorID, userID string, now time.Time) error {
	return r.queries(tx).ConfirmMFAFactor(ctx, gen.ConfirmMFAFactorParams{
		ID:          factorID,
		UserID:      userID,
		ConfirmedAt: pgTimestamptz(now),
	})
}

func (r *IdentityRepo) DeleteUnconfirmedMFA(ctx context.Context, tx pgx.Tx, userID string) error {
	return r.queries(tx).DeleteUnconfirmedMFAFactors(ctx, userID)
}

func (r *IdentityRepo) ReplaceRecoveryCodes(ctx context.Context, tx pgx.Tx, userID string, ids, hashes []string, now time.Time) error {
	q := r.queries(tx)
	if err := q.DeleteRecoveryCodesForUser(ctx, userID); err != nil {
		return err
	}
	for i := range hashes {
		if err := q.InsertRecoveryCode(ctx, gen.InsertRecoveryCodeParams{
			ID:        ids[i],
			UserID:    userID,
			CodeHash:  hashes[i],
			CreatedAt: now,
		}); err != nil {
			return err
		}
	}
	return nil
}

func (r *IdentityRepo) ConsumeRecoveryCode(ctx context.Context, tx pgx.Tx, userID, codeHash string, now time.Time) error {
	_, err := r.queries(tx).ConsumeRecoveryCode(ctx, gen.ConsumeRecoveryCodeParams{
		UserID:     userID,
		CodeHash:   codeHash,
		ConsumedAt: pgTimestamptz(now),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return errNotFound
	}
	return err
}

func (r *IdentityRepo) DeleteConfirmedMFA(ctx context.Context, tx pgx.Tx, userID string) error {
	return r.queries(tx).DeleteConfirmedMFAFactors(ctx, userID)
}

func (r *IdentityRepo) UpdateUserEmail(ctx context.Context, tx pgx.Tx, userID, emailNorm, emailDisplay string, now time.Time) error {
	return r.queries(tx).UpdateUserEmail(ctx, gen.UpdateUserEmailParams{
		ID:              userID,
		EmailNormalized: emailNorm,
		EmailDisplay:    emailDisplay,
		UpdatedAt:       now,
	})
}

func (r *IdentityRepo) GetChallengeByID(ctx context.Context, id string) (auth.Challenge, error) {
	row, err := r.q.GetChallengeByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return auth.Challenge{}, errNotFound
		}
		return auth.Challenge{}, err
	}
	return mapChallenge(row), nil
}

func (r *IdentityRepo) InsertProfile(ctx context.Context, tx pgx.Tx, p auth.Profile) error {
	return r.queries(tx).InsertUserProfile(ctx, gen.InsertUserProfileParams{
		UserID:      p.UserID,
		DisplayName: p.DisplayName,
		Phone:       p.Phone,
		Locale:      p.Locale,
		Timezone:    p.Timezone,
		AvatarRef:   p.AvatarRef,
		Version:     p.Version,
		UpdatedAt:   p.UpdatedAt,
	})
}

func (r *IdentityRepo) GetProfile(ctx context.Context, userID string) (auth.Profile, error) {
	row, err := r.q.GetUserProfile(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return auth.Profile{}, errNotFound
		}
		return auth.Profile{}, err
	}
	return mapProfile(row), nil
}

func (r *IdentityRepo) UpdateProfileOptimistic(ctx context.Context, tx pgx.Tx, userID string, expectedVersion int64, p auth.Profile, now time.Time) (auth.Profile, error) {
	row, err := r.queries(tx).UpdateUserProfileOptimistic(ctx, gen.UpdateUserProfileOptimisticParams{
		UserID:      userID,
		DisplayName: p.DisplayName,
		Phone:       p.Phone,
		Locale:      p.Locale,
		Timezone:    p.Timezone,
		AvatarRef:   p.AvatarRef,
		UpdatedAt:   now,
		Version:     expectedVersion,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return auth.Profile{}, errNotFound
		}
		return auth.Profile{}, err
	}
	return mapProfile(row), nil
}

func (r *IdentityRepo) InsertEmailChangeRequest(ctx context.Context, tx pgx.Tx, req auth.EmailChangeRequest) error {
	return r.queries(tx).InsertEmailChangeRequest(ctx, gen.InsertEmailChangeRequestParams{
		ID:                      req.ID,
		UserID:                  req.UserID,
		NewEmailNormalized:      req.NewEmailNormalized,
		NewEmailDisplay:         req.NewEmailDisplay,
		CurrentProofChallengeID: req.CurrentProofChallengeID,
		NewProofChallengeID:     req.NewProofChallengeID,
		CurrentConfirmedAt:      timePtrToPg(req.CurrentConfirmedAt),
		NewConfirmedAt:          timePtrToPg(req.NewConfirmedAt),
		Status:                  string(req.Status),
		CreatedAt:               req.CreatedAt,
		CompletedAt:             timePtrToPg(req.CompletedAt),
	})
}

func (r *IdentityRepo) GetPendingEmailChange(ctx context.Context, userID string) (auth.EmailChangeRequest, error) {
	row, err := r.q.GetPendingEmailChangeByUser(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return auth.EmailChangeRequest{}, errNotFound
		}
		return auth.EmailChangeRequest{}, err
	}
	return mapEmailChange(row), nil
}

func (r *IdentityRepo) GetEmailChangeByID(ctx context.Context, id string) (auth.EmailChangeRequest, error) {
	row, err := r.q.GetEmailChangeByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return auth.EmailChangeRequest{}, errNotFound
		}
		return auth.EmailChangeRequest{}, err
	}
	return mapEmailChange(row), nil
}

func (r *IdentityRepo) GetEmailChangeByCurrentChallenge(ctx context.Context, challengeID string) (auth.EmailChangeRequest, error) {
	row, err := r.q.GetEmailChangeByCurrentChallenge(ctx, challengeID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return auth.EmailChangeRequest{}, errNotFound
		}
		return auth.EmailChangeRequest{}, err
	}
	return mapEmailChange(row), nil
}

func (r *IdentityRepo) GetEmailChangeByNewChallenge(ctx context.Context, challengeID string) (auth.EmailChangeRequest, error) {
	row, err := r.q.GetEmailChangeByNewChallenge(ctx, challengeID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return auth.EmailChangeRequest{}, errNotFound
		}
		return auth.EmailChangeRequest{}, err
	}
	return mapEmailChange(row), nil
}

func (r *IdentityRepo) MarkEmailChangeCurrentConfirmed(ctx context.Context, tx pgx.Tx, id string, now time.Time) (auth.EmailChangeRequest, error) {
	row, err := r.queries(tx).MarkEmailChangeCurrentConfirmed(ctx, gen.MarkEmailChangeCurrentConfirmedParams{
		ID:                 id,
		CurrentConfirmedAt: pgTimestamptz(now),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return auth.EmailChangeRequest{}, errNotFound
		}
		return auth.EmailChangeRequest{}, err
	}
	return mapEmailChange(row), nil
}

func (r *IdentityRepo) MarkEmailChangeNewConfirmed(ctx context.Context, tx pgx.Tx, id string, now time.Time) (auth.EmailChangeRequest, error) {
	row, err := r.queries(tx).MarkEmailChangeNewConfirmed(ctx, gen.MarkEmailChangeNewConfirmedParams{
		ID:             id,
		NewConfirmedAt: pgTimestamptz(now),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return auth.EmailChangeRequest{}, errNotFound
		}
		return auth.EmailChangeRequest{}, err
	}
	return mapEmailChange(row), nil
}

func (r *IdentityRepo) CompleteEmailChange(ctx context.Context, tx pgx.Tx, id string, now time.Time) (auth.EmailChangeRequest, error) {
	row, err := r.queries(tx).CompleteEmailChangeRequest(ctx, gen.CompleteEmailChangeRequestParams{
		ID:          id,
		CompletedAt: pgTimestamptz(now),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return auth.EmailChangeRequest{}, errNotFound
		}
		return auth.EmailChangeRequest{}, err
	}
	return mapEmailChange(row), nil
}

func (r *IdentityRepo) CancelPendingEmailChanges(ctx context.Context, tx pgx.Tx, userID string, now time.Time) error {
	return r.queries(tx).CancelPendingEmailChanges(ctx, gen.CancelPendingEmailChangesParams{
		UserID:      userID,
		CompletedAt: pgTimestamptz(now),
	})
}

func (r *IdentityRepo) CountPendingEmailChangeForEmail(ctx context.Context, emailNorm, excludeUserID string) (int64, error) {
	return r.q.CountPendingEmailChangeForEmail(ctx, gen.CountPendingEmailChangeForEmailParams{
		NewEmailNormalized: emailNorm,
		UserID:             excludeUserID,
	})
}

func (r *IdentityRepo) UpsertNotificationPref(ctx context.Context, tx pgx.Tx, userID string, p auth.NotificationPref) error {
	return r.queries(tx).UpsertNotificationPref(ctx, gen.UpsertNotificationPrefParams{
		UserID:    userID,
		EventCode: string(p.EventCode),
		Channel:   string(p.Channel),
		Enabled:   p.Enabled,
		UpdatedAt: p.UpdatedAt,
	})
}

func (r *IdentityRepo) ListNotificationPrefs(ctx context.Context, userID string) ([]auth.NotificationPref, error) {
	rows, err := r.q.ListNotificationPrefs(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := make([]auth.NotificationPref, 0, len(rows))
	for _, row := range rows {
		out = append(out, auth.NotificationPref{
			EventCode: auth.NotificationEventCode(row.EventCode),
			Channel:   auth.NotificationChannel(row.Channel),
			Enabled:   row.Enabled,
			Mandatory: auth.IsMandatoryEvent(auth.NotificationEventCode(row.EventCode)),
			UpdatedAt: row.UpdatedAt,
		})
	}
	return out, nil
}

func mapProfile(p gen.UserProfile) auth.Profile {
	return auth.Profile{
		UserID:      p.UserID,
		DisplayName: p.DisplayName,
		Phone:       p.Phone,
		Locale:      p.Locale,
		Timezone:    p.Timezone,
		AvatarRef:   p.AvatarRef,
		Version:     p.Version,
		UpdatedAt:   p.UpdatedAt,
	}
}

func mapEmailChange(r gen.EmailChangeRequest) auth.EmailChangeRequest {
	out := auth.EmailChangeRequest{
		ID:                      r.ID,
		UserID:                  r.UserID,
		NewEmailNormalized:      r.NewEmailNormalized,
		NewEmailDisplay:         r.NewEmailDisplay,
		CurrentProofChallengeID: r.CurrentProofChallengeID,
		NewProofChallengeID:     r.NewProofChallengeID,
		Status:                  auth.EmailChangeStatus(r.Status),
		CreatedAt:               r.CreatedAt,
	}
	out.CurrentConfirmedAt = pgToTimePtr(r.CurrentConfirmedAt)
	out.NewConfirmedAt = pgToTimePtr(r.NewConfirmedAt)
	out.CompletedAt = pgToTimePtr(r.CompletedAt)
	return out
}

func mapUser(u gen.User) auth.User {
	out := auth.User{
		ID:              u.ID,
		EmailNormalized: u.EmailNormalized,
		EmailDisplay:    u.EmailDisplay,
		Name:            u.Name,
		Status:          auth.UserStatus(u.Status),
		MFAEnabled:      u.MfaEnabled,
		CreatedAt:       u.CreatedAt,
		UpdatedAt:       u.UpdatedAt,
	}
	if u.PasswordHash != nil {
		out.PasswordHash = *u.PasswordHash
	}
	out.EmailVerifiedAt = pgToTimePtr(u.EmailVerifiedAt)
	out.LastLoginAt = pgToTimePtr(u.LastLoginAt)
	return out
}

func mapSession(s gen.AuthSession) auth.Session {
	out := auth.Session{
		ID:                s.ID,
		UserID:            s.UserID,
		Surface:           auth.Surface(s.Surface),
		TokenHash:         s.TokenHash,
		ExpiresAt:         s.ExpiresAt,
		LastSeenAt:        s.LastSeenAt,
		AbsoluteExpiresAt: s.AbsoluteExpiresAt,
		CSRFTokenHash:     s.CsrfTokenHash,
		CreatedAt:         s.CreatedAt,
	}
	out.RevokedAt = pgToTimePtr(s.RevokedAt)
	out.MFAVerifiedAt = pgToTimePtr(s.MfaVerifiedAt)
	if s.IpHash != nil {
		out.IPHash = *s.IpHash
	}
	if s.UaHash != nil {
		out.UAHash = *s.UaHash
	}
	if s.DeviceLabel != nil {
		out.DeviceLabel = *s.DeviceLabel
	}
	return out
}

func mapChallenge(c gen.AuthChallenge) auth.Challenge {
	return auth.Challenge{
		ID:          c.ID,
		UserID:      c.UserID,
		Purpose:     auth.ChallengePurpose(c.Purpose),
		TokenHash:   c.TokenHash,
		Audience:    c.Audience,
		ExpiresAt:   c.ExpiresAt,
		ConsumedAt:  pgToTimePtr(c.ConsumedAt),
		Attempts:    int(c.Attempts),
		MaxAttempts: int(c.MaxAttempts),
		Payload:     c.Payload,
		CreatedAt:   c.CreatedAt,
	}
}

func mapFactor(f gen.MfaFactor) auth.MFAFactor {
	return auth.MFAFactor{
		ID:          f.ID,
		UserID:      f.UserID,
		FactorType:  f.FactorType,
		SecretEnc:   f.SecretEnc,
		Label:       f.Label,
		ConfirmedAt: pgToTimePtr(f.ConfirmedAt),
		CreatedAt:   f.CreatedAt,
	}
}

func pgTimestamptz(t time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: t.UTC(), Valid: true}
}

func timePtrToPg(t *time.Time) pgtype.Timestamptz {
	if t == nil {
		return pgtype.Timestamptz{}
	}
	return pgTimestamptz(*t)
}

func pgToTimePtr(t pgtype.Timestamptz) *time.Time {
	if !t.Valid {
		return nil
	}
	tt := t.Time.UTC()
	return &tt
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
