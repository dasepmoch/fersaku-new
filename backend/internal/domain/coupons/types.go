package coupons

import "time"

// DiscountKind is PERCENT (bps) or FIXED_IDR (whole rupiah).
type DiscountKind string

const (
	KindPercent  DiscountKind = "PERCENT"
	KindFixedIDR DiscountKind = "FIXED_IDR"
)

// State is coupon lifecycle (§5.7).
type State string

const (
	StateDraft    State = "DRAFT"
	StateActive   State = "ACTIVE"
	StatePaused   State = "PAUSED"
	StateExpired  State = "EXPIRED"
	StateArchived State = "ARCHIVED"
)

// Scope is product applicability.
type Scope string

const (
	ScopeAllProducts      Scope = "ALL_PRODUCTS"
	ScopeSelectedProducts Scope = "SELECTED_PRODUCTS"
)

// ReservationState is checkout hold lifecycle (§5.7).
type ReservationState string

const (
	ReservationReserved    ReservationState = "RESERVED"
	ReservationConsumed    ReservationState = "CONSUMED"
	ReservationReleased    ReservationState = "RELEASED"
	ReservationHeldUnknown ReservationState = "HELD_UNKNOWN"
)

// Coupon is the seller-managed promo aggregate.
type Coupon struct {
	ID                 string
	StoreID            string
	MerchantID         string
	CodeDisplay        string
	NormalizedCode     string
	CodeHash           string
	DiscountKind       DiscountKind
	DiscountValue      int64 // bps for PERCENT; IDR for FIXED_IDR
	MinMerchandiseIDR  int64
	MaxTotalUses       *int64
	MaxPerCustomerUses *int64
	StartsAt           *time.Time
	EndsAt             *time.Time
	State              State
	Scope              Scope
	Version            int32 // optimistic concurrency for seller PATCH
	PolicyVersion      int32 // snapshotted into reservations/redemptions
	ReservedCount      int64 // projection: active holds (RESERVED+HELD_UNKNOWN)
	RedeemedCount      int64 // projection: CONSUMED/redemptions
	ProductIDs         []string
	CreatedBy          *string
	CreatedAt          time.Time
	UpdatedAt          time.Time
}

// Reservation is a checkout hold that may convert to redemption on verified paid.
type Reservation struct {
	ID                  string
	CouponID            string
	CouponPolicyVersion int32
	StoreID             string
	OrderID             string
	IdempotencyKey      string
	BuyerIdentityHash   *string
	ProductID           *string
	DiscountKind        DiscountKind
	DiscountValue       int64
	DiscountIDR         int64
	EligibleSubtotalIDR int64
	MerchandiseIDR      int64
	TipIDR              int64
	UpsellIDR           int64
	GrossIDR            int64
	CodeSnapshot        string
	State               ReservationState
	ExpiresAt           time.Time
	ConsumedAt          *time.Time
	ReleasedAt          *time.Time
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

// Redemption is an immutable paid discount snapshot.
type Redemption struct {
	ID                  string
	ReservationID       string
	CouponID            string
	CouponPolicyVersion int32
	StoreID             string
	OrderID             string
	CodeSnapshot        string
	DiscountKind        DiscountKind
	DiscountValue       int64
	DiscountIDR         int64
	EligibleSubtotalIDR int64
	MerchandiseIDR      int64
	TipIDR              int64
	UpsellIDR           int64
	GrossIDR            int64
	BuyerIdentityHash   *string
	ProductID           *string
	CreatedAt           time.Time
}

// PriceSnapshot is the authoritative server-side priced quote (client discount ignored).
type PriceSnapshot struct {
	StoreID             string
	ProductID           string
	CouponID            string
	CouponCode          string
	CouponPolicyVersion int32
	DiscountKind        DiscountKind
	DiscountValue       int64
	EligibleSubtotalIDR int64
	DiscountIDR         int64
	MerchandiseIDR      int64
	TipIDR              int64
	UpsellIDR           int64
	GrossIDR            int64
	// CouponApplied is false when no code or invalid/unavailable (generic).
	CouponApplied bool
	// CouponUnavailable is true when a code was submitted but not applied.
	CouponUnavailable bool
}

// QuoteInput is checkout pricing input. ClientDiscountIDR is always ignored.
type QuoteInput struct {
	StoreID           string
	ProductID         string
	MerchandiseIDR    int64 // server-reloaded product price (or PWYT amount after min check)
	TipIDR            int64
	UpsellIDR         int64 // non-eligible unless explicitly in scope later
	CouponCode        string
	ClientDiscountIDR int64 // ignored — never authoritative
	BuyerIdentityHash string
	Now               time.Time
}
