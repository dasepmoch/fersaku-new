package handlers

import (
	"net/http"
	"strings"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/decode"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/stores"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// OnboardingHandler serves §7.3 onboarding routes (BE-200).
type OnboardingHandler struct {
	Svc *application.OnboardingService
}

// Get is GET /v1/onboarding
func (h *OnboardingHandler) Get(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Onboarding unavailable"))
		return
	}
	prog, err := h.Svc.GetProgress(r.Context(), p.SubjectID)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, progressDTO(prog))
}

// CreateStore is POST /v1/onboarding/store (idempotent).
func (h *OnboardingHandler) CreateStore(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Onboarding unavailable"))
		return
	}
	var body struct {
		Name        string `json:"name"`
		Bio         string `json:"bio"`
		Slug        string `json:"slug"`
		Address     string `json:"address"`
		AccentColor string `json:"accentColor"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	prog, err := h.Svc.CreateStore(r.Context(), p.SubjectID, application.CreateStoreInput{
		Name:        body.Name,
		Bio:         body.Bio,
		Slug:        body.Slug,
		Address:     body.Address,
		AccentColor: body.AccentColor,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, progressDTO(prog))
}

// PatchStore is PATCH /v1/onboarding/store
func (h *OnboardingHandler) PatchStore(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Onboarding unavailable"))
		return
	}
	var body struct {
		Name        *string `json:"name"`
		Bio         *string `json:"bio"`
		Slug        *string `json:"slug"`
		Address     *string `json:"address"`
		AccentColor *string `json:"accentColor"`
		Step        *string `json:"step"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	prog, err := h.Svc.PatchStore(r.Context(), p.SubjectID, application.PatchStoreInput{
		Name:        body.Name,
		Bio:         body.Bio,
		Slug:        body.Slug,
		Address:     body.Address,
		AccentColor: body.AccentColor,
		Step:        body.Step,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, progressDTO(prog))
}

// Complete is POST /v1/onboarding/complete
func (h *OnboardingHandler) Complete(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Onboarding unavailable"))
		return
	}
	// Product is always optional; body may be empty or { "skipProduct": true }.
	skip := true
	if r.Header.Get("Content-Type") != "" || (r.ContentLength > 0) {
		var body struct {
			SkipProduct *bool `json:"skipProduct"`
		}
		if err := decode.DecodeJSON(r, &body); err == nil && body.SkipProduct != nil {
			skip = *body.SkipProduct
		}
	}
	prog, err := h.Svc.Complete(r.Context(), p.SubjectID, skip)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, progressDTO(prog))
}

// SlugAvailability is GET /v1/stores/slug-availability?slug=
func (h *OnboardingHandler) SlugAvailability(w http.ResponseWriter, r *http.Request) {
	raw := strings.TrimSpace(r.URL.Query().Get("slug"))
	if raw == "" {
		presenters.WriteAppError(w, r, apperr.Validation(apperr.CodeValidationFailed, "slug query parameter is required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Onboarding unavailable"))
		return
	}
	userID := ""
	if p, ok := reqctx.PrincipalFrom(r.Context()); ok {
		userID = p.SubjectID
	}
	norm, available, err := h.Svc.SlugAvailability(r.Context(), userID, raw)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"slug":      norm,
		"available": available,
	})
}

func progressDTO(p stores.Progress) map[string]any {
	out := map[string]any{
		"state":           string(p.State),
		"step":            string(p.Step),
		"completed":       p.Completed,
		"merchantId":      p.MerchantID,
		"storeId":         p.StoreID,
		"canComplete":     p.CanComplete,
		"productOptional": p.ProductOptional,
		"progress":        p.Progress,
	}
	if p.CompletedAt != nil {
		out["completedAt"] = p.CompletedAt.UTC().Format("2006-01-02T15:04:05Z07:00")
	}
	if p.Store != nil {
		out["store"] = p.Store
	}
	return out
}
