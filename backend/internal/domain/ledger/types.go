package ledger

import "time"

// Payment modes and sources (aligned with payments domain).
const (
	ModeSandbox = "SANDBOX"
	ModeLive    = "LIVE"

	SourceStorefront = "STOREFRONT"
	SourceQRISAPI    = "QRIS_API"
	SourceMixed      = "MIXED"
	SourceSystem     = "SYSTEM"

	CurrencyIDR = "IDR"
)

// Template codes (closed set; app never supplies raw legs over HTTP).
const (
	TemplatePaymentCapture    = "PAYMENT_CAPTURE"
	TemplateSettlementRelease = "SETTLEMENT_RELEASE"
	// Withdrawal templates reserved for BE-350 (helpers only here).
	TemplateWithdrawalReserve   = "WITHDRAWAL_RESERVE"
	TemplateWithdrawalRelease   = "WITHDRAWAL_RELEASE"
	TemplateWithdrawalComplete  = "WITHDRAWAL_COMPLETE"
	TemplateWithdrawalRecapture = "WITHDRAWAL_RECAPTURE"
)

// Account codes (system COA).
const (
	AcctXenditReceivable            = "XENDIT_RECEIVABLE"
	AcctXenditCash                  = "XENDIT_CASH"
	AcctXenditProviderExpense       = "XENDIT_PROVIDER_EXPENSE"
	AcctMerchantPending             = "MERCHANT_PENDING"
	AcctMerchantAvailable           = "MERCHANT_AVAILABLE"
	AcctMerchantHeld                = "MERCHANT_HELD"
	AcctMerchantRecoveryReceivable  = "MERCHANT_RECOVERY_RECEIVABLE"
	AcctPlatformFeeRevenue          = "PLATFORM_FEE_REVENUE"
	AcctPaymentProcessingRevenue    = "PAYMENT_PROCESSING_REVENUE"
	AcctProviderDisbursementPayable = "PROVIDER_DISBURSEMENT_PAYABLE"
	AcctProviderFeeVarianceIncome   = "PROVIDER_FEE_VARIANCE_INCOME"
	AcctPlatformProviderSubsidy     = "PLATFORM_PROVIDER_SUBSIDY"
	AcctPlatformSubsidy             = "PLATFORM_SUBSIDY"
	AcctProviderReversalClearing    = "PROVIDER_REVERSAL_CLEARING"
	AcctWithdrawalClearing          = "WITHDRAWAL_CLEARING"
)

// Entry sides.
const (
	SideDebit  = "DEBIT"
	SideCredit = "CREDIT"
)

// Fee component tags on legs.
const (
	FeeGross       = "GROSS"
	FeeMerchantNet = "MERCHANT_NET"
	FeePercent     = "FEE_PERCENT"
	FeeFixed       = "FEE_FIXED"
	FeePlatform    = "PLATFORM_FEE"
	FeeProvider    = "PROVIDER_FEE"
)

// Lot statuses.
const (
	LotPending            = "PENDING"
	LotAvailable          = "AVAILABLE"
	LotPartiallyConsumed  = "PARTIALLY_CONSUMED"
	LotConsumed           = "CONSUMED"
	LotHeld               = "HELD"
)

// Ledger list item types for seller finance UI.
const (
	ItemTypeSale         = "SALE"
	ItemTypePlatformFee  = "PLATFORM_FEE"
	ItemTypeProviderFee  = "PROVIDER_FEE"
	ItemTypeWithdrawal   = "WITHDRAWAL"
	ItemTypeAdjustment   = "ADJUSTMENT"
	ItemTypeRelease      = "SETTLEMENT_RELEASE"
)

// Direction for list DTO.
const (
	DirectionCredit = "CREDIT"
	DirectionDebit  = "DEBIT"
)

// DefaultSettlementDelaySeconds is production default (1 day). Local may set 0.
const DefaultSettlementDelaySeconds int64 = 86400

// EntryLeg is one balanced journal leg (positive whole IDR).
type EntryLeg struct {
	AccountCode     string
	Side            string
	AmountIDR       int64
	FeeComponent    string
	SettlementLotID string
	AvailableAt     *time.Time
}

// Journal is a posted double-entry header.
type Journal struct {
	ID               string
	MerchantID       string
	StoreID          *string
	PaymentMode      string
	Source           string
	TemplateCode     string
	ReferenceType    string
	ReferenceID      string
	JournalReference string
	IdempotencyKey   string
	Status           string
	Currency         string
	Description      string
	PaymentIntentID  *string
	OrderID          *string
	SettlementLotID  *string
	FeeSnapshotID    *string
	GrossIDR         *int64
	FeePercentIDR    *int64
	FeeFixedIDR      *int64
	MerchantNetIDR   *int64
	PostedAt         time.Time
	CreatedAt        time.Time
}

// Entry is an append-only ledger leg.
type Entry struct {
	ID              string
	JournalID       string
	AccountCode     string
	Side            string
	AmountIDR       int64
	Currency        string
	FeeComponent    *string
	Source          string
	PaymentMode     string
	MerchantID      string
	SettlementLotID *string
	AvailableAt     *time.Time
	LineNo          int32
	CreatedAt       time.Time
}

// SettlementLot is an immutable credit lot for FIFO withdrawal allocation.
type SettlementLot struct {
	ID                 string
	MerchantID         string
	StoreID            *string
	PaymentMode        string
	Source             string
	PaymentIntentID    *string
	OrderID            *string
	CaptureJournalID   *string
	ReleaseJournalID   *string
	OriginalAmountIDR  int64
	RemainingAmountIDR int64
	Currency           string
	Status             string
	AvailableAt        time.Time
	ReleasedAt         *time.Time
	CreatedAt          time.Time
	UpdatedAt          time.Time
}

// Balance is the unified merchant wallet projection for one payment_mode.
type Balance struct {
	MerchantID            string
	PaymentMode           string
	AvailableIDR          int64
	PendingIDR            int64
	HeldIDR               int64
	LifetimeGrossIDR      int64
	LifetimeFeePercentIDR int64
	LifetimeFeeFixedIDR   int64
	LifetimeNetIDR        int64
	MonthGrossIDR         int64
	MonthFeePercentIDR    int64
	MonthFeeFixedIDR      int64
	MonthNetIDR           int64
	MonthBucket           string
	Currency              string
	Version               int64
	UpdatedAt             time.Time
}

// SourceBalance is per-source breakdown (STOREFRONT | QRIS_API).
type SourceBalance struct {
	MerchantID     string
	PaymentMode    string
	Source         string
	AvailableIDR   int64
	PendingIDR     int64
	HeldIDR        int64
	LifetimeNetIDR int64
	Currency       string
	UpdatedAt      time.Time
}

// FinanceSummary is the seller finance summary DTO shape.
type FinanceSummary struct {
	StoreID                 string
	MerchantID              string
	PaymentMode             string
	AvailableAmount         int64
	PendingAmount           int64
	HeldAmount              int64
	LifetimeGrossAmount     int64
	MonthGrossAmount        int64
	MonthPlatformFeeAmount  int64 // merchant 3% component
	MonthProviderFeeAmount  int64 // merchant-charged Rp700 processing
	MonthNetAmount          int64
	Sources                 map[string]SourceAmounts
	Currency                string
	AsOf                    time.Time
	FeePolicy               FeePolicyView
	WithdrawalAllocationPolicy string
}

// SourceAmounts is available/pending for one source.
type SourceAmounts struct {
	AvailableAmount int64
	PendingAmount   int64
}

// FeePolicyView is the launch fee constants for finance summary.
type FeePolicyView struct {
	TransactionPercentBps int64
	TransactionFixedIDR   int64
	WithdrawalPercentBps  int64
	MinimumWithdrawalIDR  int64
}

// LedgerListItem is a seller-facing ledger row.
type LedgerListItem struct {
	ID           string
	StoreID      string
	Type         string
	Description  string
	Amount       int64
	Direction    string
	Source       string
	OccurredAt   time.Time
	OrderID      *string
	WithdrawalID *string
	JournalID    string
	TemplateCode string
}

// PaymentCaptureInput is the closed template input for PAYMENT_CAPTURE.
type PaymentCaptureInput struct {
	JournalID        string
	LotID            string
	MerchantID       string
	StoreID          string
	PaymentMode      string
	Source           string
	PaymentIntentID  string
	OrderID          string
	FeeSnapshotID    string
	GrossIDR         int64
	FeePercentIDR    int64
	FeeFixedIDR      int64
	MerchantNetIDR   int64
	JournalReference string
	IdempotencyKey   string
	Description      string
	PostedAt         time.Time
	AvailableAt      time.Time
	// ImmediateRelease posts SETTLEMENT_RELEASE in the same transaction when true.
	ImmediateRelease bool
	ReleaseJournalID string
}

// AllocationSlice is one source slice of a mixed withdrawal (BE-350 helper).
type AllocationSlice struct {
	Source          string
	SettlementLotID string
	AmountIDR       int64
	AvailableAt     time.Time
}

// WithdrawalAllocation is FIFO result across settlement lots.
type WithdrawalAllocation struct {
	AmountDebited int64
	Source        string // STOREFRONT | QRIS_API | MIXED
	Allocations   []AllocationSlice
}

// RevenuePoint is a daily revenue aggregate for finance/revenue.
type RevenuePoint struct {
	Day     string
	Revenue int64
	Orders  int64
}
