package analytics

import "time"

// Policy and aggregation constants (LAUNCH_ANALYTICS_POLICY_V1).
const (
	PolicyVersionLaunch     = "LAUNCH_ANALYTICS_POLICY_V1"
	ConsentNoticeV1         = "CONSENT_NOTICE_V1"
	CollectionV1            = "COLLECTION_V1"
	AggregationV1           = "v1"
	HashKeyVersionV1        = "v1"
	DefaultTimezone         = "Asia/Jakarta"
	LastNonDirectWindowDays = 30
	DefaultRawRetentionDays = 90
	DefaultMinCohort        = 1
)

// Event types.
const (
	EventPageView      = "PAGE_VIEW"
	EventSessionStart  = "SESSION_START"
	EventCheckoutStart = "CHECKOUT_START"
	EventProductView   = "PRODUCT_VIEW"
)

// Channels (closed set).
const (
	ChannelAll      = "all"
	ChannelDirect   = "direct"
	ChannelOrganic  = "organic"
	ChannelReferral = "referral"
	ChannelUTM      = "utm"
	ChannelSocial   = "social"
	ChannelEmail    = "email"
	ChannelPaid     = "paid"
	ChannelOther    = "other"
)

// Attribution models.
const (
	ModelLastNonDirect30D = "LAST_NON_DIRECT_30D"
	ModelDirect           = "DIRECT"
	ModelNone             = "NONE"
)

// Late-event policy.
const (
	LateConvertOnceOnPaid = "CONVERT_ONCE_ON_PAID"
	LateIgnoreAfterExpire = "IGNORE_AFTER_EXPIRE"
)

// Sources (must match payments).
const (
	SourceStorefront = "STOREFRONT"
	SourceQRISAPI    = "QRIS_API"
)

// CollectionPolicy is a versioned analytics policy row.
type CollectionPolicy struct {
	VersionID               string
	ConsentNoticeVersion    string
	CollectionVersion       string
	ReportingTimezone       string
	RawRetentionDays        int
	AggregateRetentionDays  int
	LastNonDirectWindowDays int
	MinCohortSize           int
	BotFilterEnabled        bool
	LateEventPolicy         string
	AnonymizeOnDelete       bool
	ChecksumSHA256          string
	IsActive                bool
	EffectiveFrom           time.Time
	CreatedAt               time.Time
}

// Session is a storefront session row (hashes only).
type Session struct {
	ID                   string
	StoreID              string
	MerchantID           string
	VisitorHash          string
	SessionHash          string
	HashKeyVersion       string
	LandingPath          string
	ReferrerOrigin       string
	UTMSource            string
	UTMMedium            string
	UTMCampaign          string
	UTMContent           string
	UTMTerm              string
	Channel              string
	IsBot                bool
	CollectionVersion    string
	ConsentNoticeVersion string
	PolicyVersionID      string
	FirstSeenAt          time.Time
	LastSeenAt           time.Time
	CreatedAt            time.Time
}

// Event is a raw attribution event.
type Event struct {
	ID                   string
	StoreID              string
	MerchantID           string
	SessionID            *string
	ProductID            *string
	VisitorHash          string
	SessionHash          string
	HashKeyVersion       string
	EventType            string
	LandingPath          string
	ReferrerOrigin       string
	UTMSource            string
	UTMMedium            string
	UTMCampaign          string
	UTMContent           string
	UTMTerm              string
	Channel              string
	IsBot                bool
	IsDirect             bool
	CollectionVersion    string
	ConsentNoticeVersion string
	PolicyVersionID      string
	OccurredAt           time.Time
	CreatedAt            time.Time
}

// OrderSnapshot is the immutable attribution snapshot bound to an order.
type OrderSnapshot struct {
	ID                   string
	OrderID              string
	PaymentIntentID      *string
	StoreID              string
	MerchantID           string
	ProductID            *string
	Source               string
	VisitorHash          string
	SessionHash          string
	HashKeyVersion       string
	LandingPath          string
	ReferrerOrigin       string
	UTMSource            string
	UTMMedium            string
	UTMCampaign          string
	UTMContent           string
	UTMTerm              string
	Channel              string
	AttributionModel     string
	AttributedEventID    *string
	CollectionVersion    string
	ConsentNoticeVersion string
	PolicyVersionID      string
	Converted            bool
	ConvertedAt          *time.Time
	PaidLate             bool
	GrossIDR             int64
	CapturedAt           time.Time
	CreatedAt            time.Time
}

// DailyAggregate is a rebuildable daily traffic row.
type DailyAggregate struct {
	ID                 string
	StoreID            string
	MerchantID         string
	Day                time.Time // date only
	Timezone           string
	Channel            string
	ProductID          string
	Sessions           int64
	PageViews          int64
	Checkouts          int64
	Orders             int64
	GrossIDR           int64
	PolicyVersionID    string
	AggregationVersion string
	RebuiltAt          time.Time
	CreatedAt          time.Time
	UpdatedAt          time.Time
}

// Overview is store-scoped analytics overview for a date range.
type Overview struct {
	StoreID            string
	Timezone           string
	FromDay            string
	ToDay              string
	Sessions           int64
	PageViews          int64
	Checkouts          int64
	Orders             int64
	GrossIDR           int64
	ConversionRateBps  int64 // orders/sessions * 10000; 0 if sessions=0
	Channels           []ChannelBreakdown
	PolicyVersionID    string
	AggregationVersion string
}

// ChannelBreakdown is aggregate by channel.
type ChannelBreakdown struct {
	Channel   string
	Sessions  int64
	Orders    int64
	GrossIDR  int64
}

// TrafficRow is one traffic series point (day or dimension).
type TrafficRow struct {
	Day       string
	Channel   string
	ProductID string
	Sessions  int64
	PageViews int64
	Checkouts int64
	Orders    int64
	GrossIDR  int64
}

// CaptureInput is normalized attribution captured at checkout/session create.
type CaptureInput struct {
	StoreID        string
	MerchantID     string
	ProductID      string
	OrderID        string
	PaymentIntentID string
	Source         string // STOREFRONT only for real traffic
	VisitorRaw     string // opaque client id; hashed before store
	SessionRaw     string
	LandingURL     string // may contain query; stripped
	ReferrerURL    string
	UTMSource      string
	UTMMedium      string
	UTMCampaign    string
	UTMContent     string
	UTMTerm        string
	UserAgent      string
	IsBot          bool
	GrossIDR       int64
	OccurredAt     time.Time
}

// Dimensions is the sanitized attribution dimension set.
type Dimensions struct {
	LandingPath    string
	ReferrerOrigin string
	UTMSource      string
	UTMMedium      string
	UTMCampaign    string
	UTMContent     string
	UTMTerm        string
	Channel        string
	IsDirect       bool
}
