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

// ReviewStore is the persistence port for product reviews (BE-430).
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
	IsNotFound(err error) bool
	IsUniqueViolation(err error) bool
}
