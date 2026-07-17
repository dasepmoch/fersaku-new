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
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/admin"
	"github.com/dasepmoch/fersaku-new/backend/internal/platform/cursor"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// AdminReadHandler serves BE-500 permissioned admin read models.
type AdminReadHandler struct {
	Svc *application.AdminReadService
}

func (h *AdminReadHandler) requireAuth(w http.ResponseWriter, r *http.Request) bool {
	if _, ok := reqctx.PrincipalFrom(r.Context()); !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return false
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Admin reads unavailable"))
		return false
	}
	return true
}

func listFilterFrom(r *http.Request) admin.ListFilter {
	limit := admin.DefaultListLimit
	if n, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil {
		limit = int32(n)
	}
	if r.URL.Query().Get("export") == "1" || r.URL.Query().Get("export") == "true" {
		if limit <= 0 || limit > admin.ExportMaxLimit {
			limit = admin.ExportMaxLimit
		}
	}
	f := admin.ListFilter{
		Status: strings.TrimSpace(r.URL.Query().Get("status")),
		Source: strings.TrimSpace(r.URL.Query().Get("source")),
		Query:  strings.TrimSpace(r.URL.Query().Get("q")),
		Cursor: strings.TrimSpace(r.URL.Query().Get("cursor")),
		Limit:  limit,
	}
	if v := strings.TrimSpace(r.URL.Query().Get("from")); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			f.From = &t
		}
	}
	if v := strings.TrimSpace(r.URL.Query().Get("to")); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			f.To = &t
		}
	}
	return f
}

func writeList(w http.ResponseWriter, r *http.Request, data any, next *cursor.Key, hasMore bool) {
	presenters.WriteList(w, r, http.StatusOK, data, next, hasMore)
}

// Overview GET /v1/admin/overview
func (h *AdminReadHandler) Overview(w http.ResponseWriter, r *http.Request) {
	if !h.requireAuth(w, r) {
		return
	}
	o, err := h.Svc.Overview(r.Context())
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, o)
}

// PlatformVolume GET /v1/admin/overview/platform-volume
func (h *AdminReadHandler) PlatformVolume(w http.ResponseWriter, r *http.Request) {
	if !h.requireAuth(w, r) {
		return
	}
	vol, err := h.Svc.PlatformVolume(r.Context())
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	// FE expects number[] as data directly.
	presenters.WriteData(w, r, http.StatusOK, vol)
}

// ListMerchants GET /v1/admin/merchants — FE AdminMerchant[]
func (h *AdminReadHandler) ListMerchants(w http.ResponseWriter, r *http.Request) {
	if !h.requireAuth(w, r) {
		return
	}
	list, next, more, err := h.Svc.ListMerchants(r.Context(), listFilterFrom(r))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	writeList(w, r, list, next, more)
}

// GetMerchant GET /v1/admin/merchants/{merchantId}
func (h *AdminReadHandler) GetMerchant(w http.ResponseWriter, r *http.Request) {
	if !h.requireAuth(w, r) {
		return
	}
	m, err := h.Svc.GetMerchant(r.Context(), chi.URLParam(r, "merchantId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, m)
}

// ListBuyers GET /v1/admin/buyers
func (h *AdminReadHandler) ListBuyers(w http.ResponseWriter, r *http.Request) {
	if !h.requireAuth(w, r) {
		return
	}
	list, next, more, err := h.Svc.ListBuyers(r.Context(), listFilterFrom(r))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	writeList(w, r, list, next, more)
}

// GetBuyer GET /v1/admin/buyers/{buyerId}
func (h *AdminReadHandler) GetBuyer(w http.ResponseWriter, r *http.Request) {
	if !h.requireAuth(w, r) {
		return
	}
	b, err := h.Svc.GetBuyer(r.Context(), chi.URLParam(r, "buyerId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, b)
}

// ListBuyerPurchases GET /v1/admin/buyers/{buyerId}/purchases
func (h *AdminReadHandler) ListBuyerPurchases(w http.ResponseWriter, r *http.Request) {
	if !h.requireAuth(w, r) {
		return
	}
	limit := admin.DefaultListLimit
	if n, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil {
		limit = int32(n)
	}
	list, err := h.Svc.ListBuyerPurchases(r.Context(), chi.URLParam(r, "buyerId"), limit)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, list)
}

// ListBuyerSessions GET /v1/admin/buyers/{buyerId}/sessions
func (h *AdminReadHandler) ListBuyerSessions(w http.ResponseWriter, r *http.Request) {
	if !h.requireAuth(w, r) {
		return
	}
	limit := admin.DefaultListLimit
	if n, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil {
		limit = int32(n)
	}
	list, err := h.Svc.ListBuyerSessions(r.Context(), chi.URLParam(r, "buyerId"), limit)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, list)
}

// ListOrders GET /v1/admin/orders
func (h *AdminReadHandler) ListOrders(w http.ResponseWriter, r *http.Request) {
	if !h.requireAuth(w, r) {
		return
	}
	list, next, more, err := h.Svc.ListOrders(r.Context(), listFilterFrom(r))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	writeList(w, r, list, next, more)
}

// GetOrder GET /v1/admin/orders/{orderId}
func (h *AdminReadHandler) GetOrder(w http.ResponseWriter, r *http.Request) {
	if !h.requireAuth(w, r) {
		return
	}
	o, err := h.Svc.GetOrder(r.Context(), chi.URLParam(r, "orderId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, o)
}

// ListPayments GET /v1/admin/payments
func (h *AdminReadHandler) ListPayments(w http.ResponseWriter, r *http.Request) {
	if !h.requireAuth(w, r) {
		return
	}
	list, next, more, err := h.Svc.ListPayments(r.Context(), listFilterFrom(r))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	writeList(w, r, list, next, more)
}

// GetPayment GET /v1/admin/payments/{paymentIntentId}
func (h *AdminReadHandler) GetPayment(w http.ResponseWriter, r *http.Request) {
	if !h.requireAuth(w, r) {
		return
	}
	p, err := h.Svc.GetPayment(r.Context(), chi.URLParam(r, "paymentIntentId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, p)
}

// ListWithdrawalsFE GET /v1/admin/withdrawals (FE AdminWithdrawal shape; may coexist with BE-350 review DTO).
// When AdminReadService is wired this handler is preferred for list/detail display contracts.
func (h *AdminReadHandler) ListWithdrawalsFE(w http.ResponseWriter, r *http.Request) {
	if !h.requireAuth(w, r) {
		return
	}
	list, next, more, err := h.Svc.ListWithdrawals(r.Context(), listFilterFrom(r))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	writeList(w, r, list, next, more)
}

// GetWithdrawalFE GET /v1/admin/withdrawals/{withdrawalId}
func (h *AdminReadHandler) GetWithdrawalFE(w http.ResponseWriter, r *http.Request) {
	if !h.requireAuth(w, r) {
		return
	}
	wd, err := h.Svc.GetWithdrawal(r.Context(), chi.URLParam(r, "withdrawalId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, wd)
}

// GetInventory GET /v1/admin/inventory (redacted snapshot)
func (h *AdminReadHandler) GetInventory(w http.ResponseWriter, r *http.Request) {
	if !h.requireAuth(w, r) {
		return
	}
	snap, err := h.Svc.GetInventory(r.Context())
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	// Never cache inventory lists.
	w.Header().Set("Cache-Control", "no-store")
	presenters.WriteData(w, r, http.StatusOK, snap)
}

// ListFulfillments GET /v1/admin/fulfillments
func (h *AdminReadHandler) ListFulfillments(w http.ResponseWriter, r *http.Request) {
	if !h.requireAuth(w, r) {
		return
	}
	list, next, more, err := h.Svc.ListFulfillments(r.Context(), listFilterFrom(r))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	writeList(w, r, list, next, more)
}

// GetFulfillment GET /v1/admin/fulfillments/{deliveryId}
func (h *AdminReadHandler) GetFulfillment(w http.ResponseWriter, r *http.Request) {
	if !h.requireAuth(w, r) {
		return
	}
	// Path param is deliveryId per §7.13
	id := chi.URLParam(r, "deliveryId")
	if id == "" {
		id = chi.URLParam(r, "fulfillmentId")
	}
	f, err := h.Svc.GetFulfillment(r.Context(), id)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, f)
}

// ListReviews GET /v1/admin/reviews
func (h *AdminReadHandler) ListReviews(w http.ResponseWriter, r *http.Request) {
	if !h.requireAuth(w, r) {
		return
	}
	list, next, more, err := h.Svc.ListReviews(r.Context(), listFilterFrom(r))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	writeList(w, r, list, next, more)
}

// GetReview GET /v1/admin/reviews/{reviewId}
func (h *AdminReadHandler) GetReview(w http.ResponseWriter, r *http.Request) {
	if !h.requireAuth(w, r) {
		return
	}
	rev, err := h.Svc.GetReview(r.Context(), chi.URLParam(r, "reviewId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, rev)
}

// LookupUsers GET /v1/admin/users (impersonation target lookup)
func (h *AdminReadHandler) LookupUsers(w http.ResponseWriter, r *http.Request) {
	if !h.requireAuth(w, r) {
		return
	}
	limit := admin.DefaultListLimit
	if n, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil {
		limit = int32(n)
	}
	list, err := h.Svc.LookupUsers(r.Context(), r.URL.Query().Get("q"), limit)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, list)
}

// GetUser GET /v1/admin/users/{userId}
func (h *AdminReadHandler) GetUser(w http.ResponseWriter, r *http.Request) {
	if !h.requireAuth(w, r) {
		return
	}
	u, err := h.Svc.GetUser(r.Context(), chi.URLParam(r, "userId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, u)
}
