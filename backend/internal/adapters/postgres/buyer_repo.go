package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres/gen"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/delivery"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/orders"
)

// BuyerRepo is the Postgres adapter for buyer purchases (BE-430).
type BuyerRepo struct {
	pool *pgxpool.Pool
	q    *gen.Queries
}

func NewBuyerRepo(pool *pgxpool.Pool) *BuyerRepo {
	return &BuyerRepo{pool: pool, q: gen.New(pool)}
}

func (r *BuyerRepo) IsNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func (r *BuyerRepo) ListOrdersByBuyer(ctx context.Context, buyerUserID string, cursorCreatedAt *time.Time, cursorID *string, limit int32) ([]orders.Order, error) {
	rows, err := r.q.BuyerListOrders(ctx, gen.BuyerListOrdersParams{
		BuyerUserID:     &buyerUserID,
		Limit:           limit,
		CursorCreatedAt: timePtrToPg(cursorCreatedAt),
		CursorID:        cursorID,
	})
	if err != nil {
		return nil, err
	}
	out := make([]orders.Order, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapBuyerOrderRow(row))
	}
	return out, nil
}

func (r *BuyerRepo) GetOrderByBuyer(ctx context.Context, orderID, buyerUserID string) (orders.Order, error) {
	row, err := r.q.BuyerGetOrderByID(ctx, gen.BuyerGetOrderByIDParams{
		ID:          orderID,
		BuyerUserID: &buyerUserID,
	})
	if err != nil {
		return orders.Order{}, err
	}
	return mapBuyerGetOrderRow(row), nil
}

func (r *BuyerRepo) ListOrderItems(ctx context.Context, orderID string) ([]orders.OrderItem, error) {
	rows, err := r.q.BuyerListOrderItems(ctx, orderID)
	if err != nil {
		return nil, err
	}
	out := make([]orders.OrderItem, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapBuyerOrderItem(row))
	}
	return out, nil
}

func (r *BuyerRepo) ListGrantsByOrder(ctx context.Context, orderID string) ([]delivery.Grant, error) {
	rows, err := r.q.BuyerListGrantsByOrder(ctx, orderID)
	if err != nil {
		return nil, err
	}
	out := make([]delivery.Grant, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapBuyerGrant(row))
	}
	return out, nil
}

func (r *BuyerRepo) GetStoreName(ctx context.Context, storeID string) (string, error) {
	row, err := r.q.BuyerGetStoreName(ctx, storeID)
	if err != nil {
		return "", err
	}
	return row.Name, nil
}

func mapBuyerOrderRow(row gen.BuyerListOrdersRow) orders.Order {
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

func mapBuyerGetOrderRow(row gen.BuyerGetOrderByIDRow) orders.Order {
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

func mapBuyerOrderItem(row gen.OrderItem) orders.OrderItem {
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

func mapBuyerGrant(row gen.DeliveryGrant) delivery.Grant {
	return mapGrant(row)
}

var _ application.BuyerPurchaseStore = (*BuyerRepo)(nil)
var _ = pgtype.Timestamptz{}
