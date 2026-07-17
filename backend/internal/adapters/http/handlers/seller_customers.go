package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// SellerCustomerHandler serves store-scoped seller customer list/detail/notes (SEL-260).
type SellerCustomerHandler struct {
	Svc *application.SellerCustomerService
}

// ListCustomers GET /v1/stores/{storeId}/customers
func (h *SellerCustomerHandler) ListCustomers(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Customers unavailable"))
		return
	}
	storeID := chi.URLParam(r, "storeId")
	page, _ := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("page")))
	pageSize, _ := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("pageSize")))
	result, err := h.Svc.ListCustomers(r.Context(), p.SubjectID, application.SellerCustomerListFilter{
		StoreID:  storeID,
		Q:        r.URL.Query().Get("q"),
		Page:     page,
		PageSize: pageSize,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteNumberedList(w, r, http.StatusOK, result.Items, result.Page, result.PageSize, result.TotalCount, result.PageCount)
}

// GetCustomer GET /v1/stores/{storeId}/customers/{customerId}
func (h *SellerCustomerHandler) GetCustomer(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Customers unavailable"))
		return
	}
	detail, err := h.Svc.GetCustomer(r.Context(), p.SubjectID, chi.URLParam(r, "storeId"), chi.URLParam(r, "customerId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	presenters.WriteData(w, r, http.StatusOK, detail)
}

type upsertCustomerNoteBody struct {
	Body            string `json:"body"`
	ExpectedVersion *int32 `json:"expectedVersion"`
}

// UpsertNote PUT /v1/stores/{storeId}/customers/{customerId}/notes
func (h *SellerCustomerHandler) UpsertNote(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Customers unavailable"))
		return
	}
	var body upsertCustomerNoteBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		presenters.WriteAppError(w, r, apperr.Validation(apperr.CodeValidationFailed, "Invalid request body"))
		return
	}
	note, err := h.Svc.UpsertNote(r.Context(), p.SubjectID, chi.URLParam(r, "storeId"), chi.URLParam(r, "customerId"), application.UpsertSellerCustomerNoteInput{
		Body:            body.Body,
		ExpectedVersion: body.ExpectedVersion,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	presenters.WriteData(w, r, http.StatusOK, note)
}
