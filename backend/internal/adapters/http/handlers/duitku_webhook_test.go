package handlers

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/orders"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/payments"
)

func TestDuitkuWebhook_BadSignature_401(t *testing.T) {
	store := &duitkuHandlerStore{}
	svc := &application.CallbackService{
		Store:              store,
		IDs:                fixedHandlerIDs{},
		Clock:              fixedHandlerClock{t: time.Now().UTC()},
		DuitkuMerchantCode: "DXXXX",
		DuitkuAPIKey:       "fake-key",
		DuitkuAccountScope: payments.AccountScopeDuitkuPrimary,
		DefaultPaymentMode: payments.PaymentModeSandbox,
	}
	h := &CallbackHandler{Svc: svc}
	body := []byte(`{"merchantCode":"DXXXX","amount":"10000","merchantOrderId":"o1","resultCode":"00","reference":"R1","signature":"00"}`)
	req := httptest.NewRequest(http.MethodPost, "/v1/webhooks/duitku", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	h.DuitkuWebhook(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	if rr.Body.String() != "FAILED" {
		t.Fatalf("body=%q", rr.Body.String())
	}
}

func TestDuitkuWebhook_GoodSignature_200SUCCESS(t *testing.T) {
	store := &duitkuHandlerStore{events: map[string]payments.ProviderEvent{}}
	svc := &application.CallbackService{
		Store:              store,
		IDs:                fixedHandlerIDs{},
		Clock:              fixedHandlerClock{t: time.Now().UTC()},
		DuitkuMerchantCode: "DXXXX",
		DuitkuAPIKey:       "fake-key",
		DuitkuAccountScope: payments.AccountScopeDuitkuPrimary,
		DefaultPaymentMode: payments.PaymentModeSandbox,
	}
	h := &CallbackHandler{Svc: svc}
	// HMAC-SHA256(merchantCode + amount + merchantOrderId, apiKey)
	sig := hmacSHA256Hex("DXXXX"+"10000"+"o1", "fake-key")
	body := []byte(fmt.Sprintf(
		`{"merchantCode":"DXXXX","amount":"10000","merchantOrderId":"o1","resultCode":"00","reference":"R1","signature":%q}`,
		sig,
	))
	req := httptest.NewRequest(http.MethodPost, "/v1/webhooks/duitku", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	h.DuitkuWebhook(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	if rr.Body.String() != "SUCCESS" {
		t.Fatalf("body=%q want SUCCESS", rr.Body.String())
	}
	if store.lastProvider != payments.ProviderDuitku {
		t.Fatalf("provider=%q", store.lastProvider)
	}
}

func TestDuitkuWebhook_SandboxPathMode(t *testing.T) {
	store := &duitkuHandlerStore{events: map[string]payments.ProviderEvent{}}
	svc := &application.CallbackService{
		Store:              store,
		IDs:                fixedHandlerIDs{},
		Clock:              fixedHandlerClock{t: time.Now().UTC()},
		DuitkuMerchantCode: "DXXXX",
		DuitkuAPIKey:       "fake-key",
		DuitkuAccountScope: payments.AccountScopeDuitkuPrimary,
		DefaultPaymentMode: payments.PaymentModeLive, // override via path
	}
	h := &CallbackHandler{Svc: svc}
	sig := hmacSHA256Hex("DXXXX"+"1000"+"o2", "fake-key")
	body := []byte(fmt.Sprintf(
		`{"merchantCode":"DXXXX","amount":"1000","merchantOrderId":"o2","resultCode":"01","reference":"R2","signature":%q}`,
		sig,
	))
	req := httptest.NewRequest(http.MethodPost, "/v1/webhooks/duitku/sandbox", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	h.DuitkuWebhook(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	if rr.Body.String() != "SUCCESS" {
		t.Fatalf("body=%q", rr.Body.String())
	}
	if store.lastMode != payments.PaymentModeSandbox {
		t.Fatalf("mode=%q", store.lastMode)
	}
}

func hmacSHA256Hex(message, key string) string {
	mac := hmac.New(sha256.New, []byte(key))
	_, _ = mac.Write([]byte(message))
	return hex.EncodeToString(mac.Sum(nil))
}

type fixedHandlerIDs struct{}

func (fixedHandlerIDs) New() string { return "pcb_test_1" }

type fixedHandlerClock struct{ t time.Time }

func (c fixedHandlerClock) Now() time.Time { return c.t }

type duitkuHandlerStore struct {
	events       map[string]payments.ProviderEvent
	lastProvider string
	lastMode     string
	rejections   int
}

func (s *duitkuHandlerStore) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	return fn(ctx)
}
func (s *duitkuHandlerStore) InsertRejection(context.Context, payments.CallbackRejection) error {
	s.rejections++
	return nil
}
func (s *duitkuHandlerStore) InsertProviderEvent(ctx context.Context, ev payments.ProviderEvent) (payments.ProviderEvent, bool, error) {
	if s.events == nil {
		s.events = map[string]payments.ProviderEvent{}
	}
	k := payments.CanonicalEventKey(ev.Provider, ev.AccountScope, ev.PaymentMode, ev.ProviderEventID)
	if _, ok := s.events[k]; ok {
		return payments.ProviderEvent{}, false, nil
	}
	s.events[k] = ev
	s.lastProvider = ev.Provider
	s.lastMode = ev.PaymentMode
	return ev, true, nil
}
func (s *duitkuHandlerStore) GetProviderEventByCanonical(ctx context.Context, p, scope, mode, eid string) (payments.ProviderEvent, error) {
	k := payments.CanonicalEventKey(p, scope, mode, eid)
	ev, ok := s.events[k]
	if !ok {
		return payments.ProviderEvent{}, errHandlerNotFound
	}
	return ev, nil
}
func (s *duitkuHandlerStore) GetProviderEventByID(ctx context.Context, id string) (payments.ProviderEvent, error) {
	for _, ev := range s.events {
		if ev.CallbackID == id {
			return ev, nil
		}
	}
	return payments.ProviderEvent{}, errHandlerNotFound
}
func (s *duitkuHandlerStore) LockProviderEvent(ctx context.Context, id string) (payments.ProviderEvent, error) {
	return s.GetProviderEventByID(ctx, id)
}
func (s *duitkuHandlerStore) UpdateProviderEventState(ctx context.Context, id, state string, patch application.CallbackEventPatch, at time.Time) (payments.ProviderEvent, error) {
	ev, err := s.GetProviderEventByID(ctx, id)
	if err != nil {
		return payments.ProviderEvent{}, err
	}
	ev.ProcessingState = state
	k := payments.CanonicalEventKey(ev.Provider, ev.AccountScope, ev.PaymentMode, ev.ProviderEventID)
	s.events[k] = ev
	return ev, nil
}
func (s *duitkuHandlerStore) ListProviderEventsReady(context.Context, time.Time, int32) ([]payments.ProviderEvent, error) {
	return nil, nil
}
func (s *duitkuHandlerStore) ListAdminProviderEvents(context.Context, int32) ([]payments.ProviderEvent, error) {
	return nil, nil
}
func (s *duitkuHandlerStore) GetPaymentIntentByProviderRefForUpdate(context.Context, string, string, string, string) (payments.Intent, error) {
	return payments.Intent{}, errHandlerNotFound
}
func (s *duitkuHandlerStore) GetPaymentIntentByExternalIDForUpdate(context.Context, string, string) (payments.Intent, error) {
	return payments.Intent{}, errHandlerNotFound
}
func (s *duitkuHandlerStore) GetPaymentIntentByIDForUpdate(context.Context, string) (payments.Intent, error) {
	return payments.Intent{}, errHandlerNotFound
}
func (s *duitkuHandlerStore) GetPaymentIntentByID(context.Context, string) (payments.Intent, error) {
	return payments.Intent{}, errHandlerNotFound
}
func (s *duitkuHandlerStore) MarkPaymentPaid(context.Context, string, bool, string, time.Time) (payments.Intent, error) {
	panic("unexpected")
}
func (s *duitkuHandlerStore) MarkPaymentTerminal(context.Context, string, string, *string, time.Time) (payments.Intent, error) {
	panic("unexpected")
}
func (s *duitkuHandlerStore) SetFinancialState(context.Context, string, string, time.Time) error {
	panic("unexpected")
}
func (s *duitkuHandlerStore) MarkOrderPaid(context.Context, string, time.Time) error { panic("unexpected") }
func (s *duitkuHandlerStore) MarkOrderTerminal(context.Context, string, string, string, time.Time) error {
	panic("unexpected")
}
func (s *duitkuHandlerStore) GetOrderByID(context.Context, string) (application.CheckoutOrder, error) {
	return application.CheckoutOrder{}, errHandlerNotFound
}
func (s *duitkuHandlerStore) ListOrderItems(context.Context, string) ([]orders.OrderItem, error) {
	return nil, nil
}
func (s *duitkuHandlerStore) InsertSettlement(context.Context, payments.Settlement) (payments.Settlement, bool, error) {
	panic("unexpected")
}
func (s *duitkuHandlerStore) GetSettlementByIntent(context.Context, string) (payments.Settlement, error) {
	return payments.Settlement{}, errHandlerNotFound
}
func (s *duitkuHandlerStore) InsertOutbox(context.Context, string, string, []byte, *string, *string, time.Time) error {
	return nil
}
func (s *duitkuHandlerStore) CountSettlementsByIntent(context.Context, string) (int64, error) {
	return 0, nil
}
func (s *duitkuHandlerStore) CountProviderEventsByCanonical(context.Context, string, string, string, string) (int64, error) {
	return 0, nil
}
func (s *duitkuHandlerStore) CountRejections(context.Context, string) (int64, error) {
	return int64(s.rejections), nil
}
func (s *duitkuHandlerStore) IsNotFound(err error) bool { return err == errHandlerNotFound }
func (s *duitkuHandlerStore) IsUniqueViolation(error) bool {
	return false
}

var errHandlerNotFound = fmt.Errorf("not found")
