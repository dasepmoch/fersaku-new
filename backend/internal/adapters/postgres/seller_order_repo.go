package postgres

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres/gen"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/orders"
)

// SellerOrderRepo is the Postgres adapter for seller order reads (SEL-250).
type SellerOrderRepo struct {
	pool *pgxpool.Pool
	q    *gen.Queries
}

func NewSellerOrderRepo(pool *pgxpool.Pool) *SellerOrderRepo {
	return &SellerOrderRepo{pool: pool, q: gen.New(pool)}
}

func (r *SellerOrderRepo) IsNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func (r *SellerOrderRepo) UserCanAccessStore(ctx context.Context, userID, storeID string) (bool, error) {
	return r.q.SellerOrderUserCanAccessStore(ctx, gen.SellerOrderUserCanAccessStoreParams{
		ID:     storeID,
		UserID: userID,
	})
}

func (r *SellerOrderRepo) UserIsPlatformAdmin(ctx context.Context, userID string) (bool, error) {
	return r.q.SellerOrderUserIsPlatformAdmin(ctx, userID)
}

func (r *SellerOrderRepo) CountOrders(ctx context.Context, f application.SellerOrderListFilter) (int64, error) {
	return r.q.SellerOrderCountByStore(ctx, gen.SellerOrderCountByStoreParams{
		StoreID: f.StoreID,
		Status:  emptyToNil(f.Status),
		Source:  emptyToNil(f.Source),
		FromTs:  timePtrToPg(f.From),
		ToTs:    timePtrToPg(f.To),
		Q:       emptyToNil(f.Q),
	})
}

func (r *SellerOrderRepo) ListOrders(ctx context.Context, f application.SellerOrderListFilter) ([]application.SellerOrderListRow, error) {
	offset := int32((f.Page - 1) * f.PageSize)
	if offset < 0 {
		offset = 0
	}
	rows, err := r.q.SellerOrderListByStore(ctx, gen.SellerOrderListByStoreParams{
		StoreID: f.StoreID,
		Limit:   int32(f.PageSize),
		Offset:  offset,
		Status:  emptyToNil(f.Status),
		Source:  emptyToNil(f.Source),
		FromTs:  timePtrToPg(f.From),
		ToTs:    timePtrToPg(f.To),
		Q:       emptyToNil(f.Q),
	})
	if err != nil {
		return nil, err
	}
	out := make([]application.SellerOrderListRow, 0, len(rows))
	for _, row := range rows {
		out = append(out, application.SellerOrderListRow{
			Order: orders.Order{
				ID:             row.ID,
				OrderNumber:    row.OrderNumber,
				StoreID:        row.StoreID,
				MerchantID:     row.MerchantID,
				BuyerName:      row.BuyerName,
				BuyerEmail:     row.BuyerEmail,
				PaymentStatus:  row.PaymentStatus,
				Source:         row.Source,
				Currency:       row.Currency,
				SubtotalIDR:    row.SubtotalIdr,
				DiscountIDR:    row.DiscountIdr,
				TipIDR:         row.TipIdr,
				FeeIDR:         row.FeeIdr,
				GrossIDR:       row.GrossIdr,
				MerchantNetIDR: row.MerchantNetIdr,
				PaidAt:         pgToTimePtr(row.PaidAt),
				CreatedAt:      row.CreatedAt,
				UpdatedAt:      row.UpdatedAt,
			},
			ProductTitle:   row.ProductTitle,
			DeliveryStatus: row.DeliveryStatus,
		})
	}
	return out, nil
}

func (r *SellerOrderRepo) StatusCounts(ctx context.Context, storeID string) (map[string]int64, error) {
	rows, err := r.q.SellerOrderStatusCounts(ctx, storeID)
	if err != nil {
		return nil, err
	}
	out := make(map[string]int64, len(rows))
	for _, row := range rows {
		out[row.PaymentStatus] = row.Cnt
	}
	return out, nil
}

func (r *SellerOrderRepo) GetOrderByStore(ctx context.Context, storeID, orderIDOrNumber string) (orders.Order, error) {
	row, err := r.q.SellerOrderGetByStore(ctx, gen.SellerOrderGetByStoreParams{
		StoreID: storeID,
		ID:      orderIDOrNumber,
	})
	if err != nil {
		return orders.Order{}, err
	}
	return orders.Order{
		ID:             row.ID,
		OrderNumber:    row.OrderNumber,
		StoreID:        row.StoreID,
		MerchantID:     row.MerchantID,
		BuyerUserID:    row.BuyerUserID,
		BuyerName:      row.BuyerName,
		BuyerEmail:     row.BuyerEmail,
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
	}, nil
}

func (r *SellerOrderRepo) ListOrderItems(ctx context.Context, orderID string) ([]orders.OrderItem, error) {
	rows, err := r.q.SellerOrderListItems(ctx, orderID)
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

func (r *SellerOrderRepo) ListGrants(ctx context.Context, orderID string) ([]application.SellerOrderGrantView, error) {
	rows, err := r.q.SellerOrderListGrants(ctx, orderID)
	if err != nil {
		return nil, err
	}
	out := make([]application.SellerOrderGrantView, 0, len(rows))
	for _, row := range rows {
		out = append(out, application.SellerOrderGrantView{
			ID:             row.ID,
			OrderItemID:    row.OrderItemID,
			ProductID:      row.ProductID,
			DeliveryKind:   row.DeliveryKind,
			Status:         row.Status,
			AccessCount:    row.AccessCount,
			MaxAccesses:    row.MaxAccesses,
			ActivatedAt:    pgToTimePtr(row.ActivatedAt),
			RevokedAt:      pgToTimePtr(row.RevokedAt),
			FailedAt:       pgToTimePtr(row.FailedAt),
			FailReason:     row.FailReason,
			LastAccessedAt: pgToTimePtr(row.LastAccessedAt),
			CreatedAt:      row.CreatedAt,
		})
	}
	return out, nil
}

func (r *SellerOrderRepo) GetPaymentIntent(ctx context.Context, orderID string) (*application.SellerOrderPaymentSummary, error) {
	row, err := r.q.SellerOrderGetPaymentIntent(ctx, orderID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	ref := ""
	if row.ProviderReference != nil {
		ref = *row.ProviderReference
	}
	return &application.SellerOrderPaymentSummary{
		ID:                row.ID,
		Provider:          row.Provider,
		ProviderReference: ref,
		Status:            row.Status,
		Source:            row.Source,
		AmountIDR:         row.AmountIdr,
		PaidLate:          row.PaidLate,
		CreatedAt:         row.CreatedAt,
	}, nil
}

var _ application.SellerOrderStore = (*SellerOrderRepo)(nil)
