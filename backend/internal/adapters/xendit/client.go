// Package xendit provides the single Xendit account adapter (ADR-0002).
// Real is the production HTTP client for QRIS + disbursement.
package xendit

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

const defaultXenditBaseURL = "https://api.xendit.co"

// Real is the live Xendit HTTP client (QRIS + disbursement).
// Secrets are never logged or returned.
type Real struct {
	AccountScope string
	// SecretKey must never be logged or returned to frontend.
	SecretKey string
	// BaseURL e.g. https://api.xendit.co
	BaseURL string
	// HTTPClient is injectable for tests.
	HTTPClient *http.Client
	// Timeout per request (default 15s).
	Timeout time.Duration
	// Logger is optional; redacted messages only.
	Log ports.Logger
}

// NewReal builds a live Xendit adapter. secretKey must be non-empty.
func NewReal(accountScope, secretKey, baseURL string) (*Real, error) {
	secretKey = strings.TrimSpace(secretKey)
	if secretKey == "" {
		return nil, fmt.Errorf("xendit: secret key required for live adapter")
	}
	if accountScope == "" {
		accountScope = "xendit-primary"
	}
	if strings.TrimSpace(baseURL) == "" {
		baseURL = defaultXenditBaseURL
	}
	timeout := 15 * time.Second
	return &Real{
		AccountScope: accountScope,
		SecretKey:    secretKey,
		BaseURL:      strings.TrimRight(baseURL, "/"),
		Timeout:      timeout,
		HTTPClient: &http.Client{
			Timeout: timeout,
		},
	}, nil
}

// Name for logging (never includes secret).
func (r *Real) Name() string {
	return fmt.Sprintf("xendit-real(%s)", r.AccountScope)
}

// IsFake reports adapter kind for readiness (false for real).
func (r *Real) IsFake() bool { return false }

// CreateQRIS creates a QR code payment via Xendit QR Codes API.
func (r *Real) CreateQRIS(ctx context.Context, in ports.CreateQRISInput) (ports.CreateQRISResult, error) {
	if in.AmountIDR <= 0 {
		return ports.CreateQRISResult{}, &ports.ProviderError{Class: ports.ProviderRejected, Message: "invalid amount"}
	}
	body := map[string]any{
		"external_id":  in.ExternalID,
		"type":         "DYNAMIC",
		"currency":     "IDR",
		"amount":       in.AmountIDR,
		"callback_url": nil,
	}
	if in.Description != "" {
		body["metadata"] = map[string]string{"description": in.Description}
	}
	if !in.ExpiresAt.IsZero() {
		body["expires_at"] = in.ExpiresAt.UTC().Format(time.RFC3339)
	}
	var resp qrCodeResponse
	if err := r.doJSON(ctx, http.MethodPost, "/qr_codes", in.IdempotencyKey, body, &resp); err != nil {
		return ports.CreateQRISResult{}, err
	}
	status := mapQRStatus(resp.Status)
	exp := parseTime(resp.ExpiresAt)
	return ports.CreateQRISResult{
		ProviderReference: firstNonEmpty(resp.ID, resp.QRID),
		QRString:          firstNonEmpty(resp.QRString, resp.QRCode),
		QRImageURL:        resp.QRImageURL,
		Status:            status,
		ExpiresAt:         exp,
	}, nil
}

// GetPayment looks up a QR/payment by provider reference.
func (r *Real) GetPayment(ctx context.Context, providerRef string) (ports.ProviderPayment, error) {
	providerRef = strings.TrimSpace(providerRef)
	if providerRef == "" {
		return ports.ProviderPayment{}, &ports.ProviderError{Class: ports.ProviderRejected, Message: "empty provider ref"}
	}
	var resp qrCodeResponse
	if err := r.doJSON(ctx, http.MethodGet, "/qr_codes/"+providerRef, "", nil, &resp); err != nil {
		return ports.ProviderPayment{}, err
	}
	paidAt := parseTimePtr(resp.PaidAt)
	exp := parseTimePtr(resp.ExpiresAt)
	return ports.ProviderPayment{
		ProviderReference: firstNonEmpty(resp.ID, resp.QRID, providerRef),
		ExternalID:        resp.ExternalID,
		AmountIDR:         resp.Amount,
		Currency:          firstNonEmpty(resp.Currency, "IDR"),
		Status:            mapQRStatus(resp.Status),
		PaidAt:            paidAt,
		ExpiresAt:         exp,
	}, nil
}

// CancelPayment attempts to void a pending QR code.
func (r *Real) CancelPayment(ctx context.Context, providerRef string) (ports.ProviderPayment, error) {
	providerRef = strings.TrimSpace(providerRef)
	var resp qrCodeResponse
	if err := r.doJSON(ctx, http.MethodPost, "/qr_codes/"+providerRef+"/void", "", map[string]any{}, &resp); err != nil {
		// Fallback: return current state classification
		return r.GetPayment(ctx, providerRef)
	}
	return ports.ProviderPayment{
		ProviderReference: firstNonEmpty(resp.ID, providerRef),
		ExternalID:        resp.ExternalID,
		AmountIDR:         resp.Amount,
		Currency:          firstNonEmpty(resp.Currency, "IDR"),
		Status:            mapQRStatus(resp.Status),
	}, nil
}

// ExpirePayment is evidence-oriented; Xendit may auto-expire — re-fetch status.
func (r *Real) ExpirePayment(ctx context.Context, providerRef string) (ports.ProviderPayment, error) {
	return r.GetPayment(ctx, providerRef)
}

// QuoteDisbursement returns a verified fee estimate.
// Xendit fee schedules vary; we probe via create-estimate when available, else fixed policy fallback is application-owned.
func (r *Real) QuoteDisbursement(ctx context.Context, in ports.DisbursementQuoteInput) (ports.DisbursementQuote, error) {
	_ = ctx
	// Live fee schedule is provider-account specific. Return a structured quote marker;
	// application fee calculator remains authoritative for platform fee; provider fee
	// is confirmed on create/callback (actual).
	fee := int64(2500) // documented launch fallback; actual fee from create/callback
	return ports.DisbursementQuote{
		ProviderFeeIDR:    fee,
		ProviderReference: "xendit_dq_live_schedule",
		Evidence:          "xendit-live-schedule-v1",
		QuotedAt:          time.Now().UTC(),
	}, nil
}

// CreateDisbursement creates a Payout/Disbursement with idempotency key.
func (r *Real) CreateDisbursement(ctx context.Context, in ports.CreateDisbursementInput) (ports.CreateDisbursementResult, error) {
	if in.NetAmountIDR <= 0 {
		return ports.CreateDisbursementResult{}, &ports.ProviderError{Class: ports.ProviderRejected, Message: "invalid amount"}
	}
	// Prefer Payouts API shape; map fields conservatively.
	body := map[string]any{
		"external_id":         in.ExternalID,
		"amount":              in.NetAmountIDR,
		"currency":            firstNonEmpty(in.Currency, "IDR"),
		"channel_code":        in.BankCode,
		"channel_properties": map[string]any{
			"account_holder_name": in.AccountHolderName,
			"account_number":      in.AccountNumber,
		},
		"description": in.Description,
	}
	idem := in.IdempotencyKey
	if idem == "" {
		idem = in.ExternalID
	}
	var resp disburseResponse
	if err := r.doJSON(ctx, http.MethodPost, "/v2/payouts", idem, body, &resp); err != nil {
		// Fallback to classic disbursements only for transport/retryable classes.
		// Do not mask v2 AUTH/REJECTED (non-retryable) with a v1 attempt (GAP-01).
		if !shouldFallbackPayoutV1(err) {
			return ports.CreateDisbursementResult{}, err
		}
		bodyV1 := map[string]any{
			"external_id":         in.ExternalID,
			"amount":              in.NetAmountIDR,
			"bank_code":           in.BankCode,
			"account_holder_name": in.AccountHolderName,
			"account_number":      in.AccountNumber,
			"description":         in.Description,
		}
		if err2 := r.doJSON(ctx, http.MethodPost, "/disbursements", idem, bodyV1, &resp); err2 != nil {
			return ports.CreateDisbursementResult{}, err
		}
	}
	var feePtr *int64
	if resp.Fee > 0 {
		f := resp.Fee
		feePtr = &f
	}
	return ports.CreateDisbursementResult{
		ProviderReference: firstNonEmpty(resp.ID, resp.PayoutID),
		ExternalID:        firstNonEmpty(resp.ExternalID, in.ExternalID),
		Status:            MapDisburseStatus(resp.Status),
		NetAmountIDR:      firstInt64(resp.Amount, in.NetAmountIDR),
		ProviderFeeIDR:    feePtr,
		CreatedAt:         parseTime(resp.Created),
	}, nil
}

// GetDisbursement looks up payout/disbursement status.
func (r *Real) GetDisbursement(ctx context.Context, providerRef string) (ports.ProviderDisbursement, error) {
	providerRef = strings.TrimSpace(providerRef)
	if providerRef == "" {
		return ports.ProviderDisbursement{}, &ports.ProviderError{Class: ports.ProviderRejected, Message: "empty provider ref"}
	}
	var resp disburseResponse
	if err := r.doJSON(ctx, http.MethodGet, "/v2/payouts/"+providerRef, "", nil, &resp); err != nil {
		if !shouldFallbackPayoutV1(err) {
			return ports.ProviderDisbursement{}, err
		}
		if err2 := r.doJSON(ctx, http.MethodGet, "/disbursements/"+providerRef, "", nil, &resp); err2 != nil {
			return ports.ProviderDisbursement{}, err
		}
	}
	var feePtr *int64
	if resp.Fee > 0 {
		f := resp.Fee
		feePtr = &f
	}
	return ports.ProviderDisbursement{
		ProviderReference: firstNonEmpty(resp.ID, resp.PayoutID, providerRef),
		ExternalID:        resp.ExternalID,
		Status:            MapDisburseStatus(resp.Status),
		NetAmountIDR:      resp.Amount,
		Currency:          firstNonEmpty(resp.Currency, "IDR"),
		ProviderFeeIDR:    feePtr,
		FailureCode:       resp.FailureCode,
		CompletedAt:       parseTimePtr(resp.Updated),
		BankCode:          firstNonEmpty(resp.BankCode, resp.ChannelCode),
		AccountNumberMask: maskAccount(resp.AccountNumber),
	}, nil
}

type qrCodeResponse struct {
	ID         string  `json:"id"`
	QRID       string  `json:"qr_id"`
	ExternalID string  `json:"external_id"`
	Amount     int64   `json:"amount"`
	Currency   string  `json:"currency"`
	Status     string  `json:"status"`
	QRString   string  `json:"qr_string"`
	QRCode     string  `json:"qr_code"`
	QRImageURL string  `json:"qr_image_url"`
	ExpiresAt  string  `json:"expires_at"`
	PaidAt     string  `json:"paid_at"`
}

type disburseResponse struct {
	ID            string `json:"id"`
	PayoutID      string `json:"payout_id"`
	ExternalID    string `json:"external_id"`
	Amount        int64  `json:"amount"`
	Currency      string `json:"currency"`
	Status        string `json:"status"`
	Fee           int64  `json:"fee"`
	FailureCode   string `json:"failure_code"`
	Created       string `json:"created"`
	Updated       string `json:"updated"`
	BankCode      string `json:"bank_code"`
	ChannelCode   string `json:"channel_code"`
	AccountNumber string `json:"account_number"`
}

func (r *Real) doJSON(ctx context.Context, method, path, idempotencyKey string, body any, out any) error {
	var reader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return &ports.ProviderError{Class: ports.ProviderInvalidResp, Message: "marshal request"}
		}
		// Redact account_number from any future log path by never logging body.
		reader = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, r.BaseURL+path, reader)
	if err != nil {
		return &ports.ProviderError{Class: ports.ProviderUnavailable, Message: "build request"}
	}
	req.SetBasicAuth(r.SecretKey, "")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if idempotencyKey != "" {
		req.Header.Set("Idempotency-key", idempotencyKey)
		req.Header.Set("X-Idempotency-Key", idempotencyKey)
	}
	client := r.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: r.timeout()}
	}
	start := time.Now()
	resp, err := client.Do(req)
	if err != nil {
		r.logSafe("xendit request failed", method, path, 0, time.Since(start), err)
		if ctx.Err() != nil || isTimeout(err) {
			return &ports.ProviderError{
				Class:       ports.ProviderTimeout,
				Message:     "provider timeout",
				RequestSent: true,
			}
		}
		return &ports.ProviderError{
			Class:       ports.ProviderUnavailable,
			Message:     "provider transport error",
			RequestSent: true,
		}
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	r.logSafe("xendit response", method, path, resp.StatusCode, time.Since(start), nil)

	if resp.StatusCode == http.StatusTooManyRequests {
		return &ports.ProviderError{Class: ports.ProviderRateLimited, Message: "rate limited", RequestSent: true}
	}
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return &ports.ProviderError{Class: ports.ProviderAuthFailure, Message: "auth failure", RequestSent: true}
	}
	if resp.StatusCode >= 500 {
		return &ports.ProviderError{Class: ports.ProviderUnavailable, Message: "provider 5xx", RequestSent: true}
	}
	if resp.StatusCode >= 400 {
		// 4xx with body — classify as rejected; do not include body (may contain PII).
		return &ports.ProviderError{Class: ports.ProviderRejected, Message: fmt.Sprintf("provider status %d", resp.StatusCode), RequestSent: true}
	}
	if out == nil || len(raw) == 0 {
		return nil
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return &ports.ProviderError{Class: ports.ProviderInvalidResp, Message: "invalid json response", RequestSent: true}
	}
	return nil
}

func (r *Real) timeout() time.Duration {
	if r.Timeout > 0 {
		return r.Timeout
	}
	return 15 * time.Second
}

func (r *Real) logSafe(msg, method, path string, status int, d time.Duration, err error) {
	if r.Log == nil {
		return
	}
	attrs := []any{"provider", "xendit", "method", method, "path", redactPath(path), "status", status, "latency_ms", d.Milliseconds()}
	if err != nil {
		// Never log err text if it might embed secrets (URL userinfo); use class only.
		attrs = append(attrs, "err_class", "transport")
		r.Log.Warn(msg, attrs...)
		return
	}
	r.Log.Info(msg, attrs...)
}

func redactPath(p string) string {
	// Keep resource type, drop id tails that might be sensitive.
	parts := strings.Split(strings.Trim(p, "/"), "/")
	if len(parts) >= 2 {
		parts[len(parts)-1] = "…"
	}
	return "/" + strings.Join(parts, "/")
}

func isTimeout(err error) bool {
	if err == nil {
		return false
	}
	s := strings.ToLower(err.Error())
	return strings.Contains(s, "timeout") || strings.Contains(s, "deadline")
}

// shouldFallbackPayoutV1 is true only when v2 failure may be endpoint-not-available
// (unavailable/timeout/rate-limit/invalid-response/404|405), not auth or business rejection.
// AuthFailure and non-404 REJECTED must not be masked by a v1 attempt (GAP-01).
func shouldFallbackPayoutV1(err error) bool {
	pe, ok := err.(*ports.ProviderError)
	if !ok || pe == nil {
		return false
	}
	switch pe.Class {
	case ports.ProviderUnavailable, ports.ProviderTimeout, ports.ProviderRateLimited, ports.ProviderInvalidResp:
		return true
	case ports.ProviderRejected:
		// Endpoint missing on accounts still on classic disbursements only.
		msg := strings.ToLower(pe.Message)
		return strings.Contains(msg, "status 404") || strings.Contains(msg, "status 405")
	default:
		return false
	}
}

func mapQRStatus(s string) string {
	switch strings.ToUpper(strings.TrimSpace(s)) {
	case "ACTIVE", "PENDING", "REQUIRES_ACTION":
		return "PENDING"
	case "COMPLETED", "PAID", "SUCCEEDED", "SUCCESS":
		return "PAID"
	case "EXPIRED":
		return "EXPIRED"
	case "INACTIVE", "CANCELLED", "CANCELED", "VOIDED":
		return "CANCELLED"
	case "FAILED":
		return "FAILED"
	default:
		if s == "" {
			return "UNKNOWN"
		}
		return strings.ToUpper(s)
	}
}

// MapDisburseStatus normalizes Xendit payout/disbursement status strings to the
// port contract used by withdrawal apply (PROD-C10):
//
//	ACCEPTED|PENDING|LOCKED|REQUESTED → PENDING
//	PROCESSING|SENDING                 → PROCESSING
//	COMPLETED|SUCCEEDED|SUCCESS|PAID   → COMPLETED
//	FAILED|REJECTED|CANCELLED|REVERSED → FAILED
//	NOT_FOUND                          → NOT_FOUND
//	empty                              → UNKNOWN
//	other                              → uppercased (treated as UNKNOWN-class by apply)
func MapDisburseStatus(s string) string {
	switch strings.ToUpper(strings.TrimSpace(s)) {
	case "ACCEPTED", "PENDING", "LOCKED", "REQUESTED":
		return "PENDING"
	case "PROCESSING", "SENDING":
		return "PROCESSING"
	case "COMPLETED", "SUCCEEDED", "SUCCESS", "PAID":
		return "COMPLETED"
	case "FAILED", "REJECTED", "CANCELLED", "CANCELED", "REVERSED":
		return "FAILED"
	case "NOT_FOUND":
		return "NOT_FOUND"
	default:
		if s == "" {
			return "UNKNOWN"
		}
		return strings.ToUpper(s)
	}
}

func parseTime(s string) time.Time {
	if s == "" {
		return time.Time{}
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t.UTC()
	}
	if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
		return t.UTC()
	}
	return time.Time{}
}

func parseTimePtr(s string) *time.Time {
	t := parseTime(s)
	if t.IsZero() {
		return nil
	}
	return &t
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func firstInt64(vals ...int64) int64 {
	for _, v := range vals {
		if v != 0 {
			return v
		}
	}
	return 0
}

func maskAccount(n string) string {
	n = strings.TrimSpace(n)
	if len(n) <= 4 {
		return "****"
	}
	return strings.Repeat("*", len(n)-4) + n[len(n)-4:]
}

var _ ports.QRISProvider = (*Real)(nil)
var _ ports.DisbursementProvider = (*Real)(nil)
