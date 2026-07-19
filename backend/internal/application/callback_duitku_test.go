package application

import (
	"context"
	"crypto/hmac"
	"crypto/md5"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/orders"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/payments"
)

const (
	testDuitkuMerchant = "DXXXX"
	testDuitkuAPIKey   = "fake-duitku-api-key-not-real"
)

// HMAC-SHA256(merchantCode + amount + merchantOrderId, apiKey) — live path (docs 2026-07-20).
func duitkuSig(merchant, amount, orderID, key string) string {
	mac := hmac.New(sha256.New, []byte(key))
	_, _ = mac.Write([]byte(merchant + amount + orderID))
	return hex.EncodeToString(mac.Sum(nil))
}

func duitkuMD5Legacy(merchant, amount, orderID, key string) string {
	sum := md5.Sum([]byte(merchant + amount + orderID + key))
	return hex.EncodeToString(sum[:])
}

func TestHandleDuitkuIngress_InvalidSignatureRejects(t *testing.T) {
	store := &rejectOnlyStore{}
	s := &CallbackService{
		DuitkuMerchantCode: testDuitkuMerchant,
		DuitkuAPIKey:       testDuitkuAPIKey,
		DuitkuAccountScope: payments.AccountScopeDuitkuPrimary,
		IDs:                fixedIDs{},
		Clock:              cbFixedClock{t: time.Now().UTC()},
		Store:              store,
	}
	// 64-hex junk (HMAC length) but wrong digest.
	body := []byte(fmt.Sprintf(`{
		"merchantCode":%q,
		"amount":"10000",
		"merchantOrderId":"ord-1",
		"resultCode":"00",
		"reference":"REF1",
		"signature":"deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
	}`, testDuitkuMerchant))
	res, err := s.HandleDuitkuIngress(context.Background(), DuitkuIngressRequest{
		Body:        body,
		ContentType: "application/json",
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.HTTPStatus != 401 || res.RejectionReason != payments.RejectInvalidSignature {
		t.Fatalf("status=%d reason=%s", res.HTTPStatus, res.RejectionReason)
	}
	if store.rejections != 1 {
		t.Fatal("expected rejection row")
	}
}

func TestHandleDuitkuIngress_RejectsLegacyMD5(t *testing.T) {
	store := &rejectOnlyStore{}
	s := &CallbackService{
		DuitkuMerchantCode: testDuitkuMerchant,
		DuitkuAPIKey:       testDuitkuAPIKey,
		IDs:                fixedIDs{},
		Clock:              cbFixedClock{t: time.Now().UTC()},
		Store:              store,
	}
	md5Sig := duitkuMD5Legacy(testDuitkuMerchant, "10000", "ord-1", testDuitkuAPIKey)
	body := []byte(fmt.Sprintf(`{
		"merchantCode":%q,
		"amount":"10000",
		"merchantOrderId":"ord-1",
		"resultCode":"00",
		"reference":"REF1",
		"signature":%q
	}`, testDuitkuMerchant, md5Sig))
	res, err := s.HandleDuitkuIngress(context.Background(), DuitkuIngressRequest{
		Body:        body,
		ContentType: "application/json",
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.HTTPStatus != 401 || res.RejectionReason != payments.RejectInvalidSignature {
		t.Fatalf("MD5 must be rejected on live path: status=%d reason=%s", res.HTTPStatus, res.RejectionReason)
	}
}

func TestHandleDuitkuIngress_MissingSignatureRejects(t *testing.T) {
	store := &rejectOnlyStore{}
	s := &CallbackService{
		DuitkuMerchantCode: testDuitkuMerchant,
		DuitkuAPIKey:       testDuitkuAPIKey,
		IDs:                fixedIDs{},
		Clock:              cbFixedClock{t: time.Now().UTC()},
		Store:              store,
	}
	body := []byte(fmt.Sprintf(`{"merchantCode":%q,"amount":"10000","merchantOrderId":"ord-1","resultCode":"00","reference":"REF1"}`, testDuitkuMerchant))
	res, err := s.HandleDuitkuIngress(context.Background(), DuitkuIngressRequest{
		Body:        body,
		ContentType: "application/json",
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.HTTPStatus != 401 || res.RejectionReason != payments.RejectMissingSignature {
		t.Fatalf("status=%d reason=%s", res.HTTPStatus, res.RejectionReason)
	}
}

func TestHandleDuitkuIngress_MerchantMismatchRejects(t *testing.T) {
	store := &rejectOnlyStore{}
	s := &CallbackService{
		DuitkuMerchantCode: testDuitkuMerchant,
		DuitkuAPIKey:       testDuitkuAPIKey,
		IDs:                fixedIDs{},
		Clock:              cbFixedClock{t: time.Now().UTC()},
		Store:              store,
	}
	sig := duitkuSig("OTHER", "10000", "ord-1", testDuitkuAPIKey)
	body := []byte(fmt.Sprintf(`{"merchantCode":"OTHER","amount":"10000","merchantOrderId":"ord-1","resultCode":"00","reference":"REF1","signature":%q}`, sig))
	res, err := s.HandleDuitkuIngress(context.Background(), DuitkuIngressRequest{
		Body:        body,
		ContentType: "application/json",
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.HTTPStatus != 401 || res.RejectionReason != payments.RejectMerchantMismatch {
		t.Fatalf("status=%d reason=%s", res.HTTPStatus, res.RejectionReason)
	}
}

func TestHandleDuitkuIngress_AcceptAndDuplicate(t *testing.T) {
	store := newDuitkuMemStore()
	s := &CallbackService{
		DuitkuMerchantCode: testDuitkuMerchant,
		DuitkuAPIKey:       testDuitkuAPIKey,
		DuitkuAccountScope: payments.AccountScopeDuitkuPrimary,
		DefaultPaymentMode: payments.PaymentModeSandbox,
		IDs:                &sequentialIDs{n: 0},
		Clock:              cbFixedClock{t: time.Date(2026, 7, 19, 12, 0, 0, 0, time.UTC)},
		Store:              store,
	}
	amount := "10000"
	orderID := "ext-paid-1"
	ref := "DREF-PAID-1"
	sig := duitkuSig(testDuitkuMerchant, amount, orderID, testDuitkuAPIKey)
	body, _ := json.Marshal(map[string]any{
		"merchantCode":    testDuitkuMerchant,
		"amount":          amount,
		"merchantOrderId": orderID,
		"resultCode":      "00",
		"reference":       ref,
		"signature":       sig,
	})

	res1, err := s.HandleDuitkuIngress(context.Background(), DuitkuIngressRequest{
		Body:        body,
		ContentType: "application/json",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !res1.Accepted || res1.HTTPStatus != 200 || res1.Duplicate {
		t.Fatalf("first: %+v", res1)
	}
	if store.lastProvider != payments.ProviderDuitku {
		t.Fatalf("provider=%q", store.lastProvider)
	}
	if store.lastScope != payments.AccountScopeDuitkuPrimary {
		t.Fatalf("scope=%q", store.lastScope)
	}
	if store.inserts != 1 {
		t.Fatalf("inserts=%d", store.inserts)
	}

	// Replay same body → duplicate accept, no second insert.
	res2, err := s.HandleDuitkuIngress(context.Background(), DuitkuIngressRequest{
		Body:        body,
		ContentType: "application/json",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !res2.Accepted || !res2.Duplicate || res2.HTTPStatus != 200 {
		t.Fatalf("replay: %+v", res2)
	}
	if store.inserts != 1 {
		t.Fatalf("duplicate must not insert again, inserts=%d", store.inserts)
	}
	if store.processCalls < 1 {
		t.Fatal("expected ProcessEvent path (via accept)")
	}
}

func TestHandleDuitkuIngress_FormEncoded(t *testing.T) {
	store := newDuitkuMemStore()
	s := &CallbackService{
		DuitkuMerchantCode: testDuitkuMerchant,
		DuitkuAPIKey:       testDuitkuAPIKey,
		DuitkuAccountScope: payments.AccountScopeDuitkuPrimary,
		DefaultPaymentMode: payments.PaymentModeSandbox,
		IDs:                &sequentialIDs{n: 0},
		Clock:              cbFixedClock{t: time.Now().UTC()},
		Store:              store,
	}
	amount := "5000"
	orderID := "form-ord"
	sig := duitkuSig(testDuitkuMerchant, amount, orderID, testDuitkuAPIKey)
	body := []byte(fmt.Sprintf(
		"merchantCode=%s&paymentAmount=%s&merchantOrderId=%s&resultCode=00&reference=FREF1&signature=%s",
		testDuitkuMerchant, amount, orderID, sig,
	))
	res, err := s.HandleDuitkuIngress(context.Background(), DuitkuIngressRequest{
		Body:        body,
		ContentType: "application/x-www-form-urlencoded",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !res.Accepted {
		t.Fatalf("%+v", res)
	}
	if store.lastProvider != payments.ProviderDuitku {
		t.Fatalf("provider %q", store.lastProvider)
	}
}

type sequentialIDs struct{ n int }

func (s *sequentialIDs) New() string {
	s.n++
	return fmt.Sprintf("id_%d", s.n)
}

// duitkuMemStore records accepts for unit tests (no real payment finalize).
type duitkuMemStore struct {
	mu           sync.Mutex
	events       map[string]payments.ProviderEvent // canonical key
	byID         map[string]payments.ProviderEvent
	inserts      int
	processCalls int
	lastProvider string
	lastScope    string
	rejections   int
}

func newDuitkuMemStore() *duitkuMemStore {
	return &duitkuMemStore{
		events: make(map[string]payments.ProviderEvent),
		byID:   make(map[string]payments.ProviderEvent),
	}
}

func (s *duitkuMemStore) canon(p, scope, mode, eid string) string {
	return payments.CanonicalEventKey(p, scope, mode, eid)
}

func (s *duitkuMemStore) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	return fn(ctx)
}

func (s *duitkuMemStore) InsertRejection(context.Context, payments.CallbackRejection) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.rejections++
	return nil
}

func (s *duitkuMemStore) InsertProviderEvent(ctx context.Context, ev payments.ProviderEvent) (payments.ProviderEvent, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	k := s.canon(ev.Provider, ev.AccountScope, ev.PaymentMode, ev.ProviderEventID)
	if _, ok := s.events[k]; ok {
		return payments.ProviderEvent{}, false, nil
	}
	s.events[k] = ev
	s.byID[ev.CallbackID] = ev
	s.inserts++
	s.lastProvider = ev.Provider
	s.lastScope = ev.AccountScope
	return ev, true, nil
}

func (s *duitkuMemStore) GetProviderEventByCanonical(ctx context.Context, provider, scope, mode, eventID string) (payments.ProviderEvent, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	ev, ok := s.events[s.canon(provider, scope, mode, eventID)]
	if !ok {
		return payments.ProviderEvent{}, errMemNotFound
	}
	return ev, nil
}

func (s *duitkuMemStore) GetProviderEventByID(ctx context.Context, id string) (payments.ProviderEvent, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	ev, ok := s.byID[id]
	if !ok {
		return payments.ProviderEvent{}, errMemNotFound
	}
	return ev, nil
}

func (s *duitkuMemStore) LockProviderEvent(ctx context.Context, id string) (payments.ProviderEvent, error) {
	s.processCalls++
	return s.GetProviderEventByID(ctx, id)
}

func (s *duitkuMemStore) UpdateProviderEventState(ctx context.Context, id, state string, patch CallbackEventPatch, at time.Time) (payments.ProviderEvent, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	ev, ok := s.byID[id]
	if !ok {
		return payments.ProviderEvent{}, errMemNotFound
	}
	ev.ProcessingState = state
	ev.UpdatedAt = at
	s.byID[id] = ev
	k := s.canon(ev.Provider, ev.AccountScope, ev.PaymentMode, ev.ProviderEventID)
	s.events[k] = ev
	return ev, nil
}

func (s *duitkuMemStore) ListProviderEventsReady(context.Context, time.Time, int32) ([]payments.ProviderEvent, error) {
	return nil, nil
}
func (s *duitkuMemStore) ListAdminProviderEvents(context.Context, int32) ([]payments.ProviderEvent, error) {
	return nil, nil
}
func (s *duitkuMemStore) GetPaymentIntentByProviderRefForUpdate(context.Context, string, string, string, string) (payments.Intent, error) {
	return payments.Intent{}, errMemNotFound
}
func (s *duitkuMemStore) GetPaymentIntentByExternalIDForUpdate(context.Context, string, string) (payments.Intent, error) {
	return payments.Intent{}, errMemNotFound
}
func (s *duitkuMemStore) GetPaymentIntentByIDForUpdate(context.Context, string) (payments.Intent, error) {
	return payments.Intent{}, errMemNotFound
}
func (s *duitkuMemStore) GetPaymentIntentByID(context.Context, string) (payments.Intent, error) {
	return payments.Intent{}, errMemNotFound
}
func (s *duitkuMemStore) MarkPaymentPaid(context.Context, string, bool, string, time.Time) (payments.Intent, error) {
	panic("unexpected")
}
func (s *duitkuMemStore) MarkPaymentTerminal(context.Context, string, string, *string, time.Time) (payments.Intent, error) {
	panic("unexpected")
}
func (s *duitkuMemStore) SetFinancialState(context.Context, string, string, time.Time) error {
	panic("unexpected")
}
func (s *duitkuMemStore) MarkOrderPaid(context.Context, string, time.Time) error { panic("unexpected") }
func (s *duitkuMemStore) MarkOrderTerminal(context.Context, string, string, string, time.Time) error {
	panic("unexpected")
}
func (s *duitkuMemStore) GetOrderByID(context.Context, string) (CheckoutOrder, error) {
	return CheckoutOrder{}, errMemNotFound
}
func (s *duitkuMemStore) ListOrderItems(context.Context, string) ([]orders.OrderItem, error) {
	return nil, nil
}
func (s *duitkuMemStore) InsertSettlement(context.Context, payments.Settlement) (payments.Settlement, bool, error) {
	panic("unexpected")
}
func (s *duitkuMemStore) GetSettlementByIntent(context.Context, string) (payments.Settlement, error) {
	return payments.Settlement{}, errMemNotFound
}
func (s *duitkuMemStore) InsertOutbox(context.Context, string, string, []byte, *string, *string, time.Time) error {
	return nil
}
func (s *duitkuMemStore) CountSettlementsByIntent(context.Context, string) (int64, error) {
	return 0, nil
}
func (s *duitkuMemStore) CountProviderEventsByCanonical(context.Context, string, string, string, string) (int64, error) {
	return 0, nil
}
func (s *duitkuMemStore) CountRejections(context.Context, string) (int64, error) {
	return int64(s.rejections), nil
}
func (s *duitkuMemStore) IsNotFound(err error) bool { return err == errMemNotFound }
func (s *duitkuMemStore) IsUniqueViolation(error) bool {
	return false
}

var errMemNotFound = fmt.Errorf("mem: not found")
