package application

import (
	"context"
	"testing"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/orders"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/payments"
)

func TestConstantTimeTokenEqual_DigestCompare(t *testing.T) {
	if !ConstantTimeTokenEqual("token-a", "token-a") {
		t.Fatal("same")
	}
	if ConstantTimeTokenEqual("token-a", "token-b") {
		t.Fatal("different")
	}
	if ConstantTimeTokenEqual("token-a", "") {
		t.Fatal("empty want")
	}
}

func TestHandleIngress_OversizeRejects(t *testing.T) {
	store := &rejectOnlyStore{}
	s := &CallbackService{
		WebhookToken: "tok",
		IDs:          fixedIDs{},
		Clock:        cbFixedClock{t: time.Date(2026, 7, 17, 12, 0, 0, 0, time.UTC)},
		Store:        store,
	}
	body := make([]byte, payments.MaxCallbackBodyBytes+1)
	res, err := s.HandleIngress(context.Background(), IngressRequest{
		Body:        body,
		TokenHeader: "tok",
		ContentType: "application/json",
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.HTTPStatus != 413 || res.RejectionReason != payments.RejectOversizeBody {
		t.Fatalf("got status=%d reason=%s", res.HTTPStatus, res.RejectionReason)
	}
	if store.rejections != 1 {
		t.Fatalf("expected rejection quarantine insert, got %d", store.rejections)
	}
}

func TestHandleIngress_InvalidTokenRejects(t *testing.T) {
	store := &rejectOnlyStore{}
	s := &CallbackService{
		WebhookToken: "good",
		IDs:          fixedIDs{},
		Clock:        cbFixedClock{t: time.Now().UTC()},
		Store:        store,
	}
	res, err := s.HandleIngress(context.Background(), IngressRequest{
		Body:        []byte(`{"id":"e1","status":"PAID"}`),
		TokenHeader: "bad",
		ContentType: "application/json",
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.HTTPStatus != 401 || res.RejectionReason != payments.RejectInvalidToken {
		t.Fatalf("got status=%d reason=%s", res.HTTPStatus, res.RejectionReason)
	}
	if store.rejections != 1 {
		t.Fatal("expected rejection row")
	}
}

func TestHandleIngress_MissingTokenRejects(t *testing.T) {
	store := &rejectOnlyStore{}
	s := &CallbackService{
		WebhookToken: "good",
		IDs:          fixedIDs{},
		Clock:        cbFixedClock{t: time.Now().UTC()},
		Store:        store,
	}
	res, err := s.HandleIngress(context.Background(), IngressRequest{
		Body:        []byte(`{"id":"e1"}`),
		TokenHeader: "",
		ContentType: "application/json",
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.HTTPStatus != 401 || res.RejectionReason != payments.RejectMissingToken {
		t.Fatalf("got status=%d reason=%s", res.HTTPStatus, res.RejectionReason)
	}
}

type fixedIDs struct{}

func (fixedIDs) New() string { return "id_test" }

type cbFixedClock struct{ t time.Time }

func (c cbFixedClock) Now() time.Time { return c.t }

// rejectOnlyStore records rejection quarantine inserts; other methods panic if used.
type rejectOnlyStore struct {
	rejections int
}

func (s *rejectOnlyStore) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	return fn(ctx)
}
func (s *rejectOnlyStore) InsertRejection(ctx context.Context, r payments.CallbackRejection) error {
	s.rejections++
	return nil
}
func (s *rejectOnlyStore) InsertProviderEvent(context.Context, payments.ProviderEvent) (payments.ProviderEvent, bool, error) {
	panic("unexpected")
}
func (s *rejectOnlyStore) GetProviderEventByCanonical(context.Context, string, string, string, string) (payments.ProviderEvent, error) {
	panic("unexpected")
}
func (s *rejectOnlyStore) GetProviderEventByID(context.Context, string) (payments.ProviderEvent, error) {
	panic("unexpected")
}
func (s *rejectOnlyStore) LockProviderEvent(context.Context, string) (payments.ProviderEvent, error) {
	panic("unexpected")
}
func (s *rejectOnlyStore) UpdateProviderEventState(context.Context, string, string, CallbackEventPatch, time.Time) (payments.ProviderEvent, error) {
	panic("unexpected")
}
func (s *rejectOnlyStore) ListProviderEventsReady(context.Context, time.Time, int32) ([]payments.ProviderEvent, error) {
	panic("unexpected")
}
func (s *rejectOnlyStore) ListAdminProviderEvents(context.Context, int32) ([]payments.ProviderEvent, error) {
	panic("unexpected")
}
func (s *rejectOnlyStore) GetPaymentIntentByProviderRefForUpdate(context.Context, string, string, string, string) (payments.Intent, error) {
	panic("unexpected")
}
func (s *rejectOnlyStore) GetPaymentIntentByExternalIDForUpdate(context.Context, string, string) (payments.Intent, error) {
	panic("unexpected")
}
func (s *rejectOnlyStore) GetPaymentIntentByIDForUpdate(context.Context, string) (payments.Intent, error) {
	panic("unexpected")
}
func (s *rejectOnlyStore) GetPaymentIntentByID(context.Context, string) (payments.Intent, error) {
	panic("unexpected")
}
func (s *rejectOnlyStore) MarkPaymentPaid(context.Context, string, bool, string, time.Time) (payments.Intent, error) {
	panic("unexpected")
}
func (s *rejectOnlyStore) MarkPaymentTerminal(context.Context, string, string, *string, time.Time) (payments.Intent, error) {
	panic("unexpected")
}
func (s *rejectOnlyStore) SetFinancialState(context.Context, string, string, time.Time) error {
	panic("unexpected")
}
func (s *rejectOnlyStore) MarkOrderPaid(context.Context, string, time.Time) error {
	panic("unexpected")
}
func (s *rejectOnlyStore) MarkOrderTerminal(context.Context, string, string, string, time.Time) error {
	panic("unexpected")
}
func (s *rejectOnlyStore) GetOrderByID(context.Context, string) (CheckoutOrder, error) {
	panic("unexpected")
}
func (s *rejectOnlyStore) ListOrderItems(context.Context, string) ([]orders.OrderItem, error) {
	panic("unexpected")
}
func (s *rejectOnlyStore) InsertSettlement(context.Context, payments.Settlement) (payments.Settlement, bool, error) {
	panic("unexpected")
}
func (s *rejectOnlyStore) GetSettlementByIntent(context.Context, string) (payments.Settlement, error) {
	panic("unexpected")
}
func (s *rejectOnlyStore) InsertOutbox(context.Context, string, string, []byte, *string, *string, time.Time) error {
	panic("unexpected")
}
func (s *rejectOnlyStore) CountSettlementsByIntent(context.Context, string) (int64, error) {
	panic("unexpected")
}
func (s *rejectOnlyStore) CountProviderEventsByCanonical(context.Context, string, string, string, string) (int64, error) {
	panic("unexpected")
}
func (s *rejectOnlyStore) CountRejections(context.Context, string) (int64, error) {
	return int64(s.rejections), nil
}
func (s *rejectOnlyStore) IsNotFound(error) bool        { return false }
func (s *rejectOnlyStore) IsUniqueViolation(error) bool { return false }
