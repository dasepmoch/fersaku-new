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
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/orders"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/reviews"
)

type reviewTxKey struct{}

// ReviewRepo is the Postgres adapter for product reviews (BE-430).
type ReviewRepo struct {
	pool *pgxpool.Pool
	q    *gen.Queries
}

func NewReviewRepo(pool *pgxpool.Pool) *ReviewRepo {
	return &ReviewRepo{pool: pool, q: gen.New(pool)}
}

func (r *ReviewRepo) queries(ctx context.Context) *gen.Queries {
	if tx, ok := ctx.Value(reviewTxKey{}).(pgx.Tx); ok && tx != nil {
		return r.q.WithTx(tx)
	}
	return r.q
}

func (r *ReviewRepo) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	if _, ok := ctx.Value(reviewTxKey{}).(pgx.Tx); ok {
		return fn(ctx)
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("review: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	txCtx := context.WithValue(ctx, reviewTxKey{}, tx)
	if err := fn(txCtx); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("review: commit: %w", err)
	}
	return nil
}

func (r *ReviewRepo) IsNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func (r *ReviewRepo) IsUniqueViolation(err error) bool {
	var pe *pgconn.PgError
	return errors.As(err, &pe) && pe.Code == "23505"
}

func (r *ReviewRepo) InsertReview(ctx context.Context, rev reviews.Review) error {
	return r.queries(ctx).ReviewInsert(ctx, gen.ReviewInsertParams{
		ID:               rev.ID,
		StoreID:          rev.StoreID,
		MerchantID:       rev.MerchantID,
		ProductID:        rev.ProductID,
		OrderID:          rev.OrderID,
		OrderItemID:      rev.OrderItemID,
		BuyerUserID:      rev.BuyerUserID,
		Rating:           int16(rev.Rating),
		Title:            rev.Title,
		Body:             rev.Body,
		Status:           rev.Status,
		VerifiedPurchase: rev.VerifiedPurchase,
		ContentVersion:   rev.ContentVersion,
		CreatedAt:        rev.CreatedAt,
		UpdatedAt:        rev.UpdatedAt,
	})
}

func (r *ReviewRepo) GetReviewByID(ctx context.Context, id string) (reviews.Review, error) {
	row, err := r.queries(ctx).ReviewGetByID(ctx, id)
	if err != nil {
		return reviews.Review{}, err
	}
	return mapProductReview(row), nil
}

func (r *ReviewRepo) GetReviewByBuyerOrderItem(ctx context.Context, buyerUserID, orderItemID string) (reviews.Review, error) {
	row, err := r.queries(ctx).ReviewGetByBuyerOrderItem(ctx, gen.ReviewGetByBuyerOrderItemParams{
		BuyerUserID: buyerUserID,
		OrderItemID: orderItemID,
	})
	if err != nil {
		return reviews.Review{}, err
	}
	return mapProductReview(row), nil
}

func (r *ReviewRepo) UpdateReviewContent(ctx context.Context, id, buyerUserID string, rating int32, title, body string, expectedVersion int32, now time.Time) (reviews.Review, error) {
	row, err := r.queries(ctx).ReviewUpdateContent(ctx, gen.ReviewUpdateContentParams{
		ID:             id,
		BuyerUserID:    buyerUserID,
		Rating:         int16(rating),
		Title:          title,
		Body:           body,
		UpdatedAt:      now,
		ContentVersion: expectedVersion,
	})
	if err != nil {
		return reviews.Review{}, err
	}
	return mapProductReview(row), nil
}

func (r *ReviewRepo) ListPublicByProduct(ctx context.Context, productID string, cursorCreatedAt *time.Time, cursorID *string, limit int32) ([]reviews.Review, error) {
	rows, err := r.queries(ctx).ReviewListPublicByProduct(ctx, gen.ReviewListPublicByProductParams{
		ProductID:       productID,
		Limit:           limit,
		CursorCreatedAt: timePtrToPg(cursorCreatedAt),
		CursorID:        cursorID,
	})
	if err != nil {
		return nil, err
	}
	out := make([]reviews.Review, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapProductReview(row))
	}
	return out, nil
}

func (r *ReviewRepo) SummaryByProduct(ctx context.Context, productID string) (reviews.Summary, error) {
	row, err := r.queries(ctx).ReviewSummaryByProduct(ctx, productID)
	if err != nil {
		return reviews.Summary{}, err
	}
	return reviews.Summary{
		ProductID:     productID,
		Count:         row.Count,
		AverageRating: row.AverageRating,
		Rating1:       row.Rating1,
		Rating2:       row.Rating2,
		Rating3:       row.Rating3,
		Rating4:       row.Rating4,
		Rating5:       row.Rating5,
	}, nil
}

func (r *ReviewRepo) GetEligibility(ctx context.Context, orderItemID, buyerUserID string) (application.ReviewEligibility, error) {
	row, err := r.queries(ctx).ReviewGetOrderItemForBuyer(ctx, gen.ReviewGetOrderItemForBuyerParams{
		ID:          orderItemID,
		BuyerUserID: &buyerUserID,
	})
	if err != nil {
		return application.ReviewEligibility{}, err
	}
	el := application.ReviewEligibility{
		Item: orders.OrderItem{
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
		},
		PaymentStatus: row.PaymentStatus,
		PaidAt:        pgToTimePtr(row.PaidAt),
	}
	if row.BuyerUserID != nil {
		el.BuyerUserID = *row.BuyerUserID
	}
	g, err := r.queries(ctx).ReviewGetGrantForOrderItem(ctx, orderItemID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return el, nil
		}
		return application.ReviewEligibility{}, err
	}
	el.HasGrant = true
	el.GrantStatus = g.Status
	el.GrantRevoked = g.RevokedAt.Valid || g.Status == "REVOKED"
	return el, nil
}

func (r *ReviewRepo) GetReplyByReview(ctx context.Context, reviewID string) (reviews.Reply, error) {
	row, err := r.queries(ctx).ReviewGetReplyByReview(ctx, reviewID)
	if err != nil {
		return reviews.Reply{}, err
	}
	return mapProductReviewReply(row), nil
}

func (r *ReviewRepo) UserCanAccessStore(ctx context.Context, userID, storeID string) (bool, error) {
	return r.queries(ctx).SellerReviewUserCanAccessStore(ctx, gen.SellerReviewUserCanAccessStoreParams{
		ID:     storeID,
		UserID: userID,
	})
}

func (r *ReviewRepo) UserIsPlatformAdmin(ctx context.Context, userID string) (bool, error) {
	return r.queries(ctx).SellerReviewUserIsPlatformAdmin(ctx, userID)
}

func (r *ReviewRepo) ListSellerByStore(ctx context.Context, f application.SellerReviewListFilter) ([]application.SellerReviewListRow, error) {
	var status *string
	if f.Status != "" {
		s := f.Status
		status = &s
	}
	var q *string
	if f.Q != "" {
		s := f.Q
		q = &s
	}
	rows, err := r.queries(ctx).SellerReviewListByStore(ctx, gen.SellerReviewListByStoreParams{
		StoreID: f.StoreID,
		Limit:   int32(f.Limit),
		Status:  status,
		Rating:  f.Rating,
		Q:       q,
	})
	if err != nil {
		return nil, err
	}
	out := make([]application.SellerReviewListRow, 0, len(rows))
	for _, row := range rows {
		item := application.SellerReviewListRow{
			Review: reviews.Review{
				ID:               row.ID,
				StoreID:          row.StoreID,
				MerchantID:       row.MerchantID,
				ProductID:        row.ProductID,
				OrderID:          row.OrderID,
				OrderItemID:      row.OrderItemID,
				BuyerUserID:      row.BuyerUserID,
				Rating:           int32(row.Rating),
				Title:            row.Title,
				Body:             row.Body,
				Status:           row.Status,
				VerifiedPurchase: row.VerifiedPurchase,
				ContentVersion:   row.ContentVersion,
				CreatedAt:        row.CreatedAt,
				UpdatedAt:        row.UpdatedAt,
			},
			ProductTitle:    row.ProductTitle,
			StoreName:       row.StoreName,
			BuyerDisplay:    row.BuyerDisplay,
			SellerReplyBody: row.SellerReplyBody,
		}
		if row.ReplyContentVersion != nil {
			v := *row.ReplyContentVersion
			item.ReplyContentVersion = &v
		}
		out = append(out, item)
	}
	return out, nil
}

func (r *ReviewRepo) SummaryByStore(ctx context.Context, storeID string) (reviews.Summary, error) {
	row, err := r.queries(ctx).SellerReviewSummaryByStore(ctx, storeID)
	if err != nil {
		return reviews.Summary{}, err
	}
	return reviews.Summary{
		Count:         row.Count,
		AverageRating: row.AverageRating,
		Rating1:       row.Rating1,
		Rating2:       row.Rating2,
		Rating3:       row.Rating3,
		Rating4:       row.Rating4,
		Rating5:       row.Rating5,
	}, nil
}

func (r *ReviewRepo) GetReviewByStoreAndID(ctx context.Context, storeID, reviewID string) (reviews.Review, error) {
	row, err := r.queries(ctx).SellerReviewGetByStoreAndID(ctx, gen.SellerReviewGetByStoreAndIDParams{
		ID:      reviewID,
		StoreID: storeID,
	})
	if err != nil {
		return reviews.Review{}, err
	}
	return mapProductReview(row), nil
}

func (r *ReviewRepo) InsertReply(ctx context.Context, reply reviews.Reply) (reviews.Reply, error) {
	row, err := r.queries(ctx).SellerReviewReplyInsert(ctx, gen.SellerReviewReplyInsertParams{
		ID:           reply.ID,
		ReviewID:     reply.ReviewID,
		StoreID:      reply.StoreID,
		AuthorUserID: reply.AuthorUserID,
		Body:         reply.Body,
		CreatedAt:    reply.CreatedAt,
	})
	if err != nil {
		return reviews.Reply{}, err
	}
	return mapProductReviewReply(row), nil
}

func (r *ReviewRepo) UpdateReply(ctx context.Context, reviewID, storeID, body string, expectedVersion int32, now time.Time) (reviews.Reply, error) {
	row, err := r.queries(ctx).SellerReviewReplyUpdate(ctx, gen.SellerReviewReplyUpdateParams{
		ReviewID:       reviewID,
		StoreID:        storeID,
		Body:           body,
		UpdatedAt:      now,
		ContentVersion: expectedVersion,
	})
	if err != nil {
		return reviews.Reply{}, err
	}
	return mapProductReviewReply(row), nil
}

func (r *ReviewRepo) InsertReport(ctx context.Context, report application.SellerReviewReportRow) (application.SellerReviewReportRow, error) {
	row, err := r.queries(ctx).SellerReviewReportInsert(ctx, gen.SellerReviewReportInsertParams{
		ID:             report.ID,
		ReviewID:       report.ReviewID,
		ReporterUserID: report.ReporterUserID,
		ReasonCode:     report.ReasonCode,
		Context:        report.Context,
		CreatedAt:      report.CreatedAt,
	})
	if err != nil {
		return application.SellerReviewReportRow{}, err
	}
	return mapProductReviewReport(row), nil
}

func (r *ReviewRepo) GetReportByDedupe(ctx context.Context, reviewID, reporterUserID, reasonCode string) (application.SellerReviewReportRow, error) {
	row, err := r.queries(ctx).SellerReviewReportGetByDedupe(ctx, gen.SellerReviewReportGetByDedupeParams{
		ReviewID:       reviewID,
		ReporterUserID: reporterUserID,
		ReasonCode:     reasonCode,
	})
	if err != nil {
		return application.SellerReviewReportRow{}, err
	}
	return mapProductReviewReport(row), nil
}

func mapProductReview(row gen.ProductReview) reviews.Review {
	return reviews.Review{
		ID:               row.ID,
		StoreID:          row.StoreID,
		MerchantID:       row.MerchantID,
		ProductID:        row.ProductID,
		OrderID:          row.OrderID,
		OrderItemID:      row.OrderItemID,
		BuyerUserID:      row.BuyerUserID,
		Rating:           int32(row.Rating),
		Title:            row.Title,
		Body:             row.Body,
		Status:           row.Status,
		VerifiedPurchase: row.VerifiedPurchase,
		ContentVersion:   row.ContentVersion,
		CreatedAt:        row.CreatedAt,
		UpdatedAt:        row.UpdatedAt,
	}
}

func mapProductReviewReply(row gen.ProductReviewReply) reviews.Reply {
	return reviews.Reply{
		ID:             row.ID,
		ReviewID:       row.ReviewID,
		StoreID:        row.StoreID,
		AuthorUserID:   row.AuthorUserID,
		Body:           row.Body,
		ContentVersion: row.ContentVersion,
		CreatedAt:      row.CreatedAt,
		UpdatedAt:      row.UpdatedAt,
	}
}

func mapProductReviewReport(row gen.ProductReviewReport) application.SellerReviewReportRow {
	return application.SellerReviewReportRow{
		ID:             row.ID,
		ReviewID:       row.ReviewID,
		ReporterUserID: row.ReporterUserID,
		ReasonCode:     row.ReasonCode,
		Context:        row.Context,
		Status:         row.Status,
		CreatedAt:      row.CreatedAt,
	}
}

var _ application.ReviewStore = (*ReviewRepo)(nil)
