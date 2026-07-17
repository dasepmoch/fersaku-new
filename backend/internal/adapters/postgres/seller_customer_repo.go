package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres/gen"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
)

// SellerCustomerRepo is the Postgres adapter for seller customer reads (SEL-260).
type SellerCustomerRepo struct {
	pool *pgxpool.Pool
	q    *gen.Queries
}

func NewSellerCustomerRepo(pool *pgxpool.Pool) *SellerCustomerRepo {
	return &SellerCustomerRepo{pool: pool, q: gen.New(pool)}
}

func (r *SellerCustomerRepo) IsNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func (r *SellerCustomerRepo) UserCanAccessStore(ctx context.Context, userID, storeID string) (bool, error) {
	return r.q.SellerCustomerUserCanAccessStore(ctx, gen.SellerCustomerUserCanAccessStoreParams{
		ID:     storeID,
		UserID: userID,
	})
}

func (r *SellerCustomerRepo) UserIsPlatformAdmin(ctx context.Context, userID string) (bool, error) {
	return r.q.SellerCustomerUserIsPlatformAdmin(ctx, userID)
}

func (r *SellerCustomerRepo) CountCustomers(ctx context.Context, f application.SellerCustomerListFilter) (int64, error) {
	return r.q.SellerCustomerCountByStore(ctx, gen.SellerCustomerCountByStoreParams{
		StoreID: f.StoreID,
		Q:       emptyToNil(f.Q),
	})
}

func (r *SellerCustomerRepo) ListCustomers(ctx context.Context, f application.SellerCustomerListFilter) ([]application.SellerCustomerListRow, error) {
	offset := int32((f.Page - 1) * f.PageSize)
	if offset < 0 {
		offset = 0
	}
	rows, err := r.q.SellerCustomerListByStore(ctx, gen.SellerCustomerListByStoreParams{
		StoreID:    f.StoreID,
		Q:          emptyToNil(f.Q),
		PageOffset: offset,
		PageLimit:  int32(f.PageSize),
	})
	if err != nil {
		return nil, err
	}
	out := make([]application.SellerCustomerListRow, 0, len(rows))
	for _, row := range rows {
		out = append(out, application.SellerCustomerListRow{
			CustomerID:        row.CustomerID,
			DisplayName:       row.DisplayName,
			DisplayEmail:      row.DisplayEmail,
			OrderCount:        row.OrderCount,
			SpentIDR:          row.SpentIdr,
			LastPurchaseAt:    row.LastPurchaseAt,
			FirstSeenAt:       row.FirstSeenAt,
			LastProductTitle:  row.LastProductTitle,
			LastOrderGrossIDR: row.LastOrderGrossIdr,
			LastPaymentStatus: row.LastPaymentStatus,
		})
	}
	return out, nil
}

func (r *SellerCustomerRepo) StoreSummary(ctx context.Context, storeID string) (application.SellerCustomerStoreSummary, error) {
	row, err := r.q.SellerCustomerSummaryByStore(ctx, storeID)
	if err != nil {
		return application.SellerCustomerStoreSummary{}, err
	}
	return application.SellerCustomerStoreSummary{
		TotalCustomers: row.TotalCustomers,
		RepeatBuyers:   row.RepeatBuyers,
		AvgSpendIDR:    row.AvgSpendIdr,
	}, nil
}

func (r *SellerCustomerRepo) GetCustomer(ctx context.Context, storeID, customerID string) (application.SellerCustomerAggregate, error) {
	row, err := r.q.SellerCustomerGetByStore(ctx, gen.SellerCustomerGetByStoreParams{
		StoreID:    storeID,
		CustomerID: customerID,
	})
	if err != nil {
		return application.SellerCustomerAggregate{}, err
	}
	return application.SellerCustomerAggregate{
		CustomerID:     row.CustomerID,
		DisplayName:    row.DisplayName,
		DisplayEmail:   row.DisplayEmail,
		OrderCount:     row.OrderCount,
		SpentIDR:       row.SpentIdr,
		LastPurchaseAt: row.LastPurchaseAt,
		FirstSeenAt:    row.FirstSeenAt,
		ProductCount:   row.ProductCount,
	}, nil
}

func (r *SellerCustomerRepo) ListOrderHistory(ctx context.Context, storeID, customerID string, limit int) ([]application.SellerCustomerOrderRow, error) {
	if limit <= 0 {
		limit = 20
	}
	rows, err := r.q.SellerCustomerOrderHistory(ctx, gen.SellerCustomerOrderHistoryParams{
		StoreID:    storeID,
		CustomerID: customerID,
		PageLimit:  int32(limit),
	})
	if err != nil {
		return nil, err
	}
	out := make([]application.SellerCustomerOrderRow, 0, len(rows))
	for _, row := range rows {
		out = append(out, application.SellerCustomerOrderRow{
			OrderID:       row.ID,
			OrderNumber:   row.OrderNumber,
			PaymentStatus: row.PaymentStatus,
			GrossIDR:      row.GrossIdr,
			PaidAt:        pgToTimePtr(row.PaidAt),
			CreatedAt:     row.CreatedAt,
			ProductTitle:  row.ProductTitle,
		})
	}
	return out, nil
}

func (r *SellerCustomerRepo) GetNote(ctx context.Context, storeID, customerID string) (*application.SellerCustomerNoteRow, error) {
	row, err := r.q.SellerCustomerNoteGet(ctx, gen.SellerCustomerNoteGetParams{
		StoreID:    storeID,
		CustomerID: customerID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, pgx.ErrNoRows
		}
		return nil, err
	}
	return &application.SellerCustomerNoteRow{
		ID:           row.ID,
		StoreID:      row.StoreID,
		CustomerID:   row.CustomerID,
		Body:         row.Body,
		Version:      row.Version,
		AuthorUserID: row.AuthorUserID,
		CreatedAt:    row.CreatedAt,
		UpdatedAt:    row.UpdatedAt,
	}, nil
}

func (r *SellerCustomerRepo) InsertNote(ctx context.Context, row application.SellerCustomerNoteRow) (application.SellerCustomerNoteRow, error) {
	out, err := r.q.SellerCustomerNoteInsert(ctx, gen.SellerCustomerNoteInsertParams{
		ID:           row.ID,
		StoreID:      row.StoreID,
		CustomerID:   row.CustomerID,
		Body:         row.Body,
		AuthorUserID: row.AuthorUserID,
		CreatedAt:    row.CreatedAt,
	})
	if err != nil {
		return application.SellerCustomerNoteRow{}, err
	}
	return application.SellerCustomerNoteRow{
		ID:           out.ID,
		StoreID:      out.StoreID,
		CustomerID:   out.CustomerID,
		Body:         out.Body,
		Version:      out.Version,
		AuthorUserID: out.AuthorUserID,
		CreatedAt:    out.CreatedAt,
		UpdatedAt:    out.UpdatedAt,
	}, nil
}

func (r *SellerCustomerRepo) UpdateNote(ctx context.Context, storeID, customerID, body, authorUserID string, expectedVersion int32, now time.Time) (application.SellerCustomerNoteRow, error) {
	var author *string
	if authorUserID != "" {
		author = &authorUserID
	}
	out, err := r.q.SellerCustomerNoteUpdate(ctx, gen.SellerCustomerNoteUpdateParams{
		Body:            body,
		AuthorUserID:    author,
		UpdatedAt:       now,
		StoreID:         storeID,
		CustomerID:      customerID,
		ExpectedVersion: expectedVersion,
	})
	if err != nil {
		return application.SellerCustomerNoteRow{}, err
	}
	return application.SellerCustomerNoteRow{
		ID:           out.ID,
		StoreID:      out.StoreID,
		CustomerID:   out.CustomerID,
		Body:         out.Body,
		Version:      out.Version,
		AuthorUserID: out.AuthorUserID,
		CreatedAt:    out.CreatedAt,
		UpdatedAt:    out.UpdatedAt,
	}, nil
}

var _ application.SellerCustomerStore = (*SellerCustomerRepo)(nil)
