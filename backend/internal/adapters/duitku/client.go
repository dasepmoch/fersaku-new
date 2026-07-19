// Package duitku provides the Duitku QRIS payment adapter (ADR-0008, PROD-B10).
// Real is the production HTTP client for create/status inquiry.
// Secrets are never logged or returned.
package duitku

import (
	"bytes"
	"context"
	"crypto/md5"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

const (
	defaultSandboxBaseURL = "https://sandbox.duitku.com"
	defaultPaymentMethod  = "SP"
	defaultAccountScope   = "duitku-primary"
	pathInquiry           = "/webapi/api/merchant/v2/inquiry"
	pathTransactionStatus = "/webapi/api/merchant/transactionStatus"
)

// Real is the live Duitku HTTP client (QRIS payment only).
// APIKey must never be logged or returned.
type Real struct {
	MerchantCode  string
	APIKey        string // never log
	BaseURL       string // default sandbox https://sandbox.duitku.com
	CallbackURL   string
	ReturnURL     string
	PaymentMethod string // from DUITKU_QRIS_PAYMENT_METHOD, default SP
	AccountScope  string // default duitku-primary
	HTTPClient    *http.Client
	Timeout       time.Duration
	Log           ports.Logger
}

// NewReal builds a live Duitku adapter. merchantCode and apiKey must be non-empty.
func NewReal(merchantCode, apiKey, baseURL, callbackURL, returnURL, paymentMethod, accountScope string) (*Real, error) {
	merchantCode = strings.TrimSpace(merchantCode)
	apiKey = strings.TrimSpace(apiKey)
	if merchantCode == "" {
		return nil, fmt.Errorf("duitku: merchant code required for live adapter")
	}
	if apiKey == "" {
		return nil, fmt.Errorf("duitku: api key required for live adapter")
	}
	if strings.TrimSpace(baseURL) == "" {
		baseURL = defaultSandboxBaseURL
	}
	if strings.TrimSpace(paymentMethod) == "" {
		paymentMethod = defaultPaymentMethod
	}
	if strings.TrimSpace(accountScope) == "" {
		accountScope = defaultAccountScope
	}
	timeout := 15 * time.Second
	return &Real{
		MerchantCode:  merchantCode,
		APIKey:        apiKey,
		BaseURL:       strings.TrimRight(baseURL, "/"),
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
	// Cap product details to a reasonable merchant API length.
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

	ref := firstNonEmpty(resp.Reference, resp.MerchantOrderID, orderID)
	qrString := firstNonEmpty(resp.QRString, resp.QrString, resp.VaNumber)
	qrImage := firstNonEmpty(resp.QRUrl, resp.QrUrl, resp.PaymentURL, resp.QrImageURL)
	// Inquiry success means QR issued; payment is not settled yet → PENDING until callback/status.
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

// GetPayment looks up transaction status by merchantOrderId (or stored reference).
func (r *Real) GetPayment(ctx context.Context, providerRef string) (ports.ProviderPayment, error) {
	providerRef = strings.TrimSpace(providerRef)
	if providerRef == "" {
		return ports.ProviderPayment{}, &ports.ProviderError{Class: ports.ProviderRejected, Message: "empty provider ref"}
	}
	var resp statusResponse
	body := map[string]any{
		"merchantCode":    r.MerchantCode,
		"merchantOrderId": providerRef,
		"signature":       StatusSignature(r.MerchantCode, providerRef, r.APIKey),
	}
	if err := r.doJSON(ctx, http.MethodPost, pathTransactionStatus, body, &resp); err != nil {
		return ports.ProviderPayment{}, err
	}
	if err := classifyStatusBusiness(resp); err != nil {
		return ports.ProviderPayment{}, err
	}
	amount := resp.Amount
	if amount == 0 && resp.PaymentAmount > 0 {
		amount = resp.PaymentAmount
	}
	status := mapDuitkuStatus(resp.StatusCode, resp.StatusMessage)
	paidAt := parseTimePtr(firstNonEmpty(resp.SettlementDate, resp.PaymentDate))
	return ports.ProviderPayment{
		ProviderReference: firstNonEmpty(resp.Reference, resp.MerchantOrderID, providerRef),
		ExternalID:        firstNonEmpty(resp.MerchantOrderID, providerRef),
		AmountIDR:         amount,
		Currency:          "IDR",
		Status:            status,
		PaidAt:            paidAt,
	}, nil
}

// CancelPayment is best-effort: Duitku has no dedicated cancel for QRIS.
// Re-fetch status; if still pending, report CANCELLED class via REJECTED path only when
// provider explicitly canceled — otherwise return current status (caller decides).
func (r *Real) CancelPayment(ctx context.Context, providerRef string) (ports.ProviderPayment, error) {
	p, err := r.GetPayment(ctx, providerRef)
	if err != nil {
		return ports.ProviderPayment{}, err
	}
	// No cancel API: return live status so application can expire/void locally.
	return p, nil
}

// ExpirePayment re-fetches status (Duitku auto-expires; evidence-oriented like Xendit).
func (r *Real) ExpirePayment(ctx context.Context, providerRef string) (ports.ProviderPayment, error) {
	return r.GetPayment(ctx, providerRef)
}

// InquirySignature is MD5(merchantCode + merchantOrderId + paymentAmount + apiKey) lowercase hex.
func InquirySignature(merchantCode, merchantOrderID, paymentAmount, apiKey string) string {
	return md5Hex(merchantCode + merchantOrderID + paymentAmount + apiKey)
}

// StatusSignature is MD5(merchantCode + merchantOrderId + apiKey) lowercase hex.
func StatusSignature(merchantCode, merchantOrderID, apiKey string) string {
	return md5Hex(merchantCode + merchantOrderID + apiKey)
}

// CallbackSignature is MD5(merchantCode + amount + merchantOrderId + apiKey) lowercase hex.
// amount is the posted amount string (whole IDR, no decimals), same as the callback amount field.
func CallbackSignature(merchantCode, amount, merchantOrderID, apiKey string) string {
	return md5Hex(merchantCode + amount + merchantOrderID + apiKey)
}

// VerifyCallbackSignature constant-time compares provided signature to CallbackSignature.
// Returns false if any required field is empty or lengths of digests differ.
func VerifyCallbackSignature(merchantCode, amount, merchantOrderID, apiKey, provided string) bool {
	merchantCode = strings.TrimSpace(merchantCode)
	amount = strings.TrimSpace(amount)
	merchantOrderID = strings.TrimSpace(merchantOrderID)
	apiKey = strings.TrimSpace(apiKey)
	provided = strings.ToLower(strings.TrimSpace(provided))
	if merchantCode == "" || amount == "" || merchantOrderID == "" || apiKey == "" || provided == "" {
		return false
	}
	want := strings.ToLower(CallbackSignature(merchantCode, amount, merchantOrderID, apiKey))
	if len(want) != len(provided) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(want), []byte(provided)) == 1
}

// MerchantCodeEqual constant-time compares merchant codes via fixed-size digests
// (handles unequal lengths safely).
func MerchantCodeEqual(got, want string) bool {
	got = strings.TrimSpace(got)
	want = strings.TrimSpace(want)
	if want == "" {
		return false
	}
	// Fixed-size digests so ConstantTimeCompare always runs equal-length inputs.
	a := md5Hex(got)
	b := md5Hex(want)
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

// MapStatus maps Duitku status codes/messages to domain payment status (exported for tests).
func MapStatus(statusCode, statusMessage string) string {
	return mapDuitkuStatus(statusCode, statusMessage)
}

func md5Hex(s string) string {
	sum := md5.Sum([]byte(s))
	return hex.EncodeToString(sum[:])
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
	MerchantOrderID string `json:"merchantOrderId"`
	Reference       string `json:"reference"`
	Amount          int64  `json:"amount"`
	PaymentAmount   int64  `json:"paymentAmount"`
	StatusCode      string `json:"statusCode"`
	StatusMessage   string `json:"statusMessage"`
	SettlementDate  string `json:"settlementDate"`
	PaymentDate     string `json:"paymentDate"`
}

func classifyInquiryBusiness(resp inquiryResponse) error {
	code := strings.TrimSpace(resp.StatusCode)
	msg := strings.ToLower(strings.TrimSpace(resp.StatusMessage))
	// Empty statusCode with a reference/QR is treated as success (some sandbox shapes).
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
	// Non-00 business codes on create are rejections.
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
	// Known money statuses are success responses even when not paid.
	switch code {
	case "00", "01", "02":
		return nil
	}
	if strings.Contains(msg, "not found") || strings.Contains(msg, "tidak ditemukan") {
		return &ports.ProviderError{Class: ports.ProviderRejected, Message: "transaction not found", RequestSent: true}
	}
	// Other codes: still map if message implies a terminal state; else reject.
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
		// Process / pending
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

	// Message-based fallbacks when code is non-standard or empty.
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
		if code == "" {
			return "UNKNOWN"
		}
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
	req.Header.Set("Content-Type", "application/json")
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
		// Inspect body only for signature/auth hints; never surface raw body.
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
	return 15 * time.Second
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
