package handlers

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/decode"
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

// SellerMeMerchant is GET /v1/seller/me/merchant — seller bootstrap (INT-150).
// Returns merchant, memberships, stores, canonicalStoreId, currentStoreId.
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
	boot, err := h.Authz.GetSellerBootstrap(r.Context(), p.SubjectID)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	memberships := make([]map[string]any, 0, len(boot.Memberships))
	for _, mm := range boot.Memberships {
		memberships = append(memberships, map[string]any{
			"merchantId":     mm.MerchantID,
			"displayName":    mm.DisplayName,
			"merchantStatus": mm.MerchantStatus,
			"roleInMerchant": mm.RoleInMerchant,
			"capabilities":   mm.Capabilities,
			"storeIds":       mm.StoreIDs,
		})
	}
	stores := make([]map[string]any, 0, len(boot.Stores))
	for _, st := range boot.Stores {
		stores = append(stores, map[string]any{
			"storeId":    st.StoreID,
			"merchantId": st.MerchantID,
			"slug":       st.Slug,
			"name":       st.Name,
			"status":     st.Status,
			"canonical":  st.Canonical,
		})
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"merchantId":       boot.MerchantID,
		"displayName":      boot.DisplayName,
		"status":           boot.Status,
		"roleInMerchant":   boot.RoleInMerchant,
		"ownerUserId":      boot.OwnerUserID,
		"memberships":      memberships,
		"stores":           stores,
		"canonicalStoreId": boot.CanonicalStoreID,
		"currentStoreId":   boot.CurrentStoreID,
		"capabilities":     boot.Capabilities,
	})
}

// SellerSetCurrentStore is PUT /v1/seller/me/current-store — persist preferred store.
func (h *AuthzHandler) SellerSetCurrentStore(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Authz == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Authorization unavailable"))
		return
	}
	var body struct {
		StoreID string `json:"storeId"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	if body.StoreID == "" {
		presenters.WriteAppError(w, r, apperr.Validation(apperr.CodeValidationFailed, "storeId required"))
		return
	}
	if err := h.Authz.SetSellerPreferredStore(r.Context(), p.SubjectID, body.StoreID); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	boot, err := h.Authz.GetSellerBootstrap(r.Context(), p.SubjectID)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"currentStoreId":   boot.CurrentStoreID,
		"canonicalStoreId": boot.CanonicalStoreID,
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