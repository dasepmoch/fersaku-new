package webhooks

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// SignPayload builds the outbound signature for a delivery attempt.
// Contract: HMAC-SHA256(secret, "{timestamp}.{eventId}.{body}") hex-encoded.
// Retries keep eventId + body fixed; timestamp is always fresh.
func SignPayload(secret string, timestampUnix int64, eventID string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	msg := fmt.Sprintf("%d.%s.", timestampUnix, eventID)
	_, _ = mac.Write([]byte(msg))
	_, _ = mac.Write(body)
	return "v1=" + hex.EncodeToString(mac.Sum(nil))
}

// SignatureHeaders returns the standard outbound headers for one attempt.
func SignatureHeaders(timestampUnix int64, eventID, eventType, signature string) map[string]string {
	return map[string]string{
		HeaderTimestamp:  strconv.FormatInt(timestampUnix, 10),
		HeaderEventID:    eventID,
		HeaderEventType:  eventType,
		HeaderPayloadVer: PayloadVersionV1,
		HeaderSignature:  signature,
	}
}

// NowUnix returns UTC unix seconds for signing.
func NowUnix(t time.Time) int64 {
	return t.UTC().Unix()
}

// PayloadHash is SHA-256 hex of exact body bytes.
func PayloadHash(body []byte) string {
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}

// StablePaymentPaidEventID is deterministic for a paid payment intent.
func StablePaymentPaidEventID(paymentIntentID string) string {
	return "evt_payment.paid:" + strings.TrimSpace(paymentIntentID)
}

// StableTestEventID namespaces test deliveries.
func StableTestEventID(endpointID string, nonce string) string {
	return "evt_webhook.test:" + strings.TrimSpace(endpointID) + ":" + strings.TrimSpace(nonce)
}

// AllowlistContains reports whether eventType is permitted (empty list = all known).
func AllowlistContains(allow []string, eventType string) bool {
	if len(allow) == 0 {
		// Launch default: payment.paid + test.
		return eventType == EventPaymentPaid || eventType == EventTest
	}
	for _, a := range allow {
		if a == eventType || a == "*" {
			return true
		}
	}
	return false
}
