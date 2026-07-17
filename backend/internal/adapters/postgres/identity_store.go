package postgres

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
)

// IdentityStore adapts IdentityRepo to application.IdentityStore without leaking pgx to application.
// Transaction scope is stored on a context key for nested calls inside WithTx.
type IdentityStore struct {
	Repo *IdentityRepo
}

type txKey struct{}

func (s IdentityStore) tx(ctx context.Context) pgx.Tx {
	if v := ctx.Value(txKey{}); v != nil {
		if tx, ok := v.(pgx.Tx); ok {
			return tx
		}
	}
	return nil
}

func (s IdentityStore) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	return s.Repo.WithTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		return fn(context.WithValue(ctx, txKey{}, tx))
	})
}

func (s IdentityStore) InsertUser(ctx context.Context, u auth.User) error {
	return s.Repo.InsertUser(ctx, s.tx(ctx), u)
}

func (s IdentityStore) GetUserByID(ctx context.Context, id string) (auth.User, error) {
	return s.Repo.GetUserByID(ctx, id)
}

func (s IdentityStore) GetUserByEmail(ctx context.Context, emailNorm string) (auth.User, error) {
	return s.Repo.GetUserByEmail(ctx, emailNorm)
}

func (s IdentityStore) UpdatePassword(ctx context.Context, userID, hash string, now time.Time) error {
	return s.Repo.UpdatePassword(ctx, s.tx(ctx), userID, hash, now)
}

func (s IdentityStore) MarkEmailVerified(ctx context.Context, userID string, now time.Time) error {
	return s.Repo.MarkEmailVerified(ctx, s.tx(ctx), userID, now)
}

func (s IdentityStore) SetMFAEnabled(ctx context.Context, userID string, enabled bool, now time.Time) error {
	return s.Repo.SetMFAEnabled(ctx, s.tx(ctx), userID, enabled, now)
}

func (s IdentityStore) TouchLastLogin(ctx context.Context, userID string, now time.Time) error {
	return s.Repo.TouchLastLogin(ctx, s.tx(ctx), userID, now)
}

func (s IdentityStore) InsertSession(ctx context.Context, sess auth.Session) error {
	return s.Repo.InsertSession(ctx, s.tx(ctx), sess)
}

func (s IdentityStore) GetSessionByTokenHash(ctx context.Context, hash string) (auth.Session, error) {
	return s.Repo.GetSessionByTokenHash(ctx, hash)
}

func (s IdentityStore) GetSessionByID(ctx context.Context, id string) (auth.Session, error) {
	return s.Repo.GetSessionByID(ctx, id)
}

func (s IdentityStore) ListSessions(ctx context.Context, userID string, now time.Time) ([]auth.Session, error) {
	return s.Repo.ListSessions(ctx, userID, now)
}

func (s IdentityStore) RevokeSession(ctx context.Context, sessionID, userID string, now time.Time) (int64, error) {
	return s.Repo.RevokeSession(ctx, s.tx(ctx), sessionID, userID, now)
}

func (s IdentityStore) RevokeOtherSessions(ctx context.Context, userID, keepID string, now time.Time) (int64, error) {
	return s.Repo.RevokeOtherSessions(ctx, s.tx(ctx), userID, keepID, now)
}

func (s IdentityStore) RevokeAllSessions(ctx context.Context, userID string, now time.Time) (int64, error) {
	return s.Repo.RevokeAllSessions(ctx, s.tx(ctx), userID, now)
}

func (s IdentityStore) TouchSession(ctx context.Context, sessionID string, lastSeen, idleExpires time.Time) error {
	return s.Repo.TouchSession(ctx, sessionID, lastSeen, idleExpires)
}

func (s IdentityStore) UpdateSessionCSRFHash(ctx context.Context, sessionID, csrfHash string) error {
	return s.Repo.UpdateSessionCSRFHash(ctx, sessionID, csrfHash)
}

func (s IdentityStore) SetSessionMFAVerified(ctx context.Context, sessionID string, at time.Time) error {
	return s.Repo.SetSessionMFAVerified(ctx, s.tx(ctx), sessionID, at)
}

func (s IdentityStore) InsertChallenge(ctx context.Context, c auth.Challenge) error {
	return s.Repo.InsertChallenge(ctx, s.tx(ctx), c)
}

func (s IdentityStore) ConsumeChallenge(ctx context.Context, purpose auth.ChallengePurpose, tokenHash string, now time.Time) (auth.Challenge, error) {
	return s.Repo.ConsumeChallenge(ctx, s.tx(ctx), purpose, tokenHash, now)
}

func (s IdentityStore) InvalidateOpenChallenges(ctx context.Context, userID string, purpose auth.ChallengePurpose, now time.Time) error {
	return s.Repo.InvalidateOpenChallenges(ctx, s.tx(ctx), userID, purpose, now)
}

func (s IdentityStore) InsertMFAFactor(ctx context.Context, f auth.MFAFactor) error {
	return s.Repo.InsertMFAFactor(ctx, s.tx(ctx), f)
}

func (s IdentityStore) GetPendingMFAFactor(ctx context.Context, userID string) (auth.MFAFactor, error) {
	return s.Repo.GetPendingMFAFactor(ctx, userID)
}

func (s IdentityStore) GetConfirmedMFAFactor(ctx context.Context, userID string) (auth.MFAFactor, error) {
	return s.Repo.GetConfirmedMFAFactor(ctx, userID)
}

func (s IdentityStore) ConfirmMFAFactor(ctx context.Context, factorID, userID string, now time.Time) error {
	return s.Repo.ConfirmMFAFactor(ctx, s.tx(ctx), factorID, userID, now)
}

func (s IdentityStore) DeleteUnconfirmedMFA(ctx context.Context, userID string) error {
	return s.Repo.DeleteUnconfirmedMFA(ctx, s.tx(ctx), userID)
}

func (s IdentityStore) ReplaceRecoveryCodes(ctx context.Context, userID string, ids, hashes []string, now time.Time) error {
	return s.Repo.ReplaceRecoveryCodes(ctx, s.tx(ctx), userID, ids, hashes, now)
}

func (s IdentityStore) ConsumeRecoveryCode(ctx context.Context, userID, codeHash string, now time.Time) error {
	return s.Repo.ConsumeRecoveryCode(ctx, s.tx(ctx), userID, codeHash, now)
}

func (s IdentityStore) IsNotFound(err error) bool {
	return IsNotFound(err)
}

func (s IdentityStore) UpdateUserEmail(ctx context.Context, userID, emailNorm, emailDisplay string, now time.Time) error {
	return s.Repo.UpdateUserEmail(ctx, s.tx(ctx), userID, emailNorm, emailDisplay, now)
}

func (s IdentityStore) GetChallengeByID(ctx context.Context, id string) (auth.Challenge, error) {
	return s.Repo.GetChallengeByID(ctx, id)
}

func (s IdentityStore) DeleteConfirmedMFA(ctx context.Context, userID string) error {
	return s.Repo.DeleteConfirmedMFA(ctx, s.tx(ctx), userID)
}

func (s IdentityStore) InsertProfile(ctx context.Context, p auth.Profile) error {
	return s.Repo.InsertProfile(ctx, s.tx(ctx), p)
}

func (s IdentityStore) GetProfile(ctx context.Context, userID string) (auth.Profile, error) {
	return s.Repo.GetProfile(ctx, userID)
}

func (s IdentityStore) UpdateProfileOptimistic(ctx context.Context, userID string, expectedVersion int64, p auth.Profile, now time.Time) (auth.Profile, error) {
	return s.Repo.UpdateProfileOptimistic(ctx, s.tx(ctx), userID, expectedVersion, p, now)
}

func (s IdentityStore) InsertEmailChangeRequest(ctx context.Context, r auth.EmailChangeRequest) error {
	return s.Repo.InsertEmailChangeRequest(ctx, s.tx(ctx), r)
}

func (s IdentityStore) GetPendingEmailChange(ctx context.Context, userID string) (auth.EmailChangeRequest, error) {
	return s.Repo.GetPendingEmailChange(ctx, userID)
}

func (s IdentityStore) GetEmailChangeByID(ctx context.Context, id string) (auth.EmailChangeRequest, error) {
	return s.Repo.GetEmailChangeByID(ctx, id)
}

func (s IdentityStore) GetEmailChangeByCurrentChallenge(ctx context.Context, challengeID string) (auth.EmailChangeRequest, error) {
	return s.Repo.GetEmailChangeByCurrentChallenge(ctx, challengeID)
}

func (s IdentityStore) GetEmailChangeByNewChallenge(ctx context.Context, challengeID string) (auth.EmailChangeRequest, error) {
	return s.Repo.GetEmailChangeByNewChallenge(ctx, challengeID)
}

func (s IdentityStore) MarkEmailChangeCurrentConfirmed(ctx context.Context, id string, now time.Time) (auth.EmailChangeRequest, error) {
	return s.Repo.MarkEmailChangeCurrentConfirmed(ctx, s.tx(ctx), id, now)
}

func (s IdentityStore) MarkEmailChangeNewConfirmed(ctx context.Context, id string, now time.Time) (auth.EmailChangeRequest, error) {
	return s.Repo.MarkEmailChangeNewConfirmed(ctx, s.tx(ctx), id, now)
}

func (s IdentityStore) CompleteEmailChange(ctx context.Context, id string, now time.Time) (auth.EmailChangeRequest, error) {
	return s.Repo.CompleteEmailChange(ctx, s.tx(ctx), id, now)
}

func (s IdentityStore) CancelPendingEmailChanges(ctx context.Context, userID string, now time.Time) error {
	return s.Repo.CancelPendingEmailChanges(ctx, s.tx(ctx), userID, now)
}

func (s IdentityStore) CountPendingEmailChangeForEmail(ctx context.Context, emailNorm, excludeUserID string) (int64, error) {
	return s.Repo.CountPendingEmailChangeForEmail(ctx, emailNorm, excludeUserID)
}

func (s IdentityStore) UpsertNotificationPref(ctx context.Context, userID string, p auth.NotificationPref) error {
	return s.Repo.UpsertNotificationPref(ctx, s.tx(ctx), userID, p)
}

func (s IdentityStore) ListNotificationPrefs(ctx context.Context, userID string) ([]auth.NotificationPref, error) {
	return s.Repo.ListNotificationPrefs(ctx, userID)
}
