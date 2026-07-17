package handlers

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/decode"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// BuyerHandler serves §7.11 buyer profile/sessions/purchases (BE-430).
// Profile and sessions thin-wrap AuthService; purchases use BuyerService ownership.
type BuyerHandler struct {
	Buyer *application.BuyerService
	Auth  *application.AuthService
}

func (h *BuyerHandler) GetProfile(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, auth.ErrUnauthenticated)
		return
	}
	if h.Auth == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Profile unavailable"))
		return
	}
	view, err := h.Auth.GetProfile(r.Context(), p.SubjectID)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, view)
}

func (h *BuyerHandler) PatchProfile(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, auth.ErrUnauthenticated)
		return
	}
	if h.Auth == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Profile unavailable"))
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

func (h *BuyerHandler) ListSessions(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, auth.ErrUnauthenticated)
		return
	}
	if h.Auth == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Sessions unavailable"))
		return
	}
	list, err := h.Auth.ListSessions(r.Context(), p.SubjectID, p.SessionID)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"sessions": list})
}

func (h *BuyerHandler) RevokeSession(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, auth.ErrUnauthenticated)
		return
	}
	if h.Auth == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Sessions unavailable"))
		return
	}
	sid := chi.URLParam(r, "sessionId")
	if err := h.Auth.RevokeSession(r.Context(), p.SubjectID, sid); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	if sid == p.SessionID {
		clearSessionCookie(w, h.Auth)
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"revoked": true})
}

func (h *BuyerHandler) RevokeOthers(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, auth.ErrUnauthenticated)
		return
	}
	if h.Auth == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Sessions unavailable"))
		return
	}
	n, err := h.Auth.RevokeOthers(r.Context(), p.SubjectID, p.SessionID)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"revokedCount": n})
}

func (h *BuyerHandler) RevokeAll(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, auth.ErrUnauthenticated)
		return
	}
	if h.Auth == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Sessions unavailable"))
		return
	}
	n, err := h.Auth.RevokeAll(r.Context(), p.SubjectID)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	clearSessionCookie(w, h.Auth)
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"revokedCount": n})
}

func clearSessionCookie(w http.ResponseWriter, authSvc *application.AuthService) {
	if authSvc == nil {
		return
	}
	// Mirror AuthHandler.clearSessionCookie via empty expire cookie name from config.
	name := "fersaku_session"
	if authSvc.Config.SessionCookieName != "" {
		name = authSvc.Config.SessionCookieName
	}
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   authSvc.Config.SecureCookie,
		SameSite: http.SameSiteLaxMode,
	})
}

func (h *BuyerHandler) ListPurchases(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Buyer == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Purchases unavailable"))
		return
	}
	limit := 0
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil {
			limit = n
		}
	}
	items, next, hasMore, err := h.Buyer.ListPurchases(r.Context(), p.SubjectID, r.URL.Query().Get("cursor"), limit)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteList(w, r, http.StatusOK, items, next, hasMore)
}

func (h *BuyerHandler) GetPurchase(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Buyer == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Purchases unavailable"))
		return
	}
	detail, err := h.Buyer.GetPurchase(r.Context(), p.SubjectID, chi.URLParam(r, "orderId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, detail)
}
