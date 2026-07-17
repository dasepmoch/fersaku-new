package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/decode"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// AuthHandler serves /v1/auth/* (BE-120).
type AuthHandler struct {
	Auth *application.AuthService
	// CookieName defaults to fersaku_session.
	CookieName string
	Secure     bool
	// SameSite: default Lax.
	SameSiteStrict bool
	// Domains when set blocks app auth cookies on custom storefront hosts (BE-240).
	Domains *application.DomainService
}

func (h *AuthHandler) cookieName() string {
	if h.CookieName != "" {
		return h.CookieName
	}
	return "fersaku_session"
}

func (h *AuthHandler) setSessionCookie(w http.ResponseWriter, r *http.Request, rawToken string, exp time.Time) {
	// Never set app auth cookies on custom storefront hosts (BE-240).
	if h.Domains != nil && r != nil && h.Domains.IsCustomStorefrontHost(r.Host) {
		return
	}
	same := http.SameSiteLaxMode
	if h.SameSiteStrict {
		same = http.SameSiteStrictMode
	}
	http.SetCookie(w, &http.Cookie{
		Name:     h.cookieName(),
		Value:    rawToken,
		Path:     "/",
		HttpOnly: true,
		Secure:   h.Secure,
		SameSite: same,
		Expires:  exp,
		MaxAge:   int(time.Until(exp).Seconds()),
	})
}

func (h *AuthHandler) clearSessionCookie(w http.ResponseWriter) {
	same := http.SameSiteLaxMode
	if h.SameSiteStrict {
		same = http.SameSiteStrictMode
	}
	http.SetCookie(w, &http.Cookie{
		Name:     h.cookieName(),
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   h.Secure,
		SameSite: same,
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
	})
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Name     string `json:"name"`
		Surface  string `json:"surface"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	surface := auth.Surface(strings.ToUpper(strings.TrimSpace(body.Surface)))
	res, err := h.Auth.Register(r.Context(), application.RegisterInput{
		Email:    body.Email,
		Password: body.Password,
		Name:     body.Name,
		Surface:  surface,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"message": res.Message})
}

func (h *AuthHandler) VerifyEmail(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Token string `json:"token"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	res, err := h.Auth.VerifyEmail(r.Context(), application.TokenInput{Token: body.Token})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"message": res.Message})
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Surface  string `json:"surface"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	surface := auth.Surface(strings.ToUpper(strings.TrimSpace(body.Surface)))
	res, err := h.Auth.Login(r.Context(), application.LoginInput{
		Email:     body.Email,
		Password:  body.Password,
		Surface:   surface,
		IP:        reqctx.ClientIP(r.Context()),
		UserAgent: r.UserAgent(),
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	if res.Issue != nil {
		h.setSessionCookie(w, r, res.Issue.RawToken, res.Issue.ExpiresAt)
	}
	data := map[string]any{
		"mfaRequired": res.MFARequired,
	}
	if res.Issue != nil {
		data["csrfToken"] = res.Issue.CSRFToken
		data["sessionId"] = res.Issue.SessionID
		data["user"] = publicUser(res.Issue.User, res.Issue.Surface, res.Issue.MFAVerified)
	}
	if res.MFARequired {
		presenters.WriteData(w, r, http.StatusOK, data)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, data)
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	if p, ok := reqctx.PrincipalFrom(r.Context()); ok {
		_ = h.Auth.Logout(r.Context(), p.SessionID, p.SubjectID)
	}
	h.clearSessionCookie(w)
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"message": auth.MsgLogoutOK})
}

func (h *AuthHandler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email string `json:"email"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	res, err := h.Auth.ForgotPassword(r.Context(), body.Email)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"message": res.Message})
}

func (h *AuthHandler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Token       string `json:"token"`
		NewPassword string `json:"newPassword"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	res, err := h.Auth.ResetPassword(r.Context(), application.ResetPasswordInput{
		Token:       body.Token,
		NewPassword: body.NewPassword,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"message": res.Message})
}

func (h *AuthHandler) MagicLinkRequest(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email string `json:"email"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	res, err := h.Auth.RequestMagicLink(r.Context(), body.Email)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"message": res.Message})
}

func (h *AuthHandler) MagicLinkConsume(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Token string `json:"token"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	issue, err := h.Auth.ConsumeMagicLink(r.Context(), application.MagicConsumeInput{
		Token:     body.Token,
		IP:        reqctx.ClientIP(r.Context()),
		UserAgent: r.UserAgent(),
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	h.setSessionCookie(w, r, issue.RawToken, issue.ExpiresAt)
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"csrfToken": issue.CSRFToken,
		"sessionId": issue.SessionID,
		"user":      publicUser(issue.User, issue.Surface, issue.MFAVerified),
	})
}

func (h *AuthHandler) GetSession(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, auth.ErrUnauthenticated)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"userId":        p.SubjectID,
		"sessionId":     p.SessionID,
		"surface":       p.Surface,
		"email":         p.Email,
		"name":          p.Name,
		"mfaEnabled":    p.MFAEnabled,
		"mfaVerified":   p.MFAVerified,
		"emailVerified": p.EmailVerified,
		"status":        p.Status,
		"csrfToken":     p.CSRFToken,
	})
}

func (h *AuthHandler) ListSessions(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, auth.ErrUnauthenticated)
		return
	}
	list, err := h.Auth.ListSessions(r.Context(), p.SubjectID, p.SessionID)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"sessions": list})
}

func (h *AuthHandler) RevokeSession(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, auth.ErrUnauthenticated)
		return
	}
	sid := chi.URLParam(r, "sessionId")
	if err := h.Auth.RevokeSession(r.Context(), p.SubjectID, sid); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	if sid == p.SessionID {
		h.clearSessionCookie(w)
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"revoked": true})
}

func (h *AuthHandler) RevokeOthers(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, auth.ErrUnauthenticated)
		return
	}
	n, err := h.Auth.RevokeOthers(r.Context(), p.SubjectID, p.SessionID)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"revokedCount": n})
}

func (h *AuthHandler) RevokeAll(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, auth.ErrUnauthenticated)
		return
	}
	// Spec: revoke-all commits before caller clears cookie; we revoke all including current then clear.
	n, err := h.Auth.RevokeAll(r.Context(), p.SubjectID)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	h.clearSessionCookie(w)
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"revokedCount": n})
}

func (h *AuthHandler) MFAEnroll(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, auth.ErrUnauthenticated)
		return
	}
	res, err := h.Auth.MFAEnroll(r.Context(), p.SubjectID, p.Email)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, res)
}

func (h *AuthHandler) MFAConfirm(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, auth.ErrUnauthenticated)
		return
	}
	var body struct {
		Code string `json:"code"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	codes, err := h.Auth.MFAConfirm(r.Context(), p.SubjectID, body.Code)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	// Recovery codes shown once.
	w.Header().Set("Cache-Control", "no-store")
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"recoveryCodes": codes})
}

func (h *AuthHandler) MFAVerify(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, auth.ErrUnauthenticated)
		return
	}
	var body struct {
		Code string `json:"code"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	if err := h.Auth.MFAVerify(r.Context(), p.SubjectID, p.SessionID, body.Code); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"mfaVerified": true})
}

func (h *AuthHandler) MFARegenerateRecovery(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, auth.ErrUnauthenticated)
		return
	}
	var body struct {
		Code string `json:"code"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	codes, err := h.Auth.MFARegenerateRecovery(r.Context(), p.SubjectID, p.SessionID, body.Code)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"recoveryCodes": codes})
}

func (h *AuthHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, auth.ErrUnauthenticated)
		return
	}
	var body struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
		MFACode         string `json:"mfaCode"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	res, err := h.Auth.ChangePassword(r.Context(), application.ChangePasswordInput{
		UserID:          p.SubjectID,
		SessionID:       p.SessionID,
		CurrentPassword: body.CurrentPassword,
		NewPassword:     body.NewPassword,
		MFACode:         body.MFACode,
		IP:              reqctx.ClientIP(r.Context()),
		UserAgent:       r.UserAgent(),
		Surface:         auth.Surface(p.Surface),
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	if res.Issue != nil {
		h.setSessionCookie(w, r, res.Issue.RawToken, res.Issue.ExpiresAt)
	}
	data := map[string]any{"message": res.Message}
	if res.Issue != nil {
		data["csrfToken"] = res.Issue.CSRFToken
		data["sessionId"] = res.Issue.SessionID
	}
	presenters.WriteData(w, r, http.StatusOK, data)
}

func (h *AuthHandler) EmailChangeRequest(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, auth.ErrUnauthenticated)
		return
	}
	var body struct {
		NewEmail string `json:"newEmail"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	res, err := h.Auth.RequestEmailChange(r.Context(), application.EmailChangeRequestInput{
		UserID:   p.SubjectID,
		NewEmail: body.NewEmail,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"message": res.Message})
}

func (h *AuthHandler) EmailChangeConfirmCurrent(w http.ResponseWriter, r *http.Request) {
	h.emailChangeConfirm(w, r, true)
}

func (h *AuthHandler) EmailChangeConfirmNew(w http.ResponseWriter, r *http.Request) {
	h.emailChangeConfirm(w, r, false)
}

func (h *AuthHandler) emailChangeConfirm(w http.ResponseWriter, r *http.Request, current bool) {
	var body struct {
		Token string `json:"token"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	in := application.EmailChangeConfirmInput{Token: body.Token}
	if p, ok := reqctx.PrincipalFrom(r.Context()); ok {
		in.UserID = p.SubjectID
	}
	var res application.EmailChangeConfirmResult
	var err error
	if current {
		res, err = h.Auth.ConfirmEmailChangeCurrent(r.Context(), in)
	} else {
		res, err = h.Auth.ConfirmEmailChangeNew(r.Context(), in)
	}
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	if res.Complete {
		// Sessions revoked on commit; clear cookie so client re-authenticates.
		h.clearSessionCookie(w)
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"message":  res.Message,
		"complete": res.Complete,
		"newEmail": res.NewEmail,
	})
}

func (h *AuthHandler) MFADisable(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, auth.ErrUnauthenticated)
		return
	}
	var body struct {
		Code string `json:"code"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	res, err := h.Auth.MFADisable(r.Context(), application.MFADisableInput{
		UserID:    p.SubjectID,
		SessionID: p.SessionID,
		Code:      body.Code,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"message": res.Message})
}

// MeHandler serves /v1/me/* profile and preferences (BE-125).
type MeHandler struct {
	Auth *application.AuthService
}

func (h *MeHandler) GetProfile(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, auth.ErrUnauthenticated)
		return
	}
	view, err := h.Auth.GetProfile(r.Context(), p.SubjectID)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, view)
}

func (h *MeHandler) PatchProfile(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, auth.ErrUnauthenticated)
		return
	}
	var body struct {
		ExpectedVersion int64   `json:"expectedVersion"`
		DisplayName     *string `json:"displayName"`
		Phone           *string `json:"phone"`
		Locale          *string `json:"locale"`
		Timezone        *string `json:"timezone"`
		AvatarRef       *string `json:"avatarRef"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	view, err := h.Auth.PatchProfile(r.Context(), p.SubjectID, application.PatchProfileInput{
		ExpectedVersion: body.ExpectedVersion,
		DisplayName:     body.DisplayName,
		Phone:           body.Phone,
		Locale:          body.Locale,
		Timezone:        body.Timezone,
		AvatarRef:       body.AvatarRef,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, view)
}

func (h *MeHandler) GetNotificationPreferences(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, auth.ErrUnauthenticated)
		return
	}
	prefs, err := h.Auth.GetNotificationPreferences(r.Context(), p.SubjectID)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"preferences": prefs})
}

func (h *MeHandler) PatchNotificationPreferences(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, auth.ErrUnauthenticated)
		return
	}
	var body struct {
		Preferences []application.NotificationPrefPatch `json:"preferences"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	prefs, err := h.Auth.PatchNotificationPreferences(r.Context(), p.SubjectID, body.Preferences)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"preferences": prefs})
}

func publicUser(u auth.User, surface auth.Surface, mfaVerified bool) map[string]any {
	return map[string]any{
		"id":            u.ID,
		"email":         u.EmailDisplay,
		"name":          u.Name,
		"status":        string(u.Status),
		"mfaEnabled":    u.MFAEnabled,
		"emailVerified": u.EmailVerifiedAt != nil,
		"surface":       string(surface),
		"mfaVerified":   mfaVerified,
	}
}

// RequireAuth rejects unauthenticated requests (route-level).
func RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := reqctx.PrincipalFrom(r.Context()); !ok {
			presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
			return
		}
		next.ServeHTTP(w, r)
	})
}
