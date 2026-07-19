package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/handlers"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/xendit"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/payments"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// fakeDisburseApply records callbacks for happy-path / replay unit tests (PROD-C10).
type fakeDisburseApply struct {
	mu    sync.Mutex
	calls []disburseCall
	err   error
	callN int
}

type disburseCall struct {
	Ref    string
	Status string
	Fee    *int64
	Amount int64
}

func (f *fakeDisburseApply) HandleDisbursementCallback(_ context.Context, providerRef string, status string, actualFee *int64, netAmount int64) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.callN++
	f.calls = append(f.calls, disburseCall{Ref: providerRef, Status: status, Fee: actualFee, Amount: netAmount})
	return f.err
}

func TestDisbursementWebhook_MissingToken(t *testing.T) {
	h := &handlers.WithdrawalHandler{
		Apply:        &fakeDisburseApply{},
		WebhookToken: "expected-token",
	}
	req := httptest.NewRequest(http.MethodPost, "/v1/webhooks/xendit/disbursement", bytes.NewReader([]byte(`{"id":"d1","status":"COMPLETED"}`)))
	rr := httptest.NewRecorder()
	h.DisbursementWebhook(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
}

func TestDisbursementWebhook_InvalidToken(t *testing.T) {
	h := &handlers.WithdrawalHandler{
		Apply:        &fakeDisburseApply{},
		WebhookToken: "expected-token",
	}
	req := httptest.NewRequest(http.MethodPost, "/v1/webhooks/xendit/disbursement", bytes.NewReader([]byte(`{"id":"d1","status":"COMPLETED"}`)))
	req.Header.Set("X-Callback-Token", "wrong-token")
	rr := httptest.NewRecorder()
	h.DisbursementWebhook(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
}

func TestDisbursementWebhook_EmptyConfiguredToken_FailClosed(t *testing.T) {
	apply := &fakeDisburseApply{}
	h := &handlers.WithdrawalHandler{
		Apply:        apply,
		WebhookToken: "",
	}
	req := httptest.NewRequest(http.MethodPost, "/v1/webhooks/xendit/disbursement", bytes.NewReader([]byte(`{"id":"d1","status":"COMPLETED"}`)))
	req.Header.Set("X-Callback-Token", "anything")
	rr := httptest.NewRecorder()
	h.DisbursementWebhook(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	if apply.callN != 0 {
		t.Fatal("must not apply when token not configured")
	}
	if !bytes.Contains(rr.Body.Bytes(), []byte("token_not_configured")) {
		t.Fatalf("body=%s", rr.Body.String())
	}
}

func TestDisbursementWebhook_OversizeBody(t *testing.T) {
	h := &handlers.WithdrawalHandler{
		Apply:        &fakeDisburseApply{},
		WebhookToken: "expected-token",
	}
	body := bytes.Repeat([]byte("x"), int(payments.MaxCallbackBodyBytes)+10)
	req := httptest.NewRequest(http.MethodPost, "/v1/webhooks/xendit/disbursement", bytes.NewReader(body))
	req.Header.Set("X-Callback-Token", "expected-token")
	rr := httptest.NewRecorder()
	h.DisbursementWebhook(rr, req)
	if rr.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
}

func TestDisbursementWebhook_EmptyBody(t *testing.T) {
	h := &handlers.WithdrawalHandler{
		Apply:        &fakeDisburseApply{},
		WebhookToken: "expected-token",
	}
	req := httptest.NewRequest(http.MethodPost, "/v1/webhooks/xendit/disbursement", bytes.NewReader(nil))
	req.Header.Set("X-Callback-Token", "expected-token")
	rr := httptest.NewRecorder()
	h.DisbursementWebhook(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
}

func TestDisbursementWebhook_MalformedJSON(t *testing.T) {
	h := &handlers.WithdrawalHandler{
		Apply:        &fakeDisburseApply{},
		WebhookToken: "expected-token",
	}
	req := httptest.NewRequest(http.MethodPost, "/v1/webhooks/xendit/disbursement", bytes.NewReader([]byte(`not-json`)))
	req.Header.Set("X-Callback-Token", "expected-token")
	rr := httptest.NewRecorder()
	h.DisbursementWebhook(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
}

func TestDisbursementWebhook_MissingRef(t *testing.T) {
	h := &handlers.WithdrawalHandler{
		Apply:        &fakeDisburseApply{},
		WebhookToken: "expected-token",
	}
	req := httptest.NewRequest(http.MethodPost, "/v1/webhooks/xendit/disbursement", bytes.NewReader([]byte(`{"status":"COMPLETED"}`)))
	req.Header.Set("X-Callback-Token", "expected-token")
	rr := httptest.NewRecorder()
	h.DisbursementWebhook(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
}

func TestDisbursementWebhook_HappyCompleted(t *testing.T) {
	fee := int64(2500)
	apply := &fakeDisburseApply{}
	h := &handlers.WithdrawalHandler{
		Apply:        apply,
		WebhookToken: "expected-token",
	}
	payload, _ := json.Marshal(map[string]any{
		"id":     "po_happy",
		"status": "SUCCEEDED",
		"amount": 94500,
		"fee":    fee,
	})
	req := httptest.NewRequest(http.MethodPost, "/v1/webhooks/xendit/disbursement", bytes.NewReader(payload))
	req.Header.Set("X-Callback-Token", "expected-token")
	rr := httptest.NewRecorder()
	h.DisbursementWebhook(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	if apply.callN != 1 {
		t.Fatalf("calls=%d", apply.callN)
	}
	c := apply.calls[0]
	if c.Ref != "po_happy" {
		t.Fatalf("ref=%s", c.Ref)
	}
	if c.Status != "COMPLETED" {
		t.Fatalf("status mapped=%s want COMPLETED (from SUCCEEDED)", c.Status)
	}
	if c.Amount != 94500 || c.Fee == nil || *c.Fee != 2500 {
		t.Fatalf("amount/fee %+v", c)
	}
}

func TestDisbursementWebhook_FailedStatusMapped(t *testing.T) {
	apply := &fakeDisburseApply{}
	h := &handlers.WithdrawalHandler{Apply: apply, WebhookToken: "tok"}
	req := httptest.NewRequest(http.MethodPost, "/v1/webhooks/xendit/disbursement",
		bytes.NewReader([]byte(`{"id":"po_fail","status":"REJECTED","amount":1000}`)))
	req.Header.Set("X-Callback-Token", "tok")
	rr := httptest.NewRecorder()
	h.DisbursementWebhook(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d", rr.Code)
	}
	if apply.calls[0].Status != "FAILED" {
		t.Fatalf("got %s", apply.calls[0].Status)
	}
}

func TestDisbursementWebhook_PendingAndUnknownMapped(t *testing.T) {
	apply := &fakeDisburseApply{}
	h := &handlers.WithdrawalHandler{Apply: apply, WebhookToken: "tok"}

	for _, tc := range []struct {
		raw  string
		want string
	}{
		{`{"id":"p1","status":"ACCEPTED"}`, "PENDING"},
		{`{"id":"p2","status":"PROCESSING"}`, "PROCESSING"},
		{`{"id":"p3","status":""}`, "UNKNOWN"},
	} {
		req := httptest.NewRequest(http.MethodPost, "/v1/webhooks/xendit/disbursement", bytes.NewReader([]byte(tc.raw)))
		req.Header.Set("X-Callback-Token", "tok")
		rr := httptest.NewRecorder()
		h.DisbursementWebhook(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("%s status=%d", tc.raw, rr.Code)
		}
	}
	if len(apply.calls) != 3 {
		t.Fatalf("calls=%d", len(apply.calls))
	}
	if apply.calls[0].Status != "PENDING" || apply.calls[1].Status != "PROCESSING" || apply.calls[2].Status != "UNKNOWN" {
		t.Fatalf("%+v", apply.calls)
	}
}

func TestDisbursementWebhook_ReplayIdempotentAck(t *testing.T) {
	// Service is exactly-once; handler acks 200 on each delivery after auth.
	apply := &fakeDisburseApply{}
	h := &handlers.WithdrawalHandler{Apply: apply, WebhookToken: "tok"}
	body := []byte(`{"id":"po_replay","status":"COMPLETED","amount":100}`)
	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodPost, "/v1/webhooks/xendit/disbursement", bytes.NewReader(body))
		req.Header.Set("X-Callback-Token", "tok")
		rr := httptest.NewRecorder()
		h.DisbursementWebhook(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("replay %d status=%d", i, rr.Code)
		}
	}
	if apply.callN != 2 {
		t.Fatalf("handler delivers both; service must be idempotent (calls=%d)", apply.callN)
	}
}

func TestDisbursementWebhook_NotFoundQuarantine200(t *testing.T) {
	apply := &fakeDisburseApply{err: apperr.NotFound(apperr.CodeResourceNotFound, "Withdrawal not found for provider reference")}
	h := &handlers.WithdrawalHandler{Apply: apply, WebhookToken: "tok"}
	req := httptest.NewRequest(http.MethodPost, "/v1/webhooks/xendit/disbursement",
		bytes.NewReader([]byte(`{"id":"unknown_ref","status":"COMPLETED"}`)))
	req.Header.Set("X-Callback-Token", "tok")
	rr := httptest.NewRecorder()
	h.DisbursementWebhook(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	if !bytes.Contains(rr.Body.Bytes(), []byte("quarantined")) {
		t.Fatalf("body=%s", rr.Body.String())
	}
}

func TestDisbursementWebhook_ApplyError5xx(t *testing.T) {
	apply := &fakeDisburseApply{err: errors.New("db down")}
	h := &handlers.WithdrawalHandler{Apply: apply, WebhookToken: "tok"}
	req := httptest.NewRequest(http.MethodPost, "/v1/webhooks/xendit/disbursement",
		bytes.NewReader([]byte(`{"id":"po_err","status":"COMPLETED"}`)))
	req.Header.Set("X-Callback-Token", "tok")
	rr := httptest.NewRecorder()
	h.DisbursementWebhook(rr, req)
	if rr.Code < 500 {
		t.Fatalf("expected 5xx, got %d body=%s", rr.Code, rr.Body.String())
	}
}

func TestDisbursementWebhook_BearerTokenAccepted(t *testing.T) {
	apply := &fakeDisburseApply{}
	h := &handlers.WithdrawalHandler{Apply: apply, WebhookToken: "bearer-tok"}
	req := httptest.NewRequest(http.MethodPost, "/v1/webhooks/xendit/disbursement",
		bytes.NewReader([]byte(`{"external_id":"ext_1","status":"PENDING"}`)))
	req.Header.Set("Authorization", "Bearer bearer-tok")
	rr := httptest.NewRecorder()
	h.DisbursementWebhook(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d", rr.Code)
	}
	if apply.calls[0].Ref != "ext_1" || apply.calls[0].Status != "PENDING" {
		t.Fatalf("%+v", apply.calls[0])
	}
}

func TestDisbursementWebhook_NilApplier(t *testing.T) {
	h := &handlers.WithdrawalHandler{WebhookToken: "tok"}
	req := httptest.NewRequest(http.MethodPost, "/v1/webhooks/xendit/disbursement",
		bytes.NewReader([]byte(`{"id":"x","status":"COMPLETED"}`)))
	req.Header.Set("X-Callback-Token", "tok")
	rr := httptest.NewRecorder()
	h.DisbursementWebhook(rr, req)
	if rr.Code < 500 {
		t.Fatalf("expected 5xx, got %d", rr.Code)
	}
}

func TestConstantTimeTokenEqual_Exported(t *testing.T) {
	if !application.ConstantTimeTokenEqual("abc", "abc") {
		t.Fatal("equal tokens")
	}
	if application.ConstantTimeTokenEqual("abc", "xyz") {
		t.Fatal("unequal tokens")
	}
	if application.ConstantTimeTokenEqual("abc", "") {
		t.Fatal("empty want must reject")
	}
}

func TestMapDisburseStatus_AlignedWithClient(t *testing.T) {
	// Handler uses the same mapper as the Real client (PROD-C10).
	if xendit.MapDisburseStatus("SUCCEEDED") != "COMPLETED" {
		t.Fatal("mapping drift")
	}
}
