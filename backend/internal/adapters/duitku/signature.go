package duitku

import (
	"crypto/hmac"
	"crypto/md5"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"strings"
)

// InquirySignature is HMAC-SHA256(merchantCode + merchantOrderId + paymentAmount, apiKey) lowercase hex.
// paymentAmount is the whole-IDR decimal string (no separators), matching the inquiry body.
// Verified: https://docs.duitku.com/api/id/ 2026-07-20 (MD5 obsolete).
func InquirySignature(merchantCode, merchantOrderID, paymentAmount, apiKey string) string {
	return hmacSHA256Hex(merchantCode+merchantOrderID+paymentAmount, apiKey)
}

// StatusSignature is HMAC-SHA256(merchantCode + merchantOrderId, apiKey) lowercase hex.
// Verified: https://docs.duitku.com/api/id/ 2026-07-20 (MD5 obsolete).
func StatusSignature(merchantCode, merchantOrderID, apiKey string) string {
	return hmacSHA256Hex(merchantCode+merchantOrderID, apiKey)
}

// CallbackSignature is HMAC-SHA256(merchantCode + amount + merchantOrderId, apiKey) lowercase hex.
// amount is the posted amount string (whole IDR, no decimals).
// Verified: https://docs.duitku.com/api/id/ 2026-07-20 (MD5 obsolete).
func CallbackSignature(merchantCode, amount, merchantOrderID, apiKey string) string {
	return hmacSHA256Hex(merchantCode+amount+merchantOrderID, apiKey)
}

// VerifyCallbackSignature constant-time compares provided signature to CallbackSignature.
// Returns false if any required field is empty or digest lengths differ.
// MD5 digests are never accepted on the live path.
func VerifyCallbackSignature(merchantCode, amount, merchantOrderID, apiKey, provided string) bool {
	merchantCode = strings.TrimSpace(merchantCode)
	amount = strings.TrimSpace(amount)
	merchantOrderID = strings.TrimSpace(merchantOrderID)
	apiKey = strings.TrimSpace(apiKey)
	provided = strings.ToLower(strings.TrimSpace(provided))
	if merchantCode == "" || amount == "" || merchantOrderID == "" || apiKey == "" || provided == "" {
		return false
	}
	// Reject legacy MD5 (32 hex) on live path — active API uses HMAC-SHA256 (64 hex).
	if len(provided) != 64 {
		return false
	}
	want := strings.ToLower(CallbackSignature(merchantCode, amount, merchantOrderID, apiKey))
	if len(want) != len(provided) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(want), []byte(provided)) == 1
}

// MerchantCodeEqual constant-time compares merchant codes via fixed-size digests
// (handles unequal lengths safely). Uses SHA-256 digests (not secret material).
func MerchantCodeEqual(got, want string) bool {
	got = strings.TrimSpace(got)
	want = strings.TrimSpace(want)
	if want == "" {
		return false
	}
	a := sha256.Sum256([]byte(got))
	b := sha256.Sum256([]byte(want))
	return subtle.ConstantTimeCompare(a[:], b[:]) == 1
}

// LegacyMD5CallbackSignature is the obsolete MD5 formula retained only for negative tests.
// Never use for live verification.
func LegacyMD5CallbackSignature(merchantCode, amount, merchantOrderID, apiKey string) string {
	sum := md5.Sum([]byte(merchantCode + amount + merchantOrderID + apiKey))
	return hex.EncodeToString(sum[:])
}

func hmacSHA256Hex(message, key string) string {
	mac := hmac.New(sha256.New, []byte(key))
	_, _ = mac.Write([]byte(message))
	return hex.EncodeToString(mac.Sum(nil))
}
