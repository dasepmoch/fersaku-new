package handlers

import (
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/decode"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/payments"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// CallbackHandler serves inbound provider webhooks + admin replay (BE-330, PROD-B20).
type CallbackHandler struct {
	Svc *application.CallbackService
}

// XenditWebhook handles POST /v1/webhooks/xendit
// Token via X-Callback-Token (Xendit standard) or x-callback-token.
func (h *CallbackHandler) XenditWebhook(w http.ResponseWriter, r *http.Request) {
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Webhook unavailable"))
		return
	}
	// Read raw body with hard limit (+1 to detect oversize).
	r.Body = http.MaxBytesReader(w, r.Body, payments.MaxCallbackBodyBytes+1)
	body, err := io.ReadAll(r.Body)
	if err != nil {
		// Oversize or read error
		res, _ := h.Svc.HandleIngress(r.Context(), application.IngressRequest{
			Body:        make([]byte, payments.MaxCallbackBodyBytes+1),
			TokenHeader: callbackToken(r),
			ContentType: r.Header.Get("Content-Type"),
			ClientIP:    reqctx.ClientIP(r.Context()),
			RequestID:   reqctx.RequestID(r.Context()),
		})
		// Force oversize path if MaxBytesReader failed
		if res.HTTPStatus == 0 {
			w.WriteHeader(http.StatusRequestEntityTooLarge)
			return
		}
		w.WriteHeader(res.HTTPStatus)
		return
	}

	token := callbackToken(r)
	mode := ""
	if strings.Contains(r.URL.Path, "/sandbox") {
		mode = payments.PaymentModeSandbox
	} else if strings.Contains(r.URL.Path, "/live") {
		mode = payments.PaymentModeLive
	}

	res, err := h.Svc.HandleIngress(r.Context(), application.IngressRequest{
		Body:                body,
		TokenHeader:         token,
		ContentType:         r.Header.Get("Content-Type"),
		ClientIP:            reqctx.ClientIP(r.Context()),
		RequestID:           reqctx.RequestID(r.Context()),
		PaymentModeOverride: mode,
	})
	if err != nil && res.HTTPStatus >= 500 {
		presenters.WriteAppError(w, r, err)
		return
	}
	// Xendit expects 2xx to stop retries on accept; 401 on bad token.
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(res.HTTPStatus)
	if res.Accepted {
		_, _ = w.Write([]byte(`{"ok":true}`))
		return
	}
	_, _ = w.Write([]byte(`{"ok":false}`))
}

func callbackToken(r *http.Request) string {
	if t := strings.TrimSpace(r.Header.Get("X-Callback-Token")); t != "" {
		return t
	}
	if t := strings.TrimSpace(r.Header.Get("x-callback-token")); t != "" {
		return t
	}
	// Some Xendit configs use Authorization: Bearer <token> for webhooks.
	auth := strings.TrimSpace(r.Header.Get("Authorization"))
	if strings.HasPrefix(strings.ToLower(auth), "bearer ") {
		return strings.TrimSpace(auth[7:])
	}
	return ""
}

// DuitkuWebhook handles POST /v1/webhooks/duitku (+ /sandbox /live).
// Auth: body signature HMAC-SHA256(merchantCode + amount + merchantOrderId, apiKey); merchantCode match.
// Success response: 200 text/plain "SUCCESS" (docs.duitku.com contract freeze 2026-07-20).
func (h *CallbackHandler) DuitkuWebhook(w http.ResponseWriter, r *http.Request) {
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Webhook unavailable"))
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, payments.MaxCallbackBodyBytes+1)
	body, err := io.ReadAll(r.Body)
	if err != nil {
		// Oversize or read error — force oversize path when possible.
		res, _ := h.Svc.HandleDuitkuIngress(r.Context(), application.DuitkuIngressRequest{
			Body:        make([]byte, payments.MaxCallbackBodyBytes+1),
			ContentType: r.Header.Get("Content-Type"),
			ClientIP:    reqctx.ClientIP(r.Context()),
			RequestID:   reqctx.RequestID(r.Context()),
		})
		if res.HTTPStatus == 0 {
			w.WriteHeader(http.StatusRequestEntityTooLarge)
			return
		}
		writeDuitkuWebhookResponse(w, res)
		return
	}

	mode := ""
	if strings.Contains(r.URL.Path, "/sandbox") {
		mode = payments.PaymentModeSandbox
	} else if strings.Contains(r.URL.Path, "/live") {
		mode = payments.PaymentModeLive
	}

	res, err := h.Svc.HandleDuitkuIngress(r.Context(), application.DuitkuIngressRequest{
		Body:                body,
		ContentType:         r.Header.Get("Content-Type"),
		ClientIP:            reqctx.ClientIP(r.Context()),
		RequestID:           reqctx.RequestID(r.Context()),
		PaymentModeOverride: mode,
	})
	if err != nil && res.HTTPStatus >= 500 {
		presenters.WriteAppError(w, r, err)
		return
	}
	writeDuitkuWebhookResponse(w, res)
}

func writeDuitkuWebhookResponse(w http.ResponseWriter, res application.IngressResult) {
	// Provider requires HTTP 200 on accept; body SUCCESS per active API contract (GAP-01).
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(res.HTTPStatus)
	if res.Accepted {
		_, _ = w.Write([]byte("SUCCESS"))
		return
	}
	_, _ = w.Write([]byte("FAILED"))
}

// AdminList handles GET /v1/admin/provider-callbacks
func (h *CallbackHandler) AdminList(w http.ResponseWriter, r *http.Request) {
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Unavailable"))
		return
	}
	events, err := h.Svc.ListAdminEvents(r.Context(), 50)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	list := make([]map[string]any, 0, len(events))
	for _, e := range events {
		list = append(list, providerEventDTO(e))
	}
	presenters.WriteData(w, r, http.StatusOK, list)
}

// AdminGet handles GET /v1/admin/provider-callbacks/{callbackId}
func (h *CallbackHandler) AdminGet(w http.ResponseWriter, r *http.Request) {
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Unavailable"))
		return
	}
	id := chi.URLParam(r, "callbackId")
	ev, err := h.Svc.GetAdminEvent(r.Context(), id)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, providerEventDTO(ev))
}

// AdminReplay handles POST /v1/admin/provider-callbacks/{callbackId}/replay
func (h *CallbackHandler) AdminReplay(w http.ResponseWriter, r *http.Request) {
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Unavailable"))
		return
	}
	id := chi.URLParam(r, "callbackId")
	var body struct {
		Reason string `json:"reason"`
	}
	_ = decode.DecodeJSON(r, &body)
	if strings.TrimSpace(body.Reason) == "" {
		body.Reason = "admin_replay"
	}
	actor := ""
	if p, ok := reqctx.PrincipalFrom(r.Context()); ok {
		actor = p.SubjectID
	}
	ev, err := h.Svc.ReplayInbound(r.Context(), id, body.Reason, actor)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, providerEventDTO(ev))
}

func providerEventDTO(e payments.ProviderEvent) map[string]any {
	// Never include encrypted_payload / secrets.
	dto := map[string]any{
		"callbackId":      e.CallbackID,
		"provider":        e.Provider,
		"accountScope":    e.AccountScope,
		"paymentMode":     e.PaymentMode,
		"providerEventId": e.ProviderEventID,
		"processingState": e.ProcessingState,
		"receivedAt":      e.ReceivedAt.UTC().Format("2006-01-02T15:04:05Z07:00"),
		"attemptCount":    e.AttemptCount,
		"replayCount":     e.ReplayCount,
	}
	if e.NormalizedType != nil {
		dto["normalizedType"] = *e.NormalizedType
	}
	if e.PaymentIntentID != nil {
		dto["paymentIntentId"] = *e.PaymentIntentID
	}
	if e.ProviderReference != nil {
		dto["providerReference"] = *e.ProviderReference
	}
	if e.PayloadDigest != nil {
		dto["payloadDigest"] = *e.PayloadDigest
	}
	if e.MismatchCode != nil {
		dto["mismatchCode"] = *e.MismatchCode
	}
	if e.AlertCode != nil {
		dto["alertCode"] = *e.AlertCode
	}
	if e.FailureCode != nil {
		dto["failureCode"] = *e.FailureCode
	}
	if e.ProcessedAt != nil {
		dto["processedAt"] = e.ProcessedAt.UTC().Format("2006-01-02T15:04:05Z07:00")
	}
	return dto
}
