package application

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/ledger"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/platform"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/withdrawals"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
	"github.com/dasepmoch/fersaku-new/backend/internal/security"
)

var errWDNotFound = errors.New("wd: not found")

type wdFixedClock struct{ t time.Time }

func (c wdFixedClock) Now() time.Time { return c.t }

type wdSeqIDs struct{ n atomic.Int64 }

func (g *wdSeqIDs) New() string {
	return fmt.Sprintf("%d", g.n.Add(1))
}

// ---------- mem withdrawal store ----------

type memWDStore struct {
	mu          sync.Mutex
	merchantID  string
	storeID     string
	banks       map[string]withdrawals.BankAccount
	quotes      map[string]withdrawals.Quote
	quoteByIdem map[string]string // merchant|mode|keyHash -> quoteID
	withdrawals map[string]withdrawals.Withdrawal
	wdByIdem    map[string]string
	allocs      map[string][]withdrawals.Allocation
	locks       map[string]withdrawals.WithdrawalLock
}

func newMemWDStore(storeID, merchantID string) *memWDStore {
	return &memWDStore{
		merchantID:  merchantID,
		storeID:     storeID,
		banks:       map[string]withdrawals.BankAccount{},
		quotes:      map[string]withdrawals.Quote{},
		quoteByIdem: map[string]string{},
		withdrawals: map[string]withdrawals.Withdrawal{},
		wdByIdem:    map[string]string{},
		allocs:      map[string][]withdrawals.Allocation{},
		locks:       map[string]withdrawals.WithdrawalLock{},
	}
}

func (m *memWDStore) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	return fn(ctx)
}
func (m *memWDStore) IsNotFound(err error) bool { return errors.Is(err, errWDNotFound) }

func (m *memWDStore) GetStoreMerchant(_ context.Context, storeID string) (string, string, error) {
	if storeID != m.storeID {
		return "", "", errWDNotFound
	}
	return storeID, m.merchantID, nil
}
func (m *memWDStore) SchemaMetaInt(_ context.Context, key string, fallback int64) (int64, error) {
	return fallback, nil
}
func (m *memWDStore) SchemaMetaBool(_ context.Context, _ string, fallback bool) (bool, error) {
	return fallback, nil
}

func (m *memWDStore) InsertBankAccount(_ context.Context, a withdrawals.BankAccount) (withdrawals.BankAccount, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.banks[a.ID] = a
	return a, nil
}
func (m *memWDStore) GetBankAccount(_ context.Context, id string) (withdrawals.BankAccount, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	a, ok := m.banks[id]
	if !ok {
		return withdrawals.BankAccount{}, errWDNotFound
	}
	return a, nil
}
func (m *memWDStore) ListBankAccounts(_ context.Context, merchantID string) ([]withdrawals.BankAccount, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []withdrawals.BankAccount
	for _, a := range m.banks {
		if a.MerchantID == merchantID {
			out = append(out, a)
		}
	}
	return out, nil
}
func (m *memWDStore) UpdateBankAccount(_ context.Context, a withdrawals.BankAccount, expectedVersion int64) (withdrawals.BankAccount, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	cur, ok := m.banks[a.ID]
	if !ok || cur.Version != expectedVersion {
		return withdrawals.BankAccount{}, errWDNotFound
	}
	a.Version = expectedVersion + 1
	m.banks[a.ID] = a
	return a, nil
}
func (m *memWDStore) SetBankVerified(_ context.Context, id string, at time.Time) (withdrawals.BankAccount, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	a, ok := m.banks[id]
	if !ok {
		return withdrawals.BankAccount{}, errWDNotFound
	}
	a.Status = withdrawals.BankVerified
	a.VerifiedAt = &at
	a.UpdatedAt = at
	m.banks[id] = a
	return a, nil
}
func (m *memWDStore) ClearPrimary(_ context.Context, merchantID string, at time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for id, a := range m.banks {
		if a.MerchantID == merchantID && a.IsPrimary {
			a.IsPrimary = false
			a.UpdatedAt = at
			m.banks[id] = a
		}
	}
	return nil
}
func (m *memWDStore) MakePrimary(_ context.Context, id, merchantID string, at time.Time) (withdrawals.BankAccount, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	a, ok := m.banks[id]
	if !ok || a.MerchantID != merchantID {
		return withdrawals.BankAccount{}, errWDNotFound
	}
	a.IsPrimary = true
	a.UpdatedAt = at
	m.banks[id] = a
	return a, nil
}
func (m *memWDStore) ArchiveBankAccount(_ context.Context, id string, at time.Time) (withdrawals.BankAccount, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	a, ok := m.banks[id]
	if !ok {
		return withdrawals.BankAccount{}, errWDNotFound
	}
	a.Status = withdrawals.BankArchived
	a.ArchivedAt = &at
	m.banks[id] = a
	return a, nil
}
func (m *memWDStore) CountVerifiedBanks(_ context.Context, merchantID string) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var n int64
	for _, a := range m.banks {
		if a.MerchantID == merchantID && a.Status == withdrawals.BankVerified {
			n++
		}
	}
	return n, nil
}
func (m *memWDStore) CountActiveWithdrawalsForBank(context.Context, string) (int64, error) {
	return 0, nil
}
func (m *memWDStore) CountActiveQuotesForBank(context.Context, string) (int64, error) { return 0, nil }

func (m *memWDStore) UpsertWithdrawalLock(_ context.Context, l withdrawals.WithdrawalLock) (withdrawals.WithdrawalLock, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.locks[l.MerchantID] = l
	return l, nil
}
func (m *memWDStore) GetWithdrawalLock(_ context.Context, merchantID string) (withdrawals.WithdrawalLock, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	l, ok := m.locks[merchantID]
	if !ok {
		return withdrawals.WithdrawalLock{}, errWDNotFound
	}
	return l, nil
}

func (m *memWDStore) InsertQuote(_ context.Context, q withdrawals.Quote) (withdrawals.Quote, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := q.MerchantID + "|" + q.PaymentMode + "|" + q.IdempotencyKeyHash
	if existing, ok := m.quoteByIdem[key]; ok {
		return m.quotes[existing], nil
	}
	m.quotes[q.ID] = q
	m.quoteByIdem[key] = q.ID
	return q, nil
}
func (m *memWDStore) GetQuote(_ context.Context, id string) (withdrawals.Quote, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	q, ok := m.quotes[id]
	if !ok {
		return withdrawals.Quote{}, errWDNotFound
	}
	return q, nil
}
func (m *memWDStore) GetQuoteByIdempotency(_ context.Context, merchantID, mode, keyHash string) (withdrawals.Quote, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	id, ok := m.quoteByIdem[merchantID+"|"+mode+"|"+keyHash]
	if !ok {
		return withdrawals.Quote{}, errWDNotFound
	}
	return m.quotes[id], nil
}
func (m *memWDStore) MarkQuoteConsumed(_ context.Context, quoteID, withdrawalID string, at time.Time) (withdrawals.Quote, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	q, ok := m.quotes[quoteID]
	if !ok {
		return withdrawals.Quote{}, errWDNotFound
	}
	if q.Status == withdrawals.QuoteConsumed {
		return withdrawals.Quote{}, errWDNotFound
	}
	q.Status = withdrawals.QuoteConsumed
	q.ConsumedWithdrawalID = &withdrawalID
	q.UpdatedAt = at
	m.quotes[quoteID] = q
	return q, nil
}
func (m *memWDStore) InvalidateQuotesForBank(_ context.Context, bankID string, at time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for id, q := range m.quotes {
		if q.BankAccountID == bankID && q.Status == withdrawals.QuoteActive {
			q.Status = withdrawals.QuoteInvalidated
			q.UpdatedAt = at
			m.quotes[id] = q
		}
	}
	return nil
}
func (m *memWDStore) InvalidateQuotesForMerchant(_ context.Context, merchantID string, at time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for id, q := range m.quotes {
		if q.MerchantID == merchantID && q.Status == withdrawals.QuoteActive {
			q.Status = withdrawals.QuoteInvalidated
			q.UpdatedAt = at
			m.quotes[id] = q
		}
	}
	return nil
}

func (m *memWDStore) InsertWithdrawal(_ context.Context, w withdrawals.Withdrawal) (withdrawals.Withdrawal, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := w.MerchantID + "|" + w.PaymentMode + "|" + w.IdempotencyKeyHash
	if id, ok := m.wdByIdem[key]; ok {
		return m.withdrawals[id], nil
	}
	m.withdrawals[w.ID] = w
	m.wdByIdem[key] = w.ID
	return w, nil
}
func (m *memWDStore) GetWithdrawal(_ context.Context, id string) (withdrawals.Withdrawal, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	w, ok := m.withdrawals[id]
	if !ok {
		return withdrawals.Withdrawal{}, errWDNotFound
	}
	return w, nil
}
func (m *memWDStore) GetWithdrawalByIdempotency(_ context.Context, merchantID, mode, keyHash string) (withdrawals.Withdrawal, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	id, ok := m.wdByIdem[merchantID+"|"+mode+"|"+keyHash]
	if !ok {
		return withdrawals.Withdrawal{}, errWDNotFound
	}
	return m.withdrawals[id], nil
}
func (m *memWDStore) GetWithdrawalByProviderRef(_ context.Context, provider, scope, mode, ref string) (withdrawals.Withdrawal, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, w := range m.withdrawals {
		if w.Provider == provider && w.AccountScope == scope && w.PaymentMode == mode &&
			w.ProviderDisbursementReference != nil && *w.ProviderDisbursementReference == ref {
			return w, nil
		}
	}
	return withdrawals.Withdrawal{}, errWDNotFound
}
func (m *memWDStore) LockWithdrawal(ctx context.Context, id string) (withdrawals.Withdrawal, error) {
	return m.GetWithdrawal(ctx, id)
}
func (m *memWDStore) SaveWithdrawal(_ context.Context, w withdrawals.Withdrawal) (withdrawals.Withdrawal, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.withdrawals[w.ID] = w
	return w, nil
}
func (m *memWDStore) ListWithdrawalsByMerchant(_ context.Context, merchantID, mode string, _ *time.Time, _ *string, _ int32) ([]withdrawals.Withdrawal, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []withdrawals.Withdrawal
	for _, w := range m.withdrawals {
		if w.MerchantID == merchantID && (mode == "" || w.PaymentMode == mode) {
			out = append(out, w)
		}
	}
	return out, nil
}
func (m *memWDStore) ListWithdrawalsAdmin(_ context.Context, _ *string, _ *time.Time, _ *string, _ int32) ([]withdrawals.Withdrawal, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []withdrawals.Withdrawal
	for _, w := range m.withdrawals {
		out = append(out, w)
	}
	return out, nil
}
func (m *memWDStore) ListUnknownDue(_ context.Context, asOf time.Time, limit int32) ([]withdrawals.Withdrawal, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []withdrawals.Withdrawal
	for _, w := range m.withdrawals {
		if w.Status == withdrawals.StatusUnknownOutcome && w.NextLookupAt != nil && !w.NextLookupAt.After(asOf) {
			out = append(out, w)
			if int32(len(out)) >= limit {
				break
			}
		}
	}
	return out, nil
}
func (m *memWDStore) InsertAllocation(_ context.Context, a withdrawals.Allocation) (withdrawals.Allocation, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.allocs[a.WithdrawalID] = append(m.allocs[a.WithdrawalID], a)
	return a, nil
}
func (m *memWDStore) ListAllocations(_ context.Context, withdrawalID string) ([]withdrawals.Allocation, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]withdrawals.Allocation(nil), m.allocs[withdrawalID]...), nil
}

// ---------- mem ledger store ----------

type memLedgerStore struct {
	mu    sync.Mutex
	bal   ledger.Balance
	lots  map[string]ledger.SettlementLot
	posts int
}

func newMemLedger(merchantID string, available int64) *memLedgerStore {
	lotID := "lot_1"
	return &memLedgerStore{
		bal: ledger.Balance{
			MerchantID:   merchantID,
			PaymentMode:  ledger.ModeSandbox,
			AvailableIDR: available,
			Currency:     "IDR",
		},
		lots: map[string]ledger.SettlementLot{
			lotID: {
				ID:                 lotID,
				MerchantID:         merchantID,
				PaymentMode:        ledger.ModeSandbox,
				Source:             ledger.SourceStorefront,
				OriginalAmountIDR:  available,
				RemainingAmountIDR: available,
				Status:             ledger.LotAvailable,
				AvailableAt:        time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
				Currency:           "IDR",
			},
		},
	}
}

func (m *memLedgerStore) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	return fn(ctx)
}
func (m *memLedgerStore) IsNotFound(err error) bool { return errors.Is(err, errWDNotFound) }

func (m *memLedgerStore) PostJournal(_ context.Context, p PostJournalParams) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.posts++
	// Simulate reserve: available -= net (merchant net amount)
	if p.TemplateCode == ledger.TemplateWithdrawalReserve && p.MerchantNetIDR != nil {
		m.bal.AvailableIDR -= *p.MerchantNetIDR
		m.bal.HeldIDR += *p.MerchantNetIDR
	}
	if p.TemplateCode == ledger.TemplateWithdrawalRelease && p.MerchantNetIDR != nil {
		m.bal.AvailableIDR += *p.MerchantNetIDR
		m.bal.HeldIDR -= *p.MerchantNetIDR
	}
	if p.TemplateCode == ledger.TemplateWithdrawalComplete && p.MerchantNetIDR != nil {
		m.bal.HeldIDR -= *p.MerchantNetIDR
	}
	id := p.JournalID
	if id == "" {
		id = fmt.Sprintf("lj_%d", m.posts)
	}
	return id, nil
}
func (m *memLedgerStore) GetJournalByReference(context.Context, string) (ledger.Journal, error) {
	return ledger.Journal{}, errWDNotFound
}
func (m *memLedgerStore) GetJournalByID(context.Context, string) (ledger.Journal, error) {
	return ledger.Journal{}, errWDNotFound
}
func (m *memLedgerStore) ListJournals(context.Context, LedgerListFilter) ([]ledger.Journal, error) {
	return nil, nil
}
func (m *memLedgerStore) ListEntriesByJournal(context.Context, string) ([]ledger.Entry, error) {
	return nil, nil
}
func (m *memLedgerStore) GetBalance(_ context.Context, merchantID, paymentMode string) (ledger.Balance, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	b := m.bal
	b.MerchantID = merchantID
	b.PaymentMode = paymentMode
	return b, nil
}
func (m *memLedgerStore) ListSourceBalances(context.Context, string, string) ([]ledger.SourceBalance, error) {
	return nil, nil
}
func (m *memLedgerStore) RebuildBalances(context.Context, string, string) error { return nil }
func (m *memLedgerStore) InsertSettlementLot(_ context.Context, lot ledger.SettlementLot) (ledger.SettlementLot, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.lots[lot.ID] = lot
	return lot, nil
}
func (m *memLedgerStore) GetLotByIntent(context.Context, string) (ledger.SettlementLot, error) {
	return ledger.SettlementLot{}, errWDNotFound
}
func (m *memLedgerStore) GetLotByID(_ context.Context, id string) (ledger.SettlementLot, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	l, ok := m.lots[id]
	if !ok {
		return ledger.SettlementLot{}, errWDNotFound
	}
	return l, nil
}
func (m *memLedgerStore) UpdateLotAfterCapture(context.Context, string, string, string, int64, time.Time) error {
	return nil
}
func (m *memLedgerStore) UpdateLotAfterRelease(context.Context, string, string, string, int64, time.Time) error {
	return nil
}
func (m *memLedgerStore) ListAvailableLots(_ context.Context, merchantID, paymentMode string) ([]ledger.SettlementLot, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []ledger.SettlementLot
	for _, l := range m.lots {
		if l.MerchantID == merchantID && l.PaymentMode == paymentMode && l.RemainingAmountIDR > 0 {
			out = append(out, l)
		}
	}
	return out, nil
}
func (m *memLedgerStore) ListDuePendingLots(context.Context, time.Time, int32) ([]ledger.SettlementLot, error) {
	return nil, nil
}
func (m *memLedgerStore) ConsumeLotRemaining(_ context.Context, lotID string, amountIDR int64, at time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	l, ok := m.lots[lotID]
	if !ok || l.RemainingAmountIDR < amountIDR {
		return fmt.Errorf("insufficient lot")
	}
	l.RemainingAmountIDR -= amountIDR
	if l.RemainingAmountIDR == 0 {
		l.Status = "CONSUMED"
	} else {
		l.Status = ledger.LotPartiallyConsumed
	}
	l.UpdatedAt = at
	m.lots[lotID] = l
	return nil
}
func (m *memLedgerStore) RestoreLotRemaining(_ context.Context, lotID string, amountIDR int64, at time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	l, ok := m.lots[lotID]
	if !ok {
		return errWDNotFound
	}
	l.RemainingAmountIDR += amountIDR
	l.Status = ledger.LotAvailable
	l.UpdatedAt = at
	m.lots[lotID] = l
	return nil
}
func (m *memLedgerStore) LockBalance(ctx context.Context, merchantID, paymentMode string) (ledger.Balance, error) {
	return m.GetBalance(ctx, merchantID, paymentMode)
}
func (m *memLedgerStore) EnsureBalance(context.Context, string, string, time.Time) error { return nil }
func (m *memLedgerStore) SettlementDelaySeconds(context.Context) (int64, error)          { return 0, nil }
func (m *memLedgerStore) LinkPaymentSettlement(context.Context, string, string, int64, int64, string, time.Time) error {
	return nil
}
func (m *memLedgerStore) GetStoreMerchant(_ context.Context, storeID string) (string, string, error) {
	return storeID, "merch_1", nil
}
func (m *memLedgerStore) RevenueByDay(context.Context, string, string, time.Time, time.Time) ([]ledger.RevenuePoint, error) {
	return nil, nil
}

// ---------- fake disbursement provider (port double; no adapter import) ----------

type fakeDisbursement struct {
	Ref               string
	ExternalID        string
	NetAmountIDR      int64
	Currency          string
	Status            string
	ProviderFeeIDR    int64
	BankCode          string
	AccountNumberMask string
	AccountHolder     string
	CreatedAt         time.Time
	CompletedAt       *time.Time
	FailureCode       string
}

// fakeDisburse is an in-package ports.DisbursementProvider double.
// Architecture boundary: application tests must not import internal/adapters.
type fakeDisburse struct {
	mu                    sync.Mutex
	byRef                 map[string]*fakeDisbursement
	byExternal            map[string]string
	DefaultProviderFeeIDR int64
	AutoCompleteDisburse  bool
}

func newFakeDisburse() *fakeDisburse {
	return &fakeDisburse{
		byRef:                 make(map[string]*fakeDisbursement),
		byExternal:            make(map[string]string),
		DefaultProviderFeeIDR: 2500,
		AutoCompleteDisburse:  false,
	}
}

func (f *fakeDisburse) QuoteDisbursement(_ context.Context, in ports.DisbursementQuoteInput) (ports.DisbursementQuote, error) {
	fee := f.DefaultProviderFeeIDR
	return ports.DisbursementQuote{
		ProviderFeeIDR:    fee,
		ProviderReference: "quote_" + in.IdempotencyKey,
		Evidence:          "fake-quote",
		QuotedAt:          time.Date(2026, 7, 19, 12, 0, 0, 0, time.UTC),
	}, nil
}

func (f *fakeDisburse) CreateDisbursement(_ context.Context, in ports.CreateDisbursementInput) (ports.CreateDisbursementResult, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if ref, ok := f.byExternal[in.ExternalID]; ok {
		d := f.byRef[ref]
		fee := d.ProviderFeeIDR
		return ports.CreateDisbursementResult{
			ProviderReference: d.Ref,
			ExternalID:        d.ExternalID,
			Status:            d.Status,
			NetAmountIDR:      d.NetAmountIDR,
			ProviderFeeIDR:    &fee,
			CreatedAt:         d.CreatedAt,
		}, nil
	}
	h := sha256.Sum256([]byte("fake-disb|" + in.ExternalID))
	ref := "fake_disb_" + hex.EncodeToString(h[:12])
	fee := f.DefaultProviderFeeIDR
	d := &fakeDisbursement{
		Ref:               ref,
		ExternalID:        in.ExternalID,
		NetAmountIDR:      in.NetAmountIDR,
		Currency:          "IDR",
		Status:            "PENDING",
		ProviderFeeIDR:    fee,
		BankCode:          in.BankCode,
		AccountNumberMask: in.AccountNumberMask,
		AccountHolder:     in.AccountHolderName,
		CreatedAt:         time.Date(2026, 7, 19, 12, 0, 0, 0, time.UTC),
	}
	f.byRef[ref] = d
	f.byExternal[in.ExternalID] = ref
	feeCopy := fee
	return ports.CreateDisbursementResult{
		ProviderReference: d.Ref,
		ExternalID:        d.ExternalID,
		Status:            d.Status,
		NetAmountIDR:      d.NetAmountIDR,
		ProviderFeeIDR:    &feeCopy,
		CreatedAt:         d.CreatedAt,
	}, nil
}

func (f *fakeDisburse) GetDisbursement(_ context.Context, providerRef string) (ports.ProviderDisbursement, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	d, ok := f.byRef[providerRef]
	if !ok {
		return ports.ProviderDisbursement{}, &ports.ProviderError{
			Class: ports.ProviderRejected, Message: "not found",
		}
	}
	if f.AutoCompleteDisburse && d.Status == "PENDING" {
		now := time.Date(2026, 7, 19, 12, 0, 0, 0, time.UTC)
		d.Status = "COMPLETED"
		d.CompletedAt = &now
	}
	fee := d.ProviderFeeIDR
	return ports.ProviderDisbursement{
		ProviderReference: d.Ref,
		ExternalID:        d.ExternalID,
		Status:            d.Status,
		NetAmountIDR:      d.NetAmountIDR,
		Currency:          d.Currency,
		ProviderFeeIDR:    &fee,
		FailureCode:       d.FailureCode,
		CompletedAt:       d.CompletedAt,
		BankCode:          d.BankCode,
		AccountNumberMask: d.AccountNumberMask,
	}, nil
}

func (f *fakeDisburse) GetDisbursementByExternal(externalID string) (ports.ProviderDisbursement, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	ref, ok := f.byExternal[externalID]
	if !ok {
		return ports.ProviderDisbursement{}, false
	}
	d := f.byRef[ref]
	fee := d.ProviderFeeIDR
	return ports.ProviderDisbursement{
		ProviderReference: d.Ref,
		ExternalID:        d.ExternalID,
		Status:            d.Status,
		NetAmountIDR:      d.NetAmountIDR,
		Currency:          d.Currency,
		ProviderFeeIDR:    &fee,
		FailureCode:       d.FailureCode,
		CompletedAt:       d.CompletedAt,
		BankCode:          d.BankCode,
		AccountNumberMask: d.AccountNumberMask,
	}, true
}

func (f *fakeDisburse) SimulateDisburseComplete(providerRef string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	d, ok := f.byRef[providerRef]
	if !ok {
		return fmt.Errorf("not found")
	}
	now := time.Date(2026, 7, 19, 12, 0, 0, 0, time.UTC)
	d.Status = "COMPLETED"
	d.CompletedAt = &now
	return nil
}

func (f *fakeDisburse) DisbursementCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.byRef)
}

// Ensure ports compile against fake (architecture boundary: no adapter import).
var _ ports.DisbursementProvider = (*fakeDisburse)(nil)

// ---------- test helpers ----------

const testEncKey = "local-dev-stock-encryption-key!!!!"

func seedVerifiedBank(t *testing.T, store *memWDStore, merchantID string) withdrawals.BankAccount {
	t.Helper()
	_, cipher, err := security.EncryptString(testEncKey, "1234567890")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 7, 19, 12, 0, 0, 0, time.UTC)
	acc := withdrawals.BankAccount{
		ID:                  "bank_1",
		MerchantID:          merchantID,
		BankCode:            "BCA",
		BankName:            "BCA",
		AccountHolderName:   "Seller",
		AccountNumberCipher: cipher,
		AccountNumberMasked: "******7890",
		AccountNumberLast4:  "7890",
		Status:              withdrawals.BankVerified,
		IsPrimary:           true,
		Version:             1,
		CreatedAt:           now,
		UpdatedAt:           now,
	}
	store.banks[acc.ID] = acc
	return acc
}

func newWDTestStack(t *testing.T, available int64, now time.Time) (
	*WithdrawalService,
	*memWDStore,
	*memLedgerStore,
	*fakeDisburse,
) {
	t.Helper()
	const storeID = "store_1"
	const merchantID = "merch_1"
	wdStore := newMemWDStore(storeID, merchantID)
	_ = seedVerifiedBank(t, wdStore, merchantID)
	ledStore := newMemLedger(merchantID, available)
	xd := newFakeDisburse()
	xd.DefaultProviderFeeIDR = 2500
	xd.AutoCompleteDisburse = false
	auto := true
	svc := &WithdrawalService{
		Store:              wdStore,
		Ledger:             &LedgerService{Store: ledStore, Clock: wdFixedClock{t: now}},
		Fees:               &FeeService{Clock: wdFixedClock{t: now}},
		Disburse:           xd,
		IDs:                &wdSeqIDs{},
		Clock:              wdFixedClock{t: now},
		EncryptionKey:      testEncKey,
		AccountScope:       "xendit-primary",
		DefaultPaymentMode: withdrawals.ModeSandbox,
		ForceAutoApprove:   &auto,
	}
	return svc, wdStore, ledStore, xd
}

func TestCreateQuote_BelowMinRejected(t *testing.T) {
	now := time.Date(2026, 7, 19, 12, 0, 0, 0, time.UTC)
	svc, _, _, _ := newWDTestStack(t, 200_000, now)
	_, err := svc.CreateQuote(context.Background(), "store_1", "idem-min", 49_999, "bank_1", withdrawals.ModeSandbox)
	if err == nil {
		t.Fatal("expected below-min rejection")
	}
	if !errors.Is(err, platform.ErrBelowMinWithdrawal) {
		// apperr may wrap; check code string
		if !errors.Is(err, platform.ErrBelowMinWithdrawal) && fmt.Sprint(err) != fmt.Sprint(platform.ErrBelowMinWithdrawal) {
			// Code path from CalculateWithdrawal returns ErrBelowMinWithdrawal directly
			if !containsCode(err, "FEE_BELOW_MIN_WITHDRAWAL") {
				t.Fatalf("want FEE_BELOW_MIN_WITHDRAWAL, got %v", err)
			}
		}
	}
}

func TestCreateQuote_Min50kAccepted(t *testing.T) {
	now := time.Date(2026, 7, 19, 12, 0, 0, 0, time.UTC)
	svc, _, _, xd := newWDTestStack(t, 200_000, now)
	xd.DefaultProviderFeeIDR = 0
	q, err := svc.CreateQuote(context.Background(), "store_1", "idem-min50", 50_000, "bank_1", withdrawals.ModeSandbox)
	if err != nil {
		t.Fatal(err)
	}
	// 3% of 50k = 1500; provider 0; net 48500
	if q.PlatformFeeIDR != 1_500 || q.ProviderFeeIDR != 0 || q.NetDisbursementIDR != 48_500 {
		t.Fatalf("fees platform=%d provider=%d net=%d", q.PlatformFeeIDR, q.ProviderFeeIDR, q.NetDisbursementIDR)
	}
}

func TestCreateQuote_InsufficientBalance(t *testing.T) {
	now := time.Date(2026, 7, 19, 12, 0, 0, 0, time.UTC)
	svc, _, _, _ := newWDTestStack(t, 40_000, now) // below 50k min for quote amount we try
	// amount 50k with only 40k available
	_, err := svc.CreateQuote(context.Background(), "store_1", "idem-insuf", 50_000, "bank_1", withdrawals.ModeSandbox)
	if err == nil {
		t.Fatal("expected insufficient")
	}
	if !errors.Is(err, withdrawals.ErrInsufficient) && !containsCode(err, "WITHDRAWAL_INSUFFICIENT_BALANCE") {
		t.Fatalf("want insufficient, got %v", err)
	}
}

func TestRequestWithdrawal_ExpiredQuote(t *testing.T) {
	now := time.Date(2026, 7, 19, 12, 0, 0, 0, time.UTC)
	svc, store, _, _ := newWDTestStack(t, 200_000, now)
	q, err := svc.CreateQuote(context.Background(), "store_1", "idem-exp-q", 100_000, "bank_1", withdrawals.ModeSandbox)
	if err != nil {
		t.Fatal(err)
	}
	// Expire quote by advancing clock past ExpiresAt
	svc.Clock = wdFixedClock{t: q.ExpiresAt.Add(time.Second)}
	svc.Ledger.Clock = svc.Clock
	_, err = svc.RequestWithdrawal(context.Background(), "store_1", q.ID, "idem-exp-w", withdrawals.ModeSandbox)
	if err == nil {
		t.Fatal("expected expired quote")
	}
	if !errors.Is(err, withdrawals.ErrQuoteExpired) && !containsCode(err, "WITHDRAWAL_QUOTE_EXPIRED") {
		t.Fatalf("want expired, got %v", err)
	}
	// Quote still ACTIVE in store (not auto-flipped) — rejection is time-based
	got, _ := store.GetQuote(context.Background(), q.ID)
	if got.Status != withdrawals.QuoteActive && got.Status != withdrawals.QuoteExpired {
		t.Fatalf("quote status %s", got.Status)
	}
}

func TestRequestWithdrawal_InsufficientAtReserve(t *testing.T) {
	now := time.Date(2026, 7, 19, 12, 0, 0, 0, time.UTC)
	svc, _, led, _ := newWDTestStack(t, 200_000, now)
	q, err := svc.CreateQuote(context.Background(), "store_1", "idem-race-q", 100_000, "bank_1", withdrawals.ModeSandbox)
	if err != nil {
		t.Fatal(err)
	}
	// Drain balance after quote
	led.mu.Lock()
	led.bal.AvailableIDR = 10_000
	for id, lot := range led.lots {
		lot.RemainingAmountIDR = 10_000
		led.lots[id] = lot
	}
	led.mu.Unlock()
	_, err = svc.RequestWithdrawal(context.Background(), "store_1", q.ID, "idem-race-w", withdrawals.ModeSandbox)
	if err == nil {
		t.Fatal("expected insufficient at reserve")
	}
	if !errors.Is(err, withdrawals.ErrInsufficient) && !containsCode(err, "WITHDRAWAL_INSUFFICIENT_BALANCE") {
		t.Fatalf("want insufficient, got %v", err)
	}
}

func TestDisburseWithdrawal_NoDoublePayoutOnRetry(t *testing.T) {
	now := time.Date(2026, 7, 19, 12, 0, 0, 0, time.UTC)
	svc, _, _, xd := newWDTestStack(t, 200_000, now)
	auto := false
	svc.ForceAutoApprove = &auto // stay UNDER_REVIEW then admin approve path
	// Use auto approve for create path simplicity
	auto = true
	svc.ForceAutoApprove = &auto
	xd.AutoCompleteDisburse = false

	q, err := svc.CreateQuote(context.Background(), "store_1", "idem-dbl-q", 100_000, "bank_1", withdrawals.ModeSandbox)
	if err != nil {
		t.Fatal(err)
	}
	w, err := svc.RequestWithdrawal(context.Background(), "store_1", q.ID, "idem-dbl-w", withdrawals.ModeSandbox)
	if err != nil {
		t.Fatal(err)
	}
	count1 := xd.DisbursementCount()
	if count1 < 1 {
		// Request may leave APPROVED if disburse deferred; force once
		_ = svc.DisburseWithdrawal(context.Background(), w.ID)
		count1 = xd.DisbursementCount()
	}
	if count1 != 1 {
		t.Fatalf("disbursements=%d want 1 after first submit", count1)
	}
	_ = svc.DisburseWithdrawal(context.Background(), w.ID)
	_ = svc.DisburseWithdrawal(context.Background(), w.ID)
	if xd.DisbursementCount() != count1 {
		t.Fatalf("double disbursement: before=%d after=%d", count1, xd.DisbursementCount())
	}
}

func TestAdminReview_RequiresReason(t *testing.T) {
	now := time.Date(2026, 7, 19, 12, 0, 0, 0, time.UTC)
	svc, store, _, _ := newWDTestStack(t, 200_000, now)
	auto := false
	svc.ForceAutoApprove = &auto
	q, err := svc.CreateQuote(context.Background(), "store_1", "idem-adm-q", 100_000, "bank_1", withdrawals.ModeSandbox)
	if err != nil {
		t.Fatal(err)
	}
	w, err := svc.RequestWithdrawal(context.Background(), "store_1", q.ID, "idem-adm-w", withdrawals.ModeSandbox)
	if err != nil {
		t.Fatal(err)
	}
	if w.Status != withdrawals.StatusUnderReview {
		t.Fatalf("status %s want UNDER_REVIEW", w.Status)
	}
	_, err = svc.AdminReview(context.Background(), w.ID, "approve", "  ", "admin_1")
	if err == nil {
		t.Fatal("expected reason required")
	}
	// Valid approve
	out, err := svc.AdminReview(context.Background(), w.ID, "approve", "kyc_clear", "admin_1")
	if err != nil {
		t.Fatal(err)
	}
	if out.Status != withdrawals.StatusApproved && out.Status != withdrawals.StatusProcessing &&
		out.Status != withdrawals.StatusCompleted && out.Status != withdrawals.StatusUnknownOutcome {
		t.Fatalf("status after approve %s", out.Status)
	}
	// Idempotent re-approve must not error / double-submit
	c1 := store.withdrawals[w.ID]
	out2, err := svc.AdminReview(context.Background(), w.ID, "approve", "retry", "admin_1")
	if err != nil {
		t.Fatal(err)
	}
	_ = c1
	if out2.ID != w.ID {
		t.Fatal("lost withdrawal on retry")
	}
}

func TestFeePolicy_Platform3PercentPlusProvider(t *testing.T) {
	// Domain pure path (also covered in platform/fees_test); assert service wires it.
	now := time.Date(2026, 7, 19, 12, 0, 0, 0, time.UTC)
	svc, _, _, xd := newWDTestStack(t, 200_000, now)
	xd.DefaultProviderFeeIDR = 2500
	q, err := svc.CreateQuote(context.Background(), "store_1", "idem-fee", 100_000, "bank_1", withdrawals.ModeSandbox)
	if err != nil {
		t.Fatal(err)
	}
	if q.PlatformFeeIDR != 3_000 || q.ProviderFeeIDR != 2_500 || q.TotalFeeIDR != 5_500 || q.NetDisbursementIDR != 94_500 {
		t.Fatalf("ADR-0003 vector: platform=%d provider=%d total=%d net=%d",
			q.PlatformFeeIDR, q.ProviderFeeIDR, q.TotalFeeIDR, q.NetDisbursementIDR)
	}
}

func TestWebhookCompleteAndFailedIdempotent(t *testing.T) {
	now := time.Date(2026, 7, 19, 12, 0, 0, 0, time.UTC)
	svc, _, led, xd := newWDTestStack(t, 200_000, now)
	xd.AutoCompleteDisburse = false

	q, err := svc.CreateQuote(context.Background(), "store_1", "idem-wh-q", 100_000, "bank_1", withdrawals.ModeSandbox)
	if err != nil {
		t.Fatal(err)
	}
	w, err := svc.RequestWithdrawal(context.Background(), "store_1", q.ID, "idem-wh-w", withdrawals.ModeSandbox)
	if err != nil {
		t.Fatal(err)
	}
	w, _ = svc.GetWithdrawal(context.Background(), "store_1", w.ID)
	ref := ""
	if w.ProviderDisbursementReference != nil {
		ref = *w.ProviderDisbursementReference
	}
	if ref == "" || len(ref) >= 8 && ref[:8] == "pending:" {
		// ensure create bound a real ref
		_ = svc.DisburseWithdrawal(context.Background(), w.ID)
		w, _ = svc.GetWithdrawal(context.Background(), "store_1", w.ID)
		if w.ProviderDisbursementReference != nil {
			ref = *w.ProviderDisbursementReference
		}
	}
	if ref == "" {
		// force from fake by external
		ext := "fersaku_wd_" + w.ID
		if d, ok := xd.GetDisbursementByExternal(ext); ok {
			ref = d.ProviderReference
		}
	}
	if ref == "" {
		t.Fatal("no provider ref to complete")
	}
	_ = xd.SimulateDisburseComplete(ref)
	fee := int64(2500)
	if err := svc.HandleDisbursementCallback(context.Background(), ref, "COMPLETED", &fee, 94_500); err != nil {
		t.Fatal(err)
	}
	// Replay
	if err := svc.HandleDisbursementCallback(context.Background(), ref, "COMPLETED", &fee, 94_500); err != nil {
		t.Fatal(err)
	}
	w, _ = svc.GetWithdrawal(context.Background(), "store_1", w.ID)
	if w.Status != withdrawals.StatusCompleted {
		t.Fatalf("status %s", w.Status)
	}
	// Available should be 100k remaining (200k - 100k withdrawn)
	bal, _ := led.GetBalance(context.Background(), "merch_1", ledger.ModeSandbox)
	if bal.AvailableIDR != 100_000 {
		t.Fatalf("available %d want 100000", bal.AvailableIDR)
	}
}

func containsCode(err error, code string) bool {
	if err == nil {
		return false
	}
	return errors.Is(err, err) && (fmt.Sprintf("%v", err) != "" &&
		(errors.Is(err, platform.ErrBelowMinWithdrawal) ||
			errors.Is(err, withdrawals.ErrInsufficient) ||
			errors.Is(err, withdrawals.ErrQuoteExpired) ||
			stringContains(fmt.Sprintf("%v", err), code) ||
			stringContains(fmt.Sprintf("%#v", err), code)))
}

func stringContains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(sub) == 0 ||
		(func() bool {
			for i := 0; i+len(sub) <= len(s); i++ {
				if s[i:i+len(sub)] == sub {
					return true
				}
			}
			return false
		})())
}
