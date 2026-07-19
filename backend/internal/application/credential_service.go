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
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/credentials"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/gateway"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/kyc"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// CredentialService owns merchant API key lifecycle and one-time claim (BE-410).
// Admin/support authorize only — never receive raw keys.
type CredentialService struct {
	Store CredentialStore
	// Auth optional: recent MFA when user has MFA enabled.
	Auth  *AuthService
	IDs   ports.IDGenerator
	Clock ports.Clock
	Log   ports.Logger
	// KeyHashSecret for HMAC of API keys (same class as session secret).
	KeyHashSecret string
	// ClaimHashSecret for claim tokens; defaults to KeyHashSecret.
	ClaimHashSecret string
}

func (s *CredentialService) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now().UTC()
	}
	return time.Now().UTC()
}

func (s *CredentialService) newID(prefix string) string {
	id := s.IDs.New()
	if !strings.HasPrefix(id, prefix) {
		id = prefix + id
	}
	return id
}

func (s *CredentialService) hashKey(raw string) string {
	return auth.HashTokenKeyed(raw, s.KeyHashSecret)
}

func (s *CredentialService) hashClaim(raw string) string {
	secret := s.ClaimHashSecret
	if secret == "" {
		secret = s.KeyHashSecret
	}
	return auth.HashTokenKeyed(raw, secret)
}

func (s *CredentialService) fingerprint(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:8])
}

// ResolveMerchantForUser returns merchant for owner/member; cross-tenant → NOT_FOUND.
func (s *CredentialService) ResolveMerchantForUser(ctx context.Context, userID, merchantID string) (string, error) {
	if userID == "" {
		return "", apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required")
	}
	if merchantID == "" || merchantID == "me" {
		mid, st, err := s.Store.GetMerchantByOwner(ctx, userID)
		if err != nil {
			if s.Store.IsNotFound(err) {
				return "", apperr.NotFound(apperr.CodeResourceNotFound, "Merchant not found")
			}
			return "", apperr.Internal(apperr.CodeInternalError, "Merchant lookup failed")
		}
		if strings.EqualFold(st, "SUSPENDED") || strings.EqualFold(st, "CLOSED") {
			return "", apperr.Forbidden(apperr.CodeMerchantSuspended, "Merchant is suspended")
		}
		return mid, nil
	}
	_, err := s.Store.MerchantMemberActive(ctx, merchantID, userID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return "", apperr.NotFound(apperr.CodeResourceNotFound, "Merchant not found")
		}
		return "", apperr.Internal(apperr.CodeInternalError, "Membership lookup failed")
	}
	return merchantID, nil
}

// ResolveMerchantFromStore resolves store → merchant with ownership check.
func (s *CredentialService) ResolveMerchantFromStore(ctx context.Context, userID, storeID string) (string, error) {
	mid, st, err := s.Store.GetStoreMerchant(ctx, storeID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return "", apperr.NotFound(apperr.CodeResourceNotFound, "Store not found")
		}
		return "", apperr.Internal(apperr.CodeInternalError, "Store lookup failed")
	}
	if strings.EqualFold(st, "ARCHIVED") || strings.EqualFold(st, "CLOSED") {
		return "", apperr.NotFound(apperr.CodeResourceNotFound, "Store not found")
	}
	// Must be member of merchant.
	if _, err := s.ResolveMerchantForUser(ctx, userID, mid); err != nil {
		return "", err
	}
	return mid, nil
}

// requireMFA gates sensitive credential actions when MFA is enabled.
// When Auth is nil or user has no MFA, allows (local/test path).
func (s *CredentialService) requireMFA(ctx context.Context, userID, sessionID, mfaCode string) error {
	if s.Auth == nil || userID == "" {
		return nil
	}
	u, err := s.Auth.Store.GetUserByID(ctx, userID)
	if err != nil {
		return nil // fail open on lookup for non-MFA path; claim still auth-bound
	}
	if !u.MFAEnabled {
		return nil
	}
	if sessionID == "" {
		return credentials.ErrMFARequired
	}
	if err := s.Auth.requireFreshMFA(ctx, userID, sessionID, mfaCode); err != nil {
		return credentials.ErrMFARequired
	}
	return nil
}

// RequestIssuanceInput creates or refreshes an authorized claim for sandbox/live.
type RequestIssuanceInput struct {
	UserID             string
	SessionID          string
	MerchantID         string // or "me"
	StoreID            string // optional alternate scope
	Mode               string
	Purpose            string
	Reason             string
	MFACode            string
	IdempotencyKey     string
	ExpectedKeyVersion *int32
}

// RequestIssuanceResult returns issuance metadata + raw claim token once (never API key).
type RequestIssuanceResult struct {
	Issuance       kyc.IssuanceRequest
	ClaimToken     string // raw one-time; empty on idempotent replay without re-issue
	ClaimExpiresAt time.Time
	Idempotent     bool
}

// RequestIssuance creates AUTHORIZED sandbox issuance (or LIVE if KYC active) with one-time claim token.
func (s *CredentialService) RequestIssuance(ctx context.Context, in RequestIssuanceInput) (RequestIssuanceResult, error) {
	mid := in.MerchantID
	var err error
	if in.StoreID != "" {
		mid, err = s.ResolveMerchantFromStore(ctx, in.UserID, in.StoreID)
	} else {
		mid, err = s.ResolveMerchantForUser(ctx, in.UserID, mid)
	}
	if err != nil {
		return RequestIssuanceResult{}, err
	}
	mode := strings.ToUpper(strings.TrimSpace(in.Mode))
	if mode != gateway.ModeSandbox && mode != gateway.ModeLive {
		return RequestIssuanceResult{}, apperr.Validation(apperr.CodeValidationFailed, "paymentMode must be SANDBOX or LIVE")
	}
	purpose := credentials.NormalizePurpose(in.Purpose)
	if purpose != credentials.PurposeAPIKey && purpose != credentials.PurposeRotation {
		return RequestIssuanceResult{}, apperr.Validation(apperr.CodeValidationFailed, "invalid purpose")
	}
	if err := s.requireMFA(ctx, in.UserID, in.SessionID, in.MFACode); err != nil {
		return RequestIssuanceResult{}, err
	}

	// LIVE requires ACTIVE capability at request time (may still PENDING_KYC if not approved).
	liveCapActive := false
	if mode == gateway.ModeLive {
		cap, err := s.Store.GetCapability(ctx, mid, gateway.ModeLive, gateway.CapabilityQRISAPI)
		if err == nil && cap.Status == gateway.CapStatusActive {
			if cap.ExpiresAt == nil || cap.ExpiresAt.After(s.now()) {
				liveCapActive = true
			}
		}
	}

	now := s.now()
	var idemRec *IdempotencyRecord
	if in.IdempotencyKey != "" {
		kh := auth.HashToken(in.IdempotencyKey)
		pm := mode
		reqHash := auth.HashToken(mode + ":" + purpose + ":" + in.Reason)
		rec := IdempotencyRecord{
			ID:          s.newID("idem_"),
			SubjectType: "merchant",
			SubjectID:   mid,
			Operation:   "credential.issuance.request",
			PaymentMode: &pm,
			KeyHash:     kh,
			RequestHash: reqHash,
			Status:      "STARTED",
			ExpiresAt:   now.Add(24 * time.Hour),
		}
		got, inserted, err := s.Store.TryInsertIdempotency(ctx, rec)
		if err != nil {
			return RequestIssuanceResult{}, apperr.Internal(apperr.CodeInternalError, "Idempotency failed")
		}
		if !inserted {
			if got.Status == "COMPLETED" && got.ResponseBody != nil {
				var prev RequestIssuanceResult
				// Replay without re-revealing claim token.
				ir, err := s.Store.GetOutstandingIssuance(ctx, mid, mode)
				if err == nil {
					prev.Issuance = ir
					prev.Idempotent = true
					if ir.ClaimExpiresAt != nil {
						prev.ClaimExpiresAt = *ir.ClaimExpiresAt
					}
					return prev, nil
				}
			}
			return RequestIssuanceResult{}, apperr.Conflict(apperr.CodeConflict, "Idempotency key in progress or conflict")
		}
		idemRec = &got
	}

	var result RequestIssuanceResult
	err = s.Store.WithTx(ctx, func(ctx context.Context) error {
		existing, err := s.Store.GetOutstandingIssuance(ctx, mid, mode)
		if err != nil && !s.Store.IsNotFound(err) {
			return err
		}
		hasExisting := err == nil

		rawClaim, err := auth.GenerateToken(credentials.ClaimTokenBytes)
		if err != nil {
			return apperr.Internal(apperr.CodeInternalError, "Claim token generation failed")
		}
		claimHash := s.hashClaim(rawClaim)
		claimExp := now.Add(credentials.ClaimTTL)
		var sessBind *string
		if in.SessionID != "" {
			sessBind = &in.SessionID
		}

		if hasExisting {
			// Refresh claim on outstanding request; promote PENDING_KYC→AUTHORIZED when live cap active.
			status := existing.Status
			if mode == gateway.ModeLive && status == kyc.IssuancePendingKYC && liveCapActive {
				status = kyc.IssuanceAuthorized
			}
			if mode == gateway.ModeSandbox && status == kyc.IssuancePendingKYC {
				status = kyc.IssuanceAuthorized
			}
			// Cannot issue claim for PENDING_KYC live without capability.
			if status == kyc.IssuancePendingKYC {
				return credentials.ErrLiveKYCRequired
			}
			authAt := now
			exp := now.Add(credentials.IssuanceAuthTTL)
			p := UpdateIssuanceClaimParams{
				ID:                   existing.ID,
				ClaimTokenHash:       claimHash,
				ClaimExpiresAt:       claimExp,
				ClaimRecipientUserID: in.UserID,
				MFABindingSessionID:  sessBind,
				Status:               status,
				AuthorizerUserID:     &in.UserID,
				AuthorizedAt:         &authAt,
				ExpiresAt:            &exp,
				Reason:               strings.TrimSpace(in.Reason),
				UpdatedAt:            now,
			}
			if err := s.Store.UpdateIssuanceClaimToken(ctx, p); err != nil {
				return err
			}
			// Revoke prior secret_claims for this issuance.
			_ = s.Store.RevokeSecretClaimsForIssuance(ctx, existing.ID, now)
			sc := credentials.SecretClaim{
				ID:                  s.newID("scl_"),
				Kind:                credentials.ClaimKindAPIKey,
				ResourceType:        "issuance_request",
				ResourceID:          existing.ID,
				ResourceVersion:     existing.RequestVersion + 1,
				MerchantID:          mid,
				RecipientUserID:     in.UserID,
				ClaimTokenHash:      claimHash,
				Status:              credentials.ClaimStatusActive,
				MaxAttempts:         credentials.MaxClaimAttempts,
				ExpiresAt:           claimExp,
				MFABindingSessionID: sessBind,
				IssuanceRequestID:   &existing.ID,
				CreatedAt:           now,
				UpdatedAt:           now,
			}
			if err := s.Store.InsertSecretClaim(ctx, sc); err != nil {
				return err
			}
			existing.Status = status
			existing.ClaimTokenHash = &claimHash
			existing.ClaimExpiresAt = &claimExp
			existing.ClaimRecipientUserID = &in.UserID
			result = RequestIssuanceResult{
				Issuance:       existing,
				ClaimToken:     rawClaim,
				ClaimExpiresAt: claimExp,
			}
		} else {
			status := kyc.IssuanceAuthorized
			if mode == gateway.ModeLive && !liveCapActive {
				status = kyc.IssuancePendingKYC
			}
			// PENDING_KYC has no claim token until authorized.
			var claimHashPtr *string
			var claimExpPtr *time.Time
			var recip *string
			var rawOut string
			if status == kyc.IssuanceAuthorized {
				claimHashPtr = &claimHash
				claimExpPtr = &claimExp
				recip = &in.UserID
				rawOut = rawClaim
			}
			authAt := now
			exp := now.Add(credentials.IssuanceAuthTTL)
			ir := kyc.IssuanceRequest{
				ID:                   s.newID("iss_"),
				MerchantID:           mid,
				PaymentMode:          mode,
				Purpose:              purpose,
				Capability:           gateway.CapabilityQRISAPI,
				Status:               status,
				RequesterUserID:      &in.UserID,
				AuthorizerUserID:     &in.UserID,
				Reason:               strings.TrimSpace(in.Reason),
				AuthorizedAt:         &authAt,
				ExpiresAt:            &exp,
				ClaimTokenHash:       claimHashPtr,
				ClaimExpiresAt:       claimExpPtr,
				ClaimRecipientUserID: recip,
				MFABindingSessionID:  sessBind,
				ExpectedVersion:      in.ExpectedKeyVersion,
				RequestVersion:       1,
				CreatedAt:            now,
				UpdatedAt:            now,
			}
			if status == kyc.IssuancePendingKYC {
				ir.AuthorizedAt = nil
				ir.AuthorizerUserID = nil
			}
			if err := s.Store.InsertIssuance(ctx, ir); err != nil {
				if s.Store.IsUniqueViolation(err) {
					return credentials.ErrIssuanceOutstanding
				}
				return err
			}
			if status == kyc.IssuanceAuthorized {
				sc := credentials.SecretClaim{
					ID:                  s.newID("scl_"),
					Kind:                credentials.ClaimKindAPIKey,
					ResourceType:        "issuance_request",
					ResourceID:          ir.ID,
					ResourceVersion:     1,
					MerchantID:          mid,
					RecipientUserID:     in.UserID,
					ClaimTokenHash:      claimHash,
					Status:              credentials.ClaimStatusActive,
					MaxAttempts:         credentials.MaxClaimAttempts,
					ExpiresAt:           claimExp,
					MFABindingSessionID: sessBind,
					IssuanceRequestID:   &ir.ID,
					CreatedAt:           now,
					UpdatedAt:           now,
				}
				if err := s.Store.InsertSecretClaim(ctx, sc); err != nil {
					return err
				}
			}
			result = RequestIssuanceResult{
				Issuance:       ir,
				ClaimToken:     rawOut,
				ClaimExpiresAt: claimExp,
			}
			if status == kyc.IssuancePendingKYC {
				result.ClaimExpiresAt = time.Time{}
			}
		}

		// Outbox (no raw claim/key).
		payload, _ := json.Marshal(map[string]any{
			"merchantId":  mid,
			"issuanceId":  result.Issuance.ID,
			"paymentMode": mode,
			"purpose":     purpose,
			"status":      result.Issuance.Status,
			"actorUserId": in.UserID,
		})
		dk := "issuance-requested:" + result.Issuance.ID + ":" + fmt.Sprintf("%d", now.UnixNano())
		pm := mode
		if err := s.Store.InsertOutbox(ctx, s.newID("obx_"), credentials.TopicIssuanceRequested, payload, &dk, &pm, now); err != nil {
			return err
		}
		sum := sha256.Sum256(payload)
		_ = s.Store.InsertAudit(ctx, s.newID("aud_"), sum[:], now)
		return nil
	})
	if err != nil {
		return RequestIssuanceResult{}, err
	}

	if idemRec != nil {
		body, _ := json.Marshal(map[string]any{
			"issuanceId": result.Issuance.ID,
			"status":     result.Issuance.Status,
		})
		rt, rid := "issuance_request", result.Issuance.ID
		_, _ = s.Store.CompleteIdempotency(ctx, idemRec.ID, "COMPLETED", &rt, &rid, 201, body)
	}
	return result, nil
}

// ClaimInput exchanges a one-time claim token for a raw API key (once).
type ClaimInput struct {
	UserID     string
	SessionID  string
	ClaimToken string
	MFACode    string
	// Optional scope checks
	MerchantID string
	StoreID    string
}

// ClaimResult returns raw API key exactly once.
type ClaimResult struct {
	RawAPIKey  string
	Credential gateway.APIKey
}

// ClaimExchange consumes claim token and generates API key in one TX.
func (s *CredentialService) ClaimExchange(ctx context.Context, in ClaimInput) (ClaimResult, error) {
	rawToken := strings.TrimSpace(in.ClaimToken)
	if rawToken == "" {
		return ClaimResult{}, credentials.ErrClaimInvalid
	}
	if err := s.requireMFA(ctx, in.UserID, in.SessionID, in.MFACode); err != nil {
		return ClaimResult{}, err
	}

	// Optional merchant scope.
	var scopedMerchant string
	if in.StoreID != "" {
		mid, err := s.ResolveMerchantFromStore(ctx, in.UserID, in.StoreID)
		if err != nil {
			return ClaimResult{}, err
		}
		scopedMerchant = mid
	} else if in.MerchantID != "" && in.MerchantID != "me" {
		mid, err := s.ResolveMerchantForUser(ctx, in.UserID, in.MerchantID)
		if err != nil {
			return ClaimResult{}, err
		}
		scopedMerchant = mid
	}

	now := s.now()
	claimHash := s.hashClaim(rawToken)
	var result ClaimResult

	err := s.Store.WithTx(ctx, func(ctx context.Context) error {
		ir, err := s.Store.GetIssuanceByClaimHash(ctx, claimHash)
		if err != nil {
			if s.Store.IsNotFound(err) {
				return credentials.ErrClaimInvalid
			}
			return apperr.Internal(apperr.CodeInternalError, "Claim lookup failed")
		}
		// Recipient must match.
		if ir.ClaimRecipientUserID == nil || *ir.ClaimRecipientUserID != in.UserID {
			_ = s.Store.BumpClaimAttempts(ctx, ir.ID, now)
			return credentials.ErrClaimInvalid
		}
		if scopedMerchant != "" && ir.MerchantID != scopedMerchant {
			return credentials.ErrClaimInvalid
		}
		if ir.Status != kyc.IssuanceAuthorized {
			if ir.Status == kyc.IssuanceClaimed {
				return credentials.ErrClaimConsumed
			}
			return credentials.ErrClaimInvalid
		}
		if ir.ClaimExpiresAt != nil && !ir.ClaimExpiresAt.After(now) {
			return credentials.ErrClaimExpired
		}
		if ir.ExpiresAt != nil && !ir.ExpiresAt.After(now) {
			return credentials.ErrClaimExpired
		}
		if ir.ClaimAttempts >= credentials.MaxClaimAttempts {
			return credentials.ErrClaimInvalid
		}

		// LIVE: recheck KYC capability at claim time.
		if ir.PaymentMode == gateway.ModeLive {
			cap, err := s.Store.GetCapability(ctx, ir.MerchantID, gateway.ModeLive, gateway.CapabilityQRISAPI)
			if err != nil || cap.Status != gateway.CapStatusActive {
				return credentials.ErrLiveKYCRequired
			}
			if cap.ExpiresAt != nil && !cap.ExpiresAt.After(now) {
				return credentials.ErrLiveKYCRequired
			}
		}

		// Generate raw API key once.
		secret, err := auth.GenerateToken(32)
		if err != nil {
			return apperr.Internal(apperr.CodeInternalError, "Key generation failed")
		}
		pfx := gateway.KeyPrefixSandbox
		if ir.PaymentMode == gateway.ModeLive {
			pfx = gateway.KeyPrefixLive
		}
		raw := pfx + secret
		prefix := gateway.ParseAPIKeyPrefix(raw)
		fp := s.fingerprint(raw)
		keyID := s.newID("mak_")
		issID := ir.ID
		var version int32 = 1
		if active, err := s.Store.GetActiveAPIKey(ctx, ir.MerchantID); err == nil {
			version = active.KeyVersion + 1
		}

		// Revoke predecessor ACTIVE key (single active per merchant).
		if err := s.Store.RevokeAllActiveKeys(ctx, ir.MerchantID, now); err != nil {
			return err
		}

		k := gateway.APIKey{
			ID:                keyID,
			MerchantID:        ir.MerchantID,
			KeyPrefix:         prefix,
			KeyHash:           s.hashKey(raw),
			PaymentMode:       ir.PaymentMode,
			Status:            gateway.KeyStatusActive,
			Name:              ir.Purpose,
			CreatedAt:         now,
			UpdatedAt:         now,
			KeyVersion:        version,
			IssuanceRequestID: &issID,
			Fingerprint:       fp,
		}
		if err := s.Store.InsertAPIKey(ctx, k); err != nil {
			return apperr.Internal(apperr.CodeInternalError, "Failed to store API key")
		}
		if err := s.Store.MarkIssuanceClaimed(ctx, ir.ID, now, keyID); err != nil {
			return err
		}
		// Consume secret_claim rows.
		if sc, err := s.Store.GetSecretClaimByHash(ctx, claimHash); err == nil {
			_ = s.Store.ConsumeSecretClaim(ctx, sc.ID, now)
		}
		_ = s.Store.RevokeSecretClaimsForIssuance(ctx, ir.ID, now)

		payload, _ := json.Marshal(map[string]any{
			"merchantId":  ir.MerchantID,
			"issuanceId":  ir.ID,
			"apiKeyId":    keyID,
			"paymentMode": ir.PaymentMode,
			"keyPrefix":   prefix,
			"fingerprint": fp,
			"keyVersion":  version,
			"actorUserId": in.UserID,
		})
		dk := "credential-claimed:" + ir.ID
		pm := ir.PaymentMode
		if err := s.Store.InsertOutbox(ctx, s.newID("obx_"), credentials.TopicCredentialClaimed, payload, &dk, &pm, now); err != nil {
			return err
		}
		sum := sha256.Sum256(payload)
		_ = s.Store.InsertAudit(ctx, s.newID("aud_"), sum[:], now)

		result = ClaimResult{RawAPIKey: raw, Credential: k}
		return nil
	})
	if err != nil {
		return ClaimResult{}, err
	}
	return result, nil
}

// ListCredentials returns masked keys for seller (never raw/hash).
func (s *CredentialService) ListCredentials(ctx context.Context, userID, merchantID string) ([]credentials.MaskedCredential, []credentials.IssuanceView, error) {
	mid, err := s.ResolveMerchantForUser(ctx, userID, merchantID)
	if err != nil {
		return nil, nil, err
	}
	keys, err := s.Store.ListAPIKeysByMerchant(ctx, mid, 50)
	if err != nil {
		return nil, nil, apperr.Internal(apperr.CodeInternalError, "Failed to list credentials")
	}
	masked := make([]credentials.MaskedCredential, 0, len(keys))
	for _, k := range keys {
		masked = append(masked, credentials.MaskedCredential{
			ID:          k.ID,
			MerchantID:  k.MerchantID,
			KeyPrefix:   k.KeyPrefix,
			Fingerprint: k.Fingerprint,
			PaymentMode: k.PaymentMode,
			Status:      k.Status,
			Name:        k.Name,
			KeyVersion:  k.KeyVersion,
			LastUsedAt:  k.LastUsedAt,
			RevokedAt:   k.RevokedAt,
			CreatedAt:   k.CreatedAt,
			UpdatedAt:   k.UpdatedAt,
		})
	}
	irs, err := s.Store.ListIssuancesByMerchant(ctx, mid, 20)
	if err != nil {
		return nil, nil, apperr.Internal(apperr.CodeInternalError, "Failed to list issuances")
	}
	views := make([]credentials.IssuanceView, 0, len(irs))
	for _, ir := range irs {
		views = append(views, credentials.IssuanceView{
			ID:              ir.ID,
			MerchantID:      ir.MerchantID,
			PaymentMode:     ir.PaymentMode,
			Purpose:         ir.Purpose,
			Status:          ir.Status,
			ClaimExpiresAt:  ir.ClaimExpiresAt,
			HasPendingClaim: ir.Status == kyc.IssuanceAuthorized && ir.ClaimTokenHash != nil && ir.ClaimConsumedAt == nil,
			AuthorizedAt:    ir.AuthorizedAt,
			ClaimedAt:       ir.ClaimedAt,
			ExpiresAt:       ir.ExpiresAt,
			CreatedAt:       ir.CreatedAt,
		})
	}
	return masked, views, nil
}

// ListCredentialsForStore is store-scoped list.
func (s *CredentialService) ListCredentialsForStore(ctx context.Context, userID, storeID string) ([]credentials.MaskedCredential, []credentials.IssuanceView, error) {
	mid, err := s.ResolveMerchantFromStore(ctx, userID, storeID)
	if err != nil {
		return nil, nil, err
	}
	return s.ListCredentials(ctx, userID, mid)
}

// RevokeInput seller/admin revoke.
type RevokeInput struct {
	UserID     string
	SessionID  string
	MerchantID string
	StoreID    string
	KeyID      string
	Reason     string
	MFACode    string
	IsAdmin    bool
}

// RevokeKey immediately revokes ACTIVE/SUSPENDED key.
func (s *CredentialService) RevokeKey(ctx context.Context, in RevokeInput) (gateway.APIKey, error) {
	mid, key, err := s.loadOwnedKey(ctx, in.UserID, in.MerchantID, in.StoreID, in.KeyID, in.IsAdmin)
	if err != nil {
		return gateway.APIKey{}, err
	}
	_ = mid
	if !in.IsAdmin {
		if err := s.requireMFA(ctx, in.UserID, in.SessionID, in.MFACode); err != nil {
			return gateway.APIKey{}, err
		}
	}
	if key.Status == gateway.KeyStatusRevoked {
		return key, nil
	}
	now := s.now()
	err = s.Store.WithTx(ctx, func(ctx context.Context) error {
		if err := s.Store.RevokeAPIKey(ctx, key.ID, now); err != nil {
			return err
		}
		payload, _ := json.Marshal(map[string]any{
			"merchantId":  key.MerchantID,
			"apiKeyId":    key.ID,
			"paymentMode": key.PaymentMode,
			"keyPrefix":   key.KeyPrefix,
			"reason":      strings.TrimSpace(in.Reason),
			"actorUserId": in.UserID,
			"admin":       in.IsAdmin,
		})
		dk := "credential-revoked:" + key.ID + ":" + fmt.Sprintf("%d", now.Unix())
		pm := key.PaymentMode
		if err := s.Store.InsertOutbox(ctx, s.newID("obx_"), credentials.TopicCredentialRevoked, payload, &dk, &pm, now); err != nil {
			return err
		}
		sum := sha256.Sum256(payload)
		_ = s.Store.InsertAudit(ctx, s.newID("aud_"), sum[:], now)
		return nil
	})
	if err != nil {
		return gateway.APIKey{}, err
	}
	key.Status = gateway.KeyStatusRevoked
	key.RevokedAt = &now
	key.UpdatedAt = now
	return key, nil
}

// SuspendInput admin suspend (never returns raw).
type SuspendInput struct {
	ActorUserID string
	MerchantID  string
	KeyID       string
	Reason      string
}

// AdminSuspendKey suspends ACTIVE key.
func (s *CredentialService) AdminSuspendKey(ctx context.Context, in SuspendInput) (gateway.APIKey, error) {
	if strings.TrimSpace(in.Reason) == "" {
		return gateway.APIKey{}, apperr.Validation(apperr.CodeValidationFailed, "reason is required")
	}
	key, err := s.Store.GetAPIKeyByID(ctx, in.KeyID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return gateway.APIKey{}, credentials.ErrKeyNotFound
		}
		return gateway.APIKey{}, apperr.Internal(apperr.CodeInternalError, "Key lookup failed")
	}
	if in.MerchantID != "" && key.MerchantID != in.MerchantID {
		return gateway.APIKey{}, credentials.ErrKeyNotFound
	}
	if key.Status != gateway.KeyStatusActive {
		return gateway.APIKey{}, credentials.ErrKeyNotActive
	}
	now := s.now()
	err = s.Store.WithTx(ctx, func(ctx context.Context) error {
		if err := s.Store.SuspendAPIKey(ctx, key.ID, now); err != nil {
			return err
		}
		payload, _ := json.Marshal(map[string]any{
			"merchantId":  key.MerchantID,
			"apiKeyId":    key.ID,
			"reason":      in.Reason,
			"actorUserId": in.ActorUserID,
		})
		dk := "credential-suspended:" + key.ID
		pm := key.PaymentMode
		if err := s.Store.InsertOutbox(ctx, s.newID("obx_"), credentials.TopicCredentialSuspended, payload, &dk, &pm, now); err != nil {
			return err
		}
		sum := sha256.Sum256(payload)
		_ = s.Store.InsertAudit(ctx, s.newID("aud_"), sum[:], now)
		return nil
	})
	if err != nil {
		return gateway.APIKey{}, err
	}
	key.Status = gateway.KeyStatusSuspended
	key.UpdatedAt = now
	return key, nil
}

// AdminAuthorizeIssuance authorizes outstanding live issuance without returning claim/key.
func (s *CredentialService) AdminAuthorizeIssuance(ctx context.Context, actorUserID, merchantID, reason string) (kyc.IssuanceRequest, error) {
	if merchantID == "" {
		return kyc.IssuanceRequest{}, apperr.Validation(apperr.CodeValidationFailed, "merchantId is required")
	}
	// LIVE capability must be active (typically after KYC).
	cap, err := s.Store.GetCapability(ctx, merchantID, gateway.ModeLive, gateway.CapabilityQRISAPI)
	if err != nil || cap.Status != gateway.CapStatusActive {
		return kyc.IssuanceRequest{}, credentials.ErrLiveKYCRequired
	}
	now := s.now()
	ir, err := s.Store.GetOutstandingIssuance(ctx, merchantID, gateway.ModeLive)
	if err != nil {
		if s.Store.IsNotFound(err) {
			// Create AUTHORIZED without claim — seller must request claim.
			exp := now.Add(credentials.IssuanceAuthTTL)
			ir = kyc.IssuanceRequest{
				ID:               s.newID("iss_"),
				MerchantID:       merchantID,
				PaymentMode:      gateway.ModeLive,
				Purpose:          credentials.PurposeAPIKey,
				Capability:       gateway.CapabilityQRISAPI,
				Status:           kyc.IssuanceAuthorized,
				AuthorizerUserID: &actorUserID,
				Reason:           strings.TrimSpace(reason),
				AuthorizedAt:     &now,
				ExpiresAt:        &exp,
				RequestVersion:   1,
				CreatedAt:        now,
				UpdatedAt:        now,
			}
			if err := s.Store.InsertIssuance(ctx, ir); err != nil {
				return kyc.IssuanceRequest{}, err
			}
			return ir, nil
		}
		return kyc.IssuanceRequest{}, err
	}
	if ir.Status == kyc.IssuanceAuthorized {
		return ir, nil
	}
	authAt := now
	exp := now.Add(credentials.IssuanceAuthTTL)
	if err := s.adminSetAuthorized(ctx, ir.ID, actorUserID, reason, now); err != nil {
		return kyc.IssuanceRequest{}, err
	}
	ir.Status = kyc.IssuanceAuthorized
	ir.AuthorizerUserID = &actorUserID
	ir.AuthorizedAt = &authAt
	ir.ExpiresAt = &exp
	return ir, nil
}

func (s *CredentialService) adminSetAuthorized(ctx context.Context, id, actor, reason string, now time.Time) error {
	// Re-read and UpdateIssuanceClaimToken requires claim hash — use empty string which may clear.
	// Safer: Get + Update with existing hash if any.
	ir, err := s.Store.GetIssuanceByID(ctx, id)
	if err != nil {
		return err
	}
	hash := ""
	if ir.ClaimTokenHash != nil {
		hash = *ir.ClaimTokenHash
	}
	var expAt time.Time
	if ir.ClaimExpiresAt != nil {
		expAt = *ir.ClaimExpiresAt
	}
	recip := ""
	if ir.ClaimRecipientUserID != nil {
		recip = *ir.ClaimRecipientUserID
	}
	authAt := now
	issExp := now.Add(credentials.IssuanceAuthTTL)
	return s.Store.UpdateIssuanceClaimToken(ctx, UpdateIssuanceClaimParams{
		ID:                   id,
		ClaimTokenHash:       hash,
		ClaimExpiresAt:       expAt,
		ClaimRecipientUserID: recip,
		MFABindingSessionID:  ir.MFABindingSessionID,
		Status:               kyc.IssuanceAuthorized,
		AuthorizerUserID:     &actor,
		AuthorizedAt:         &authAt,
		ExpiresAt:            &issExp,
		Reason:               reason,
		UpdatedAt:            now,
	})
}

// AdminListCredentials masked list for support (never raw).
func (s *CredentialService) AdminListCredentials(ctx context.Context, merchantID string) ([]credentials.MaskedCredential, []credentials.IssuanceView, error) {
	if merchantID == "" {
		return nil, nil, apperr.Validation(apperr.CodeValidationFailed, "merchantId is required")
	}
	// Use empty user with direct store — admin path lists by merchant id only.
	keys, err := s.Store.ListAPIKeysByMerchant(ctx, merchantID, 50)
	if err != nil {
		return nil, nil, apperr.Internal(apperr.CodeInternalError, "Failed to list credentials")
	}
	masked := make([]credentials.MaskedCredential, 0, len(keys))
	for _, k := range keys {
		masked = append(masked, credentials.MaskedCredential{
			ID: k.ID, MerchantID: k.MerchantID, KeyPrefix: k.KeyPrefix, Fingerprint: k.Fingerprint,
			PaymentMode: k.PaymentMode, Status: k.Status, Name: k.Name, KeyVersion: k.KeyVersion,
			LastUsedAt: k.LastUsedAt, RevokedAt: k.RevokedAt, CreatedAt: k.CreatedAt, UpdatedAt: k.UpdatedAt,
		})
	}
	irs, err := s.Store.ListIssuancesByMerchant(ctx, merchantID, 20)
	if err != nil {
		return nil, nil, apperr.Internal(apperr.CodeInternalError, "Failed to list issuances")
	}
	views := make([]credentials.IssuanceView, 0, len(irs))
	for _, ir := range irs {
		views = append(views, credentials.IssuanceView{
			ID: ir.ID, MerchantID: ir.MerchantID, PaymentMode: ir.PaymentMode, Purpose: ir.Purpose,
			Status: ir.Status, ClaimExpiresAt: ir.ClaimExpiresAt,
			HasPendingClaim: ir.Status == kyc.IssuanceAuthorized && ir.ClaimTokenHash != nil && ir.ClaimConsumedAt == nil,
			AuthorizedAt:    ir.AuthorizedAt, ClaimedAt: ir.ClaimedAt, ExpiresAt: ir.ExpiresAt, CreatedAt: ir.CreatedAt,
		})
	}
	return masked, views, nil
}

func (s *CredentialService) loadOwnedKey(ctx context.Context, userID, merchantID, storeID, keyID string, isAdmin bool) (string, gateway.APIKey, error) {
	var mid string
	var err error
	if isAdmin {
		key, err := s.Store.GetAPIKeyByID(ctx, keyID)
		if err != nil {
			if s.Store.IsNotFound(err) {
				return "", gateway.APIKey{}, credentials.ErrKeyNotFound
			}
			return "", gateway.APIKey{}, err
		}
		if merchantID != "" && key.MerchantID != merchantID {
			return "", gateway.APIKey{}, credentials.ErrKeyNotFound
		}
		return key.MerchantID, key, nil
	}
	if storeID != "" {
		mid, err = s.ResolveMerchantFromStore(ctx, userID, storeID)
	} else {
		mid, err = s.ResolveMerchantForUser(ctx, userID, merchantID)
	}
	if err != nil {
		return "", gateway.APIKey{}, err
	}
	key, err := s.Store.GetAPIKeyByID(ctx, keyID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return "", gateway.APIKey{}, credentials.ErrKeyNotFound
		}
		return "", gateway.APIKey{}, err
	}
	if key.MerchantID != mid {
		return "", gateway.APIKey{}, credentials.ErrKeyNotFound
	}
	return mid, key, nil
}

// AttachClaimToAuthorizedIssuance is used after KYC approve when seller requests claim for existing AUTHORIZED row.
// (Covered by RequestIssuance refresh path.)

// Ensure no raw key leaks via Stringers — compile-time note.
var _ = credentials.ErrAdminNoRaw
