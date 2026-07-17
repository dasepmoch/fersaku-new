package application

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/delivery"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/invoices"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/orders"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
	"github.com/dasepmoch/fersaku-new/backend/internal/security"
)

// DeliveryService implements grants, attempts, and immutable invoices (BE-235).
type DeliveryService struct {
	Store         DeliveryStore
	IDs           ports.IDGenerator
	Clock         ports.Clock
	Log           ports.Logger
	EncryptionKey string // stock reveal for CODE; never log
	TokenSecret   string // optional HMAC for access tokens
}

func (s *DeliveryService) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now().UTC()
	}
	return time.Now().UTC()
}

func (s *DeliveryService) hashToken(raw string) string {
	return auth.HashTokenKeyed(raw, s.TokenSecret)
}

func (s *DeliveryService) encryptionSecret() (string, error) {
	k := strings.TrimSpace(s.EncryptionKey)
	if k == "" {
		return "", apperr.Internal(apperr.CodeInternalError, "Stock encryption is not configured")
	}
	return k, nil
}

// CreatePaidOrderInput is the test/payment-stub hook for a verified-paid order.
type CreatePaidOrderInput struct {
	StoreID            string
	MerchantID         string
	BuyerUserID        string
	BuyerEmail         string
	BuyerName          string
	ProductID          string
	Quantity           int32
	TipIDR             int64
	DiscountIDR        int64
	CouponCode         string
	CouponVersion      *int32
	StockReservationID string
	StockItemID        string
	ObjectID           string
	// Optional overrides for fee math tests.
	UnitPriceIDR *int64
}

// CreatePaidOrderResult is order + grant + invoice from the paid stub.
type CreatePaidOrderResult struct {
	Order         orders.Order
	Item          orders.OrderItem
	Grant         delivery.Grant
	Invoice       invoices.Invoice
	InvoiceVer    invoices.Version
	AccessToken   string // raw token returned once
	PublicCode    string // raw public verify code returned once
}

// CreatePaidOrderAndGrant inserts a verified-paid order stub, one grant, and immutable invoice v1.
// Payment provider finalization remains BE-310/330; this is the test activation hook.
func (s *DeliveryService) CreatePaidOrderAndGrant(ctx context.Context, in CreatePaidOrderInput) (CreatePaidOrderResult, error) {
	if in.StoreID == "" || in.ProductID == "" {
		return CreatePaidOrderResult{}, apperr.Validation(apperr.CodeValidationFailed, "storeId and productId are required")
	}
	if in.Quantity <= 0 {
		in.Quantity = 1
	}
	prod, err := s.Store.GetProduct(ctx, in.StoreID, in.ProductID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return CreatePaidOrderResult{}, delivery.ErrNotFound
		}
		return CreatePaidOrderResult{}, apperr.Internal(apperr.CodeInternalError, "Product lookup failed")
	}
	st, err := s.Store.GetStore(ctx, in.StoreID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return CreatePaidOrderResult{}, delivery.ErrNotFound
		}
		return CreatePaidOrderResult{}, apperr.Internal(apperr.CodeInternalError, "Store lookup failed")
	}
	merchantID := in.MerchantID
	if merchantID == "" {
		merchantID = prod.MerchantID
	}
	if merchantID != prod.MerchantID || st.MerchantID != merchantID {
		return CreatePaidOrderResult{}, delivery.ErrNotFound
	}

	unit := prod.PriceIDR
	if in.UnitPriceIDR != nil {
		unit = *in.UnitPriceIDR
	}
	if unit < 0 {
		return CreatePaidOrderResult{}, apperr.Validation(apperr.CodeValidationFailed, "Invalid unit price")
	}
	subtotal := unit * int64(in.Quantity)
	discount := in.DiscountIDR
	if discount < 0 {
		discount = 0
	}
	if discount > subtotal {
		discount = subtotal
	}
	tip := in.TipIDR
	if tip < 0 {
		tip = 0
	}
	// Launch fee: 3% + 700 on gross merchandise after discount + tip (gross before fee).
	grossBeforeFee := subtotal - discount + tip
	if grossBeforeFee <= 0 {
		return CreatePaidOrderResult{}, apperr.Validation(apperr.CodeValidationFailed, "Invalid order amount")
	}
	fee := roundHalfUp(grossBeforeFee*300, 10000) + 700
	if fee > grossBeforeFee {
		return CreatePaidOrderResult{}, apperr.Validation(apperr.CodeValidationFailed, "Fee exceeds gross")
	}
	gross := grossBeforeFee // buyer pays merchandise+tip; fee deducted from merchant
	merchantNet := gross - fee

	kind := deliveryKindForProduct(prod.Type)
	now := s.now()
	orderID := s.IDs.New()
	itemID := s.IDs.New()
	grantID := s.IDs.New()
	invoiceID := s.IDs.New()
	versionID := s.IDs.New()
	orderNumber := fmt.Sprintf("ORD-%s", orderID[len(orderID)-10:])
	invoiceNumber := fmt.Sprintf("INV-%s", orderID[len(orderID)-10:])

	rawAccess, err := auth.GenerateToken(32)
	if err != nil {
		return CreatePaidOrderResult{}, apperr.Internal(apperr.CodeInternalError, "Token generation failed")
	}
	accessHash := s.hashToken(rawAccess)
	accessExp := now.Add(delivery.DefaultAccessTTL)

	rawPublic, err := auth.GenerateToken(24)
	if err != nil {
		return CreatePaidOrderResult{}, apperr.Internal(apperr.CodeInternalError, "Token generation failed")
	}
	publicHash := auth.HashToken(rawPublic)
	publicHint := rawPublic
	if len(publicHint) > 6 {
		publicHint = publicHint[:4] + "…"
	}

	var buyerUID *string
	if in.BuyerUserID != "" {
		u := in.BuyerUserID
		buyerUID = &u
	}
	email := auth.NormalizeEmail(in.BuyerEmail)
	if email == "" {
		email = strings.TrimSpace(strings.ToLower(in.BuyerEmail))
	}

	var stockRes, stockItem, objectID *string
	if in.StockReservationID != "" {
		v := in.StockReservationID
		stockRes = &v
	}
	if in.StockItemID != "" {
		v := in.StockItemID
		stockItem = &v
	}
	if in.ObjectID != "" {
		v := in.ObjectID
		objectID = &v
	}

	recipientSnap, _ := json.Marshal(map[string]any{
		"email":  email,
		"name":   in.BuyerName,
		"userId": in.BuyerUserID,
	})
	productSnap, _ := json.Marshal(map[string]any{
		"productId":    prod.ID,
		"title":        prod.Title,
		"type":         prod.Type,
		"version":      prod.Version,
		"unitPriceIdr": unit,
	})

	effectKey := fmt.Sprintf("order_item:%s", itemID)
	var couponCode *string
	if strings.TrimSpace(in.CouponCode) != "" {
		c := strings.TrimSpace(in.CouponCode)
		couponCode = &c
	}

	ord := orders.Order{
		ID:             orderID,
		OrderNumber:    orderNumber,
		StoreID:        in.StoreID,
		MerchantID:     merchantID,
		BuyerUserID:    buyerUID,
		BuyerEmail:     email,
		BuyerName:      strings.TrimSpace(in.BuyerName),
		PaymentStatus:  orders.PaymentPaid,
		Source:         orders.SourceStorefront,
		Currency:       "IDR",
		SubtotalIDR:    subtotal,
		DiscountIDR:    discount,
		TipIDR:         tip,
		FeeIDR:         fee,
		GrossIDR:       gross,
		MerchantNetIDR: merchantNet,
		CouponCode:     couponCode,
		CouponVersion:  in.CouponVersion,
		PaidAt:         &now,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	item := orders.OrderItem{
		ID:                    itemID,
		OrderID:               orderID,
		StoreID:               in.StoreID,
		MerchantID:            merchantID,
		ProductID:             prod.ID,
		ProductVersion:        prod.Version,
		ProductTitle:          prod.Title,
		ProductType:           prod.Type,
		UnitPriceIDR:          unit,
		Quantity:              in.Quantity,
		LineSubtotalIDR:       subtotal,
		DiscountAllocationIDR: discount,
		LineTotalIDR:          subtotal - discount,
		DeliveryKind:          kind,
		StockReservationID:    stockRes,
		StockItemID:           stockItem,
		ObjectID:              objectID,
		CreatedAt:             now,
	}

	grantStatus := delivery.StatusActive
	if kind == delivery.KindCode || kind == delivery.KindCredential {
		if stockItem == nil {
			grantStatus = delivery.StatusPendingFulfillment
		}
	}
	var activated *time.Time
	if grantStatus == delivery.StatusActive {
		activated = &now
	}
	grant := delivery.Grant{
		ID:                   grantID,
		OrderID:              orderID,
		OrderItemID:          itemID,
		StoreID:              in.StoreID,
		MerchantID:           merchantID,
		ProductID:            prod.ID,
		BuyerUserID:          buyerUID,
		BuyerEmail:           email,
		DeliveryKind:         kind,
		Status:               grantStatus,
		StockItemID:          stockItem,
		StockReservationID:   stockRes,
		ObjectID:             objectID,
		FulfillmentEffectKey: effectKey,
		AccessTokenHash:      &accessHash,
		AccessTokenExpiresAt: &accessExp,
		MaxAccesses:          delivery.DefaultMaxAccesses,
		AccessCount:          0,
		RecipientSnapshot:    recipientSnap,
		ProductSnapshot:      productSnap,
		ExpiresAt:            &accessExp,
		ActivatedAt:          activated,
		Version:              1,
		CreatedAt:            now,
		UpdatedAt:            now,
	}

	snap := invoices.Snapshot{
		InvoiceNumber:   invoiceNumber,
		OrderID:         orderID,
		OrderNumber:     orderNumber,
		StoreID:         in.StoreID,
		MerchantID:      merchantID,
		Currency:        "IDR",
		SubtotalIDR:     subtotal,
		DiscountIDR:     discount,
		TipIDR:          tip,
		FeeIDR:          fee,
		GrossIDR:        gross,
		MerchantNetIDR:  merchantNet,
		PaidAt:          &now,
		Buyer:           invoices.BuyerSnapshot{UserID: buyerUID, Email: email, Name: strings.TrimSpace(in.BuyerName)},
		Issuer:          invoices.IssuerSnapshot{StoreID: st.ID, StoreName: st.Name, MerchantID: merchantID},
		Lines: []invoices.LineSnapshot{{
			OrderItemID:  itemID,
			ProductID:    prod.ID,
			Title:        prod.Title,
			ProductType:  prod.Type,
			Version:      prod.Version,
			UnitPriceIDR: unit,
			Quantity:     in.Quantity,
			LineTotalIDR: subtotal - discount,
			DiscountIDR:  discount,
		}},
		RendererVersion: invoices.RendererV1,
	}
	if couponCode != nil {
		snap.CouponCode = *couponCode
		snap.CouponVersion = in.CouponVersion
	}
	snapBytes, err := json.Marshal(snap)
	if err != nil {
		return CreatePaidOrderResult{}, apperr.Internal(apperr.CodeInternalError, "Invoice snapshot encode failed")
	}
	payloadHash := sha256Hex(snapBytes)

	inv := invoices.Invoice{
		ID:             invoiceID,
		OrderID:        orderID,
		StoreID:        in.StoreID,
		MerchantID:     merchantID,
		InvoiceNumber:  invoiceNumber,
		PublicCodeHash: publicHash,
		PublicCodeHint: publicHint,
		Status:         invoices.StatusIssued,
		Currency:       "IDR",
		GrossIDR:       gross,
		PaidAt:         &now,
		CurrentVersion: 1,
		BuyerUserID:    buyerUID,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	ver := invoices.Version{
		ID:              versionID,
		InvoiceID:       invoiceID,
		Version:         1,
		RendererVersion: invoices.RendererV1,
		Snapshot:        snapBytes,
		PayloadHash:     payloadHash,
		RenderStatus:    invoices.RenderPending,
		CreatedAt:       now,
	}

	err = s.Store.WithTx(ctx, func(ctx context.Context) error {
		if err := s.Store.InsertOrder(ctx, ord); err != nil {
			return apperr.Internal(apperr.CodeInternalError, "Insert order failed")
		}
		if err := s.Store.InsertOrderItem(ctx, item); err != nil {
			return apperr.Internal(apperr.CodeInternalError, "Insert order item failed")
		}
		if err := s.Store.InsertGrant(ctx, grant); err != nil {
			if s.Store.IsUniqueViolation(err) {
				return delivery.ErrGrantState
			}
			return apperr.Internal(apperr.CodeInternalError, "Insert grant failed")
		}
		if err := s.Store.InsertInvoice(ctx, inv); err != nil {
			if s.Store.IsUniqueViolation(err) {
				return delivery.ErrGrantState
			}
			return apperr.Internal(apperr.CodeInternalError, "Insert invoice failed")
		}
		if err := s.Store.InsertInvoiceVersion(ctx, ver); err != nil {
			return apperr.Internal(apperr.CodeInternalError, "Insert invoice version failed")
		}
		// Queue render job (idempotent).
		dedupe := "invoice.render:" + invoiceID + ":v1"
		payload, _ := json.Marshal(map[string]any{"invoiceId": invoiceID, "version": 1})
		_ = s.Store.InsertOutbox(ctx, s.IDs.New(), delivery.TopicInvoiceRender, payload, &dedupe, now)
		// Initial portal attempt bookkeeping.
		_ = s.Store.InsertAttempt(ctx, delivery.Attempt{
			ID:        s.IDs.New(),
			GrantID:   grantID,
			OrderID:   orderID,
			StoreID:   in.StoreID,
			Channel:   delivery.ChannelPortal,
			Result:    delivery.ResultQueued,
			ActorKind: delivery.ActorSystem,
			Reason:    "grant_created",
			CreatedAt: now,
		})
		return nil
	})
	if err != nil {
		return CreatePaidOrderResult{}, err
	}
	return CreatePaidOrderResult{
		Order:       ord,
		Item:        item,
		Grant:       grant,
		Invoice:     inv,
		InvoiceVer:  ver,
		AccessToken: rawAccess,
		PublicCode:  rawPublic,
	}, nil
}

// AccessByBuyerSession returns delivery secrets for the owning buyer session.
func (s *DeliveryService) AccessByBuyerSession(ctx context.Context, userID, orderID string) (delivery.AccessResult, error) {
	if userID == "" {
		return delivery.AccessResult{}, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required")
	}
	ord, err := s.Store.GetOrderByID(ctx, orderID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return delivery.AccessResult{}, delivery.ErrNotFound
		}
		return delivery.AccessResult{}, apperr.Internal(apperr.CodeInternalError, "Order lookup failed")
	}
	if !ord.IsPaid() {
		return delivery.AccessResult{}, delivery.ErrUnpaid
	}
	if ord.BuyerUserID == nil || *ord.BuyerUserID != userID {
		return delivery.AccessResult{}, delivery.ErrNotFound
	}
	g, err := s.Store.GetGrantByOrderID(ctx, orderID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return delivery.AccessResult{}, delivery.ErrNotFound
		}
		return delivery.AccessResult{}, apperr.Internal(apperr.CodeInternalError, "Grant lookup failed")
	}
	return s.accessGrant(ctx, g, userID, delivery.ActorBuyer, true)
}

// AccessByToken exchanges a purpose-bound access token for delivery payload (guest §6.5 style).
func (s *DeliveryService) AccessByToken(ctx context.Context, rawToken string) (delivery.AccessResult, error) {
	rawToken = strings.TrimSpace(rawToken)
	if rawToken == "" {
		return delivery.AccessResult{}, delivery.ErrAccessDenied
	}
	hash := s.hashToken(rawToken)
	g, err := s.Store.GetGrantByAccessTokenHash(ctx, hash)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return delivery.AccessResult{}, delivery.ErrAccessDenied
		}
		return delivery.AccessResult{}, apperr.Internal(apperr.CodeInternalError, "Grant lookup failed")
	}
	ord, err := s.Store.GetOrderByID(ctx, g.OrderID)
	if err != nil {
		return delivery.AccessResult{}, apperr.Internal(apperr.CodeInternalError, "Order lookup failed")
	}
	if !ord.IsPaid() {
		return delivery.AccessResult{}, delivery.ErrUnpaid
	}
	return s.accessGrant(ctx, g, "", delivery.ActorBuyer, true)
}

func (s *DeliveryService) accessGrant(ctx context.Context, g delivery.Grant, actorUserID, actorKind string, revealSecrets bool) (delivery.AccessResult, error) {
	now := s.now()
	if g.Status == delivery.StatusRevoked || g.RevokedAt != nil {
		return delivery.AccessResult{}, delivery.ErrRevoked
	}
	if g.Status == delivery.StatusExpired {
		return delivery.AccessResult{}, delivery.ErrExpired
	}
	if g.ExpiresAt != nil && !g.ExpiresAt.After(now) {
		return delivery.AccessResult{}, delivery.ErrExpired
	}
	if g.AccessTokenExpiresAt != nil && !g.AccessTokenExpiresAt.After(now) {
		return delivery.AccessResult{}, delivery.ErrExpired
	}
	if g.Status != delivery.StatusActive && g.Status != delivery.StatusPendingFulfillment {
		return delivery.AccessResult{}, delivery.ErrAccessDenied
	}
	if g.Status == delivery.StatusPendingFulfillment {
		return delivery.AccessResult{}, delivery.ErrAccessDenied
	}

	updated, err := s.Store.IncrementAccess(ctx, g.ID, now)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return delivery.AccessResult{}, delivery.ErrAccessDenied
		}
		return delivery.AccessResult{}, apperr.Internal(apperr.CodeInternalError, "Access increment failed")
	}
	g = updated

	var actorPtr *string
	if actorUserID != "" {
		actorPtr = &actorUserID
	}
	_ = s.Store.InsertAttempt(ctx, delivery.Attempt{
		ID:          s.IDs.New(),
		GrantID:     g.ID,
		OrderID:     g.OrderID,
		StoreID:     g.StoreID,
		Channel:     delivery.ChannelAccess,
		Result:      delivery.ResultDelivered,
		ActorUserID: actorPtr,
		ActorKind:   actorKind,
		Reason:      "access",
		CreatedAt:   now,
	})

	out := delivery.AccessResult{
		GrantID:      g.ID,
		OrderID:      g.OrderID,
		OrderItemID:  g.OrderItemID,
		DeliveryKind: g.DeliveryKind,
		Status:       g.Status,
		AccessCount:  g.AccessCount,
		MaxAccesses:  g.MaxAccesses,
		ExpiresAt:    g.AccessTokenExpiresAt,
	}
	if g.ObjectID != nil {
		out.DownloadObjectID = g.ObjectID
	}
	if revealSecrets && (g.DeliveryKind == delivery.KindCode || g.DeliveryKind == delivery.KindCredential) && g.StockItemID != nil {
		secrets, err := s.decryptStock(ctx, *g.StockItemID)
		if err != nil {
			return delivery.AccessResult{}, err
		}
		out.Secrets = secrets
	}
	return out, nil
}

func (s *DeliveryService) decryptStock(ctx context.Context, stockItemID string) (map[string]string, error) {
	secret, err := s.encryptionSecret()
	if err != nil {
		return nil, err
	}
	item, err := s.Store.GetStockPayload(ctx, stockItemID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return nil, delivery.ErrNotFound
		}
		return nil, apperr.Internal(apperr.CodeInternalError, "Stock lookup failed")
	}
	plain, err := security.DecryptAEAD(secret, item.EncryptedPayload)
	if err != nil {
		return nil, apperr.Internal(apperr.CodeInternalError, "Decrypt stock failed")
	}
	var values map[string]string
	if err := json.Unmarshal(plain, &values); err != nil {
		return nil, apperr.Internal(apperr.CodeInternalError, "Decode stock payload failed")
	}
	return values, nil
}

// ResendInput is seller/admin/buyer resend of existing grant (no second credential).
type ResendInput struct {
	ActorUserID    string
	ActorKind      string // BUYER|SELLER|ADMIN
	OrderID        string
	StoreID        string // required for seller path
	IdempotencyKey string
	Reason         string
	RotateToken    bool
}

// ResendResult is resend outcome (never includes secrets for admin).
type ResendResult struct {
	GrantID     string
	OrderID     string
	Status      string
	AttemptID   string
	AccessToken string // only for buyer/guest resend when RotateToken
	Replayed    bool
}

// Resend queues an idempotent resend for the existing grant (same allocation).
func (s *DeliveryService) Resend(ctx context.Context, in ResendInput) (ResendResult, error) {
	ord, g, err := s.loadPaidOrderGrant(ctx, in.OrderID)
	if err != nil {
		return ResendResult{}, err
	}
	if err := s.authorizeActor(ctx, in.ActorUserID, in.ActorKind, ord, g, in.StoreID); err != nil {
		return ResendResult{}, err
	}
	if g.Status == delivery.StatusRevoked {
		return ResendResult{}, delivery.ErrRevoked
	}
	now := s.now()
	idem := strings.TrimSpace(in.IdempotencyKey)
	if idem != "" {
		if existing, err := s.Store.GetAttemptByIdem(ctx, g.ID, "resend:"+idem); err == nil {
			return ResendResult{
				GrantID:   g.ID,
				OrderID:   g.OrderID,
				Status:    g.Status,
				AttemptID: existing.ID,
				Replayed:  true,
			}, nil
		}
	}

	var rawToken string
	err = s.Store.WithTx(ctx, func(ctx context.Context) error {
		if in.RotateToken && in.ActorKind != delivery.ActorAdmin {
			raw, err := auth.GenerateToken(32)
			if err != nil {
				return apperr.Internal(apperr.CodeInternalError, "Token generation failed")
			}
			rawToken = raw
			hash := s.hashToken(raw)
			exp := now.Add(delivery.DefaultAccessTTL)
			ug, err := s.Store.RotateAccessToken(ctx, g.ID, hash, exp, now)
			if err != nil {
				if s.Store.IsNotFound(err) {
					return delivery.ErrRevoked
				}
				return apperr.Internal(apperr.CodeInternalError, "Rotate access token failed")
			}
			g = ug
		}
		attemptID := s.IDs.New()
		var actorPtr *string
		if in.ActorUserID != "" {
			actorPtr = &in.ActorUserID
		}
		var idemPtr *string
		if idem != "" {
			k := "resend:" + idem
			idemPtr = &k
		}
		if err := s.Store.InsertAttempt(ctx, delivery.Attempt{
			ID:             attemptID,
			GrantID:        g.ID,
			OrderID:        g.OrderID,
			StoreID:        g.StoreID,
			Channel:        delivery.ChannelResend,
			Result:         delivery.ResultQueued,
			ActorUserID:    actorPtr,
			ActorKind:      in.ActorKind,
			Reason:         strings.TrimSpace(in.Reason),
			IdempotencyKey: idemPtr,
			CreatedAt:      now,
		}); err != nil {
			if s.Store.IsUniqueViolation(err) && idem != "" {
				return nil // will re-read
			}
			return apperr.Internal(apperr.CodeInternalError, "Insert attempt failed")
		}
		dedupe := fmt.Sprintf("delivery.resend:%s:%s", g.ID, idem)
		if idem == "" {
			dedupe = fmt.Sprintf("delivery.resend:%s:%s", g.ID, attemptID)
		}
		payload, _ := json.Marshal(map[string]any{"grantId": g.ID, "orderId": g.OrderID, "attemptId": attemptID})
		_ = s.Store.InsertOutbox(ctx, s.IDs.New(), delivery.TopicDeliveryResend, payload, &dedupe, now)
		return nil
	})
	if err != nil {
		return ResendResult{}, err
	}
	// Admin never receives secrets/tokens.
	if in.ActorKind == delivery.ActorAdmin {
		rawToken = ""
	}
	return ResendResult{
		GrantID:     g.ID,
		OrderID:     g.OrderID,
		Status:      g.Status,
		AccessToken: rawToken,
	}, nil
}

// RetryInput retries fulfillment for DELIVERY_FAILED without allocating a second credential.
type RetryInput struct {
	ActorUserID    string
	ActorKind      string
	OrderID        string
	StoreID        string
	IdempotencyKey string
	Reason         string
	// StockItemID/ReservationID only used if grant still pending allocation (same order item).
	StockItemID        string
	StockReservationID string
}

// Retry reactivates a failed grant using the same fulfillment effect key / allocation.
func (s *DeliveryService) Retry(ctx context.Context, in RetryInput) (delivery.Grant, error) {
	ord, g, err := s.loadPaidOrderGrant(ctx, in.OrderID)
	if err != nil {
		return delivery.Grant{}, err
	}
	if err := s.authorizeActor(ctx, in.ActorUserID, in.ActorKind, ord, g, in.StoreID); err != nil {
		return delivery.Grant{}, err
	}
	if g.Status == delivery.StatusRevoked {
		return delivery.Grant{}, delivery.ErrRevoked
	}
	// Already active: idempotent return same grant (no second credential).
	if g.Status == delivery.StatusActive {
		return g, nil
	}
	if g.Status != delivery.StatusDeliveryFailed && g.Status != delivery.StatusPendingFulfillment {
		return delivery.Grant{}, delivery.ErrGrantState
	}

	now := s.now()
	stockItem := g.StockItemID
	stockRes := g.StockReservationID
	// Only bind stock if not already allocated.
	if stockItem == nil && in.StockItemID != "" {
		v := in.StockItemID
		stockItem = &v
	}
	if stockRes == nil && in.StockReservationID != "" {
		v := in.StockReservationID
		stockRes = &v
	}

	var out delivery.Grant
	err = s.Store.WithTx(ctx, func(ctx context.Context) error {
		patch := delivery.GrantPatch{
			ActivatedAt:        &now,
			StockItemID:        stockItem,
			StockReservationID: stockRes,
		}
		from := g.Status
		ug, err := s.Store.UpdateGrantStatus(ctx, g.ID, from, delivery.StatusActive, patch, now)
		if err != nil {
			if s.Store.IsNotFound(err) {
				return delivery.ErrGrantState
			}
			return apperr.Internal(apperr.CodeInternalError, "Retry grant failed")
		}
		out = ug
		var actorPtr *string
		if in.ActorUserID != "" {
			actorPtr = &in.ActorUserID
		}
		var idemPtr *string
		if strings.TrimSpace(in.IdempotencyKey) != "" {
			k := "retry:" + strings.TrimSpace(in.IdempotencyKey)
			idemPtr = &k
		}
		attemptID := s.IDs.New()
		if err := s.Store.InsertAttempt(ctx, delivery.Attempt{
			ID:             attemptID,
			GrantID:        g.ID,
			OrderID:        g.OrderID,
			StoreID:        g.StoreID,
			Channel:        delivery.ChannelRetry,
			Result:         delivery.ResultDelivered,
			ActorUserID:    actorPtr,
			ActorKind:      in.ActorKind,
			Reason:         strings.TrimSpace(in.Reason),
			IdempotencyKey: idemPtr,
			CreatedAt:      now,
		}); err != nil && !s.Store.IsUniqueViolation(err) {
			return apperr.Internal(apperr.CodeInternalError, "Insert retry attempt failed")
		}
		dedupe := fmt.Sprintf("delivery.retry:%s", g.ID)
		if idemPtr != nil {
			dedupe = fmt.Sprintf("delivery.retry:%s:%s", g.ID, *idemPtr)
		}
		payload, _ := json.Marshal(map[string]any{"grantId": g.ID, "orderId": g.OrderID})
		_ = s.Store.InsertOutbox(ctx, s.IDs.New(), delivery.TopicDeliveryRetry, payload, &dedupe, now)
		return nil
	})
	return out, err
}

// ForceFulfill marks grant active for support (no secret returned).
func (s *DeliveryService) ForceFulfill(ctx context.Context, actorUserID, orderID, reason string) (delivery.Grant, error) {
	admin, err := s.Store.UserIsPlatformAdmin(ctx, actorUserID)
	if err != nil || !admin {
		return delivery.Grant{}, delivery.ErrNotFound
	}
	_, g, err := s.loadPaidOrderGrant(ctx, orderID)
	if err != nil {
		return delivery.Grant{}, err
	}
	if g.Status == delivery.StatusRevoked {
		return delivery.Grant{}, delivery.ErrRevoked
	}
	if g.Status == delivery.StatusActive {
		return g, nil
	}
	now := s.now()
	patch := delivery.GrantPatch{ActivatedAt: &now}
	ug, err := s.Store.UpdateGrantStatus(ctx, g.ID, g.Status, delivery.StatusActive, patch, now)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return delivery.Grant{}, delivery.ErrGrantState
		}
		return delivery.Grant{}, apperr.Internal(apperr.CodeInternalError, "Force fulfill failed")
	}
	actor := actorUserID
	_ = s.Store.InsertAttempt(ctx, delivery.Attempt{
		ID:          s.IDs.New(),
		GrantID:     g.ID,
		OrderID:     g.OrderID,
		StoreID:     g.StoreID,
		Channel:     delivery.ChannelForceFulfill,
		Result:      delivery.ResultDelivered,
		ActorUserID: &actor,
		ActorKind:   delivery.ActorAdmin,
		Reason:      strings.TrimSpace(reason),
		CreatedAt:   now,
	})
	// Explicitly no secrets.
	return ug, nil
}

// RevokeAccess disables future token/reveal; preserves order/invoice/history.
func (s *DeliveryService) RevokeAccess(ctx context.Context, actorUserID, actorKind, orderID, storeID, reason string) (delivery.Grant, error) {
	ord, g, err := s.loadPaidOrderGrant(ctx, orderID)
	if err != nil {
		return delivery.Grant{}, err
	}
	if err := s.authorizeActor(ctx, actorUserID, actorKind, ord, g, storeID); err != nil {
		return delivery.Grant{}, err
	}
	if g.Status == delivery.StatusRevoked {
		return g, nil
	}
	now := s.now()
	r := strings.TrimSpace(reason)
	if r == "" {
		r = "revoked"
	}
	patch := delivery.GrantPatch{
		RevokedAt:    &now,
		RevokeReason: &r,
	}
	ug, err := s.Store.UpdateGrantStatus(ctx, g.ID, g.Status, delivery.StatusRevoked, patch, now)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return delivery.Grant{}, delivery.ErrGrantState
		}
		return delivery.Grant{}, apperr.Internal(apperr.CodeInternalError, "Revoke grant failed")
	}
	var actorPtr *string
	if actorUserID != "" {
		actorPtr = &actorUserID
	}
	_ = s.Store.InsertAttempt(ctx, delivery.Attempt{
		ID:          s.IDs.New(),
		GrantID:     g.ID,
		OrderID:     g.OrderID,
		StoreID:     g.StoreID,
		Channel:     delivery.ChannelRevoke,
		Result:      delivery.ResultRevoked,
		ActorUserID: actorPtr,
		ActorKind:   actorKind,
		Reason:      r,
		CreatedAt:   now,
	})
	return ug, nil
}

// MarkDeliveryFailed transitions ACTIVE -> DELIVERY_FAILED for retry tests.
func (s *DeliveryService) MarkDeliveryFailed(ctx context.Context, orderID, reason string) (delivery.Grant, error) {
	_, g, err := s.loadPaidOrderGrant(ctx, orderID)
	if err != nil {
		return delivery.Grant{}, err
	}
	if g.Status != delivery.StatusActive {
		return delivery.Grant{}, delivery.ErrGrantState
	}
	now := s.now()
	r := reason
	if r == "" {
		r = "channel_failed"
	}
	patch := delivery.GrantPatch{FailedAt: &now, FailReason: &r}
	return s.Store.UpdateGrantStatus(ctx, g.ID, delivery.StatusActive, delivery.StatusDeliveryFailed, patch, now)
}

// GetGrantForSeller returns grant metadata without secrets.
func (s *DeliveryService) GetGrantForSeller(ctx context.Context, userID, storeID, orderID string) (delivery.Grant, error) {
	ord, g, err := s.loadPaidOrderGrant(ctx, orderID)
	if err != nil {
		return delivery.Grant{}, err
	}
	if err := s.authorizeActor(ctx, userID, delivery.ActorSeller, ord, g, storeID); err != nil {
		return delivery.Grant{}, err
	}
	return g, nil
}

// GetInvoice returns authorized invoice + current version snapshot.
func (s *DeliveryService) GetInvoice(ctx context.Context, userID, invoiceID string) (invoices.Invoice, invoices.Version, error) {
	inv, err := s.Store.GetInvoiceByID(ctx, invoiceID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return invoices.Invoice{}, invoices.Version{}, delivery.ErrInvoiceNotFound
		}
		return invoices.Invoice{}, invoices.Version{}, apperr.Internal(apperr.CodeInternalError, "Invoice lookup failed")
	}
	if err := s.authorizeInvoiceRead(ctx, userID, inv); err != nil {
		return invoices.Invoice{}, invoices.Version{}, err
	}
	ver, err := s.Store.GetInvoiceVersion(ctx, inv.ID, inv.CurrentVersion)
	if err != nil {
		return invoices.Invoice{}, invoices.Version{}, apperr.Internal(apperr.CodeInternalError, "Invoice version lookup failed")
	}
	return inv, ver, nil
}

// GetInvoiceByOrder returns invoice for an order the actor can access.
func (s *DeliveryService) GetInvoiceByOrder(ctx context.Context, userID, orderID string) (invoices.Invoice, invoices.Version, error) {
	ord, err := s.Store.GetOrderByID(ctx, orderID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return invoices.Invoice{}, invoices.Version{}, delivery.ErrNotFound
		}
		return invoices.Invoice{}, invoices.Version{}, apperr.Internal(apperr.CodeInternalError, "Order lookup failed")
	}
	if !ord.IsPaid() {
		return invoices.Invoice{}, invoices.Version{}, delivery.ErrUnpaid
	}
	// Buyer or seller/admin.
	ok := false
	if userID != "" && ord.BuyerUserID != nil && *ord.BuyerUserID == userID {
		ok = true
	}
	if !ok && userID != "" {
		admin, _ := s.Store.UserIsPlatformAdmin(ctx, userID)
		if admin {
			ok = true
		} else {
			can, _ := s.Store.UserCanAccessStore(ctx, userID, ord.StoreID)
			ok = can
		}
	}
	if !ok {
		return invoices.Invoice{}, invoices.Version{}, delivery.ErrNotFound
	}
	inv, err := s.Store.GetInvoiceByOrder(ctx, orderID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return invoices.Invoice{}, invoices.Version{}, delivery.ErrInvoiceNotFound
		}
		return invoices.Invoice{}, invoices.Version{}, apperr.Internal(apperr.CodeInternalError, "Invoice lookup failed")
	}
	ver, err := s.Store.GetInvoiceVersion(ctx, inv.ID, inv.CurrentVersion)
	if err != nil {
		return invoices.Invoice{}, invoices.Version{}, apperr.Internal(apperr.CodeInternalError, "Invoice version lookup failed")
	}
	return inv, ver, nil
}

// EnsureInvoice is idempotent create/repair for paid orders (no client amounts).
func (s *DeliveryService) EnsureInvoice(ctx context.Context, userID, orderID string) (invoices.Invoice, invoices.Version, error) {
	// If exists, return immutable snapshot (never rebuild from catalog).
	if inv, ver, err := s.GetInvoiceByOrder(ctx, userID, orderID); err == nil {
		return inv, ver, nil
	}
	return invoices.Invoice{}, invoices.Version{}, delivery.ErrInvoiceNotFound
}

// PublicVerify verifies by high-entropy public code; returns privacy-safe fields only.
func (s *DeliveryService) PublicVerify(ctx context.Context, rawCode string) (invoices.PublicVerify, error) {
	rawCode = strings.TrimSpace(rawCode)
	if rawCode == "" {
		return invoices.PublicVerify{Valid: false}, delivery.ErrVerifyInvalid
	}
	hash := auth.HashToken(rawCode)
	inv, err := s.Store.GetInvoiceByPublicCodeHash(ctx, hash)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return invoices.PublicVerify{Valid: false}, delivery.ErrVerifyInvalid
		}
		return invoices.PublicVerify{}, apperr.Internal(apperr.CodeInternalError, "Invoice verify failed")
	}
	ver, err := s.Store.GetInvoiceVersion(ctx, inv.ID, inv.CurrentVersion)
	if err != nil {
		return invoices.PublicVerify{}, apperr.Internal(apperr.CodeInternalError, "Invoice version lookup failed")
	}
	var snap invoices.Snapshot
	if err := json.Unmarshal(ver.Snapshot, &snap); err != nil {
		return invoices.PublicVerify{}, apperr.Internal(apperr.CodeInternalError, "Invoice snapshot decode failed")
	}
	// Privacy-safe only: no buyer email/name/userId, no merchant internal details beyond store name.
	return invoices.PublicVerify{
		Valid:         true,
		InvoiceNumber: inv.InvoiceNumber,
		OrderNumber:   snap.OrderNumber,
		Currency:      inv.Currency,
		GrossIDR:      inv.GrossIDR,
		PaidAt:        inv.PaidAt,
		StoreName:     snap.Issuer.StoreName,
	}, nil
}

// RenderInvoiceStatus marks render ready/skipped (on-demand bounded; no R2 required for tests).
func (s *DeliveryService) RenderInvoiceStatus(ctx context.Context, invoiceID string) (invoices.Version, error) {
	inv, err := s.Store.GetInvoiceByID(ctx, invoiceID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return invoices.Version{}, delivery.ErrInvoiceNotFound
		}
		return invoices.Version{}, apperr.Internal(apperr.CodeInternalError, "Invoice lookup failed")
	}
	ver, err := s.Store.GetInvoiceVersion(ctx, inv.ID, inv.CurrentVersion)
	if err != nil {
		return invoices.Version{}, apperr.Internal(apperr.CodeInternalError, "Invoice version lookup failed")
	}
	if ver.RenderStatus == invoices.RenderReady || ver.RenderStatus == invoices.RenderSkipped {
		return ver, nil
	}
	now := s.now()
	// Without R2, mark SKIPPED with snapshot retained (HTML/status fallback).
	ug, err := s.Store.UpdateInvoiceRenderStatus(ctx, inv.ID, ver.Version, invoices.RenderSkipped, nil, nil, &now)
	if err != nil {
		return invoices.Version{}, apperr.Internal(apperr.CodeInternalError, "Invoice render status failed")
	}
	_ = s.Store.UpdateInvoiceStatus(ctx, inv.ID, invoices.StatusReady, now)
	return ug, nil
}

// InvoiceSnapshotHash returns the immutable payload hash for v1 (immutability tests).
func (s *DeliveryService) InvoiceSnapshotHash(ctx context.Context, invoiceID string) (string, []byte, error) {
	inv, err := s.Store.GetInvoiceByID(ctx, invoiceID)
	if err != nil {
		return "", nil, err
	}
	ver, err := s.Store.GetInvoiceVersion(ctx, inv.ID, 1)
	if err != nil {
		return "", nil, err
	}
	return ver.PayloadHash, ver.Snapshot, nil
}

func (s *DeliveryService) loadPaidOrderGrant(ctx context.Context, orderID string) (orders.Order, delivery.Grant, error) {
	ord, err := s.Store.GetOrderByID(ctx, orderID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return orders.Order{}, delivery.Grant{}, delivery.ErrNotFound
		}
		return orders.Order{}, delivery.Grant{}, apperr.Internal(apperr.CodeInternalError, "Order lookup failed")
	}
	if !ord.IsPaid() {
		return orders.Order{}, delivery.Grant{}, delivery.ErrUnpaid
	}
	g, err := s.Store.GetGrantByOrderID(ctx, orderID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return orders.Order{}, delivery.Grant{}, delivery.ErrNotFound
		}
		return orders.Order{}, delivery.Grant{}, apperr.Internal(apperr.CodeInternalError, "Grant lookup failed")
	}
	return ord, g, nil
}

func (s *DeliveryService) authorizeActor(ctx context.Context, userID, actorKind string, ord orders.Order, g delivery.Grant, storeID string) error {
	switch actorKind {
	case delivery.ActorBuyer:
		if userID == "" || ord.BuyerUserID == nil || *ord.BuyerUserID != userID {
			return delivery.ErrNotFound
		}
		return nil
	case delivery.ActorSeller:
		if userID == "" {
			return apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required")
		}
		sid := storeID
		if sid == "" {
			sid = ord.StoreID
		}
		if sid != ord.StoreID || sid != g.StoreID {
			return delivery.ErrNotFound
		}
		admin, err := s.Store.UserIsPlatformAdmin(ctx, userID)
		if err != nil {
			return apperr.Internal(apperr.CodeInternalError, "Authorization check failed")
		}
		if admin {
			return nil
		}
		ok, err := s.Store.UserCanAccessStore(ctx, userID, sid)
		if err != nil {
			return apperr.Internal(apperr.CodeInternalError, "Authorization check failed")
		}
		if !ok {
			return delivery.ErrNotFound
		}
		return nil
	case delivery.ActorAdmin:
		if userID == "" {
			return apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required")
		}
		admin, err := s.Store.UserIsPlatformAdmin(ctx, userID)
		if err != nil || !admin {
			return delivery.ErrNotFound
		}
		return nil
	case delivery.ActorSystem:
		return nil
	default:
		return delivery.ErrAccessDenied
	}
}

func (s *DeliveryService) authorizeInvoiceRead(ctx context.Context, userID string, inv invoices.Invoice) error {
	if userID == "" {
		return apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required")
	}
	if inv.BuyerUserID != nil && *inv.BuyerUserID == userID {
		return nil
	}
	admin, err := s.Store.UserIsPlatformAdmin(ctx, userID)
	if err != nil {
		return apperr.Internal(apperr.CodeInternalError, "Authorization check failed")
	}
	if admin {
		return nil
	}
	ok, err := s.Store.UserCanAccessStore(ctx, userID, inv.StoreID)
	if err != nil {
		return apperr.Internal(apperr.CodeInternalError, "Authorization check failed")
	}
	if !ok {
		return delivery.ErrInvoiceNotFound
	}
	return nil
}

func deliveryKindForProduct(productType string) string {
	switch productType {
	case "download":
		return delivery.KindDownload
	case "link":
		return delivery.KindProtectedLink
	case "code":
		return delivery.KindCode
	default:
		return delivery.KindCredential
	}
}

func roundHalfUp(numer, denom int64) int64 {
	if denom <= 0 {
		return 0
	}
	// round half up for positive integers
	return (numer + denom/2) / denom
}

func sha256Hex(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}
