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
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/coupons"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// CouponHandler serves seller coupon CRUD and checkout quote/reserve (BE-215).
type CouponHandler struct {
	Svc *application.CouponService
}

// --- seller ---

func (h *CouponHandler) List(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Coupons unavailable"))
		return
	}
	storeID := chi.URLParam(r, "storeId")
	items, err := h.Svc.ListCoupons(r.Context(), p.SubjectID, storeID)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	out := make([]map[string]any, 0, len(items))
	for _, c := range items {
		out = append(out, couponDTO(c))
	}
	presenters.WriteData(w, r, http.StatusOK, out)
}

func (h *CouponHandler) Create(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Coupons unavailable"))
		return
	}
	var body couponWriteBody
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	in, err := body.toCreate()
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	storeID := chi.URLParam(r, "storeId")
	c, err := h.Svc.CreateCoupon(r.Context(), p.SubjectID, storeID, in)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusCreated, couponDTO(c))
}

func (h *CouponHandler) Get(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Coupons unavailable"))
		return
	}
	c, err := h.Svc.GetCoupon(r.Context(), p.SubjectID, chi.URLParam(r, "storeId"), chi.URLParam(r, "couponId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, couponDTO(c))
}

func (h *CouponHandler) Patch(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Coupons unavailable"))
		return
	}
	var body couponPatchBody
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	in, err := body.toPatch()
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	c, err := h.Svc.PatchCoupon(r.Context(), p.SubjectID, chi.URLParam(r, "storeId"), chi.URLParam(r, "couponId"), in)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, couponDTO(c))
}

func (h *CouponHandler) Activate(w http.ResponseWriter, r *http.Request) {
	h.stateCmd(w, r, func(svc *application.CouponService, userID, storeID, couponID string) (coupons.Coupon, error) {
		return svc.ActivateCoupon(r.Context(), userID, storeID, couponID)
	})
}

func (h *CouponHandler) Pause(w http.ResponseWriter, r *http.Request) {
	h.stateCmd(w, r, func(svc *application.CouponService, userID, storeID, couponID string) (coupons.Coupon, error) {
		return svc.PauseCoupon(r.Context(), userID, storeID, couponID)
	})
}

func (h *CouponHandler) Archive(w http.ResponseWriter, r *http.Request) {
	h.stateCmd(w, r, func(svc *application.CouponService, userID, storeID, couponID string) (coupons.Coupon, error) {
		return svc.ArchiveCoupon(r.Context(), userID, storeID, couponID)
	})
}

func (h *CouponHandler) stateCmd(w http.ResponseWriter, r *http.Request, fn func(*application.CouponService, string, string, string) (coupons.Coupon, error)) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Coupons unavailable"))
		return
	}
	if r.ContentLength > 0 {
		var body map[string]any
		_ = decode.DecodeJSON(r, &body)
	}
	c, err := fn(h.Svc, p.SubjectID, chi.URLParam(r, "storeId"), chi.URLParam(r, "couponId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, couponDTO(c))
}

// --- checkout quote (public-ish; no coupon enumeration) ---

// Quote handles POST /v1/checkout/quote and POST /v1/checkout/apply-coupon.
// Client-supplied discount is ignored; server returns authoritative price.
func (h *CouponHandler) Quote(w http.ResponseWriter, r *http.Request) {
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Coupons unavailable"))
		return
	}
	var body checkoutQuoteBody
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	// Optionally bind buyer from session for per-customer limits (hash only).
	buyerHash := body.BuyerIdentityHash
	if buyerHash == "" {
		if p, ok := reqctx.PrincipalFrom(r.Context()); ok && p.SubjectID != "" {
			buyerHash = "user:" + p.SubjectID
		}
	}
	merch, err := optionalMoney(body.Merchandise, "merchandise")
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	tip, err := optionalMoney(body.Tip, "tip")
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	upsell, err := optionalMoney(body.Upsell, "upsell")
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	// Client discount intentionally parsed only to prove ignore.
	clientDisc, _ := optionalMoney(body.ClientDiscount, "discount")
	_ = body.Discount // alias
	if body.Discount != nil && clientDisc == 0 {
		clientDisc, _ = optionalMoney(body.Discount, "discount")
	}

	res, err := h.Svc.Quote(r.Context(), application.QuoteRequest{
		StoreID:           body.StoreID,
		ProductID:         body.ProductID,
		MerchandiseIDR:    merch,
		TipIDR:            tip,
		UpsellIDR:         upsell,
		CouponCode:        body.CouponCode,
		ClientDiscountIDR: clientDisc,
		BuyerIdentityHash: buyerHash,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, priceDTO(res.Price))
}

// Reserve handles POST /v1/checkout/coupon-reservations (foundation for BE-310).
func (h *CouponHandler) Reserve(w http.ResponseWriter, r *http.Request) {
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Coupons unavailable"))
		return
	}
	var body checkoutReserveBody
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	idem := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if idem == "" {
		idem = strings.TrimSpace(body.IdempotencyKey)
	}
	if idem == "" {
		presenters.WriteAppError(w, r, apperr.Validation(apperr.CodeValidationFailed, "Idempotency-Key is required"))
		return
	}
	buyerHash := body.BuyerIdentityHash
	if buyerHash == "" {
		if p, ok := reqctx.PrincipalFrom(r.Context()); ok && p.SubjectID != "" {
			buyerHash = "user:" + p.SubjectID
		}
	}
	merch, err := optionalMoney(body.Merchandise, "merchandise")
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	tip, err := optionalMoney(body.Tip, "tip")
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	upsell, err := optionalMoney(body.Upsell, "upsell")
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	clientDisc, _ := optionalMoney(body.ClientDiscount, "discount")
	res, err := h.Svc.Reserve(r.Context(), application.ReserveRequest{
		StoreID:           body.StoreID,
		ProductID:         body.ProductID,
		OrderID:           body.OrderID,
		IdempotencyKey:    idem,
		MerchandiseIDR:    merch,
		TipIDR:            tip,
		UpsellIDR:         upsell,
		CouponCode:        body.CouponCode,
		ClientDiscountIDR: clientDisc,
		BuyerIdentityHash: buyerHash,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	status := http.StatusCreated
	if res.Replayed {
		status = http.StatusOK
	}
	presenters.WriteData(w, r, status, map[string]any{
		"reservation": reservationDTO(res.Reservation),
		"price":       priceDTO(res.Price),
		"replayed":    res.Replayed,
	})
}

// --- bodies ---

type couponWriteBody struct {
	Code               string   `json:"code"`
	DiscountKind       string   `json:"discountKind"`
	DiscountValue      any      `json:"discountValue"`
	PercentIsBps       bool     `json:"percentIsBps"`
	MinMerchandise     any      `json:"minMerchandise"`
	MaxTotalUses       *int64   `json:"maxTotalUses"`
	MaxPerCustomerUses *int64   `json:"maxPerCustomerUses"`
	StartsAt           *string  `json:"startsAt"`
	EndsAt             *string  `json:"endsAt"`
	Scope              string   `json:"scope"`
	ProductIDs         []string `json:"productIds"`
}

func (b couponWriteBody) toCreate() (application.CreateCouponInput, error) {
	val, err := parseMoneyField(b.DiscountValue, "discountValue")
	if err != nil {
		return application.CreateCouponInput{}, err
	}
	minM, err := optionalMoney(b.MinMerchandise, "minMerchandise")
	if err != nil {
		return application.CreateCouponInput{}, err
	}
	starts, err := parseOptionalTime(b.StartsAt)
	if err != nil {
		return application.CreateCouponInput{}, err
	}
	ends, err := parseOptionalTime(b.EndsAt)
	if err != nil {
		return application.CreateCouponInput{}, err
	}
	return application.CreateCouponInput{
		Code:               b.Code,
		DiscountKind:       b.DiscountKind,
		DiscountValue:      val,
		PercentIsBps:       b.PercentIsBps,
		MinMerchandiseIDR:  minM,
		MaxTotalUses:       b.MaxTotalUses,
		MaxPerCustomerUses: b.MaxPerCustomerUses,
		StartsAt:           starts,
		EndsAt:             ends,
		Scope:              b.Scope,
		ProductIDs:         b.ProductIDs,
	}, nil
}

type couponPatchBody struct {
	ExpectedVersion     int32     `json:"expectedVersion"`
	Code                *string   `json:"code"`
	DiscountKind        *string   `json:"discountKind"`
	DiscountValue       any       `json:"discountValue"`
	PercentIsBps        bool      `json:"percentIsBps"`
	MinMerchandise      any       `json:"minMerchandise"`
	MaxTotalUses        *int64    `json:"maxTotalUses"`
	ClearMaxTotalUses   bool      `json:"clearMaxTotalUses"`
	MaxPerCustomerUses  *int64    `json:"maxPerCustomerUses"`
	ClearMaxPerCustomer bool      `json:"clearMaxPerCustomerUses"`
	StartsAt            *string   `json:"startsAt"`
	ClearStartsAt       bool      `json:"clearStartsAt"`
	EndsAt              *string   `json:"endsAt"`
	ClearEndsAt         bool      `json:"clearEndsAt"`
	Scope               *string   `json:"scope"`
	ProductIDs          *[]string `json:"productIds"`
}

func (b couponPatchBody) toPatch() (application.PatchCouponInput, error) {
	in := application.PatchCouponInput{
		ExpectedVersion:     b.ExpectedVersion,
		Code:                b.Code,
		DiscountKind:        b.DiscountKind,
		PercentIsBps:        b.PercentIsBps,
		MaxTotalUses:        b.MaxTotalUses,
		ClearMaxTotal:       b.ClearMaxTotalUses,
		MaxPerCustomerUses:  b.MaxPerCustomerUses,
		ClearMaxPerCustomer: b.ClearMaxPerCustomer,
		ClearStartsAt:       b.ClearStartsAt,
		ClearEndsAt:         b.ClearEndsAt,
		Scope:               b.Scope,
		ProductIDs:          b.ProductIDs,
	}
	if b.DiscountValue != nil {
		val, err := parseMoneyField(b.DiscountValue, "discountValue")
		if err != nil {
			return application.PatchCouponInput{}, err
		}
		in.DiscountValue = &val
	}
	if b.MinMerchandise != nil {
		m, err := parseMoneyField(b.MinMerchandise, "minMerchandise")
		if err != nil {
			return application.PatchCouponInput{}, err
		}
		in.MinMerchandiseIDR = &m
	}
	if b.StartsAt != nil {
		t, err := parseOptionalTime(b.StartsAt)
		if err != nil {
			return application.PatchCouponInput{}, err
		}
		in.StartsAt = t
	}
	if b.EndsAt != nil {
		t, err := parseOptionalTime(b.EndsAt)
		if err != nil {
			return application.PatchCouponInput{}, err
		}
		in.EndsAt = t
	}
	return in, nil
}

type checkoutQuoteBody struct {
	StoreID           string `json:"storeId"`
	ProductID         string `json:"productId"`
	Merchandise       any    `json:"merchandise"`
	Tip               any    `json:"tip"`
	Upsell            any    `json:"upsell"`
	CouponCode        string `json:"couponCode"`
	ClientDiscount    any    `json:"clientDiscount"`
	Discount          any    `json:"discount"` // alias — also ignored
	BuyerIdentityHash string `json:"buyerIdentityHash"`
}

type checkoutReserveBody struct {
	StoreID           string `json:"storeId"`
	ProductID         string `json:"productId"`
	OrderID           string `json:"orderId"`
	IdempotencyKey    string `json:"idempotencyKey"`
	Merchandise       any    `json:"merchandise"`
	Tip               any    `json:"tip"`
	Upsell            any    `json:"upsell"`
	CouponCode        string `json:"couponCode"`
	ClientDiscount    any    `json:"clientDiscount"`
	BuyerIdentityHash string `json:"buyerIdentityHash"`
}

func optionalMoney(v any, field string) (int64, error) {
	if v == nil {
		return 0, nil
	}
	return parseMoneyField(v, field)
}

func parseOptionalTime(s *string) (*time.Time, error) {
	if s == nil || strings.TrimSpace(*s) == "" {
		return nil, nil
	}
	t, err := time.Parse(time.RFC3339, strings.TrimSpace(*s))
	if err != nil {
		// date-only
		t, err = time.Parse("2006-01-02", strings.TrimSpace(*s))
		if err != nil {
			return nil, apperr.Validation(apperr.CodeValidationFailed, "Invalid datetime")
		}
	}
	tt := t.UTC()
	return &tt, nil
}

func couponDTO(c coupons.Coupon) map[string]any {
	out := map[string]any{
		"id":                c.ID,
		"storeId":           c.StoreID,
		"merchantId":        c.MerchantID,
		"code":              c.CodeDisplay,
		"discountKind":      string(c.DiscountKind),
		"discountValue":     c.DiscountValue,
		"minMerchandise":    c.MinMerchandiseIDR,
		"state":             string(c.State),
		"scope":             string(c.Scope),
		"version":           c.Version,
		"policyVersion":     c.PolicyVersion,
		"reservedCount":     c.ReservedCount,
		"redeemedCount":     c.RedeemedCount,
		"usageCount":        c.ReservedCount + c.RedeemedCount,
		"productIds":        c.ProductIDs,
		"createdAt":         c.CreatedAt.UTC().Format(time.RFC3339),
		"updatedAt":         c.UpdatedAt.UTC().Format(time.RFC3339),
	}
	if c.ProductIDs == nil {
		out["productIds"] = []string{}
	}
	if c.MaxTotalUses != nil {
		out["maxTotalUses"] = *c.MaxTotalUses
	}
	if c.MaxPerCustomerUses != nil {
		out["maxPerCustomerUses"] = *c.MaxPerCustomerUses
	}
	if c.StartsAt != nil {
		out["startsAt"] = c.StartsAt.UTC().Format(time.RFC3339)
	}
	if c.EndsAt != nil {
		out["endsAt"] = c.EndsAt.UTC().Format(time.RFC3339)
	}
	// Human-friendly percent display when PERCENT (bps → whole percent if divisible).
	if c.DiscountKind == coupons.KindPercent && c.DiscountValue%100 == 0 {
		out["discountPercent"] = c.DiscountValue / 100
	}
	return out
}

func priceDTO(p coupons.PriceSnapshot) map[string]any {
	out := map[string]any{
		"storeId":             p.StoreID,
		"productId":           p.ProductID,
		"merchandise":         p.MerchandiseIDR,
		"tip":                 p.TipIDR,
		"upsell":              p.UpsellIDR,
		"eligibleSubtotal":    p.EligibleSubtotalIDR,
		"discount":            p.DiscountIDR,
		"gross":               p.GrossIDR,
		"couponApplied":       p.CouponApplied,
		"couponUnavailable":   p.CouponUnavailable,
		// Explicit: client discount never applied
		"clientDiscountIgnored": true,
	}
	if p.CouponApplied {
		out["couponId"] = p.CouponID
		out["couponCode"] = p.CouponCode
		out["couponPolicyVersion"] = p.CouponPolicyVersion
		out["discountKind"] = string(p.DiscountKind)
		out["discountValue"] = p.DiscountValue
	}
	return out
}

func reservationDTO(r coupons.Reservation) map[string]any {
	out := map[string]any{
		"id":                  r.ID,
		"couponId":            r.CouponID,
		"couponPolicyVersion": r.CouponPolicyVersion,
		"storeId":             r.StoreID,
		"orderId":             r.OrderID,
		"discount":            r.DiscountIDR,
		"merchandise":         r.MerchandiseIDR,
		"tip":                 r.TipIDR,
		"upsell":              r.UpsellIDR,
		"gross":               r.GrossIDR,
		"code":                r.CodeSnapshot,
		"state":               string(r.State),
		"expiresAt":           r.ExpiresAt.UTC().Format(time.RFC3339),
		"createdAt":           r.CreatedAt.UTC().Format(time.RFC3339),
	}
	return out
}

