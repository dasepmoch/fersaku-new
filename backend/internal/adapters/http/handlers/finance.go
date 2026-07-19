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
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/ledger"
	"github.com/dasepmoch/fersaku-new/backend/internal/platform/cursor"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// FinanceHandler serves seller finance summary/ledger/revenue (BE-340).
type FinanceHandler struct {
	Svc *application.LedgerService
}

// Summary is GET /v1/stores/{storeId}/finance/summary
// Also mounted at GET /v1/seller/finance/summary with storeId query.
func (h *FinanceHandler) Summary(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Finance unavailable"))
		return
	}
	storeID := chi.URLParam(r, "storeId")
	if storeID == "" {
		storeID = strings.TrimSpace(r.URL.Query().Get("storeId"))
	}
	if storeID == "" {
		presenters.WriteAppError(w, r, apperr.Validation(apperr.CodeValidationFailed, "storeId required"))
		return
	}
	mode := application.NormalizePaymentMode(r.URL.Query().Get("paymentMode"))
	sum, err := h.Svc.GetFinanceSummary(r.Context(), p.SubjectID, storeID, mode)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, financeSummaryDTO(sum))
}

// Ledger is GET /v1/stores/{storeId}/finance/ledger
func (h *FinanceHandler) Ledger(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Finance unavailable"))
		return
	}
	storeID := chi.URLParam(r, "storeId")
	if storeID == "" {
		storeID = strings.TrimSpace(r.URL.Query().Get("storeId"))
	}
	if storeID == "" {
		presenters.WriteAppError(w, r, apperr.Validation(apperr.CodeValidationFailed, "storeId required"))
		return
	}
	mode := application.NormalizePaymentMode(r.URL.Query().Get("paymentMode"))
	var source *string
	if s := strings.TrimSpace(r.URL.Query().Get("source")); s != "" {
		source = &s
	}
	var cursorAt *time.Time
	var cursorID *string
	if raw := strings.TrimSpace(r.URL.Query().Get("cursor")); raw != "" {
		key, err := cursor.Decode(raw)
		if err != nil {
			presenters.WriteAppError(w, r, apperr.Validation(apperr.CodeValidationFailed, "invalid cursor"))
			return
		}
		t := key.CreatedAt
		cursorAt = &t
		id := key.ID
		cursorID = &id
	}
	limit := int32(50)
	if n, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && n > 0 && n <= 100 {
		limit = int32(n)
	}
	items, nextAt, nextID, hasMore, err := h.Svc.ListLedger(r.Context(), p.SubjectID, storeID, mode, source, cursorAt, cursorID, limit)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	out := make([]map[string]any, 0, len(items))
	for _, it := range items {
		out = append(out, ledgerItemDTO(it))
	}
	var nextEnc *string
	var nextKey *cursor.Key
	if hasMore && nextAt != nil && nextID != nil {
		nextKey = &cursor.Key{CreatedAt: *nextAt, ID: *nextID}
		if enc, err := cursor.Encode(*nextKey); err == nil && enc != "" {
			nextEnc = &enc
		}
	}
	// FE CursorPage shape in data; meta also carries nextCursor/hasMore.
	presenters.WriteList(w, r, http.StatusOK, map[string]any{
		"items":          out,
		"nextCursor":     nextEnc,
		"previousCursor": nil,
		"hasMore":        hasMore,
	}, nextKey, hasMore)
}

// Revenue is GET /v1/stores/{storeId}/finance/revenue
func (h *FinanceHandler) Revenue(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Finance unavailable"))
		return
	}
	storeID := chi.URLParam(r, "storeId")
	if storeID == "" {
		storeID = strings.TrimSpace(r.URL.Query().Get("storeId"))
	}
	if storeID == "" {
		presenters.WriteAppError(w, r, apperr.Validation(apperr.CodeValidationFailed, "storeId required"))
		return
	}
	mode := application.NormalizePaymentMode(r.URL.Query().Get("paymentMode"))
	days := 30
	if n, err := strconv.Atoi(r.URL.Query().Get("days")); err == nil && n > 0 {
		days = n
	}
	points, err := h.Svc.ListRevenue(r.Context(), p.SubjectID, storeID, mode, days)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	out := make([]map[string]any, 0, len(points))
	for _, p := range points {
		out = append(out, map[string]any{
			"day":     p.Day,
			"revenue": p.Revenue,
			"orders":  p.Orders,
		})
	}
	presenters.WriteData(w, r, http.StatusOK, out)
}

// AdminMerchantBalance is optional minimal admin read: GET /v1/admin/merchants/{merchantId}/finance/summary
func (h *FinanceHandler) AdminMerchantBalance(w http.ResponseWriter, r *http.Request) {
	if _, ok := reqctx.PrincipalFrom(r.Context()); !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil || h.Svc.Store == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Finance unavailable"))
		return
	}
	merchantID := chi.URLParam(r, "merchantId")
	if merchantID == "" {
		presenters.WriteAppError(w, r, apperr.Validation(apperr.CodeValidationFailed, "merchantId required"))
		return
	}
	mode := application.NormalizePaymentMode(r.URL.Query().Get("paymentMode"))
	bal, err := h.Svc.Store.GetBalance(r.Context(), merchantID, mode)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	sources, _ := h.Svc.Store.ListSourceBalances(r.Context(), merchantID, mode)
	src := map[string]any{
		"STOREFRONT": map[string]any{"availableAmount": int64(0), "pendingAmount": int64(0)},
		"QRIS_API":   map[string]any{"availableAmount": int64(0), "pendingAmount": int64(0)},
	}
	for _, s := range sources {
		src[s.Source] = map[string]any{
			"availableAmount": s.AvailableIDR,
			"pendingAmount":   s.PendingIDR,
		}
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"merchantId":          merchantID,
		"paymentMode":         mode,
		"availableAmount":     bal.AvailableIDR,
		"pendingAmount":       bal.PendingIDR,
		"heldAmount":          bal.HeldIDR,
		"lifetimeGrossAmount": bal.LifetimeGrossIDR,
		"lifetimeNetAmount":   bal.LifetimeNetIDR,
		"sources":             src,
		"currency":            "IDR",
		"asOf":                time.Now().UTC().Format(time.RFC3339),
	})
}

func financeSummaryDTO(s ledger.FinanceSummary) map[string]any {
	sources := map[string]any{}
	for k, v := range s.Sources {
		sources[k] = map[string]any{
			"availableAmount": v.AvailableAmount,
			"pendingAmount":   v.PendingAmount,
			// Spec also allows available/pending short keys
			"available": v.AvailableAmount,
			"pending":   v.PendingAmount,
		}
	}
	return map[string]any{
		"storeId":                s.StoreID,
		"availableAmount":        s.AvailableAmount,
		"pendingAmount":          s.PendingAmount,
		"heldAmount":             s.HeldAmount,
		"lifetimeGrossAmount":    s.LifetimeGrossAmount,
		"monthGrossAmount":       s.MonthGrossAmount,
		"monthPlatformFeeAmount": s.MonthPlatformFeeAmount,
		"monthProviderFeeAmount": s.MonthProviderFeeAmount,
		"monthNetAmount":         s.MonthNetAmount,
		"sources":                sources,
		"currency":               s.Currency,
		"asOf":                   s.AsOf.UTC().Format(time.RFC3339),
		"feePolicy": map[string]any{
			"transactionPercentBps": s.FeePolicy.TransactionPercentBps,
			"transactionFixedIdr":   s.FeePolicy.TransactionFixedIDR,
			"withdrawalPercentBps":  s.FeePolicy.WithdrawalPercentBps,
			"minimumWithdrawalIdr":  s.FeePolicy.MinimumWithdrawalIDR,
		},
		"withdrawalAllocationPolicy": s.WithdrawalAllocationPolicy,
	}
}

func ledgerItemDTO(it ledger.LedgerListItem) map[string]any {
	m := map[string]any{
		"id":          it.ID,
		"storeId":     it.StoreID,
		"type":        it.Type,
		"description": it.Description,
		"amount":      it.Amount,
		"direction":   it.Direction,
		"source":      it.Source,
		"occurredAt":  it.OccurredAt.UTC().Format(time.RFC3339),
	}
	if it.OrderID != nil {
		m["orderId"] = *it.OrderID
	}
	if it.WithdrawalID != nil {
		m["withdrawalId"] = *it.WithdrawalID
	}
	return m
}
