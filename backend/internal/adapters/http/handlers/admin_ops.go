package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/decode"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// AdminOpsHandler serves BE-510 lightweight admin operations.
type AdminOpsHandler struct {
	Svc *application.AdminOpsService
}

func (h *AdminOpsHandler) actor(r *http.Request) (string, bool) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok || p.SubjectID == "" {
		return "", false
	}
	return p.SubjectID, true
}

func (h *AdminOpsHandler) requestID(r *http.Request) string {
	return reqctx.RequestID(r.Context())
}

// ExecuteAction POST /v1/admin/actions
func (h *AdminOpsHandler) ExecuteAction(w http.ResponseWriter, r *http.Request) {
	actorID, ok := h.actor(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Admin ops unavailable"))
		return
	}
	var body application.AdminActionInput
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	// Idempotency-Key header may supply key when body omits it.
	if body.IdempotencyKey == "" {
		body.IdempotencyKey = strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	}
	out, err := h.Svc.ExecuteAction(r.Context(), actorID, h.requestID(r), body)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, out)
}

// UpdateMerchantStatus POST /v1/admin/merchants/{merchantId}/status
func (h *AdminOpsHandler) UpdateMerchantStatus(w http.ResponseWriter, r *http.Request) {
	actorID, ok := h.actor(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	var body struct {
		Status string `json:"status"`
		Reason string `json:"reason"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	m, err := h.Svc.UpdateMerchantStatus(r.Context(), actorID, chi.URLParam(r, "merchantId"), body.Status, body.Reason, h.requestID(r))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"id": m.ID, "status": m.Status, "displayName": m.DisplayName,
	})
}

// UpdateAPIAccess POST /v1/admin/merchants/{merchantId}/api-access/status
func (h *AdminOpsHandler) UpdateAPIAccess(w http.ResponseWriter, r *http.Request) {
	actorID, ok := h.actor(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	var body struct {
		Status string `json:"status"`
		Reason string `json:"reason"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	c, err := h.Svc.UpdateAPIAccess(r.Context(), actorID, chi.URLParam(r, "merchantId"), body.Status, body.Reason, h.requestID(r))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"merchantId": c.MerchantID, "status": c.Status, "paymentMode": c.PaymentMode, "capability": c.Capability,
	})
}

// ListEmergency GET /v1/admin/system/emergency-controls (also embedded in GET /system)
func (h *AdminOpsHandler) ListEmergency(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.actor(r); !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	list, err := h.Svc.ListEmergencyControls(r.Context())
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"items": list})
}

// SetEmergency POST /v1/admin/system/emergency-controls
func (h *AdminOpsHandler) SetEmergency(w http.ResponseWriter, r *http.Request) {
	actorID, ok := h.actor(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	var body struct {
		SwitchName      string `json:"switchName"`
		Enabled         *bool  `json:"enabled"`
		Reason          string `json:"reason"`
		IncidentTicket  string `json:"incidentTicket"`
		ExpectedVersion int64  `json:"expectedVersion"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	if body.Enabled == nil {
		presenters.WriteAppError(w, r, apperr.Validation(apperr.CodeValidationFailed, "enabled is required"))
		return
	}
	out, err := h.Svc.SetEmergencyControl(r.Context(), actorID, body.SwitchName, *body.Enabled, body.Reason, body.IncidentTicket, body.ExpectedVersion, h.requestID(r))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, out)
}

// GetSystem GET /v1/admin/system
func (h *AdminOpsHandler) GetSystem(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.actor(r); !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	out, err := h.Svc.GetSystem(r.Context())
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, out)
}

// GetProviders GET /v1/admin/providers
func (h *AdminOpsHandler) GetProviders(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.actor(r); !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	list, err := h.Svc.GetProviders(r.Context())
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"items": list})
}

// ListAudit GET /v1/admin/audit-logs
func (h *AdminOpsHandler) ListAudit(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.actor(r); !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	f := application.AdminOpsAuditFilter{Limit: 50}
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			f.Limit = int32(n)
		}
	}
	if v := strings.TrimSpace(r.URL.Query().Get("action")); v != "" {
		f.Action = &v
	}
	if v := strings.TrimSpace(r.URL.Query().Get("resourceType")); v != "" {
		f.ResourceType = &v
	}
	if v := strings.TrimSpace(r.URL.Query().Get("resourceId")); v != "" {
		f.ResourceID = &v
	}
	if v := strings.TrimSpace(r.URL.Query().Get("actorUserId")); v != "" {
		f.ActorUserID = &v
	}
	list, err := h.Svc.ListAudit(r.Context(), f)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"items": list})
}

// GetAudit GET /v1/admin/audit-logs/{eventId}
func (h *AdminOpsHandler) GetAudit(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.actor(r); !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	out, err := h.Svc.GetAudit(r.Context(), chi.URLParam(r, "eventId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, out)
}

// AuditIntegrity GET /v1/admin/audit-integrity
func (h *AdminOpsHandler) AuditIntegrity(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.actor(r); !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	out, err := h.Svc.AuditIntegrity(r.Context())
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, out)
}

// CreateAuditExport POST /v1/admin/audit-exports
func (h *AdminOpsHandler) CreateAuditExport(w http.ResponseWriter, r *http.Request) {
	actorID, ok := h.actor(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	var body struct {
		Reason string         `json:"reason"`
		Filter map[string]any `json:"filter"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	out, err := h.Svc.CreateAuditExport(r.Context(), actorID, body.Reason, body.Filter, h.requestID(r))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusAccepted, out)
}

// GetAuditExport GET /v1/admin/audit-exports/{exportId}
func (h *AdminOpsHandler) GetAuditExport(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.actor(r); !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	out, err := h.Svc.GetAuditExport(r.Context(), chi.URLParam(r, "exportId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, out)
}

// ListPaymentMismatches GET /v1/admin/payment-mismatches
func (h *AdminOpsHandler) ListPaymentMismatches(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.actor(r); !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	limit := int32(50)
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			limit = int32(n)
		}
	}
	list, err := h.Svc.ListPaymentMismatches(r.Context(), limit)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	// FE PaymentMismatch shape: age as human string optional; keep ISO observedAt.
	items := make([]map[string]any, 0, len(list))
	for _, m := range list {
		age := time.Since(m.ObservedAt).Round(time.Minute).String()
		items = append(items, map[string]any{
			"id":                m.ID,
			"paymentIntentId":   m.PaymentIntentID,
			"orderId":           m.OrderID,
			"merchant":          m.Merchant,
			"merchantId":        m.MerchantID,
			"amount":            m.Amount,
			"provider":          m.Provider,
			"providerStatus":    m.ProviderStatus,
			"localStatus":       m.LocalStatus,
			"age":               age,
			"attempts":          m.ReplayCount,
			"observedAt":        m.ObservedAt.UTC().Format(time.RFC3339),
			"providerReference": m.ProviderReference,
			"alertCode":         m.AlertCode,
			"mismatchCode":      m.MismatchCode,
		})
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"items": items})
}

// ModerateReview POST /v1/admin/reviews/{reviewId}/transition
func (h *AdminOpsHandler) ModerateReview(w http.ResponseWriter, r *http.Request) {
	actorID, ok := h.actor(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	var body struct {
		Status string `json:"status"`
		Action string `json:"action"`
		Reason string `json:"reason"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	status := body.Status
	if status == "" {
		status = body.Action
	}
	out, err := h.Svc.ModerateReview(r.Context(), actorID, chi.URLParam(r, "reviewId"), status, body.Reason, h.requestID(r))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"id": out.ID, "status": out.Status, "productId": out.ProductID,
	})
}

// ResendDelivery POST /v1/admin/orders/{orderId}/delivery/resend
func (h *AdminOpsHandler) ResendDelivery(w http.ResponseWriter, r *http.Request) {
	actorID, ok := h.actor(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	var body struct {
		Reason         string `json:"reason"`
		IdempotencyKey string `json:"idempotencyKey"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	if body.IdempotencyKey == "" {
		body.IdempotencyKey = strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	}
	if err := h.Svc.ResendOrderDelivery(r.Context(), actorID, chi.URLParam(r, "orderId"), body.Reason, body.IdempotencyKey, h.requestID(r)); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusAccepted, map[string]any{"accepted": true})
}

// ProviderLookup POST /v1/admin/payments/{paymentIntentId}/provider-lookup
func (h *AdminOpsHandler) ProviderLookup(w http.ResponseWriter, r *http.Request) {
	actorID, ok := h.actor(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	out, err := h.Svc.VerifyPaymentProvider(r.Context(), actorID, chi.URLParam(r, "paymentIntentId"), body.Reason, h.requestID(r))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusAccepted, out)
}
