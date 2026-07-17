package withdrawals

import "time"

// Status values (§5.5).
const (
	StatusRequested      = "REQUESTED"
	StatusUnderReview    = "UNDER_REVIEW"
	StatusApproved       = "APPROVED"
	StatusHeld           = "HELD"
	StatusProcessing     = "PROCESSING"
	StatusCompleted      = "COMPLETED"
	StatusFailed         = "FAILED"
	StatusUnknownOutcome = "UNKNOWN_OUTCOME"
	StatusRejected       = "REJECTED"
	StatusCancelled      = "CANCELLED"
)

// Quote statuses.
const (
	QuoteActive      = "ACTIVE"
	QuoteConsumed    = "CONSUMED"
	QuoteExpired     = "EXPIRED"
	QuoteInvalidated = "INVALIDATED"
)

// Bank account statuses.
const (
	BankPendingVerification = "PENDING_VERIFICATION"
	BankVerified            = "VERIFIED"
	BankArchived            = "ARCHIVED"
)

// Payment modes / sources (aligned with ledger).
const (
	ModeSandbox = "SANDBOX"
	ModeLive    = "LIVE"

	SourceStorefront = "STOREFRONT"
	SourceQRISAPI    = "QRIS_API"
	SourceMixed      = "MIXED"

	CurrencyIDR = "IDR"
	ProviderXendit = "xendit"
)

// Defaults.
const (
	DefaultQuoteTTLSeconds       int64 = 300
	DefaultBankChangeLockSeconds int64 = 86400
	DefaultProviderFeeIDR        int64 = 2500
)

// BankAccount is a merchant payout target (number ciphertext never leaves service layer).
type BankAccount struct {
	ID                    string
	MerchantID            string
	BankCode              string
	BankName              string
	AccountHolderName     string
	AccountNumberCipher   []byte
	EncryptionKeyVersion  string
	AccountNumberMasked   string
	AccountNumberLast4    string
	Status                string
	IsPrimary             bool
	Version               int64
	VerifiedAt            *time.Time
	ArchivedAt            *time.Time
	CreatedAt             time.Time
	UpdatedAt             time.Time
}

// Quote is a short-lived locked fee/bank snapshot.
type Quote struct {
	ID                     string
	MerchantID             string
	StoreID                *string
	PaymentMode            string
	AmountIDR              int64
	PlatformFeeIDR         int64
	ProviderFeeIDR         int64
	TotalFeeIDR            int64
	NetDisbursementIDR     int64
	Currency               string
	PolicyVersionID        string
	FeeSnapshotID          *string
	BankAccountID          string
	BankAccountVersion     int64
	BankCode               string
	BankName               string
	AccountHolderName      string
	AccountNumberMasked    string
	ProviderQuoteReference *string
	ProviderQuoteEvidence  string
	Status                 string
	IdempotencyKeyHash     string
	RequestHash            string
	ExpiresAt              time.Time
	ConsumedWithdrawalID   *string
	CreatedAt              time.Time
	UpdatedAt              time.Time
}

// Withdrawal is a reserved payout request.
type Withdrawal struct {
	ID                            string
	MerchantID                    string
	StoreID                       *string
	PaymentMode                   string
	Source                        string
	QuoteID                       string
	AmountIDR                     int64
	PlatformFeeIDR                int64
	ProviderFeeQuotedIDR          int64
	ProviderFeeActualIDR          *int64
	TotalFeeIDR                   int64
	NetDisbursementIDR            int64
	Currency                      string
	PolicyVersionID               string
	FeeSnapshotID                 *string
	BankAccountID                 string
	BankAccountVersion            int64
	BankCode                      string
	BankName                      string
	AccountHolderName             string
	AccountNumberMasked           string
	Status                        string
	Provider                      string
	AccountScope                  string
	ProviderDisbursementReference *string
	ProviderExternalID            *string
	ReserveJournalID              *string
	ReleaseJournalID              *string
	CompleteJournalID             *string
	FeeSettleJournalID            *string
	RecaptureJournalID            *string
	ReserveReleased               bool
	ReviewReason                  string
	RejectReason                  string
	HoldReason                    string
	ReviewedBy                    *string
	ReviewedAt                    *time.Time
	SubmittedAt                   *time.Time
	ProcessingAt                  *time.Time
	CompletedAt                   *time.Time
	FailedAt                      *time.Time
	UnknownOutcomeAt              *time.Time
	NextLookupAt                  *time.Time
	LookupAttempts                int32
	IdempotencyKeyHash            string
	RecoveryReceivableIDR         int64
	WithdrawalFrozen              bool
	CreatedAt                     time.Time
	UpdatedAt                     time.Time
	Allocations                   []Allocation
}

// Allocation is one FIFO lot slice snapshot.
type Allocation struct {
	ID              string
	WithdrawalID    string
	SettlementLotID string
	Source          string
	AmountIDR       int64
	AvailableAt     time.Time
	LineNo          int32
	CreatedAt       time.Time
}

// WithdrawalLock is a merchant-wide security lock.
type WithdrawalLock struct {
	MerchantID    string
	LockedUntil   time.Time
	Reason        string
	BankAccountID *string
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

// IsLocked reports whether the lock is still active at at.
func (l WithdrawalLock) IsLocked(at time.Time) bool {
	return l.MerchantID != "" && l.LockedUntil.After(at.UTC())
}
