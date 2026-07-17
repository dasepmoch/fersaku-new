package handlers_test

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/handlers"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/payments"
)

// stubWithdrawalCallback is a minimal surface for token/body tests.
// Full service path is covered by integration; here we only need Svc non-nil
// for early token/body rejection without DB.
type stubNotUsed struct{}

func TestDisbursementWebhook_MissingToken(t *testing.T) {
	h := &handlers.WithdrawalHandler{
		Svc:          &application.WithdrawalService{},
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
		Svc:          &application.WithdrawalService{},
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

func TestDisbursementWebhook_OversizeBody(t *testing.T) {
	h := &handlers.WithdrawalHandler{
		Svc:          &application.WithdrawalService{},
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

func TestDisbursementWebhook_MalformedJSON(t *testing.T) {
	h := &handlers.WithdrawalHandler{
		Svc:          &application.WithdrawalService{},
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
	_ = context.Background()
	_ = strings.TrimSpace("x")
}
