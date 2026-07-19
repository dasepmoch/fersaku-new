package payments

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
)

// ParseDuitkuEnvelope normalizes Duitku payment callback bodies (JSON or form-urlencoded).
// Does not trust account_scope or payment_mode from body.
// Signature verification is performed by the application layer with the configured API key.
func ParseDuitkuEnvelope(body []byte) (NormalizedCallback, error) {
	if len(body) == 0 {
		return NormalizedCallback{}, fmt.Errorf("empty body")
	}
	fields, err := parseDuitkuFields(body)
	if err != nil {
		return NormalizedCallback{}, err
	}
	return normalizeDuitkuFields(fields)
}

// DuitkuCallbackFields are raw callback fields needed for signature verification.
type DuitkuCallbackFields struct {
	MerchantCode    string
	Amount          string // original amount string used in signature
	MerchantOrderID string
	Signature       string
	Reference       string
	ResultCode      string
	PaymentCode     string
	ProductDetail   string
	SettlementDate  string
	IssuerCode      string
	Raw             map[string]string
}

// ParseDuitkuCallbackFields extracts signature-related fields from JSON or form body.
func ParseDuitkuCallbackFields(body []byte) (DuitkuCallbackFields, error) {
	if len(body) == 0 {
		return DuitkuCallbackFields{}, fmt.Errorf("empty body")
	}
	raw, err := parseDuitkuFields(body)
	if err != nil {
		return DuitkuCallbackFields{}, err
	}
	amount := firstMapString(raw, "amount", "paymentAmount", "payment_amount")
	return DuitkuCallbackFields{
		MerchantCode:    firstMapString(raw, "merchantCode", "merchant_code"),
		Amount:          amount,
		MerchantOrderID: firstMapString(raw, "merchantOrderId", "merchant_order_id"),
		Signature:       firstMapString(raw, "signature"),
		Reference:       firstMapString(raw, "reference"),
		ResultCode:      firstMapString(raw, "resultCode", "result_code", "statusCode", "status_code"),
		PaymentCode:     firstMapString(raw, "paymentCode", "payment_code", "paymentMethod", "payment_method"),
		ProductDetail:   firstMapString(raw, "productDetail", "productDetails", "product_detail", "product_details"),
		SettlementDate:  firstMapString(raw, "settlementDate", "settlement_date"),
		IssuerCode:      firstMapString(raw, "issuerCode", "issuer_code"),
		Raw:             raw,
	}, nil
}

func parseDuitkuFields(body []byte) (map[string]string, error) {
	trim := strings.TrimSpace(string(body))
	if trim == "" {
		return nil, fmt.Errorf("empty body")
	}
	// JSON object
	if strings.HasPrefix(trim, "{") {
		var raw map[string]any
		if err := json.Unmarshal([]byte(trim), &raw); err != nil {
			return nil, fmt.Errorf("malformed json: %w", err)
		}
		out := make(map[string]string, len(raw))
		for k, v := range raw {
			if v == nil {
				continue
			}
			switch t := v.(type) {
			case string:
				out[k] = strings.TrimSpace(t)
			case float64:
				// Whole IDR amounts as JSON numbers → integer string (no decimals).
				if t == float64(int64(t)) {
					out[k] = fmt.Sprintf("%d", int64(t))
				} else {
					out[k] = fmt.Sprintf("%v", t)
				}
			case json.Number:
				out[k] = t.String()
			case bool:
				out[k] = fmt.Sprintf("%v", t)
			default:
				out[k] = strings.TrimSpace(fmt.Sprint(t))
			}
		}
		return out, nil
	}
	// application/x-www-form-urlencoded
	vals, err := url.ParseQuery(trim)
	if err != nil {
		return nil, fmt.Errorf("malformed form: %w", err)
	}
	if len(vals) == 0 {
		return nil, fmt.Errorf("malformed envelope")
	}
	out := make(map[string]string, len(vals))
	for k, vs := range vals {
		if len(vs) > 0 {
			out[k] = strings.TrimSpace(vs[0])
		}
	}
	return out, nil
}

func normalizeDuitkuFields(raw map[string]string) (NormalizedCallback, error) {
	merchantOrderID := firstMapString(raw, "merchantOrderId", "merchant_order_id")
	reference := firstMapString(raw, "reference")
	resultCode := firstMapString(raw, "resultCode", "result_code", "statusCode", "status_code")
	amountStr := firstMapString(raw, "amount", "paymentAmount", "payment_amount")
	amount := parseAmountString(amountStr)

	normalized, mappedStatus := mapDuitkuResultCode(resultCode, firstMapString(raw, "statusMessage", "status_message", "additionalParam"))

	// ProviderEventID: prefer reference + resultCode; else fingerprint later in ingress.
	eventID := ""
	if reference != "" {
		if resultCode != "" {
			eventID = reference + ":" + resultCode
		} else {
			eventID = reference
		}
	}
	if eventID == "" && merchantOrderID != "" && resultCode != "" {
		eventID = merchantOrderID + ":" + resultCode
	}

	ref := reference
	if ref == "" {
		ref = merchantOrderID
	}

	return NormalizedCallback{
		ProviderEventID:   eventID,
		RawEventType:      coalesce(resultCode, "duitku.callback"),
		NormalizedType:    normalized,
		ProviderReference: ref,
		ExternalID:        merchantOrderID,
		AmountIDR:         amount,
		Currency:          CurrencyIDR,
		Status:            mappedStatus,
	}, nil
}

func mapDuitkuResultCode(resultCode, message string) (normalized, mapped string) {
	code := strings.TrimSpace(resultCode)
	msg := strings.ToLower(strings.TrimSpace(message))

	// Message-based expired even if code is non-standard.
	if strings.Contains(msg, "expired") || strings.Contains(msg, "kadaluarsa") || strings.Contains(msg, "expire") {
		return NormalizedExpired, StatusExpired
	}

	switch code {
	case "00":
		return NormalizedPaid, StatusPaid
	case "01":
		if strings.Contains(msg, "cancel") || strings.Contains(msg, "fail") {
			return NormalizedFailed, StatusFailed
		}
		return NormalizedPending, StatusPending
	case "02":
		if strings.Contains(msg, "cancel") || strings.Contains(msg, "canceled") || strings.Contains(msg, "cancelled") {
			return NormalizedCancelled, StatusCancelled
		}
		return NormalizedFailed, StatusFailed
	}

	switch {
	case strings.Contains(msg, "success") || strings.Contains(msg, "paid") || strings.Contains(msg, "berhasil"):
		return NormalizedPaid, StatusPaid
	case strings.Contains(msg, "cancel") || strings.Contains(msg, "canceled") || strings.Contains(msg, "cancelled"):
		return NormalizedCancelled, StatusCancelled
	case strings.Contains(msg, "fail") || strings.Contains(msg, "gagal") || strings.Contains(msg, "reject"):
		return NormalizedFailed, StatusFailed
	case strings.Contains(msg, "process") || strings.Contains(msg, "pending") || strings.Contains(msg, "waiting"):
		return NormalizedPending, StatusPending
	case code == "" && msg == "":
		return NormalizedUnknown, StatusUnknownOutcome
	default:
		return NormalizedUnknown, StatusUnknownOutcome
	}
}

func firstMapString(m map[string]string, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k]; ok && strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func parseAmountString(s string) int64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	// Strip decimal part if present (IDR whole units for signature use integer string).
	if i := strings.IndexByte(s, '.'); i >= 0 {
		s = s[:i]
	}
	var n int64
	_, err := fmt.Sscan(s, &n)
	if err != nil {
		return 0
	}
	return n
}
