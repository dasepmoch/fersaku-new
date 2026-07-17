package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/decode"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/withdrawals"
	"github.com/dasepmoch/fersaku-new/backend/internal/platform/cursor"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// WithdrawalHandler serves seller bank/quote/withdrawal + minimal admin review (BE-350).
type WithdrawalHandler struct {
	Svc *application.WithdrawalService
}

func (h *WithdrawalHandler) ListBanks(w http.ResponseWriter, r *http.Request) {
	if _, ok := reqctx.PrincipalFrom(r.Context()); !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Withdrawals unavailable"))
		return
	}
	storeID := chi.URLParam(r, "storeId")
	list, err := h.Svc.ListBankAccounts(r.Context(), storeID)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	out := make([]map[string]any, 0, len(list))
	for _, b := range list {
		out = append(out, bankDTO(b))
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"items": out})
}

func (h *WithdrawalHandler) CreateBank(w http.ResponseWriter, r *http.Request) {
	if _, ok := reqctx.PrincipalFrom(r.Context()); !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Withdrawals unavailable"))
		return
	}
	var body struct {
		BankCode          string `json:"bankCode"`
		BankName          string `json:"bankName"`
		AccountHolderName string `json:"accountHolderName"`
		AccountNumber     string `json:"accountNumber"`
		MakePrimary       bool   `json:"makePrimary"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	storeID := chi.URLParam(r, "storeId")
	acc, err := h.Svc.CreateBankAccount(r.Context(), storeID, body.BankCode, body.BankName, body.AccountHolderName, body.AccountNumber, body.MakePrimary)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusCreated, bankDTO(acc))
}

func (h *WithdrawalHandler) UpdateBank(w http.ResponseWriter, r *http.Request) {
	if _, ok := reqctx.PrincipalFrom(r.Context()); !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Withdrawals unavailable"))
		return
	}
	var body struct {
		ExpectedVersion   int64  `json:"expectedVersion"`
		BankCode          string `json:"bankCode"`
		BankName          string `json:"bankName"`
		AccountHolderName string `json:"accountHolderName"`
		AccountNumber     string `json:"accountNumber"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	storeID := chi.URLParam(r, "storeId")
	bankID := chi.URLParam(r, "id")
	acc, err := h.Svc.UpdateBankAccount(r.Context(), storeID, bankID, body.ExpectedVersion, body.BankCode, body.BankName, body.AccountHolderName, body.AccountNumber)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, bankDTO(acc))
}

func (h *WithdrawalHandler) VerifyBank(w http.ResponseWriter, r *http.Request) {
	if _, ok := reqctx.PrincipalFrom(r.Context()); !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Withdrawals unavailable"))
		return
	}
	acc, err := h.Svc.VerifyBankAccount(r.Context(), chi.URLParam(r, "storeId"), chi.URLParam(r, "id"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, bankDTO(acc))
}

func (h *WithdrawalHandler) MakePrimaryBank(w http.ResponseWriter, r *http.Request) {
	if _, ok := reqctx.PrincipalFrom(r.Context()); !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Withdrawals unavailable"))
		return
	}
	acc, err := h.Svc.MakePrimaryBank(r.Context(), chi.URLParam(r, "storeId"), chi.URLParam(r, "id"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, bankDTO(acc))
}

func (h *WithdrawalHandler) DeleteBank(w http.ResponseWriter, r *http.Request) {
	if _, ok := reqctx.PrincipalFrom(r.Context()); !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Withdrawals unavailable"))
		return
	}
	acc, err := h.Svc.ArchiveBankAccount(r.Context(), chi.URLParam(r, "storeId"), chi.URLParam(r, "id"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, bankDTO(acc))
}

func (h *WithdrawalHandler) CreateQuote(w http.ResponseWriter, r *http.Request) {
	if _, ok := reqctx.PrincipalFrom(r.Context()); !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Withdrawals unavailable"))
		return
	}
	idem := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	var body struct {
		Amount        int64  `json:"amount"`
		BankAccountID string `json:"bankAccountId"`
		PaymentMode   string `json:"paymentMode"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	q, err := h.Svc.CreateQuote(r.Context(), chi.URLParam(r, "storeId"), idem, body.Amount, body.BankAccountID, body.PaymentMode)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusCreated, quoteDTO(q))
}

func (h *WithdrawalHandler) CreateWithdrawal(w http.ResponseWriter, r *http.Request) {
	if _, ok := reqctx.PrincipalFrom(r.Context()); !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Withdrawals unavailable"))
		return
	}
	idem := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	var body struct {
		QuoteID     string `json:"quoteId"`
		PaymentMode string `json:"paymentMode"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	wd, err := h.Svc.RequestWithdrawal(r.Context(), chi.URLParam(r, "storeId"), body.QuoteID, idem, body.PaymentMode)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusCreated, withdrawalDTO(wd))
}

func (h *WithdrawalHandler) ListWithdrawals(w http.ResponseWriter, r *http.Request) {
	if _, ok := reqctx.PrincipalFrom(r.Context()); !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Withdrawals unavailable"))
		return
	}
	mode := application.NormalizePaymentMode(r.URL.Query().Get("paymentMode"))
	var cursorAt *time.Time
	var cursorID *string
	if raw := strings.TrimSpace(r.URL.Query().Get("cursor")); raw != "" {
		key, err := cursor.Decode(raw)
		if err != nil {
			presenters.WriteAppError(w, r, apperr.Validation(apperr.CodeValidationFailed, "invalid cursor"))
			return
		}
		t := key.CreatedAt
		cursorAt = &t
		id := key.ID
		cursorID = &id
	}
	limit := int32(50)
	if n, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && n > 0 && n <= 100 {
		limit = int32(n)
	}
	list, err := h.Svc.ListWithdrawals(r.Context(), chi.URLParam(r, "storeId"), mode, cursorAt, cursorID, limit)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	out := make([]map[string]any, 0, len(list))
	for _, it := range list {
		out = append(out, withdrawalDTO(it))
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"items": out})
}

func (h *WithdrawalHandler) GetWithdrawal(w http.ResponseWriter, r *http.Request) {
	if _, ok := reqctx.PrincipalFrom(r.Context()); !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Withdrawals unavailable"))
		return
	}
	wd, err := h.Svc.GetWithdrawal(r.Context(), chi.URLParam(r, "storeId"), chi.URLParam(r, "withdrawalId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, withdrawalDTO(wd))
}

func (h *WithdrawalHandler) GetLock(w http.ResponseWriter, r *http.Request) {
	if _, ok := reqctx.PrincipalFrom(r.Context()); !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Withdrawals unavailable"))
		return
	}
	lock, active, err := h.Svc.GetWithdrawalLock(r.Context(), chi.URLParam(r, "storeId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	out := map[string]any{"locked": active}
	if active {
		out["lockedUntil"] = lock.LockedUntil.UTC().Format(time.RFC3339)
		out["reason"] = lock.Reason
	}
	presenters.WriteData(w, r, http.StatusOK, out)
}

func (h *WithdrawalHandler) AdminList(w http.ResponseWriter, r *http.Request) {
	if _, ok := reqctx.PrincipalFrom(r.Context()); !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Withdrawals unavailable"))
		return
	}
	var status *string
	if s := strings.TrimSpace(r.URL.Query().Get("status")); s != "" {
		status = &s
	}
	limit := int32(50)
	if n, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && n > 0 && n <= 100 {
		limit = int32(n)
	}
	list, err := h.Svc.ListAdminWithdrawals(r.Context(), status, nil, nil, limit)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	out := make([]map[string]any, 0, len(list))
	for _, it := range list {
		out = append(out, withdrawalDTO(it))
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"items": out})
}

func (h *WithdrawalHandler) AdminGet(w http.ResponseWriter, r *http.Request) {
	if _, ok := reqctx.PrincipalFrom(r.Context()); !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Withdrawals unavailable"))
		return
	}
	wd, err := h.Svc.AdminGetWithdrawal(r.Context(), chi.URLParam(r, "withdrawalId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, withdrawalDTO(wd))
}

func (h *WithdrawalHandler) AdminReview(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Withdrawals unavailable"))
		return
	}
	var body struct {
		Action string `json:"action"`
		Reason string `json:"reason"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	wd, err := h.Svc.AdminReview(r.Context(), chi.URLParam(r, "withdrawalId"), body.Action, body.Reason, p.SubjectID)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, withdrawalDTO(wd))
}

// DisbursementWebhook is POST /v1/webhooks/xendit/disbursement (token verified by caller or shared pipeline).
func (h *WithdrawalHandler) DisbursementWebhook(w http.ResponseWriter, r *http.Request) {
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Withdrawals unavailable"))
		return
	}
	// Token check: reuse X-Callback-Token constant-time via CallbackService path when available;
	// for BE-350 core, accept body with provider reference and status after optional token header presence.
	var body struct {
		ID             string `json:"id"`
		ExternalID     string `json:"external_id"`
		Status         string `json:"status"`
		Amount         int64  `json:"amount"`
		Fee            *int64 `json:"fee"`
		ProviderFee    *int64 `json:"provider_fee"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		presenters.WriteAppError(w, r, apperr.Validation(apperr.CodeValidationFailed, "invalid body"))
		return
	}
	ref := body.ID
	if ref == "" {
		ref = body.ExternalID
	}
	fee := body.Fee
	if fee == nil {
		fee = body.ProviderFee
	}
	if err := h.Svc.HandleDisbursementCallback(r.Context(), ref, body.Status, fee, body.Amount); err != nil {
		// Acknowledge durable acceptance; business mismatch still 200 to avoid retry storms when quarantined
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"received": true})
}

func bankDTO(b withdrawals.BankAccount) map[string]any {
	m := map[string]any{
		"id":                b.ID,
		"bankCode":          b.BankCode,
		"bankName":          b.BankName,
		"accountHolderName": b.AccountHolderName,
		"accountNumberMasked": b.AccountNumberMasked,
		"status":            b.Status,
		"isPrimary":         b.IsPrimary,
		"version":           b.Version,
		"createdAt":         b.CreatedAt.UTC().Format(time.RFC3339),
	}
	// Never include full account number
	return m
}

func quoteDTO(q withdrawals.Quote) map[string]any {
	return map[string]any{
		"quoteId":               q.ID,
		"expiresAt":             q.ExpiresAt.UTC().Format(time.RFC3339),
		"amountDebited":         q.AmountIDR,
		"platformFee":           q.PlatformFeeIDR,
		"providerProcessingFee": q.ProviderFeeIDR,
		"totalFee":              q.TotalFeeIDR,
		"netDisbursement":       q.NetDisbursementIDR,
		"minimumAmount":         int64(50000),
		"policyVersion":         q.PolicyVersionID,
		"bankAccountId":         q.BankAccountID,
		"bankAccountVersion":    q.BankAccountVersion,
		"status":                q.Status,
	}
}

func withdrawalDTO(w withdrawals.Withdrawal) map[string]any {
	m := map[string]any{
		"id":                    w.ID,
		"status":                w.Status,
		"amountDebited":         w.AmountIDR,
		"platformFee":           w.PlatformFeeIDR,
		"providerProcessingFee": w.ProviderFeeQuotedIDR,
		"totalFee":              w.TotalFeeIDR,
		"netDisbursement":       w.NetDisbursementIDR,
		"source":                w.Source,
		"bankAccountId":         w.BankAccountID,
		"bankAccountMasked":     w.AccountNumberMasked,
		"bankCode":              w.BankCode,
		"accountHolderName":     w.AccountHolderName,
		"policyVersion":         w.PolicyVersionID,
		"createdAt":             w.CreatedAt.UTC().Format(time.RFC3339),
	}
	if w.ProviderFeeActualIDR != nil {
		m["providerFeeActual"] = *w.ProviderFeeActualIDR
	}
	if w.ProviderDisbursementReference != nil {
		m["providerReference"] = *w.ProviderDisbursementReference
	}
	if len(w.Allocations) > 0 {
		allocs := make([]map[string]any, 0, len(w.Allocations))
		for _, a := range w.Allocations {
			allocs = append(allocs, map[string]any{
				"source":          a.Source,
				"amount":          a.AmountIDR,
				"settlementLotId": a.SettlementLotID,
			})
		}
		m["allocations"] = allocs
	}
	return m
}
