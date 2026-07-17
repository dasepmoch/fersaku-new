package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/decode"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/delivery"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/invoices"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// DeliveryHandler serves delivery grants + immutable invoices (BE-235).
type DeliveryHandler struct {
	Svc *application.DeliveryService
}

// --- buyer ---

func (h *DeliveryHandler) BuyerAccess(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Delivery unavailable"))
		return
	}
	out, err := h.Svc.AccessByBuyerSession(r.Context(), p.SubjectID, chi.URLParam(r, "orderId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	presenters.WriteData(w, r, http.StatusOK, accessDTO(out))
}

func (h *DeliveryHandler) BuyerResend(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Delivery unavailable"))
		return
	}
	var body struct {
		IdempotencyKey string `json:"idempotencyKey"`
		Reason         string `json:"reason"`
	}
	_ = decode.DecodeJSON(r, &body)
	idem := body.IdempotencyKey
	if idem == "" {
		idem = r.Header.Get("Idempotency-Key")
	}
	out, err := h.Svc.Resend(r.Context(), application.ResendInput{
		ActorUserID:    p.SubjectID,
		ActorKind:      delivery.ActorBuyer,
		OrderID:        chi.URLParam(r, "orderId"),
		IdempotencyKey: idem,
		Reason:         body.Reason,
		RotateToken:    true,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	// Buyer resend does not return secrets in API — only optional rotated token for guest exchange.
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"grantId": out.GrantID,
		"orderId": out.OrderID,
		"status":  out.Status,
		"queued":  true,
	})
}

func (h *DeliveryHandler) BuyerInvoice(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Delivery unavailable"))
		return
	}
	inv, ver, err := h.Svc.GetInvoiceByOrder(r.Context(), p.SubjectID, chi.URLParam(r, "orderId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, invoiceDTO(inv, ver))
}

// --- order-scoped (buyer session or seller) ---

func (h *DeliveryHandler) OrderAccess(w http.ResponseWriter, r *http.Request) {
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Delivery unavailable"))
		return
	}
	var body struct {
		Token string `json:"token"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	// Prefer session ownership when present; else token exchange.
	if p, ok := reqctx.PrincipalFrom(r.Context()); ok && p.SubjectID != "" {
		out, err := h.Svc.AccessByBuyerSession(r.Context(), p.SubjectID, chi.URLParam(r, "orderId"))
		if err == nil {
			w.Header().Set("Cache-Control", "no-store")
			presenters.WriteData(w, r, http.StatusOK, accessDTO(out))
			return
		}
		// Fall through to token if session not owner.
	}
	out, err := h.Svc.AccessByToken(r.Context(), body.Token)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	// Ensure token grant matches path orderId.
	if out.OrderID != chi.URLParam(r, "orderId") {
		presenters.WriteAppError(w, r, delivery.ErrNotFound)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	presenters.WriteData(w, r, http.StatusOK, accessDTO(out))
}

func (h *DeliveryHandler) OrderInvoiceGet(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Delivery unavailable"))
		return
	}
	inv, ver, err := h.Svc.GetInvoiceByOrder(r.Context(), p.SubjectID, chi.URLParam(r, "orderId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, invoiceDTO(inv, ver))
}

func (h *DeliveryHandler) OrderInvoicePost(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Delivery unavailable"))
		return
	}
	// Idempotent ensure: cannot accept amounts from client.
	inv, ver, err := h.Svc.EnsureInvoice(r.Context(), p.SubjectID, chi.URLParam(r, "orderId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	// On-demand render status.
	if _, rerr := h.Svc.RenderInvoiceStatus(r.Context(), inv.ID); rerr == nil {
		inv, ver, _ = h.Svc.GetInvoiceByOrder(r.Context(), p.SubjectID, chi.URLParam(r, "orderId"))
	}
	presenters.WriteData(w, r, http.StatusOK, invoiceDTO(inv, ver))
}

// --- seller ---

func (h *DeliveryHandler) SellerResend(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Delivery unavailable"))
		return
	}
	var body struct {
		IdempotencyKey string `json:"idempotencyKey"`
		Reason         string `json:"reason"`
	}
	_ = decode.DecodeJSON(r, &body)
	idem := body.IdempotencyKey
	if idem == "" {
		idem = r.Header.Get("Idempotency-Key")
	}
	out, err := h.Svc.Resend(r.Context(), application.ResendInput{
		ActorUserID:    p.SubjectID,
		ActorKind:      delivery.ActorSeller,
		OrderID:        chi.URLParam(r, "orderId"),
		StoreID:        chi.URLParam(r, "storeId"),
		IdempotencyKey: idem,
		Reason:         body.Reason,
		RotateToken:    false, // seller resend never returns secret/token
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"grantId": out.GrantID,
		"orderId": out.OrderID,
		"status":  out.Status,
		"queued":  true,
	})
}

func (h *DeliveryHandler) SellerRetry(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Delivery unavailable"))
		return
	}
	var body struct {
		IdempotencyKey string `json:"idempotencyKey"`
		Reason         string `json:"reason"`
	}
	_ = decode.DecodeJSON(r, &body)
	idem := body.IdempotencyKey
	if idem == "" {
		idem = r.Header.Get("Idempotency-Key")
	}
	g, err := h.Svc.Retry(r.Context(), application.RetryInput{
		ActorUserID:    p.SubjectID,
		ActorKind:      delivery.ActorSeller,
		OrderID:        chi.URLParam(r, "orderId"),
		StoreID:        chi.URLParam(r, "storeId"),
		IdempotencyKey: idem,
		Reason:         body.Reason,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, grantDTO(g))
}

func (h *DeliveryHandler) SellerRevoke(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Delivery unavailable"))
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	_ = decode.DecodeJSON(r, &body)
	g, err := h.Svc.RevokeAccess(r.Context(), p.SubjectID, delivery.ActorSeller, chi.URLParam(r, "orderId"), chi.URLParam(r, "storeId"), body.Reason)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, grantDTO(g))
}

func (h *DeliveryHandler) SellerGetGrant(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Delivery unavailable"))
		return
	}
	g, err := h.Svc.GetGrantForSeller(r.Context(), p.SubjectID, chi.URLParam(r, "storeId"), chi.URLParam(r, "orderId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, grantDTO(g))
}

// --- admin ---

func (h *DeliveryHandler) AdminForceFulfill(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Delivery unavailable"))
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	_ = decode.DecodeJSON(r, &body)
	g, err := h.Svc.ForceFulfill(r.Context(), p.SubjectID, chi.URLParam(r, "orderId"), body.Reason)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	// Never return secrets.
	presenters.WriteData(w, r, http.StatusOK, grantDTO(g))
}

func (h *DeliveryHandler) AdminRevoke(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Delivery unavailable"))
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	_ = decode.DecodeJSON(r, &body)
	g, err := h.Svc.RevokeAccess(r.Context(), p.SubjectID, delivery.ActorAdmin, chi.URLParam(r, "orderId"), "", body.Reason)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, grantDTO(g))
}

// --- invoices ---

func (h *DeliveryHandler) GetInvoice(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Delivery unavailable"))
		return
	}
	inv, ver, err := h.Svc.GetInvoice(r.Context(), p.SubjectID, chi.URLParam(r, "invoiceId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, invoiceDTO(inv, ver))
}

func (h *DeliveryHandler) PublicVerify(w http.ResponseWriter, r *http.Request) {
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Delivery unavailable"))
		return
	}
	// Support POST body {token} and GET /verify/{code}
	var raw string
	if code := chi.URLParam(r, "code"); code != "" {
		raw = code
	} else {
		var body struct {
			Token string `json:"token"`
			Code  string `json:"code"`
		}
		if err := decode.DecodeJSON(r, &body); err != nil {
			presenters.WriteAppError(w, r, err)
			return
		}
		raw = body.Token
		if raw == "" {
			raw = body.Code
		}
	}
	out, err := h.Svc.PublicVerify(r.Context(), raw)
	if err != nil {
		// Generic not found for invalid token (no enumeration of codes).
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, publicVerifyDTO(out))
}

// CreatePaidStub is a local/test-only activation hook (no live Xendit).
func (h *DeliveryHandler) CreatePaidStub(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Delivery unavailable"))
		return
	}
	var body struct {
		StoreID            string `json:"storeId"`
		ProductID          string `json:"productId"`
		BuyerUserID        string `json:"buyerUserId"`
		BuyerEmail         string `json:"buyerEmail"`
		BuyerName          string `json:"buyerName"`
		Quantity           int32  `json:"quantity"`
		StockItemID        string `json:"stockItemId"`
		StockReservationID string `json:"stockReservationId"`
		UnitPriceIDR       *int64 `json:"unitPriceIdr"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	buyerID := body.BuyerUserID
	if buyerID == "" {
		buyerID = p.SubjectID
	}
	out, err := h.Svc.CreatePaidOrderAndGrant(r.Context(), application.CreatePaidOrderInput{
		StoreID:            body.StoreID,
		ProductID:          body.ProductID,
		BuyerUserID:        buyerID,
		BuyerEmail:         body.BuyerEmail,
		BuyerName:          body.BuyerName,
		Quantity:           body.Quantity,
		StockItemID:        body.StockItemID,
		StockReservationID: body.StockReservationID,
		UnitPriceIDR:       body.UnitPriceIDR,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusCreated, map[string]any{
		"orderId":       out.Order.ID,
		"orderNumber":   out.Order.OrderNumber,
		"orderItemId":   out.Item.ID,
		"grantId":       out.Grant.ID,
		"invoiceId":     out.Invoice.ID,
		"invoiceNumber": out.Invoice.InvoiceNumber,
		"accessToken":   out.AccessToken,
		"publicCode":    out.PublicCode,
		"grossIdr":      out.Order.GrossIDR,
		"unitPriceIdr":  out.Item.UnitPriceIDR,
		"paymentStatus": out.Order.PaymentStatus,
	})
}

func accessDTO(a delivery.AccessResult) map[string]any {
	m := map[string]any{
		"grantId":      a.GrantID,
		"orderId":      a.OrderID,
		"orderItemId":  a.OrderItemID,
		"deliveryKind": a.DeliveryKind,
		"status":       a.Status,
		"accessCount":  a.AccessCount,
		"maxAccesses":  a.MaxAccesses,
	}
	if a.ExpiresAt != nil {
		m["expiresAt"] = a.ExpiresAt.UTC().Format(time.RFC3339Nano)
	}
	if a.DownloadObjectID != nil {
		m["downloadObjectId"] = *a.DownloadObjectID
	}
	if a.Secrets != nil {
		m["secrets"] = a.Secrets
	}
	return m
}

func grantDTO(g delivery.Grant) map[string]any {
	m := map[string]any{
		"id":                   g.ID,
		"orderId":              g.OrderID,
		"orderItemId":          g.OrderItemID,
		"storeId":              g.StoreID,
		"productId":            g.ProductID,
		"deliveryKind":         g.DeliveryKind,
		"status":               g.Status,
		"fulfillmentEffectKey": g.FulfillmentEffectKey,
		"accessCount":          g.AccessCount,
		"maxAccesses":          g.MaxAccesses,
		"version":              g.Version,
	}
	if g.StockItemID != nil {
		m["stockItemId"] = *g.StockItemID
	}
	if g.RevokedAt != nil {
		m["revokedAt"] = g.RevokedAt.UTC().Format(time.RFC3339Nano)
	}
	// Never include access token hash or secrets.
	return m
}

func invoiceDTO(inv invoices.Invoice, ver invoices.Version) map[string]any {
	return map[string]any{
		"id":              inv.ID,
		"orderId":         inv.OrderID,
		"storeId":         inv.StoreID,
		"invoiceNumber":   inv.InvoiceNumber,
		"status":          inv.Status,
		"currency":        inv.Currency,
		"grossIdr":        inv.GrossIDR,
		"paidAt":          timePtr(inv.PaidAt),
		"currentVersion":  inv.CurrentVersion,
		"payloadHash":     ver.PayloadHash,
		"rendererVersion": ver.RendererVersion,
		"renderStatus":    ver.RenderStatus,
		"snapshot":        jsonRawOrMap(ver.Snapshot),
	}
}

func publicVerifyDTO(v invoices.PublicVerify) map[string]any {
	m := map[string]any{
		"valid": v.Valid,
	}
	if !v.Valid {
		return m
	}
	m["invoiceNumber"] = v.InvoiceNumber
	m["orderNumber"] = v.OrderNumber
	m["currency"] = v.Currency
	m["grossIdr"] = v.GrossIDR
	m["storeName"] = v.StoreName
	if v.PaidAt != nil {
		m["paidAt"] = v.PaidAt.UTC().Format(time.RFC3339Nano)
	}
	return m
}

func timePtr(t *time.Time) any {
	if t == nil {
		return nil
	}
	return t.UTC().Format(time.RFC3339Nano)
}

func jsonRawOrMap(b []byte) any {
	if len(b) == 0 {
		return map[string]any{}
	}
	var v any
	if err := json.Unmarshal(b, &v); err != nil {
		return string(b)
	}
	return v
}
