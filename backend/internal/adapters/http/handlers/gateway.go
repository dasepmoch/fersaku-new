package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/decode"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/gateway"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/payments"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// Deprecation header for legacy /v1/qris/* aliases.
const gatewayLegacyDeprecation = "true"
const gatewayLegacySunset = "Sat, 17 Jul 2027 00:00:00 GMT"

// GatewayHandler serves QRIS gateway API (BE-320).
type GatewayHandler struct {
	Svc *application.GatewayService
}

func (h *GatewayHandler) auth(r *http.Request) (gateway.AuthContext, error) {
	if h.Svc == nil {
		return gateway.AuthContext{}, apperr.Internal(apperr.CodeInternalError, "Gateway unavailable")
	}
	if a, ok := reqctx.GatewayAuthFrom(r.Context()); ok {
		return gateway.AuthContext{
			KeyID:       a.KeyID,
			MerchantID:  a.MerchantID,
			PaymentMode: a.PaymentMode,
			KeyPrefix:   a.KeyPrefix,
		}, nil
	}
	// Fallback: parse Authorization header.
	raw := bearerToken(r)
	if raw == "" {
		return gateway.AuthContext{}, gateway.ErrAuthRequired
	}
	return h.Svc.ResolveAPIKey(r.Context(), raw)
}

func bearerToken(r *http.Request) string {
	h := strings.TrimSpace(r.Header.Get("Authorization"))
	if h == "" {
		return ""
	}
	const p = "Bearer "
	if len(h) < len(p) || !strings.EqualFold(h[:len(p)], p) {
		return ""
	}
	return strings.TrimSpace(h[len(p):])
}

// CreatePayment handles POST /v1/gateway/payment-intents (canonical).
func (h *GatewayHandler) CreatePayment(w http.ResponseWriter, r *http.Request) {
	h.createPayment(w, r, false)
}

// CreatePaymentLegacy handles POST /v1/qris/payments (snake_case accepted).
func (h *GatewayHandler) CreatePaymentLegacy(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Deprecation", gatewayLegacyDeprecation)
	w.Header().Set("Sunset", gatewayLegacySunset)
	w.Header().Set("Link", `</v1/gateway/payment-intents>; rel="successor-version"`)
	h.createPayment(w, r, true)
}

func (h *GatewayHandler) createPayment(w http.ResponseWriter, r *http.Request, legacy bool) {
	auth, err := h.auth(r)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	var body createPaymentBody
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	// Reject webhookUrl / webhook_url always.
	if body.WebhookURL != nil || body.WebhookURLSnake != nil {
		presenters.WriteAppError(w, r, gateway.ErrWebhookURLRejected)
		return
	}
	idem := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if idem == "" {
		idem = strings.TrimSpace(body.IdempotencyKey)
	}
	amount := body.Amount
	if amount == 0 && body.AmountSnake != 0 {
		amount = body.AmountSnake
	}
	ref := firstNonEmpty(body.MerchantReference, body.MerchantReferenceSnake)
	desc := firstNonEmpty(body.Description, body.DescriptionSnake)
	curr := firstNonEmpty(body.Currency, body.CurrencySnake)
	success := firstNonEmpty(body.SuccessURL, body.SuccessURLSnake)
	failure := firstNonEmpty(body.FailureURL, body.FailureURLSnake)
	whep := firstNonEmpty(body.WebhookEndpointID, body.WebhookEndpointIDSnake)
	expires := body.ExpiresInMinutes
	if expires == 0 {
		expires = body.ExpiresInMinutesSnake
	}
	var meta json.RawMessage
	if body.Metadata != nil {
		meta = body.Metadata
	}
	custRef, custEmail := "", ""
	if body.Customer != nil {
		custRef = firstNonEmpty(body.Customer.Reference, body.Customer.ReferenceSnake)
		custEmail = firstNonEmpty(body.Customer.Email, body.Customer.EmailSnake)
	}

	res, err := h.Svc.CreatePayment(r.Context(), application.CreatePaymentRequest{
		Auth:              auth,
		MerchantReference: ref,
		AmountIDR:         amount,
		Currency:          curr,
		Description:       desc,
		CustomerReference: custRef,
		CustomerEmail:     custEmail,
		ExpiresInMinutes:  expires,
		SuccessURL:        success,
		FailureURL:        failure,
		WebhookEndpointID: whep,
		Metadata:          meta,
		IdempotencyKey:    idem,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	status := http.StatusCreated
	if res.Replayed {
		status = http.StatusOK
	}
	dto := paymentIntentDTO(res.Intent, res.FeeIDR, res.MerchantNetIDR, legacy)
	presenters.WriteData(w, r, status, dto)
}

// GetPayment handles GET .../{paymentIntentId}
func (h *GatewayHandler) GetPayment(w http.ResponseWriter, r *http.Request) {
	h.getPayment(w, r, false)
}

func (h *GatewayHandler) GetPaymentLegacy(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Deprecation", gatewayLegacyDeprecation)
	w.Header().Set("Sunset", gatewayLegacySunset)
	h.getPayment(w, r, true)
}

func (h *GatewayHandler) getPayment(w http.ResponseWriter, r *http.Request, legacy bool) {
	auth, err := h.auth(r)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	id := chi.URLParam(r, "paymentIntentId")
	pi, err := h.Svc.GetPayment(r.Context(), auth, id)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, paymentIntentDTO(pi, feeFromPrice(pi), netFromPrice(pi), legacy))
}

// CancelPayment handles POST .../cancel
func (h *GatewayHandler) CancelPayment(w http.ResponseWriter, r *http.Request) {
	h.cancelPayment(w, r, false)
}

func (h *GatewayHandler) CancelPaymentLegacy(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Deprecation", gatewayLegacyDeprecation)
	w.Header().Set("Sunset", gatewayLegacySunset)
	h.cancelPayment(w, r, true)
}

func (h *GatewayHandler) cancelPayment(w http.ResponseWriter, r *http.Request, legacy bool) {
	auth, err := h.auth(r)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	id := chi.URLParam(r, "paymentIntentId")
	idem := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	var body cancelPaymentBody
	_ = decode.DecodeJSON(r, &body)
	if idem == "" {
		idem = strings.TrimSpace(body.IdempotencyKey)
	}
	reason := firstNonEmpty(body.Reason, body.ReasonSnake)
	pi, code, err := h.Svc.CancelPayment(r.Context(), auth, id, reason, idem)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	status := http.StatusOK
	if code == 202 {
		status = http.StatusAccepted
	}
	presenters.WriteData(w, r, status, paymentIntentDTO(pi, feeFromPrice(pi), netFromPrice(pi), legacy))
}

// GetEvent handles GET /v1/gateway/events/{eventId}
func (h *GatewayHandler) GetEvent(w http.ResponseWriter, r *http.Request) {
	h.getEvent(w, r, false)
}

func (h *GatewayHandler) GetEventLegacy(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Deprecation", gatewayLegacyDeprecation)
	w.Header().Set("Sunset", gatewayLegacySunset)
	h.getEvent(w, r, true)
}

func (h *GatewayHandler) getEvent(w http.ResponseWriter, r *http.Request, legacy bool) {
	auth, err := h.auth(r)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	id := chi.URLParam(r, "eventId")
	ev, err := h.Svc.GetEvent(r.Context(), auth, id)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	dto := map[string]any{
		"eventId":         ev.ID,
		"paymentIntentId": ev.PaymentIntentID,
		"type":            ev.EventType,
		"createdAt":       ev.CreatedAt.UTC().Format(time.RFC3339),
	}
	if legacy {
		dto["event_id"] = ev.ID
		dto["payment_intent_id"] = ev.PaymentIntentID
		dto["created_at"] = ev.CreatedAt.UTC().Format(time.RFC3339)
	}
	if len(ev.Payload) > 0 {
		var p any
		if json.Unmarshal(ev.Payload, &p) == nil {
			dto["payload"] = p
		}
	}
	presenters.WriteData(w, r, http.StatusOK, dto)
}

// ListEvents handles GET /v1/gateway/payment-intents/{id}/events
func (h *GatewayHandler) ListEvents(w http.ResponseWriter, r *http.Request) {
	auth, err := h.auth(r)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	id := chi.URLParam(r, "paymentIntentId")
	events, err := h.Svc.ListEvents(r.Context(), auth, id)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	items := make([]map[string]any, 0, len(events))
	for _, ev := range events {
		items = append(items, map[string]any{
			"eventId":         ev.ID,
			"paymentIntentId": ev.PaymentIntentID,
			"type":            ev.EventType,
			"createdAt":       ev.CreatedAt.UTC().Format(time.RFC3339),
		})
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"items": items})
}

// RejectGatewayProduct is a hard 404 for any product/catalog under gateway.
func RejectGatewayProduct(w http.ResponseWriter, r *http.Request) {
	presenters.WriteProblem(w, r, http.StatusNotFound,
		apperr.CodeResourceNotFound, "Resource not found", nil)
}

type createPaymentBody struct {
	MerchantReference      string          `json:"merchantReference"`
	MerchantReferenceSnake string          `json:"merchant_reference"`
	Amount                 int64           `json:"amount"`
	AmountSnake            int64           `json:"amount_idr"`
	Currency               string          `json:"currency"`
	CurrencySnake          string          `json:"currency_code"`
	Description            string          `json:"description"`
	DescriptionSnake       string          `json:"description_text"`
	Customer               *customerBody   `json:"customer"`
	ExpiresInMinutes       int             `json:"expiresInMinutes"`
	ExpiresInMinutesSnake  int             `json:"expires_in_minutes"`
	SuccessURL             string          `json:"successUrl"`
	SuccessURLSnake        string          `json:"success_url"`
	FailureURL             string          `json:"failureUrl"`
	FailureURLSnake        string          `json:"failure_url"`
	WebhookEndpointID      string          `json:"webhookEndpointId"`
	WebhookEndpointIDSnake string          `json:"webhook_endpoint_id"`
	WebhookURL             *string         `json:"webhookUrl"`
	WebhookURLSnake        *string         `json:"webhook_url"`
	Metadata               json.RawMessage `json:"metadata"`
	IdempotencyKey         string          `json:"idempotencyKey"`
}

type customerBody struct {
	Reference      string `json:"reference"`
	ReferenceSnake string `json:"customer_reference"`
	Email          string `json:"email"`
	EmailSnake     string `json:"email_address"`
}

type cancelPaymentBody struct {
	Reason         string `json:"reason"`
	ReasonSnake    string `json:"cancel_reason"`
	IdempotencyKey string `json:"idempotencyKey"`
}

func firstNonEmpty(a, b string) string {
	if strings.TrimSpace(a) != "" {
		return strings.TrimSpace(a)
	}
	return strings.TrimSpace(b)
}

func paymentIntentDTO(pi payments.Intent, fee, net int64, legacy bool) map[string]any {
	dto := map[string]any{
		"paymentIntentId": pi.ID,
		"orderId":         pi.OrderID,
		"status":          pi.Status,
		"amount":          pi.AmountIDR,
		"currency":        pi.Currency,
		"source":          pi.Source,
		"paymentMode":     pi.PaymentMode,
		"expiresAt":       pi.ExpiresAt.UTC().Format(time.RFC3339),
		"fee":             fee,
		"merchantNet":     net,
		"createdAt":       pi.CreatedAt.UTC().Format(time.RFC3339),
	}
	if pi.MerchantReference != nil {
		dto["merchantReference"] = *pi.MerchantReference
	}
	if pi.ProviderReference != nil {
		dto["providerReference"] = *pi.ProviderReference
	}
	if pi.QRString != nil {
		dto["qrString"] = *pi.QRString
	}
	if pi.QRImageURL != nil {
		dto["qrImageUrl"] = *pi.QRImageURL
	}
	if pi.WebhookEndpointID != nil {
		dto["webhookEndpointId"] = *pi.WebhookEndpointID
	}
	if pi.SuccessURL != nil {
		dto["successUrl"] = *pi.SuccessURL
	}
	if pi.FailureURL != nil {
		dto["failureUrl"] = *pi.FailureURL
	}
	if pi.Description != "" {
		dto["description"] = pi.Description
	}
	if legacy {
		dto["payment_intent_id"] = pi.ID
		dto["order_id"] = pi.OrderID
		dto["payment_mode"] = pi.PaymentMode
		dto["expires_at"] = pi.ExpiresAt.UTC().Format(time.RFC3339)
		dto["merchant_net"] = net
		dto["created_at"] = pi.CreatedAt.UTC().Format(time.RFC3339)
		if pi.QRImageURL != nil {
			dto["qr_image_url"] = *pi.QRImageURL
		}
		if pi.QRString != nil {
			dto["qr_string"] = *pi.QRString
		}
		if pi.MerchantReference != nil {
			dto["merchant_reference"] = *pi.MerchantReference
		}
		if pi.ProviderReference != nil {
			dto["provider_reference"] = *pi.ProviderReference
		}
		if pi.WebhookEndpointID != nil {
			dto["webhook_endpoint_id"] = *pi.WebhookEndpointID
		}
	}
	return dto
}

func feeFromPrice(pi payments.Intent) int64 {
	var m map[string]any
	if json.Unmarshal(pi.PriceSnapshot, &m) == nil {
		if v, ok := m["feeIdr"].(float64); ok {
			return int64(v)
		}
	}
	return 0
}

func netFromPrice(pi payments.Intent) int64 {
	var m map[string]any
	if json.Unmarshal(pi.PriceSnapshot, &m) == nil {
		if v, ok := m["merchantNetIdr"].(float64); ok {
			return int64(v)
		}
	}
	return 0
}
