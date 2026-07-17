package reviews

import "time"

// Review status values (§4 / §5.8).
const (
	StatusPending   = "PENDING"
	StatusPublished = "PUBLISHED"
	StatusNeedsEdit = "NEEDS_EDIT"
	StatusRemoved   = "REMOVED"
)

const (
	MinRating     = 1
	MaxRating     = 5
	MaxTitleRunes = 200
	MaxBodyRunes  = 4000
	MaxReplyRunes = 2000
)

// Report reason codes accepted from seller report command (SEL-270).
const (
	ReportReasonSpam       = "SPAM"
	ReportReasonAbuse      = "ABUSE"
	ReportReasonOffTopic   = "OFF_TOPIC"
	ReportReasonOther      = "OTHER"
	ReportReasonInaccurate = "INACCURATE"
)

// Review is a verified-purchase product review.
type Review struct {
	ID               string
	StoreID          string
	MerchantID       string
	ProductID        string
	OrderID          string
	OrderItemID      string
	BuyerUserID      string
	Rating           int32
	Title            string
	Body             string
	Status           string
	VerifiedPurchase bool
	ContentVersion   int32
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

// Reply is the single public seller reply per review (seller write is out of BE-430 core).
type Reply struct {
	ID             string
	ReviewID       string
	StoreID        string
	AuthorUserID   string
	Body           string
	ContentVersion int32
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// Summary aggregates published ratings for a product.
type Summary struct {
	ProductID     string
	Count         int64
	AverageRating float64
	Rating1       int64
	Rating2       int64
	Rating3       int64
	Rating4       int64
	Rating5       int64
}
