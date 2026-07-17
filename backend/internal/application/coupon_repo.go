package application

import (
	"context"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/coupons"
)

// CouponStore is the persistence port for BE-215 coupons.
type CouponStore interface {
	WithTx(ctx context.Context, fn func(ctx context.Context) error) error

	GetStoreByID(ctx context.Context, storeID string) (CatalogStoreRow, error)
	UserCanAccessStore(ctx context.Context, userID, storeID string) (bool, error)
	UserIsPlatformAdmin(ctx context.Context, userID string) (bool, error)
	ProductOwnedByStore(ctx context.Context, storeID, productID string) (bool, error)
	GetProductPrice(ctx context.Context, storeID, productID string) (priceIDR int64, status string, err error)

	InsertCoupon(ctx context.Context, c coupons.Coupon) error
	UpdateCoupon(ctx context.Context, c coupons.Coupon, expectedVersion int32) (bool, error)
	GetCouponByID(ctx context.Context, storeID, couponID string) (coupons.Coupon, error)
	GetCouponByNormalizedCode(ctx context.Context, storeID, normalizedCode string) (coupons.Coupon, error)
	ListCouponsByStore(ctx context.Context, storeID string) ([]coupons.Coupon, error)
	// LockCouponForReserve SELECT FOR UPDATE on coupon row (global limit).
	LockCouponForReserve(ctx context.Context, couponID string) (coupons.Coupon, error)
	// CountActiveBuyerReservations counts RESERVED+HELD_UNKNOWN+CONSUMED for per-buyer limit.
	CountBuyerCouponUsage(ctx context.Context, couponID, buyerHash string) (int64, error)

	ReplaceProductScopes(ctx context.Context, couponID, storeID string, productIDs []string) error
	ListProductScopes(ctx context.Context, couponID string) ([]string, error)
	ProductScopeSet(ctx context.Context, couponID string) (map[string]struct{}, error)

	InsertReservation(ctx context.Context, r coupons.Reservation) error
	GetReservationByID(ctx context.Context, id string) (coupons.Reservation, error)
	GetReservationByIdempotency(ctx context.Context, couponID, idempotencyKey string) (coupons.Reservation, error)
	GetReservationByOrder(ctx context.Context, couponID, orderID string) (coupons.Reservation, error)
	UpdateReservationState(ctx context.Context, id string, from, to coupons.ReservationState, now time.Time) (bool, error)
	ListExpiredReservations(ctx context.Context, now time.Time, limit int32) ([]coupons.Reservation, error)
	// AdjustCouponCounters increments reserved/redeemed projections under lock.
	AdjustCouponCounters(ctx context.Context, couponID string, reservedDelta, redeemedDelta int64) error

	InsertRedemption(ctx context.Context, red coupons.Redemption) error
	GetRedemptionByReservation(ctx context.Context, reservationID string) (coupons.Redemption, error)

	IsNotFound(err error) bool
	IsUniqueViolation(err error) bool
}
