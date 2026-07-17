package application

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/credentials"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/gateway"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/webhooks"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
	"github.com/dasepmoch/fersaku-new/backend/internal/platform/ssrf"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
	"github.com/dasepmoch/fersaku-new/backend/internal/security"
)

// WebhookService owns outbound seller-webhook endpoints and delivery (BE-420).
// API-key lifecycle remains independent (CredentialService).
type WebhookService struct {
	Store WebhookStore
	// Auth optional for MFA on secret claim.
	Auth *AuthService
	IDs  ports.IDGenerator
	Clock ports.Clock
	Log  ports.Logger
	// EncryptionKey for envelope-encrypting signing secrets.
	EncryptionKey string
	// ClaimHashSecret for one-time secret claim tokens.
	ClaimHashSecret string
	// HTTPClient optional; defaults to ssrf.SafeHTTPClient.
	HTTPClient *http.Client
	// SkipDNS when true skips DNS at registration (unit tests with private IP still rejected via ValidateHTTPSURL).
	// Production must leave false so ResolveAndValidate runs.
	SkipDNS bool
}

func (s *WebhookService) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now().UTC()
	}
	return time.Now().UTC()
}

func (s *WebhookService) newID(prefix string) string {
	id := s.IDs.New()
	if !strings.HasPrefix(id, prefix) {
		id = prefix + id
	}
	return id
}

func (s *WebhookService) hashClaim(raw string) string {
	return auth.HashTokenKeyed(raw, s.ClaimHashSecret)
}

func (s *WebhookService) fingerprintSecret(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:8])
}

func (s *WebhookService) client() *http.Client {
	if s.HTTPClient != nil {
		return s.HTTPClient
	}
	return ssrf.SafeHTTPClient(webhooks.DeliveryTimeout)
}

// ResolveMerchantFromStore resolves store → merchant with ownership.
func (s *WebhookService) ResolveMerchantFromStore(ctx context.Context, userID, storeID string) (string, error) {
	if userID == "" {
		return "", apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required")
	}
	mid, st, err := s.Store.GetStoreMerchant(ctx, storeID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return "", apperr.NotFound(apperr.CodeResourceNotFound, "Store not found")
		}
		return "", apperr.Internal(apperr.CodeInternalError, "Store lookup failed")
	}
	if strings.EqualFold(st, "SUSPENDED") || strings.EqualFold(st, "CLOSED") || strings.EqualFold(st, "ARCHIVED") {
		return "", apperr.NotFound(apperr.CodeResourceNotFound, "Store not found")
	}
	if _, err := s.Store.MerchantMemberActive(ctx, mid, userID); err != nil {
		if s.Store.IsNotFound(err) {
			return "", apperr.NotFound(apperr.CodeResourceNotFound, "Store not found")
		}
		return "", apperr.Internal(apperr.CodeInternalError, "Membership lookup failed")
	}
	return mid, nil
}

// ValidateEndpointURL runs HTTPS + SSRF/private-network checks.
func (s *WebhookService) ValidateEndpointURL(ctx context.Context, raw string) (host string, err error) {
	u, err := ssrf.ValidateHTTPSURL(raw)
	if err != nil {
		if ssrf.IsPrivate(err) {
			return "", webhooks.ErrPrivateNetwork
		}
		return "", webhooks.ErrURLRejected
	}
	if !s.SkipDNS {
		_, _, err = ssrf.ResolveAndValidate(ctx, raw)
		if err != nil {
			if ssrf.IsPrivate(err) {
				return "", webhooks.ErrPrivateNetwork
			}
			// DNS failure at registration: reject (fail closed).
			return "", webhooks.ErrURLRejected
		}
	}
	return u.Hostname(), nil
}

// CreateEndpointInput registers a new endpoint (pending secret claim).
type CreateEndpointInput struct {
	UserID      string
	StoreID     string
	PaymentMode string
	URL         string
	Allowlist   []string
}

// CreateEndpointResult includes one-time claim token (no-store).
type CreateEndpointResult struct {
	Endpoint       webhooks.Endpoint
	ClaimToken     string
	ClaimExpiresAt time.Time
	SecretVersion  int32
}

// CreateEndpoint validates SSRF, inserts endpoint + pending secret version + claim.
func (s *WebhookService) CreateEndpoint(ctx context.Context, in CreateEndpointInput) (CreateEndpointResult, error) {
	mid, err := s.ResolveMerchantFromStore(ctx, in.UserID, in.StoreID)
	if err != nil {
		return CreateEndpointResult{}, err
	}
	mode := strings.ToUpper(strings.TrimSpace(in.PaymentMode))
	if mode != gateway.ModeSandbox && mode != gateway.ModeLive {
		return CreateEndpointResult{}, webhooks.ErrModeInvalid
	}
	host, err := s.ValidateEndpointURL(ctx, in.URL)
	if err != nil {
		return CreateEndpointResult{}, err
	}
	allow := in.Allowlist
	if len(allow) == 0 {
		allow = []string{webhooks.EventPaymentPaid, webhooks.EventTest}
	}
	now := s.now()
	epID := s.newID("whep_")
	storeID := in.StoreID

	// Generate signing secret (server retains encrypted; seller claims once).
	rawSecret, err := auth.GenerateToken(32)
	if err != nil {
		return CreateEndpointResult{}, apperr.Internal(apperr.CodeInternalError, "Secret generation failed")
	}
	rawSecret = "whsec_" + rawSecret
	keyVer, cipher, err := security.EncryptString(s.EncryptionKey, rawSecret)
	if err != nil {
		return CreateEndpointResult{}, apperr.Internal(apperr.CodeInternalError, "Secret encryption failed")
	}
	claimTok, err := auth.GenerateToken(credentials.ClaimTokenBytes)
	if err != nil {
		return CreateEndpointResult{}, apperr.Internal(apperr.CodeInternalError, "Claim generation failed")
	}
	claimExp := now.Add(credentials.ClaimTTL)
	var ver int32 = 1
	svID := s.newID("whes_")
	claimID := s.newID("scl_")

	ep := webhooks.Endpoint{
		ID:                   epID,
		MerchantID:           mid,
		StoreID:              &storeID,
		PaymentMode:          mode,
		URL:                  strings.TrimSpace(in.URL),
		URLHost:              host,
		Status:               webhooks.StatusPendingSecretClaim,
		ConfigVersion:        1,
		EventAllowlist:       allow,
		CurrentSecretVersion: &ver,
		FailureCount:         0,
		CreatedAt:            now,
		UpdatedAt:            now,
	}
	sv := webhooks.SecretVersion{
		ID:               svID,
		EndpointID:       epID,
		MerchantID:       mid,
		Version:          ver,
		Status:           webhooks.SecretPendingClaim,
		SecretCiphertext: cipher,
		SecretKeyVersion: keyVer,
		Fingerprint:      s.fingerprintSecret(rawSecret),
		CreatedAt:        now,
		UpdatedAt:        now,
	}
	sc := credentials.SecretClaim{
		ID:              claimID,
		Kind:            credentials.ClaimKindWebhookEndpointSecret,
		ResourceType:    "webhook_endpoint",
		ResourceID:      epID,
		ResourceVersion: ver,
		MerchantID:      mid,
		RecipientUserID: in.UserID,
		ClaimTokenHash:  s.hashClaim(claimTok),
		Status:          credentials.ClaimStatusActive,
		Attempts:        0,
		MaxAttempts:     credentials.MaxClaimAttempts,
		ExpiresAt:       claimExp,
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	err = s.Store.WithTx(ctx, func(ctx context.Context) error {
		if err := s.Store.InsertEndpoint(ctx, ep); err != nil {
			if s.Store.IsUniqueViolation(err) {
				return webhooks.ErrActiveExists
			}
			return err
		}
		if err := s.Store.InsertSecretVersion(ctx, sv); err != nil {
			return err
		}
		return s.Store.InsertSecretClaim(ctx, sc)
	})
	if err != nil {
		return CreateEndpointResult{}, err
	}
	return CreateEndpointResult{
		Endpoint:       ep,
		ClaimToken:     claimTok,
		ClaimExpiresAt: claimExp,
		SecretVersion:  ver,
	}, nil
}

// UpdateEndpointInput patches URL/allowlist/status (disable).
type UpdateEndpointInput struct {
	UserID     string
	StoreID    string
	EndpointID string
	URL        *string
	Allowlist  []string
	Disable    bool
	Reason     string
}

// UpdateEndpoint revalidates SSRF when URL changes.
func (s *WebhookService) UpdateEndpoint(ctx context.Context, in UpdateEndpointInput) (webhooks.Endpoint, error) {
	mid, err := s.ResolveMerchantFromStore(ctx, in.UserID, in.StoreID)
	if err != nil {
		return webhooks.Endpoint{}, err
	}
	ep, err := s.Store.GetEndpoint(ctx, in.EndpointID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return webhooks.Endpoint{}, webhooks.ErrEndpointNotFound
		}
		return webhooks.Endpoint{}, apperr.Internal(apperr.CodeInternalError, "Endpoint lookup failed")
	}
	if ep.MerchantID != mid {
		return webhooks.Endpoint{}, webhooks.ErrEndpointNotFound
	}
	now := s.now()
	if in.URL != nil {
		host, err := s.ValidateEndpointURL(ctx, *in.URL)
		if err != nil {
			return webhooks.Endpoint{}, err
		}
		ep.URL = strings.TrimSpace(*in.URL)
		ep.URLHost = host
		ep.ConfigVersion++
	}
	if in.Allowlist != nil {
		ep.EventAllowlist = in.Allowlist
		ep.ConfigVersion++
	}
	if in.Disable {
		ep.Status = webhooks.StatusSuspended
		ep.DisabledAt = &now
		ep.DisabledReason = strings.TrimSpace(in.Reason)
	}
	ep.UpdatedAt = now
	if err := s.Store.UpdateEndpoint(ctx, ep); err != nil {
		return webhooks.Endpoint{}, apperr.Internal(apperr.CodeInternalError, "Endpoint update failed")
	}
	return ep, nil
}

// ListEndpoints for seller store.
func (s *WebhookService) ListEndpoints(ctx context.Context, userID, storeID string) ([]webhooks.Endpoint, error) {
	mid, err := s.ResolveMerchantFromStore(ctx, userID, storeID)
	if err != nil {
		return nil, err
	}
	return s.Store.ListEndpointsByMerchant(ctx, mid, 50)
}

// ClaimSecretExchange activates pending secret after one-time claim (no raw after).
type ClaimSecretInput struct {
	UserID     string
	StoreID    string
	EndpointID string
	Token      string
}

// ClaimSecretResult returns raw secret once.
type ClaimSecretResult struct {
	RawSecret   string
	Fingerprint string
	Version     int32
	Endpoint    webhooks.Endpoint
}

// ClaimSecretExchange consumes claim and activates secret version → ACTIVE endpoint.
func (s *WebhookService) ClaimSecretExchange(ctx context.Context, in ClaimSecretInput) (ClaimSecretResult, error) {
	mid, err := s.ResolveMerchantFromStore(ctx, in.UserID, in.StoreID)
	if err != nil {
		return ClaimSecretResult{}, err
	}
	raw := strings.TrimSpace(in.Token)
	if raw == "" {
		return ClaimSecretResult{}, webhooks.ErrClaimInvalid
	}
	now := s.now()
	hash := s.hashClaim(raw)
	var result ClaimSecretResult

	err = s.Store.WithTx(ctx, func(ctx context.Context) error {
		sc, err := s.Store.GetSecretClaimByHash(ctx, hash)
		if err != nil {
			if s.Store.IsNotFound(err) {
				return webhooks.ErrClaimInvalid
			}
			return err
		}
		if sc.Kind != credentials.ClaimKindWebhookEndpointSecret {
			return webhooks.ErrClaimInvalid
		}
		if sc.RecipientUserID != in.UserID || sc.MerchantID != mid {
			return webhooks.ErrClaimInvalid
		}
		if sc.ResourceID != in.EndpointID {
			return webhooks.ErrClaimInvalid
		}
		if sc.Status == credentials.ClaimStatusConsumed {
			return webhooks.ErrClaimConsumed
		}
		if sc.Status != credentials.ClaimStatusActive || !sc.ExpiresAt.After(now) {
			return webhooks.ErrClaimInvalid
		}
		ep, err := s.Store.GetEndpoint(ctx, in.EndpointID)
		if err != nil {
			return webhooks.ErrEndpointNotFound
		}
		if ep.MerchantID != mid {
			return webhooks.ErrEndpointNotFound
		}
		sv, err := s.Store.GetSecretVersion(ctx, ep.ID, sc.ResourceVersion)
		if err != nil {
			return webhooks.ErrClaimInvalid
		}
		if sv.Status != webhooks.SecretPendingClaim && sv.Status != webhooks.SecretActive {
			return webhooks.ErrClaimInvalid
		}
		plain, err := security.DecryptString(s.EncryptionKey, sv.SecretCiphertext)
		if err != nil {
			return apperr.Internal(apperr.CodeInternalError, "Secret decrypt failed")
		}
		// Activate secret.
		act := now
		sv.Status = webhooks.SecretActive
		sv.ActivatedAt = &act
		sv.UpdatedAt = now
		if err := s.Store.UpdateSecretVersion(ctx, sv); err != nil {
			return err
		}
		ep.Status = webhooks.StatusActive
		ver := sv.Version
		ep.CurrentSecretVersion = &ver
		ep.UpdatedAt = now
		if err := s.Store.UpdateEndpoint(ctx, ep); err != nil {
			return err
		}
		if err := s.Store.ConsumeSecretClaim(ctx, sc.ID, now); err != nil {
			return err
		}
		result = ClaimSecretResult{
			RawSecret:   plain,
			Fingerprint: sv.Fingerprint,
			Version:     sv.Version,
			Endpoint:    ep,
		}
		return nil
	})
	if err != nil {
		return ClaimSecretResult{}, err
	}
	return result, nil
}

// RequestSecretRotation creates a new pending secret version + claim (API key unchanged).
func (s *WebhookService) RequestSecretRotation(ctx context.Context, userID, storeID, endpointID string) (CreateEndpointResult, error) {
	mid, err := s.ResolveMerchantFromStore(ctx, userID, storeID)
	if err != nil {
		return CreateEndpointResult{}, err
	}
	ep, err := s.Store.GetEndpoint(ctx, endpointID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return CreateEndpointResult{}, webhooks.ErrEndpointNotFound
		}
		return CreateEndpointResult{}, err
	}
	if ep.MerchantID != mid {
		return CreateEndpointResult{}, webhooks.ErrEndpointNotFound
	}
	now := s.now()
	var nextVer int32 = 1
	if ep.CurrentSecretVersion != nil {
		nextVer = *ep.CurrentSecretVersion + 1
	}
	rawSecret, err := auth.GenerateToken(32)
	if err != nil {
		return CreateEndpointResult{}, apperr.Internal(apperr.CodeInternalError, "Secret generation failed")
	}
	rawSecret = "whsec_" + rawSecret
	keyVer, cipher, err := security.EncryptString(s.EncryptionKey, rawSecret)
	if err != nil {
		return CreateEndpointResult{}, apperr.Internal(apperr.CodeInternalError, "Secret encryption failed")
	}
	claimTok, err := auth.GenerateToken(credentials.ClaimTokenBytes)
	if err != nil {
		return CreateEndpointResult{}, apperr.Internal(apperr.CodeInternalError, "Claim generation failed")
	}
	claimExp := now.Add(credentials.ClaimTTL)
	svID := s.newID("whes_")
	claimID := s.newID("scl_")
	sv := webhooks.SecretVersion{
		ID:               svID,
		EndpointID:       ep.ID,
		MerchantID:       mid,
		Version:          nextVer,
		Status:           webhooks.SecretPendingClaim,
		SecretCiphertext: cipher,
		SecretKeyVersion: keyVer,
		Fingerprint:      s.fingerprintSecret(rawSecret),
		CreatedAt:        now,
		UpdatedAt:        now,
	}
	sc := credentials.SecretClaim{
		ID:              claimID,
		Kind:            credentials.ClaimKindWebhookEndpointSecret,
		ResourceType:    "webhook_endpoint",
		ResourceID:      ep.ID,
		ResourceVersion: nextVer,
		MerchantID:      mid,
		RecipientUserID: userID,
		ClaimTokenHash:  s.hashClaim(claimTok),
		Status:          credentials.ClaimStatusActive,
		MaxAttempts:     credentials.MaxClaimAttempts,
		ExpiresAt:       claimExp,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	// Supersede previous active with overlap.
	err = s.Store.WithTx(ctx, func(ctx context.Context) error {
		_ = s.Store.RevokeActiveSecretClaimsForResource(ctx, credentials.ClaimKindWebhookEndpointSecret, "webhook_endpoint", ep.ID, now)
		if active, aerr := s.Store.GetActiveSecret(ctx, ep.ID); aerr == nil {
			sup := now
			overlap := now.Add(webhooks.SecretOverlapTTL)
			active.Status = webhooks.SecretPrevious
			active.SupersededAt = &sup
			active.OverlapExpiresAt = &overlap
			active.UpdatedAt = now
			if err := s.Store.UpdateSecretVersion(ctx, active); err != nil {
				return err
			}
			prev := active.Version
			ep.PreviousSecretVersion = &prev
			ep.SecretOverlapExpiresAt = &overlap
		}
		if err := s.Store.InsertSecretVersion(ctx, sv); err != nil {
			return err
		}
		// Activate new immediately as ACTIVE secret (claim reveals raw; endpoint stays ACTIVE).
		act := now
		sv.Status = webhooks.SecretActive
		sv.ActivatedAt = &act
		if err := s.Store.UpdateSecretVersion(ctx, sv); err != nil {
			return err
		}
		ep.CurrentSecretVersion = &nextVer
		ep.ConfigVersion++
		ep.UpdatedAt = now
		if err := s.Store.UpdateEndpoint(ctx, ep); err != nil {
			return err
		}
		// For rotation, store claim against PENDING then activate on claim —
		// simpler launch: claim reveals already-active secret once.
		sv.Status = webhooks.SecretActive
		return s.Store.InsertSecretClaim(ctx, sc)
	})
	if err != nil {
		return CreateEndpointResult{}, err
	}
	return CreateEndpointResult{
		Endpoint:       ep,
		ClaimToken:     claimTok,
		ClaimExpiresAt: claimExp,
		SecretVersion:  nextVer,
	}, nil
}

// EnqueuePaymentPaid creates a delivery + outbox when endpoint is set on intent.
func (s *WebhookService) EnqueuePaymentPaid(ctx context.Context, pi paymentsIntentLite) error {
	if s == nil || s.Store == nil {
		return nil
	}
	if pi.WebhookEndpointID == nil || *pi.WebhookEndpointID == "" {
		return nil
	}
	ep, err := s.Store.GetEndpoint(ctx, *pi.WebhookEndpointID)
	if err != nil {
		if s.Log != nil {
			s.Log.Warn("webhook enqueue: endpoint missing", "endpoint_id", *pi.WebhookEndpointID)
		}
		return nil
	}
	if ep.Status != webhooks.StatusActive {
		return nil
	}
	if ep.MerchantID != pi.MerchantID || ep.PaymentMode != pi.PaymentMode {
		return nil
	}
	if !webhooks.AllowlistContains(ep.EventAllowlist, webhooks.EventPaymentPaid) {
		return nil
	}
	eventID := webhooks.StablePaymentPaidEventID(pi.ID)
	// Idempotent: existing delivery for endpoint+event.
	if existing, err := s.Store.GetDeliveryByEndpointEvent(ctx, ep.ID, eventID); err == nil && existing.ID != "" {
		return nil
	}
	body, _ := json.Marshal(map[string]any{
		"id":              eventID,
		"type":            webhooks.EventPaymentPaid,
		"payloadVersion":  webhooks.PayloadVersionV1,
		"createdAt":       s.now().UTC().Format(time.RFC3339),
		"test":            false,
		"data": map[string]any{
			"paymentIntentId": pi.ID,
			"orderId":         pi.OrderID,
			"merchantId":      pi.MerchantID,
			"storeId":         pi.StoreID,
			"amountIdr":       pi.AmountIDR,
			"currency":        "IDR",
			"paymentMode":     pi.PaymentMode,
			"status":          "PAID",
		},
	})
	return s.enqueueDelivery(ctx, enqueueInput{
		Endpoint:        ep,
		EventID:         eventID,
		EventType:       webhooks.EventPaymentPaid,
		Body:            body,
		SourceKind:      webhooks.SourcePayment,
		PaymentIntentID: &pi.ID,
		OrderID:         strPtr(pi.OrderID),
		IsTest:          false,
	})
}

// paymentsIntentLite is a narrow view to avoid circular imports with payments package details.
type paymentsIntentLite struct {
	ID                string
	MerchantID        string
	StoreID           string
	OrderID           string
	PaymentMode       string
	AmountIDR         int64
	WebhookEndpointID *string
}

// EnqueuePaymentPaidFromIntent adapts domain payments.Intent fields.
func (s *WebhookService) EnqueuePaymentPaidFromIntent(ctx context.Context, id, merchantID, storeID, orderID, mode string, amount int64, webhookEndpointID *string) error {
	return s.EnqueuePaymentPaid(ctx, paymentsIntentLite{
		ID:                id,
		MerchantID:        merchantID,
		StoreID:           storeID,
		OrderID:           orderID,
		PaymentMode:       mode,
		AmountIDR:         amount,
		WebhookEndpointID: webhookEndpointID,
	})
}

type enqueueInput struct {
	Endpoint        webhooks.Endpoint
	EventID         string
	EventType       string
	Body            []byte
	SourceKind      string
	PaymentIntentID *string
	OrderID         *string
	IsTest          bool
}

func (s *WebhookService) enqueueDelivery(ctx context.Context, in enqueueInput) error {
	now := s.now()
	dID := s.newID("whd_")
	d := webhooks.Delivery{
		ID:              dID,
		EndpointID:      in.Endpoint.ID,
		MerchantID:      in.Endpoint.MerchantID,
		StoreID:         in.Endpoint.StoreID,
		PaymentMode:     in.Endpoint.PaymentMode,
		EventID:         in.EventID,
		EventType:       in.EventType,
		PayloadVersion:  webhooks.PayloadVersionV1,
		PayloadBody:     in.Body,
		PayloadHash:     webhooks.PayloadHash(in.Body),
		SourceKind:      in.SourceKind,
		PaymentIntentID: in.PaymentIntentID,
		OrderID:         in.OrderID,
		IsTest:          in.IsTest,
		Status:          webhooks.DeliveryQueued,
		AttemptCount:    0,
		MaxAttempts:     webhooks.DefaultMaxAttempts,
		NextRetryAt:     &now,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	payload, _ := json.Marshal(webhooks.OutboxDeliverPayload{
		DeliveryID: dID,
		EndpointID: in.Endpoint.ID,
		EventID:    in.EventID,
		Version:    1,
	})
	dk := "seller_webhook.deliver:" + in.Endpoint.ID + ":" + in.EventID
	mode := in.Endpoint.PaymentMode
	return s.Store.WithTx(ctx, func(ctx context.Context) error {
		if err := s.Store.InsertDelivery(ctx, d); err != nil {
			if s.Store.IsUniqueViolation(err) {
				return nil
			}
			return err
		}
		return s.Store.InsertOutbox(ctx, s.newID("obx_"), webhooks.TopicDeliver, payload, &dk, &mode, now)
	})
}

// SendTestEvent enqueues a namespaced test delivery (no ledger/fulfillment).
func (s *WebhookService) SendTestEvent(ctx context.Context, userID, storeID, endpointID string) (webhooks.Delivery, error) {
	mid, err := s.ResolveMerchantFromStore(ctx, userID, storeID)
	if err != nil {
		return webhooks.Delivery{}, err
	}
	ep, err := s.Store.GetEndpoint(ctx, endpointID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return webhooks.Delivery{}, webhooks.ErrEndpointNotFound
		}
		return webhooks.Delivery{}, err
	}
	if ep.MerchantID != mid {
		return webhooks.Delivery{}, webhooks.ErrEndpointNotFound
	}
	if ep.Status != webhooks.StatusActive {
		return webhooks.Delivery{}, webhooks.ErrEndpointUnavailable
	}
	nonce := s.newID("tst_")
	eventID := webhooks.StableTestEventID(ep.ID, nonce)
	body, _ := json.Marshal(map[string]any{
		"id":             eventID,
		"type":           webhooks.EventTest,
		"payloadVersion": webhooks.PayloadVersionV1,
		"createdAt":      s.now().UTC().Format(time.RFC3339),
		"test":           true,
		"data": map[string]any{
			"endpointId":  ep.ID,
			"merchantId":  ep.MerchantID,
			"paymentMode": ep.PaymentMode,
		},
	})
	if err := s.enqueueDelivery(ctx, enqueueInput{
		Endpoint:   ep,
		EventID:    eventID,
		EventType:  webhooks.EventTest,
		Body:       body,
		SourceKind: webhooks.SourceTest,
		IsTest:     true,
	}); err != nil {
		return webhooks.Delivery{}, err
	}
	d, err := s.Store.GetDeliveryByEndpointEvent(ctx, ep.ID, eventID)
	if err != nil {
		return webhooks.Delivery{}, err
	}
	return d, nil
}

// ListSellerDeliveries lists outbound history for merchant.
func (s *WebhookService) ListSellerDeliveries(ctx context.Context, userID, storeID string, limit int32) ([]webhooks.Delivery, error) {
	mid, err := s.ResolveMerchantFromStore(ctx, userID, storeID)
	if err != nil {
		return nil, err
	}
	if limit <= 0 {
		limit = 50
	}
	return s.Store.ListDeliveriesByMerchant(ctx, mid, nil, limit)
}

// ListAdminDeliveries outbound-only projection.
func (s *WebhookService) ListAdminDeliveries(ctx context.Context, status, merchantID string, limit int32) ([]webhooks.AdminDeliveryView, error) {
	if limit <= 0 {
		limit = 50
	}
	var st, mid *string
	if status != "" {
		st = &status
	}
	if merchantID != "" {
		mid = &merchantID
	}
	return s.Store.ListAdminDeliveries(ctx, st, mid, limit)
}

// GetAdminDelivery rejects inbound provider callback IDs (wrong namespace).
func (s *WebhookService) GetAdminDelivery(ctx context.Context, deliveryID string) (webhooks.Delivery, error) {
	// Reject obvious provider/callback ID shapes without enumeration.
	if looksLikeProviderCallbackID(deliveryID) {
		return webhooks.Delivery{}, webhooks.ErrWrongNamespace
	}
	d, err := s.Store.GetDelivery(ctx, deliveryID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return webhooks.Delivery{}, webhooks.ErrDeliveryNotFound
		}
		return webhooks.Delivery{}, err
	}
	return d, nil
}

func looksLikeProviderCallbackID(id string) bool {
	id = strings.TrimSpace(id)
	// Outbound deliveries use whd_ prefix; provider events use other prefixes or raw ULIDs without whd_.
	if strings.HasPrefix(id, "whd_") {
		return false
	}
	// Common inbound prefixes / provider event id patterns used in admin UI mistakes.
	if strings.HasPrefix(id, "ppe_") || strings.HasPrefix(id, "pcb_") ||
		strings.HasPrefix(id, "xendit_") || strings.HasPrefix(id, "provider_") {
		return true
	}
	// If it exists as delivery it's fine; Get will 404. Heuristic only for known wrong prefixes.
	return false
}

// AdminRetry re-queues an outbound delivery (never replays Xendit).
func (s *WebhookService) AdminRetry(ctx context.Context, deliveryID, actorUserID, reason string) (webhooks.Delivery, error) {
	if looksLikeProviderCallbackID(deliveryID) {
		return webhooks.Delivery{}, webhooks.ErrWrongNamespace
	}
	d, err := s.Store.GetDelivery(ctx, deliveryID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return webhooks.Delivery{}, webhooks.ErrDeliveryNotFound
		}
		return webhooks.Delivery{}, err
	}
	if d.Status == webhooks.DeliveryDelivered {
		return d, nil
	}
	now := s.now()
	d.Status = webhooks.DeliveryQueued
	d.NextRetryAt = &now
	d.DeadLetterReason = nil
	d.UpdatedAt = now
	// Keep event_id + payload_body immutable (signature semantics preserved).
	if err := s.Store.UpdateDelivery(ctx, d); err != nil {
		return webhooks.Delivery{}, err
	}
	_ = s.Store.ResolveDeadLetter(ctx, d.ID, actorUserID, reason, now)
	payload, _ := json.Marshal(webhooks.OutboxDeliverPayload{
		DeliveryID: d.ID,
		EndpointID: d.EndpointID,
		EventID:    d.EventID,
		Version:    1,
	})
	// Unique dedupe per admin retry wave.
	dk := fmt.Sprintf("seller_webhook.deliver:retry:%s:%d", d.ID, now.UnixNano())
	mode := d.PaymentMode
	_ = s.Store.InsertOutbox(ctx, s.newID("obx_"), webhooks.TopicDeliver, payload, &dk, &mode, now)
	return d, nil
}

// ProcessDelivery performs one outbound HTTP attempt with revalidation + signing.
// Retries keep event_id and body; fresh timestamp/signature each attempt.
func (s *WebhookService) ProcessDelivery(ctx context.Context, deliveryID string) error {
	d, err := s.Store.GetDelivery(ctx, deliveryID)
	if err != nil {
		return err
	}
	if d.Status == webhooks.DeliveryDelivered || d.Status == webhooks.DeliveryCancelled {
		return nil
	}
	ep, err := s.Store.GetEndpoint(ctx, d.EndpointID)
	if err != nil {
		return s.failDelivery(ctx, d, "endpoint_missing", nil, nil)
	}
	if ep.Status != webhooks.StatusActive {
		return s.failDelivery(ctx, d, "endpoint_inactive", nil, nil)
	}

	// SSRF revalidation every delivery (DNS rebinding / private network).
	if _, err := s.ValidateEndpointURL(ctx, ep.URL); err != nil {
		return s.deadLetter(ctx, d, "ssrf_rejected")
	}

	secret, err := s.signingSecret(ctx, ep)
	if err != nil {
		return s.failDelivery(ctx, d, "secret_unavailable", nil, nil)
	}

	now := s.now()
	attemptNo := d.AttemptCount + 1
	ts := webhooks.NowUnix(now)
	sig := webhooks.SignPayload(secret, ts, d.EventID, d.PayloadBody)
	headers := webhooks.SignatureHeaders(ts, d.EventID, d.EventType, sig)

	start := time.Now()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, ep.URL, bytes.NewReader(d.PayloadBody))
	if err != nil {
		return s.scheduleRetry(ctx, d, attemptNo, nil, "request_build", err.Error())
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Fersaku-Webhooks/1.0")
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	resp, err := s.client().Do(req)
	latency := int32(time.Since(start).Milliseconds())
	finished := s.now()
	attempt := webhooks.Attempt{
		ID:              s.newID("wha_"),
		DeliveryID:      d.ID,
		AttemptNo:       attemptNo,
		SignedTimestamp: strconv.FormatInt(ts, 10),
		SignatureHeader: sig,
		RequestURL:      ep.URL,
		LatencyMs:       &latency,
		StartedAt:       now,
		FinishedAt:      finished,
	}

	if err != nil {
		ec := "transport_error"
		if ssrf.IsPrivate(err) {
			// Private after revalidation/redirect → dead letter (not retry forever).
			detail := err.Error()
			attempt.ErrorClass = &ec
			attempt.ErrorDetail = &detail
			_ = s.Store.InsertAttempt(ctx, attempt)
			return s.deadLetter(ctx, d, "private_network")
		}
		detail := "http_error"
		attempt.ErrorClass = &ec
		attempt.ErrorDetail = &detail
		_ = s.Store.InsertAttempt(ctx, attempt)
		return s.scheduleRetry(ctx, d, attemptNo, nil, ec, detail)
	}
	defer resp.Body.Close()
	snippet, _ := io.ReadAll(io.LimitReader(resp.Body, webhooks.MaxResponseBytes))
	st := int32(resp.StatusCode)
	attempt.HTTPStatus = &st
	snip := string(snippet)
	if snip != "" {
		attempt.ResponseSnippet = &snip
	}

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		_ = s.Store.InsertAttempt(ctx, attempt)
		d.Status = webhooks.DeliveryDelivered
		d.AttemptCount = attemptNo
		d.LastHTTPStatus = &st
		d.LastLatencyMs = &latency
		d.DeliveredAt = &finished
		d.NextRetryAt = nil
		d.UpdatedAt = finished
		_ = s.Store.UpdateDelivery(ctx, d)
		ep.FailureCount = 0
		ep.LastSuccessAt = &finished
		ep.UpdatedAt = finished
		_ = s.Store.UpdateEndpoint(ctx, ep)
		return nil
	}

	ec := "http_" + strconv.Itoa(resp.StatusCode)
	attempt.ErrorClass = &ec
	_ = s.Store.InsertAttempt(ctx, attempt)
	if resp.StatusCode >= 400 && resp.StatusCode < 500 && resp.StatusCode != 408 && resp.StatusCode != 429 {
		// Non-retryable client errors (except timeout/rate-limit).
		return s.deadLetter(ctx, d, ec)
	}
	return s.scheduleRetry(ctx, d, attemptNo, &st, ec, "")
}

func (s *WebhookService) signingSecret(ctx context.Context, ep webhooks.Endpoint) (string, error) {
	sv, err := s.Store.GetActiveSecret(ctx, ep.ID)
	if err != nil {
		if ep.CurrentSecretVersion != nil {
			sv, err = s.Store.GetSecretVersion(ctx, ep.ID, *ep.CurrentSecretVersion)
		}
		if err != nil {
			return "", err
		}
	}
	return security.DecryptString(s.EncryptionKey, sv.SecretCiphertext)
}

func (s *WebhookService) scheduleRetry(ctx context.Context, d webhooks.Delivery, attemptNo int32, httpStatus *int32, errClass, detail string) error {
	now := s.now()
	d.AttemptCount = attemptNo
	d.LastHTTPStatus = httpStatus
	d.LastErrorClass = &errClass
	d.UpdatedAt = now
	if attemptNo >= d.MaxAttempts {
		return s.deadLetter(ctx, d, errClass)
	}
	backoff := webhookBackoff(int(attemptNo))
	// Jitter: ±20% using crypto/rand.
	jitter := time.Duration(0)
	var b [1]byte
	if _, err := rand.Read(b[:]); err == nil {
		j := int(b[0])%40 - 20
		jitter = time.Duration(int64(backoff) * int64(j) / 100)
	}
	next := now.Add(backoff + jitter)
	d.Status = webhooks.DeliveryRetrying
	d.NextRetryAt = &next
	_ = s.Store.UpdateDelivery(ctx, d)

	// Re-enqueue outbox for next attempt (same event/body).
	payload, _ := json.Marshal(webhooks.OutboxDeliverPayload{
		DeliveryID: d.ID,
		EndpointID: d.EndpointID,
		EventID:    d.EventID,
		Version:    1,
	})
	dk := fmt.Sprintf("seller_webhook.deliver:%s:%s:a%d", d.EndpointID, d.EventID, attemptNo)
	mode := d.PaymentMode
	_ = s.Store.InsertOutbox(ctx, s.newID("obx_"), webhooks.TopicDeliver, payload, &dk, &mode, next)

	if ep, err := s.Store.GetEndpoint(ctx, d.EndpointID); err == nil {
		ep.FailureCount++
		ep.LastFailureAt = &now
		ep.UpdatedAt = now
		_ = s.Store.UpdateEndpoint(ctx, ep)
	}
	_ = detail
	return nil
}

func (s *WebhookService) failDelivery(ctx context.Context, d webhooks.Delivery, errClass string, httpStatus *int32, latency *int32) error {
	return s.scheduleRetry(ctx, d, d.AttemptCount+1, httpStatus, errClass, "")
}

func (s *WebhookService) deadLetter(ctx context.Context, d webhooks.Delivery, reason string) error {
	now := s.now()
	d.Status = webhooks.DeliveryDeadLetter
	d.DeadLetterReason = &reason
	d.UpdatedAt = now
	d.NextRetryAt = nil
	_ = s.Store.UpdateDelivery(ctx, d)
	_ = s.Store.InsertDeadLetter(ctx, webhooks.DeadLetter{
		ID:             s.newID("whdl_"),
		DeliveryID:     d.ID,
		EndpointID:     d.EndpointID,
		MerchantID:     d.MerchantID,
		EventID:        d.EventID,
		EventType:      d.EventType,
		Reason:         reason,
		LastHTTPStatus: d.LastHTTPStatus,
		AttemptCount:   d.AttemptCount,
		CreatedAt:      now,
	})
	return nil
}

func webhookBackoff(attempts int) time.Duration {
	if attempts < 1 {
		attempts = 1
	}
	shift := attempts
	if shift > 8 {
		shift = 8
	}
	d := time.Duration(1<<shift) * time.Second
	if d > 5*time.Minute {
		return 5 * time.Minute
	}
	return d
}

// HostFromURL returns hostname for DTO masking.
func HostFromURL(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	return u.Hostname()
}
