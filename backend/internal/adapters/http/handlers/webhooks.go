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
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/webhooks"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// WebhookHandler serves seller outbound webhooks + admin delivery queue (BE-420).
type WebhookHandler struct {
	Svc *application.WebhookService
}

func (h *WebhookHandler) actor(r *http.Request) (userID string, ok bool) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok || p.SubjectID == "" {
		return "", false
	}
	return p.SubjectID, true
}

// ListEndpoints GET /v1/stores/{storeId}/webhooks
func (h *WebhookHandler) ListEndpoints(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.actor(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	list, err := h.Svc.ListEndpoints(r.Context(), userID, chi.URLParam(r, "storeId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	out := make([]map[string]any, 0, len(list))
	for _, e := range list {
		out = append(out, endpointDTO(e))
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"endpoints": out})
}

// CreateEndpoint POST /v1/stores/{storeId}/webhooks
func (h *WebhookHandler) CreateEndpoint(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.actor(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	var body struct {
		URL         string   `json:"url"`
		PaymentMode string   `json:"paymentMode"`
		Mode        string   `json:"mode"`
		Allowlist   []string `json:"eventAllowlist"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	mode := body.PaymentMode
	if mode == "" {
		mode = body.Mode
	}
	res, err := h.Svc.CreateEndpoint(r.Context(), application.CreateEndpointInput{
		UserID:      userID,
		StoreID:     chi.URLParam(r, "storeId"),
		PaymentMode: mode,
		URL:         body.URL,
		Allowlist:   body.Allowlist,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	presenters.WriteData(w, r, http.StatusCreated, map[string]any{
		"endpoint":       endpointDTO(res.Endpoint),
		"claimToken":     res.ClaimToken,
		"claimExpiresAt": res.ClaimExpiresAt.UTC().Format(time.RFC3339),
		"secretVersion":  res.SecretVersion,
	})
}

// UpdateEndpoint PATCH /v1/stores/{storeId}/webhooks/{id}
func (h *WebhookHandler) UpdateEndpoint(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.actor(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	var body struct {
		URL       *string  `json:"url"`
		Allowlist []string `json:"eventAllowlist"`
		Disable   bool     `json:"disable"`
		Reason    string   `json:"reason"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	ep, err := h.Svc.UpdateEndpoint(r.Context(), application.UpdateEndpointInput{
		UserID:     userID,
		StoreID:    chi.URLParam(r, "storeId"),
		EndpointID: chi.URLParam(r, "id"),
		URL:        body.URL,
		Allowlist:  body.Allowlist,
		Disable:    body.Disable,
		Reason:     body.Reason,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, endpointDTO(ep))
}

// SecretRotation POST .../secret-rotation-requests
func (h *WebhookHandler) SecretRotation(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.actor(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	res, err := h.Svc.RequestSecretRotation(r.Context(), userID, chi.URLParam(r, "storeId"), chi.URLParam(r, "id"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	presenters.WriteData(w, r, http.StatusCreated, map[string]any{
		"endpoint":       endpointDTO(res.Endpoint),
		"claimToken":     res.ClaimToken,
		"claimExpiresAt": res.ClaimExpiresAt.UTC().Format(time.RFC3339),
		"secretVersion":  res.SecretVersion,
	})
}

// ClaimSecret POST .../secret-claims/{claimId}/exchange
func (h *WebhookHandler) ClaimSecret(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.actor(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	var body struct {
		Token      string `json:"token"`
		ClaimToken string `json:"claimToken"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	tok := body.Token
	if tok == "" {
		tok = body.ClaimToken
	}
	res, err := h.Svc.ClaimSecretExchange(r.Context(), application.ClaimSecretInput{
		UserID:     userID,
		StoreID:    chi.URLParam(r, "storeId"),
		EndpointID: chi.URLParam(r, "id"),
		Token:      tok,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"signingSecret": res.RawSecret,
		"fingerprint":   res.Fingerprint,
		"secretVersion": res.Version,
		"endpoint":      endpointDTO(res.Endpoint),
	})
}

// TestEvent POST .../test
func (h *WebhookHandler) TestEvent(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.actor(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	d, err := h.Svc.SendTestEvent(r.Context(), userID, chi.URLParam(r, "storeId"), chi.URLParam(r, "id"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusAccepted, deliveryDTO(d))
}

// ListSellerDeliveries GET .../webhooks/deliveries
func (h *WebhookHandler) ListSellerDeliveries(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.actor(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	list, err := h.Svc.ListSellerDeliveries(r.Context(), userID, chi.URLParam(r, "storeId"), 50)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	out := make([]map[string]any, 0, len(list))
	for _, d := range list {
		out = append(out, deliveryDTO(d))
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"deliveries": out})
}

// AdminList GET /v1/admin/seller-webhook-deliveries
func (h *WebhookHandler) AdminList(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	merchantID := r.URL.Query().Get("merchantId")
	list, err := h.Svc.ListAdminDeliveries(r.Context(), status, merchantID, 50)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	out := make([]map[string]any, 0, len(list))
	for _, v := range list {
		out = append(out, adminDeliveryDTO(v))
	}
	presenters.WriteData(w, r, http.StatusOK, out)
}

// AdminGet GET /v1/admin/seller-webhook-deliveries/{deliveryId}
func (h *WebhookHandler) AdminGet(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "deliveryId")
	d, err := h.Svc.GetAdminDelivery(r.Context(), id)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, deliveryDTO(d))
}

// AdminRetry POST /v1/admin/seller-webhook-deliveries/{deliveryId}/retry
// Rejects inbound provider event IDs (wrong namespace).
func (h *WebhookHandler) AdminRetry(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "deliveryId")
	var body struct {
		Reason string `json:"reason"`
	}
	_ = decode.DecodeJSON(r, &body)
	if strings.TrimSpace(body.Reason) == "" {
		body.Reason = "admin_retry"
	}
	actor := ""
	if p, ok := reqctx.PrincipalFrom(r.Context()); ok {
		actor = p.SubjectID
	}
	d, err := h.Svc.AdminRetry(r.Context(), id, actor, body.Reason)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, deliveryDTO(d))
}

func endpointDTO(e webhooks.Endpoint) map[string]any {
	dto := map[string]any{
		"id":            e.ID,
		"merchantId":    e.MerchantID,
		"paymentMode":   e.PaymentMode,
		"urlHost":       e.URLHost,
		"status":        e.Status,
		"configVersion": e.ConfigVersion,
		"eventAllowlist": e.EventAllowlist,
		"failureCount":  e.FailureCount,
		"createdAt":     e.CreatedAt.UTC().Format(time.RFC3339),
		"updatedAt":     e.UpdatedAt.UTC().Format(time.RFC3339),
	}
	if e.StoreID != nil {
		dto["storeId"] = *e.StoreID
	}
	if e.CurrentSecretVersion != nil {
		dto["currentSecretVersion"] = *e.CurrentSecretVersion
	}
	// Never expose full URL path secrets; host only for list (URL needed for seller edit — include url).
	dto["url"] = e.URL
	return dto
}

func deliveryDTO(d webhooks.Delivery) map[string]any {
	dto := map[string]any{
		"deliveryId":     d.ID,
		"kind":           "SELLER_DELIVERY",
		"endpointId":     d.EndpointID,
		"merchantId":     d.MerchantID,
		"paymentMode":    d.PaymentMode,
		"eventId":        d.EventID,
		"eventType":      d.EventType,
		"payloadVersion": d.PayloadVersion,
		"payloadHash":    d.PayloadHash,
		"sourceKind":     d.SourceKind,
		"isTest":         d.IsTest,
		"status":         d.Status,
		"attemptCount":   d.AttemptCount,
		"createdAt":      d.CreatedAt.UTC().Format(time.RFC3339),
		"updatedAt":      d.UpdatedAt.UTC().Format(time.RFC3339),
	}
	// Never include raw payload body or secrets in admin/seller list by default for safety;
	// hash is enough for integrity. Body is used only by worker.
	if d.PaymentIntentID != nil {
		dto["paymentIntentId"] = *d.PaymentIntentID
	}
	if d.OrderID != nil {
		dto["orderId"] = *d.OrderID
	}
	if d.NextRetryAt != nil {
		dto["nextRetryAt"] = d.NextRetryAt.UTC().Format(time.RFC3339)
	}
	if d.LastHTTPStatus != nil {
		dto["lastHttpStatus"] = *d.LastHTTPStatus
	}
	if d.LastLatencyMs != nil {
		dto["lastLatencyMs"] = *d.LastLatencyMs
	}
	if d.LastErrorClass != nil {
		dto["lastErrorClass"] = *d.LastErrorClass
	}
	if d.DeadLetterReason != nil {
		dto["deadLetterReason"] = *d.DeadLetterReason
	}
	if d.DeliveredAt != nil {
		dto["deliveredAt"] = d.DeliveredAt.UTC().Format(time.RFC3339)
	}
	return dto
}

func adminDeliveryDTO(v webhooks.AdminDeliveryView) map[string]any {
	dto := map[string]any{
		"deliveryId":   v.DeliveryID,
		"kind":         "SELLER_DELIVERY",
		"endpointId":   v.EndpointID,
		"endpointHost": v.EndpointHost,
		"merchantId":   v.MerchantID,
		"paymentMode":  v.PaymentMode,
		"eventId":      v.EventID,
		"eventType":    v.EventType,
		"status":       v.Status,
		"attemptCount": v.AttemptCount,
		"isTest":       v.IsTest,
		"createdAt":    v.CreatedAt.UTC().Format(time.RFC3339),
		"updatedAt":    v.UpdatedAt.UTC().Format(time.RFC3339),
	}
	if v.NextRetryAt != nil {
		dto["nextRetryAt"] = v.NextRetryAt.UTC().Format(time.RFC3339)
	}
	if v.LastHTTPClass != nil {
		dto["lastHttpClass"] = *v.LastHTTPClass
	}
	if v.LastLatencyMs != nil {
		dto["lastLatencyMs"] = *v.LastLatencyMs
	}
	if v.DeadLetterReason != nil {
		dto["deadLetterReason"] = *v.DeadLetterReason
	}
	return dto
}
