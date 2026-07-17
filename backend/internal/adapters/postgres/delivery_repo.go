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
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/delivery"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/invoices"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/orders"
)

type deliveryTxKey struct{}

// DeliveryRepo is the Postgres adapter for BE-235.
type DeliveryRepo struct {
	pool *pgxpool.Pool
	q    *gen.Queries
}

func NewDeliveryRepo(pool *pgxpool.Pool) *DeliveryRepo {
	return &DeliveryRepo{pool: pool, q: gen.New(pool)}
}

func (r *DeliveryRepo) queries(ctx context.Context) *gen.Queries {
	if tx, ok := ctx.Value(deliveryTxKey{}).(pgx.Tx); ok && tx != nil {
		return r.q.WithTx(tx)
	}
	return r.q
}

func (r *DeliveryRepo) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	if _, ok := ctx.Value(deliveryTxKey{}).(pgx.Tx); ok {
		return fn(ctx)
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("delivery: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	txCtx := context.WithValue(ctx, deliveryTxKey{}, tx)
	if err := fn(txCtx); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("delivery: commit: %w", err)
	}
	return nil
}

func (r *DeliveryRepo) IsNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func (r *DeliveryRepo) IsUniqueViolation(err error) bool {
	var pe *pgconn.PgError
	return errors.As(err, &pe) && pe.Code == "23505"
}

func (r *DeliveryRepo) InsertOrder(ctx context.Context, o orders.Order) error {
	return r.queries(ctx).DeliveryInsertOrder(ctx, gen.DeliveryInsertOrderParams{
		ID:             o.ID,
		OrderNumber:    o.OrderNumber,
		StoreID:        o.StoreID,
		MerchantID:     o.MerchantID,
		BuyerUserID:    o.BuyerUserID,
		BuyerEmail:     o.BuyerEmail,
		BuyerName:      o.BuyerName,
		PaymentStatus:  o.PaymentStatus,
		Source:         o.Source,
		Currency:       o.Currency,
		SubtotalIdr:    o.SubtotalIDR,
		DiscountIdr:    o.DiscountIDR,
		TipIdr:         o.TipIDR,
		FeeIdr:         o.FeeIDR,
		GrossIdr:       o.GrossIDR,
		MerchantNetIdr: o.MerchantNetIDR,
		CouponCode:     o.CouponCode,
		CouponVersion:  o.CouponVersion,
		PaidAt:         timePtrToPg(o.PaidAt),
		CreatedAt:      o.CreatedAt,
		UpdatedAt:      o.UpdatedAt,
	})
}

func (r *DeliveryRepo) InsertOrderItem(ctx context.Context, it orders.OrderItem) error {
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

func mapOrderFromGetByID(row gen.DeliveryGetOrderByIDRow) orders.Order {
	return orders.Order{
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
		PaidAt:         pgToTimePtr(row.PaidAt),
		CreatedAt:      row.CreatedAt,
		UpdatedAt:      row.UpdatedAt,
	}
}

func mapOrderFromGetByNumber(row gen.DeliveryGetOrderByNumberRow) orders.Order {
	return orders.Order{
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
		PaidAt:         pgToTimePtr(row.PaidAt),
		CreatedAt:      row.CreatedAt,
		UpdatedAt:      row.UpdatedAt,
	}
}

func mapOrderItem(row gen.OrderItem) orders.OrderItem {
	return orders.OrderItem{
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
	}
}

func (r *DeliveryRepo) GetOrderByID(ctx context.Context, id string) (orders.Order, error) {
	row, err := r.queries(ctx).DeliveryGetOrderByID(ctx, id)
	if err != nil {
		return orders.Order{}, err
	}
	return mapOrderFromGetByID(row), nil
}

func (r *DeliveryRepo) GetOrderByNumber(ctx context.Context, orderNumber string) (orders.Order, error) {
	row, err := r.queries(ctx).DeliveryGetOrderByNumber(ctx, orderNumber)
	if err != nil {
		return orders.Order{}, err
	}
	return mapOrderFromGetByNumber(row), nil
}

func (r *DeliveryRepo) ListOrderItems(ctx context.Context, orderID string) ([]orders.OrderItem, error) {
	rows, err := r.queries(ctx).DeliveryListOrderItems(ctx, orderID)
	if err != nil {
		return nil, err
	}
	out := make([]orders.OrderItem, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapOrderItem(row))
	}
	return out, nil
}

func (r *DeliveryRepo) GetOrderItem(ctx context.Context, id string) (orders.OrderItem, error) {
	row, err := r.queries(ctx).DeliveryGetOrderItem(ctx, id)
	if err != nil {
		return orders.OrderItem{}, err
	}
	return mapOrderItem(row), nil
}

func mapGrant(row gen.DeliveryGrant) delivery.Grant {
	return delivery.Grant{
		ID:                   row.ID,
		OrderID:              row.OrderID,
		OrderItemID:          row.OrderItemID,
		StoreID:              row.StoreID,
		MerchantID:           row.MerchantID,
		ProductID:            row.ProductID,
		BuyerUserID:          row.BuyerUserID,
		BuyerEmail:           row.BuyerEmail,
		DeliveryKind:         row.DeliveryKind,
		Status:               row.Status,
		StockItemID:          row.StockItemID,
		StockReservationID:   row.StockReservationID,
		ObjectID:             row.ObjectID,
		FulfillmentEffectKey: row.FulfillmentEffectKey,
		AccessTokenHash:      row.AccessTokenHash,
		AccessTokenExpiresAt: pgToTimePtr(row.AccessTokenExpiresAt),
		MaxAccesses:          row.MaxAccesses,
		AccessCount:          row.AccessCount,
		RecipientSnapshot:    json.RawMessage(row.RecipientSnapshot),
		ProductSnapshot:      json.RawMessage(row.ProductSnapshot),
		RevokedAt:            pgToTimePtr(row.RevokedAt),
		RevokeReason:         row.RevokeReason,
		ExpiresAt:            pgToTimePtr(row.ExpiresAt),
		LastAccessedAt:       pgToTimePtr(row.LastAccessedAt),
		ActivatedAt:          pgToTimePtr(row.ActivatedAt),
		FailedAt:             pgToTimePtr(row.FailedAt),
		FailReason:           row.FailReason,
		Version:              row.Version,
		CreatedAt:            row.CreatedAt,
		UpdatedAt:            row.UpdatedAt,
	}
}

func (r *DeliveryRepo) InsertGrant(ctx context.Context, g delivery.Grant) error {
	recip := []byte(g.RecipientSnapshot)
	if recip == nil {
		recip = []byte(`{}`)
	}
	prod := []byte(g.ProductSnapshot)
	if prod == nil {
		prod = []byte(`{}`)
	}
	return r.queries(ctx).DeliveryInsertGrant(ctx, gen.DeliveryInsertGrantParams{
		ID:                   g.ID,
		OrderID:              g.OrderID,
		OrderItemID:          g.OrderItemID,
		StoreID:              g.StoreID,
		MerchantID:           g.MerchantID,
		ProductID:            g.ProductID,
		BuyerUserID:          g.BuyerUserID,
		BuyerEmail:           g.BuyerEmail,
		DeliveryKind:         g.DeliveryKind,
		Status:               g.Status,
		StockItemID:          g.StockItemID,
		StockReservationID:   g.StockReservationID,
		ObjectID:             g.ObjectID,
		FulfillmentEffectKey: g.FulfillmentEffectKey,
		AccessTokenHash:      g.AccessTokenHash,
		AccessTokenExpiresAt: timePtrToPg(g.AccessTokenExpiresAt),
		MaxAccesses:          g.MaxAccesses,
		AccessCount:          g.AccessCount,
		RecipientSnapshot:    recip,
		ProductSnapshot:      prod,
		ExpiresAt:            timePtrToPg(g.ExpiresAt),
		ActivatedAt:          timePtrToPg(g.ActivatedAt),
		Version:              g.Version,
		CreatedAt:            g.CreatedAt,
		UpdatedAt:            g.UpdatedAt,
	})
}

func (r *DeliveryRepo) GetGrantByID(ctx context.Context, id string) (delivery.Grant, error) {
	row, err := r.queries(ctx).DeliveryGetGrantByID(ctx, id)
	if err != nil {
		return delivery.Grant{}, err
	}
	return mapGrant(row), nil
}

func (r *DeliveryRepo) GetGrantByOrderItem(ctx context.Context, orderItemID string) (delivery.Grant, error) {
	row, err := r.queries(ctx).DeliveryGetGrantByOrderItem(ctx, orderItemID)
	if err != nil {
		return delivery.Grant{}, err
	}
	return mapGrant(row), nil
}

func (r *DeliveryRepo) GetGrantByOrderID(ctx context.Context, orderID string) (delivery.Grant, error) {
	row, err := r.queries(ctx).DeliveryGetGrantByOrderID(ctx, orderID)
	if err != nil {
		return delivery.Grant{}, err
	}
	return mapGrant(row), nil
}

func (r *DeliveryRepo) ListGrantsByOrder(ctx context.Context, orderID string) ([]delivery.Grant, error) {
	rows, err := r.queries(ctx).DeliveryListGrantsByOrder(ctx, orderID)
	if err != nil {
		return nil, err
	}
	out := make([]delivery.Grant, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapGrant(row))
	}
	return out, nil
}

func (r *DeliveryRepo) GetGrantByAccessTokenHash(ctx context.Context, hash string) (delivery.Grant, error) {
	h := hash
	row, err := r.queries(ctx).DeliveryGetGrantByAccessTokenHash(ctx, &h)
	if err != nil {
		return delivery.Grant{}, err
	}
	return mapGrant(row), nil
}

func (r *DeliveryRepo) UpdateGrantStatus(ctx context.Context, id, from, to string, patch delivery.GrantPatch, now time.Time) (delivery.Grant, error) {
	row, err := r.queries(ctx).DeliveryUpdateGrantStatus(ctx, gen.DeliveryUpdateGrantStatusParams{
		NewStatus:            to,
		RevokedAt:            timePtrToPg(patch.RevokedAt),
		RevokeReason:         patch.RevokeReason,
		FailedAt:             timePtrToPg(patch.FailedAt),
		FailReason:           patch.FailReason,
		ActivatedAt:          timePtrToPg(patch.ActivatedAt),
		StockItemID:          patch.StockItemID,
		StockReservationID:   patch.StockReservationID,
		AccessTokenHash:      patch.AccessTokenHash,
		AccessTokenExpiresAt: timePtrToPg(patch.AccessTokenExpiresAt),
		LastAccessedAt:       timePtrToPg(patch.LastAccessedAt),
		UpdatedAt:            now,
		ID:                   id,
		FromStatus:           from,
	})
	if err != nil {
		return delivery.Grant{}, err
	}
	return mapGrant(row), nil
}

func (r *DeliveryRepo) IncrementAccess(ctx context.Context, id string, now time.Time) (delivery.Grant, error) {
	row, err := r.queries(ctx).DeliveryIncrementAccess(ctx, gen.DeliveryIncrementAccessParams{
		ID:             id,
		LastAccessedAt: pgTimestamptz(now),
	})
	if err != nil {
		return delivery.Grant{}, err
	}
	return mapGrant(row), nil
}

func (r *DeliveryRepo) RotateAccessToken(ctx context.Context, id, tokenHash string, expiresAt, now time.Time) (delivery.Grant, error) {
	h := tokenHash
	row, err := r.queries(ctx).DeliveryRotateAccessToken(ctx, gen.DeliveryRotateAccessTokenParams{
		ID:                   id,
		AccessTokenHash:      &h,
		AccessTokenExpiresAt: pgTimestamptz(expiresAt),
		UpdatedAt:            now,
	})
	if err != nil {
		return delivery.Grant{}, err
	}
	return mapGrant(row), nil
}

func mapAttempt(row gen.DeliveryAttempt) delivery.Attempt {
	return delivery.Attempt{
		ID:             row.ID,
		GrantID:        row.GrantID,
		OrderID:        row.OrderID,
		StoreID:        row.StoreID,
		Channel:        row.Channel,
		Result:         row.Result,
		SafeErrorCode:  row.SafeErrorCode,
		RetryCount:     row.RetryCount,
		ActorUserID:    row.ActorUserID,
		ActorKind:      row.ActorKind,
		Reason:         row.Reason,
		IdempotencyKey: row.IdempotencyKey,
		CreatedAt:      row.CreatedAt,
	}
}

func (r *DeliveryRepo) InsertAttempt(ctx context.Context, a delivery.Attempt) error {
	return r.queries(ctx).DeliveryInsertAttempt(ctx, gen.DeliveryInsertAttemptParams{
		ID:             a.ID,
		GrantID:        a.GrantID,
		OrderID:        a.OrderID,
		StoreID:        a.StoreID,
		Channel:        a.Channel,
		Result:         a.Result,
		SafeErrorCode:  a.SafeErrorCode,
		RetryCount:     a.RetryCount,
		ActorUserID:    a.ActorUserID,
		ActorKind:      a.ActorKind,
		Reason:         a.Reason,
		IdempotencyKey: a.IdempotencyKey,
		CreatedAt:      a.CreatedAt,
	})
}

func (r *DeliveryRepo) GetAttemptByIdem(ctx context.Context, grantID, idem string) (delivery.Attempt, error) {
	row, err := r.queries(ctx).DeliveryGetAttemptByIdem(ctx, gen.DeliveryGetAttemptByIdemParams{
		GrantID:        grantID,
		IdempotencyKey: &idem,
	})
	if err != nil {
		return delivery.Attempt{}, err
	}
	return mapAttempt(row), nil
}

func (r *DeliveryRepo) ListAttemptsByGrant(ctx context.Context, grantID string, limit int32) ([]delivery.Attempt, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := r.queries(ctx).DeliveryListAttemptsByGrant(ctx, gen.DeliveryListAttemptsByGrantParams{
		GrantID: grantID,
		Limit:   limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]delivery.Attempt, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapAttempt(row))
	}
	return out, nil
}

func mapInvoice(row gen.Invoice) invoices.Invoice {
	return invoices.Invoice{
		ID:             row.ID,
		OrderID:        row.OrderID,
		StoreID:        row.StoreID,
		MerchantID:     row.MerchantID,
		InvoiceNumber:  row.InvoiceNumber,
		PublicCodeHash: row.PublicCodeHash,
		PublicCodeHint: row.PublicCodeHint,
		Status:         row.Status,
		Currency:       row.Currency,
		GrossIDR:       row.GrossIdr,
		PaidAt:         pgToTimePtr(row.PaidAt),
		CurrentVersion: row.CurrentVersion,
		BuyerUserID:    row.BuyerUserID,
		CreatedAt:      row.CreatedAt,
		UpdatedAt:      row.UpdatedAt,
	}
}

func mapInvoiceVersion(row gen.InvoiceVersion) invoices.Version {
	return invoices.Version{
		ID:              row.ID,
		InvoiceID:       row.InvoiceID,
		Version:         row.Version,
		RendererVersion: row.RendererVersion,
		Snapshot:        json.RawMessage(row.Snapshot),
		PayloadHash:     row.PayloadHash,
		RenderStatus:    row.RenderStatus,
		RenderObjectID:  row.RenderObjectID,
		RenderErrorCode: row.RenderErrorCode,
		RenderedAt:      pgToTimePtr(row.RenderedAt),
		CreatedAt:       row.CreatedAt,
	}
}

func (r *DeliveryRepo) InsertInvoice(ctx context.Context, inv invoices.Invoice) error {
	return r.queries(ctx).DeliveryInsertInvoice(ctx, gen.DeliveryInsertInvoiceParams{
		ID:             inv.ID,
		OrderID:        inv.OrderID,
		StoreID:        inv.StoreID,
		MerchantID:     inv.MerchantID,
		InvoiceNumber:  inv.InvoiceNumber,
		PublicCodeHash: inv.PublicCodeHash,
		PublicCodeHint: inv.PublicCodeHint,
		Status:         inv.Status,
		Currency:       inv.Currency,
		GrossIdr:       inv.GrossIDR,
		PaidAt:         timePtrToPg(inv.PaidAt),
		CurrentVersion: inv.CurrentVersion,
		BuyerUserID:    inv.BuyerUserID,
		CreatedAt:      inv.CreatedAt,
		UpdatedAt:      inv.UpdatedAt,
	})
}

func (r *DeliveryRepo) InsertInvoiceVersion(ctx context.Context, v invoices.Version) error {
	snap := []byte(v.Snapshot)
	if snap == nil {
		snap = []byte(`{}`)
	}
	return r.queries(ctx).DeliveryInsertInvoiceVersion(ctx, gen.DeliveryInsertInvoiceVersionParams{
		ID:              v.ID,
		InvoiceID:       v.InvoiceID,
		Version:         v.Version,
		RendererVersion: v.RendererVersion,
		Snapshot:        snap,
		PayloadHash:     v.PayloadHash,
		RenderStatus:    v.RenderStatus,
		RenderObjectID:  v.RenderObjectID,
		RenderErrorCode: v.RenderErrorCode,
		RenderedAt:      timePtrToPg(v.RenderedAt),
		CreatedAt:       v.CreatedAt,
	})
}

func (r *DeliveryRepo) GetInvoiceByID(ctx context.Context, id string) (invoices.Invoice, error) {
	row, err := r.queries(ctx).DeliveryGetInvoiceByID(ctx, id)
	if err != nil {
		return invoices.Invoice{}, err
	}
	return mapInvoice(row), nil
}

func (r *DeliveryRepo) GetInvoiceByOrder(ctx context.Context, orderID string) (invoices.Invoice, error) {
	row, err := r.queries(ctx).DeliveryGetInvoiceByOrder(ctx, orderID)
	if err != nil {
		return invoices.Invoice{}, err
	}
	return mapInvoice(row), nil
}

func (r *DeliveryRepo) GetInvoiceByPublicCodeHash(ctx context.Context, hash string) (invoices.Invoice, error) {
	row, err := r.queries(ctx).DeliveryGetInvoiceByPublicCodeHash(ctx, hash)
	if err != nil {
		return invoices.Invoice{}, err
	}
	return mapInvoice(row), nil
}

func (r *DeliveryRepo) GetInvoiceVersion(ctx context.Context, invoiceID string, version int32) (invoices.Version, error) {
	row, err := r.queries(ctx).DeliveryGetInvoiceVersion(ctx, gen.DeliveryGetInvoiceVersionParams{
		InvoiceID: invoiceID,
		Version:   version,
	})
	if err != nil {
		return invoices.Version{}, err
	}
	return mapInvoiceVersion(row), nil
}

func (r *DeliveryRepo) UpdateInvoiceRenderStatus(ctx context.Context, invoiceID string, version int32, status string, objectID *string, errCode *string, renderedAt *time.Time) (invoices.Version, error) {
	row, err := r.queries(ctx).DeliveryUpdateInvoiceRenderStatus(ctx, gen.DeliveryUpdateInvoiceRenderStatusParams{
		InvoiceID:       invoiceID,
		Version:         version,
		RenderStatus:    status,
		RenderObjectID:  objectID,
		RenderErrorCode: errCode,
		RenderedAt:      timePtrToPg(renderedAt),
	})
	if err != nil {
		return invoices.Version{}, err
	}
	return mapInvoiceVersion(row), nil
}

func (r *DeliveryRepo) UpdateInvoiceStatus(ctx context.Context, id, status string, now time.Time) error {
	return r.queries(ctx).DeliveryUpdateInvoiceStatus(ctx, gen.DeliveryUpdateInvoiceStatusParams{
		ID:        id,
		Status:    status,
		UpdatedAt: now,
	})
}

func (r *DeliveryRepo) GetStore(ctx context.Context, storeID string) (application.DeliveryStoreRow, error) {
	row, err := r.queries(ctx).DeliveryGetStoreName(ctx, storeID)
	if err != nil {
		return application.DeliveryStoreRow{}, err
	}
	return application.DeliveryStoreRow{ID: row.ID, Name: row.Name, MerchantID: row.MerchantID}, nil
}

func (r *DeliveryRepo) GetProduct(ctx context.Context, storeID, productID string) (application.DeliveryProductRow, error) {
	row, err := r.queries(ctx).DeliveryGetProductSnapshot(ctx, gen.DeliveryGetProductSnapshotParams{
		ID:      productID,
		StoreID: storeID,
	})
	if err != nil {
		return application.DeliveryProductRow{}, err
	}
	return application.DeliveryProductRow{
		ID:         row.ID,
		StoreID:    row.StoreID,
		MerchantID: row.MerchantID,
		Slug:       row.Slug,
		Title:      row.Title,
		Type:       row.Type,
		Status:     row.Status,
		Version:    row.Version,
		PriceIDR:   row.PriceIdr,
	}, nil
}

func (r *DeliveryRepo) GetStockPayload(ctx context.Context, stockItemID string) (application.DeliveryStockPayload, error) {
	row, err := r.queries(ctx).DeliveryGetStockItemPayload(ctx, stockItemID)
	if err != nil {
		return application.DeliveryStockPayload{}, err
	}
	masked := map[string]string{}
	if len(row.MaskedPreview) > 0 {
		_ = json.Unmarshal(row.MaskedPreview, &masked)
	}
	return application.DeliveryStockPayload{
		ID:               row.ID,
		ProductID:        row.ProductID,
		StoreID:          row.StoreID,
		MerchantID:       row.MerchantID,
		SchemaVersion:    row.SchemaVersion,
		Status:           row.Status,
		EncryptedPayload: row.EncryptedPayload,
		KeyVersion:       row.KeyVersion,
		MaskedPreview:    masked,
	}, nil
}

func (r *DeliveryRepo) UserCanAccessStore(ctx context.Context, userID, storeID string) (bool, error) {
	return r.queries(ctx).DeliveryUserCanAccessStore(ctx, gen.DeliveryUserCanAccessStoreParams{
		ID:     storeID,
		UserID: userID,
	})
}

func (r *DeliveryRepo) UserIsPlatformAdmin(ctx context.Context, userID string) (bool, error) {
	return r.queries(ctx).DeliveryUserIsPlatformAdmin(ctx, userID)
}

func (r *DeliveryRepo) InsertOutbox(ctx context.Context, id, topic string, payload []byte, dedupeKey *string, availableAt time.Time) error {
	if payload == nil {
		payload = []byte(`{}`)
	}
	return r.queries(ctx).DeliveryInsertOutbox(ctx, gen.DeliveryInsertOutboxParams{
		ID:          id,
		Topic:       topic,
		Payload:     payload,
		AvailableAt: availableAt,
		DedupeKey:   dedupeKey,
	})
}

// Ensure unused import for pgtype if helpers live in identity_repo.
var _ = pgtype.Timestamptz{}
