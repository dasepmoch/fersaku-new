package application

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/analytics"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/gateway"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/orders"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/payments"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/platform"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// GatewayService implements QRIS Payment Gateway API (BE-320).
// Payment-only: create/status/cancel/events. No product/catalog/upload/list.
type GatewayService struct {
	Store GatewayStore
	Fees  *FeeService
	// Analytics ensures QRIS never fabricates storefront traffic (BE-360).
	Analytics *AnalyticsService
	QRIS      ports.QRISProvider
	IDs       ports.IDGenerator
	Clock     ports.Clock
	Log       ports.Logger
	// KeyHashSecret for HMAC of API keys (same class as session secret).
	KeyHashSecret string
	// AccountScope from Xendit adapter.
	AccountScope string
	// QRISCheckoutDisabled emergency switch (zero value = enabled).
	QRISCheckoutDisabled bool
	// EmergencyDisabled when set consults platform_emergency_controls (BE-510).
	// Returns true when the named switch is off (product surface disabled).
	EmergencyDisabled func(ctx context.Context, switchName string) (bool, error)
	// rateMu + rateMap: simple in-memory rate limit for tests (redis later).
	rateMu  sync.Mutex
	rateMap map[string][]time.Time
}

func (s *GatewayService) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now().UTC()
	}
	return time.Now().UTC()
}

func (s *GatewayService) accountScope() string {
	if s.AccountScope != "" {
		return s.AccountScope
	}
	return payments.AccountScopePrimary
}

func (s *GatewayService) hashKey(raw string) string {
	return auth.HashTokenKeyed(raw, s.KeyHashSecret)
}

func (s *GatewayService) hashIdem(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// ResolveAPIKey authenticates Authorization Bearer raw key.
func (s *GatewayService) ResolveAPIKey(ctx context.Context, raw string) (gateway.AuthContext, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || !strings.HasPrefix(raw, "fsk_") {
		return gateway.AuthContext{}, gateway.ErrAuthInvalid
	}
	prefix := gateway.ParseAPIKeyPrefix(raw)
	k, err := s.Store.GetAPIKeyByPrefix(ctx, prefix)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return gateway.AuthContext{}, gateway.ErrAuthInvalid
		}
		return gateway.AuthContext{}, apperr.Internal(apperr.CodeInternalError, "API key lookup failed")
	}
	if k.Status != gateway.KeyStatusActive {
		return gateway.AuthContext{}, gateway.ErrAuthInvalid
	}
	if k.ExpiresAt != nil && !k.ExpiresAt.After(s.now()) {
		return gateway.AuthContext{}, gateway.ErrAuthInvalid
	}
	want := s.hashKey(raw)
	if !auth.EqualHash(want, k.KeyHash) {
		return gateway.AuthContext{}, gateway.ErrAuthInvalid
	}
	_ = s.Store.TouchAPIKeyLastUsed(ctx, k.ID, s.now())
	return gateway.AuthContext{
		KeyID:       k.ID,
		MerchantID:  k.MerchantID,
		PaymentMode: k.PaymentMode,
		KeyPrefix:   k.KeyPrefix,
	}, nil
}

// CreateSandboxAPIKey issues a one-time sandbox key for tests/minimal provisioning (BE-410 owns full lifecycle).
func (s *GatewayService) CreateSandboxAPIKey(ctx context.Context, merchantID, name string) (rawKey string, key gateway.APIKey, err error) {
	return s.CreateAPIKey(ctx, merchantID, gateway.ModeSandbox, name)
}

// CreateAPIKey issues an API key for the given mode.
// LIVE keys require ACTIVE capability (post-KYC). Full one-time claim lifecycle is BE-410;
// this path remains for sandbox provisioning and post-approval test/admin issuance only.
func (s *GatewayService) CreateAPIKey(ctx context.Context, merchantID, mode, name string) (rawKey string, key gateway.APIKey, err error) {
	if merchantID == "" {
		return "", gateway.APIKey{}, apperr.Validation(apperr.CodeValidationFailed, "merchantId is required")
	}
	if mode != gateway.ModeSandbox && mode != gateway.ModeLive {
		return "", gateway.APIKey{}, apperr.Validation(apperr.CodeValidationFailed, "invalid payment mode")
	}
	// BE-400: deny LIVE key material until KYC-approved capability exists.
	// BE-410 will replace this with AUTHORIZED claim consumption only.
	if mode == gateway.ModeLive {
		if err := s.ensureLiveCapability(ctx, merchantID); err != nil {
			return "", gateway.APIKey{}, err
		}
	}
	secret, err := auth.GenerateToken(32)
	if err != nil {
		return "", gateway.APIKey{}, apperr.Internal(apperr.CodeInternalError, "Key generation failed")
	}
	pfx := gateway.KeyPrefixSandbox
	if mode == gateway.ModeLive {
		pfx = gateway.KeyPrefixLive
	}
	raw := pfx + secret
	prefix := gateway.ParseAPIKeyPrefix(raw)
	now := s.now()
	id := s.IDs.New()
	if !strings.HasPrefix(id, "mak_") {
		id = "mak_" + id
	}
	k := gateway.APIKey{
		ID:          id,
		MerchantID:  merchantID,
		KeyPrefix:   prefix,
		KeyHash:     s.hashKey(raw),
		PaymentMode: mode,
		Status:      gateway.KeyStatusActive,
		Name:        name,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := s.Store.InsertAPIKey(ctx, k); err != nil {
		if s.Store.IsUniqueViolation(err) {
			return "", gateway.APIKey{}, apperr.Conflict(apperr.CodeConflict, "Active API key already exists")
		}
		return "", gateway.APIKey{}, apperr.Internal(apperr.CodeInternalError, "Failed to store API key")
	}
	return raw, k, nil
}

// SetCapability sets capability status (test/admin stub; full KYC is BE-400).
func (s *GatewayService) SetCapability(ctx context.Context, merchantID, mode, status string) error {
	if mode != gateway.ModeSandbox && mode != gateway.ModeLive {
		return apperr.Validation(apperr.CodeValidationFailed, "invalid payment mode")
	}
	now := s.now()
	id := s.IDs.New()
	if !strings.HasPrefix(id, "cap_") {
		id = "cap_" + id
	}
	c := gateway.Capability{
		ID:          id,
		MerchantID:  merchantID,
		PaymentMode: mode,
		Capability:  gateway.CapabilityQRISAPI,
		Status:      status,
		EffectiveAt: &now,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	return s.Store.UpsertCapability(ctx, c)
}

// RegisterRedirectOrigin adds an allowlisted origin (admin/support stub).
func (s *GatewayService) RegisterRedirectOrigin(ctx context.Context, merchantID, mode, originRaw string) (gateway.RedirectOrigin, error) {
	origin, ok := gateway.NormalizeOrigin(originRaw)
	if !ok {
		return gateway.RedirectOrigin{}, apperr.Validation(apperr.CodeValidationFailed, "Invalid redirect origin")
	}
	now := s.now()
	id := s.IDs.New()
	if !strings.HasPrefix(id, "gro_") {
		id = "gro_" + id
	}
	o := gateway.RedirectOrigin{
		ID:          id,
		MerchantID:  merchantID,
		PaymentMode: mode,
		Origin:      origin,
		Status:      gateway.OriginStatusActive,
		CreatedAt:   now,
	}
	if err := s.Store.InsertRedirectOrigin(ctx, o); err != nil {
		if s.Store.IsUniqueViolation(err) {
			existing, gerr := s.Store.GetRedirectOrigin(ctx, merchantID, mode, origin)
			if gerr == nil {
				return existing, nil
			}
		}
		return gateway.RedirectOrigin{}, apperr.Internal(apperr.CodeInternalError, "Failed to register origin")
	}
	return o, nil
}

// RegisterWebhookEndpoint registers an ACTIVE endpoint for webhookEndpointId validation (stub).
func (s *GatewayService) RegisterWebhookEndpoint(ctx context.Context, merchantID, mode, url string) (gateway.WebhookEndpoint, error) {
	if !strings.HasPrefix(url, "https://") {
		return gateway.WebhookEndpoint{}, apperr.Validation(apperr.CodeValidationFailed, "Webhook URL must be HTTPS")
	}
	now := s.now()
	id := s.IDs.New()
	if !strings.HasPrefix(id, "whep_") {
		id = "whep_" + id
	}
	e := gateway.WebhookEndpoint{
		ID:            id,
		MerchantID:    merchantID,
		PaymentMode:   mode,
		URL:           url,
		Status:        gateway.WebhookStatusActive,
		ConfigVersion: 1,
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	if err := s.Store.InsertWebhookEndpoint(ctx, e); err != nil {
		return gateway.WebhookEndpoint{}, apperr.Internal(apperr.CodeInternalError, "Failed to register webhook endpoint")
	}
	return e, nil
}

// CreatePaymentRequest is POST /v1/gateway/payment-intents.
type CreatePaymentRequest struct {
	Auth               gateway.AuthContext
	MerchantReference  string
	AmountIDR          int64
	Currency           string
	Description        string
	CustomerReference  string
	CustomerEmail      string
	ExpiresInMinutes   int
	SuccessURL         string
	FailureURL         string
	WebhookEndpointID  string
	// WebhookURL if non-empty must be rejected (legacy).
	WebhookURL      string
	Metadata        json.RawMessage
	IdempotencyKey  string
}

// CreatePaymentResult is create response payload.
type CreatePaymentResult struct {
	Intent         payments.Intent
	FeeIDR         int64
	MerchantNetIDR int64
	Replayed       bool
}

func (s *GatewayService) ensureLiveCapability(ctx context.Context, merchantID string) error {
	cap, err := s.Store.GetCapability(ctx, merchantID, gateway.ModeLive, gateway.CapabilityQRISAPI)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return gateway.ErrKYCRequiredForLive
		}
		return apperr.Internal(apperr.CodeInternalError, "Capability lookup failed")
	}
	if cap.Status != gateway.CapStatusActive {
		return gateway.ErrKYCRequiredForLive
	}
	if cap.ExpiresAt != nil && !cap.ExpiresAt.After(s.now()) {
		return gateway.ErrKYCRequiredForLive
	}
	return nil
}

func (s *GatewayService) ensureMerchantActive(ctx context.Context, merchantID string) error {
	st, err := s.Store.GetMerchantStatus(ctx, merchantID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return gateway.ErrMerchantSuspended
		}
		return apperr.Internal(apperr.CodeInternalError, "Merchant lookup failed")
	}
	// Accept active / complete / empty; reject suspended.
	switch strings.ToUpper(st) {
	case "SUSPENDED", "BANNED", "DISABLED":
		return gateway.ErrMerchantSuspended
	}
	return nil
}

func (s *GatewayService) checkRateLimit(merchantID, mode string) error {
	s.rateMu.Lock()
	defer s.rateMu.Unlock()
	if s.rateMap == nil {
		s.rateMap = make(map[string][]time.Time)
	}
	key := merchantID + "|" + mode
	now := s.now()
	window := now.Add(-1 * time.Minute)
	var kept []time.Time
	for _, t := range s.rateMap[key] {
		if t.After(window) {
			kept = append(kept, t)
		}
	}
	// 60 creates/minute soft limit for in-memory tests.
	if len(kept) >= 60 {
		return apperr.New(apperr.KindRateLimited, apperr.CodeRateLimited, "Rate limit exceeded")
	}
	s.rateMap[key] = append(kept, now)
	return nil
}

// CreatePayment creates a QRIS_API payment intent (sandbox or live after capability).
func (s *GatewayService) CreatePayment(ctx context.Context, req CreatePaymentRequest) (CreatePaymentResult, error) {
	if req.Auth.MerchantID == "" {
		return CreatePaymentResult{}, gateway.ErrAuthRequired
	}
	if strings.TrimSpace(req.WebhookURL) != "" {
		return CreatePaymentResult{}, gateway.ErrWebhookURLRejected
	}
	if strings.TrimSpace(req.IdempotencyKey) == "" {
		return CreatePaymentResult{}, apperr.Validation(apperr.CodeValidationFailed, "Idempotency-Key is required")
	}
	if s.QRISCheckoutDisabled {
		return CreatePaymentResult{}, gateway.ErrQRISCheckoutOff
	}
	if s.EmergencyDisabled != nil {
		if off, err := s.EmergencyDisabled(ctx, "QRIS_CHECKOUT"); err == nil && off {
			return CreatePaymentResult{}, gateway.ErrQRISCheckoutOff
		}
	}

	mode := req.Auth.PaymentMode
	if mode != gateway.ModeSandbox && mode != gateway.ModeLive {
		return CreatePaymentResult{}, gateway.ErrAuthInvalid
	}
	if mode == gateway.ModeLive {
		if err := s.ensureLiveCapability(ctx, req.Auth.MerchantID); err != nil {
			return CreatePaymentResult{}, err
		}
	}
	if err := s.ensureMerchantActive(ctx, req.Auth.MerchantID); err != nil {
		return CreatePaymentResult{}, err
	}
	if err := s.checkRateLimit(req.Auth.MerchantID, mode); err != nil {
		return CreatePaymentResult{}, err
	}

	ref, ok := gateway.SanitizeMerchantReference(req.MerchantReference)
	if !ok {
		return CreatePaymentResult{}, apperr.Validation(apperr.CodeValidationFailed, "merchantReference is required")
	}
	if req.Currency != "" && !strings.EqualFold(req.Currency, "IDR") {
		return CreatePaymentResult{}, apperr.Validation(apperr.CodeValidationFailed, "currency must be IDR")
	}
	if req.AmountIDR <= 0 {
		return CreatePaymentResult{}, gateway.ErrInvalidAmount
	}
	if err := gateway.ValidateMetadata(req.Metadata); err != nil {
		return CreatePaymentResult{}, err
	}
	desc := strings.TrimSpace(req.Description)
	if len(desc) > gateway.MaxDescriptionLen {
		return CreatePaymentResult{}, apperr.Validation(apperr.CodeValidationFailed, "description too long")
	}

	// Redirect URLs: validate shape + allowlist; NEVER fetch.
	var successURL, failureURL *string
	if strings.TrimSpace(req.SuccessURL) != "" {
		origin, ok := gateway.ValidateBrowserRedirectURL(req.SuccessURL)
		if !ok {
			return CreatePaymentResult{}, gateway.ErrRedirectOriginRejected
		}
		if _, err := s.Store.GetRedirectOrigin(ctx, req.Auth.MerchantID, mode, origin); err != nil {
			if s.Store.IsNotFound(err) {
				return CreatePaymentResult{}, gateway.ErrRedirectOriginRejected
			}
			return CreatePaymentResult{}, apperr.Internal(apperr.CodeInternalError, "Redirect origin lookup failed")
		}
		u := strings.TrimSpace(req.SuccessURL)
		successURL = &u
	}
	if strings.TrimSpace(req.FailureURL) != "" {
		origin, ok := gateway.ValidateBrowserRedirectURL(req.FailureURL)
		if !ok {
			return CreatePaymentResult{}, gateway.ErrRedirectOriginRejected
		}
		if _, err := s.Store.GetRedirectOrigin(ctx, req.Auth.MerchantID, mode, origin); err != nil {
			if s.Store.IsNotFound(err) {
				return CreatePaymentResult{}, gateway.ErrRedirectOriginRejected
			}
			return CreatePaymentResult{}, apperr.Internal(apperr.CodeInternalError, "Redirect origin lookup failed")
		}
		u := strings.TrimSpace(req.FailureURL)
		failureURL = &u
	}

	// webhookEndpointId optional; never webhookUrl.
	var webhookID *string
	var webhookVer *int32
	if strings.TrimSpace(req.WebhookEndpointID) != "" {
		ep, err := s.Store.GetWebhookEndpoint(ctx, strings.TrimSpace(req.WebhookEndpointID))
		if err != nil {
			if s.Store.IsNotFound(err) {
				return CreatePaymentResult{}, gateway.ErrWebhookEndpointInvalid
			}
			return CreatePaymentResult{}, apperr.Internal(apperr.CodeInternalError, "Webhook endpoint lookup failed")
		}
		// Non-enumerating rejection for cross-tenant / inactive / mode mismatch.
		if ep.MerchantID != req.Auth.MerchantID || ep.PaymentMode != mode || ep.Status != gateway.WebhookStatusActive {
			return CreatePaymentResult{}, gateway.ErrWebhookEndpointInvalid
		}
		id := ep.ID
		webhookID = &id
		v := ep.ConfigVersion
		webhookVer = &v
	}

	expiresMin := req.ExpiresInMinutes
	if expiresMin == 0 {
		expiresMin = gateway.DefaultExpiresMin
	}
	if expiresMin < gateway.MinExpiresMinutes || expiresMin > gateway.MaxExpiresMinutes {
		return CreatePaymentResult{}, apperr.Validation(apperr.CodeValidationFailed, "expiresInMinutes out of bounds")
	}

	keyHash := s.hashIdem(req.IdempotencyKey + "|" + req.Auth.MerchantID + "|" + mode)
	reqHash := s.hashIdem(fmt.Sprintf("v1|%s|%s|%d|%s|%s|%s|%s|%s",
		req.Auth.MerchantID, mode, req.AmountIDR, ref, desc,
		strings.TrimSpace(req.SuccessURL), strings.TrimSpace(req.FailureURL),
		strings.TrimSpace(req.WebhookEndpointID)))

	// Idempotent replay by Idempotency-Key.
	if existing, err := s.Store.GetPaymentIntentByIdempotency(ctx, req.Auth.MerchantID, mode, keyHash); err == nil {
		if existing.RequestHash != reqHash {
			return CreatePaymentResult{}, gateway.ErrIdempotencyConflict
		}
		return CreatePaymentResult{Intent: existing, Replayed: true, FeeIDR: feeFromSnap(existing), MerchantNetIDR: netFromSnap(existing)}, nil
	} else if !s.Store.IsNotFound(err) {
		return CreatePaymentResult{}, apperr.Internal(apperr.CodeInternalError, "Idempotency lookup failed")
	}

	// merchantReference uniqueness (also DB unique).
	if existing, err := s.Store.GetPaymentIntentByMerchantRef(ctx, req.Auth.MerchantID, mode, ref); err == nil {
		// Same reference returns existing if request hash matches via metadata path — treat as conflict if different key.
		return CreatePaymentResult{Intent: existing, Replayed: true, FeeIDR: feeFromSnap(existing), MerchantNetIDR: netFromSnap(existing)}, nil
	} else if !s.Store.IsNotFound(err) {
		return CreatePaymentResult{}, apperr.Internal(apperr.CodeInternalError, "Merchant reference lookup failed")
	}

	store, err := s.Store.GetCanonicalStore(ctx, req.Auth.MerchantID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return CreatePaymentResult{}, apperr.Validation(apperr.CodeValidationFailed, "Merchant has no canonical store")
		}
		return CreatePaymentResult{}, apperr.Internal(apperr.CodeInternalError, "Store lookup failed")
	}

	if s.Fees == nil {
		return CreatePaymentResult{}, apperr.Internal(apperr.CodeInternalError, "Fee service unavailable")
	}
	feeRes, policy, err := s.Fees.CalculateTransaction(ctx, req.AmountIDR, platform.SourceQRISAPI)
	if err != nil {
		return CreatePaymentResult{}, err
	}
	snap, err := s.Fees.SnapshotTransaction(ctx, platform.SourceQRISAPI, feeRes, policy)
	if err != nil {
		return CreatePaymentResult{}, err
	}
	feeSnapID := snap.ID

	now := s.now()
	expiresAt := now.Add(time.Duration(expiresMin) * time.Minute)
	orderID := s.IDs.New()
	if !strings.HasPrefix(orderID, "ord_") {
		orderID = "ord_" + orderID
	}
	intentID := s.IDs.New()
	if !strings.HasPrefix(intentID, "pi_") {
		intentID = "pi_" + intentID
	}
	externalID := "fersaku_" + mode + "_" + intentID
	orderNumber := fmt.Sprintf("GW-%s", intentID[len(intentID)-10:])

	email := auth.NormalizeEmail(req.CustomerEmail)
	meta := req.Metadata
	if len(meta) == 0 {
		meta = json.RawMessage(`{}`)
	}
	productSnap, _ := json.Marshal(map[string]any{
		"source":            payments.SourceQRISAPI,
		"merchantReference": ref,
		"description":       desc,
	})
	priceSnap, _ := json.Marshal(map[string]any{
		"grossIdr":       feeRes.GrossIDR,
		"feeIdr":         feeRes.TotalFeeIDR,
		"merchantNetIdr": feeRes.NetIDR,
		"feeSnapshotId":  feeSnapID,
		"policyVersion":  policy.VersionID,
	})

	mref := ref
	ord := CheckoutOrder{
		Order: orders.Order{
			ID:             orderID,
			OrderNumber:    orderNumber,
			StoreID:        store.ID,
			MerchantID:     req.Auth.MerchantID,
			BuyerEmail:     email,
			BuyerName:      strings.TrimSpace(req.CustomerReference),
			PaymentStatus:  orders.PaymentPending,
			Source:         orders.SourceQRISAPI,
			Currency:       "IDR",
			SubtotalIDR:    feeRes.GrossIDR,
			FeeIDR:         feeRes.TotalFeeIDR,
			GrossIDR:       feeRes.GrossIDR,
			MerchantNetIDR: feeRes.NetIDR,
			CreatedAt:      now,
			UpdatedAt:      now,
		},
		OrderStatus:        payments.OrderPendingPayment,
		PaymentMode:        mode,
		FeeSnapshotID:      &feeSnapID,
		ExpiresAt:          &expiresAt,
		IdempotencyKeyHash: &keyHash,
	}

	pi := payments.Intent{
		ID:                     intentID,
		OrderID:                orderID,
		StoreID:                store.ID,
		MerchantID:             req.Auth.MerchantID,
		PaymentMode:            mode,
		Source:                 payments.SourceQRISAPI,
		Provider:               payments.ProviderXendit,
		AccountScope:           s.accountScope(),
		ExternalID:             externalID,
		AmountIDR:              feeRes.GrossIDR,
		Currency:               payments.CurrencyIDR,
		FeeSnapshotID:          &feeSnapID,
		Status:                 payments.StatusRequiresPayment,
		ProviderFinancialState: payments.FinancialNormal,
		ExpiresAt:              expiresAt,
		BuyerEmail:             email,
		IdempotencyKeyHash:     keyHash,
		RequestHash:            reqHash,
		ProductSnapshot:        productSnap,
		PriceSnapshot:          priceSnap,
		MerchantReference:      &mref,
		Description:            desc,
		SuccessURL:             successURL,
		FailureURL:             failureURL,
		WebhookEndpointID:      webhookID,
		WebhookConfigVersion:   webhookVer,
		Metadata:               meta,
		Version:                1,
		CreatedAt:              now,
		UpdatedAt:              now,
	}

	if err := s.Store.WithTx(ctx, func(ctx context.Context) error {
		idemID := s.IDs.New()
		lease := now.Add(2 * time.Minute)
		pm := mode
		rec := IdempotencyRecord{
			ID:             idemID,
			SubjectType:    "gateway",
			SubjectID:      req.Auth.MerchantID,
			Operation:      "gateway.create_payment",
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
			return gateway.ErrIdempotencyConflict
		}
		if err := s.Store.InsertOrder(ctx, ord); err != nil {
			return err
		}
		if err := s.Store.InsertPaymentIntent(ctx, pi); err != nil {
			if s.Store.IsUniqueViolation(err) {
				return gateway.ErrIdempotencyConflict
			}
			return err
		}
		evPayload, _ := json.Marshal(map[string]any{
			"paymentIntentId":   intentID,
			"merchantReference": ref,
			"status":            payments.StatusRequiresPayment,
			"amount":            feeRes.GrossIDR,
		})
		ev := gateway.PaymentEvent{
			ID:              "gwev_" + s.IDs.New(),
			MerchantID:      req.Auth.MerchantID,
			PaymentMode:     mode,
			PaymentIntentID: intentID,
			EventType:       gateway.EventPaymentCreated,
			Payload:         evPayload,
			CreatedAt:       now,
		}
		return s.Store.InsertEvent(ctx, ev)
	}); err != nil {
		if err == gateway.ErrIdempotencyConflict {
			if existing, e2 := s.Store.GetPaymentIntentByIdempotency(ctx, req.Auth.MerchantID, mode, keyHash); e2 == nil {
				if existing.RequestHash != reqHash {
					return CreatePaymentResult{}, gateway.ErrIdempotencyConflict
				}
				return CreatePaymentResult{Intent: existing, Replayed: true, FeeIDR: feeFromSnap(existing), MerchantNetIDR: netFromSnap(existing)}, nil
			}
		}
		return CreatePaymentResult{}, apperr.Wrap(apperr.KindInternal, apperr.CodeInternalError, "Failed to create payment", err)
	}

	if s.QRIS == nil {
		return CreatePaymentResult{}, apperr.Internal(apperr.CodeInternalError, "Payment provider unavailable")
	}
	// LIVE uses real path when wired; SANDBOX uses fake — same interface, isolated mode flag.
	created, perr := s.QRIS.CreateQRIS(ctx, ports.CreateQRISInput{
		ExternalID:     externalID,
		AmountIDR:      feeRes.GrossIDR,
		Currency:       "IDR",
		Description:    desc,
		ExpiresAt:      expiresAt,
		PaymentMode:    mode,
		AccountScope:   s.accountScope(),
		IdempotencyKey: req.IdempotencyKey,
		Metadata: map[string]string{
			"orderId":  orderID,
			"intentId": intentID,
			"source":   payments.SourceQRISAPI,
		},
	})
	if perr != nil {
		if pe, ok := perr.(*ports.ProviderError); ok && pe.IsUnknownOutcome() {
			lookupAt := now.Add(payments.DefaultLookupDelay)
			op := "CREATE"
			updated, uerr := s.Store.ForceUpdatePaymentIntent(ctx, intentID, payments.StatusUnknownOutcome, PaymentIntentPatch{
				UnknownOperation:  &op,
				LookupScheduledAt: &lookupAt,
			}, s.now())
			if uerr == nil {
				pi = updated
			} else {
				pi.Status = payments.StatusUnknownOutcome
			}
			payload, _ := json.Marshal(map[string]any{"paymentIntentId": intentID, "operation": "CREATE"})
			_ = s.Store.InsertOutbox(ctx, s.IDs.New(), "payment_intent.lookup", payload, strPtr("lookup:"+intentID), &mode, lookupAt)
			return CreatePaymentResult{Intent: pi, FeeIDR: feeRes.TotalFeeIDR, MerchantNetIDR: feeRes.NetIDR}, nil
		}
		_, _ = s.Store.ForceUpdatePaymentIntent(ctx, intentID, payments.StatusFailed, PaymentIntentPatch{}, s.now())
		_ = s.Store.UpdateOrderStatus(ctx, orderID, orders.PaymentFailed, payments.OrderFailed, s.now())
		return CreatePaymentResult{}, apperr.New(apperr.KindUnavailable, apperr.CodeInternalError, "Payment provider rejected create")
	}

	ref2 := created.ProviderReference
	qr := created.QRString
	img := created.QRImageURL
	updated, uerr := s.Store.UpdatePaymentIntentStatus(ctx, intentID, payments.StatusRequiresPayment, payments.StatusPending, PaymentIntentPatch{
		ProviderReference: &ref2,
		QRString:          &qr,
		QRImageURL:        &img,
	}, s.now())
	if uerr != nil {
		updated, uerr = s.Store.ForceUpdatePaymentIntent(ctx, intentID, payments.StatusPending, PaymentIntentPatch{
			ProviderReference: &ref2,
			QRString:          &qr,
			QRImageURL:        &img,
		}, s.now())
		if uerr != nil {
			return CreatePaymentResult{}, apperr.Internal(apperr.CodeInternalError, "Failed to activate payment intent")
		}
	}
	pi = updated

	respBody, _ := json.Marshal(map[string]any{
		"paymentIntentId": intentID,
		"status":          pi.Status,
		"amount":          pi.AmountIDR,
	})
	if rec, gerr := s.Store.GetIdempotency(ctx, "gateway", req.Auth.MerchantID, "gateway.create_payment", &mode, keyHash); gerr == nil {
		rt, rid := "payment_intent", intentID
		_, _ = s.Store.CompleteIdempotency(ctx, rec.ID, "COMPLETED", &rt, &rid, 201, respBody)
	}
	expPayload, _ := json.Marshal(map[string]any{"paymentIntentId": intentID})
	_ = s.Store.InsertOutbox(ctx, s.IDs.New(), "payment_intent.expire", expPayload, strPtr("expire:"+intentID), &mode, expiresAt)

	// BE-360: QRIS_API never invents storefront traffic dimensions.
	if s.Analytics != nil {
		_, _ = s.Analytics.EnsureQRISNoAttribution(ctx, analytics.CaptureInput{
			StoreID:         pi.StoreID,
			MerchantID:      pi.MerchantID,
			OrderID:         pi.OrderID,
			PaymentIntentID: pi.ID,
			Source:          analytics.SourceQRISAPI,
			GrossIDR:        pi.AmountIDR,
			OccurredAt:      s.now(),
		})
	}

	return CreatePaymentResult{Intent: pi, FeeIDR: feeRes.TotalFeeIDR, MerchantNetIDR: feeRes.NetIDR}, nil
}

// GetPayment returns intent for authenticated merchant (same mode).
func (s *GatewayService) GetPayment(ctx context.Context, auth gateway.AuthContext, intentID string) (payments.Intent, error) {
	if auth.MerchantID == "" {
		return payments.Intent{}, gateway.ErrAuthRequired
	}
	if intentID == "" {
		return payments.Intent{}, gateway.ErrNotFound
	}
	pi, err := s.Store.GetPaymentIntentByID(ctx, intentID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return payments.Intent{}, gateway.ErrNotFound
		}
		return payments.Intent{}, apperr.Internal(apperr.CodeInternalError, "Payment intent lookup failed")
	}
	if pi.MerchantID != auth.MerchantID || pi.PaymentMode != auth.PaymentMode || pi.Source != payments.SourceQRISAPI {
		return payments.Intent{}, gateway.ErrNotFound
	}
	return pi, nil
}

// CancelPayment requests async cancel; 202 while pending; PAID wins financially (BE-330).
func (s *GatewayService) CancelPayment(ctx context.Context, auth gateway.AuthContext, intentID, reason, idemKey string) (payments.Intent, int, error) {
	if auth.MerchantID == "" {
		return payments.Intent{}, 0, gateway.ErrAuthRequired
	}
	pi, err := s.GetPayment(ctx, auth, intentID)
	if err != nil {
		return payments.Intent{}, 0, err
	}
	if pi.Status == payments.StatusCancelled || pi.Status == payments.StatusExpired ||
		pi.Status == payments.StatusFailed || pi.Status == payments.StatusPaid {
		return pi, 200, nil
	}
	if pi.Status == payments.StatusCancelPending || pi.Status == payments.StatusUnknownOutcome {
		return pi, 202, nil
	}
	if !pi.CanRequestCancel() {
		return pi, 0, gateway.ErrCheckoutClosed
	}

	now := s.now()
	if reason == "" {
		reason = "merchant_cancel"
	}
	cancelAt := now
	updated, err := s.Store.UpdatePaymentIntentStatus(ctx, pi.ID, pi.Status, payments.StatusCancelPending, PaymentIntentPatch{
		CancelRequestedAt: &cancelAt,
		CancelReason:      &reason,
	}, now)
	if err != nil {
		pi2, gerr := s.Store.GetPaymentIntentByID(ctx, pi.ID)
		if gerr == nil {
			return pi2, 202, nil
		}
		return payments.Intent{}, 0, apperr.Internal(apperr.CodeInternalError, "Failed to request cancel")
	}
	pi = updated

	evPayload, _ := json.Marshal(map[string]any{"paymentIntentId": pi.ID, "status": pi.Status})
	_ = s.Store.InsertEvent(ctx, gateway.PaymentEvent{
		ID:              "gwev_" + s.IDs.New(),
		MerchantID:      auth.MerchantID,
		PaymentMode:     auth.PaymentMode,
		PaymentIntentID: pi.ID,
		EventType:       gateway.EventPaymentCancelRequested,
		Payload:         evPayload,
		CreatedAt:       now,
	})

	if pi.ProviderReference == nil || *pi.ProviderReference == "" {
		lookupAt := now.Add(payments.DefaultLookupDelay)
		op := "CANCEL"
		fin, _ := s.Store.ForceUpdatePaymentIntent(ctx, pi.ID, payments.StatusUnknownOutcome, PaymentIntentPatch{
			UnknownOperation:  &op,
			LookupScheduledAt: &lookupAt,
		}, now)
		if fin.ID != "" {
			pi = fin
		}
		return pi, 202, nil
	}
	if s.QRIS == nil {
		return pi, 202, nil
	}
	prov, perr := s.QRIS.CancelPayment(ctx, *pi.ProviderReference)
	if perr != nil {
		if pe, ok := perr.(*ports.ProviderError); ok && pe.IsUnknownOutcome() {
			lookupAt := now.Add(payments.DefaultLookupDelay)
			op := "CANCEL"
			fin, _ := s.Store.ForceUpdatePaymentIntent(ctx, pi.ID, payments.StatusUnknownOutcome, PaymentIntentPatch{
				UnknownOperation:  &op,
				LookupScheduledAt: &lookupAt,
			}, now)
			if fin.ID != "" {
				pi = fin
			}
			return pi, 202, nil
		}
		return pi, 202, nil
	}
	mapped := payments.MapProviderStatus(prov.Status)
	switch mapped {
	case payments.StatusCancelled:
		fin, _ := s.Store.ForceUpdatePaymentIntent(ctx, pi.ID, payments.StatusCancelled, PaymentIntentPatch{}, now)
		if fin.ID != "" {
			pi = fin
		}
		_ = s.Store.UpdateOrderStatus(ctx, pi.OrderID, orders.PaymentCancelled, payments.OrderCancelled, now)
		_ = s.Store.InsertEvent(ctx, gateway.PaymentEvent{
			ID:              "gwev_" + s.IDs.New(),
			MerchantID:      auth.MerchantID,
			PaymentMode:     auth.PaymentMode,
			PaymentIntentID: pi.ID,
			EventType:       gateway.EventPaymentCancelled,
			Payload:         evPayload,
			CreatedAt:       now,
		})
		return pi, 200, nil
	case payments.StatusPaid:
		// Verified paid wins — do not cancel financially.
		fin, _ := s.Store.ForceUpdatePaymentIntent(ctx, pi.ID, payments.StatusPaid, PaymentIntentPatch{}, now)
		if fin.ID != "" {
			pi = fin
		}
		return pi, 200, nil
	default:
		return pi, 202, nil
	}
}

// GetEvent returns a merchant-owned gateway event.
func (s *GatewayService) GetEvent(ctx context.Context, auth gateway.AuthContext, eventID string) (gateway.PaymentEvent, error) {
	if auth.MerchantID == "" {
		return gateway.PaymentEvent{}, gateway.ErrAuthRequired
	}
	ev, err := s.Store.GetEventByID(ctx, eventID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return gateway.PaymentEvent{}, gateway.ErrEventNotFound
		}
		return gateway.PaymentEvent{}, apperr.Internal(apperr.CodeInternalError, "Event lookup failed")
	}
	if ev.MerchantID != auth.MerchantID || ev.PaymentMode != auth.PaymentMode {
		return gateway.PaymentEvent{}, gateway.ErrEventNotFound
	}
	return ev, nil
}

// ListEvents lists events for a payment intent.
func (s *GatewayService) ListEvents(ctx context.Context, auth gateway.AuthContext, intentID string) ([]gateway.PaymentEvent, error) {
	if _, err := s.GetPayment(ctx, auth, intentID); err != nil {
		return nil, err
	}
	return s.Store.ListEventsByIntent(ctx, intentID, auth.MerchantID, 50)
}

func feeFromSnap(pi payments.Intent) int64 {
	var m map[string]any
	if json.Unmarshal(pi.PriceSnapshot, &m) == nil {
		if v, ok := m["feeIdr"].(float64); ok {
			return int64(v)
		}
	}
	return 0
}

func netFromSnap(pi payments.Intent) int64 {
	var m map[string]any
	if json.Unmarshal(pi.PriceSnapshot, &m) == nil {
		if v, ok := m["merchantNetIdr"].(float64); ok {
			return int64(v)
		}
	}
	return 0
}
