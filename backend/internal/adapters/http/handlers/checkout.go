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
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/payments"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// CheckoutHandler serves hosted checkout intents (BE-310).
type CheckoutHandler struct {
	Svc *application.CheckoutService
}

// CreateIntent handles POST /v1/checkout/intents
func (h *CheckoutHandler) CreateIntent(w http.ResponseWriter, r *http.Request) {
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Checkout unavailable"))
		return
	}
	var body createIntentBody
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	idem := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if idem == "" {
		idem = strings.TrimSpace(body.IdempotencyKey)
	}
	buyerUserID := ""
	if p, ok := reqctx.PrincipalFrom(r.Context()); ok && p.SubjectID != "" {
		buyerUserID = p.SubjectID
	}
	buyerHash := body.BuyerIdentityHash
	if buyerHash == "" && buyerUserID != "" {
		buyerHash = "user:" + buyerUserID
	}

	// Client money fields parsed only to prove ignore.
	clientUnit, _ := optionalMoney(body.UnitPrice, "unitPrice")
	clientTotal, _ := optionalMoney(body.Total, "total")
	clientDisc, _ := optionalMoney(body.Discount, "discount")
	pwyw, err := optionalMoney(body.PayWhatYouWant, "payWhatYouWant")
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	tip, err := optionalMoney(body.Tip, "tip")
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}

	res, err := h.Svc.CreateIntent(r.Context(), application.CreateIntentRequest{
		StoreID:            body.StoreID,
		ProductID:          body.ProductID,
		ClientUnitPriceIDR: clientUnit,
		ClientTotalIDR:     clientTotal,
		PayWhatYouWantIDR:  pwyw,
		TipIDR:             tip,
		UpsellProductIDs:   body.UpsellProductIDs,
		CouponCode:         body.CouponCode,
		BuyerEmail:         body.BuyerEmail,
		BuyerName:          body.BuyerName,
		BuyerUserID:        buyerUserID,
		BuyerSessionID:     body.BuyerSessionID,
		BuyerIdentityHash:  buyerHash,
		IdempotencyKey:     idem,
		ClientDiscountIDR:  clientDisc,
		LandingURL:         body.LandingURL,
		ReferrerURL:        body.ReferrerURL,
		UTMSource:          body.UTMSource,
		UTMMedium:          body.UTMMedium,
		UTMCampaign:        body.UTMCampaign,
		UTMContent:         body.UTMContent,
		UTMTerm:            body.UTMTerm,
		VisitorID:          body.VisitorID,
		UserAgent:          r.UserAgent(),
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	status := http.StatusCreated
	if res.Replayed {
		status = http.StatusOK
	}
	presenters.WriteData(w, r, status, intentDTO(res))
}

// GetIntent handles GET /v1/checkout/intents/{intentId}
func (h *CheckoutHandler) GetIntent(w http.ResponseWriter, r *http.Request) {
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Checkout unavailable"))
		return
	}
	id := chi.URLParam(r, "intentId")
	pi, ord, err := h.Svc.GetIntent(r.Context(), id)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, intentStatusDTO(pi, ord))
}

// ExpireIntent handles POST /v1/checkout/intents/{intentId}/expire
func (h *CheckoutHandler) ExpireIntent(w http.ResponseWriter, r *http.Request) {
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Checkout unavailable"))
		return
	}
	id := chi.URLParam(r, "intentId")
	idem := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	var body expireBody
	_ = decode.DecodeJSON(r, &body) // body optional
	if idem == "" {
		idem = strings.TrimSpace(body.IdempotencyKey)
	}
	pi, code, err := h.Svc.ExpireIntent(r.Context(), application.ExpireIntentRequest{
		IntentID:       id,
		IdempotencyKey: idem,
		Reason:         body.Reason,
		BuyerSessionID: body.BuyerSessionID,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	if code == 0 {
		code = http.StatusOK
	}
	ord, _, _ := h.Svc.GetOrderPublic(r.Context(), pi.OrderID)
	presenters.WriteData(w, r, code, intentStatusDTO(pi, ord))
}

// GetOrder handles GET /v1/orders/{orderId} public buyer polling state.
func (h *CheckoutHandler) GetOrder(w http.ResponseWriter, r *http.Request) {
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Checkout unavailable"))
		return
	}
	id := chi.URLParam(r, "orderId")
	ord, pi, err := h.Svc.GetOrderPublic(r.Context(), id)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, orderPublicDTO(ord, pi))
}

// SimulatePayment handles POST /v1/checkout/simulate-payment (local/test only).
func (h *CheckoutHandler) SimulatePayment(w http.ResponseWriter, r *http.Request) {
	if h.Svc == nil || !h.Svc.SimulateEnabled {
		presenters.WriteAppError(w, r, payments.ErrSimulateDisabled)
		return
	}
	var body struct {
		PaymentIntentID string `json:"paymentIntentId"`
		IntentID        string `json:"intentId"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	id := body.PaymentIntentID
	if id == "" {
		id = body.IntentID
	}
	pi, err := h.Svc.SimulatePayment(r.Context(), id)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	ord, _, _ := h.Svc.GetOrderPublic(r.Context(), pi.OrderID)
	presenters.WriteData(w, r, http.StatusOK, intentStatusDTO(pi, ord))
}

type createIntentBody struct {
	StoreID           string   `json:"storeId"`
	ProductID         string   `json:"productId"`
	UnitPrice         any      `json:"unitPrice"` // ignored
	Total             any      `json:"total"`     // ignored
	Discount          any      `json:"discount"`  // ignored
	PayWhatYouWant    any      `json:"payWhatYouWant"`
	Tip               any      `json:"tip"`
	UpsellProductIDs  []string `json:"upsellProductIds"`
	CouponCode        string   `json:"couponCode"`
	BuyerEmail        string   `json:"buyerEmail"`
	BuyerName         string   `json:"buyerName"`
	BuyerSessionID    string   `json:"buyerSessionId"`
	BuyerIdentityHash string   `json:"buyerIdentityHash"`
	IdempotencyKey    string   `json:"idempotencyKey"`
	// Attribution (BE-360) — server strips secret/PII query keys.
	LandingURL  string `json:"landingUrl"`
	ReferrerURL string `json:"referrerUrl"`
	UTMSource   string `json:"utmSource"`
	UTMMedium   string `json:"utmMedium"`
	UTMCampaign string `json:"utmCampaign"`
	UTMContent  string `json:"utmContent"`
	UTMTerm     string `json:"utmTerm"`
	VisitorID   string `json:"visitorId"`
}

type expireBody struct {
	IdempotencyKey string `json:"idempotencyKey"`
	Reason         string `json:"reason"`
	BuyerSessionID string `json:"buyerSessionId"`
}

func intentDTO(res application.CreateIntentResult) map[string]any {
	pi := res.Intent
	out := map[string]any{
		"paymentIntentId":   pi.ID,
		"orderId":           pi.OrderID,
		"orderNumber":       res.Order.OrderNumber,
		"status":            pi.Status,
		"source":            pi.Source,
		"paymentMode":       pi.PaymentMode,
		"currency":          pi.Currency,
		"amount":            pi.AmountIDR,
		"subtotal":          res.SubtotalIDR,
		"discount":          res.DiscountIDR,
		"tip":               res.TipIDR,
		"fee":               res.FeeIDR,
		"merchantNet":       res.MerchantNetIDR,
		"gross":             res.GrossIDR,
		"expiresAt":         pi.ExpiresAt.UTC().Format(time.RFC3339),
		"provider":          pi.Provider,
		"accountScope":      pi.AccountScope,
		"providerReference": nilString(pi.ProviderReference),
		"qrString":          nilString(pi.QRString),
		"qrImageUrl":        nilString(pi.QRImageURL),
		"feeSnapshotId":     nilString(pi.FeeSnapshotID),
		"replayed":          res.Replayed,
	}
	if res.PublicToken != "" {
		out["publicToken"] = res.PublicToken
	}
	if pi.FeeSnapshotID != nil {
		out["feeSnapshotId"] = *pi.FeeSnapshotID
	}
	return out
}

func intentStatusDTO(pi payments.Intent, ord application.CheckoutOrder) map[string]any {
	return map[string]any{
		"paymentIntentId":   pi.ID,
		"orderId":           pi.OrderID,
		"orderNumber":       ord.OrderNumber,
		"status":            pi.Status,
		"orderStatus":       ord.OrderStatus,
		"paymentStatus":     ord.PaymentStatus,
		"source":            pi.Source,
		"paymentMode":       pi.PaymentMode,
		"currency":          pi.Currency,
		"amount":            pi.AmountIDR,
		"subtotal":          ord.SubtotalIDR,
		"discount":          ord.DiscountIDR,
		"tip":               ord.TipIDR,
		"fee":               ord.FeeIDR,
		"merchantNet":       ord.MerchantNetIDR,
		"gross":             ord.GrossIDR,
		"expiresAt":         pi.ExpiresAt.UTC().Format(time.RFC3339),
		"providerReference": nilString(pi.ProviderReference),
		"qrString":          nilString(pi.QRString),
		"qrImageUrl":        nilString(pi.QRImageURL),
		"paidLate":          pi.PaidLate,
	}
}

func orderPublicDTO(ord application.CheckoutOrder, pi payments.Intent) map[string]any {
	out := map[string]any{
		"orderId":       ord.ID,
		"orderNumber":   ord.OrderNumber,
		"orderStatus":   ord.OrderStatus,
		"paymentStatus": ord.PaymentStatus,
		"source":        ord.Source,
		"currency":      ord.Currency,
		"subtotal":      ord.SubtotalIDR,
		"discount":      ord.DiscountIDR,
		"tip":           ord.TipIDR,
		"fee":           ord.FeeIDR,
		"gross":         ord.GrossIDR,
		"merchantNet":   ord.MerchantNetIDR,
		"createdAt":     ord.CreatedAt.UTC().Format(time.RFC3339),
	}
	if pi.ID != "" {
		out["paymentIntentId"] = pi.ID
		out["paymentStatusDetail"] = pi.Status
		out["amount"] = pi.AmountIDR
		out["expiresAt"] = pi.ExpiresAt.UTC().Format(time.RFC3339)
		out["qrImageUrl"] = nilString(pi.QRImageURL)
		// Do not re-expose full qrString on order poll if sensitive; still return for pending QR display.
		out["qrString"] = nilString(pi.QRString)
	}
	return out
}

func nilString(p *string) any {
	if p == nil {
		return nil
	}
	return *p
}
