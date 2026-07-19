package application

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/analytics"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/orders"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/payments"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/platform"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// CheckoutService implements hosted storefront checkout intents (BE-310).
// Browser cannot mark paid; finalization is BE-330.
type CheckoutService struct {
	Store     CheckoutStore
	Fees      *FeeService
	Coupons   *CouponService
	Inventory *InventoryService
	// Analytics captures UTM/referrer snapshot at checkout (BE-360); optional.
	Analytics *AnalyticsService
	QRIS      ports.QRISProvider
	IDs       ports.IDGenerator
	Clock     ports.Clock
	Log       ports.Logger
	// PaymentMode is SANDBOX for local/test; LIVE only when configured.
	PaymentMode string
	// AccountScope from Xendit adapter (non-secret). Legacy; prefer PaymentAccountScope for intents.
	AccountScope string
	// PaymentProvider is ports-level identity for intents: payments.ProviderXendit | payments.ProviderDuitku.
	PaymentProvider string
	// PaymentAccountScope e.g. xendit-primary | duitku-primary.
	PaymentAccountScope string
	// SimulateEnabled gates POST /v1/checkout/simulate-payment (local/test only).
	SimulateEnabled bool
	// TokenSecret for public order token hashing.
	TokenSecret string
	// EmergencyDisabled when set consults platform_emergency_controls (BE-510).
	EmergencyDisabled func(ctx context.Context, switchName string) (bool, error)
}

func (s *CheckoutService) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now().UTC()
	}
	return time.Now().UTC()
}

func (s *CheckoutService) mode() string {
	if s.PaymentMode == payments.PaymentModeLive {
		return payments.PaymentModeLive
	}
	return payments.PaymentModeSandbox
}

func (s *CheckoutService) accountScope() string {
	if s.AccountScope != "" {
		return s.AccountScope
	}
	return payments.AccountScopePrimary
}

func (s *CheckoutService) paymentProvider() string {
	if s.PaymentProvider != "" {
		return s.PaymentProvider
	}
	return payments.ProviderXendit
}

func (s *CheckoutService) paymentAccountScope() string {
	if s.PaymentAccountScope != "" {
		return s.PaymentAccountScope
	}
	return s.accountScope()
}

func (s *CheckoutService) hashKey(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func (s *CheckoutService) hashToken(raw string) string {
	return auth.HashTokenKeyed(raw, s.TokenSecret)
}

// CreateIntentRequest is POST /v1/checkout/intents body (server prices only).
type CreateIntentRequest struct {
	StoreID   string
	ProductID string
	// ClientUnitPriceIDR / ClientTotalIDR are intentionally ignored (never trusted).
	ClientUnitPriceIDR int64
	ClientTotalIDR     int64
	// PayWhatYouWantIDR when product.allow_pwyt; must be >= min.
	PayWhatYouWantIDR int64
	TipIDR            int64
	UpsellProductIDs  []string // optional; rejected if not published same store (BE-310: ignore unknown)
	CouponCode        string
	BuyerEmail        string
	BuyerName         string
	BuyerUserID       string
	BuyerSessionID    string
	BuyerIdentityHash string
	IdempotencyKey    string
	// ClientDiscountIDR ignored.
	ClientDiscountIDR int64
	// Attribution (BE-360): stripped/normalized before persistence; never trusted for money.
	LandingURL  string
	ReferrerURL string
	UTMSource   string
	UTMMedium   string
	UTMCampaign string
	UTMContent  string
	UTMTerm     string
	VisitorID   string // opaque client visitor id; hashed before store
	UserAgent   string
}

// CreateIntentResult is the immutable checkout snapshot + QRIS payload.
type CreateIntentResult struct {
	Intent      payments.Intent
	Order       CheckoutOrder
	Item        orders.OrderItem
	PublicToken string // raw once
	Replayed    bool
	// Fee breakdown for response (from snapshot math).
	FeeIDR         int64
	MerchantNetIDR int64
	GrossIDR       int64
	SubtotalIDR    int64
	DiscountIDR    int64
	TipIDR         int64
}

// CreateIntent creates order PENDING + payment intent + QRIS (fake in local).
// Server reloads product; rejects client totals as authority.
func (s *CheckoutService) CreateIntent(ctx context.Context, req CreateIntentRequest) (CreateIntentResult, error) {
	if req.StoreID == "" || req.ProductID == "" {
		return CreateIntentResult{}, apperr.Validation(apperr.CodeValidationFailed, "storeId and productId are required")
	}
	if strings.TrimSpace(req.IdempotencyKey) == "" {
		return CreateIntentResult{}, apperr.Validation(apperr.CodeValidationFailed, "Idempotency-Key is required")
	}
	if s.EmergencyDisabled != nil {
		if off, err := s.EmergencyDisabled(ctx, "QRIS_CHECKOUT"); err == nil && off {
			return CreateIntentResult{}, apperr.Forbidden(apperr.CodeForbidden, "QRIS checkout is temporarily disabled")
		}
	}
	// Explicitly ignore client money authority.
	_ = req.ClientUnitPriceIDR
	_ = req.ClientTotalIDR
	_ = req.ClientDiscountIDR

	mode := s.mode()
	keyHash := s.hashKey(req.IdempotencyKey)
	// Canonical request hash excludes client prices so price tampering still replays same key conflict or same resource.
	reqHash := s.hashKey(fmt.Sprintf("v1|%s|%s|%s|%d|%d|%s|%s",
		req.StoreID, req.ProductID, mode, req.PayWhatYouWantIDR, req.TipIDR,
		strings.TrimSpace(strings.ToLower(req.CouponCode)), strings.TrimSpace(strings.ToLower(req.BuyerEmail))))

	// Idempotent replay: same key + same hash → same intent.
	if existing, err := s.Store.GetPaymentIntentByIdempotency(ctx, payments.SourceStorefront, mode, keyHash); err == nil {
		if existing.RequestHash != reqHash {
			return CreateIntentResult{}, payments.ErrIdempotencyConflict
		}
		ord, oerr := s.Store.GetOrderByID(ctx, existing.OrderID)
		if oerr != nil {
			return CreateIntentResult{}, apperr.Internal(apperr.CodeInternalError, "Order lookup failed")
		}
		items, _ := s.Store.ListOrderItems(ctx, existing.OrderID)
		var item orders.OrderItem
		if len(items) > 0 {
			item = items[0]
		}
		return CreateIntentResult{
			Intent:         existing,
			Order:          ord,
			Item:           item,
			Replayed:       true,
			FeeIDR:         ord.FeeIDR,
			MerchantNetIDR: ord.MerchantNetIDR,
			GrossIDR:       ord.GrossIDR,
			SubtotalIDR:    ord.SubtotalIDR,
			DiscountIDR:    ord.DiscountIDR,
			TipIDR:         ord.TipIDR,
		}, nil
	} else if !s.Store.IsNotFound(err) {
		return CreateIntentResult{}, apperr.Internal(apperr.CodeInternalError, "Idempotency lookup failed")
	}

	prod, err := s.Store.GetProduct(ctx, req.StoreID, req.ProductID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return CreateIntentResult{}, payments.ErrProductUnavailable
		}
		return CreateIntentResult{}, apperr.Internal(apperr.CodeInternalError, "Product lookup failed")
	}
	if prod.Status != "published" {
		return CreateIntentResult{}, payments.ErrProductUnavailable
	}
	st, err := s.Store.GetStore(ctx, req.StoreID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return CreateIntentResult{}, payments.ErrProductUnavailable
		}
		return CreateIntentResult{}, apperr.Internal(apperr.CodeInternalError, "Store lookup failed")
	}
	if st.MerchantID != prod.MerchantID {
		return CreateIntentResult{}, payments.ErrProductUnavailable
	}

	// Server merchandise authority: catalog price or PWYW >= min.
	merch := prod.PriceIDR
	if prod.AllowPWYT {
		min := prod.PriceIDR
		if prod.MinimumPriceIDR != nil {
			min = *prod.MinimumPriceIDR
		}
		if req.PayWhatYouWantIDR > 0 {
			if req.PayWhatYouWantIDR < min {
				return CreateIntentResult{}, apperr.Validation(apperr.CodeValidationFailed, "Pay-what-you-want amount below minimum")
			}
			merch = req.PayWhatYouWantIDR
		} else if merch < min {
			merch = min
		}
	}
	tip := req.TipIDR
	if tip < 0 {
		tip = 0
	}

	buyerHash := req.BuyerIdentityHash
	if buyerHash == "" && req.BuyerUserID != "" {
		buyerHash = "user:" + req.BuyerUserID
	}
	if buyerHash == "" && req.BuyerEmail != "" {
		buyerHash = "email:" + auth.NormalizeEmail(req.BuyerEmail)
	}

	now := s.now()
	ttl := payments.DefaultCheckoutTTL
	expiresAt := now.Add(ttl)

	// Pre-generate IDs so coupon reserve can bind order_id.
	orderID := s.IDs.New()
	if !strings.HasPrefix(orderID, "ord_") {
		orderID = "ord_" + orderID
	}
	intentID := s.IDs.New()
	if !strings.HasPrefix(intentID, "pi_") {
		intentID = "pi_" + intentID
	}
	itemID := s.IDs.New()
	externalID := "fersaku_" + mode + "_" + intentID

	// Coupon reserve (optional) — uses server merch/tip.
	var couponResID *string
	var couponCode *string
	var couponVer *int32
	discount := int64(0)
	grossBeforeFee := merch + tip // default without coupon
	if strings.TrimSpace(req.CouponCode) != "" {
		if s.Coupons == nil {
			return CreateIntentResult{}, apperr.Validation(apperr.CodeCouponUnavailable, "Coupon unavailable")
		}
		cres, cerr := s.Coupons.Reserve(ctx, ReserveRequest{
			StoreID:           req.StoreID,
			ProductID:         req.ProductID,
			OrderID:           orderID,
			IdempotencyKey:    "checkout:" + req.IdempotencyKey,
			MerchandiseIDR:    merch,
			TipIDR:            tip,
			UpsellIDR:         0,
			CouponCode:        req.CouponCode,
			ClientDiscountIDR: req.ClientDiscountIDR,
			BuyerIdentityHash: buyerHash,
			TTL:               ttl,
		})
		if cerr != nil {
			return CreateIntentResult{}, cerr
		}
		rid := cres.Reservation.ID
		couponResID = &rid
		cc := cres.Price.CouponCode
		couponCode = &cc
		cv := cres.Price.CouponPolicyVersion
		couponVer = &cv
		discount = cres.Price.DiscountIDR
		grossBeforeFee = cres.Price.GrossIDR
		merch = cres.Price.MerchandiseIDR
		tip = cres.Price.TipIDR
	} else {
		grossBeforeFee = merch - discount + tip
	}
	if grossBeforeFee <= 0 {
		return CreateIntentResult{}, payments.ErrInvalidAmount
	}

	// Fee snapshot (server authority).
	if s.Fees == nil {
		return CreateIntentResult{}, apperr.Internal(apperr.CodeInternalError, "Fee service unavailable")
	}
	feeRes, policy, err := s.Fees.CalculateTransaction(ctx, grossBeforeFee, platform.SourceStorefront)
	if err != nil {
		return CreateIntentResult{}, err
	}
	// 100k → 3700 invariant enforced by calculator.
	snap, err := s.Fees.SnapshotTransaction(ctx, platform.SourceStorefront, feeRes, policy)
	if err != nil {
		return CreateIntentResult{}, err
	}
	feeSnapID := snap.ID

	// Stock reserve for CODE products.
	var stockResID, stockItemID *string
	if prod.Type == "code" {
		if s.Inventory == nil {
			return CreateIntentResult{}, apperr.Internal(apperr.CodeInternalError, "Inventory unavailable")
		}
		sres, serr := s.Inventory.ReserveStock(ctx, ReserveStockRequest{
			StoreID:        req.StoreID,
			ProductID:      req.ProductID,
			OrderID:        orderID,
			CheckoutID:     intentID,
			IdempotencyKey: "checkout:" + req.IdempotencyKey,
			TTL:            ttl,
		})
		if serr != nil {
			// Release coupon if we reserved one.
			if couponResID != nil && s.Coupons != nil {
				_, _ = s.Coupons.ReleaseReservation(ctx, *couponResID)
			}
			return CreateIntentResult{}, serr
		}
		sr := sres.Reservation.ID
		stockResID = &sr
		si := sres.Item.ID
		stockItemID = &si
	}

	rawPublic, err := auth.GenerateToken(24)
	if err != nil {
		return CreateIntentResult{}, apperr.Internal(apperr.CodeInternalError, "Token generation failed")
	}
	publicHash := s.hashToken(rawPublic)

	var buyerUID *string
	if req.BuyerUserID != "" {
		u := req.BuyerUserID
		buyerUID = &u
	}
	var buyerSess *string
	if req.BuyerSessionID != "" {
		bs := req.BuyerSessionID
		buyerSess = &bs
	}
	email := auth.NormalizeEmail(req.BuyerEmail)
	if email == "" {
		email = strings.TrimSpace(strings.ToLower(req.BuyerEmail))
	}

	productSnap, _ := json.Marshal(map[string]any{
		"productId":    prod.ID,
		"version":      prod.Version,
		"title":        prod.Title,
		"type":         prod.Type,
		"catalogPrice": prod.PriceIDR,
		"allowPwyt":    prod.AllowPWYT,
		"unitPrice":    merch,
	})
	priceSnap, _ := json.Marshal(map[string]any{
		"merchandiseIdr": merch,
		"discountIdr":    discount,
		"tipIdr":         tip,
		"grossIdr":       feeRes.GrossIDR,
		"feeIdr":         feeRes.TotalFeeIDR,
		"merchantNetIdr": feeRes.NetIDR,
		"feeSnapshotId":  feeSnapID,
		"policyVersion":  policy.VersionID,
	})

	deliveryKind := "DOWNLOAD"
	switch prod.Type {
	case "link":
		deliveryKind = "PROTECTED_LINK"
	case "code":
		deliveryKind = "CODE"
	}

	orderNumber := fmt.Sprintf("ORD-%s", orderID[len(orderID)-10:])
	ord := CheckoutOrder{
		Order: orders.Order{
			ID:             orderID,
			OrderNumber:    orderNumber,
			StoreID:        req.StoreID,
			MerchantID:     prod.MerchantID,
			BuyerUserID:    buyerUID,
			BuyerEmail:     email,
			BuyerName:      strings.TrimSpace(req.BuyerName),
			PaymentStatus:  orders.PaymentPending,
			Source:         orders.SourceStorefront,
			Currency:       "IDR",
			SubtotalIDR:    merch,
			DiscountIDR:    discount,
			TipIDR:         tip,
			FeeIDR:         feeRes.TotalFeeIDR,
			GrossIDR:       feeRes.GrossIDR,
			MerchantNetIDR: feeRes.NetIDR,
			CouponCode:     couponCode,
			CouponVersion:  couponVer,
			CreatedAt:      now,
			UpdatedAt:      now,
		},
		OrderStatus:         payments.OrderPendingPayment,
		PaymentMode:         mode,
		FeeSnapshotID:       &feeSnapID,
		CouponReservationID: couponResID,
		PublicTokenHash:     &publicHash,
		BuyerSessionID:      buyerSess,
		ExpiresAt:           &expiresAt,
		IdempotencyKeyHash:  &keyHash,
	}

	item := orders.OrderItem{
		ID:                    itemID,
		OrderID:               orderID,
		StoreID:               req.StoreID,
		MerchantID:            prod.MerchantID,
		ProductID:             prod.ID,
		ProductVersion:        prod.Version,
		ProductTitle:          prod.Title,
		ProductType:           prod.Type,
		UnitPriceIDR:          merch,
		Quantity:              1,
		LineSubtotalIDR:       merch,
		DiscountAllocationIDR: discount,
		LineTotalIDR:          merch - discount,
		DeliveryKind:          deliveryKind,
		StockReservationID:    stockResID,
		StockItemID:           stockItemID,
		CreatedAt:             now,
	}

	pi := payments.Intent{
		ID:                     intentID,
		OrderID:                orderID,
		StoreID:                req.StoreID,
		MerchantID:             prod.MerchantID,
		PaymentMode:            mode,
		Source:                 payments.SourceStorefront,
		Provider:               s.paymentProvider(),
		AccountScope:           s.paymentAccountScope(),
		ExternalID:             externalID,
		AmountIDR:              feeRes.GrossIDR,
		Currency:               payments.CurrencyIDR,
		FeeSnapshotID:          &feeSnapID,
		CouponReservationID:    couponResID,
		StockReservationID:     stockResID,
		Status:                 payments.StatusRequiresPayment,
		ProviderFinancialState: payments.FinancialNormal,
		ExpiresAt:              expiresAt,
		BuyerUserID:            buyerUID,
		BuyerEmail:             email,
		BuyerSessionID:         buyerSess,
		PublicTokenHash:        &publicHash,
		IdempotencyKeyHash:     keyHash,
		RequestHash:            reqHash,
		ProductSnapshot:        productSnap,
		PriceSnapshot:          priceSnap,
		Version:                1,
		CreatedAt:              now,
		UpdatedAt:              now,
	}

	// Persist order+item+intent first (REQUIRES_PAYMENT), then call provider.
	if err := s.Store.WithTx(ctx, func(ctx context.Context) error {
		// Idempotency record first-writer-wins under storefront subject.
		idemID := s.IDs.New()
		lease := now.Add(2 * time.Minute)
		pm := mode
		rec := IdempotencyRecord{
			ID:             idemID,
			SubjectType:    "checkout",
			SubjectID:      req.StoreID,
			Operation:      "checkout.create_intent",
			PaymentMode:    &pm,
			KeyHash:        keyHash,
			RequestHash:    reqHash,
			Status:         "IN_PROGRESS",
			ResourceType:   strPtr("payment_intent"),
			ResourceID:     &intentID,
			LeaseExpiresAt: &lease,
			ExpiresAt:      now.Add(24 * time.Hour),
		}
		if _, inserted, ierr := s.Store.TryInsertIdempotency(ctx, rec); ierr != nil {
			return ierr
		} else if !inserted {
			// Concurrent winner — let outer retry path load by intent idempotency.
			return payments.ErrIdempotencyConflict
		}
		if err := s.Store.InsertOrder(ctx, ord); err != nil {
			return err
		}
		if err := s.Store.InsertOrderItem(ctx, item); err != nil {
			return err
		}
		if err := s.Store.InsertPaymentIntent(ctx, pi); err != nil {
			if s.Store.IsUniqueViolation(err) {
				return payments.ErrIdempotencyConflict
			}
			return err
		}
		return nil
	}); err != nil {
		// Compensating release of stock/coupon on hard failure before provider.
		if stockResID != nil && s.Inventory != nil {
			_, _ = s.Inventory.ReleaseReservation(ctx, *stockResID)
		}
		if couponResID != nil && s.Coupons != nil {
			_, _ = s.Coupons.ReleaseReservation(ctx, *couponResID)
		}
		// If conflict, try replay.
		if err == payments.ErrIdempotencyConflict {
			if existing, e2 := s.Store.GetPaymentIntentByIdempotency(ctx, payments.SourceStorefront, mode, keyHash); e2 == nil {
				if existing.RequestHash != reqHash {
					return CreateIntentResult{}, payments.ErrIdempotencyConflict
				}
				ord2, _ := s.Store.GetOrderByID(ctx, existing.OrderID)
				items, _ := s.Store.ListOrderItems(ctx, existing.OrderID)
				var it orders.OrderItem
				if len(items) > 0 {
					it = items[0]
				}
				return CreateIntentResult{
					Intent: existing, Order: ord2, Item: it, Replayed: true,
					FeeIDR: ord2.FeeIDR, MerchantNetIDR: ord2.MerchantNetIDR,
					GrossIDR: ord2.GrossIDR, SubtotalIDR: ord2.SubtotalIDR,
					DiscountIDR: ord2.DiscountIDR, TipIDR: ord2.TipIDR,
				}, nil
			}
		}
		return CreateIntentResult{}, apperr.Wrap(apperr.KindInternal, apperr.CodeInternalError, "Failed to create checkout", err)
	}

	// Provider create (outside DB TX — unknown outcome safety).
	if s.QRIS == nil {
		return CreateIntentResult{}, apperr.Internal(apperr.CodeInternalError, "Payment provider unavailable")
	}
	created, perr := s.QRIS.CreateQRIS(ctx, ports.CreateQRISInput{
		ExternalID:     externalID,
		AmountIDR:      feeRes.GrossIDR,
		Currency:       "IDR",
		Description:    "Fersaku order " + orderNumber,
		ExpiresAt:      expiresAt,
		PaymentMode:    mode,
		AccountScope:   s.paymentAccountScope(),
		IdempotencyKey: req.IdempotencyKey,
		Metadata: map[string]string{
			"orderId":  orderID,
			"intentId": intentID,
			"source":   payments.SourceStorefront,
		},
	})
	if perr != nil {
		// Timeout after send → UNKNOWN_OUTCOME; keep stock/coupon held.
		if pe, ok := perr.(*ports.ProviderError); ok && pe.IsUnknownOutcome() {
			lookupAt := now.Add(payments.DefaultLookupDelay)
			op := "CREATE"
			patch := PaymentIntentPatch{
				UnknownOperation:  &op,
				LookupScheduledAt: &lookupAt,
			}
			updated, uerr := s.Store.ForceUpdatePaymentIntent(ctx, intentID, payments.StatusUnknownOutcome, patch, s.now())
			if uerr == nil {
				pi = updated
			} else {
				pi.Status = payments.StatusUnknownOutcome
			}
			if stockResID != nil && s.Inventory != nil {
				// Mark held unknown if method exists via status update — keep reserved.
				_ = stockResID
			}
			if couponResID != nil && s.Coupons != nil {
				_, _ = s.Coupons.MarkReservationHeldUnknown(ctx, *couponResID)
			}
			// Schedule lookup outbox.
			payload, _ := json.Marshal(map[string]any{"paymentIntentId": intentID, "operation": "CREATE"})
			_ = s.Store.InsertOutbox(ctx, s.IDs.New(), "payment_intent.lookup", payload, strPtr("lookup:"+intentID), &mode, lookupAt)
			return CreateIntentResult{
				Intent: pi, Order: ord, Item: item, PublicToken: rawPublic,
				FeeIDR: feeRes.TotalFeeIDR, MerchantNetIDR: feeRes.NetIDR,
				GrossIDR: feeRes.GrossIDR, SubtotalIDR: merch, DiscountIDR: discount, TipIDR: tip,
			}, nil
		}
		// Hard reject: release holds and fail intent.
		if stockResID != nil && s.Inventory != nil {
			_, _ = s.Inventory.ReleaseReservation(ctx, *stockResID)
		}
		if couponResID != nil && s.Coupons != nil {
			_, _ = s.Coupons.ReleaseReservation(ctx, *couponResID)
		}
		_, _ = s.Store.ForceUpdatePaymentIntent(ctx, intentID, payments.StatusFailed, PaymentIntentPatch{}, s.now())
		_ = s.Store.UpdateOrderStatus(ctx, orderID, orders.PaymentFailed, payments.OrderFailed, s.now())
		return CreateIntentResult{}, apperr.New(apperr.KindUnavailable, apperr.CodeInternalError, "Payment provider rejected create")
	}

	// Success → PENDING with QR payload.
	ref := created.ProviderReference
	qr := created.QRString
	img := created.QRImageURL
	patch := PaymentIntentPatch{
		ProviderReference: &ref,
		QRString:          &qr,
		QRImageURL:        &img,
	}
	updated, uerr := s.Store.UpdatePaymentIntentStatus(ctx, intentID, payments.StatusRequiresPayment, payments.StatusPending, patch, s.now())
	if uerr != nil {
		// Already moved? force.
		updated, uerr = s.Store.ForceUpdatePaymentIntent(ctx, intentID, payments.StatusPending, patch, s.now())
		if uerr != nil {
			return CreateIntentResult{}, apperr.Internal(apperr.CodeInternalError, "Failed to activate payment intent")
		}
	}
	pi = updated

	// Complete idempotency with safe response body.
	respBody, _ := json.Marshal(map[string]any{
		"paymentIntentId": intentID,
		"orderId":         orderID,
		"status":          pi.Status,
		"amount":          pi.AmountIDR,
	})
	// Best-effort complete (lookup by scope).
	if rec, gerr := s.Store.GetIdempotency(ctx, "checkout", req.StoreID, "checkout.create_intent", &mode, keyHash); gerr == nil {
		rt, rid := "payment_intent", intentID
		_, _ = s.Store.CompleteIdempotency(ctx, rec.ID, "COMPLETED", &rt, &rid, 201, respBody)
	}

	// Schedule expire job.
	expPayload, _ := json.Marshal(map[string]any{"paymentIntentId": intentID})
	_ = s.Store.InsertOutbox(ctx, s.IDs.New(), "payment_intent.expire", expPayload, strPtr("expire:"+intentID), &mode, expiresAt)

	// BE-360: immutable attribution snapshot at checkout (storefront only; never blocks payment).
	if s.Analytics != nil {
		visitorRaw := req.VisitorID
		if visitorRaw == "" {
			visitorRaw = req.BuyerSessionID
		}
		if visitorRaw == "" && req.BuyerIdentityHash != "" {
			visitorRaw = req.BuyerIdentityHash
		}
		if _, aerr := s.Analytics.CaptureCheckoutAttribution(ctx, analyticsCaptureFromCheckout(req, ord, pi, visitorRaw, now)); aerr != nil && s.Log != nil {
			s.Log.Warn("checkout attribution capture", "order_id", orderID, "err", aerr.Error())
		}
	}

	return CreateIntentResult{
		Intent: pi, Order: ord, Item: item, PublicToken: rawPublic,
		FeeIDR: feeRes.TotalFeeIDR, MerchantNetIDR: feeRes.NetIDR,
		GrossIDR: feeRes.GrossIDR, SubtotalIDR: merch, DiscountIDR: discount, TipIDR: tip,
	}, nil
}

func analyticsCaptureFromCheckout(req CreateIntentRequest, ord CheckoutOrder, pi payments.Intent, visitorRaw string, now time.Time) analytics.CaptureInput {
	sessRaw := req.BuyerSessionID
	if sessRaw == "" {
		sessRaw = visitorRaw
	}
	return analytics.CaptureInput{
		StoreID:         req.StoreID,
		MerchantID:      ord.MerchantID,
		ProductID:       req.ProductID,
		OrderID:         ord.ID,
		PaymentIntentID: pi.ID,
		Source:          analytics.SourceStorefront,
		VisitorRaw:      visitorRaw,
		SessionRaw:      sessRaw,
		LandingURL:      req.LandingURL,
		ReferrerURL:     req.ReferrerURL,
		UTMSource:       req.UTMSource,
		UTMMedium:       req.UTMMedium,
		UTMCampaign:     req.UTMCampaign,
		UTMContent:      req.UTMContent,
		UTMTerm:         req.UTMTerm,
		UserAgent:       req.UserAgent,
		GrossIDR:        ord.GrossIDR,
		OccurredAt:      now,
	}
}

// GetIntent returns intent by id (public buyer polling; no secrets beyond QR already issued).
func (s *CheckoutService) GetIntent(ctx context.Context, intentID string) (payments.Intent, CheckoutOrder, error) {
	if intentID == "" {
		return payments.Intent{}, CheckoutOrder{}, payments.ErrNotFound
	}
	pi, err := s.Store.GetPaymentIntentByID(ctx, intentID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return payments.Intent{}, CheckoutOrder{}, payments.ErrNotFound
		}
		return payments.Intent{}, CheckoutOrder{}, apperr.Internal(apperr.CodeInternalError, "Payment intent lookup failed")
	}
	ord, err := s.Store.GetOrderByID(ctx, pi.OrderID)
	if err != nil {
		return payments.Intent{}, CheckoutOrder{}, apperr.Internal(apperr.CodeInternalError, "Order lookup failed")
	}
	return pi, ord, nil
}

// GetOrderPublic returns order state for buyer polling (no admin fields).
func (s *CheckoutService) GetOrderPublic(ctx context.Context, orderID string) (CheckoutOrder, payments.Intent, error) {
	if orderID == "" {
		return CheckoutOrder{}, payments.Intent{}, payments.ErrNotFound
	}
	ord, err := s.Store.GetOrderByID(ctx, orderID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return CheckoutOrder{}, payments.Intent{}, payments.ErrNotFound
		}
		return CheckoutOrder{}, payments.Intent{}, apperr.Internal(apperr.CodeInternalError, "Order lookup failed")
	}
	pi, err := s.Store.GetPaymentIntentByOrder(ctx, orderID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return ord, payments.Intent{}, nil
		}
		return CheckoutOrder{}, payments.Intent{}, apperr.Internal(apperr.CodeInternalError, "Payment intent lookup failed")
	}
	return ord, pi, nil
}

// ExpireIntentRequest is POST .../expire.
type ExpireIntentRequest struct {
	IntentID       string
	IdempotencyKey string
	Reason         string
	// ActorBuyerSession optional binding.
	BuyerSessionID string
}

// ExpireIntent requests provider expire; never blind-releases stock on timeout.
func (s *CheckoutService) ExpireIntent(ctx context.Context, req ExpireIntentRequest) (payments.Intent, int, error) {
	if req.IntentID == "" {
		return payments.Intent{}, 0, payments.ErrNotFound
	}
	if strings.TrimSpace(req.IdempotencyKey) == "" {
		return payments.Intent{}, 0, apperr.Validation(apperr.CodeValidationFailed, "Idempotency-Key is required")
	}
	pi, err := s.Store.GetPaymentIntentByID(ctx, req.IntentID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return payments.Intent{}, 0, payments.ErrNotFound
		}
		return payments.Intent{}, 0, apperr.Internal(apperr.CodeInternalError, "Payment intent lookup failed")
	}
	// Already terminal unpaid or paid — return current resource.
	if pi.Status == payments.StatusExpired || pi.Status == payments.StatusCancelled ||
		pi.Status == payments.StatusFailed || pi.Status == payments.StatusPaid {
		return pi, 200, nil
	}
	if pi.Status == payments.StatusExpirePending || pi.Status == payments.StatusUnknownOutcome {
		// Idempotent operation resource (still pending confirmation).
		return pi, 202, nil
	}
	if !pi.CanRequestExpire() {
		return pi, 0, payments.ErrCheckoutClosed
	}

	now := s.now()
	reason := req.Reason
	if reason == "" {
		reason = "buyer_or_system_expire"
	}
	expAt := now
	patch := PaymentIntentPatch{
		ExpireRequestedAt: &expAt,
		ExpireReason:      &reason,
	}
	updated, err := s.Store.UpdatePaymentIntentStatus(ctx, pi.ID, pi.Status, payments.StatusExpirePending, patch, now)
	if err != nil {
		// concurrent change
		pi2, gerr := s.Store.GetPaymentIntentByID(ctx, pi.ID)
		if gerr == nil {
			return pi2, 202, nil
		}
		return payments.Intent{}, 0, apperr.Internal(apperr.CodeInternalError, "Failed to request expire")
	}
	pi = updated

	// Provider lookup key: Duitku uses merchantOrderId (ExternalID); Xendit uses provider reference.
	lookupKey := providerLookupKey(pi)
	if lookupKey == "" {
		// No provider identity yet (create unknown) — stay EXPIRE_PENDING / schedule lookup; no stock release.
		lookupAt := now.Add(payments.DefaultLookupDelay)
		op := "EXPIRE"
		_, _ = s.Store.ForceUpdatePaymentIntent(ctx, pi.ID, payments.StatusUnknownOutcome, PaymentIntentPatch{
			UnknownOperation:  &op,
			LookupScheduledAt: &lookupAt,
		}, now)
		pi.Status = payments.StatusUnknownOutcome
		if pi.CouponReservationID != nil && s.Coupons != nil {
			_, _ = s.Coupons.MarkReservationHeldUnknown(ctx, *pi.CouponReservationID)
		}
		return pi, 202, nil
	}

	if s.QRIS == nil {
		return pi, 202, nil
	}
	prov, perr := s.QRIS.ExpirePayment(ctx, lookupKey)
	if perr != nil {
		// Timeout → UNKNOWN_OUTCOME; DO NOT release stock.
		if pe, ok := perr.(*ports.ProviderError); ok && pe.IsUnknownOutcome() {
			lookupAt := now.Add(payments.DefaultLookupDelay)
			op := "EXPIRE"
			updated, _ = s.Store.ForceUpdatePaymentIntent(ctx, pi.ID, payments.StatusUnknownOutcome, PaymentIntentPatch{
				UnknownOperation:  &op,
				LookupScheduledAt: &lookupAt,
			}, now)
			if updated.ID != "" {
				pi = updated
			} else {
				pi.Status = payments.StatusUnknownOutcome
			}
			if pi.CouponReservationID != nil && s.Coupons != nil {
				_, _ = s.Coupons.MarkReservationHeldUnknown(ctx, *pi.CouponReservationID)
			}
			payload, _ := json.Marshal(map[string]any{"paymentIntentId": pi.ID, "operation": "EXPIRE"})
			mode := pi.PaymentMode
			_ = s.Store.InsertOutbox(ctx, s.IDs.New(), "payment_intent.lookup", payload, strPtr("lookup-expire:"+pi.ID), &mode, lookupAt)
			return pi, 202, nil
		}
		// Other errors: leave EXPIRE_PENDING for lookup.
		return pi, 202, nil
	}

	mapped := payments.MapProviderStatus(prov.Status)
	switch mapped {
	case payments.StatusExpired:
		// Verified unpaid terminal → finalize EXPIRED + release holds.
		prev := pi.Status
		fin, ferr := s.Store.ForceUpdatePaymentIntent(ctx, pi.ID, payments.StatusExpired, PaymentIntentPatch{
			PrecedingStatus: &prev,
		}, now)
		if ferr == nil {
			pi = fin
		} else {
			pi.Status = payments.StatusExpired
		}
		_ = s.Store.UpdateOrderStatus(ctx, pi.OrderID, orders.PaymentExpired, payments.OrderExpired, now)
		if pi.StockReservationID != nil && s.Inventory != nil {
			_, _ = s.Inventory.ReleaseReservation(ctx, *pi.StockReservationID)
		}
		if pi.CouponReservationID != nil && s.Coupons != nil {
			_, _ = s.Coupons.ReleaseReservation(ctx, *pi.CouponReservationID)
		}
		return pi, 200, nil
	case payments.StatusPaid:
		// PAID wins — do not release; BE-330 finalizes ledger/delivery.
		fin, _ := s.Store.ForceUpdatePaymentIntent(ctx, pi.ID, payments.StatusPaid, PaymentIntentPatch{}, now)
		if fin.ID != "" {
			pi = fin
		}
		return pi, 200, nil
	case payments.StatusPending:
		// Still pending at provider — keep EXPIRE_PENDING.
		return pi, 202, nil
	default:
		lookupAt := now.Add(payments.DefaultLookupDelay)
		op := "EXPIRE"
		fin, _ := s.Store.ForceUpdatePaymentIntent(ctx, pi.ID, payments.StatusUnknownOutcome, PaymentIntentPatch{
			UnknownOperation:  &op,
			LookupScheduledAt: &lookupAt,
		}, now)
		if fin.ID != "" {
			pi = fin
		}
		return pi, 202, nil
	}
}

// LookupProvider resolves UNKNOWN_OUTCOME using the provider status API (no blind create retry).
// Duitku: merchantOrderId = ExternalID; Xendit: provider reference id.
func (s *CheckoutService) LookupProvider(ctx context.Context, intentID string) (payments.Intent, error) {
	pi, err := s.Store.GetPaymentIntentByID(ctx, intentID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return payments.Intent{}, payments.ErrNotFound
		}
		return payments.Intent{}, err
	}
	lookupKey := providerLookupKey(pi)
	if lookupKey == "" || s.QRIS == nil {
		return pi, nil
	}
	prov, perr := s.QRIS.GetPayment(ctx, lookupKey)
	if perr != nil {
		return pi, nil
	}
	mapped := payments.MapProviderStatus(prov.Status)
	now := s.now()
	switch mapped {
	case payments.StatusPaid:
		fin, _ := s.Store.ForceUpdatePaymentIntent(ctx, pi.ID, payments.StatusPaid, PaymentIntentPatch{}, now)
		if fin.ID != "" {
			return fin, nil
		}
	case payments.StatusExpired:
		if pi.UnknownOperation != nil && *pi.UnknownOperation == "EXPIRE" || pi.Status == payments.StatusExpirePending {
			fin, _ := s.Store.ForceUpdatePaymentIntent(ctx, pi.ID, payments.StatusExpired, PaymentIntentPatch{}, now)
			if fin.ID != "" {
				pi = fin
			}
			_ = s.Store.UpdateOrderStatus(ctx, pi.OrderID, orders.PaymentExpired, payments.OrderExpired, now)
			if pi.StockReservationID != nil && s.Inventory != nil {
				_, _ = s.Inventory.ReleaseReservation(ctx, *pi.StockReservationID)
			}
			if pi.CouponReservationID != nil && s.Coupons != nil {
				_, _ = s.Coupons.ReleaseReservation(ctx, *pi.CouponReservationID)
			}
			return pi, nil
		}
	case payments.StatusCancelled:
		if pi.UnknownOperation != nil && *pi.UnknownOperation == "CANCEL" {
			fin, _ := s.Store.ForceUpdatePaymentIntent(ctx, pi.ID, payments.StatusCancelled, PaymentIntentPatch{}, now)
			if fin.ID != "" {
				pi = fin
			}
			_ = s.Store.UpdateOrderStatus(ctx, pi.OrderID, orders.PaymentCancelled, payments.OrderCancelled, now)
			if pi.StockReservationID != nil && s.Inventory != nil {
				_, _ = s.Inventory.ReleaseReservation(ctx, *pi.StockReservationID)
			}
			if pi.CouponReservationID != nil && s.Coupons != nil {
				_, _ = s.Coupons.ReleaseReservation(ctx, *pi.CouponReservationID)
			}
			return pi, nil
		}
	case payments.StatusPending:
		if pi.Status == payments.StatusUnknownOutcome {
			fin, _ := s.Store.ForceUpdatePaymentIntent(ctx, pi.ID, payments.StatusPending, PaymentIntentPatch{}, now)
			if fin.ID != "" {
				return fin, nil
			}
		}
	}
	return pi, nil
}

// SimulatePayment is local/test only — production must not expose this.
func (s *CheckoutService) SimulatePayment(ctx context.Context, intentID string) (payments.Intent, error) {
	if !s.SimulateEnabled {
		return payments.Intent{}, payments.ErrSimulateDisabled
	}
	pi, err := s.Store.GetPaymentIntentByID(ctx, intentID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return payments.Intent{}, payments.ErrNotFound
		}
		return payments.Intent{}, err
	}
	if pi.ProviderReference != nil && s.QRIS != nil {
		if f, ok := s.QRIS.(interface{ SimulatePay(string) error }); ok {
			_ = f.SimulatePay(*pi.ProviderReference)
		}
	}
	now := s.now()
	fin, err := s.Store.ForceUpdatePaymentIntent(ctx, pi.ID, payments.StatusPaid, PaymentIntentPatch{}, now)
	if err != nil {
		return payments.Intent{}, apperr.Internal(apperr.CodeInternalError, "Simulate paid failed")
	}
	_ = s.Store.UpdateOrderStatus(ctx, pi.OrderID, orders.PaymentPaid, payments.OrderPaid, now)
	// Note: full delivery/ledger finalization is BE-330; simulate only flips status for local tests.
	return fin, nil
}

func strPtr(s string) *string { return &s }

// providerLookupKey selects the identifier for QRISProvider status/expire/cancel.
// Duitku transactionStatus keys on merchantOrderId (= ExternalID); Xendit uses provider id.
// Never pass Duitku provider reference as merchantOrderId.
func providerLookupKey(pi payments.Intent) string {
	if strings.EqualFold(pi.Provider, payments.ProviderDuitku) {
		return strings.TrimSpace(pi.ExternalID)
	}
	if pi.ProviderReference != nil {
		return strings.TrimSpace(*pi.ProviderReference)
	}
	return ""
}
