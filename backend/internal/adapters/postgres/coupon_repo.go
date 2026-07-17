package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres/gen"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/coupons"
)

type couponTxKey struct{}

// CouponRepo is the Postgres adapter for BE-215 coupons.
// Transactions are stored on context (not shared fields) so concurrent HTTP
// handlers can reserve the last coupon slot safely with row locks.
type CouponRepo struct {
	pool *pgxpool.Pool
	q    *gen.Queries
}

func NewCouponRepo(pool *pgxpool.Pool) *CouponRepo {
	return &CouponRepo{pool: pool, q: gen.New(pool)}
}

func (r *CouponRepo) queries(ctx context.Context) *gen.Queries {
	if tx, ok := ctx.Value(couponTxKey{}).(pgx.Tx); ok && tx != nil {
		return r.q.WithTx(tx)
	}
	return r.q
}

func (r *CouponRepo) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	if _, ok := ctx.Value(couponTxKey{}).(pgx.Tx); ok {
		return fn(ctx)
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("coupon: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	txCtx := context.WithValue(ctx, couponTxKey{}, tx)
	if err := fn(txCtx); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("coupon: commit: %w", err)
	}
	return nil
}

func (r *CouponRepo) IsNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func (r *CouponRepo) IsUniqueViolation(err error) bool {
	var pe *pgconn.PgError
	return errors.As(err, &pe) && pe.Code == "23505"
}

func (r *CouponRepo) GetStoreByID(ctx context.Context, storeID string) (application.CatalogStoreRow, error) {
	row, err := r.queries(ctx).CouponGetStoreByID(ctx, storeID)
	if err != nil {
		return application.CatalogStoreRow{}, err
	}
	return mapCatalogStore(row.ID, row.MerchantID, row.Slug, row.Name, row.Bio, row.Address, row.AccentColor,
		row.Status, row.IsCanonical, row.StorefrontRevision, row.PublishedRevision, row.PublishedRevisionID,
		row.CreatedAt, row.UpdatedAt), nil
}

func (r *CouponRepo) UserCanAccessStore(ctx context.Context, userID, storeID string) (bool, error) {
	return r.queries(ctx).CouponUserCanAccessStore(ctx, gen.CouponUserCanAccessStoreParams{
		ID:     storeID,
		UserID: userID,
	})
}

func (r *CouponRepo) UserIsPlatformAdmin(ctx context.Context, userID string) (bool, error) {
	return r.queries(ctx).CouponUserIsPlatformAdmin(ctx, userID)
}

func (r *CouponRepo) ProductOwnedByStore(ctx context.Context, storeID, productID string) (bool, error) {
	return r.queries(ctx).CouponProductOwnedByStore(ctx, gen.CouponProductOwnedByStoreParams{
		ID:      productID,
		StoreID: storeID,
	})
}

func (r *CouponRepo) GetProductPrice(ctx context.Context, storeID, productID string) (int64, string, error) {
	row, err := r.queries(ctx).CouponGetProductPrice(ctx, gen.CouponGetProductPriceParams{
		ID:      productID,
		StoreID: storeID,
	})
	if err != nil {
		return 0, "", err
	}
	return row.PriceIdr, row.Status, nil
}

func mapDomainCoupon(row gen.Coupon) coupons.Coupon {
	return coupons.Coupon{
		ID:                 row.ID,
		StoreID:            row.StoreID,
		MerchantID:         row.MerchantID,
		CodeDisplay:        row.CodeDisplay,
		NormalizedCode:     row.NormalizedCode,
		CodeHash:           row.CodeHash,
		DiscountKind:       coupons.DiscountKind(row.DiscountKind),
		DiscountValue:      row.DiscountValue,
		MinMerchandiseIDR:  row.MinMerchandiseIdr,
		MaxTotalUses:       row.MaxTotalUses,
		MaxPerCustomerUses: row.MaxPerCustomerUses,
		StartsAt:           pgToTimePtr(row.StartsAt),
		EndsAt:             pgToTimePtr(row.EndsAt),
		State:              coupons.State(row.State),
		Scope:              coupons.Scope(row.Scope),
		Version:            row.Version,
		PolicyVersion:      row.PolicyVersion,
		ReservedCount:      row.ReservedCount,
		RedeemedCount:      row.RedeemedCount,
		CreatedBy:          row.CreatedBy,
		CreatedAt:          row.CreatedAt.UTC(),
		UpdatedAt:          row.UpdatedAt.UTC(),
	}
}

func (r *CouponRepo) InsertCoupon(ctx context.Context, c coupons.Coupon) error {
	return r.queries(ctx).InsertCoupon(ctx, gen.InsertCouponParams{
		ID:                 c.ID,
		StoreID:            c.StoreID,
		MerchantID:         c.MerchantID,
		CodeDisplay:        c.CodeDisplay,
		NormalizedCode:     c.NormalizedCode,
		CodeHash:           c.CodeHash,
		DiscountKind:       string(c.DiscountKind),
		DiscountValue:      c.DiscountValue,
		MinMerchandiseIdr:  c.MinMerchandiseIDR,
		MaxTotalUses:       c.MaxTotalUses,
		MaxPerCustomerUses: c.MaxPerCustomerUses,
		StartsAt:           timePtrToPg(c.StartsAt),
		EndsAt:             timePtrToPg(c.EndsAt),
		State:              string(c.State),
		Scope:              string(c.Scope),
		Version:            c.Version,
		PolicyVersion:      c.PolicyVersion,
		ReservedCount:      c.ReservedCount,
		RedeemedCount:      c.RedeemedCount,
		CreatedBy:          c.CreatedBy,
		CreatedAt:          c.CreatedAt,
		UpdatedAt:          c.UpdatedAt,
	})
}

func (r *CouponRepo) UpdateCoupon(ctx context.Context, c coupons.Coupon, expectedVersion int32) (bool, error) {
	n, err := r.queries(ctx).UpdateCoupon(ctx, gen.UpdateCouponParams{
		ID:                 c.ID,
		CodeDisplay:        c.CodeDisplay,
		NormalizedCode:     c.NormalizedCode,
		CodeHash:           c.CodeHash,
		DiscountKind:       string(c.DiscountKind),
		DiscountValue:      c.DiscountValue,
		MinMerchandiseIdr:  c.MinMerchandiseIDR,
		MaxTotalUses:       c.MaxTotalUses,
		MaxPerCustomerUses: c.MaxPerCustomerUses,
		StartsAt:           timePtrToPg(c.StartsAt),
		EndsAt:             timePtrToPg(c.EndsAt),
		State:              string(c.State),
		Scope:              string(c.Scope),
		Version:            c.Version,
		PolicyVersion:      c.PolicyVersion,
		UpdatedAt:          c.UpdatedAt,
		StoreID:            c.StoreID,
		Version_2:          expectedVersion,
	})
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

func (r *CouponRepo) GetCouponByID(ctx context.Context, storeID, couponID string) (coupons.Coupon, error) {
	row, err := r.queries(ctx).GetCouponByID(ctx, gen.GetCouponByIDParams{
		ID:      couponID,
		StoreID: storeID,
	})
	if err != nil {
		return coupons.Coupon{}, err
	}
	return mapDomainCoupon(row), nil
}

func (r *CouponRepo) GetCouponByNormalizedCode(ctx context.Context, storeID, normalizedCode string) (coupons.Coupon, error) {
	row, err := r.queries(ctx).GetCouponByNormalizedCode(ctx, gen.GetCouponByNormalizedCodeParams{
		StoreID:        storeID,
		NormalizedCode: normalizedCode,
	})
	if err != nil {
		return coupons.Coupon{}, err
	}
	return mapDomainCoupon(row), nil
}

func (r *CouponRepo) ListCouponsByStore(ctx context.Context, storeID string) ([]coupons.Coupon, error) {
	rows, err := r.queries(ctx).ListCouponsByStore(ctx, storeID)
	if err != nil {
		return nil, err
	}
	out := make([]coupons.Coupon, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapDomainCoupon(row))
	}
	return out, nil
}

func (r *CouponRepo) LockCouponForReserve(ctx context.Context, couponID string) (coupons.Coupon, error) {
	row, err := r.queries(ctx).LockCouponForReserve(ctx, couponID)
	if err != nil {
		return coupons.Coupon{}, err
	}
	return mapDomainCoupon(row), nil
}

func (r *CouponRepo) CountBuyerCouponUsage(ctx context.Context, couponID, buyerHash string) (int64, error) {
	return r.queries(ctx).CountBuyerCouponUsage(ctx, gen.CountBuyerCouponUsageParams{
		CouponID:          couponID,
		BuyerIdentityHash: &buyerHash,
	})
}

func (r *CouponRepo) ReplaceProductScopes(ctx context.Context, couponID, storeID string, productIDs []string) error {
	if err := r.queries(ctx).DeleteCouponProductScopes(ctx, couponID); err != nil {
		return err
	}
	for _, pid := range productIDs {
		if err := r.queries(ctx).InsertCouponProductScope(ctx, gen.InsertCouponProductScopeParams{
			CouponID:  couponID,
			ProductID: pid,
			StoreID:   storeID,
		}); err != nil {
			return err
		}
	}
	return nil
}

func (r *CouponRepo) ListProductScopes(ctx context.Context, couponID string) ([]string, error) {
	return r.queries(ctx).ListCouponProductScopes(ctx, couponID)
}

func (r *CouponRepo) ProductScopeSet(ctx context.Context, couponID string) (map[string]struct{}, error) {
	ids, err := r.ListProductScopes(ctx, couponID)
	if err != nil {
		return nil, err
	}
	out := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		out[id] = struct{}{}
	}
	return out, nil
}

func mapDomainReservation(row gen.CouponReservation) coupons.Reservation {
	return coupons.Reservation{
		ID:                  row.ID,
		CouponID:            row.CouponID,
		CouponPolicyVersion: row.CouponPolicyVersion,
		StoreID:             row.StoreID,
		OrderID:             row.OrderID,
		IdempotencyKey:      row.IdempotencyKey,
		BuyerIdentityHash:   row.BuyerIdentityHash,
		ProductID:           row.ProductID,
		DiscountKind:        coupons.DiscountKind(row.DiscountKind),
		DiscountValue:       row.DiscountValue,
		DiscountIDR:         row.DiscountIdr,
		EligibleSubtotalIDR: row.EligibleSubtotalIdr,
		MerchandiseIDR:      row.MerchandiseIdr,
		TipIDR:              row.TipIdr,
		UpsellIDR:           row.UpsellIdr,
		GrossIDR:            row.GrossIdr,
		CodeSnapshot:        row.CodeSnapshot,
		State:               coupons.ReservationState(row.State),
		ExpiresAt:           row.ExpiresAt.UTC(),
		ConsumedAt:          pgToTimePtr(row.ConsumedAt),
		ReleasedAt:          pgToTimePtr(row.ReleasedAt),
		CreatedAt:           row.CreatedAt.UTC(),
		UpdatedAt:           row.UpdatedAt.UTC(),
	}
}

func (r *CouponRepo) InsertReservation(ctx context.Context, res coupons.Reservation) error {
	return r.queries(ctx).InsertCouponReservation(ctx, gen.InsertCouponReservationParams{
		ID:                  res.ID,
		CouponID:            res.CouponID,
		CouponPolicyVersion: res.CouponPolicyVersion,
		StoreID:             res.StoreID,
		OrderID:             res.OrderID,
		IdempotencyKey:      res.IdempotencyKey,
		BuyerIdentityHash:   res.BuyerIdentityHash,
		ProductID:           res.ProductID,
		DiscountKind:        string(res.DiscountKind),
		DiscountValue:       res.DiscountValue,
		DiscountIdr:         res.DiscountIDR,
		EligibleSubtotalIdr: res.EligibleSubtotalIDR,
		MerchandiseIdr:      res.MerchandiseIDR,
		TipIdr:              res.TipIDR,
		UpsellIdr:           res.UpsellIDR,
		GrossIdr:            res.GrossIDR,
		CodeSnapshot:        res.CodeSnapshot,
		State:               string(res.State),
		ExpiresAt:           res.ExpiresAt,
		CreatedAt:           res.CreatedAt,
		UpdatedAt:           res.UpdatedAt,
	})
}

func (r *CouponRepo) GetReservationByID(ctx context.Context, id string) (coupons.Reservation, error) {
	row, err := r.queries(ctx).GetCouponReservationByID(ctx, id)
	if err != nil {
		return coupons.Reservation{}, err
	}
	return mapDomainReservation(row), nil
}

func (r *CouponRepo) GetReservationByIdempotency(ctx context.Context, couponID, idempotencyKey string) (coupons.Reservation, error) {
	row, err := r.queries(ctx).GetCouponReservationByIdempotency(ctx, gen.GetCouponReservationByIdempotencyParams{
		CouponID:       couponID,
		IdempotencyKey: idempotencyKey,
	})
	if err != nil {
		return coupons.Reservation{}, err
	}
	return mapDomainReservation(row), nil
}

func (r *CouponRepo) GetReservationByOrder(ctx context.Context, couponID, orderID string) (coupons.Reservation, error) {
	row, err := r.queries(ctx).GetCouponReservationByOrder(ctx, gen.GetCouponReservationByOrderParams{
		CouponID: couponID,
		OrderID:  orderID,
	})
	if err != nil {
		return coupons.Reservation{}, err
	}
	return mapDomainReservation(row), nil
}

func (r *CouponRepo) UpdateReservationState(ctx context.Context, id string, from, to coupons.ReservationState, now time.Time) (bool, error) {
	n, err := r.queries(ctx).UpdateCouponReservationState(ctx, gen.UpdateCouponReservationStateParams{
		ID:        id,
		State:     string(to),
		UpdatedAt: now,
		State_2:   string(from),
	})
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

func (r *CouponRepo) ListExpiredReservations(ctx context.Context, now time.Time, limit int32) ([]coupons.Reservation, error) {
	rows, err := r.queries(ctx).ListExpiredCouponReservations(ctx, gen.ListExpiredCouponReservationsParams{
		ExpiresAt: now,
		Limit:     limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]coupons.Reservation, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapDomainReservation(row))
	}
	return out, nil
}

func (r *CouponRepo) AdjustCouponCounters(ctx context.Context, couponID string, reservedDelta, redeemedDelta int64) error {
	return r.queries(ctx).AdjustCouponCounters(ctx, gen.AdjustCouponCountersParams{
		ReservedDelta: reservedDelta,
		RedeemedDelta: redeemedDelta,
		ID:            couponID,
	})
}

func mapDomainRedemption(row gen.CouponRedemption) coupons.Redemption {
	return coupons.Redemption{
		ID:                  row.ID,
		ReservationID:       row.ReservationID,
		CouponID:            row.CouponID,
		CouponPolicyVersion: row.CouponPolicyVersion,
		StoreID:             row.StoreID,
		OrderID:             row.OrderID,
		CodeSnapshot:        row.CodeSnapshot,
		DiscountKind:        coupons.DiscountKind(row.DiscountKind),
		DiscountValue:       row.DiscountValue,
		DiscountIDR:         row.DiscountIdr,
		EligibleSubtotalIDR: row.EligibleSubtotalIdr,
		MerchandiseIDR:      row.MerchandiseIdr,
		TipIDR:              row.TipIdr,
		UpsellIDR:           row.UpsellIdr,
		GrossIDR:            row.GrossIdr,
		BuyerIdentityHash:   row.BuyerIdentityHash,
		ProductID:           row.ProductID,
		CreatedAt:           row.CreatedAt.UTC(),
	}
}

func (r *CouponRepo) InsertRedemption(ctx context.Context, red coupons.Redemption) error {
	return r.queries(ctx).InsertCouponRedemption(ctx, gen.InsertCouponRedemptionParams{
		ID:                  red.ID,
		ReservationID:       red.ReservationID,
		CouponID:            red.CouponID,
		CouponPolicyVersion: red.CouponPolicyVersion,
		StoreID:             red.StoreID,
		OrderID:             red.OrderID,
		CodeSnapshot:        red.CodeSnapshot,
		DiscountKind:        string(red.DiscountKind),
		DiscountValue:       red.DiscountValue,
		DiscountIdr:         red.DiscountIDR,
		EligibleSubtotalIdr: red.EligibleSubtotalIDR,
		MerchandiseIdr:      red.MerchandiseIDR,
		TipIdr:              red.TipIDR,
		UpsellIdr:           red.UpsellIDR,
		GrossIdr:            red.GrossIDR,
		BuyerIdentityHash:   red.BuyerIdentityHash,
		ProductID:           red.ProductID,
		CreatedAt:           red.CreatedAt,
	})
}

func (r *CouponRepo) GetRedemptionByReservation(ctx context.Context, reservationID string) (coupons.Redemption, error) {
	row, err := r.queries(ctx).GetCouponRedemptionByReservation(ctx, reservationID)
	if err != nil {
		return coupons.Redemption{}, err
	}
	return mapDomainRedemption(row), nil
}
