package seed

import (
	"fmt"
	"time"
)

// FixedClock is the deterministic nonprod seed epoch (UTC).
// All relative timestamps are offsets from this instant.
var FixedClock = time.Date(2026, 1, 15, 12, 0, 0, 0, time.UTC)

// Shared nonprod password for all personas (argon2id, fixed salt).
// Not a production credential; documented for local/CI only.
const SharedPassword = "TestSeed1!"

// Persona keys (stable map keys for evidence / consumers).
const (
	PersonaBuyerA           = "buyer_a"
	PersonaBuyerB           = "buyer_b"
	PersonaSellerOwnerA     = "seller_owner_a"
	PersonaSellerMemberRead = "seller_member_read"
	PersonaSellerB          = "seller_b"
	PersonaAdminSuper       = "admin_super"
	PersonaAdminSupport     = "admin_support"
	PersonaAdminFinance     = "admin_finance"
	PersonaAdminNoAccess    = "admin_no_access"
)

// Deterministic ULID-shaped IDs (26 Crockford chars). Never collide with random ULID entropy.
// Pattern: 01HQ0SEED + zero-padded counter (hex-ish Crockford).
func ID(n int) string {
	if n < 0 || n > 999999 {
		panic(fmt.Sprintf("seed: ID out of range: %d", n))
	}
	return fmt.Sprintf("01HQ0SEED%017d", n)
}

// At returns FixedClock + d.
func At(d time.Duration) time.Time {
	return FixedClock.Add(d)
}

// Resource ID allocation (stable across runs).
const (
	// Users 1-20
	IDUserBuyerA           = 1
	IDUserBuyerB           = 2
	IDUserSellerOwnerA     = 3
	IDUserSellerMemberRead = 4
	IDUserSellerB          = 5
	IDUserAdminSuper       = 6
	IDUserAdminSupport     = 7
	IDUserAdminFinance     = 8
	IDUserAdminNoAccess    = 9

	// Merchants / stores 21-40
	IDMerchantA     = 21
	IDMerchantB     = 22
	IDMerchantEmpty = 23
	IDStoreA        = 31
	IDStoreB        = 32
	IDStoreEmpty    = 33

	// Products 41-60
	IDProductDraft     = 41
	IDProductPublished = 42
	IDProductArchived  = 43
	IDProductEmptyNone = 44 // unused on empty store

	// Inventory schema / stock 61-80
	IDInvSchema        = 61
	IDStockAvailable   = 62
	IDStockReserved    = 63
	IDStockDelivered   = 64
	IDStockRevoked     = 65
	IDStockInvalidSkip = 66 // not inserted (invalid state not in check)
	IDResvActive       = 67
	IDResvDelivered    = 68

	// Orders / payments / delivery 81-120
	IDOrderPaid           = 81
	IDOrderPending        = 82
	IDOrderExpired        = 83
	IDOrderFailed         = 84
	IDOrderItemPaid       = 85
	IDOrderItemPending    = 86
	IDPaymentPending      = 87
	IDPaymentPaid         = 88
	IDPaymentExpired      = 89
	IDPaymentFailed       = 90
	IDPaymentUnknown      = 91
	IDDeliveryReady       = 92
	IDDeliveryRevoked     = 93
	IDDeliveryRetry       = 94
	IDDeliveryAttemptOK   = 95
	IDDeliveryAttemptFail = 96
	IDInvoicePaid         = 97
	IDInvoiceVersion      = 98
	IDCallbackEvent       = 99
	IDCallbackRejected    = 100
	IDCallbackReplayable  = 101
	IDSettlement          = 102

	// Coupons 121-130
	IDCouponActive  = 121
	IDCouponPaused  = 122
	IDCouponExpired = 123
	IDCouponLastUse = 124

	// Reviews 131-140
	IDReviewPending   = 131
	IDReviewPublished = 132
	IDReviewReplied   = 133
	IDReviewReported  = 134
	IDReviewModerated = 135
	IDReviewReply     = 136
	IDReviewReport    = 137

	// Finance / bank / withdrawals 141-170
	IDBankAccount      = 141
	IDWDQuoteAvailable = 142
	IDWDQuoteLocked    = 143
	IDWDQuoteExpired   = 144
	IDWDPending        = 145
	IDWDProcessing     = 146
	IDWDUnknown        = 147
	IDWDCompleted      = 148
	IDWDLock           = 149
	IDFeeSnapTx        = 150
	IDFeeSnapWD        = 151

	// KYC 171-180
	IDKYCDraft     = 171
	IDKYCSubmitted = 172
	IDKYCNeedsInfo = 173
	IDKYCApproved  = 174
	IDKYCRejected  = 175

	// Webhooks / notifications / sessions / MFA 181-220
	IDWebhookEndpoint   = 181
	IDWebhookDelivery   = 182
	IDWebhookDLQ        = 183
	IDWebhookAttempt    = 184
	IDNotifBuyerA       = 185
	IDSessionBuyerA     = 186
	IDSessionAdminSuper = 187
	IDMFAAdminSuper     = 188
	IDProfileBuyerA     = 189 // profile uses user_id PK

	// Seller B product for isolation
	IDProductSellerB = 201
	IDOrderSellerB   = 202
	IDOrderItemSB    = 203

	// Audit / emergency markers (emergency already migration-seeded)
	IDAuditSeedNote = 210
)
