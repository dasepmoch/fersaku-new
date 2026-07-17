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
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/credentials"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/gateway"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/kyc"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// CredentialHandler serves seller credential lifecycle + admin authorize/suspend (BE-410).
type CredentialHandler struct {
	Svc *application.CredentialService
}

func (h *CredentialHandler) actor(r *http.Request) (userID, sessionID string, ok bool) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok || p.SubjectID == "" {
		return "", "", false
	}
	return p.SubjectID, p.SessionID, true
}

// ListMe GET /v1/me/credentials
func (h *CredentialHandler) ListMe(w http.ResponseWriter, r *http.Request) {
	userID, _, ok := h.actor(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Credentials unavailable"))
		return
	}
	keys, irs, err := h.Svc.ListCredentials(r.Context(), userID, "me")
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"credentials": maskKeysDTO(keys),
		"issuances":   issuanceDTOList(irs),
	})
}

// ListStore GET /v1/stores/{storeId}/api-credentials
func (h *CredentialHandler) ListStore(w http.ResponseWriter, r *http.Request) {
	userID, _, ok := h.actor(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	keys, irs, err := h.Svc.ListCredentialsForStore(r.Context(), userID, chi.URLParam(r, "storeId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"credentials": maskKeysDTO(keys),
		"issuances":   issuanceDTOList(irs),
	})
}

// RequestIssuance POST /v1/me/credentials/requests or store-scoped
func (h *CredentialHandler) RequestIssuance(w http.ResponseWriter, r *http.Request) {
	userID, sessionID, ok := h.actor(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	var body struct {
		PaymentMode        string `json:"paymentMode"`
		Mode               string `json:"mode"`
		Purpose            string `json:"purpose"`
		Reason             string `json:"reason"`
		MFACode            string `json:"mfaCode"`
		ExpectedKeyVersion *int32 `json:"expectedKeyVersion"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	mode := body.PaymentMode
	if mode == "" {
		mode = body.Mode
	}
	res, err := h.Svc.RequestIssuance(r.Context(), application.RequestIssuanceInput{
		UserID:             userID,
		SessionID:          sessionID,
		MerchantID:         "me",
		StoreID:            chi.URLParam(r, "storeId"),
		Mode:               mode,
		Purpose:            body.Purpose,
		Reason:             body.Reason,
		MFACode:            body.MFACode,
		IdempotencyKey:     r.Header.Get("Idempotency-Key"),
		ExpectedKeyVersion: body.ExpectedKeyVersion,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	if res.ClaimToken != "" {
		w.Header().Set("Cache-Control", "no-store")
	}
	dto := map[string]any{
		"issuance":   issuanceOneDTO(res.Issuance),
		"claimToken": nil,
		"idempotent": res.Idempotent,
	}
	if res.ClaimToken != "" {
		dto["claimToken"] = res.ClaimToken
		dto["claimExpiresAt"] = res.ClaimExpiresAt.UTC().Format(time.RFC3339)
	}
	status := http.StatusCreated
	if res.Idempotent {
		status = http.StatusOK
	}
	presenters.WriteData(w, r, status, dto)
}

// ClaimExchange POST body token only (§6.5).
func (h *CredentialHandler) ClaimExchange(w http.ResponseWriter, r *http.Request) {
	userID, sessionID, ok := h.actor(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	var body struct {
		Token      string `json:"token"`
		ClaimToken string `json:"claimToken"`
		MFACode    string `json:"mfaCode"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	tok := body.Token
	if tok == "" {
		tok = body.ClaimToken
	}
	res, err := h.Svc.ClaimExchange(r.Context(), application.ClaimInput{
		UserID:     userID,
		SessionID:  sessionID,
		ClaimToken: tok,
		MFACode:    body.MFACode,
		MerchantID: chi.URLParam(r, "merchantId"),
		StoreID:    chi.URLParam(r, "storeId"),
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"apiKey":     res.RawAPIKey,
		"credential": maskKeyOne(res.Credential),
	})
}

// Revoke POST /v1/me/credentials/{keyId}/revoke
func (h *CredentialHandler) Revoke(w http.ResponseWriter, r *http.Request) {
	userID, sessionID, ok := h.actor(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	var body struct {
		Reason  string `json:"reason"`
		MFACode string `json:"mfaCode"`
	}
	_ = decode.DecodeJSON(r, &body)
	key, err := h.Svc.RevokeKey(r.Context(), application.RevokeInput{
		UserID:     userID,
		SessionID:  sessionID,
		MerchantID: "me",
		StoreID:    chi.URLParam(r, "storeId"),
		KeyID:      chi.URLParam(r, "keyId"),
		Reason:     body.Reason,
		MFACode:    body.MFACode,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, maskKeyOne(key))
}

// AdminList GET /v1/admin/merchants/{merchantId}/api-credentials
func (h *CredentialHandler) AdminList(w http.ResponseWriter, r *http.Request) {
	if _, _, ok := h.actor(r); !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	keys, irs, err := h.Svc.AdminListCredentials(r.Context(), chi.URLParam(r, "merchantId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	body := map[string]any{
		"credentials": maskKeysDTO(keys),
		"issuances":   issuanceDTOList(irs),
	}
	raw, _ := json.Marshal(body)
	if strings.Contains(string(raw), "fsk_live_") || strings.Contains(string(raw), "fsk_test_") {
		presenters.WriteAppError(w, r, credentials.ErrAdminNoRaw)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, body)
}

// AdminAuthorize POST /v1/admin/merchants/{merchantId}/api-credentials/authorize
func (h *CredentialHandler) AdminAuthorize(w http.ResponseWriter, r *http.Request) {
	userID, _, ok := h.actor(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	_ = decode.DecodeJSON(r, &body)
	ir, err := h.Svc.AdminAuthorizeIssuance(r.Context(), userID, chi.URLParam(r, "merchantId"), body.Reason)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, issuanceOneDTO(ir))
}

// AdminSuspend POST .../{keyId}/suspend
func (h *CredentialHandler) AdminSuspend(w http.ResponseWriter, r *http.Request) {
	userID, _, ok := h.actor(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	key, err := h.Svc.AdminSuspendKey(r.Context(), application.SuspendInput{
		ActorUserID: userID,
		MerchantID:  chi.URLParam(r, "merchantId"),
		KeyID:       chi.URLParam(r, "keyId"),
		Reason:      body.Reason,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, maskKeyOne(key))
}

// AdminRevoke POST .../{keyId}/revoke
func (h *CredentialHandler) AdminRevoke(w http.ResponseWriter, r *http.Request) {
	userID, sessionID, ok := h.actor(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	_ = decode.DecodeJSON(r, &body)
	key, err := h.Svc.RevokeKey(r.Context(), application.RevokeInput{
		UserID:     userID,
		SessionID:  sessionID,
		MerchantID: chi.URLParam(r, "merchantId"),
		KeyID:      chi.URLParam(r, "keyId"),
		Reason:     body.Reason,
		IsAdmin:    true,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, maskKeyOne(key))
}

func maskKeysDTO(keys []credentials.MaskedCredential) []map[string]any {
	out := make([]map[string]any, 0, len(keys))
	for _, k := range keys {
		out = append(out, map[string]any{
			"id": k.ID, "merchantId": k.MerchantID, "keyPrefix": k.KeyPrefix,
			"fingerprint": k.Fingerprint, "paymentMode": k.PaymentMode, "status": k.Status,
			"name": k.Name, "keyVersion": k.KeyVersion,
			"lastUsedAt": fmtTimePtr(k.LastUsedAt), "revokedAt": fmtTimePtr(k.RevokedAt),
			"createdAt": k.CreatedAt.UTC().Format(time.RFC3339),
			"updatedAt": k.UpdatedAt.UTC().Format(time.RFC3339),
		})
	}
	return out
}

func maskKeyOne(k gateway.APIKey) map[string]any {
	return map[string]any{
		"id": k.ID, "merchantId": k.MerchantID, "keyPrefix": k.KeyPrefix,
		"fingerprint": k.Fingerprint, "paymentMode": k.PaymentMode, "status": k.Status,
		"name": k.Name, "keyVersion": k.KeyVersion,
		"lastUsedAt": fmtTimePtr(k.LastUsedAt), "revokedAt": fmtTimePtr(k.RevokedAt),
		"createdAt": k.CreatedAt.UTC().Format(time.RFC3339),
		"updatedAt": k.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

func issuanceDTOList(irs []credentials.IssuanceView) []map[string]any {
	out := make([]map[string]any, 0, len(irs))
	for _, ir := range irs {
		out = append(out, map[string]any{
			"id": ir.ID, "merchantId": ir.MerchantID, "paymentMode": ir.PaymentMode,
			"purpose": ir.Purpose, "status": ir.Status, "hasPendingClaim": ir.HasPendingClaim,
			"claimExpiresAt": fmtTimePtr(ir.ClaimExpiresAt), "authorizedAt": fmtTimePtr(ir.AuthorizedAt),
			"claimedAt": fmtTimePtr(ir.ClaimedAt), "expiresAt": fmtTimePtr(ir.ExpiresAt),
			"createdAt": ir.CreatedAt.UTC().Format(time.RFC3339),
		})
	}
	return out
}

func issuanceOneDTO(ir kyc.IssuanceRequest) map[string]any {
	return map[string]any{
		"id": ir.ID, "merchantId": ir.MerchantID, "paymentMode": ir.PaymentMode,
		"purpose": ir.Purpose, "status": ir.Status, "reason": ir.Reason,
		"authorizedAt": fmtTimePtr(ir.AuthorizedAt), "claimedAt": fmtTimePtr(ir.ClaimedAt),
		"expiresAt": fmtTimePtr(ir.ExpiresAt), "claimExpiresAt": fmtTimePtr(ir.ClaimExpiresAt),
		"createdAt": ir.CreatedAt.UTC().Format(time.RFC3339),
	}
}

func fmtTimePtr(t *time.Time) any {
	if t == nil {
		return nil
	}
	return t.UTC().Format(time.RFC3339)
}
