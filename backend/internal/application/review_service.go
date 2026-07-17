package application

import (
	"context"
	"strings"
	"time"
	"unicode/utf8"

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

// --- SEL-270 seller store-scoped reviews ---

const (
	sellerReviewDefaultLimit = 50
	sellerReviewMaxLimit     = 50
	sellerReviewMaxSearchLen = 100
	sellerReportContextMax   = 1000
)

// SellerReviewView is the seller list/detail card DTO (safe buyer display only).
type SellerReviewView struct {
	ID                  string    `json:"id"`
	StoreID             string    `json:"storeId"`
	ProductID           string    `json:"productId"`
	ProductTitle        string    `json:"productTitle"`
	SellerName          string    `json:"sellerName"`
	BuyerDisplay        string    `json:"buyerDisplay"`
	Rating              int32     `json:"rating"`
	Title               string    `json:"title"`
	Body                string    `json:"body"`
	Status              string    `json:"status"`
	VerifiedPurchase    bool      `json:"verifiedPurchase"`
	ContentVersion      int32     `json:"contentVersion"`
	CreatedAt           time.Time `json:"createdAt"`
	UpdatedAt           time.Time `json:"updatedAt"`
	SellerReply         *string   `json:"sellerReply,omitempty"`
	ReplyContentVersion *int32    `json:"replyContentVersion,omitempty"`
}

// SellerStoreReviewSummaryView is store-level published rating aggregate.
type SellerStoreReviewSummaryView struct {
	StoreID       string  `json:"storeId"`
	Count         int64   `json:"count"`
	AverageRating float64 `json:"averageRating"`
	Rating1       int64   `json:"rating1"`
	Rating2       int64   `json:"rating2"`
	Rating3       int64   `json:"rating3"`
	Rating4       int64   `json:"rating4"`
	Rating5       int64   `json:"rating5"`
}

// UpsertSellerReplyInput is create/update seller reply body.
type UpsertSellerReplyInput struct {
	Body            string
	ExpectedVersion *int32
}

// SellerReplyView is the reply command response.
type SellerReplyView struct {
	ReviewID       string    `json:"reviewId"`
	StoreID        string    `json:"storeId"`
	Body           string    `json:"body"`
	ContentVersion int32     `json:"contentVersion"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

// ReportSellerReviewInput is the report command (no moderation status change).
type ReportSellerReviewInput struct {
	ReasonCode string
	Context    string
}

// SellerReviewReportView is report command response.
type SellerReviewReportView struct {
	ID         string    `json:"id"`
	ReviewID   string    `json:"reviewId"`
	ReasonCode string    `json:"reasonCode"`
	Status     string    `json:"status"`
	CreatedAt  time.Time `json:"createdAt"`
}

func (s *ReviewService) requireStoreAccess(ctx context.Context, userID, storeID string) error {
	if userID == "" {
		return apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required")
	}
	if storeID == "" {
		return reviews.ErrNotFound
	}
	if s.Store == nil {
		return apperr.Internal(apperr.CodeInternalError, "Reviews unavailable")
	}
	admin, err := s.Store.UserIsPlatformAdmin(ctx, userID)
	if err != nil {
		return apperr.Internal(apperr.CodeInternalError, "Authorization check failed")
	}
	if admin {
		return nil
	}
	ok, err := s.Store.UserCanAccessStore(ctx, userID, storeID)
	if err != nil {
		return apperr.Internal(apperr.CodeInternalError, "Authorization check failed")
	}
	if !ok {
		return reviews.ErrNotFound
	}
	return nil
}

func normalizeSellerReviewFilter(f SellerReviewListFilter) SellerReviewListFilter {
	f.StoreID = strings.TrimSpace(f.StoreID)
	f.Q = strings.TrimSpace(f.Q)
	if utf8.RuneCountInString(f.Q) > sellerReviewMaxSearchLen {
		f.Q = string([]rune(f.Q)[:sellerReviewMaxSearchLen])
	}
	f.Status = strings.ToUpper(strings.TrimSpace(f.Status))
	switch f.Status {
	case reviews.StatusPending, reviews.StatusPublished, reviews.StatusNeedsEdit:
		// allowed filter values
	default:
		f.Status = ""
	}
	if f.Rating != nil {
		if *f.Rating < reviews.MinRating || *f.Rating > reviews.MaxRating {
			f.Rating = nil
		}
	}
	if f.Limit <= 0 {
		f.Limit = sellerReviewDefaultLimit
	}
	if f.Limit > sellerReviewMaxLimit {
		f.Limit = sellerReviewMaxLimit
	}
	return f
}

// ListSellerByStore returns a bounded first-page seller review list (no cursor UI).
func (s *ReviewService) ListSellerByStore(ctx context.Context, userID string, f SellerReviewListFilter) ([]SellerReviewView, error) {
	f = normalizeSellerReviewFilter(f)
	if err := s.requireStoreAccess(ctx, userID, f.StoreID); err != nil {
		return nil, err
	}
	rows, err := s.Store.ListSellerByStore(ctx, f)
	if err != nil {
		return nil, apperr.Internal(apperr.CodeInternalError, "Review list failed")
	}
	out := make([]SellerReviewView, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapSellerReviewRow(row))
	}
	return out, nil
}

// SummaryByStore returns published rating aggregates for a store.
func (s *ReviewService) SummaryByStore(ctx context.Context, userID, storeID string) (SellerStoreReviewSummaryView, error) {
	storeID = strings.TrimSpace(storeID)
	if err := s.requireStoreAccess(ctx, userID, storeID); err != nil {
		return SellerStoreReviewSummaryView{}, err
	}
	sum, err := s.Store.SummaryByStore(ctx, storeID)
	if err != nil {
		return SellerStoreReviewSummaryView{}, apperr.Internal(apperr.CodeInternalError, "Review summary failed")
	}
	return SellerStoreReviewSummaryView{
		StoreID:       storeID,
		Count:         sum.Count,
		AverageRating: sum.AverageRating,
		Rating1:       sum.Rating1,
		Rating2:       sum.Rating2,
		Rating3:       sum.Rating3,
		Rating4:       sum.Rating4,
		Rating5:       sum.Rating5,
	}, nil
}

// UpsertSellerReply creates or version-updates the single public seller reply.
func (s *ReviewService) UpsertSellerReply(ctx context.Context, userID, storeID, reviewID string, in UpsertSellerReplyInput) (SellerReplyView, error) {
	storeID = strings.TrimSpace(storeID)
	reviewID = strings.TrimSpace(reviewID)
	if err := s.requireStoreAccess(ctx, userID, storeID); err != nil {
		return SellerReplyView{}, err
	}
	if reviewID == "" {
		return SellerReplyView{}, reviews.ErrNotFound
	}
	body, err := reviews.ValidateReplyBody(in.Body)
	if err != nil {
		return SellerReplyView{}, err
	}
	if _, err := s.Store.GetReviewByStoreAndID(ctx, storeID, reviewID); err != nil {
		if s.Store.IsNotFound(err) {
			return SellerReplyView{}, reviews.ErrNotFound
		}
		return SellerReplyView{}, apperr.Internal(apperr.CodeInternalError, "Review lookup failed")
	}
	now := s.now()
	existing, err := s.Store.GetReplyByReview(ctx, reviewID)
	if err != nil && !s.Store.IsNotFound(err) {
		return SellerReplyView{}, apperr.Internal(apperr.CodeInternalError, "Reply lookup failed")
	}
	if s.Store.IsNotFound(err) {
		reply, err := s.Store.InsertReply(ctx, reviews.Reply{
			ID:             s.IDs.New(),
			ReviewID:       reviewID,
			StoreID:        storeID,
			AuthorUserID:   userID,
			Body:           body,
			ContentVersion: 1,
			CreatedAt:      now,
			UpdatedAt:      now,
		})
		if err != nil {
			if s.Store.IsUniqueViolation(err) {
				// Race: another write created the reply; surface conflict.
				return SellerReplyView{}, reviews.ErrReplyVersionConflict
			}
			return SellerReplyView{}, apperr.Internal(apperr.CodeInternalError, "Reply create failed")
		}
		return SellerReplyView{
			ReviewID:       reply.ReviewID,
			StoreID:        reply.StoreID,
			Body:           reply.Body,
			ContentVersion: reply.ContentVersion,
			CreatedAt:      reply.CreatedAt,
			UpdatedAt:      reply.UpdatedAt,
		}, nil
	}
	expected := existing.ContentVersion
	if in.ExpectedVersion != nil {
		expected = *in.ExpectedVersion
	}
	updated, err := s.Store.UpdateReply(ctx, reviewID, storeID, body, expected, now)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return SellerReplyView{}, reviews.ErrReplyVersionConflict
		}
		return SellerReplyView{}, apperr.Internal(apperr.CodeInternalError, "Reply update failed")
	}
	return SellerReplyView{
		ReviewID:       updated.ReviewID,
		StoreID:        updated.StoreID,
		Body:           updated.Body,
		ContentVersion: updated.ContentVersion,
		CreatedAt:      updated.CreatedAt,
		UpdatedAt:      updated.UpdatedAt,
	}, nil
}

// ReportSellerReview records a seller report without changing moderation status.
func (s *ReviewService) ReportSellerReview(ctx context.Context, userID, storeID, reviewID string, in ReportSellerReviewInput) (SellerReviewReportView, error) {
	storeID = strings.TrimSpace(storeID)
	reviewID = strings.TrimSpace(reviewID)
	if err := s.requireStoreAccess(ctx, userID, storeID); err != nil {
		return SellerReviewReportView{}, err
	}
	if reviewID == "" {
		return SellerReviewReportView{}, reviews.ErrNotFound
	}
	reason, err := reviews.NormalizeReportReason(in.ReasonCode)
	if err != nil {
		return SellerReviewReportView{}, err
	}
	contextText := strings.TrimSpace(in.Context)
	if utf8.RuneCountInString(contextText) > sellerReportContextMax {
		contextText = string([]rune(contextText)[:sellerReportContextMax])
	}
	if _, err := s.Store.GetReviewByStoreAndID(ctx, storeID, reviewID); err != nil {
		if s.Store.IsNotFound(err) {
			return SellerReviewReportView{}, reviews.ErrNotFound
		}
		return SellerReviewReportView{}, apperr.Internal(apperr.CodeInternalError, "Review lookup failed")
	}
	if existing, err := s.Store.GetReportByDedupe(ctx, reviewID, userID, reason); err == nil {
		return SellerReviewReportView{
			ID:         existing.ID,
			ReviewID:   existing.ReviewID,
			ReasonCode: existing.ReasonCode,
			Status:     existing.Status,
			CreatedAt:  existing.CreatedAt,
		}, reviews.ErrReportDuplicate
	} else if !s.Store.IsNotFound(err) {
		return SellerReviewReportView{}, apperr.Internal(apperr.CodeInternalError, "Report lookup failed")
	}
	now := s.now()
	row, err := s.Store.InsertReport(ctx, SellerReviewReportRow{
		ID:             s.IDs.New(),
		ReviewID:       reviewID,
		ReporterUserID: userID,
		ReasonCode:     reason,
		Context:        contextText,
		Status:         "OPEN",
		CreatedAt:      now,
	})
	if err != nil {
		if s.Store.IsUniqueViolation(err) {
			if existing, e2 := s.Store.GetReportByDedupe(ctx, reviewID, userID, reason); e2 == nil {
				return SellerReviewReportView{
					ID:         existing.ID,
					ReviewID:   existing.ReviewID,
					ReasonCode: existing.ReasonCode,
					Status:     existing.Status,
					CreatedAt:  existing.CreatedAt,
				}, reviews.ErrReportDuplicate
			}
			return SellerReviewReportView{}, reviews.ErrReportDuplicate
		}
		return SellerReviewReportView{}, apperr.Internal(apperr.CodeInternalError, "Report create failed")
	}
	return SellerReviewReportView{
		ID:         row.ID,
		ReviewID:   row.ReviewID,
		ReasonCode: row.ReasonCode,
		Status:     row.Status,
		CreatedAt:  row.CreatedAt,
	}, nil
}

func mapSellerReviewRow(row SellerReviewListRow) SellerReviewView {
	v := SellerReviewView{
		ID:               row.Review.ID,
		StoreID:          row.Review.StoreID,
		ProductID:        row.Review.ProductID,
		ProductTitle:     row.ProductTitle,
		SellerName:       row.StoreName,
		BuyerDisplay:     row.BuyerDisplay,
		Rating:           row.Review.Rating,
		Title:            row.Review.Title,
		Body:             row.Review.Body,
		Status:           row.Review.Status,
		VerifiedPurchase: row.Review.VerifiedPurchase,
		ContentVersion:   row.Review.ContentVersion,
		CreatedAt:        row.Review.CreatedAt,
		UpdatedAt:        row.Review.UpdatedAt,
	}
	if row.SellerReplyBody != "" {
		b := row.SellerReplyBody
		v.SellerReply = &b
	}
	if row.ReplyContentVersion != nil {
		cv := *row.ReplyContentVersion
		v.ReplyContentVersion = &cv
	}
	return v
}
