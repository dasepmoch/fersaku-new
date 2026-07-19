package application

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// RecentMFAWindow is how recent MFA verification must be for sensitive actions.
const RecentMFAWindow = 10 * time.Minute

// ProfileView is the public profile DTO for FE adapters.
type ProfileView struct {
	UserID        string    `json:"userId"`
	Email         string    `json:"email"`
	EmailVerified bool      `json:"emailVerified"`
	DisplayName   string    `json:"displayName"`
	Name          string    `json:"name"`
	Phone         string    `json:"phone"`
	Locale        string    `json:"locale"`
	Timezone      string    `json:"timezone"`
	AvatarRef     string    `json:"avatarRef"`
	Version       int64     `json:"version"`
	MFAEnabled    bool      `json:"mfaEnabled"`
	Status        string    `json:"status"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

func (s *AuthService) GetProfile(ctx context.Context, userID string) (ProfileView, error) {
	user, err := s.Store.GetUserByID(ctx, userID)
	if err != nil {
		return ProfileView{}, auth.ErrUnauthenticated
	}
	p, err := s.Store.GetProfile(ctx, userID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			// Lazy-create default profile for pre-BE-125 users.
			now := s.now()
			p = auth.Profile{
				UserID:      userID,
				DisplayName: auth.NormalizeDisplayName(user.Name),
				Locale:      "id-ID",
				Timezone:    "Asia/Jakarta",
				Version:     1,
				UpdatedAt:   now,
			}
			if err := s.Store.InsertProfile(ctx, p); err != nil {
				// concurrent create — re-read
				p, err = s.Store.GetProfile(ctx, userID)
				if err != nil {
					return ProfileView{}, apperr.Internal(apperr.CodeInternalError, "Profile unavailable")
				}
			}
		} else {
			return ProfileView{}, apperr.Internal(apperr.CodeInternalError, "Profile unavailable")
		}
	}
	return profileView(user, p), nil
}

type PatchProfileInput struct {
	ExpectedVersion int64
	DisplayName     *string
	Phone           *string
	Locale          *string
	Timezone        *string
	AvatarRef       *string
}

func (s *AuthService) PatchProfile(ctx context.Context, userID string, in PatchProfileInput) (ProfileView, error) {
	if in.ExpectedVersion < 1 {
		return ProfileView{}, apperr.Validation(apperr.CodeValidationFailed, "expectedVersion is required")
	}
	dn, ph, loc, tz, av, err := auth.ValidateProfilePatch(in.DisplayName, in.Phone, in.Locale, in.Timezone, in.AvatarRef)
	if err != nil {
		return ProfileView{}, apperr.Validation(apperr.CodeValidationFailed, "Invalid profile fields")
	}
	cur, err := s.Store.GetProfile(ctx, userID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			_, _ = s.GetProfile(ctx, userID)
			cur, err = s.Store.GetProfile(ctx, userID)
		}
		if err != nil {
			return ProfileView{}, apperr.Internal(apperr.CodeInternalError, "Profile unavailable")
		}
	}
	next := cur
	if in.DisplayName != nil {
		next.DisplayName = dn
	}
	if in.Phone != nil {
		next.Phone = ph
	}
	if in.Locale != nil {
		next.Locale = loc
	}
	if in.Timezone != nil {
		next.Timezone = tz
	}
	if in.AvatarRef != nil {
		next.AvatarRef = av
	}
	now := s.now()
	updated, err := s.Store.UpdateProfileOptimistic(ctx, userID, in.ExpectedVersion, next, now)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return ProfileView{}, auth.ErrConflict
		}
		return ProfileView{}, apperr.Internal(apperr.CodeInternalError, "Profile update failed")
	}
	user, err := s.Store.GetUserByID(ctx, userID)
	if err != nil {
		return ProfileView{}, apperr.Internal(apperr.CodeInternalError, "Profile update failed")
	}
	return profileView(user, updated), nil
}

func profileView(u auth.User, p auth.Profile) ProfileView {
	return ProfileView{
		UserID:        u.ID,
		Email:         u.EmailDisplay,
		EmailVerified: u.EmailVerifiedAt != nil,
		DisplayName:   p.DisplayName,
		Name:          u.Name,
		Phone:         p.Phone,
		Locale:        p.Locale,
		Timezone:      p.Timezone,
		AvatarRef:     p.AvatarRef,
		Version:       p.Version,
		MFAEnabled:    u.MFAEnabled,
		Status:        string(u.Status),
		UpdatedAt:     p.UpdatedAt,
	}
}

type ChangePasswordInput struct {
	UserID          string
	SessionID       string
	CurrentPassword string
	NewPassword     string
	MFACode         string // optional when MFA enabled; required if recent MFA missing
	IP              string
	UserAgent       string
	Surface         auth.Surface
}

// ChangePasswordResult includes a rotated session for the current client.
type ChangePasswordResult struct {
	Message string
	Issue   *SessionIssue
}

func (s *AuthService) ChangePassword(ctx context.Context, in ChangePasswordInput) (ChangePasswordResult, error) {
	if len(in.NewPassword) < 8 {
		return ChangePasswordResult{}, apperr.Validation(apperr.CodeValidationFailed, "Invalid password")
	}
	user, err := s.Store.GetUserByID(ctx, in.UserID)
	if err != nil {
		return ChangePasswordResult{}, auth.ErrUnauthenticated
	}
	if user.PasswordHash == "" {
		return ChangePasswordResult{}, apperr.Validation(apperr.CodeValidationFailed, "Password change not available")
	}
	ok, _, err := auth.VerifyPassword(user.PasswordHash, in.CurrentPassword)
	if err != nil || !ok {
		return ChangePasswordResult{}, auth.ErrInvalidCredentials
	}
	// Password reuse policy: new must differ.
	same, _, _ := auth.VerifyPassword(user.PasswordHash, in.NewPassword)
	if same {
		return ChangePasswordResult{}, auth.ErrPasswordReuse
	}
	if user.MFAEnabled {
		if err := s.requireFreshMFA(ctx, in.UserID, in.SessionID, in.MFACode); err != nil {
			return ChangePasswordResult{}, err
		}
	}
	hash, err := auth.HashPassword(in.NewPassword)
	if err != nil {
		return ChangePasswordResult{}, apperr.Validation(apperr.CodeValidationFailed, "Invalid password")
	}
	now := s.now()
	err = s.Store.WithTx(ctx, func(ctx context.Context) error {
		if err := s.Store.UpdatePassword(ctx, user.ID, hash, now); err != nil {
			return err
		}
		_ = s.Store.InvalidateOpenChallenges(ctx, user.ID, auth.PurposePasswordReset, now)
		_, err := s.Store.RevokeOtherSessions(ctx, user.ID, in.SessionID, now)
		return err
	})
	if err != nil {
		return ChangePasswordResult{}, apperr.Internal(apperr.CodeInternalError, "Password change failed")
	}
	// Rotate current session token.
	_, _ = s.Store.RevokeSession(ctx, in.SessionID, user.ID, now)
	surface := in.Surface
	if surface == "" {
		surface = auth.SurfaceSeller
	}
	issue, err := s.createSession(ctx, user, surface, in.IP, in.UserAgent, !user.MFAEnabled || in.MFACode != "")
	if err != nil {
		return ChangePasswordResult{}, apperr.Internal(apperr.CodeInternalError, "Password change failed")
	}
	s.sendSecurityNotice(ctx, user.EmailNormalized, "Your password was changed")
	return ChangePasswordResult{Message: auth.MsgPasswordChanged, Issue: issue}, nil
}

type EmailChangeRequestInput struct {
	UserID   string
	NewEmail string
}

func (s *AuthService) RequestEmailChange(ctx context.Context, in EmailChangeRequestInput) (GenericResult, error) {
	newNorm := auth.NormalizeEmail(in.NewEmail)
	if newNorm == "" {
		return GenericResult{Message: auth.MsgEmailChangeRequested}, nil
	}
	user, err := s.Store.GetUserByID(ctx, in.UserID)
	if err != nil {
		return GenericResult{}, auth.ErrUnauthenticated
	}
	if newNorm == user.EmailNormalized {
		return GenericResult{}, apperr.Validation(apperr.CodeValidationFailed, "New email must differ from current")
	}
	// Collision check against users and other pending changes.
	if _, err := s.Store.GetUserByEmail(ctx, newNorm); err == nil {
		return GenericResult{}, auth.ErrEmailInUse
	} else if !s.Store.IsNotFound(err) {
		return GenericResult{}, apperr.Internal(apperr.CodeInternalError, "Email change failed")
	}
	if n, err := s.Store.CountPendingEmailChangeForEmail(ctx, newNorm, user.ID); err == nil && n > 0 {
		return GenericResult{}, auth.ErrEmailInUse
	}
	if _, err := s.Store.GetPendingEmailChange(ctx, user.ID); err == nil {
		return GenericResult{}, auth.ErrEmailChangeBusy
	} else if !s.Store.IsNotFound(err) {
		return GenericResult{}, apperr.Internal(apperr.CodeInternalError, "Email change failed")
	}

	now := s.now()
	rawCurrent, err := auth.GenerateToken(32)
	if err != nil {
		return GenericResult{}, apperr.Internal(apperr.CodeInternalError, "Email change failed")
	}
	rawNew, err := auth.GenerateToken(32)
	if err != nil {
		return GenericResult{}, apperr.Internal(apperr.CodeInternalError, "Email change failed")
	}
	uid := user.ID
	curChID := s.IDs.New()
	newChID := s.IDs.New()
	reqID := s.IDs.New()
	curCh := auth.Challenge{
		ID:          curChID,
		UserID:      &uid,
		Purpose:     auth.PurposeEmailChangeCurrent,
		TokenHash:   s.hashTok(rawCurrent),
		Audience:    reqID,
		ExpiresAt:   now.Add(ChallengeTTL),
		MaxAttempts: DefaultMaxAttempts,
		Payload:     []byte(fmt.Sprintf(`{"requestId":%q}`, reqID)),
		CreatedAt:   now,
	}
	newCh := auth.Challenge{
		ID:          newChID,
		UserID:      &uid,
		Purpose:     auth.PurposeEmailChangeNew,
		TokenHash:   s.hashTok(rawNew),
		Audience:    reqID,
		ExpiresAt:   now.Add(ChallengeTTL),
		MaxAttempts: DefaultMaxAttempts,
		Payload:     []byte(fmt.Sprintf(`{"requestId":%q,"newEmail":%q}`, reqID, newNorm)),
		CreatedAt:   now,
	}
	req := auth.EmailChangeRequest{
		ID:                      reqID,
		UserID:                  user.ID,
		NewEmailNormalized:      newNorm,
		NewEmailDisplay:         strings.TrimSpace(in.NewEmail),
		CurrentProofChallengeID: curChID,
		NewProofChallengeID:     newChID,
		Status:                  auth.EmailChangePending,
		CreatedAt:               now,
	}
	err = s.Store.WithTx(ctx, func(ctx context.Context) error {
		// Re-check uniqueness inside tx.
		if _, err := s.Store.GetUserByEmail(ctx, newNorm); err == nil {
			return auth.ErrEmailInUse
		} else if !s.Store.IsNotFound(err) {
			return err
		}
		if _, err := s.Store.GetPendingEmailChange(ctx, user.ID); err == nil {
			return auth.ErrEmailChangeBusy
		} else if !s.Store.IsNotFound(err) {
			return err
		}
		if err := s.Store.InsertChallenge(ctx, curCh); err != nil {
			return err
		}
		if err := s.Store.InsertChallenge(ctx, newCh); err != nil {
			return err
		}
		return s.Store.InsertEmailChangeRequest(ctx, req)
	})
	if err != nil {
		if ae, ok := apperr.AsAppError(err); ok {
			return GenericResult{}, ae
		}
		return GenericResult{}, apperr.Internal(apperr.CodeInternalError, "Email change failed")
	}
	s.sendChallengeEmail(ctx, user.EmailNormalized, "Confirm email change (current address)", auth.PurposeEmailChangeCurrent, rawCurrent)
	s.sendChallengeEmail(ctx, newNorm, "Confirm email change (new address)", auth.PurposeEmailChangeNew, rawNew)
	return GenericResult{Message: auth.MsgEmailChangeRequested}, nil
}

type EmailChangeConfirmInput struct {
	Token string
	// UserID optional; when authenticated, must match request owner.
	UserID string
}

type EmailChangeConfirmResult struct {
	Message  string
	Complete bool
	Issue    *SessionIssue // set when complete (sessions rotated)
	NewEmail string
}

func (s *AuthService) ConfirmEmailChangeCurrent(ctx context.Context, in EmailChangeConfirmInput) (EmailChangeConfirmResult, error) {
	return s.confirmEmailChangeProof(ctx, in, auth.PurposeEmailChangeCurrent)
}

func (s *AuthService) ConfirmEmailChangeNew(ctx context.Context, in EmailChangeConfirmInput) (EmailChangeConfirmResult, error) {
	return s.confirmEmailChangeProof(ctx, in, auth.PurposeEmailChangeNew)
}

func (s *AuthService) confirmEmailChangeProof(ctx context.Context, in EmailChangeConfirmInput, purpose auth.ChallengePurpose) (EmailChangeConfirmResult, error) {
	raw := strings.TrimSpace(in.Token)
	if raw == "" {
		return EmailChangeConfirmResult{}, auth.ErrEmailChangeInvalid
	}
	now := s.now()
	var completed bool
	var userID string
	var newEmailNorm, newEmailDisplay string
	var oldEmail string

	err := s.Store.WithTx(ctx, func(ctx context.Context) error {
		ch, err := s.Store.ConsumeChallenge(ctx, purpose, s.hashTok(raw), now)
		if err != nil {
			return auth.ErrEmailChangeInvalid
		}
		var req auth.EmailChangeRequest
		switch purpose {
		case auth.PurposeEmailChangeCurrent:
			req, err = s.Store.GetEmailChangeByCurrentChallenge(ctx, ch.ID)
		case auth.PurposeEmailChangeNew:
			req, err = s.Store.GetEmailChangeByNewChallenge(ctx, ch.ID)
		default:
			return auth.ErrEmailChangeInvalid
		}
		if err != nil || req.Status != auth.EmailChangePending {
			return auth.ErrEmailChangeInvalid
		}
		if in.UserID != "" && in.UserID != req.UserID {
			return auth.ErrEmailChangeInvalid
		}
		// Stale/mismatched purpose binding: challenge audience must match request.
		if ch.Audience != "" && ch.Audience != req.ID {
			return auth.ErrEmailChangeInvalid
		}
		if ch.UserID != nil && *ch.UserID != req.UserID {
			return auth.ErrEmailChangeInvalid
		}

		switch purpose {
		case auth.PurposeEmailChangeCurrent:
			req, err = s.Store.MarkEmailChangeCurrentConfirmed(ctx, req.ID, now)
		case auth.PurposeEmailChangeNew:
			req, err = s.Store.MarkEmailChangeNewConfirmed(ctx, req.ID, now)
		}
		if err != nil {
			return auth.ErrEmailChangeInvalid
		}

		if req.CurrentConfirmedAt != nil && req.NewConfirmedAt != nil {
			// Final uniqueness recheck before commit.
			if other, err := s.Store.GetUserByEmail(ctx, req.NewEmailNormalized); err == nil && other.ID != req.UserID {
				_ = s.Store.CancelPendingEmailChanges(ctx, req.UserID, now)
				return auth.ErrEmailInUse
			} else if err != nil && !s.Store.IsNotFound(err) {
				return err
			}
			user, err := s.Store.GetUserByID(ctx, req.UserID)
			if err != nil {
				return err
			}
			oldEmail = user.EmailNormalized
			if err := s.Store.UpdateUserEmail(ctx, req.UserID, req.NewEmailNormalized, req.NewEmailDisplay, now); err != nil {
				return err
			}
			if _, err := s.Store.CompleteEmailChange(ctx, req.ID, now); err != nil {
				return err
			}
			// Invalidate open password resets and email-change challenges for this user.
			_ = s.Store.InvalidateOpenChallenges(ctx, req.UserID, auth.PurposePasswordReset, now)
			_ = s.Store.InvalidateOpenChallenges(ctx, req.UserID, auth.PurposeEmailChangeCurrent, now)
			_ = s.Store.InvalidateOpenChallenges(ctx, req.UserID, auth.PurposeEmailChangeNew, now)
			// Revoke all sessions; caller may re-login. We also issue a new session if authenticated.
			_, _ = s.Store.RevokeAllSessions(ctx, req.UserID, now)
			completed = true
			userID = req.UserID
			newEmailNorm = req.NewEmailNormalized
			newEmailDisplay = req.NewEmailDisplay
		}
		return nil
	})
	if err != nil {
		if ae, ok := apperr.AsAppError(err); ok {
			return EmailChangeConfirmResult{}, ae
		}
		return EmailChangeConfirmResult{}, auth.ErrEmailChangeInvalid
	}
	if !completed {
		return EmailChangeConfirmResult{Message: auth.MsgEmailChangePartial, Complete: false}, nil
	}
	user, err := s.Store.GetUserByID(ctx, userID)
	if err != nil {
		return EmailChangeConfirmResult{Message: auth.MsgEmailChangeComplete, Complete: true, NewEmail: newEmailDisplay}, nil
	}
	// Notify both addresses (old + new); never log tokens.
	if oldEmail != "" {
		s.sendSecurityNotice(ctx, oldEmail, "Your account email was changed")
	}
	s.sendSecurityNotice(ctx, newEmailNorm, "Your account email was changed")
	return EmailChangeConfirmResult{
		Message:  auth.MsgEmailChangeComplete,
		Complete: true,
		NewEmail: user.EmailDisplay,
	}, nil
}

type MFADisableInput struct {
	UserID    string
	SessionID string
	Code      string
}

func (s *AuthService) MFADisable(ctx context.Context, in MFADisableInput) (GenericResult, error) {
	user, err := s.Store.GetUserByID(ctx, in.UserID)
	if err != nil {
		return GenericResult{}, auth.ErrUnauthenticated
	}
	if !user.MFAEnabled {
		return GenericResult{}, apperr.Validation(apperr.CodeValidationFailed, "MFA is not enabled")
	}
	if err := s.requireFreshMFA(ctx, in.UserID, in.SessionID, in.Code); err != nil {
		return GenericResult{}, err
	}
	now := s.now()
	err = s.Store.WithTx(ctx, func(ctx context.Context) error {
		if err := s.Store.DeleteConfirmedMFA(ctx, in.UserID); err != nil {
			return err
		}
		if err := s.Store.ReplaceRecoveryCodes(ctx, in.UserID, nil, nil, now); err != nil {
			return err
		}
		if err := s.Store.SetMFAEnabled(ctx, in.UserID, false, now); err != nil {
			return err
		}
		_, err := s.Store.RevokeOtherSessions(ctx, in.UserID, in.SessionID, now)
		return err
	})
	if err != nil {
		return GenericResult{}, apperr.Internal(apperr.CodeInternalError, "MFA disable failed")
	}
	s.sendSecurityNotice(ctx, user.EmailNormalized, "Multi-factor authentication was disabled")
	return GenericResult{Message: auth.MsgMFADisabled}, nil
}

// NotificationPrefView is one preference cell for the FE.
type NotificationPrefView struct {
	EventCode string `json:"eventCode"`
	Channel   string `json:"channel"`
	Enabled   bool   `json:"enabled"`
	Mandatory bool   `json:"mandatory"`
}

func (s *AuthService) GetNotificationPreferences(ctx context.Context, userID string) ([]NotificationPrefView, error) {
	stored, err := s.Store.ListNotificationPrefs(ctx, userID)
	if err != nil {
		return nil, apperr.Internal(apperr.CodeInternalError, "Preferences unavailable")
	}
	byKey := make(map[string]auth.NotificationPref, len(stored))
	for _, p := range stored {
		byKey[string(p.EventCode)+"|"+string(p.Channel)] = p
	}
	defaults := auth.DefaultNotificationPrefs(s.now())
	out := make([]NotificationPrefView, 0, len(defaults))
	for _, d := range defaults {
		key := string(d.EventCode) + "|" + string(d.Channel)
		enabled := d.Enabled
		if sp, ok := byKey[key]; ok {
			enabled = sp.Enabled
		}
		if d.Mandatory {
			enabled = true // never report mandatory as disabled
		}
		out = append(out, NotificationPrefView{
			EventCode: string(d.EventCode),
			Channel:   string(d.Channel),
			Enabled:   enabled,
			Mandatory: d.Mandatory,
		})
	}
	return out, nil
}

type NotificationPrefPatch struct {
	EventCode string `json:"eventCode"`
	Channel   string `json:"channel"`
	Enabled   bool   `json:"enabled"`
}

func (s *AuthService) PatchNotificationPreferences(ctx context.Context, userID string, patches []NotificationPrefPatch) ([]NotificationPrefView, error) {
	if len(patches) == 0 {
		return s.GetNotificationPreferences(ctx, userID)
	}
	now := s.now()
	for _, p := range patches {
		if !auth.ValidNotificationEvent(p.EventCode) || !auth.ValidNotificationChannel(p.Channel) {
			return nil, apperr.Validation(apperr.CodeValidationFailed, "Unknown notification event or channel")
		}
		ev := auth.NotificationEventCode(p.EventCode)
		ch := auth.NotificationChannel(p.Channel)
		if !auth.AllowedChannelForEvent(ev, ch) {
			return nil, apperr.Validation(apperr.CodeValidationFailed, "Channel not allowed for event")
		}
		if auth.IsMandatoryEvent(ev) && !p.Enabled {
			return nil, auth.ErrMandatoryPref
		}
		if err := s.Store.UpsertNotificationPref(ctx, userID, auth.NotificationPref{
			EventCode: ev,
			Channel:   ch,
			Enabled:   p.Enabled,
			Mandatory: auth.IsMandatoryEvent(ev),
			UpdatedAt: now,
		}); err != nil {
			return nil, apperr.Internal(apperr.CodeInternalError, "Preferences update failed")
		}
	}
	return s.GetNotificationPreferences(ctx, userID)
}

// requireFreshMFA verifies TOTP/recovery and/or recent session MFA proof.
func (s *AuthService) requireFreshMFA(ctx context.Context, userID, sessionID, code string) error {
	now := s.now()
	if code != "" {
		factor, err := s.Store.GetConfirmedMFAFactor(ctx, userID)
		if err == nil && auth.VerifyTOTP(factor.SecretEnc, code, now) {
			_ = s.Store.SetSessionMFAVerified(ctx, sessionID, now)
			return nil
		}
		if err := s.Store.ConsumeRecoveryCode(ctx, userID, auth.RecoveryCodeHash(code), now); err == nil {
			_ = s.Store.SetSessionMFAVerified(ctx, sessionID, now)
			return nil
		}
		return auth.ErrMFAInvalid
	}
	// No code: accept recent MFA on session.
	sess, err := s.Store.GetSessionByID(ctx, sessionID)
	if err != nil {
		return auth.ErrMFAFreshRequired
	}
	if sess.MFAVerifiedAt != nil && now.Sub(*sess.MFAVerifiedAt) <= RecentMFAWindow {
		return nil
	}
	return auth.ErrMFAFreshRequired
}

func (s *AuthService) sendSecurityNotice(ctx context.Context, to, subject string) {
	if s.Mail == nil {
		return
	}
	// No tokens/secrets in body.
	_ = s.Mail.Send(ctx, to, subject, "A security-sensitive change was made on your Fersaku account. If this was not you, contact support.")
}

// EnsureProfileOnRegister creates default profile + prefs after user insert (called from Register).
func (s *AuthService) ensureProfileAndPrefs(ctx context.Context, userID, name string, now time.Time) error {
	p := auth.Profile{
		UserID:      userID,
		DisplayName: auth.NormalizeDisplayName(name),
		Locale:      "id-ID",
		Timezone:    "Asia/Jakarta",
		Version:     1,
		UpdatedAt:   now,
	}
	if err := s.Store.InsertProfile(ctx, p); err != nil {
		return err
	}
	for _, pref := range auth.DefaultNotificationPrefs(now) {
		if err := s.Store.UpsertNotificationPref(ctx, userID, pref); err != nil {
			return err
		}
	}
	return nil
}
