package application

import (
	"context"
	"strings"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/coupons"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// DefaultReservationTTL is how long a checkout hold lives without payment finalization.
const DefaultReservationTTL = 30 * time.Minute

// CouponService implements seller coupon management + checkout eligibility/reservation (BE-215).
type CouponService struct {
	Store CouponStore
	IDs   ports.IDGenerator
	Clock ports.Clock
	Log   ports.Logger
}

func (s *CouponService) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now().UTC()
	}
	return time.Now().UTC()
}

func (s *CouponService) requireStoreAccess(ctx context.Context, userID, storeID string) (CatalogStoreRow, error) {
	if userID == "" {
		return CatalogStoreRow{}, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required")
	}
	if storeID == "" {
		return CatalogStoreRow{}, coupons.ErrNotFound
	}
	st, err := s.Store.GetStoreByID(ctx, storeID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return CatalogStoreRow{}, coupons.ErrNotFound
		}
		return CatalogStoreRow{}, apperr.Internal(apperr.CodeInternalError, "Store lookup failed")
	}
	admin, err := s.Store.UserIsPlatformAdmin(ctx, userID)
	if err != nil {
		return CatalogStoreRow{}, apperr.Internal(apperr.CodeInternalError, "Authorization check failed")
	}
	if admin {
		return st, nil
	}
	ok, err := s.Store.UserCanAccessStore(ctx, userID, storeID)
	if err != nil {
		return CatalogStoreRow{}, apperr.Internal(apperr.CodeInternalError, "Authorization check failed")
	}
	if !ok {
		return CatalogStoreRow{}, coupons.ErrNotFound
	}
	return st, nil
}

// --- seller inputs ---

// CreateCouponInput is POST /v1/stores/{storeId}/coupons.
type CreateCouponInput struct {
	Code               string
	DiscountKind       string
	DiscountValue      int64 // percent display 1..100 or bps; fixed whole IDR
	PercentIsBps       bool  // when true, DiscountValue is already bps
	MinMerchandiseIDR  int64
	MaxTotalUses       *int64
	MaxPerCustomerUses *int64
	StartsAt           *time.Time
	EndsAt             *time.Time
	Scope              string
	ProductIDs         []string
}

// PatchCouponInput is PATCH with optimistic version.
type PatchCouponInput struct {
	ExpectedVersion    int32
	DiscountKind       *string
	DiscountValue      *int64
	PercentIsBps       bool
	MinMerchandiseIDR  *int64
	MaxTotalUses       *int64
	ClearMaxTotal      bool
	MaxPerCustomerUses *int64
	ClearMaxPerCustomer bool
	StartsAt           *time.Time
	ClearStartsAt      bool
	EndsAt             *time.Time
	ClearEndsAt        bool
	Scope              *string
	ProductIDs         *[]string
	// Code only allowed in DRAFT.
	Code *string
}

// ListCoupons returns seller coupons for a store.
func (s *CouponService) ListCoupons(ctx context.Context, userID, storeID string) ([]coupons.Coupon, error) {
	if _, err := s.requireStoreAccess(ctx, userID, storeID); err != nil {
		return nil, err
	}
	items, err := s.Store.ListCouponsByStore(ctx, storeID)
	if err != nil {
		return nil, apperr.Internal(apperr.CodeInternalError, "List coupons failed")
	}
	for i := range items {
		ids, err := s.Store.ListProductScopes(ctx, items[i].ID)
		if err != nil {
			return nil, apperr.Internal(apperr.CodeInternalError, "List coupon scopes failed")
		}
		items[i].ProductIDs = ids
	}
	return items, nil
}

// GetCoupon returns one coupon for seller.
func (s *CouponService) GetCoupon(ctx context.Context, userID, storeID, couponID string) (coupons.Coupon, error) {
	if _, err := s.requireStoreAccess(ctx, userID, storeID); err != nil {
		return coupons.Coupon{}, err
	}
	c, err := s.Store.GetCouponByID(ctx, storeID, couponID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return coupons.Coupon{}, coupons.ErrNotFound
		}
		return coupons.Coupon{}, apperr.Internal(apperr.CodeInternalError, "Coupon lookup failed")
	}
	ids, err := s.Store.ListProductScopes(ctx, c.ID)
	if err != nil {
		return coupons.Coupon{}, apperr.Internal(apperr.CodeInternalError, "List coupon scopes failed")
	}
	c.ProductIDs = ids
	return c, nil
}

// CreateCoupon creates a DRAFT coupon.
func (s *CouponService) CreateCoupon(ctx context.Context, userID, storeID string, in CreateCouponInput) (coupons.Coupon, error) {
	st, err := s.requireStoreAccess(ctx, userID, storeID)
	if err != nil {
		return coupons.Coupon{}, err
	}
	c, productIDs, err := s.buildNewCoupon(ctx, st, userID, in)
	if err != nil {
		return coupons.Coupon{}, err
	}
	err = s.Store.WithTx(ctx, func(ctx context.Context) error {
		if err := s.Store.InsertCoupon(ctx, c); err != nil {
			if s.Store.IsUniqueViolation(err) {
				return coupons.ErrCodeConflict
			}
			return err
		}
		if c.Scope == coupons.ScopeSelectedProducts {
			if err := s.Store.ReplaceProductScopes(ctx, c.ID, storeID, productIDs); err != nil {
				return err
			}
			c.ProductIDs = productIDs
		}
		return nil
	})
	if err != nil {
		if ae, ok := apperr.AsAppError(err); ok {
			return coupons.Coupon{}, ae
		}
		return coupons.Coupon{}, apperr.Internal(apperr.CodeInternalError, "Create coupon failed")
	}
	return c, nil
}

func (s *CouponService) buildNewCoupon(ctx context.Context, st CatalogStoreRow, userID string, in CreateCouponInput) (coupons.Coupon, []string, error) {
	norm := coupons.NormalizeCode(in.Code)
	if err := coupons.ValidateCode(norm); err != nil {
		return coupons.Coupon{}, nil, err
	}
	kind, err := coupons.NormalizeDiscountKind(in.DiscountKind)
	if err != nil {
		return coupons.Coupon{}, nil, err
	}
	val := in.DiscountValue
	if kind == coupons.KindPercent && !in.PercentIsBps {
		val, err = coupons.PercentToBps(val)
		if err != nil {
			return coupons.Coupon{}, nil, err
		}
	}
	if err := coupons.ValidateDiscountValue(kind, val); err != nil {
		return coupons.Coupon{}, nil, err
	}
	if err := coupons.ValidateMinMerchandise(in.MinMerchandiseIDR); err != nil {
		return coupons.Coupon{}, nil, err
	}
	if err := coupons.ValidateUsageLimit(in.MaxTotalUses); err != nil {
		return coupons.Coupon{}, nil, err
	}
	if err := coupons.ValidateUsageLimit(in.MaxPerCustomerUses); err != nil {
		return coupons.Coupon{}, nil, err
	}
	if err := coupons.ValidateWindow(in.StartsAt, in.EndsAt); err != nil {
		return coupons.Coupon{}, nil, err
	}
	scope, err := coupons.NormalizeScope(in.Scope)
	if err != nil {
		return coupons.Coupon{}, nil, err
	}
	productIDs, err := s.validateProductIDs(ctx, st.ID, scope, in.ProductIDs)
	if err != nil {
		return coupons.Coupon{}, nil, err
	}
	now := s.now()
	id := s.IDs.New()
	if !strings.HasPrefix(id, "cpn_") {
		id = "cpn_" + id
	}
	var createdBy *string
	if userID != "" {
		createdBy = &userID
	}
	c := coupons.Coupon{
		ID:                 id,
		StoreID:            st.ID,
		MerchantID:         st.MerchantID,
		CodeDisplay:        norm,
		NormalizedCode:     norm,
		CodeHash:           coupons.HashCode(norm),
		DiscountKind:       kind,
		DiscountValue:      val,
		MinMerchandiseIDR:  in.MinMerchandiseIDR,
		MaxTotalUses:       in.MaxTotalUses,
		MaxPerCustomerUses: in.MaxPerCustomerUses,
		StartsAt:           in.StartsAt,
		EndsAt:             in.EndsAt,
		State:              coupons.StateDraft,
		Scope:              scope,
		Version:            1,
		PolicyVersion:      1,
		CreatedBy:          createdBy,
		CreatedAt:          now,
		UpdatedAt:          now,
		ProductIDs:         productIDs,
	}
	return c, productIDs, nil
}

func (s *CouponService) validateProductIDs(ctx context.Context, storeID string, scope coupons.Scope, ids []string) ([]string, error) {
	if scope != coupons.ScopeSelectedProducts {
		return nil, nil
	}
	if len(ids) == 0 {
		return nil, coupons.ErrProductsRequired
	}
	if len(ids) > coupons.MaxProductScope {
		return nil, coupons.ErrScopeInvalid
	}
	seen := make(map[string]struct{}, len(ids))
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		ok, err := s.Store.ProductOwnedByStore(ctx, storeID, id)
		if err != nil {
			return nil, apperr.Internal(apperr.CodeInternalError, "Product ownership check failed")
		}
		if !ok {
			return nil, coupons.ErrProductNotInStore
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	if len(out) == 0 {
		return nil, coupons.ErrProductsRequired
	}
	return out, nil
}

// PatchCoupon applies optimistic versioned update; bumps policy_version when pricing fields change.
func (s *CouponService) PatchCoupon(ctx context.Context, userID, storeID, couponID string, in PatchCouponInput) (coupons.Coupon, error) {
	if _, err := s.requireStoreAccess(ctx, userID, storeID); err != nil {
		return coupons.Coupon{}, err
	}
	if in.ExpectedVersion < 1 {
		return coupons.Coupon{}, apperr.Validation(apperr.CodeValidationFailed, "expectedVersion is required")
	}
	var out coupons.Coupon
	err := s.Store.WithTx(ctx, func(ctx context.Context) error {
		c, err := s.Store.GetCouponByID(ctx, storeID, couponID)
		if err != nil {
			if s.Store.IsNotFound(err) {
				return coupons.ErrNotFound
			}
			return err
		}
		if c.Version != in.ExpectedVersion {
			return coupons.ErrVersionConflict
		}
		if !coupons.IsEditable(c.State) {
			return coupons.ErrCannotMutate
		}
		policyBump := false
		if in.Code != nil {
			if !coupons.CodeChangeAllowed(c.State) {
				return coupons.ErrCannotMutate
			}
			norm := coupons.NormalizeCode(*in.Code)
			if err := coupons.ValidateCode(norm); err != nil {
				return err
			}
			c.CodeDisplay = norm
			c.NormalizedCode = norm
			c.CodeHash = coupons.HashCode(norm)
		}
		if in.DiscountKind != nil {
			kind, err := coupons.NormalizeDiscountKind(*in.DiscountKind)
			if err != nil {
				return err
			}
			if kind != c.DiscountKind {
				policyBump = true
			}
			c.DiscountKind = kind
		}
		if in.DiscountValue != nil {
			val := *in.DiscountValue
			if c.DiscountKind == coupons.KindPercent && !in.PercentIsBps {
				var err error
				val, err = coupons.PercentToBps(val)
				if err != nil {
					return err
				}
			}
			if err := coupons.ValidateDiscountValue(c.DiscountKind, val); err != nil {
				return err
			}
			if val != c.DiscountValue {
				policyBump = true
			}
			c.DiscountValue = val
		}
		if in.MinMerchandiseIDR != nil {
			if err := coupons.ValidateMinMerchandise(*in.MinMerchandiseIDR); err != nil {
				return err
			}
			if *in.MinMerchandiseIDR != c.MinMerchandiseIDR {
				policyBump = true
			}
			c.MinMerchandiseIDR = *in.MinMerchandiseIDR
		}
		if in.ClearMaxTotal {
			c.MaxTotalUses = nil
			policyBump = true
		} else if in.MaxTotalUses != nil {
			if err := coupons.ValidateUsageLimit(in.MaxTotalUses); err != nil {
				return err
			}
			c.MaxTotalUses = in.MaxTotalUses
			policyBump = true
		}
		if in.ClearMaxPerCustomer {
			c.MaxPerCustomerUses = nil
			policyBump = true
		} else if in.MaxPerCustomerUses != nil {
			if err := coupons.ValidateUsageLimit(in.MaxPerCustomerUses); err != nil {
				return err
			}
			c.MaxPerCustomerUses = in.MaxPerCustomerUses
			policyBump = true
		}
		if in.ClearStartsAt {
			c.StartsAt = nil
			policyBump = true
		} else if in.StartsAt != nil {
			c.StartsAt = in.StartsAt
			policyBump = true
		}
		if in.ClearEndsAt {
			c.EndsAt = nil
			policyBump = true
		} else if in.EndsAt != nil {
			c.EndsAt = in.EndsAt
			policyBump = true
		}
		if err := coupons.ValidateWindow(c.StartsAt, c.EndsAt); err != nil {
			return err
		}
		var productIDs []string
		scopeChanged := false
		if in.Scope != nil {
			scope, err := coupons.NormalizeScope(*in.Scope)
			if err != nil {
				return err
			}
			if scope != c.Scope {
				policyBump = true
				scopeChanged = true
			}
			c.Scope = scope
		}
		if in.ProductIDs != nil {
			scopeChanged = true
			policyBump = true
			productIDs, err = s.validateProductIDs(ctx, storeID, c.Scope, *in.ProductIDs)
			if err != nil {
				return err
			}
		} else if scopeChanged && c.Scope == coupons.ScopeSelectedProducts {
			productIDs, err = s.Store.ListProductScopes(ctx, c.ID)
			if err != nil {
				return err
			}
			if len(productIDs) == 0 {
				return coupons.ErrProductsRequired
			}
		}
		if c.Scope == coupons.ScopeAllProducts {
			productIDs = nil
		}
		if policyBump {
			c.PolicyVersion++
		}
		c.Version++
		c.UpdatedAt = s.now()
		ok, err := s.Store.UpdateCoupon(ctx, c, in.ExpectedVersion)
		if err != nil {
			if s.Store.IsUniqueViolation(err) {
				return coupons.ErrCodeConflict
			}
			return err
		}
		if !ok {
			return coupons.ErrVersionConflict
		}
		if scopeChanged || in.ProductIDs != nil {
			if err := s.Store.ReplaceProductScopes(ctx, c.ID, storeID, productIDs); err != nil {
				return err
			}
		}
		ids, _ := s.Store.ListProductScopes(ctx, c.ID)
		c.ProductIDs = ids
		out = c
		return nil
	})
	if err != nil {
		if ae, ok := apperr.AsAppError(err); ok {
			return coupons.Coupon{}, ae
		}
		return coupons.Coupon{}, apperr.Internal(apperr.CodeInternalError, "Update coupon failed")
	}
	return out, nil
}

// ActivateCoupon DRAFT|PAUSED → ACTIVE (idempotent if already ACTIVE).
func (s *CouponService) ActivateCoupon(ctx context.Context, userID, storeID, couponID string) (coupons.Coupon, error) {
	return s.transition(ctx, userID, storeID, couponID, coupons.StateActive, true)
}

// PauseCoupon ACTIVE → PAUSED (idempotent if already PAUSED).
func (s *CouponService) PauseCoupon(ctx context.Context, userID, storeID, couponID string) (coupons.Coupon, error) {
	return s.transition(ctx, userID, storeID, couponID, coupons.StatePaused, false)
}

// ArchiveCoupon → ARCHIVED (idempotent).
func (s *CouponService) ArchiveCoupon(ctx context.Context, userID, storeID, couponID string) (coupons.Coupon, error) {
	return s.transition(ctx, userID, storeID, couponID, coupons.StateArchived, false)
}

func (s *CouponService) transition(ctx context.Context, userID, storeID, couponID string, to coupons.State, activating bool) (coupons.Coupon, error) {
	if _, err := s.requireStoreAccess(ctx, userID, storeID); err != nil {
		return coupons.Coupon{}, err
	}
	var out coupons.Coupon
	err := s.Store.WithTx(ctx, func(ctx context.Context) error {
		c, err := s.Store.GetCouponByID(ctx, storeID, couponID)
		if err != nil {
			if s.Store.IsNotFound(err) {
				return coupons.ErrNotFound
			}
			return err
		}
		if c.State == to {
			ids, _ := s.Store.ListProductScopes(ctx, c.ID)
			c.ProductIDs = ids
			out = c
			return nil
		}
		if !coupons.CanTransition(c.State, to) {
			return coupons.ErrStateInvalid
		}
		if activating {
			if err := s.validateForActivation(ctx, c); err != nil {
				return err
			}
			// Auto-expire if window already ended.
			if c.EndsAt != nil && s.now().After(c.EndsAt.UTC()) {
				return coupons.ErrCannotActivate
			}
		}
		expected := c.Version
		c.State = to
		c.Version++
		c.UpdatedAt = s.now()
		ok, err := s.Store.UpdateCoupon(ctx, c, expected)
		if err != nil {
			return err
		}
		if !ok {
			return coupons.ErrVersionConflict
		}
		ids, _ := s.Store.ListProductScopes(ctx, c.ID)
		c.ProductIDs = ids
		out = c
		return nil
	})
	if err != nil {
		if ae, ok := apperr.AsAppError(err); ok {
			return coupons.Coupon{}, ae
		}
		return coupons.Coupon{}, apperr.Internal(apperr.CodeInternalError, "Coupon state transition failed")
	}
	return out, nil
}

func (s *CouponService) validateForActivation(ctx context.Context, c coupons.Coupon) error {
	if err := coupons.ValidateDiscountValue(c.DiscountKind, c.DiscountValue); err != nil {
		return err
	}
	if err := coupons.ValidateWindow(c.StartsAt, c.EndsAt); err != nil {
		return err
	}
	if c.Scope == coupons.ScopeSelectedProducts {
		ids, err := s.Store.ListProductScopes(ctx, c.ID)
		if err != nil {
			return err
		}
		if len(ids) == 0 {
			return coupons.ErrProductsRequired
		}
		for _, pid := range ids {
			ok, err := s.Store.ProductOwnedByStore(ctx, c.StoreID, pid)
			if err != nil {
				return err
			}
			if !ok {
				return coupons.ErrProductNotInStore
			}
		}
	}
	return nil
}

// --- checkout eligibility / quote / reserve ---

// QuoteRequest is POST /v1/checkout/quote (or apply-coupon). Client discount ignored.
type QuoteRequest struct {
	StoreID           string
	ProductID         string
	// MerchandiseIDR optional override after server reloads product; if 0, use product price.
	MerchandiseIDR    int64
	TipIDR            int64
	UpsellIDR         int64
	CouponCode        string
	ClientDiscountIDR int64 // ignored
	BuyerIdentityHash string
}

// QuoteResult is the authoritative priced snapshot.
type QuoteResult struct {
	Price coupons.PriceSnapshot
}

// Quote reloads product price, evaluates coupon eligibility, returns server price.
// Never trusts ClientDiscountIDR. Does not reserve a slot.
func (s *CouponService) Quote(ctx context.Context, req QuoteRequest) (QuoteResult, error) {
	if req.StoreID == "" || req.ProductID == "" {
		return QuoteResult{}, apperr.Validation(apperr.CodeValidationFailed, "storeId and productId are required")
	}
	price, status, err := s.Store.GetProductPrice(ctx, req.StoreID, req.ProductID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return QuoteResult{}, coupons.ErrNotFound
		}
		return QuoteResult{}, apperr.Internal(apperr.CodeInternalError, "Product lookup failed")
	}
	if status != "published" {
		return QuoteResult{}, coupons.ErrNotFound
	}
	merch := price
	if req.MerchandiseIDR > 0 {
		// PWYT path: caller may pass amount; must be >= product price minimum later (BE-310).
		// For BE-215, allow override only if >= catalog price when not free.
		merch = req.MerchandiseIDR
	}
	if merch < 0 {
		merch = 0
	}
	// Explicitly ignore client discount.
	_ = req.ClientDiscountIDR

	snap := coupons.BuildPriceSnapshot(req.StoreID, req.ProductID, merch, req.TipIDR, req.UpsellIDR, nil, false)
	code := strings.TrimSpace(req.CouponCode)
	if code == "" {
		return QuoteResult{Price: snap}, nil
	}
	c, ok, reason := s.evaluateEligibility(ctx, req.StoreID, req.ProductID, merch, code, req.BuyerIdentityHash, s.now())
	if !ok {
		snap.CouponUnavailable = true
		_ = reason
		return QuoteResult{Price: snap}, nil
	}
	snap = coupons.BuildPriceSnapshot(req.StoreID, req.ProductID, merch, req.TipIDR, req.UpsellIDR, &c, true)
	return QuoteResult{Price: snap}, nil
}

func (s *CouponService) evaluateEligibility(
	ctx context.Context,
	storeID, productID string,
	merchandiseIDR int64,
	rawCode, buyerHash string,
	now time.Time,
) (coupons.Coupon, bool, string) {
	norm := coupons.NormalizeCode(rawCode)
	if err := coupons.ValidateCode(norm); err != nil {
		return coupons.Coupon{}, false, "invalid_code"
	}
	c, err := s.Store.GetCouponByNormalizedCode(ctx, storeID, norm)
	if err != nil {
		return coupons.Coupon{}, false, "not_found"
	}
	if c.State != coupons.StateActive {
		return coupons.Coupon{}, false, "inactive"
	}
	if !coupons.WindowActive(c, now) {
		return coupons.Coupon{}, false, "window"
	}
	if !coupons.MeetsMinimum(c, merchandiseIDR) {
		return coupons.Coupon{}, false, "minimum"
	}
	scoped, err := s.Store.ProductScopeSet(ctx, c.ID)
	if err != nil {
		return coupons.Coupon{}, false, "scope_err"
	}
	if !coupons.ProductInScope(c, productID, scoped) {
		return coupons.Coupon{}, false, "scope"
	}
	if coupons.GlobalLimitReached(c) {
		return coupons.Coupon{}, false, "global_limit"
	}
	if c.MaxPerCustomerUses != nil && buyerHash != "" {
		n, err := s.Store.CountBuyerCouponUsage(ctx, c.ID, buyerHash)
		if err != nil {
			return coupons.Coupon{}, false, "buyer_limit_err"
		}
		if n >= *c.MaxPerCustomerUses {
			return coupons.Coupon{}, false, "buyer_limit"
		}
	}
	return c, true, ""
}

// ReserveRequest creates a checkout coupon reservation (foundation for BE-310).
type ReserveRequest struct {
	StoreID           string
	ProductID         string
	OrderID           string
	IdempotencyKey    string
	MerchandiseIDR    int64
	TipIDR            int64
	UpsellIDR         int64
	CouponCode        string
	ClientDiscountIDR int64 // ignored
	BuyerIdentityHash string
	TTL               time.Duration
}

// ReserveResult is reservation + price snapshot.
type ReserveResult struct {
	Reservation coupons.Reservation
	Price       coupons.PriceSnapshot
	Replayed    bool
}

// Reserve locks the coupon row, checks limits, inserts reservation with uniqueness.
// Same (coupon_id, idempotency_key) returns the existing reservation (idempotent).
func (s *CouponService) Reserve(ctx context.Context, req ReserveRequest) (ReserveResult, error) {
	if req.StoreID == "" || req.ProductID == "" || req.OrderID == "" || req.IdempotencyKey == "" {
		return ReserveResult{}, apperr.Validation(apperr.CodeValidationFailed, "storeId, productId, orderId, and Idempotency-Key are required")
	}
	if strings.TrimSpace(req.CouponCode) == "" {
		return ReserveResult{}, coupons.ErrCouponUnavailable
	}
	_ = req.ClientDiscountIDR // never authoritative

	// Reload product price authority.
	price, status, err := s.Store.GetProductPrice(ctx, req.StoreID, req.ProductID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return ReserveResult{}, coupons.ErrNotFound
		}
		return ReserveResult{}, apperr.Internal(apperr.CodeInternalError, "Product lookup failed")
	}
	if status != "published" {
		return ReserveResult{}, coupons.ErrNotFound
	}
	merch := price
	if req.MerchandiseIDR > 0 {
		merch = req.MerchandiseIDR
	}
	ttl := req.TTL
	if ttl <= 0 {
		ttl = DefaultReservationTTL
	}
	now := s.now()
	norm := coupons.NormalizeCode(req.CouponCode)

	var result ReserveResult
	err = s.Store.WithTx(ctx, func(ctx context.Context) error {
		// Resolve coupon by code then lock by id.
		c0, err := s.Store.GetCouponByNormalizedCode(ctx, req.StoreID, norm)
		if err != nil {
			return coupons.ErrCouponUnavailable
		}
		// Idempotency: same key → same reservation.
		if existing, err := s.Store.GetReservationByIdempotency(ctx, c0.ID, req.IdempotencyKey); err == nil {
			snap := coupons.PriceSnapshot{
				StoreID:             existing.StoreID,
				ProductID:           req.ProductID,
				CouponID:            existing.CouponID,
				CouponCode:          existing.CodeSnapshot,
				CouponPolicyVersion: existing.CouponPolicyVersion,
				DiscountKind:        existing.DiscountKind,
				DiscountValue:       existing.DiscountValue,
				EligibleSubtotalIDR: existing.EligibleSubtotalIDR,
				DiscountIDR:         existing.DiscountIDR,
				MerchandiseIDR:      existing.MerchandiseIDR,
				TipIDR:              existing.TipIDR,
				UpsellIDR:           existing.UpsellIDR,
				GrossIDR:            existing.GrossIDR,
				CouponApplied:       true,
			}
			result = ReserveResult{Reservation: existing, Price: snap, Replayed: true}
			return nil
		} else if !s.Store.IsNotFound(err) {
			return err
		}

		c, err := s.Store.LockCouponForReserve(ctx, c0.ID)
		if err != nil {
			return coupons.ErrCouponUnavailable
		}
		if c.StoreID != req.StoreID {
			return coupons.ErrCouponUnavailable
		}
		if c.State != coupons.StateActive || !coupons.WindowActive(c, now) || !coupons.MeetsMinimum(c, merch) {
			return coupons.ErrCouponUnavailable
		}
		scoped, err := s.Store.ProductScopeSet(ctx, c.ID)
		if err != nil {
			return err
		}
		if !coupons.ProductInScope(c, req.ProductID, scoped) {
			return coupons.ErrCouponUnavailable
		}
		if coupons.GlobalLimitReached(c) {
			return coupons.ErrReservationLimit
		}
		var buyerPtr *string
		if req.BuyerIdentityHash != "" {
			buyerPtr = &req.BuyerIdentityHash
			if c.MaxPerCustomerUses != nil {
				n, err := s.Store.CountBuyerCouponUsage(ctx, c.ID, req.BuyerIdentityHash)
				if err != nil {
					return err
				}
				if n >= *c.MaxPerCustomerUses {
					return coupons.ErrReservationLimit
				}
			}
		}
		snap := coupons.BuildPriceSnapshot(req.StoreID, req.ProductID, merch, req.TipIDR, req.UpsellIDR, &c, true)
		if !snap.CouponApplied {
			return coupons.ErrCouponUnavailable
		}
		pid := req.ProductID
		rid := s.IDs.New()
		if !strings.HasPrefix(rid, "cpr_") {
			rid = "cpr_" + rid
		}
		res := coupons.Reservation{
			ID:                  rid,
			CouponID:            c.ID,
			CouponPolicyVersion: c.PolicyVersion,
			StoreID:             req.StoreID,
			OrderID:             req.OrderID,
			IdempotencyKey:      req.IdempotencyKey,
			BuyerIdentityHash:   buyerPtr,
			ProductID:           &pid,
			DiscountKind:        c.DiscountKind,
			DiscountValue:       c.DiscountValue,
			DiscountIDR:         snap.DiscountIDR,
			EligibleSubtotalIDR: snap.EligibleSubtotalIDR,
			MerchandiseIDR:      snap.MerchandiseIDR,
			TipIDR:              snap.TipIDR,
			UpsellIDR:           snap.UpsellIDR,
			GrossIDR:            snap.GrossIDR,
			CodeSnapshot:        c.CodeDisplay,
			State:               coupons.ReservationReserved,
			ExpiresAt:           now.Add(ttl),
			CreatedAt:           now,
			UpdatedAt:           now,
		}
		if err := s.Store.InsertReservation(ctx, res); err != nil {
			if s.Store.IsUniqueViolation(err) {
				// Race on order_id or idempotency: try replay by idempotency.
				if existing, e2 := s.Store.GetReservationByIdempotency(ctx, c.ID, req.IdempotencyKey); e2 == nil {
					result = ReserveResult{Reservation: existing, Price: snap, Replayed: true}
					return nil
				}
				return coupons.ErrReservationLimit
			}
			return err
		}
		if err := s.Store.AdjustCouponCounters(ctx, c.ID, 1, 0); err != nil {
			return err
		}
		result = ReserveResult{Reservation: res, Price: snap, Replayed: false}
		return nil
	})
	if err != nil {
		if ae, ok := apperr.AsAppError(err); ok {
			return ReserveResult{}, ae
		}
		return ReserveResult{}, apperr.Internal(apperr.CodeInternalError, "Coupon reservation failed")
	}
	return result, nil
}

// ReleaseReservation is idempotent: RESERVED|HELD_UNKNOWN → RELEASED and frees global slot.
// CONSUMED is never released. Already RELEASED is a no-op success.
func (s *CouponService) ReleaseReservation(ctx context.Context, reservationID string) (coupons.Reservation, error) {
	if reservationID == "" {
		return coupons.Reservation{}, coupons.ErrNotFound
	}
	var out coupons.Reservation
	err := s.Store.WithTx(ctx, func(ctx context.Context) error {
		r, err := s.Store.GetReservationByID(ctx, reservationID)
		if err != nil {
			if s.Store.IsNotFound(err) {
				return coupons.ErrNotFound
			}
			return err
		}
		if r.State == coupons.ReservationReleased {
			out = r
			return nil
		}
		if r.State == coupons.ReservationConsumed {
			return coupons.ErrReservationState
		}
		// Lock coupon while freeing slot.
		if _, err := s.Store.LockCouponForReserve(ctx, r.CouponID); err != nil {
			return err
		}
		now := s.now()
		ok, err := s.Store.UpdateReservationState(ctx, r.ID, r.State, coupons.ReservationReleased, now)
		if err != nil {
			return err
		}
		if !ok {
			// concurrent transition
			r2, err := s.Store.GetReservationByID(ctx, reservationID)
			if err != nil {
				return err
			}
			if r2.State == coupons.ReservationReleased {
				out = r2
				return nil
			}
			return coupons.ErrReservationState
		}
		if err := s.Store.AdjustCouponCounters(ctx, r.CouponID, -1, 0); err != nil {
			return err
		}
		r.State = coupons.ReservationReleased
		r.ReleasedAt = &now
		r.UpdatedAt = now
		out = r
		return nil
	})
	if err != nil {
		if ae, ok := apperr.AsAppError(err); ok {
			return coupons.Reservation{}, ae
		}
		return coupons.Reservation{}, apperr.Internal(apperr.CodeInternalError, "Release reservation failed")
	}
	return out, nil
}

// ConvertReservationToRedemption is the payment-finalization hook for BE-310/330.
// RESERVED|HELD_UNKNOWN → CONSUMED + immutable redemption. Idempotent on replay.
func (s *CouponService) ConvertReservationToRedemption(ctx context.Context, reservationID string) (coupons.Redemption, error) {
	if reservationID == "" {
		return coupons.Redemption{}, coupons.ErrNotFound
	}
	var out coupons.Redemption
	err := s.Store.WithTx(ctx, func(ctx context.Context) error {
		r, err := s.Store.GetReservationByID(ctx, reservationID)
		if err != nil {
			if s.Store.IsNotFound(err) {
				return coupons.ErrNotFound
			}
			return err
		}
		if existing, err := s.Store.GetRedemptionByReservation(ctx, reservationID); err == nil {
			out = existing
			return nil
		} else if !s.Store.IsNotFound(err) {
			return err
		}
		if r.State == coupons.ReservationReleased {
			// Late paid reclaim is exceptional (BE-330); for foundation reject.
			return coupons.ErrReservationState
		}
		if r.State != coupons.ReservationReserved && r.State != coupons.ReservationHeldUnknown {
			return coupons.ErrReservationState
		}
		if _, err := s.Store.LockCouponForReserve(ctx, r.CouponID); err != nil {
			return err
		}
		now := s.now()
		ok, err := s.Store.UpdateReservationState(ctx, r.ID, r.State, coupons.ReservationConsumed, now)
		if err != nil {
			return err
		}
		if !ok {
			if existing, e2 := s.Store.GetRedemptionByReservation(ctx, reservationID); e2 == nil {
				out = existing
				return nil
			}
			return coupons.ErrReservationState
		}
		// reserved → redeemed: reserved_count -1, redeemed_count +1
		if err := s.Store.AdjustCouponCounters(ctx, r.CouponID, -1, 1); err != nil {
			return err
		}
		redID := s.IDs.New()
		if !strings.HasPrefix(redID, "crd_") {
			redID = "crd_" + redID
		}
		red := coupons.Redemption{
			ID:                  redID,
			ReservationID:       r.ID,
			CouponID:            r.CouponID,
			CouponPolicyVersion: r.CouponPolicyVersion,
			StoreID:             r.StoreID,
			OrderID:             r.OrderID,
			CodeSnapshot:        r.CodeSnapshot,
			DiscountKind:        r.DiscountKind,
			DiscountValue:       r.DiscountValue,
			DiscountIDR:         r.DiscountIDR,
			EligibleSubtotalIDR: r.EligibleSubtotalIDR,
			MerchandiseIDR:      r.MerchandiseIDR,
			TipIDR:              r.TipIDR,
			UpsellIDR:           r.UpsellIDR,
			GrossIDR:            r.GrossIDR,
			BuyerIdentityHash:   r.BuyerIdentityHash,
			ProductID:           r.ProductID,
			CreatedAt:           now,
		}
		if err := s.Store.InsertRedemption(ctx, red); err != nil {
			if s.Store.IsUniqueViolation(err) {
				// Idempotent: same reservation already redeemed.
				if existing, e2 := s.Store.GetRedemptionByReservation(ctx, reservationID); e2 == nil {
					out = existing
					return nil
				}
				// Different reservation already consumed this order_id.
				return coupons.ErrReservationState
			}
			return err
		}
		out = red
		return nil
	})
	if err != nil {
		if ae, ok := apperr.AsAppError(err); ok {
			return coupons.Redemption{}, ae
		}
		return coupons.Redemption{}, apperr.Wrap(apperr.KindInternal, apperr.CodeInternalError, "Convert reservation failed", err)
	}
	return out, nil
}

// ExpireReservations releases expired RESERVED holds (job/function for worker).
// Provider-aware payment lookup is stubbed: we only release when still RESERVED past expires_at.
// BE-310/330 will pass payment state before blind release.
func (s *CouponService) ExpireReservations(ctx context.Context, limit int32) (int, error) {
	if limit <= 0 {
		limit = 50
	}
	now := s.now()
	items, err := s.Store.ListExpiredReservations(ctx, now, limit)
	if err != nil {
		return 0, apperr.Internal(apperr.CodeInternalError, "List expired reservations failed")
	}
	n := 0
	for _, r := range items {
		// Payment-state hook (BE-310): if payment is UNKNOWN/PENDING, retain hold.
		// Foundation: expire only RESERVED past TTL.
		if r.State != coupons.ReservationReserved {
			continue
		}
		if _, err := s.ReleaseReservation(ctx, r.ID); err != nil {
			if s.Log != nil {
				s.Log.Warn("coupon reservation expire", "reservation_id", r.ID, "err", err.Error())
			}
			continue
		}
		n++
	}
	return n, nil
}

// MarkReservationHeldUnknown is the payment UNKNOWN_OUTCOME hook (BE-310/330 stub).
func (s *CouponService) MarkReservationHeldUnknown(ctx context.Context, reservationID string) (coupons.Reservation, error) {
	var out coupons.Reservation
	err := s.Store.WithTx(ctx, func(ctx context.Context) error {
		r, err := s.Store.GetReservationByID(ctx, reservationID)
		if err != nil {
			if s.Store.IsNotFound(err) {
				return coupons.ErrNotFound
			}
			return err
		}
		if r.State == coupons.ReservationHeldUnknown {
			out = r
			return nil
		}
		if r.State != coupons.ReservationReserved {
			return coupons.ErrReservationState
		}
		now := s.now()
		ok, err := s.Store.UpdateReservationState(ctx, r.ID, coupons.ReservationReserved, coupons.ReservationHeldUnknown, now)
		if err != nil {
			return err
		}
		if !ok {
			return coupons.ErrReservationState
		}
		r.State = coupons.ReservationHeldUnknown
		r.UpdatedAt = now
		out = r
		return nil
	})
	if err != nil {
		if ae, ok := apperr.AsAppError(err); ok {
			return coupons.Reservation{}, ae
		}
		return coupons.Reservation{}, apperr.Internal(apperr.CodeInternalError, "Hold reservation failed")
	}
	return out, nil
}
