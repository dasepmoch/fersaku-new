package payments

import (
	"encoding/json"
	"fmt"
	"strings"
)

// ParseXenditEnvelope normalizes common Xendit QRIS / invoice callback shapes.
// Does not trust account_scope or payment_mode from body.
func ParseXenditEnvelope(body []byte) (NormalizedCallback, error) {
	if len(body) == 0 {
		return NormalizedCallback{}, fmt.Errorf("empty body")
	}
	var raw map[string]any
	if err := json.Unmarshal(body, &raw); err != nil {
		return NormalizedCallback{}, fmt.Errorf("malformed json: %w", err)
	}

	// Nested data object (invoice / payment style).
	data, _ := raw["data"].(map[string]any)
	if data == nil {
		data = raw
	}

	eventID := firstString(raw, "id", "event_id", "eventId")
	if eventID == "" {
		eventID = firstString(data, "id", "event_id", "eventId")
	}
	rawType := firstString(raw, "event", "type", "event_type", "eventType")
	if rawType == "" {
		rawType = firstString(data, "event", "type", "status")
	}
	statusRaw := firstString(data, "status", "payment_status", "paymentStatus")
	if statusRaw == "" {
		statusRaw = firstString(raw, "status")
	}

	ref := firstString(data, "id", "qr_id", "qrId", "payment_id", "paymentId", "external_id")
	// Prefer dedicated provider payment id fields when present.
	if v := firstString(data, "qr_id", "qrId", "payment_id", "paymentId"); v != "" {
		ref = v
	}
	// Xendit QR codes often use id as the payment object id.
	if ref == "" {
		ref = firstString(data, "id")
	}

	externalID := firstString(data, "external_id", "externalId", "reference_id", "referenceId")
	if externalID == "" {
		externalID = firstString(raw, "external_id", "externalId")
	}

	amount := firstInt64(data, "amount", "paid_amount", "paidAmount", "gross_amount")
	if amount == 0 {
		amount = firstInt64(raw, "amount", "paid_amount")
	}
	currency := strings.ToUpper(firstString(data, "currency"))
	if currency == "" {
		currency = strings.ToUpper(firstString(raw, "currency"))
	}
	if currency == "" {
		currency = CurrencyIDR
	}

	// Map status / event to normalized type.
	normalized, mappedStatus := mapXenditStatus(rawType, statusRaw)

	// Prefer provider reference from metadata.payment_intent if present is ignored for resolution
	// (we resolve only by full provider tuple). Keep external_id for secondary evidence.

	out := NormalizedCallback{
		ProviderEventID:   eventID,
		RawEventType:      coalesce(rawType, statusRaw),
		NormalizedType:    normalized,
		ProviderReference: ref,
		ExternalID:        externalID,
		AmountIDR:         amount,
		Currency:          currency,
		Status:            mappedStatus,
	}
	return out, nil
}

func mapXenditStatus(eventType, status string) (normalized, mapped string) {
	e := strings.ToUpper(strings.TrimSpace(eventType))
	s := strings.ToUpper(strings.TrimSpace(status))
	combined := e + " " + s

	// Reversal / refund-like containment only (no refund API).
	if strings.Contains(combined, "REFUND") || strings.Contains(combined, "REVERSAL") ||
		strings.Contains(combined, "CHARGEBACK") {
		return NormalizedReversal, StatusPaid // containment; financial state changes separately
	}

	switch s {
	case "PAID", "SUCCEEDED", "COMPLETED", "SETTLED", "SUCCESS":
		return NormalizedPaid, StatusPaid
	case "EXPIRED":
		return NormalizedExpired, StatusExpired
	case "CANCELLED", "CANCELED", "VOIDED":
		return NormalizedCancelled, StatusCancelled
	case "FAILED":
		return NormalizedFailed, StatusFailed
	case "PENDING", "ACTIVE", "REQUIRES_ACTION", "WAITING":
		return NormalizedPending, StatusPending
	}

	if strings.Contains(e, "PAID") || strings.Contains(e, "SUCCESS") || strings.Contains(e, "COMPLETED") {
		return NormalizedPaid, StatusPaid
	}
	if strings.Contains(e, "EXPIRED") {
		return NormalizedExpired, StatusExpired
	}
	if strings.Contains(e, "CANCEL") {
		return NormalizedCancelled, StatusCancelled
	}
	if strings.Contains(e, "FAILED") {
		return NormalizedFailed, StatusFailed
	}
	if e == "" && s == "" {
		return NormalizedUnknown, StatusUnknownOutcome
	}
	return NormalizedUnknown, StatusUnknownOutcome
}

func firstString(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k]; ok && v != nil {
			switch t := v.(type) {
			case string:
				if strings.TrimSpace(t) != "" {
					return strings.TrimSpace(t)
				}
			case float64:
				// JSON numbers for ids are uncommon; skip.
			case json.Number:
				s := t.String()
				if s != "" {
					return s
				}
			}
		}
	}
	return ""
}

func firstInt64(m map[string]any, keys ...string) int64 {
	for _, k := range keys {
		if v, ok := m[k]; ok && v != nil {
			switch t := v.(type) {
			case float64:
				return int64(t)
			case int64:
				return t
			case int:
				return int64(t)
			case json.Number:
				n, err := t.Int64()
				if err == nil {
					return n
				}
			case string:
				var n int64
				_, err := fmt.Sscan(t, &n)
				if err == nil {
					return n
				}
			}
		}
	}
	return 0
}

func coalesce(a, b string) string {
	if strings.TrimSpace(a) != "" {
		return a
	}
	return b
}
