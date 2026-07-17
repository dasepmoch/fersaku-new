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
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// ImpersonationHandler serves BE-520 admin impersonation endpoints.
type ImpersonationHandler struct {
	Svc        *application.ImpersonationService
	CookieName string
	Secure     bool
	SameSiteStrict bool
}

func (h *ImpersonationHandler) cookieName() string {
	if h.CookieName != "" {
		return h.CookieName
	}
	return "fersaku_session"
}

func (h *ImpersonationHandler) setDerivedCookie(w http.ResponseWriter, rawToken string, exp time.Time) {
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

func (h *ImpersonationHandler) actor(r *http.Request) (reqctx.Principal, bool) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok || p.SubjectID == "" {
		return reqctx.Principal{}, false
	}
	return p, true
}

// StartForUser POST /v1/admin/users/{userId}/impersonation
func (h *ImpersonationHandler) StartForUser(w http.ResponseWriter, r *http.Request) {
	p, ok := h.actor(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if p.Impersonating {
		presenters.WriteAppError(w, r, apperr.Forbidden(apperr.CodeForbidden, "Nested impersonation is not allowed"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Impersonation unavailable"))
		return
	}
	var body struct {
		Scope          string `json:"scope"`
		Reason         string `json:"reason"`
		Ticket         string `json:"ticket"`
		TTLMinutes     int    `json:"ttlMinutes"`
		MFACode        string `json:"mfaCode"`
		IdempotencyKey string `json:"idempotencyKey"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	if body.IdempotencyKey == "" {
		body.IdempotencyKey = strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	}
	if body.MFACode == "" {
		body.MFACode = strings.TrimSpace(r.Header.Get("X-Recent-MFA-Proof"))
	}
	out, err := h.Svc.StartImpersonation(r.Context(), application.StartImpersonationInput{
		ActorAdminID:     p.SubjectID,
		ActorSessionID:   p.SessionID,
		TargetUserID:     chi.URLParam(r, "userId"),
		Scope:            body.Scope,
		Reason:           body.Reason,
		Ticket:           body.Ticket,
		TTLMinutes:       body.TTLMinutes,
		MFACode:          body.MFACode,
		IdempotencyKey:   body.IdempotencyKey,
		RequestID:        reqctx.RequestID(r.Context()),
		IP:               reqctx.ClientIP(r.Context()),
		UserAgent:        r.UserAgent(),
		ActorPermissions: p.Permissions,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	h.setDerivedCookie(w, out.RawToken, out.DerivedExpiry)
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"sessionId":     out.Session.ID,
		"banner":        out.Banner,
		"scope":         out.Session.Scope,
		"expiresAt":     out.Session.ExpiresAt.UTC().Format(time.RFC3339Nano),
		"csrfToken":     out.CSRFToken,
		"targetUserId":  out.Session.TargetUserID,
		"targetSurface": out.TargetSurface,
		"actorAdminId":  out.Session.ActorAdminID,
	})
}

// StartForMerchant POST /v1/admin/merchants/{merchantId}/impersonation
func (h *ImpersonationHandler) StartForMerchant(w http.ResponseWriter, r *http.Request) {
	p, ok := h.actor(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if p.Impersonating {
		presenters.WriteAppError(w, r, apperr.Forbidden(apperr.CodeForbidden, "Nested impersonation is not allowed"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Impersonation unavailable"))
		return
	}
	var body struct {
		Scope          string `json:"scope"`
		Reason         string `json:"reason"`
		Ticket         string `json:"ticket"`
		TTLMinutes     int    `json:"ttlMinutes"`
		MFACode        string `json:"mfaCode"`
		IdempotencyKey string `json:"idempotencyKey"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	if body.IdempotencyKey == "" {
		body.IdempotencyKey = strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	}
	if body.MFACode == "" {
		body.MFACode = strings.TrimSpace(r.Header.Get("X-Recent-MFA-Proof"))
	}
	out, err := h.Svc.StartForMerchant(r.Context(), application.StartImpersonationInput{
		ActorAdminID:     p.SubjectID,
		ActorSessionID:   p.SessionID,
		Scope:            body.Scope,
		Reason:           body.Reason,
		Ticket:           body.Ticket,
		TTLMinutes:       body.TTLMinutes,
		MFACode:          body.MFACode,
		IdempotencyKey:   body.IdempotencyKey,
		RequestID:        reqctx.RequestID(r.Context()),
		IP:               reqctx.ClientIP(r.Context()),
		UserAgent:        r.UserAgent(),
		ActorPermissions: p.Permissions,
	}, chi.URLParam(r, "merchantId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	h.setDerivedCookie(w, out.RawToken, out.DerivedExpiry)
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"sessionId":     out.Session.ID,
		"banner":        out.Banner,
		"scope":         out.Session.Scope,
		"expiresAt":     out.Session.ExpiresAt.UTC().Format(time.RFC3339Nano),
		"csrfToken":     out.CSRFToken,
		"targetUserId":  out.Session.TargetUserID,
		"targetSurface": out.TargetSurface,
		"actorAdminId":  out.Session.ActorAdminID,
	})
}

// Terminate POST /v1/admin/impersonation/{sessionId}/terminate
func (h *ImpersonationHandler) Terminate(w http.ResponseWriter, r *http.Request) {
	p, ok := h.actor(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Impersonation unavailable"))
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	_ = decode.DecodeJSON(r, &body) // reason optional
	// When terminating from derived session, actor is target; allow via derived session match.
	actorID := p.SubjectID
	if p.Impersonating && p.ImpersonationActor != "" {
		actorID = p.ImpersonationActor
	}
	row, err := h.Svc.Terminate(r.Context(), application.TerminateInput{
		ActorAdminID:    actorID,
		ActorSessionID:  p.SessionID,
		ImpersonationID: chi.URLParam(r, "sessionId"),
		Reason:          body.Reason,
		RequestID:       reqctx.RequestID(r.Context()),
		RequireActor:    true,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"sessionId": row.ID,
		"status":    row.Status,
		"endedAt":   row.EndedAt,
	})
}

// SupportUpdateStorePresentation PATCH /v1/stores/{storeId} under SUPPORT_WRITE.
// Presentation-only: name + description (mapped to store name/bio).
type SupportStoreHandler struct {
	Onboarding *application.OnboardingService
}

func (h *SupportStoreHandler) PatchPresentation(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Onboarding == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Store presentation unavailable"))
		return
	}
	var body struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
		Command     string  `json:"command"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	// Map description → bio for onboarding store patch.
	in := application.PatchStoreInput{
		Name: body.Name,
		Bio:  body.Description,
	}
	prog, err := h.Onboarding.PatchStore(r.Context(), p.SubjectID, in)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"storeId":     chi.URLParam(r, "storeId"),
		"name":        body.Name,
		"description": body.Description,
		"progress":    prog,
		"command":     "store.presentation.support_update",
	})
}
