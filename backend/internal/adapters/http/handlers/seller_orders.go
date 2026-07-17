package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// SellerOrderHandler serves store-scoped seller order list/detail (SEL-250).
type SellerOrderHandler struct {
	Svc *application.SellerOrderService
}

// ListOrders GET /v1/stores/{storeId}/orders
func (h *SellerOrderHandler) ListOrders(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Orders unavailable"))
		return
	}
	storeID := chi.URLParam(r, "storeId")
	page, _ := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("page")))
	pageSize, _ := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("pageSize")))
	var from, to *time.Time
	if raw := strings.TrimSpace(r.URL.Query().Get("from")); raw != "" {
		if t, err := time.Parse(time.RFC3339, raw); err == nil {
			tt := t.UTC()
			from = &tt
		} else {
			presenters.WriteAppError(w, r, apperr.Validation(apperr.CodeValidationFailed, "Invalid from timestamp"))
			return
		}
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("to")); raw != "" {
		if t, err := time.Parse(time.RFC3339, raw); err == nil {
			tt := t.UTC()
			to = &tt
		} else {
			presenters.WriteAppError(w, r, apperr.Validation(apperr.CodeValidationFailed, "Invalid to timestamp"))
			return
		}
	}
	result, err := h.Svc.ListOrders(r.Context(), p.SubjectID, application.SellerOrderListFilter{
		StoreID:  storeID,
		Status:   r.URL.Query().Get("status"),
		Source:   r.URL.Query().Get("source"),
		Q:        r.URL.Query().Get("q"),
		From:     from,
		To:       to,
		Page:     page,
		PageSize: pageSize,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	// NumberedPageList: data is the row array; page meta on envelope.meta.
	presenters.WriteNumberedList(w, r, http.StatusOK, result.Items, result.Page, result.PageSize, result.TotalCount, result.PageCount)
}

// GetOrder GET /v1/stores/{storeId}/orders/{orderId}
func (h *SellerOrderHandler) GetOrder(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Orders unavailable"))
		return
	}
	detail, err := h.Svc.GetOrder(r.Context(), p.SubjectID, chi.URLParam(r, "storeId"), chi.URLParam(r, "orderId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	presenters.WriteData(w, r, http.StatusOK, detail)
}
