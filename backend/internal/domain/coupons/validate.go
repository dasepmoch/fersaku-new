package coupons

import (
	"crypto/sha256"
	"encoding/hex"
	"regexp"
	"strings"
	"time"
	"unicode"
)

const (
	CodeMaxLen            = 32
	CodeMinLen            = 2
	PercentBpsMin   int64 = 1
	PercentBpsMax   int64 = 10000 // 100.00%
	MaxFixedIDR     int64 = 100_000_000
	MaxMinMerchIDR  int64 = 100_000_000
	MaxProductScope       = 200
)

var codeShape = regexp.MustCompile(`^[A-Z0-9]+(-[A-Z0-9]+)*$`)

// NormalizeCode uppercases, trims, maps spaces/underscores to hyphens, strips other junk.
func NormalizeCode(raw string) string {
	s := strings.ToUpper(strings.TrimSpace(raw))
	if s == "" {
		return ""
	}
	var b strings.Builder
	b.Grow(len(s))
	prevHyphen := false
	for _, r := range s {
		switch {
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			b.WriteRune(unicode.ToUpper(r))
			prevHyphen = false
		case r == '-' || r == '_' || r == ' ':
			if !prevHyphen && b.Len() > 0 {
				b.WriteByte('-')
				prevHyphen = true
			}
		default:
			// drop
		}
	}
	return strings.Trim(b.String(), "-")
}

// ValidateCode checks normalized code shape/length.
func ValidateCode(normalized string) error {
	if len(normalized) < CodeMinLen || len(normalized) > CodeMaxLen {
		return ErrCodeInvalid
	}
	if !codeShape.MatchString(normalized) {
		return ErrCodeInvalid
	}
	return nil
}

// HashCode produces a keyed-ish stable hash for storage (store-scoped uniqueness is separate).
// Uses SHA-256 of normalized code; not a secret — prevents casual log leakage of raw codes
// when only hash is logged. Display code is stored separately for seller DTOs.
func HashCode(normalized string) string {
	sum := sha256.Sum256([]byte("fersaku:coupon:v1:" + normalized))
	return hex.EncodeToString(sum[:])
}

// MaskCode returns a masked display for non-seller contexts (first 2 + ***).
func MaskCode(display string) string {
	if display == "" {
		return ""
	}
	if len(display) <= 2 {
		return "**"
	}
	return display[:2] + strings.Repeat("*", min(6, len(display)-2))
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// NormalizeDiscountKind accepts PERCENT/FIXED_IDR or FE percentage/fixed.
func NormalizeDiscountKind(raw string) (DiscountKind, error) {
	switch strings.ToUpper(strings.TrimSpace(raw)) {
	case "PERCENT", "PERCENTAGE", "PCT":
		return KindPercent, nil
	case "FIXED_IDR", "FIXED", "AMOUNT":
		return KindFixedIDR, nil
	default:
		return "", ErrKindInvalid
	}
}

// NormalizeScope accepts ALL_PRODUCTS / SELECTED_PRODUCTS or FE labels.
func NormalizeScope(raw string) (Scope, error) {
	s := strings.ToUpper(strings.TrimSpace(raw))
	s = strings.ReplaceAll(s, " ", "_")
	switch s {
	case "", "ALL_PRODUCTS", "ALL", "SEMUA_PRODUK":
		return ScopeAllProducts, nil
	case "SELECTED_PRODUCTS", "SELECTED", "PRODUCTS", "PRODUK_TERTENTU":
		return ScopeSelectedProducts, nil
	default:
		return "", ErrScopeInvalid
	}
}

// ValidateDiscountValue checks bps or fixed IDR bounds.
func ValidateDiscountValue(kind DiscountKind, value int64) error {
	if value <= 0 {
		return ErrDiscountInvalid
	}
	switch kind {
	case KindPercent:
		if value < PercentBpsMin || value > PercentBpsMax {
			return ErrDiscountInvalid
		}
	case KindFixedIDR:
		if value > MaxFixedIDR {
			return ErrDiscountInvalid
		}
	default:
		return ErrKindInvalid
	}
	return nil
}

// ValidateMinMerchandise checks non-negative floor.
func ValidateMinMerchandise(v int64) error {
	if v < 0 || v > MaxMinMerchIDR {
		return ErrLimitInvalid
	}
	return nil
}

// ValidateUsageLimit validates optional positive limits.
func ValidateUsageLimit(v *int64) error {
	if v == nil {
		return nil
	}
	if *v <= 0 {
		return ErrLimitInvalid
	}
	return nil
}

// ValidateWindow ensures start <= end when both set.
func ValidateWindow(starts, ends *time.Time) error {
	if starts != nil && ends != nil && starts.After(*ends) {
		return ErrWindowInvalid
	}
	return nil
}

// PercentFromDisplay converts a whole percent (e.g. 20) to bps (2000).
// Accepts either whole percent 1..100 or already-bps 1..10000 when value > 100.
func PercentToBps(displayOrBps int64) (int64, error) {
	if displayOrBps <= 0 {
		return 0, ErrDiscountInvalid
	}
	if displayOrBps <= 100 {
		return displayOrBps * 100, nil
	}
	if displayOrBps > PercentBpsMax {
		return 0, ErrDiscountInvalid
	}
	return displayOrBps, nil
}

// CanTransition reports whether from→to is allowed for coupon SM.
func CanTransition(from, to State) bool {
	if from == to {
		return true // idempotent
	}
	switch from {
	case StateDraft:
		return to == StateActive || to == StateArchived
	case StateActive:
		return to == StatePaused || to == StateExpired || to == StateArchived
	case StatePaused:
		return to == StateActive || to == StateArchived
	case StateExpired:
		return to == StateArchived
	case StateArchived:
		return false
	default:
		return false
	}
}

// IsEditable reports whether seller can PATCH mutable fields.
// ACTIVE/PAUSED may update non-destructive fields with version bump;
// code change is forbidden once activated (creates new coupon instead).
func IsEditable(s State) bool {
	return s == StateDraft || s == StateActive || s == StatePaused
}

// CodeChangeAllowed is only for DRAFT.
func CodeChangeAllowed(s State) bool {
	return s == StateDraft
}
