package application

import (
	"context"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/delivery"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/orders"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/reviews"
	"github.com/dasepmoch/fersaku-new/backend/internal/platform/cursor"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// ReviewService implements verified-purchase reviews (BE-430).
type ReviewService struct {
	Store ReviewStore
	IDs   ports.IDGenerator
	Clock ports.Clock
	Log   ports.Logger
}

func (s *ReviewService) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now().UTC()
	}
	return time.Now().UTC()
}

// ReviewView is the API DTO (no PII beyond safe public fields).
type ReviewView struct {
	ID               string    `json:"id"`
	StoreID          string    `json:"storeId"`
	ProductID        string    `json:"productId"`
	OrderID          string    `json:"orderId,omitempty"`
	OrderItemID      string    `json:"orderItemId,omitempty"`
	Rating           int32     `json:"rating"`
	Title            string    `json:"title"`
	Body             string    `json:"body"`
	Status           string    `json:"status"`
	VerifiedPurchase bool      `json:"verifiedPurchase"`
	ContentVersion   int32     `json:"contentVersion"`
	CreatedAt        time.Time `json:"createdAt"`
	UpdatedAt        time.Time `json:"updatedAt"`
	SellerReply      *string   `json:"sellerReply,omitempty"`
}

// ReviewSummaryView is public aggregate ratings.
type ReviewSummaryView struct {
	ProductID     string  `json:"productId"`
	Count         int64   `json:"count"`
	AverageRating float64 `json:"averageRating"`
	Rating1       int64   `json:"rating1"`
	Rating2       int64   `json:"rating2"`
	Rating3       int64   `json:"rating3"`
	Rating4       int64   `json:"rating4"`
	Rating5       int64   `json:"rating5"`
}

// CreateReviewInput is buyer create payload. Server binds store/product from order item.
type CreateReviewInput struct {
	OrderItemID string
	// Optional client hints — rejected if they disagree with the order item.
	ProductID *string
	StoreID   *string
	Rating    int32
	Title     string
	Body      string
}

// PatchReviewInput is buyer edit payload.
type PatchReviewInput struct {
	ExpectedVersion int32
	Rating          *int32
	Title           *string
	Body            *string
}

const publicReviewDefaultLimit = 20
const publicReviewMaxLimit = 50

func toReviewView(r reviews.Review, includeOwner bool, reply *string) ReviewView {
	v := ReviewView{
		ID:               r.ID,
		StoreID:          r.StoreID,
		ProductID:        r.ProductID,
		Rating:           r.Rating,
		Title:            r.Title,
		Body:             r.Body,
		Status:           r.Status,
		VerifiedPurchase: r.VerifiedPurchase,
		ContentVersion:   r.ContentVersion,
		CreatedAt:        r.CreatedAt,
		UpdatedAt:        r.UpdatedAt,
		SellerReply:      reply,
	}
	if includeOwner {
		v.OrderID = r.OrderID
		v.OrderItemID = r.OrderItemID
	}
	return v
}

// CreateReview creates a verified review only when paid + delivered/active grant.
func (s *ReviewService) CreateReview(ctx context.Context, buyerUserID string, in CreateReviewInput) (ReviewView, error) {
	if buyerUserID == "" {
		return ReviewView{}, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required")
	}
	if in.OrderItemID == "" {
		return ReviewView{}, apperr.Validation(apperr.CodeValidationFailed, "orderItemId is required")
	}
	title, body, err := reviews.ValidateCreate(in.Rating, in.Title, in.Body)
	if err != nil {
		return ReviewView{}, err
	}
	el, err := s.Store.GetEligibility(ctx, in.OrderItemID, buyerUserID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return ReviewView{}, reviews.ErrNotFound
		}
		return ReviewView{}, apperr.Internal(apperr.CodeInternalError, "Eligibility lookup failed")
	}
	if el.BuyerUserID != buyerUserID {
		return ReviewView{}, reviews.ErrNotFound
	}
	// Client cannot rebind product/store.
	if in.ProductID != nil && *in.ProductID != "" && *in.ProductID != el.Item.ProductID {
		return ReviewView{}, reviews.ErrOrderItemMismatch
	}
	if in.StoreID != nil && *in.StoreID != "" && *in.StoreID != el.Item.StoreID {
		return ReviewView{}, reviews.ErrOrderItemMismatch
	}
	if !isReviewEligible(el) {
		return ReviewView{}, reviews.ErrNotEligible
	}
	// Idempotent uniqueness check.
	if existing, err := s.Store.GetReviewByBuyerOrderItem(ctx, buyerUserID, in.OrderItemID); err == nil {
		return toReviewView(existing, true, nil), reviews.ErrAlreadyExists
	} else if !s.Store.IsNotFound(err) {
		return ReviewView{}, apperr.Internal(apperr.CodeInternalError, "Review lookup failed")
	}

	now := s.now()
	r := reviews.Review{
		ID:               s.IDs.New(),
		StoreID:          el.Item.StoreID,
		MerchantID:       el.Item.MerchantID,
		ProductID:        el.Item.ProductID,
		OrderID:          el.Item.OrderID,
		OrderItemID:      el.Item.ID,
		BuyerUserID:      buyerUserID,
		Rating:           in.Rating,
		Title:            title,
		Body:             body,
		Status:           reviews.StatusPublished,
		VerifiedPurchase: true,
		ContentVersion:   1,
		CreatedAt:        now,
		UpdatedAt:        now,
	}
	if err := s.Store.InsertReview(ctx, r); err != nil {
		if s.Store.IsUniqueViolation(err) {
			if existing, e2 := s.Store.GetReviewByBuyerOrderItem(ctx, buyerUserID, in.OrderItemID); e2 == nil {
				return toReviewView(existing, true, nil), reviews.ErrAlreadyExists
			}
			return ReviewView{}, reviews.ErrAlreadyExists
		}
		return ReviewView{}, apperr.Internal(apperr.CodeInternalError, "Review create failed")
	}
	return toReviewView(r, true, nil), nil
}

func isReviewEligible(el ReviewEligibility) bool {
	if el.PaymentStatus != orders.PaymentPaid || el.PaidAt == nil {
		return false
	}
	// Verified review eligibility only after paid delivery: grant must exist and not be revoked/failed pending.
	if !el.HasGrant || el.GrantRevoked {
		return false
	}
	switch el.GrantStatus {
	case delivery.StatusActive, delivery.StatusExpired:
		// Delivered (ACTIVE) or previously delivered then expired still counts as delivered purchase.
		return true
	default:
		return false
	}
}

// PatchReview updates owned review content only (no rebinding).
func (s *ReviewService) PatchReview(ctx context.Context, buyerUserID, reviewID string, in PatchReviewInput) (ReviewView, error) {
	if buyerUserID == "" {
		return ReviewView{}, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required")
	}
	if reviewID == "" {
		return ReviewView{}, reviews.ErrNotFound
	}
	if in.ExpectedVersion < 1 {
		return ReviewView{}, apperr.Validation(apperr.CodeValidationFailed, "expectedVersion is required")
	}
	cur, err := s.Store.GetReviewByID(ctx, reviewID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return ReviewView{}, reviews.ErrNotFound
		}
		return ReviewView{}, apperr.Internal(apperr.CodeInternalError, "Review lookup failed")
	}
	if cur.BuyerUserID != buyerUserID {
		return ReviewView{}, reviews.ErrNotFound
	}
	if cur.Status == reviews.StatusRemoved {
		return ReviewView{}, reviews.ErrNotFound
	}
	t, b, hasTitle, hasBody, err := reviews.ValidatePatch(in.Rating, in.Title, in.Body)
	if err != nil {
		return ReviewView{}, err
	}
	rating := cur.Rating
	if in.Rating != nil {
		rating = *in.Rating
	}
	title := cur.Title
	if hasTitle {
		title = t
	}
	body := cur.Body
	if hasBody {
		body = b
	}
	if title == "" && body == "" {
		return ReviewView{}, reviews.ErrInvalidContent
	}
	updated, err := s.Store.UpdateReviewContent(ctx, reviewID, buyerUserID, rating, title, body, in.ExpectedVersion, s.now())
	if err != nil {
		if s.Store.IsNotFound(err) {
			return ReviewView{}, reviews.ErrVersionConflict
		}
		return ReviewView{}, apperr.Internal(apperr.CodeInternalError, "Review update failed")
	}
	return toReviewView(updated, true, nil), nil
}

// ListPublicByProduct returns published reviews for a product.
func (s *ReviewService) ListPublicByProduct(ctx context.Context, productID, rawCursor string, limit int) ([]ReviewView, *cursor.Key, bool, error) {
	if productID == "" {
		return nil, nil, false, apperr.Validation(apperr.CodeValidationFailed, "productId is required")
	}
	if limit <= 0 {
		limit = publicReviewDefaultLimit
	}
	if limit > publicReviewMaxLimit {
		limit = publicReviewMaxLimit
	}
	var curAt *time.Time
	var curID *string
	if rawCursor != "" {
		k, err := cursor.Decode(rawCursor)
		if err != nil {
			return nil, nil, false, apperr.Validation(apperr.CodeValidationFailed, "Invalid cursor")
		}
		t := k.CreatedAt
		id := k.ID
		curAt = &t
		curID = &id
	}
	rows, err := s.Store.ListPublicByProduct(ctx, productID, curAt, curID, int32(limit+1))
	if err != nil {
		return nil, nil, false, apperr.Internal(apperr.CodeInternalError, "Review list failed")
	}
	hasMore := len(rows) > limit
	if hasMore {
		rows = rows[:limit]
	}
	out := make([]ReviewView, 0, len(rows))
	for _, r := range rows {
		var replyPtr *string
		if reply, err := s.Store.GetReplyByReview(ctx, r.ID); err == nil && reply.Body != "" {
			b := reply.Body
			replyPtr = &b
		}
		out = append(out, toReviewView(r, false, replyPtr))
	}
	var next *cursor.Key
	if hasMore && len(rows) > 0 {
		last := rows[len(rows)-1]
		next = &cursor.Key{CreatedAt: last.CreatedAt, ID: last.ID}
	}
	return out, next, hasMore, nil
}

// SummaryByProduct returns published rating aggregates.
func (s *ReviewService) SummaryByProduct(ctx context.Context, productID string) (ReviewSummaryView, error) {
	if productID == "" {
		return ReviewSummaryView{}, apperr.Validation(apperr.CodeValidationFailed, "productId is required")
	}
	sum, err := s.Store.SummaryByProduct(ctx, productID)
	if err != nil {
		return ReviewSummaryView{}, apperr.Internal(apperr.CodeInternalError, "Review summary failed")
	}
	return ReviewSummaryView{
		ProductID:     productID,
		Count:         sum.Count,
		AverageRating: sum.AverageRating,
		Rating1:       sum.Rating1,
		Rating2:       sum.Rating2,
		Rating3:       sum.Rating3,
		Rating4:       sum.Rating4,
		Rating5:       sum.Rating5,
	}, nil
}
