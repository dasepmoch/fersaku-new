package handlers_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/handlers"
)

func TestLive(t *testing.T) {
	h := handlers.HealthDeps{Service: "fersaku-api", StartedAt: time.Now().UTC()}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/health/live", nil)
	h.Live(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status %d", rr.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["check"] != "live" {
		t.Fatalf("body %#v", body)
	}
}

func TestReady(t *testing.T) {
	h := handlers.HealthDeps{
		Service: "fersaku-api",
		ReadyFn: func() bool { return true },
	}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/health/ready", nil)
	h.Ready(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status %d", rr.Code)
	}
}

func TestReadyNotReady(t *testing.T) {
	h := handlers.HealthDeps{
		Service: "fersaku-api",
		ReadyFn: func() bool { return false },
	}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/health/ready", nil)
	h.Ready(rr, req)
	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("status %d", rr.Code)
	}
}
