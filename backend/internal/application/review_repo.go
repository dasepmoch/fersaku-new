package application

import (
	"context"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/orders"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/reviews"
)

// ReviewEligibility is order-item ownership + paid state for review create.
type ReviewEligibility struct {
	Item          orders.OrderItem
	BuyerUserID   string
	PaymentStatus string
	PaidAt        *time.Time
	GrantStatus   string
	GrantRevoked  bool
	HasGrant      bool
}

// SellerReviewListRow is a joined store-scoped review row for seller list (SEL-270).
type SellerReviewListRow struct {
	Review              reviews.Review
	ProductTitle        string
	StoreName           string
	BuyerDisplay        string
	SellerReplyBody     string
	ReplyContentVersion *int32
}

// SellerReviewListFilter is the bounded seller list filter (no paging control).
type SellerReviewListFilter struct {
	StoreID string
	Q       string
	Status  string
	Rating  *int32
	Limit   int
}

// SellerReviewReportRow is a report persistence row.
type SellerReviewReportRow struct {
	ID             string
	ReviewID       string
	ReporterUserID string
	ReasonCode     string
	Context        string
	Status         string
	CreatedAt      time.Time
}

// ReviewStore is the persistence port for product reviews (BE-430 + SEL-270).
type ReviewStore interface {
	WithTx(ctx context.Context, fn func(ctx context.Context) error) error
	InsertReview(ctx context.Context, r reviews.Review) error
	GetReviewByID(ctx context.Context, id string) (reviews.Review, error)
	GetReviewByBuyerOrderItem(ctx context.Context, buyerUserID, orderItemID string) (reviews.Review, error)
	UpdateReviewContent(ctx context.Context, id, buyerUserID string, rating int32, title, body string, expectedVersion int32, now time.Time) (reviews.Review, error)
	ListPublicByProduct(ctx context.Context, productID string, cursorCreatedAt *time.Time, cursorID *string, limit int32) ([]reviews.Review, error)
	SummaryByProduct(ctx context.Context, productID string) (reviews.Summary, error)
	GetEligibility(ctx context.Context, orderItemID, buyerUserID string) (ReviewEligibility, error)
	GetReplyByReview(ctx context.Context, reviewID string) (reviews.Reply, error)
	// SEL-270 seller store-scoped operations
	UserCanAccessStore(ctx context.Context, userID, storeID string) (bool, error)
	UserIsPlatformAdmin(ctx context.Context, userID string) (bool, error)
	ListSellerByStore(ctx context.Context, f SellerReviewListFilter) ([]SellerReviewListRow, error)
	SummaryByStore(ctx context.Context, storeID string) (reviews.Summary, error)
	GetReviewByStoreAndID(ctx context.Context, storeID, reviewID string) (reviews.Review, error)
	InsertReply(ctx context.Context, reply reviews.Reply) (reviews.Reply, error)
	UpdateReply(ctx context.Context, reviewID, storeID, body string, expectedVersion int32, now time.Time) (reviews.Reply, error)
	InsertReport(ctx context.Context, row SellerReviewReportRow) (SellerReviewReportRow, error)
	GetReportByDedupe(ctx context.Context, reviewID, reporterUserID, reasonCode string) (SellerReviewReportRow, error)
	IsNotFound(err error) bool
	IsUniqueViolation(err error) bool
}
