// Package xendit provides the single Xendit account adapter (ADR-0002).
// Fake is deterministic and in-memory for local/test; no real network calls.
package xendit

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// Fake is a deterministic no-network QRIS + disbursement provider.
type Fake struct {
	AccountScope string
	mu           sync.Mutex
	byRef        map[string]*fakePayment
	byExternal   map[string]string // external_id -> provider_ref
	// ForceTimeoutCreate when true returns timeout after "sending".
	ForceTimeoutCreate bool
	// ForceTimeoutExpire when true returns timeout on expire.
	ForceTimeoutExpire bool
	// AutoPayExternalIDs mark payments as PAID on next GetPayment.
	AutoPayExternalIDs map[string]bool

	// Disbursement state (BE-350).
	disbByRef      map[string]*fakeDisbursement
	disbByExternal map[string]string
	// DefaultProviderFeeIDR is the quoted/actual processing fee (launch fallback 2500).
	DefaultProviderFeeIDR int64
	// ForceTimeoutDisburse when true returns timeout after create is "sent".
	ForceTimeoutDisburse bool
	// ForceFailDisburse marks create as FAILED immediately.
	ForceFailDisburse bool
	// ForceActualFeeIDR overrides actual fee on complete (for variance tests).
	ForceActualFeeIDR *int64
	// AutoCompleteDisburse marks PENDING→COMPLETED on GetDisbursement.
	AutoCompleteDisburse bool
}

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

type fakePayment struct {
	Ref        string
	ExternalID string
	AmountIDR  int64
	Currency   string
	Status     string
	QRString   string
	QRImageURL string
	ExpiresAt  time.Time
	PaidAt     *time.Time
	Mode       string
}

// NewFake returns a fake Xendit adapter with launch account_scope.
func NewFake() *Fake {
	return &Fake{
		AccountScope:          "xendit-primary",
		byRef:                 make(map[string]*fakePayment),
		byExternal:            make(map[string]string),
		AutoPayExternalIDs:    make(map[string]bool),
		disbByRef:             make(map[string]*fakeDisbursement),
		disbByExternal:        make(map[string]string),
		DefaultProviderFeeIDR: 2500,
		AutoCompleteDisburse:  true,
	}
}

// Name returns provider name for logging.
func (f *Fake) Name() string { return "xendit-fake" }

// IsFake reports adapter kind for readiness (true for fake).
func (f *Fake) IsFake() bool { return true }

// CreateQRIS creates a deterministic QRIS payment. Idempotent on ExternalID.
func (f *Fake) CreateQRIS(ctx context.Context, in ports.CreateQRISInput) (ports.CreateQRISResult, error) {
	_ = ctx
	if f.ForceTimeoutCreate {
		return ports.CreateQRISResult{}, &ports.ProviderError{
			Class:       ports.ProviderTimeout,
			Message:     "create timeout after send",
			RequestSent: true,
		}
	}
	if in.AmountIDR <= 0 {
		return ports.CreateQRISResult{}, &ports.ProviderError{
			Class:   ports.ProviderRejected,
			Message: "invalid amount",
		}
	}
	if in.Currency != "" && in.Currency != "IDR" {
		return ports.CreateQRISResult{}, &ports.ProviderError{
			Class:   ports.ProviderRejected,
			Message: "currency must be IDR",
		}
	}
	f.mu.Lock()
	defer f.mu.Unlock()

	if ref, ok := f.byExternal[in.ExternalID]; ok {
		p := f.byRef[ref]
		return ports.CreateQRISResult{
			ProviderReference: p.Ref,
			QRString:          p.QRString,
			QRImageURL:        p.QRImageURL,
			Status:            p.Status,
			ExpiresAt:         p.ExpiresAt,
		}, nil
	}

	ref := deterministicRef(in.ExternalID, in.PaymentMode)
	qr := deterministicQR(in.ExternalID, in.AmountIDR)
	img := "https://fake.xendit.local/qris/" + ref + ".png"
	exp := in.ExpiresAt
	if exp.IsZero() {
		exp = time.Now().UTC().Add(30 * time.Minute)
	}
	p := &fakePayment{
		Ref:        ref,
		ExternalID: in.ExternalID,
		AmountIDR:  in.AmountIDR,
		Currency:   "IDR",
		Status:     "PENDING",
		QRString:   qr,
		QRImageURL: img,
		ExpiresAt:  exp.UTC(),
		Mode:       in.PaymentMode,
	}
	f.byRef[ref] = p
	f.byExternal[in.ExternalID] = ref
	return ports.CreateQRISResult{
		ProviderReference: p.Ref,
		QRString:          p.QRString,
		QRImageURL:        p.QRImageURL,
		Status:            p.Status,
		ExpiresAt:         p.ExpiresAt,
	}, nil
}

// GetPayment looks up by provider reference.
func (f *Fake) GetPayment(ctx context.Context, providerRef string) (ports.ProviderPayment, error) {
	_ = ctx
	f.mu.Lock()
	defer f.mu.Unlock()
	p, ok := f.byRef[providerRef]
	if !ok {
		return ports.ProviderPayment{}, &ports.ProviderError{
			Class:   ports.ProviderRejected,
			Message: "not found",
		}
	}
	if f.AutoPayExternalIDs[p.ExternalID] && p.Status == "PENDING" {
		now := time.Now().UTC()
		p.Status = "PAID"
		p.PaidAt = &now
	}
	return toProviderPayment(p), nil
}

// CancelPayment marks cancelled if still pending.
func (f *Fake) CancelPayment(ctx context.Context, providerRef string) (ports.ProviderPayment, error) {
	_ = ctx
	f.mu.Lock()
	defer f.mu.Unlock()
	p, ok := f.byRef[providerRef]
	if !ok {
		return ports.ProviderPayment{}, &ports.ProviderError{
			Class:   ports.ProviderRejected,
			Message: "not found",
		}
	}
	if p.Status == "PAID" {
		return toProviderPayment(p), nil
	}
	if p.Status == "PENDING" || p.Status == "ACTIVE" {
		p.Status = "CANCELLED"
	}
	return toProviderPayment(p), nil
}

// ExpirePayment marks expired if still pending (evidence).
func (f *Fake) ExpirePayment(ctx context.Context, providerRef string) (ports.ProviderPayment, error) {
	_ = ctx
	if f.ForceTimeoutExpire {
		return ports.ProviderPayment{}, &ports.ProviderError{
			Class:       ports.ProviderTimeout,
			Message:     "expire timeout",
			RequestSent: true,
		}
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	p, ok := f.byRef[providerRef]
	if !ok {
		return ports.ProviderPayment{}, &ports.ProviderError{
			Class:   ports.ProviderRejected,
			Message: "not found",
		}
	}
	if p.Status == "PAID" {
		return toProviderPayment(p), nil
	}
	if p.Status == "PENDING" || p.Status == "ACTIVE" {
		p.Status = "EXPIRED"
	}
	return toProviderPayment(p), nil
}

// SimulatePay marks a payment paid (local/test only).
func (f *Fake) SimulatePay(providerRef string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	p, ok := f.byRef[providerRef]
	if !ok {
		return fmt.Errorf("not found")
	}
	now := time.Now().UTC()
	p.Status = "PAID"
	p.PaidAt = &now
	return nil
}

// Reset clears all fake payments and disbursements (tests).
func (f *Fake) Reset() {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.byRef = make(map[string]*fakePayment)
	f.byExternal = make(map[string]string)
	f.ForceTimeoutCreate = false
	f.ForceTimeoutExpire = false
	f.AutoPayExternalIDs = make(map[string]bool)
	f.disbByRef = make(map[string]*fakeDisbursement)
	f.disbByExternal = make(map[string]string)
	f.ForceTimeoutDisburse = false
	f.ForceFailDisburse = false
	f.ForceActualFeeIDR = nil
	f.AutoCompleteDisburse = true
	if f.DefaultProviderFeeIDR <= 0 {
		f.DefaultProviderFeeIDR = 2500
	}
}

// QuoteDisbursement returns verified provider processing fee (deterministic).
func (f *Fake) QuoteDisbursement(ctx context.Context, in ports.DisbursementQuoteInput) (ports.DisbursementQuote, error) {
	_ = ctx
	fee := f.DefaultProviderFeeIDR
	if fee < 0 {
		fee = 2500
	}
	ref := "xendit_dq_" + hex.EncodeToString(sha256sum([]byte("dq|"+in.BankCode+"|"+fmt.Sprint(in.AmountIDR)))[:8])
	return ports.DisbursementQuote{
		ProviderFeeIDR:    fee,
		ProviderReference: ref,
		Evidence:          fmt.Sprintf("fake-schedule-v1 fee=%d", fee),
		QuotedAt:          time.Now().UTC(),
	}, nil
}

// CreateDisbursement is idempotent on ExternalID. Timeout after send → UNKNOWN_OUTCOME class.
func (f *Fake) CreateDisbursement(ctx context.Context, in ports.CreateDisbursementInput) (ports.CreateDisbursementResult, error) {
	_ = ctx
	if f.ForceTimeoutDisburse {
		// Record as sent so lookup can find by external id if we pre-register.
		f.mu.Lock()
		if _, ok := f.disbByExternal[in.ExternalID]; !ok {
			ref := deterministicDisbRef(in.ExternalID)
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
				CreatedAt:         time.Now().UTC(),
			}
			f.disbByRef[ref] = d
			f.disbByExternal[in.ExternalID] = ref
		}
		f.mu.Unlock()
		return ports.CreateDisbursementResult{}, &ports.ProviderError{
			Class:       ports.ProviderTimeout,
			Message:     "disburse timeout after send",
			RequestSent: true,
		}
	}
	if in.NetAmountIDR <= 0 {
		return ports.CreateDisbursementResult{}, &ports.ProviderError{
			Class: ports.ProviderRejected, Message: "invalid amount",
		}
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if ref, ok := f.disbByExternal[in.ExternalID]; ok {
		d := f.disbByRef[ref]
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
	ref := deterministicDisbRef(in.ExternalID)
	fee := f.DefaultProviderFeeIDR
	if f.ForceActualFeeIDR != nil {
		fee = *f.ForceActualFeeIDR
	}
	status := "PENDING"
	if f.ForceFailDisburse {
		status = "FAILED"
	}
	d := &fakeDisbursement{
		Ref:               ref,
		ExternalID:        in.ExternalID,
		NetAmountIDR:      in.NetAmountIDR,
		Currency:          "IDR",
		Status:            status,
		ProviderFeeIDR:    fee,
		BankCode:          in.BankCode,
		AccountNumberMask: in.AccountNumberMask,
		AccountHolder:     in.AccountHolderName,
		CreatedAt:         time.Now().UTC(),
	}
	if status == "FAILED" {
		d.FailureCode = "FAKE_REJECTED"
	}
	f.disbByRef[ref] = d
	f.disbByExternal[in.ExternalID] = ref
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

// GetDisbursement looks up by provider reference.
func (f *Fake) GetDisbursement(ctx context.Context, providerRef string) (ports.ProviderDisbursement, error) {
	_ = ctx
	f.mu.Lock()
	defer f.mu.Unlock()
	d, ok := f.disbByRef[providerRef]
	if !ok {
		return ports.ProviderDisbursement{}, &ports.ProviderError{
			Class: ports.ProviderRejected, Message: "not found",
		}
	}
	if f.AutoCompleteDisburse && d.Status == "PENDING" {
		now := time.Now().UTC()
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

// GetDisbursementByExternal looks up by external id (unknown-outcome resolver).
func (f *Fake) GetDisbursementByExternal(externalID string) (ports.ProviderDisbursement, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	ref, ok := f.disbByExternal[externalID]
	if !ok {
		return ports.ProviderDisbursement{}, false
	}
	d := f.disbByRef[ref]
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

// SimulateDisburseComplete marks a disbursement completed (tests).
func (f *Fake) SimulateDisburseComplete(providerRef string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	d, ok := f.disbByRef[providerRef]
	if !ok {
		return fmt.Errorf("not found")
	}
	now := time.Now().UTC()
	d.Status = "COMPLETED"
	d.CompletedAt = &now
	return nil
}

// DisbursementCount returns number of created disbursements (tests).
func (f *Fake) DisbursementCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.disbByRef)
}

func deterministicDisbRef(externalID string) string {
	h := sha256.Sum256([]byte("xendit-fake-disb|" + externalID))
	return "xendit_disb_" + hex.EncodeToString(h[:12])
}

func sha256sum(b []byte) []byte {
	h := sha256.Sum256(b)
	return h[:]
}

func toProviderPayment(p *fakePayment) ports.ProviderPayment {
	return ports.ProviderPayment{
		ProviderReference: p.Ref,
		ExternalID:        p.ExternalID,
		AmountIDR:         p.AmountIDR,
		Currency:          p.Currency,
		Status:            p.Status,
		PaidAt:            p.PaidAt,
		ExpiresAt:         &p.ExpiresAt,
	}
}

func deterministicRef(externalID, mode string) string {
	h := sha256.Sum256([]byte("xendit-fake|" + mode + "|" + externalID))
	return "xendit_qr_" + hex.EncodeToString(h[:12])
}

func deterministicQR(externalID string, amount int64) string {
	h := sha256.Sum256([]byte(fmt.Sprintf("qr|%s|%d", externalID, amount)))
	// EMVCo-like fake payload prefix; not a real QRIS string.
	return "00020101021226650016COM.XENDIT.WWW0118" + strings.ToUpper(hex.EncodeToString(h[:8])) +
		fmt.Sprintf("540%d%d", digitLen(amount), amount) + "5802ID6304FAKE"
}

func digitLen(n int64) int {
	if n <= 0 {
		return 1
	}
	d := 0
	for n > 0 {
		n /= 10
		d++
	}
	return d
}

// Ensure Fake implements QRISProvider and DisbursementProvider.
var _ ports.QRISProvider = (*Fake)(nil)
var _ ports.DisbursementProvider = (*Fake)(nil)
