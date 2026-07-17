package handlers

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// AuthzHandler serves sample admin/seller authorization routes (BE-130).
type AuthzHandler struct {
	Authz *application.AuthzService
}

// AdminPing is GET /v1/admin/ping — requires admin.ping permission.
func (h *AuthzHandler) AdminPing(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"ok":          true,
		"userId":      p.SubjectID,
		"permissions": p.Permissions,
	})
}

// SellerMeMerchant is GET /v1/seller/me/merchant — requires active merchant membership.
func (h *AuthzHandler) SellerMeMerchant(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Authz == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Authorization unavailable"))
		return
	}
	m, mem, err := h.Authz.GetSellerMerchant(r.Context(), p.SubjectID)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"merchantId":     m.ID,
		"displayName":    m.DisplayName,
		"status":         string(m.Status),
		"roleInMerchant": string(mem.RoleInMerchant),
		"ownerUserId":    m.OwnerUserID,
	})
}

// SellerStoreByID is GET /v1/seller/stores/{storeId} — cross-tenant store IDs → 404.
func (h *AuthzHandler) SellerStoreByID(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Authz == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Authorization unavailable"))
		return
	}
	storeID := chi.URLParam(r, "storeId")
	st, scope, err := h.Authz.ResolveStoreMerchant(r.Context(), p.SubjectID, storeID)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"storeId":    st.ID,
		"merchantId": scope.MerchantID,
		"slug":       st.Slug,
		"name":       st.Name,
		"status":     string(st.Status),
		"canonical":  st.IsCanonical,
	})
}

// AdminMerchantsList is GET /v1/admin/merchants — rejects unscoped list without merchants.read.
// Sample route proving no unscoped admin list without permission (middleware also enforces).
func (h *AuthzHandler) AdminMerchantsList(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Authz == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Authorization unavailable"))
		return
	}
	// Defense in depth: use-case enforces scope permission even if middleware is miswired.
	if err := h.Authz.RequireScopedMerchantList(r.Context(), p.SubjectID); err != nil {
		// Prefer FORBIDDEN for missing list permission (known action, no ID enumeration).
		presenters.WriteAppError(w, r, err)
		return
	}
	// BE-130 sample: empty scoped list only; full admin read models are BE-500.
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"items":  []any{},
		"scoped": true,
	})
}

// BuyerResourceProbe is GET /v1/buyer/resources/{ownerUserId} — ownership check sample.
// Mismatched owner → 404 (cross-tenant policy).
func (h *AuthzHandler) BuyerResourceProbe(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	ownerID := chi.URLParam(r, "ownerUserId")
	if err := application.RequireBuyerOwnsResource(p.SubjectID, ownerID); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"ownerUserId": ownerID,
		"owned":       true,
	})
}