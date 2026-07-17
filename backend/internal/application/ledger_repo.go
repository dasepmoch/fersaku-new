package application

import (
	"context"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/ledger"
)

// PostJournalParams is the controlled posting input (closed templates only).
type PostJournalParams struct {
	JournalID        string
	MerchantID       string
	StoreID          string
	PaymentMode      string
	Source           string
	TemplateCode     string
	ReferenceType    string
	ReferenceID      string
	JournalReference string
	IdempotencyKey   string
	Description      string
	PaymentIntentID  string
	OrderID          string
	SettlementLotID  string
	FeeSnapshotID    string
	GrossIDR         *int64
	FeePercentIDR    *int64
	FeeFixedIDR      *int64
	MerchantNetIDR   *int64
	PostedAt         time.Time
	Legs             []ledger.EntryLeg
}

// LedgerListFilter filters seller ledger list.
type LedgerListFilter struct {
	MerchantID  string
	PaymentMode string
	Source      *string
	Template    *string
	CursorAt    *time.Time
	CursorID    *string
	Limit       int32
}

// LedgerStore is the persistence port for BE-340 ledger.
type LedgerStore interface {
	// PostJournal calls post_ledger_transaction (idempotent by reference).
	PostJournal(ctx context.Context, p PostJournalParams) (journalID string, err error)
	GetJournalByReference(ctx context.Context, ref string) (ledger.Journal, error)
	GetJournalByID(ctx context.Context, id string) (ledger.Journal, error)
	ListJournals(ctx context.Context, f LedgerListFilter) ([]ledger.Journal, error)
	ListEntriesByJournal(ctx context.Context, journalID string) ([]ledger.Entry, error)

	GetBalance(ctx context.Context, merchantID, paymentMode string) (ledger.Balance, error)
	ListSourceBalances(ctx context.Context, merchantID, paymentMode string) ([]ledger.SourceBalance, error)
	RebuildBalances(ctx context.Context, merchantID, paymentMode string) error

	InsertSettlementLot(ctx context.Context, lot ledger.SettlementLot) (ledger.SettlementLot, error)
	GetLotByIntent(ctx context.Context, paymentIntentID string) (ledger.SettlementLot, error)
	GetLotByID(ctx context.Context, id string) (ledger.SettlementLot, error)
	UpdateLotAfterCapture(ctx context.Context, lotID, captureJournalID, status string, remaining int64, at time.Time) error
	UpdateLotAfterRelease(ctx context.Context, lotID, releaseJournalID, status string, remaining int64, at time.Time) error
	ListAvailableLots(ctx context.Context, merchantID, paymentMode string) ([]ledger.SettlementLot, error)
	ListDuePendingLots(ctx context.Context, asOf time.Time, limit int32) ([]ledger.SettlementLot, error)
	// ConsumeLotRemaining decrements lot remaining under wallet lock (BE-350).
	ConsumeLotRemaining(ctx context.Context, lotID string, amountIDR int64, at time.Time) error
	// RestoreLotRemaining restores lot remaining after reserve release (BE-350).
	RestoreLotRemaining(ctx context.Context, lotID string, amountIDR int64, at time.Time) error
	// LockBalance FOR UPDATE merchant wallet projection.
	LockBalance(ctx context.Context, merchantID, paymentMode string) (ledger.Balance, error)
	EnsureBalance(ctx context.Context, merchantID, paymentMode string, at time.Time) error

	SettlementDelaySeconds(ctx context.Context) (int64, error)
	LinkPaymentSettlement(ctx context.Context, settlementID, journalID string, feePercent, feeFixed int64, lotID string, availableAt time.Time) error
	GetStoreMerchant(ctx context.Context, storeID string) (id string, merchantID string, err error)
	RevenueByDay(ctx context.Context, merchantID, paymentMode string, from, to time.Time) ([]ledger.RevenuePoint, error)

	WithTx(ctx context.Context, fn func(ctx context.Context) error) error
	IsNotFound(err error) bool
}
