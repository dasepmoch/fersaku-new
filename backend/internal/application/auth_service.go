package application

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// Session TTL policy (ADR-0004 / §11.1).
const (
	SessionIdleTTL     = 12 * time.Hour
	SessionAbsoluteTTL = 30 * 24 * time.Hour
	ChallengeTTL       = 30 * time.Minute
	MagicLinkTTL       = 15 * time.Minute
	DefaultMaxAttempts = 5
)

// AuthConfig tunes cookie/session secrets (from process config).
type AuthConfig struct {
	SessionCookieName string
	TokenHashSecret   string
	// SecureCookie when true sets Secure on cookies (non-local).
	SecureCookie bool
	// SameSiteStrict when true uses Strict; default Lax for storefronts.
	SameSiteStrict bool
	PublicAppBase  string
}

// AuthService implements BE-120 identity/session lifecycle.
type AuthService struct {
	Store  IdentityStore
	IDs    ports.IDGenerator
	Clock  ports.Clock
	Mail   ports.Mailer
	Log    ports.Logger
	Config AuthConfig
	// Authz optional; when set, ResolveSession loads permission cache (BE-130).
	Authz *AuthzService
	// Impersonation optional; when set, ResolveSession attaches derived-session scope (BE-520).
	Impersonation *ImpersonationService
}

// SessionIssue is returned when a new session cookie must be set.
type SessionIssue struct {
	SessionID   string
	RawToken    string
	CSRFToken   string
	ExpiresAt   time.Time
	User        auth.User
	Surface     auth.Surface
	MFAVerified bool
}

// GenericResult is a non-enumerating public response.
type GenericResult struct {
	Message string
}

type RegisterInput struct {
	Email    string
	Password string
	Name     string
	Surface  auth.Surface
}

func (s *AuthService) Register(ctx context.Context, in RegisterInput) (GenericResult, error) {
	emailNorm := auth.NormalizeEmail(in.Email)
	if emailNorm == "" || len(in.Password) < 8 {
		return GenericResult{}, apperr.Validation(apperr.CodeValidationFailed, "Invalid registration payload")
	}
	surface := in.Surface
	if surface == "" {
		surface = auth.SurfaceSeller
	}
	if !surface.Valid() || surface == auth.SurfaceAdmin {
		return GenericResult{}, apperr.Validation(apperr.CodeValidationFailed, "Invalid surface")
	}

	if _, err := s.Store.GetUserByEmail(ctx, emailNorm); err == nil {
		s.logInfo("register_existing_email")
		return GenericResult{Message: auth.MsgRegisterGeneric}, nil
	} else if !s.Store.IsNotFound(err) {
		return GenericResult{}, apperr.Internal(apperr.CodeInternalError, "Registration failed")
	}

	hash, err := auth.HashPassword(in.Password)
	if err != nil {
		return GenericResult{}, apperr.Validation(apperr.CodeValidationFailed, "Invalid password")
	}
	now := s.now()
	userID := s.IDs.New()
	user := auth.User{
		ID:              userID,
		EmailNormalized: emailNorm,
		EmailDisplay:    strings.TrimSpace(in.Email),
		PasswordHash:    hash,
		Name:            strings.TrimSpace(in.Name),
		Status:          auth.UserPendingVerification,
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	rawTok, err := auth.GenerateToken(32)
	if err != nil {
		return GenericResult{}, apperr.Internal(apperr.CodeInternalError, "Registration failed")
	}
	ch := auth.Challenge{
		ID:          s.IDs.New(),
		UserID:      &userID,
		Purpose:     auth.PurposeEmailVerify,
		TokenHash:   s.hashTok(rawTok),
		Audience:    string(surface),
		ExpiresAt:   now.Add(ChallengeTTL),
		MaxAttempts: DefaultMaxAttempts,
		Payload:     []byte(`{}`),
		CreatedAt:   now,
	}

	err = s.Store.WithTx(ctx, func(ctx context.Context) error {
		if err := s.Store.InsertUser(ctx, user); err != nil {
			return err
		}
		if err := s.ensureProfileAndPrefs(ctx, userID, user.Name, now); err != nil {
			return err
		}
		return s.Store.InsertChallenge(ctx, ch)
	})
	if err != nil {
		s.logInfo("register_tx_err")
		return GenericResult{Message: auth.MsgRegisterGeneric}, nil
	}

	s.sendChallengeEmail(ctx, emailNorm, "Verify your email", auth.PurposeEmailVerify, rawTok)
	return GenericResult{Message: auth.MsgRegisterGeneric}, nil
}

type TokenInput struct {
	Token string
}

func (s *AuthService) VerifyEmail(ctx context.Context, in TokenInput) (GenericResult, error) {
	raw := strings.TrimSpace(in.Token)
	if raw == "" {
		return GenericResult{Message: auth.MsgVerifyGeneric}, nil
	}
	now := s.now()
	_ = s.Store.WithTx(ctx, func(ctx context.Context) error {
		ch, err := s.Store.ConsumeChallenge(ctx, auth.PurposeEmailVerify, s.hashTok(raw), now)
		if err != nil {
			return err
		}
		if ch.UserID == nil {
			return fmt.Errorf("no user")
		}
		return s.Store.MarkEmailVerified(ctx, *ch.UserID, now)
	})
	return GenericResult{Message: auth.MsgVerifyGeneric}, nil
}

type LoginInput struct {
	Email     string
	Password  string
	Surface   auth.Surface
	IP        string
	UserAgent string
}

type LoginResult struct {
	Issue       *SessionIssue
	MFARequired bool
	Message     string
}

func (s *AuthService) Login(ctx context.Context, in LoginInput) (LoginResult, error) {
	emailNorm := auth.NormalizeEmail(in.Email)
	surface := in.Surface
	if surface == "" {
		surface = auth.SurfaceSeller
	}
	if emailNorm == "" || in.Password == "" || !surface.Valid() {
		return LoginResult{}, auth.ErrInvalidCredentials
	}

	user, err := s.Store.GetUserByEmail(ctx, emailNorm)
	if err != nil {
		_, _, _ = auth.VerifyPassword("$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", in.Password)
		return LoginResult{}, auth.ErrInvalidCredentials
	}
	if user.PasswordHash == "" {
		return LoginResult{}, auth.ErrInvalidCredentials
	}
	ok, needsRehash, err := auth.VerifyPassword(user.PasswordHash, in.Password)
	if err != nil || !ok {
		return LoginResult{}, auth.ErrInvalidCredentials
	}
	if user.Status == auth.UserSuspended || user.Status == auth.UserClosed {
		return LoginResult{}, auth.ErrAccountInactive
	}
	if user.Status == auth.UserPendingVerification || user.EmailVerifiedAt == nil {
		return LoginResult{}, auth.ErrEmailNotVerified
	}

	if needsRehash {
		if nh, err := auth.HashPassword(in.Password); err == nil {
			_ = s.Store.UpdatePassword(ctx, user.ID, nh, s.now())
		}
	}

	// Admin MFA enrollment is optional for local/demo (no mandatory gate at login).
	issue, err := s.createSession(ctx, user, surface, in.IP, in.UserAgent, !user.MFAEnabled)
	if err != nil {
		return LoginResult{}, apperr.Internal(apperr.CodeInternalError, "Login failed")
	}
	_ = s.Store.TouchLastLogin(ctx, user.ID, s.now())

	if user.MFAEnabled {
		return LoginResult{Issue: issue, MFARequired: true, Message: "MFA required"}, nil
	}
	return LoginResult{Issue: issue}, nil
}

func (s *AuthService) Logout(ctx context.Context, sessionID, userID string) error {
	if sessionID == "" || userID == "" {
		return nil
	}
	now := s.now()
	_ = s.Store.RevokeRecentMFAProofsForSession(ctx, sessionID, now)
	_, err := s.Store.RevokeSession(ctx, sessionID, userID, now)
	return err
}

func (s *AuthService) ForgotPassword(ctx context.Context, email string) (GenericResult, error) {
	emailNorm := auth.NormalizeEmail(email)
	if emailNorm == "" {
		return GenericResult{Message: auth.MsgForgotGeneric}, nil
	}
	user, err := s.Store.GetUserByEmail(ctx, emailNorm)
	if err != nil {
		return GenericResult{Message: auth.MsgForgotGeneric}, nil
	}
	if user.PasswordHash == "" {
		return GenericResult{Message: auth.MsgForgotGeneric}, nil
	}
	now := s.now()
	rawTok, err := auth.GenerateToken(32)
	if err != nil {
		return GenericResult{Message: auth.MsgForgotGeneric}, nil
	}
	uid := user.ID
	ch := auth.Challenge{
		ID:          s.IDs.New(),
		UserID:      &uid,
		Purpose:     auth.PurposePasswordReset,
		TokenHash:   s.hashTok(rawTok),
		Audience:    "password",
		ExpiresAt:   now.Add(ChallengeTTL),
		MaxAttempts: DefaultMaxAttempts,
		Payload:     []byte(`{}`),
		CreatedAt:   now,
	}
	_ = s.Store.WithTx(ctx, func(ctx context.Context) error {
		_ = s.Store.InvalidateOpenChallenges(ctx, user.ID, auth.PurposePasswordReset, now)
		return s.Store.InsertChallenge(ctx, ch)
	})
	s.sendChallengeEmail(ctx, emailNorm, "Reset your password", auth.PurposePasswordReset, rawTok)
	return GenericResult{Message: auth.MsgForgotGeneric}, nil
}

type ResetPasswordInput struct {
	Token       string
	NewPassword string
}

func (s *AuthService) ResetPassword(ctx context.Context, in ResetPasswordInput) (GenericResult, error) {
	raw := strings.TrimSpace(in.Token)
	if raw == "" || len(in.NewPassword) < 8 {
		return GenericResult{Message: auth.MsgResetGeneric}, nil
	}
	hash, err := auth.HashPassword(in.NewPassword)
	if err != nil {
		return GenericResult{Message: auth.MsgResetGeneric}, nil
	}
	now := s.now()
	_ = s.Store.WithTx(ctx, func(ctx context.Context) error {
		ch, err := s.Store.ConsumeChallenge(ctx, auth.PurposePasswordReset, s.hashTok(raw), now)
		if err != nil {
			return err
		}
		if ch.UserID == nil {
			return fmt.Errorf("no user")
		}
		if err := s.Store.UpdatePassword(ctx, *ch.UserID, hash, now); err != nil {
			return err
		}
		_, err = s.Store.RevokeAllSessions(ctx, *ch.UserID, now)
		return err
	})
	return GenericResult{Message: auth.MsgResetGeneric}, nil
}

func (s *AuthService) RequestMagicLink(ctx context.Context, email string) (GenericResult, error) {
	emailNorm := auth.NormalizeEmail(email)
	if emailNorm == "" {
		return GenericResult{Message: auth.MsgMagicLinkGeneric}, nil
	}
	now := s.now()
	user, err := s.Store.GetUserByEmail(ctx, emailNorm)
	if err != nil {
		return GenericResult{Message: auth.MsgMagicLinkGeneric}, nil
	}
	rawTok, err := auth.GenerateToken(32)
	if err != nil {
		return GenericResult{Message: auth.MsgMagicLinkGeneric}, nil
	}
	uid := user.ID
	ch := auth.Challenge{
		ID:          s.IDs.New(),
		UserID:      &uid,
		Purpose:     auth.PurposeMagicLink,
		TokenHash:   s.hashTok(rawTok),
		Audience:    string(auth.SurfaceBuyer),
		ExpiresAt:   now.Add(MagicLinkTTL),
		MaxAttempts: DefaultMaxAttempts,
		Payload:     []byte(`{}`),
		CreatedAt:   now,
	}
	_ = s.Store.WithTx(ctx, func(ctx context.Context) error {
		_ = s.Store.InvalidateOpenChallenges(ctx, user.ID, auth.PurposeMagicLink, now)
		return s.Store.InsertChallenge(ctx, ch)
	})
	s.sendChallengeEmail(ctx, emailNorm, "Your sign-in link", auth.PurposeMagicLink, rawTok)
	return GenericResult{Message: auth.MsgMagicLinkGeneric}, nil
}

type MagicConsumeInput struct {
	Token     string
	IP        string
	UserAgent string
}

func (s *AuthService) ConsumeMagicLink(ctx context.Context, in MagicConsumeInput) (*SessionIssue, error) {
	raw := strings.TrimSpace(in.Token)
	if raw == "" {
		return nil, auth.ErrInvalidToken
	}
	now := s.now()
	var userID string
	err := s.Store.WithTx(ctx, func(ctx context.Context) error {
		ch, err := s.Store.ConsumeChallenge(ctx, auth.PurposeMagicLink, s.hashTok(raw), now)
		if err != nil {
			return err
		}
		if ch.UserID == nil {
			return fmt.Errorf("no user")
		}
		userID = *ch.UserID
		return s.Store.MarkEmailVerified(ctx, userID, now)
	})
	if err != nil {
		return nil, auth.ErrInvalidToken
	}
	user, err := s.Store.GetUserByID(ctx, userID)
	if err != nil {
		return nil, auth.ErrInvalidToken
	}
	if user.Status == auth.UserSuspended || user.Status == auth.UserClosed {
		return nil, auth.ErrAccountInactive
	}
	issue, err := s.createSession(ctx, user, auth.SurfaceBuyer, in.IP, in.UserAgent, true)
	if err != nil {
		return nil, apperr.Internal(apperr.CodeInternalError, "Sign-in failed")
	}
	_ = s.Store.TouchLastLogin(ctx, user.ID, now)
	return issue, nil
}

func (s *AuthService) ResolveSession(ctx context.Context, rawToken string) (auth.Principal, auth.Session, error) {
	if rawToken == "" {
		return auth.Principal{}, auth.Session{}, auth.ErrUnauthenticated
	}
	now := s.now()
	sess, err := s.Store.GetSessionByTokenHash(ctx, s.hashTok(rawToken))
	if err != nil {
		return auth.Principal{}, auth.Session{}, auth.ErrUnauthenticated
	}
	if sess.RevokedAt != nil {
		return auth.Principal{}, auth.Session{}, auth.ErrSessionExpired
	}
	if !sess.ExpiresAt.After(now) || !sess.AbsoluteExpiresAt.After(now) {
		return auth.Principal{}, auth.Session{}, auth.ErrSessionExpired
	}
	user, err := s.Store.GetUserByID(ctx, sess.UserID)
	if err != nil {
		return auth.Principal{}, auth.Session{}, auth.ErrUnauthenticated
	}
	if user.Status == auth.UserSuspended || user.Status == auth.UserClosed {
		return auth.Principal{}, auth.Session{}, auth.ErrAccountInactive
	}
	idle := now.Add(SessionIdleTTL)
	if idle.After(sess.AbsoluteExpiresAt) {
		idle = sess.AbsoluteExpiresAt
	}
	_ = s.Store.TouchSession(ctx, sess.ID, now, idle)

	p := auth.Principal{
		UserID:        user.ID,
		SessionID:     sess.ID,
		Surface:       sess.Surface,
		Email:         user.EmailDisplay,
		Name:          user.Name,
		Status:        user.Status,
		MFAEnabled:    user.MFAEnabled,
		MFAVerified:   sess.MFAVerifiedAt != nil,
		EmailVerified: user.EmailVerifiedAt != nil,
	}
	if s.Authz != nil {
		if codes, err := s.Authz.LoadPermissions(ctx, user.ID); err == nil {
			p.Permissions = codes
		}
		if roles, err := s.Authz.Store.ListRoleCodesForUser(ctx, user.ID); err == nil {
			p.RoleCodes = roles
		}
	}
	// BE-520: if this auth session is a derived impersonation session, attach scope
	// and keep target permissions only (admin perms never unioned).
	if s.Impersonation != nil {
		if imp, err := s.Impersonation.ResolveDerived(ctx, sess.ID); err == nil {
			p.Impersonating = true
			p.ImpersonationID = imp.ID
			p.ImpersonationScope = imp.Scope
			p.ImpersonationActor = imp.ActorAdminID
			p.ImpersonationExpiry = imp.ExpiresAt
			// Cap absolute/idle to impersonation expiry already enforced by ResolveDerived.
		} else if !s.Impersonation.Store.IsNotFound(err) {
			// Ended/expired derived session: block immediately (do not treat as normal target session).
			return auth.Principal{}, auth.Session{}, auth.ErrSessionExpired
		}
	}
	return p, sess, nil
}

func (s *AuthService) ValidateCSRF(sess auth.Session, headerToken string) bool {
	if headerToken == "" {
		return false
	}
	return auth.EqualHash(sess.CSRFTokenHash, s.hashTok(headerToken))
}

// RotateSessionCSRF mints a new raw CSRF token for an authenticated session,
// stores only its hash, and returns the raw token once for client memory (INT-130).
// Used by GET /v1/auth/session bootstrap after hard refresh; does not rotate the session cookie.
func (s *AuthService) RotateSessionCSRF(ctx context.Context, sessionID string) (string, error) {
	if sessionID == "" {
		return "", auth.ErrUnauthenticated
	}
	csrfRaw, err := auth.GenerateToken(32)
	if err != nil {
		return "", apperr.Internal(apperr.CodeInternalError, "CSRF rotation failed")
	}
	if err := s.Store.UpdateSessionCSRFHash(ctx, sessionID, s.hashTok(csrfRaw)); err != nil {
		return "", apperr.Internal(apperr.CodeInternalError, "CSRF rotation failed")
	}
	return csrfRaw, nil
}

type SessionView struct {
	ID          string    `json:"id"`
	Surface     string    `json:"surface"`
	CreatedAt   time.Time `json:"createdAt"`
	LastSeenAt  time.Time `json:"lastSeenAt"`
	ExpiresAt   time.Time `json:"expiresAt"`
	Current     bool      `json:"current"`
	MFAVerified bool      `json:"mfaVerified"`
	DeviceLabel string    `json:"deviceLabel,omitempty"`
}

func (s *AuthService) ListSessions(ctx context.Context, userID, currentSessionID string) ([]SessionView, error) {
	rows, err := s.Store.ListSessions(ctx, userID, s.now())
	if err != nil {
		return nil, err
	}
	out := make([]SessionView, 0, len(rows))
	for _, r := range rows {
		out = append(out, SessionView{
			ID:          r.ID,
			Surface:     string(r.Surface),
			CreatedAt:   r.CreatedAt,
			LastSeenAt:  r.LastSeenAt,
			ExpiresAt:   r.ExpiresAt,
			Current:     r.ID == currentSessionID,
			MFAVerified: r.MFAVerifiedAt != nil,
			DeviceLabel: r.DeviceLabel,
		})
	}
	return out, nil
}

func (s *AuthService) RevokeSession(ctx context.Context, userID, sessionID string) error {
	n, err := s.Store.RevokeSession(ctx, sessionID, userID, s.now())
	if err != nil {
		return err
	}
	if n == 0 {
		return apperr.NotFound(apperr.CodeResourceNotFound, "Session not found")
	}
	return nil
}

func (s *AuthService) RevokeOthers(ctx context.Context, userID, keepSessionID string) (int64, error) {
	return s.Store.RevokeOtherSessions(ctx, userID, keepSessionID, s.now())
}

func (s *AuthService) RevokeAll(ctx context.Context, userID string) (int64, error) {
	return s.Store.RevokeAllSessions(ctx, userID, s.now())
}

type MFAEnrollResult struct {
	Secret     string `json:"secret"`
	OTPAuthURL string `json:"otpauthUrl"`
	FactorID   string `json:"factorId"`
}

func (s *AuthService) MFAEnroll(ctx context.Context, userID, email string) (MFAEnrollResult, error) {
	secret, err := auth.GenerateTOTPSecret()
	if err != nil {
		return MFAEnrollResult{}, apperr.Internal(apperr.CodeInternalError, "MFA enroll failed")
	}
	now := s.now()
	fid := s.IDs.New()
	err = s.Store.WithTx(ctx, func(ctx context.Context) error {
		_ = s.Store.DeleteUnconfirmedMFA(ctx, userID)
		return s.Store.InsertMFAFactor(ctx, auth.MFAFactor{
			ID:         fid,
			UserID:     userID,
			FactorType: "TOTP",
			SecretEnc:  secret,
			Label:      "Authenticator",
			CreatedAt:  now,
		})
	})
	if err != nil {
		return MFAEnrollResult{}, apperr.Internal(apperr.CodeInternalError, "MFA enroll failed")
	}
	url := fmt.Sprintf("otpauth://totp/Fersaku:%s?secret=%s&issuer=Fersaku&algorithm=SHA1&digits=6&period=30",
		email, secret)
	return MFAEnrollResult{Secret: secret, OTPAuthURL: url, FactorID: fid}, nil
}

func (s *AuthService) MFAConfirm(ctx context.Context, userID, code string) ([]string, error) {
	factor, err := s.Store.GetPendingMFAFactor(ctx, userID)
	if err != nil {
		return nil, apperr.Validation(apperr.CodeValidationFailed, "No pending MFA enrollment")
	}
	if !auth.VerifyTOTP(factor.SecretEnc, code, s.now()) {
		return nil, auth.ErrMFAInvalid
	}
	plain, hashes, err := auth.GenerateRecoveryCodes(10)
	if err != nil {
		return nil, apperr.Internal(apperr.CodeInternalError, "MFA confirm failed")
	}
	ids := make([]string, len(hashes))
	for i := range hashes {
		ids[i] = s.IDs.New()
	}
	now := s.now()
	err = s.Store.WithTx(ctx, func(ctx context.Context) error {
		if err := s.Store.ConfirmMFAFactor(ctx, factor.ID, userID, now); err != nil {
			return err
		}
		if err := s.Store.SetMFAEnabled(ctx, userID, true, now); err != nil {
			return err
		}
		return s.Store.ReplaceRecoveryCodes(ctx, userID, ids, hashes, now)
	})
	if err != nil {
		return nil, apperr.Internal(apperr.CodeInternalError, "MFA confirm failed")
	}
	return plain, nil
}

func (s *AuthService) MFAVerify(ctx context.Context, userID, sessionID, code string) error {
	_, err := s.MFAVerifyAndOptionallyMint(ctx, userID, sessionID, code, "")
	return err
}

// MFAStepUpResult is returned when verify mints a purpose-scoped recent proof.
type MFAStepUpResult struct {
	MFAVerified bool
	// RawProof is returned once; never stored. Empty when purpose omitted.
	RawProof  string
	Purpose   string
	ExpiresAt time.Time
	Factor    auth.RecentProofFactor
}

// MFAVerifyAndOptionallyMint verifies TOTP/recovery, stamps session MFA, and
// when purpose is non-empty mints a single-use opaque recent proof (INT-140).
func (s *AuthService) MFAVerifyAndOptionallyMint(ctx context.Context, userID, sessionID, code, purpose string) (MFAStepUpResult, error) {
	purpose = strings.TrimSpace(purpose)
	if purpose != "" && !auth.ValidProofPurpose(purpose) {
		return MFAStepUpResult{}, apperr.Validation(apperr.CodeValidationFailed, "Invalid recent MFA proof purpose")
	}
	now := s.now()
	user, err := s.Store.GetUserByID(ctx, userID)
	if err != nil {
		return MFAStepUpResult{}, auth.ErrUnauthenticated
	}

	// Accounts without MFA: session login is sufficient to mint a purpose proof
	// (factor=password means re-auth not required beyond existing session).
	if !user.MFAEnabled {
		if purpose == "" {
			// No-op verify for non-MFA accounts.
			return MFAStepUpResult{MFAVerified: true, Factor: auth.ProofFactorPassword}, nil
		}
		raw, exp, err := s.mintRecentProof(ctx, userID, sessionID, purpose, auth.ProofFactorPassword, now)
		if err != nil {
			return MFAStepUpResult{}, err
		}
		return MFAStepUpResult{
			MFAVerified: true,
			RawProof:    raw,
			Purpose:     purpose,
			ExpiresAt:   exp,
			Factor:      auth.ProofFactorPassword,
		}, nil
	}

	factor, err := s.Store.GetConfirmedMFAFactor(ctx, userID)
	if err == nil && auth.VerifyTOTP(factor.SecretEnc, code, now) {
		if err := s.Store.SetSessionMFAVerified(ctx, sessionID, now); err != nil {
			return MFAStepUpResult{}, apperr.Internal(apperr.CodeInternalError, "MFA verify failed")
		}
		res := MFAStepUpResult{MFAVerified: true, Factor: auth.ProofFactorTOTP}
		if purpose != "" {
			raw, exp, err := s.mintRecentProof(ctx, userID, sessionID, purpose, auth.ProofFactorTOTP, now)
			if err != nil {
				return MFAStepUpResult{}, err
			}
			res.RawProof = raw
			res.Purpose = purpose
			res.ExpiresAt = exp
		}
		return res, nil
	}
	err = s.Store.WithTx(ctx, func(ctx context.Context) error {
		if err := s.Store.ConsumeRecoveryCode(ctx, userID, auth.RecoveryCodeHash(code), now); err != nil {
			return err
		}
		return s.Store.SetSessionMFAVerified(ctx, sessionID, now)
	})
	if err != nil {
		return MFAStepUpResult{}, auth.ErrMFAInvalid
	}
	res := MFAStepUpResult{MFAVerified: true, Factor: auth.ProofFactorRecovery}
	if purpose != "" {
		raw, exp, err := s.mintRecentProof(ctx, userID, sessionID, purpose, auth.ProofFactorRecovery, now)
		if err != nil {
			return MFAStepUpResult{}, err
		}
		res.RawProof = raw
		res.Purpose = purpose
		res.ExpiresAt = exp
	}
	return res, nil
}

// MintRecentMFAProof mints a purpose-scoped proof. MFA accounts must re-prove
// TOTP/recovery; non-MFA accounts mint a session-bound proof (factor=password).
func (s *AuthService) MintRecentMFAProof(ctx context.Context, userID, sessionID, code, purpose string) (MFAStepUpResult, error) {
	purpose = strings.TrimSpace(purpose)
	if purpose == "" || !auth.ValidProofPurpose(purpose) {
		return MFAStepUpResult{}, apperr.Validation(apperr.CodeValidationFailed, "Invalid recent MFA proof purpose")
	}
	return s.MFAVerifyAndOptionallyMint(ctx, userID, sessionID, code, purpose)
}

// ConsumeRecentMFAProof validates and single-use consumes X-Recent-MFA-Proof.
func (s *AuthService) ConsumeRecentMFAProof(ctx context.Context, userID, sessionID, purpose, rawProof string) error {
	rawProof = strings.TrimSpace(rawProof)
	purpose = strings.TrimSpace(purpose)
	if rawProof == "" {
		return auth.ErrMFAProofRequired
	}
	if !auth.ValidProofPurpose(purpose) {
		return auth.ErrMFAProofPurpose
	}
	return s.Store.ConsumeRecentMFAProofByHash(ctx, userID, sessionID, purpose, s.hashTok(rawProof), s.now())
}

func (s *AuthService) mintRecentProof(ctx context.Context, userID, sessionID, purpose string, factor auth.RecentProofFactor, now time.Time) (raw string, expires time.Time, err error) {
	raw, err = auth.GenerateToken(32)
	if err != nil {
		return "", time.Time{}, apperr.Internal(apperr.CodeInternalError, "Recent MFA proof mint failed")
	}
	expires = now.Add(auth.RecentProofTTL)
	row := auth.RecentMFAProof{
		ID:        s.IDs.New(),
		UserID:    userID,
		SessionID: sessionID,
		Purpose:   purpose,
		ProofHash: s.hashTok(raw),
		Factor:    factor,
		ExpiresAt: expires,
		CreatedAt: now,
	}
	if err := s.Store.InsertRecentMFAProof(ctx, row); err != nil {
		return "", time.Time{}, apperr.Internal(apperr.CodeInternalError, "Recent MFA proof mint failed")
	}
	return raw, expires, nil
}

func (s *AuthService) MFARegenerateRecovery(ctx context.Context, userID, sessionID, code string) ([]string, error) {
	// Fresh MFA proof required (TOTP or recovery); recent session MFA alone is insufficient for regenerate.
	if strings.TrimSpace(code) == "" {
		return nil, auth.ErrMFAFreshRequired
	}
	if err := s.requireFreshMFA(ctx, userID, sessionID, code); err != nil {
		return nil, err
	}
	now := s.now()
	plain, hashes, err := auth.GenerateRecoveryCodes(10)
	if err != nil {
		return nil, apperr.Internal(apperr.CodeInternalError, "Regenerate failed")
	}
	ids := make([]string, len(hashes))
	for i := range hashes {
		ids[i] = s.IDs.New()
	}
	if err := s.Store.ReplaceRecoveryCodes(ctx, userID, ids, hashes, now); err != nil {
		return nil, apperr.Internal(apperr.CodeInternalError, "Regenerate failed")
	}
	user, _ := s.Store.GetUserByID(ctx, userID)
	if user.EmailNormalized != "" {
		s.sendSecurityNotice(ctx, user.EmailNormalized, "Recovery codes were regenerated")
	}
	return plain, nil
}

func (s *AuthService) createSession(ctx context.Context, user auth.User, surface auth.Surface, ip, ua string, mfaVerified bool) (*SessionIssue, error) {
	return s.createSessionWithExpiry(ctx, user, surface, ip, ua, mfaVerified, time.Time{})
}

// createSessionWithExpiry mints a session; when absoluteExpiry is non-zero both
// idle and absolute expiry are capped to that time (impersonation derived sessions).
func (s *AuthService) createSessionWithExpiry(ctx context.Context, user auth.User, surface auth.Surface, ip, ua string, mfaVerified bool, absoluteExpiry time.Time) (*SessionIssue, error) {
	now := s.now()
	rawTok, err := auth.GenerateToken(32)
	if err != nil {
		return nil, err
	}
	csrfRaw, err := auth.GenerateToken(32)
	if err != nil {
		return nil, err
	}
	idle := now.Add(SessionIdleTTL)
	abs := now.Add(SessionAbsoluteTTL)
	if !absoluteExpiry.IsZero() {
		if absoluteExpiry.Before(idle) {
			idle = absoluteExpiry
		}
		abs = absoluteExpiry
	}
	sess := auth.Session{
		ID:                s.IDs.New(),
		UserID:            user.ID,
		Surface:           surface,
		TokenHash:         s.hashTok(rawTok),
		ExpiresAt:         idle,
		AbsoluteExpiresAt: abs,
		LastSeenAt:        now,
		IPHash:            auth.HashIPUA(ip),
		UAHash:            auth.HashIPUA(ua),
		CSRFTokenHash:     s.hashTok(csrfRaw),
		CreatedAt:         now,
	}
	if mfaVerified {
		t := now
		sess.MFAVerifiedAt = &t
	}
	if err := s.Store.InsertSession(ctx, sess); err != nil {
		return nil, err
	}
	return &SessionIssue{
		SessionID:   sess.ID,
		RawToken:    rawTok,
		CSRFToken:   csrfRaw,
		ExpiresAt:   idle,
		User:        user,
		Surface:     surface,
		MFAVerified: mfaVerified,
	}, nil
}

func (s *AuthService) hashTok(raw string) string {
	return auth.HashTokenKeyed(raw, s.Config.TokenHashSecret)
}

func (s *AuthService) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now().UTC()
	}
	return time.Now().UTC()
}

func (s *AuthService) logInfo(msg string) {
	if s.Log != nil {
		s.Log.Info(msg)
	}
}

func (s *AuthService) sendChallengeEmail(ctx context.Context, to, subject string, purpose auth.ChallengePurpose, rawToken string) {
	if s.Mail == nil {
		return
	}
	// Token delivered for fragment exchange page only; never log raw token.
	body := fmt.Sprintf("purpose=%s\nUse the one-time token via POST body exchange only.\ntoken=%s\n", purpose, rawToken)
	_ = s.Mail.Send(ctx, to, subject, body)
}
