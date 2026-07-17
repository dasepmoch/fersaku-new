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

// AnalyticsHandler serves store-scoped attribution analytics (BE-360).
type AnalyticsHandler struct {
	Svc *application.AnalyticsService
}

// Overview is GET /v1/stores/{storeId}/analytics/overview
func (h *AnalyticsHandler) Overview(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Analytics unavailable"))
		return
	}
	storeID := chi.URLParam(r, "storeId")
	if storeID == "" {
		presenters.WriteAppError(w, r, apperr.Validation(apperr.CodeValidationFailed, "storeId required"))
		return
	}
	ov, err := h.Svc.GetOverview(r.Context(), application.OverviewQuery{
		ActorUserID: p.SubjectID,
		StoreID:     storeID,
		FromDay:     strings.TrimSpace(r.URL.Query().Get("from")),
		ToDay:       strings.TrimSpace(r.URL.Query().Get("to")),
		Timezone:    strings.TrimSpace(r.URL.Query().Get("timezone")),
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	channels := make([]map[string]any, 0, len(ov.Channels))
	for _, c := range ov.Channels {
		channels = append(channels, map[string]any{
			"channel":  c.Channel,
			"sessions": c.Sessions,
			"orders":   c.Orders,
			"grossIdr": c.GrossIDR,
		})
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"storeId":            ov.StoreID,
		"timezone":           ov.Timezone,
		"from":               ov.FromDay,
		"to":                 ov.ToDay,
		"sessions":           ov.Sessions,
		"pageViews":          ov.PageViews,
		"checkouts":          ov.Checkouts,
		"orders":             ov.Orders,
		"grossIdr":           ov.GrossIDR,
		"conversionRateBps":  ov.ConversionRateBps,
		"channels":           channels,
		"policyVersionId":    ov.PolicyVersionID,
		"aggregationVersion": ov.AggregationVersion,
	})
}

// Traffic is GET /v1/stores/{storeId}/analytics/traffic
func (h *AnalyticsHandler) Traffic(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Analytics unavailable"))
		return
	}
	storeID := chi.URLParam(r, "storeId")
	if storeID == "" {
		presenters.WriteAppError(w, r, apperr.Validation(apperr.CodeValidationFailed, "storeId required"))
		return
	}
	limit := int32(50)
	if n, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && n > 0 && n <= 100 {
		limit = int32(n)
	}
	res, err := h.Svc.GetTraffic(r.Context(), application.TrafficQuery{
		ActorUserID: p.SubjectID,
		StoreID:     storeID,
		FromDay:     strings.TrimSpace(r.URL.Query().Get("from")),
		ToDay:       strings.TrimSpace(r.URL.Query().Get("to")),
		Timezone:    strings.TrimSpace(r.URL.Query().Get("timezone")),
		Channel:     strings.TrimSpace(r.URL.Query().Get("channel")),
		Cursor:      strings.TrimSpace(r.URL.Query().Get("cursor")),
		Limit:       limit,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	items := make([]map[string]any, 0, len(res.Items))
	for _, it := range res.Items {
		items = append(items, map[string]any{
			"day":       it.Day,
			"channel":   it.Channel,
			"productId": it.ProductID,
			"sessions":  it.Sessions,
			"pageViews": it.PageViews,
			"checkouts": it.Checkouts,
			"orders":    it.Orders,
			"grossIdr":  it.GrossIDR,
		})
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"items":      items,
		"nextCursor": res.NextCursor,
		"hasMore":    res.HasMore,
		"timezone":   res.Timezone,
		"from":       res.FromDay,
		"to":         res.ToDay,
	})
}

// Export is GET /v1/stores/{storeId}/analytics/traffic/export (CSV).
func (h *AnalyticsHandler) Export(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Analytics unavailable"))
		return
	}
	storeID := chi.URLParam(r, "storeId")
	csv, err := h.Svc.ExportTrafficCSV(r.Context(), application.TrafficQuery{
		ActorUserID: p.SubjectID,
		StoreID:     storeID,
		FromDay:     strings.TrimSpace(r.URL.Query().Get("from")),
		ToDay:       strings.TrimSpace(r.URL.Query().Get("to")),
		Timezone:    strings.TrimSpace(r.URL.Query().Get("timezone")),
		Channel:     strings.TrimSpace(r.URL.Query().Get("channel")),
		Limit:       100,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	// Never include visitor/session hashes in export.
	if strings.Contains(csv, "visitor_hash") || strings.Contains(csv, "session_hash") {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Export sanitization failed"))
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=\"traffic-"+storeID+"-"+time.Now().UTC().Format("20060102")+".csv\"")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(csv))
}
