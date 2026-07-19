package coupons

import "time"

// ComputeDiscountIDR calculates seller-funded discount on eligible merchandise only.
// Tip, platform fee, and non-eligible upsell lines are never discounted.
// Result is clamped so merchandise - discount >= 0 (never negative total).
// Uses integer math only (half-up for percent).
func ComputeDiscountIDR(kind DiscountKind, value int64, eligibleSubtotalIDR int64) int64 {
	if eligibleSubtotalIDR <= 0 || value <= 0 {
		return 0
	}
	var d int64
	switch kind {
	case KindPercent:
		// round half up: (eligible * bps + 5000) / 10000
		d = (eligibleSubtotalIDR*value + 5000) / 10000
	case KindFixedIDR:
		d = value
	default:
		return 0
	}
	if d > eligibleSubtotalIDR {
		d = eligibleSubtotalIDR
	}
	if d < 0 {
		return 0
	}
	return d
}

// BuildPriceSnapshot builds authoritative quote. ClientDiscountIDR is ignored.
// eligibleSubtotal is merchandise only (not tip/upsell).
func BuildPriceSnapshot(
	storeID, productID string,
	merchandiseIDR, tipIDR, upsellIDR int64,
	c *Coupon,
	applied bool,
) PriceSnapshot {
	if tipIDR < 0 {
		tipIDR = 0
	}
	if upsellIDR < 0 {
		upsellIDR = 0
	}
	if merchandiseIDR < 0 {
		merchandiseIDR = 0
	}
	snap := PriceSnapshot{
		StoreID:             storeID,
		ProductID:           productID,
		MerchandiseIDR:      merchandiseIDR,
		TipIDR:              tipIDR,
		UpsellIDR:           upsellIDR,
		EligibleSubtotalIDR: merchandiseIDR,
	}
	if applied && c != nil {
		d := ComputeDiscountIDR(c.DiscountKind, c.DiscountValue, merchandiseIDR)
		snap.CouponApplied = true
		snap.CouponID = c.ID
		snap.CouponCode = c.CodeDisplay
		snap.CouponPolicyVersion = c.PolicyVersion
		snap.DiscountKind = c.DiscountKind
		snap.DiscountValue = c.DiscountValue
		snap.DiscountIDR = d
	}
	// Gross = merchandise - discount + tip + upsell (seller-funded discount reduces gross before fee).
	gross := merchandiseIDR - snap.DiscountIDR + tipIDR + upsellIDR
	if gross < 0 {
		gross = 0
	}
	snap.GrossIDR = gross
	return snap
}

// WindowActive reports whether now is within [starts_at, ends_at] (inclusive bounds when set).
func WindowActive(c Coupon, now time.Time) bool {
	if c.StartsAt != nil && now.Before(c.StartsAt.UTC()) {
		return false
	}
	if c.EndsAt != nil && now.After(c.EndsAt.UTC()) {
		return false
	}
	return true
}

// ProductInScope reports whether product is eligible under coupon scope.
func ProductInScope(c Coupon, productID string, scopedIDs map[string]struct{}) bool {
	if c.Scope == ScopeAllProducts {
		return true
	}
	if productID == "" {
		return false
	}
	if scopedIDs != nil {
		_, ok := scopedIDs[productID]
		return ok
	}
	for _, id := range c.ProductIDs {
		if id == productID {
			return true
		}
	}
	return false
}

// MeetsMinimum reports merchandise >= min_merchandise_idr.
func MeetsMinimum(c Coupon, merchandiseIDR int64) bool {
	return merchandiseIDR >= c.MinMerchandiseIDR
}

// SlotsUsed is reserved_count + redeemed_count projection for global limit.
func SlotsUsed(c Coupon) int64 {
	return c.ReservedCount + c.RedeemedCount
}

// GlobalLimitReached is true when max_total_uses is set and slots are full.
func GlobalLimitReached(c Coupon) bool {
	if c.MaxTotalUses == nil {
		return false
	}
	return SlotsUsed(c) >= *c.MaxTotalUses
}
