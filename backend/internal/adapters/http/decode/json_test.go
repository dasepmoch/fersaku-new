package decode_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/decode"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

type sample struct {
	Message   string `json:"message"`
	AmountIdr int64  `json:"amountIdr"`
}

func TestDecodeJSONOK(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"message":"a","amountIdr":1000}`))
	req.Header.Set("Content-Type", "application/json")
	var dest sample
	if err := decode.DecodeJSON(req, &dest); err != nil {
		t.Fatal(err)
	}
	if dest.Message != "a" || dest.AmountIdr != 1000 {
		t.Fatalf("%+v", dest)
	}
}

func TestDecodeJSONUnknownField(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"message":"a","nope":1}`))
	req.Header.Set("Content-Type", "application/json")
	var dest sample
	err := decode.DecodeJSON(req, &dest)
	ae, ok := apperr.AsAppError(err)
	if !ok || ae.Code != apperr.CodeValidationFailed {
		t.Fatalf("%v", err)
	}
}

func TestDecodeJSONContentType(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"message":"a"}`))
	req.Header.Set("Content-Type", "text/plain")
	var dest sample
	err := decode.DecodeJSON(req, &dest)
	if _, ok := apperr.AsAppError(err); !ok {
		t.Fatalf("%v", err)
	}
}

func TestDecodeJSONTooLarge(t *testing.T) {
	body := `{"message":"` + strings.Repeat("x", 100) + `"}`
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	var dest sample
	err := decode.DecodeJSONLimited(req, &dest, 32)
	ae, ok := apperr.AsAppError(err)
	if !ok || ae.Code != apperr.CodeValidationFailed {
		t.Fatalf("%v", err)
	}
}

func TestDecodeJSONRejectsFloatMoneyShape(t *testing.T) {
	// amountIdr as float should fail type check for int64 field
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"message":"a","amountIdr":10.5}`))
	req.Header.Set("Content-Type", "application/json")
	var dest sample
	err := decode.DecodeJSON(req, &dest)
	if err == nil {
		t.Fatal("expected error for fractional amount")
	}
	if _, ok := apperr.AsAppError(err); !ok {
		t.Fatalf("%v", err)
	}
}
