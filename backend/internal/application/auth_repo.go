package application

import (
	"context"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
)

// IdentityStore is the persistence port for BE-120/BE-125 (implemented by postgres.IdentityRepo).
// Application must not import adapters; wire the implementation in app.
type IdentityStore interface {
	WithTx(ctx context.Context, fn func(ctx context.Context) error) error

	InsertUser(ctx context.Context, u auth.User) error
	GetUserByID(ctx context.Context, id string) (auth.User, error)
	GetUserByEmail(ctx context.Context, emailNorm string) (auth.User, error)
	UpdatePassword(ctx context.Context, userID, hash string, now time.Time) error
	UpdateUserEmail(ctx context.Context, userID, emailNorm, emailDisplay string, now time.Time) error
	MarkEmailVerified(ctx context.Context, userID string, now time.Time) error
	SetMFAEnabled(ctx context.Context, userID string, enabled bool, now time.Time) error
	TouchLastLogin(ctx context.Context, userID string, now time.Time) error

	InsertSession(ctx context.Context, s auth.Session) error
	GetSessionByTokenHash(ctx context.Context, hash string) (auth.Session, error)
	GetSessionByID(ctx context.Context, id string) (auth.Session, error)
	ListSessions(ctx context.Context, userID string, now time.Time) ([]auth.Session, error)
	RevokeSession(ctx context.Context, sessionID, userID string, now time.Time) (int64, error)
	RevokeOtherSessions(ctx context.Context, userID, keepID string, now time.Time) (int64, error)
	RevokeAllSessions(ctx context.Context, userID string, now time.Time) (int64, error)
	TouchSession(ctx context.Context, sessionID string, lastSeen, idleExpires time.Time) error
	// UpdateSessionCSRFHash replaces the session CSRF hash (raw token never stored).
	UpdateSessionCSRFHash(ctx context.Context, sessionID, csrfHash string) error
	SetSessionMFAVerified(ctx context.Context, sessionID string, at time.Time) error

	InsertChallenge(ctx context.Context, c auth.Challenge) error
	GetChallengeByID(ctx context.Context, id string) (auth.Challenge, error)
	ConsumeChallenge(ctx context.Context, purpose auth.ChallengePurpose, tokenHash string, now time.Time) (auth.Challenge, error)
	InvalidateOpenChallenges(ctx context.Context, userID string, purpose auth.ChallengePurpose, now time.Time) error

	InsertMFAFactor(ctx context.Context, f auth.MFAFactor) error
	GetPendingMFAFactor(ctx context.Context, userID string) (auth.MFAFactor, error)
	GetConfirmedMFAFactor(ctx context.Context, userID string) (auth.MFAFactor, error)
	ConfirmMFAFactor(ctx context.Context, factorID, userID string, now time.Time) error
	DeleteUnconfirmedMFA(ctx context.Context, userID string) error
	DeleteConfirmedMFA(ctx context.Context, userID string) error
	ReplaceRecoveryCodes(ctx context.Context, userID string, ids, hashes []string, now time.Time) error
	ConsumeRecoveryCode(ctx context.Context, userID, codeHash string, now time.Time) error

	// Profile (BE-125)
	InsertProfile(ctx context.Context, p auth.Profile) error
	GetProfile(ctx context.Context, userID string) (auth.Profile, error)
	UpdateProfileOptimistic(ctx context.Context, userID string, expectedVersion int64, p auth.Profile, now time.Time) (auth.Profile, error)

	// Dual email-change (BE-125)
	InsertEmailChangeRequest(ctx context.Context, r auth.EmailChangeRequest) error
	GetPendingEmailChange(ctx context.Context, userID string) (auth.EmailChangeRequest, error)
	GetEmailChangeByID(ctx context.Context, id string) (auth.EmailChangeRequest, error)
	GetEmailChangeByCurrentChallenge(ctx context.Context, challengeID string) (auth.EmailChangeRequest, error)
	GetEmailChangeByNewChallenge(ctx context.Context, challengeID string) (auth.EmailChangeRequest, error)
	MarkEmailChangeCurrentConfirmed(ctx context.Context, id string, now time.Time) (auth.EmailChangeRequest, error)
	MarkEmailChangeNewConfirmed(ctx context.Context, id string, now time.Time) (auth.EmailChangeRequest, error)
	CompleteEmailChange(ctx context.Context, id string, now time.Time) (auth.EmailChangeRequest, error)
	CancelPendingEmailChanges(ctx context.Context, userID string, now time.Time) error
	CountPendingEmailChangeForEmail(ctx context.Context, emailNorm, excludeUserID string) (int64, error)

	// Notification preferences (BE-125)
	UpsertNotificationPref(ctx context.Context, userID string, p auth.NotificationPref) error
	ListNotificationPrefs(ctx context.Context, userID string) ([]auth.NotificationPref, error)

	// IsNotFound reports missing row errors from the store.
	IsNotFound(err error) bool
}
