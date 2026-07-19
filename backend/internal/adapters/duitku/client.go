// Package duitku provides the Duitku QRIS payment adapter (ADR-0008, PROD-B10, GAP-01).
// Real is the production HTTP client for create/status inquiry.
// Secrets are never logged or returned.
//
// Contract freeze: DocVerifiedURL / DocVerifiedDate in contract.go.
// Signatures: HMAC-SHA256 lowercase hex (MD5 obsolete).
// Status lookup uses merchantOrderId (merchant external id), not provider reference.
package duitku

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// Real is the live Duitku HTTP client (QRIS payment only).
// APIKey must never be logged or returned.
//
// GetPayment / CancelPayment / ExpirePayment take merchantOrderId (ports.ExternalID /
// payment_intents.external_id), NOT the provider reference returned at create time.
type Real struct {
	MerchantCode  string
	APIKey        string // never log
	BaseURL       string // passport (production) or sandbox; never default sandbox on production env
	Env           string // sandbox|production
	CallbackURL   string
	ReturnURL     string
	PaymentMethod string // from DUITKU_QRIS_PAYMENT_METHOD, default SP
	AccountScope  string // default duitku-primary
	HTTPClient    *http.Client
	Timeout       time.Duration
	Log           ports.Logger
}

// NewReal builds a live Duitku adapter. merchantCode and apiKey must be non-empty.
// env is sandbox|production (empty → sandbox for local only when baseURL empty).
// baseURL empty selects documented default for env; production never defaults to sandbox.
func NewReal(merchantCode, apiKey, env, baseURL, callbackURL, returnURL, paymentMethod, accountScope string) (*Real, error) {
	merchantCode = strings.TrimSpace(merchantCode)
	apiKey = strings.TrimSpace(apiKey)
	if merchantCode == "" {
		return nil, fmt.Errorf("duitku: merchant code required for live adapter")
	}
	if apiKey == "" {
		return nil, fmt.Errorf("duitku: api key required for live adapter")
	}
	env = strings.ToLower(strings.TrimSpace(env))
	if env != "" && env != EnvSandbox && env != EnvProduction {
		return nil, fmt.Errorf("duitku: env must be sandbox|production, got %q", env)
	}
	resolved, err := ResolveBaseURL(env, baseURL)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(paymentMethod) == "" {
		paymentMethod = defaultPaymentMethod
	}
	if strings.TrimSpace(accountScope) == "" {
		accountScope = defaultAccountScope
	}
	timeout := time.Duration(defaultHTTPTimeout) * time.Second
	return &Real{
		MerchantCode:  merchantCode,
		APIKey:        apiKey,
		BaseURL:       resolved,
		Env:           env,
		CallbackURL:   strings.TrimSpace(callbackURL),
		ReturnURL:     strings.TrimSpace(returnURL),
		PaymentMethod: paymentMethod,
		AccountScope:  accountScope,
		Timeout:       timeout,
		HTTPClient: &http.Client{
			Timeout: timeout,
		},
	}, nil
}

// Name for logging (never includes api key).
func (r *Real) Name() string {
	return fmt.Sprintf("duitku-real(%s)", r.AccountScope)
}

// IsFake reports adapter kind for readiness (false for real).
func (r *Real) IsFake() bool { return false }

// CreateQRIS creates a QRIS payment via Duitku merchant v2 inquiry.
// ExternalID is sent as merchantOrderId and must be used for later status lookup.
// ProviderReference in the result is Duitku's reference (audit only).
func (r *Real) CreateQRIS(ctx context.Context, in ports.CreateQRISInput) (ports.CreateQRISResult, error) {
	if in.AmountIDR <= 0 {
		return ports.CreateQRISResult{}, &ports.ProviderError{Class: ports.ProviderRejected, Message: "invalid amount"}
	}
	orderID := strings.TrimSpace(in.ExternalID)
	if orderID == "" {
		orderID = strings.TrimSpace(in.IdempotencyKey)
	}
	if orderID == "" {
		return ports.CreateQRISResult{}, &ports.ProviderError{Class: ports.ProviderRejected, Message: "external id required"}
	}
	amountStr := strconv.FormatInt(in.AmountIDR, 10)
	productDetails := strings.TrimSpace(in.Description)
	if productDetails == "" {
		productDetails = "QRIS payment"
	}
	if len(productDetails) > 255 {
		productDetails = productDetails[:255]
	}
	expiryMinutes := expiryPeriodMinutes(in.ExpiresAt)
	body := map[string]any{
		"merchantCode":    r.MerchantCode,
		"paymentAmount":   in.AmountIDR,
		"merchantOrderId": orderID,
		"productDetails":  productDetails,
		"paymentMethod":   r.PaymentMethod,
		"expiryPeriod":    expiryMinutes,
		"signature":       InquirySignature(r.MerchantCode, orderID, amountStr, r.APIKey),
	}
	if r.CallbackURL != "" {
		body["callbackUrl"] = r.CallbackURL
	}
	if r.ReturnURL != "" {
		body["returnUrl"] = r.ReturnURL
	}
	if email := metadataValue(in.Metadata, "email"); email != "" {
		body["email"] = email
	}

	var resp inquiryResponse
	if err := r.doJSON(ctx, http.MethodPost, pathInquiry, body, &resp); err != nil {
		return ports.CreateQRISResult{}, err
	}
	if err := classifyInquiryBusiness(resp); err != nil {
		return ports.CreateQRISResult{}, err
	}

	// reference = Duitku provider id only; never substitute merchantOrderId as provider ref.
	ref := strings.TrimSpace(resp.Reference)
	if ref == "" {
		return ports.CreateQRISResult{}, &ports.ProviderError{
			Class:       ports.ProviderInvalidResp,
			Message:     "missing provider reference",
			RequestSent: true,
		}
	}
	qrString := firstNonEmpty(resp.QRString, resp.QrString, resp.VaNumber)
	qrImage := firstNonEmpty(resp.QRUrl, resp.QrUrl, resp.PaymentURL, resp.QrImageURL)
	status := "PENDING"
	exp := in.ExpiresAt
	if exp.IsZero() && expiryMinutes > 0 {
		exp = time.Now().UTC().Add(time.Duration(expiryMinutes) * time.Minute)
	}
	return ports.CreateQRISResult{
		ProviderReference: ref,
		QRString:          qrString,
		QRImageURL:        qrImage,
		Status:            status,
		ExpiresAt:         exp,
	}, nil
}

// GetPayment looks up transaction status by merchantOrderId (merchant external id).
// Do not pass provider reference (Duitku reference) here — the API keys on merchantOrderId.
func (r *Real) GetPayment(ctx context.Context, merchantOrderID string) (ports.ProviderPayment, error) {
	merchantOrderID = strings.TrimSpace(merchantOrderID)
	if merchantOrderID == "" {
		return ports.ProviderPayment{}, &ports.ProviderError{Class: ports.ProviderRejected, Message: "empty merchant order id"}
	}
	var resp statusResponse
	body := map[string]any{
		"merchantCode":    r.MerchantCode,
		"merchantOrderId": merchantOrderID,
		"signature":       StatusSignature(r.MerchantCode, merchantOrderID, r.APIKey),
	}
	if err := r.doJSON(ctx, http.MethodPost, pathTransactionStatus, body, &resp); err != nil {
		return ports.ProviderPayment{}, err
	}
	if err := classifyStatusBusiness(resp); err != nil {
		return ports.ProviderPayment{}, err
	}
	amount := int64(resp.Amount)
	if amount == 0 && int64(resp.PaymentAmount) > 0 {
		amount = int64(resp.PaymentAmount)
	}
	status := mapDuitkuStatus(resp.StatusCode, resp.StatusMessage)
	paidAt := parseTimePtr(firstNonEmpty(resp.SettlementDate, resp.PaymentDate))
	return ports.ProviderPayment{
		ProviderReference: firstNonEmpty(resp.Reference, ""),
		ExternalID:        firstNonEmpty(resp.MerchantOrderID, merchantOrderID),
		AmountIDR:         amount,
		Currency:          "IDR",
		Status:            status,
		PaidAt:            paidAt,
	}, nil
}

// CancelPayment is best-effort: Duitku has no dedicated cancel for QRIS.
// merchantOrderID is the merchant external id (same as GetPayment).
func (r *Real) CancelPayment(ctx context.Context, merchantOrderID string) (ports.ProviderPayment, error) {
	p, err := r.GetPayment(ctx, merchantOrderID)
	if err != nil {
		return ports.ProviderPayment{}, err
	}
	return p, nil
}

// ExpirePayment re-fetches status (Duitku auto-expires).
// merchantOrderID is the merchant external id (same as GetPayment).
func (r *Real) ExpirePayment(ctx context.Context, merchantOrderID string) (ports.ProviderPayment, error) {
	return r.GetPayment(ctx, merchantOrderID)
}

// MapStatus maps Duitku status codes/messages to domain payment status (exported for tests).
func MapStatus(statusCode, statusMessage string) string {
	return mapDuitkuStatus(statusCode, statusMessage)
}

type inquiryResponse struct {
	MerchantCode    string `json:"merchantCode"`
	Reference       string `json:"reference"`
	MerchantOrderID string `json:"merchantOrderId"`
	PaymentURL      string `json:"paymentUrl"`
	VaNumber        string `json:"vaNumber"`
	Amount          string `json:"amount"`
	StatusCode      string `json:"statusCode"`
	StatusMessage   string `json:"statusMessage"`
	QRString        string `json:"qrString"`
	QrString        string `json:"qr_string"`
	QRUrl           string `json:"qrUrl"`
	QrUrl           string `json:"qr_url"`
	QrImageURL      string `json:"qrImageUrl"`
}

type statusResponse struct {
	MerchantOrderID string      `json:"merchantOrderId"`
	Reference       string      `json:"reference"`
	Amount          flexInt64   `json:"amount"`
	PaymentAmount   flexInt64   `json:"paymentAmount"`
	StatusCode      string      `json:"statusCode"`
	StatusMessage   string      `json:"statusMessage"`
	SettlementDate  string      `json:"settlementDate"`
	PaymentDate     string      `json:"paymentDate"`
}

// flexInt64 accepts JSON number or whole-IDR string (provider status docs use both shapes).
type flexInt64 int64

func (f *flexInt64) UnmarshalJSON(b []byte) error {
	s := strings.TrimSpace(string(b))
	if s == "" || s == "null" {
		*f = 0
		return nil
	}
	if len(s) >= 2 && s[0] == '"' && s[len(s)-1] == '"' {
		s = s[1 : len(s)-1]
	}
	if s == "" {
		*f = 0
		return nil
	}
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return err
	}
	*f = flexInt64(n)
	return nil
}

func classifyInquiryBusiness(resp inquiryResponse) error {
	code := strings.TrimSpace(resp.StatusCode)
	msg := strings.ToLower(strings.TrimSpace(resp.StatusMessage))
	if code == "" && (resp.Reference != "" || resp.QRString != "" || resp.QrString != "" || resp.PaymentURL != "") {
		return nil
	}
	if code == "00" {
		return nil
	}
	if code == "" && msg == "" {
		return &ports.ProviderError{Class: ports.ProviderInvalidResp, Message: "empty inquiry response", RequestSent: true}
	}
	if isAuthMessage(msg) || code == "01" && strings.Contains(msg, "signature") {
		return &ports.ProviderError{Class: ports.ProviderAuthFailure, Message: "auth or signature failure", RequestSent: true}
	}
	if code != "" && code != "00" {
		return &ports.ProviderError{
			Class:       ports.ProviderRejected,
			Message:     fmt.Sprintf("duitku statusCode %s", code),
			RequestSent: true,
		}
	}
	return nil
}

func classifyStatusBusiness(resp statusResponse) error {
	code := strings.TrimSpace(resp.StatusCode)
	msg := strings.ToLower(strings.TrimSpace(resp.StatusMessage))
	if code == "" && msg == "" {
		return &ports.ProviderError{Class: ports.ProviderInvalidResp, Message: "empty status response", RequestSent: true}
	}
	if isAuthMessage(msg) {
		return &ports.ProviderError{Class: ports.ProviderAuthFailure, Message: "auth or signature failure", RequestSent: true}
	}
	switch code {
	case "00", "01", "02":
		return nil
	}
	if strings.Contains(msg, "not found") || strings.Contains(msg, "tidak ditemukan") {
		return &ports.ProviderError{Class: ports.ProviderRejected, Message: "transaction not found", RequestSent: true}
	}
	if mapDuitkuStatus(code, resp.StatusMessage) != "UNKNOWN" {
		return nil
	}
	if code != "" {
		return &ports.ProviderError{
			Class:       ports.ProviderRejected,
			Message:     fmt.Sprintf("duitku statusCode %s", code),
			RequestSent: true,
		}
	}
	return nil
}

func isAuthMessage(msg string) bool {
	return strings.Contains(msg, "signature") ||
		strings.Contains(msg, "unauthorized") ||
		strings.Contains(msg, "invalid merchant") ||
		strings.Contains(msg, "api key") ||
		strings.Contains(msg, "apikey")
}

func mapDuitkuStatus(statusCode, statusMessage string) string {
	code := strings.TrimSpace(statusCode)
	msg := strings.ToLower(strings.TrimSpace(statusMessage))

	switch code {
	case "00":
		return "PAID"
	case "01":
		if strings.Contains(msg, "cancel") || strings.Contains(msg, "fail") {
			return "FAILED"
		}
		return "PENDING"
	case "02":
		if strings.Contains(msg, "cancel") {
			return "CANCELLED"
		}
		return "FAILED"
	}

	switch {
	case strings.Contains(msg, "success") || strings.Contains(msg, "paid") || strings.Contains(msg, "berhasil"):
		return "PAID"
	case strings.Contains(msg, "expired") || strings.Contains(msg, "kadaluarsa") || strings.Contains(msg, "expire"):
		return "EXPIRED"
	case strings.Contains(msg, "cancel") || strings.Contains(msg, "canceled") || strings.Contains(msg, "cancelled"):
		return "CANCELLED"
	case strings.Contains(msg, "fail") || strings.Contains(msg, "gagal") || strings.Contains(msg, "reject"):
		return "FAILED"
	case strings.Contains(msg, "process") || strings.Contains(msg, "pending") || strings.Contains(msg, "waiting"):
		return "PENDING"
	case code == "" && msg == "":
		return "UNKNOWN"
	default:
		return "UNKNOWN"
	}
}

func (r *Real) doJSON(ctx context.Context, method, path string, body any, out any) error {
	var reader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return &ports.ProviderError{Class: ports.ProviderInvalidResp, Message: "marshal request"}
		}
		// Never log body (contains signature derived from api key material).
		reader = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, r.BaseURL+path, reader)
	if err != nil {
		return &ports.ProviderError{Class: ports.ProviderUnavailable, Message: "build request"}
	}
	req.Header.Set("Content-Type", ContentTypeJSON)
	req.Header.Set("Accept", "application/json")

	client := r.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: r.timeout()}
	}
	start := time.Now()
	resp, err := client.Do(req)
	if err != nil {
		r.logSafe("duitku request failed", method, path, 0, time.Since(start), err)
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
	r.logSafe("duitku response", method, path, resp.StatusCode, time.Since(start), nil)

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
		if looksLikeAuthBody(raw) {
			return &ports.ProviderError{Class: ports.ProviderAuthFailure, Message: "auth or signature failure", RequestSent: true}
		}
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

func looksLikeAuthBody(raw []byte) bool {
	s := strings.ToLower(string(raw))
	return strings.Contains(s, "signature") ||
		strings.Contains(s, "unauthorized") ||
		strings.Contains(s, "invalid merchant") ||
		strings.Contains(s, "api key")
}

func (r *Real) timeout() time.Duration {
	if r.Timeout > 0 {
		return r.Timeout
	}
	return time.Duration(defaultHTTPTimeout) * time.Second
}

func (r *Real) logSafe(msg, method, path string, status int, d time.Duration, err error) {
	if r.Log == nil {
		return
	}
	attrs := []any{"provider", "duitku", "method", method, "path", path, "status", status, "latency_ms", d.Milliseconds()}
	if err != nil {
		attrs = append(attrs, "err_class", "transport")
		r.Log.Warn(msg, attrs...)
		return
	}
	r.Log.Info(msg, attrs...)
}

func isTimeout(err error) bool {
	if err == nil {
		return false
	}
	s := strings.ToLower(err.Error())
	return strings.Contains(s, "timeout") || strings.Contains(s, "deadline")
}

func expiryPeriodMinutes(expiresAt time.Time) int {
	if expiresAt.IsZero() {
		return 60
	}
	mins := int(time.Until(expiresAt).Minutes())
	if mins < 1 {
		return 1
	}
	if mins > 1440 {
		return 1440
	}
	return mins
}

func metadataValue(m map[string]string, key string) string {
	if m == nil {
		return ""
	}
	return strings.TrimSpace(m[key])
}

func parseTime(s string) time.Time {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}
	}
	layouts := []string{
		time.RFC3339,
		time.RFC3339Nano,
		"2006-01-02 15:04:05",
		"2006-01-02",
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UTC()
		}
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

var _ ports.QRISProvider = (*Real)(nil)
