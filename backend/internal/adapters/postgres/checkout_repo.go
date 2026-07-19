package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres/gen"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/orders"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/payments"
)

type checkoutTxKey struct{}

// CheckoutRepo is the Postgres adapter for BE-310.
type CheckoutRepo struct {
	pool *pgxpool.Pool
	q    *gen.Queries
}

func NewCheckoutRepo(pool *pgxpool.Pool) *CheckoutRepo {
	return &CheckoutRepo{pool: pool, q: gen.New(pool)}
}

func (r *CheckoutRepo) queries(ctx context.Context) *gen.Queries {
	if tx, ok := ctx.Value(checkoutTxKey{}).(pgx.Tx); ok && tx != nil {
		return r.q.WithTx(tx)
	}
	return r.q
}

func (r *CheckoutRepo) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	if _, ok := ctx.Value(checkoutTxKey{}).(pgx.Tx); ok {
		return fn(ctx)
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("checkout: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	txCtx := context.WithValue(ctx, checkoutTxKey{}, tx)
	if err := fn(txCtx); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("checkout: commit: %w", err)
	}
	return nil
}

func (r *CheckoutRepo) IsNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func (r *CheckoutRepo) IsUniqueViolation(err error) bool {
	var pe *pgconn.PgError
	return errors.As(err, &pe) && pe.Code == "23505"
}

func (r *CheckoutRepo) GetProduct(ctx context.Context, storeID, productID string) (application.CheckoutProduct, error) {
	row, err := r.queries(ctx).CheckoutGetProduct(ctx, gen.CheckoutGetProductParams{
		ID:      productID,
		StoreID: storeID,
	})
	if err != nil {
		return application.CheckoutProduct{}, err
	}
	p := application.CheckoutProduct{
		ID:          row.ID,
		StoreID:     row.StoreID,
		MerchantID:  row.MerchantID,
		Slug:        row.Slug,
		Title:       row.Title,
		Short:       row.Short,
		Description: row.Description,
		PriceIDR:    row.PriceIdr,
		Type:        row.Type,
		Status:      row.Status,
		Version:     row.Version,
		AllowPWYT:   row.AllowPwyt,
	}
	if row.MinimumPriceIdr != nil {
		p.MinimumPriceIDR = row.MinimumPriceIdr
	}
	if row.PublishedAt.Valid {
		t := row.PublishedAt.Time
		p.PublishedAt = &t
	}
	return p, nil
}

func (r *CheckoutRepo) GetStore(ctx context.Context, storeID string) (application.CheckoutStoreRow, error) {
	row, err := r.queries(ctx).CheckoutGetStore(ctx, storeID)
	if err != nil {
		return application.CheckoutStoreRow{}, err
	}
	return application.CheckoutStoreRow{
		ID:         row.ID,
		Name:       row.Name,
		MerchantID: row.MerchantID,
	}, nil
}

func (r *CheckoutRepo) InsertOrder(ctx context.Context, o application.CheckoutOrder) error {
	return r.queries(ctx).CheckoutInsertOrder(ctx, gen.CheckoutInsertOrderParams{
		ID:                  o.ID,
		OrderNumber:         o.OrderNumber,
		StoreID:             o.StoreID,
		MerchantID:          o.MerchantID,
		BuyerUserID:         o.BuyerUserID,
		BuyerEmail:          o.BuyerEmail,
		BuyerName:           o.BuyerName,
		PaymentStatus:       o.PaymentStatus,
		OrderStatus:         o.OrderStatus,
		Source:              o.Source,
		PaymentMode:         o.PaymentMode,
		Currency:            o.Currency,
		SubtotalIdr:         o.SubtotalIDR,
		DiscountIdr:         o.DiscountIDR,
		TipIdr:              o.TipIDR,
		FeeIdr:              o.FeeIDR,
		GrossIdr:            o.GrossIDR,
		MerchantNetIdr:      o.MerchantNetIDR,
		CouponCode:          o.CouponCode,
		CouponVersion:       o.CouponVersion,
		FeeSnapshotID:       o.FeeSnapshotID,
		CouponReservationID: o.CouponReservationID,
		PublicTokenHash:     o.PublicTokenHash,
		BuyerSessionID:      o.BuyerSessionID,
		ExpiresAt:           timePtrToPg(o.ExpiresAt),
		IdempotencyKeyHash:  o.IdempotencyKeyHash,
		PaidAt:              timePtrToPg(o.PaidAt),
		CreatedAt:           o.CreatedAt,
		UpdatedAt:           o.UpdatedAt,
	})
}

func (r *CheckoutRepo) GetOrderByID(ctx context.Context, id string) (application.CheckoutOrder, error) {
	row, err := r.queries(ctx).CheckoutGetOrderByID(ctx, id)
	if err != nil {
		return application.CheckoutOrder{}, err
	}
	return mapCheckoutOrder(row), nil
}

func (r *CheckoutRepo) UpdateOrderStatus(ctx context.Context, id, paymentStatus, orderStatus string, now time.Time) error {
	return r.queries(ctx).CheckoutUpdateOrderStatus(ctx, gen.CheckoutUpdateOrderStatusParams{
		ID:            id,
		PaymentStatus: paymentStatus,
		OrderStatus:   orderStatus,
		UpdatedAt:     now,
	})
}

func (r *CheckoutRepo) InsertOrderItem(ctx context.Context, it orders.OrderItem) error {
	// Reuse delivery insert for order_items schema compatibility.
	return r.queries(ctx).DeliveryInsertOrderItem(ctx, gen.DeliveryInsertOrderItemParams{
		ID:                    it.ID,
		OrderID:               it.OrderID,
		StoreID:               it.StoreID,
		MerchantID:            it.MerchantID,
		ProductID:             it.ProductID,
		ProductVersion:        it.ProductVersion,
		ProductTitle:          it.ProductTitle,
		ProductType:           it.ProductType,
		UnitPriceIdr:          it.UnitPriceIDR,
		Quantity:              it.Quantity,
		LineSubtotalIdr:       it.LineSubtotalIDR,
		DiscountAllocationIdr: it.DiscountAllocationIDR,
		LineTotalIdr:          it.LineTotalIDR,
		DeliveryKind:          it.DeliveryKind,
		StockReservationID:    it.StockReservationID,
		StockItemID:           it.StockItemID,
		ObjectID:              it.ObjectID,
		CreatedAt:             it.CreatedAt,
	})
}

func (r *CheckoutRepo) ListOrderItems(ctx context.Context, orderID string) ([]orders.OrderItem, error) {
	rows, err := r.queries(ctx).DeliveryListOrderItems(ctx, orderID)
	if err != nil {
		return nil, err
	}
	out := make([]orders.OrderItem, 0, len(rows))
	for _, row := range rows {
		out = append(out, orders.OrderItem{
			ID:                    row.ID,
			OrderID:               row.OrderID,
			StoreID:               row.StoreID,
			MerchantID:            row.MerchantID,
			ProductID:             row.ProductID,
			ProductVersion:        row.ProductVersion,
			ProductTitle:          row.ProductTitle,
			ProductType:           row.ProductType,
			UnitPriceIDR:          row.UnitPriceIdr,
			Quantity:              row.Quantity,
			LineSubtotalIDR:       row.LineSubtotalIdr,
			DiscountAllocationIDR: row.DiscountAllocationIdr,
			LineTotalIDR:          row.LineTotalIdr,
			DeliveryKind:          row.DeliveryKind,
			StockReservationID:    row.StockReservationID,
			StockItemID:           row.StockItemID,
			ObjectID:              row.ObjectID,
			CreatedAt:             row.CreatedAt,
		})
	}
	return out, nil
}

func (r *CheckoutRepo) InsertPaymentIntent(ctx context.Context, pi payments.Intent) error {
	return r.queries(ctx).CheckoutInsertPaymentIntent(ctx, gen.CheckoutInsertPaymentIntentParams{
		ID:                     pi.ID,
		OrderID:                pi.OrderID,
		StoreID:                pi.StoreID,
		MerchantID:             pi.MerchantID,
		PaymentMode:            pi.PaymentMode,
		Source:                 pi.Source,
		Provider:               pi.Provider,
		AccountScope:           pi.AccountScope,
		ProviderReference:      pi.ProviderReference,
		ExternalID:             pi.ExternalID,
		AmountIdr:              pi.AmountIDR,
		Currency:               pi.Currency,
		FeeSnapshotID:          pi.FeeSnapshotID,
		CouponReservationID:    pi.CouponReservationID,
		StockReservationID:     pi.StockReservationID,
		Status:                 pi.Status,
		ProviderFinancialState: pi.ProviderFinancialState,
		QrString:               pi.QRString,
		QrImageUrl:             pi.QRImageURL,
		ExpiresAt:              pi.ExpiresAt,
		CancelRequestedAt:      timePtrToPg(pi.CancelRequestedAt),
		ExpireRequestedAt:      timePtrToPg(pi.ExpireRequestedAt),
		CancelReason:           pi.CancelReason,
		ExpireReason:           pi.ExpireReason,
		UnknownOperation:       pi.UnknownOperation,
		LookupScheduledAt:      timePtrToPg(pi.LookupScheduledAt),
		LookupAttempts:         pi.LookupAttempts,
		PaidLate:               pi.PaidLate,
		PrecedingStatus:        pi.PrecedingStatus,
		BuyerUserID:            pi.BuyerUserID,
		BuyerEmail:             pi.BuyerEmail,
		BuyerSessionID:         pi.BuyerSessionID,
		PublicTokenHash:        pi.PublicTokenHash,
		IdempotencyKeyHash:     pi.IdempotencyKeyHash,
		RequestHash:            pi.RequestHash,
		ProductSnapshot:        pi.ProductSnapshot,
		PriceSnapshot:          pi.PriceSnapshot,
		Version:                pi.Version,
		CreatedAt:              pi.CreatedAt,
		UpdatedAt:              pi.UpdatedAt,
	})
}

func (r *CheckoutRepo) GetPaymentIntentByID(ctx context.Context, id string) (payments.Intent, error) {
	row, err := r.queries(ctx).CheckoutGetPaymentIntentByID(ctx, id)
	if err != nil {
		return payments.Intent{}, err
	}
	return mapCheckoutPaymentIntent(row), nil
}

func (r *CheckoutRepo) GetPaymentIntentByOrder(ctx context.Context, orderID string) (payments.Intent, error) {
	row, err := r.queries(ctx).CheckoutGetPaymentIntentByOrder(ctx, orderID)
	if err != nil {
		return payments.Intent{}, err
	}
	return mapCheckoutPaymentIntent(gen.CheckoutGetPaymentIntentByIDRow(row)), nil
}

func (r *CheckoutRepo) GetPaymentIntentByIdempotency(ctx context.Context, source, mode, keyHash string) (payments.Intent, error) {
	row, err := r.queries(ctx).CheckoutGetPaymentIntentByIdempotency(ctx, gen.CheckoutGetPaymentIntentByIdempotencyParams{
		Source:             source,
		PaymentMode:        mode,
		IdempotencyKeyHash: keyHash,
	})
	if err != nil {
		return payments.Intent{}, err
	}
	return mapCheckoutPaymentIntent(gen.CheckoutGetPaymentIntentByIDRow(row)), nil
}

func (r *CheckoutRepo) UpdatePaymentIntentStatus(ctx context.Context, id, fromStatus, toStatus string, patch application.PaymentIntentPatch, now time.Time) (payments.Intent, error) {
	row, err := r.queries(ctx).CheckoutUpdatePaymentIntentStatus(ctx, gen.CheckoutUpdatePaymentIntentStatusParams{
		ID:                id,
		Status:            toStatus,
		UpdatedAt:         now,
		ProviderReference: patch.ProviderReference,
		QrString:          patch.QRString,
		QrImageUrl:        patch.QRImageURL,
		ExpireRequestedAt: timePtrToPg(patch.ExpireRequestedAt),
		ExpireReason:      patch.ExpireReason,
		CancelRequestedAt: timePtrToPg(patch.CancelRequestedAt),
		CancelReason:      patch.CancelReason,
		UnknownOperation:  patch.UnknownOperation,
		LookupScheduledAt: timePtrToPg(patch.LookupScheduledAt),
		LookupAttempts:    patch.LookupAttempts,
		PrecedingStatus:   patch.PrecedingStatus,
		FromStatus:        fromStatus,
	})
	if err != nil {
		return payments.Intent{}, err
	}
	return mapCheckoutPaymentIntent(gen.CheckoutGetPaymentIntentByIDRow(row)), nil
}

func (r *CheckoutRepo) ForceUpdatePaymentIntent(ctx context.Context, id, toStatus string, patch application.PaymentIntentPatch, now time.Time) (payments.Intent, error) {
	row, err := r.queries(ctx).CheckoutForceUpdatePaymentIntent(ctx, gen.CheckoutForceUpdatePaymentIntentParams{
		ID:                id,
		Status:            toStatus,
		UpdatedAt:         now,
		ProviderReference: patch.ProviderReference,
		QrString:          patch.QRString,
		QrImageUrl:        patch.QRImageURL,
		ExpireRequestedAt: timePtrToPg(patch.ExpireRequestedAt),
		ExpireReason:      patch.ExpireReason,
		UnknownOperation:  patch.UnknownOperation,
		LookupScheduledAt: timePtrToPg(patch.LookupScheduledAt),
		LookupAttempts:    patch.LookupAttempts,
		PrecedingStatus:   patch.PrecedingStatus,
	})
	if err != nil {
		return payments.Intent{}, err
	}
	return mapCheckoutPaymentIntent(gen.CheckoutGetPaymentIntentByIDRow(row)), nil
}

func (r *CheckoutRepo) TryInsertIdempotency(ctx context.Context, rec application.IdempotencyRecord) (application.IdempotencyRecord, bool, error) {
	row, err := r.queries(ctx).CheckoutTryInsertIdempotency(ctx, gen.CheckoutTryInsertIdempotencyParams{
		ID:             rec.ID,
		SubjectType:    rec.SubjectType,
		SubjectID:      rec.SubjectID,
		Operation:      rec.Operation,
		PaymentMode:    rec.PaymentMode,
		KeyHash:        rec.KeyHash,
		RequestHash:    rec.RequestHash,
		Status:         rec.Status,
		ResourceType:   rec.ResourceType,
		ResourceID:     rec.ResourceID,
		ResponseStatus: rec.ResponseStatus,
		ResponseBody:   rec.ResponseBody,
		RequestID:      rec.RequestID,
		LeaseExpiresAt: timePtrToPg(rec.LeaseExpiresAt),
		ExpiresAt:      rec.ExpiresAt,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return application.IdempotencyRecord{}, false, nil
		}
		return application.IdempotencyRecord{}, false, err
	}
	return mapIdempotencyRecord(row), true, nil
}

func (r *CheckoutRepo) GetIdempotency(ctx context.Context, subjectType, subjectID, operation string, paymentMode *string, keyHash string) (application.IdempotencyRecord, error) {
	row, err := r.queries(ctx).CheckoutGetIdempotency(ctx, gen.CheckoutGetIdempotencyParams{
		SubjectType: subjectType,
		SubjectID:   subjectID,
		Operation:   operation,
		PaymentMode: paymentMode,
		KeyHash:     keyHash,
	})
	if err != nil {
		return application.IdempotencyRecord{}, err
	}
	return mapIdempotencyRecord(row), nil
}

func (r *CheckoutRepo) CompleteIdempotency(ctx context.Context, id, status string, resourceType, resourceID *string, responseStatus int32, body json.RawMessage) (application.IdempotencyRecord, error) {
	row, err := r.queries(ctx).CheckoutCompleteIdempotency(ctx, gen.CheckoutCompleteIdempotencyParams{
		ID:             id,
		Status:         status,
		ResourceType:   resourceType,
		ResourceID:     resourceID,
		ResponseStatus: &responseStatus,
		ResponseBody:   body,
	})
	if err != nil {
		return application.IdempotencyRecord{}, err
	}
	return mapIdempotencyRecord(row), nil
}

func (r *CheckoutRepo) InsertOutbox(ctx context.Context, id, topic string, payload []byte, dedupeKey *string, paymentMode *string, availableAt time.Time) error {
	return r.queries(ctx).CheckoutInsertOutbox(ctx, gen.CheckoutInsertOutboxParams{
		ID:          id,
		Topic:       topic,
		Payload:     payload,
		AvailableAt: availableAt,
		DedupeKey:   dedupeKey,
		PaymentMode: paymentMode,
	})
}

// --- mappers ---

func mapCheckoutOrder(row gen.CheckoutGetOrderByIDRow) application.CheckoutOrder {
	o := application.CheckoutOrder{
		Order: orders.Order{
			ID:             row.ID,
			OrderNumber:    row.OrderNumber,
			StoreID:        row.StoreID,
			MerchantID:     row.MerchantID,
			BuyerUserID:    row.BuyerUserID,
			BuyerEmail:     row.BuyerEmail,
			BuyerName:      row.BuyerName,
			PaymentStatus:  row.PaymentStatus,
			Source:         row.Source,
			Currency:       row.Currency,
			SubtotalIDR:    row.SubtotalIdr,
			DiscountIDR:    row.DiscountIdr,
			TipIDR:         row.TipIdr,
			FeeIDR:         row.FeeIdr,
			GrossIDR:       row.GrossIdr,
			MerchantNetIDR: row.MerchantNetIdr,
			CouponCode:     row.CouponCode,
			CouponVersion:  row.CouponVersion,
			CreatedAt:      row.CreatedAt,
			UpdatedAt:      row.UpdatedAt,
		},
		OrderStatus:         row.OrderStatus,
		PaymentMode:         row.PaymentMode,
		FeeSnapshotID:       row.FeeSnapshotID,
		CouponReservationID: row.CouponReservationID,
		PublicTokenHash:     row.PublicTokenHash,
		BuyerSessionID:      row.BuyerSessionID,
		IdempotencyKeyHash:  row.IdempotencyKeyHash,
	}
	if row.PaidAt.Valid {
		t := row.PaidAt.Time
		o.PaidAt = &t
	}
	if row.ExpiresAt.Valid {
		t := row.ExpiresAt.Time
		o.ExpiresAt = &t
	}
	return o
}

func mapCheckoutPaymentIntent(row gen.CheckoutGetPaymentIntentByIDRow) payments.Intent {
	return payments.Intent{
		ID:                     row.ID,
		OrderID:                row.OrderID,
		StoreID:                row.StoreID,
		MerchantID:             row.MerchantID,
		PaymentMode:            row.PaymentMode,
		Source:                 row.Source,
		Provider:               row.Provider,
		AccountScope:           row.AccountScope,
		ProviderReference:      row.ProviderReference,
		ExternalID:             row.ExternalID,
		AmountIDR:              row.AmountIdr,
		Currency:               row.Currency,
		FeeSnapshotID:          row.FeeSnapshotID,
		CouponReservationID:    row.CouponReservationID,
		StockReservationID:     row.StockReservationID,
		Status:                 row.Status,
		ProviderFinancialState: row.ProviderFinancialState,
		QRString:               row.QrString,
		QRImageURL:             row.QrImageUrl,
		ExpiresAt:              row.ExpiresAt,
		CancelRequestedAt:      pgTimePtr(row.CancelRequestedAt),
		ExpireRequestedAt:      pgTimePtr(row.ExpireRequestedAt),
		CancelReason:           row.CancelReason,
		ExpireReason:           row.ExpireReason,
		UnknownOperation:       row.UnknownOperation,
		LookupScheduledAt:      pgTimePtr(row.LookupScheduledAt),
		LookupAttempts:         row.LookupAttempts,
		PaidLate:               row.PaidLate,
		PrecedingStatus:        row.PrecedingStatus,
		BuyerUserID:            row.BuyerUserID,
		BuyerEmail:             row.BuyerEmail,
		BuyerSessionID:         row.BuyerSessionID,
		PublicTokenHash:        row.PublicTokenHash,
		IdempotencyKeyHash:     row.IdempotencyKeyHash,
		RequestHash:            row.RequestHash,
		ProductSnapshot:        row.ProductSnapshot,
		PriceSnapshot:          row.PriceSnapshot,
		Version:                row.Version,
		CreatedAt:              row.CreatedAt,
		UpdatedAt:              row.UpdatedAt,
	}
}

func mapIdempotencyRecord(row gen.IdempotencyRecord) application.IdempotencyRecord {
	return application.IdempotencyRecord{
		ID:             row.ID,
		SubjectType:    row.SubjectType,
		SubjectID:      row.SubjectID,
		Operation:      row.Operation,
		PaymentMode:    row.PaymentMode,
		KeyHash:        row.KeyHash,
		RequestHash:    row.RequestHash,
		Status:         row.Status,
		ResourceType:   row.ResourceType,
		ResourceID:     row.ResourceID,
		ResponseStatus: row.ResponseStatus,
		ResponseBody:   row.ResponseBody,
		RequestID:      row.RequestID,
		LeaseExpiresAt: pgTimePtr(row.LeaseExpiresAt),
		ExpiresAt:      row.ExpiresAt,
	}
}

func pgTimePtr(t pgtype.Timestamptz) *time.Time {
	if !t.Valid {
		return nil
	}
	tt := t.Time
	return &tt
}
