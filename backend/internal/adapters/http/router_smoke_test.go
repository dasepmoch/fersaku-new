package httpadapter_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	httpadapter "github.com/dasepmoch/fersaku-new/backend/internal/adapters/http"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/middleware"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/observability"
	"github.com/dasepmoch/fersaku-new/backend/internal/config"
)

func testRouter(t *testing.T, opts ...func(*httpadapter.RouterDeps)) http.Handler {
	t.Helper()
	log := observability.NewSlogLogger("error", "test")
	ids := observability.NewULIDGenerator()
	d := httpadapter.RouterDeps{
		Log:             log,
		IDs:             ids,
		Service:         "fersaku-api",
		Version:         "0.0.0-test",
		AppEnv:          config.EnvTest,
		Ready:           func() bool { return true },
		StartedAt:       time.Now().UTC(),
		CSRFSoftDisable: true,
		RateLimiter:     nil, // disable by default for smoke tests
		RequestTimeout:  5 * time.Second,
	}
	for _, o := range opts {
		o(&d)
	}
	return httpadapter.NewRouterWith(d)
}

func TestMetricsEndpointPrometheusText(t *testing.T) {
	h := testRouter(t)
	// Generate at least one sample via health.
	req0 := httptest.NewRequest(http.MethodGet, "/health/live", nil)
	rr0 := httptest.NewRecorder()
	h.ServeHTTP(rr0, req0)

	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("metrics status %d body %s", rr.Code, rr.Body.String())
	}
	ct := rr.Header().Get("Content-Type")
	if !strings.Contains(ct, "text/plain") {
		t.Fatalf("content-type %q", ct)
	}
	body := rr.Body.String()
	for _, want := range []string{
		"fersaku_http_requests_total",
		"fersaku_payment_paid_total",
		"fersaku_outbox_pending",
		"fersaku_audit_chain",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("missing %q in metrics body", want)
		}
	}
}

func TestTraceparentPropagation(t *testing.T) {
	h := testRouter(t)
	req := httptest.NewRequest(http.MethodGet, "/health/live", nil)
	req.Header.Set(middleware.RequestIDHeader, "req_trace_prop_01")
	req.Header.Set(middleware.TraceparentHeader, "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status %d", rr.Code)
	}
	if got := rr.Header().Get(middleware.RequestIDHeader); got != "req_trace_prop_01" {
		t.Fatalf("request id %q", got)
	}
	if got := rr.Header().Get(middleware.TraceIDHeader); got != "4bf92f3577b34da6a3ce929d0e0e4736" {
		t.Fatalf("trace id %q", got)
	}
	if tp := rr.Header().Get(middleware.TraceparentHeader); !strings.Contains(tp, "4bf92f3577b34da6a3ce929d0e0e4736") {
		t.Fatalf("traceparent %q", tp)
	}
}

func TestHealthRoutes(t *testing.T) {
	h := testRouter(t)
	for _, path := range []string{"/health/live", "/health/ready"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("%s status %d body %s", path, rr.Code, rr.Body.String())
		}
		if rr.Header().Get(middleware.RequestIDHeader) == "" {
			t.Fatalf("%s missing X-Request-ID", path)
		}
	}
}

func TestStatusEnvelope(t *testing.T) {
	h := testRouter(t)
	req := httptest.NewRequest(http.MethodGet, "/v1/status", nil)
	req.Header.Set(middleware.RequestIDHeader, "req_test_status_01")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rr.Code, rr.Body.String())
	}
	if got := rr.Header().Get(middleware.RequestIDHeader); got != "req_test_status_01" {
		t.Fatalf("request id header %q", got)
	}
	var env presenters.Envelope
	if err := json.Unmarshal(rr.Body.Bytes(), &env); err != nil {
		t.Fatal(err)
	}
	if env.Meta.RequestID != "req_test_status_01" {
		t.Fatalf("meta.requestId %q", env.Meta.RequestID)
	}
	if env.Meta.Timestamp == "" {
		t.Fatal("missing meta.timestamp")
	}
	data, ok := env.Data.(map[string]any)
	if !ok {
		t.Fatalf("data type %T", env.Data)
	}
	if data["service"] != "fersaku-api" {
		t.Fatalf("service %#v", data["service"])
	}
	if data["version"] != "0.0.0-test" {
		t.Fatalf("version %#v", data["version"])
	}
	if data["appEnv"] != "test" {
		t.Fatalf("appEnv %#v", data["appEnv"])
	}
	// No secrets keys
	for _, k := range []string{"sessionSecret", "csrfSecret", "databaseUrl", "xenditSecretKey"} {
		if _, exists := data[k]; exists {
			t.Fatalf("status leaked secret field %s", k)
		}
	}
}

func TestRequestIDGenerated(t *testing.T) {
	h := testRouter(t)
	req := httptest.NewRequest(http.MethodGet, "/v1/status", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	rid := rr.Header().Get(middleware.RequestIDHeader)
	if rid == "" {
		t.Fatal("expected generated X-Request-ID")
	}
	var env presenters.Envelope
	if err := json.Unmarshal(rr.Body.Bytes(), &env); err != nil {
		t.Fatal(err)
	}
	if env.Meta.RequestID != rid {
		t.Fatalf("meta %q header %q", env.Meta.RequestID, rid)
	}
}

func TestNotFoundProblem(t *testing.T) {
	h := testRouter(t)
	req := httptest.NewRequest(http.MethodGet, "/v1/does-not-exist", nil)
	req.Header.Set(middleware.RequestIDHeader, "req_nf_01")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("status %d", rr.Code)
	}
	assertProblem(t, rr, "RESOURCE_NOT_FOUND", "req_nf_01")
}

func TestPanicRecoveryInternalError(t *testing.T) {
	// Mount a panic route via custom mux wrapping is hard; exercise Recovery directly
	// through a router that includes a temporary panic handler by using chi in test.
	// We inject via RateLimiter nil and a custom approach: call Recovery middleware alone.
	log := observability.NewSlogLogger("error", "test")
	ids := observability.NewULIDGenerator()
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		panic("boom-test")
	})
	h := middleware.Recovery(log)(middleware.RequestID(ids)(inner))
	req := httptest.NewRequest(http.MethodGet, "/panic", nil)
	req.Header.Set(middleware.RequestIDHeader, "req_panic_01")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("status %d body %s", rr.Code, rr.Body.String())
	}
	body := rr.Body.String()
	if strings.Contains(body, "boom-test") || strings.Contains(body, "stack") || strings.Contains(body, "goroutine") {
		t.Fatalf("leaked panic/stack to client: %s", body)
	}
	assertProblem(t, rr, "INTERNAL_ERROR", "req_panic_01")
}

func TestScaffoldEchoValidation(t *testing.T) {
	h := testRouter(t)

	// Missing content-type
	req := httptest.NewRequest(http.MethodPost, "/v1/_scaffold/echo", strings.NewReader(`{"message":"hi"}`))
	req.Header.Set(middleware.RequestIDHeader, "req_val_01")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status %d body %s", rr.Code, rr.Body.String())
	}
	assertProblem(t, rr, "VALIDATION_FAILED", "req_val_01")

	// Unknown field
	req2 := httptest.NewRequest(http.MethodPost, "/v1/_scaffold/echo", strings.NewReader(`{"message":"hi","extra":1}`))
	req2.Header.Set("Content-Type", "application/json")
	req2.Header.Set(middleware.RequestIDHeader, "req_val_02")
	rr2 := httptest.NewRecorder()
	h.ServeHTTP(rr2, req2)
	if rr2.Code != http.StatusBadRequest {
		t.Fatalf("status %d body %s", rr2.Code, rr2.Body.String())
	}
	assertProblem(t, rr2, "VALIDATION_FAILED", "req_val_02")

	// Success with money int64
	req3 := httptest.NewRequest(http.MethodPost, "/v1/_scaffold/echo", strings.NewReader(`{"message":"hi","amountIdr":10000}`))
	req3.Header.Set("Content-Type", "application/json")
	req3.Header.Set(middleware.RequestIDHeader, "req_ok_01")
	rr3 := httptest.NewRecorder()
	h.ServeHTTP(rr3, req3)
	if rr3.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rr3.Code, rr3.Body.String())
	}
	var env presenters.Envelope
	if err := json.Unmarshal(rr3.Body.Bytes(), &env); err != nil {
		t.Fatal(err)
	}
	if env.Meta.RequestID != "req_ok_01" {
		t.Fatalf("meta %q", env.Meta.RequestID)
	}
}

func TestScaffoldAbsentInProduction(t *testing.T) {
	h := testRouter(t, func(d *httpadapter.RouterDeps) {
		d.AppEnv = config.EnvProduction
	})
	req := httptest.NewRequest(http.MethodPost, "/v1/_scaffold/echo", strings.NewReader(`{"message":"hi"}`))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for scaffold in production, got %d", rr.Code)
	}
}

func TestRateLimit(t *testing.T) {
	lim := middleware.NewTokenBucketLimiter(2, 0.001) // capacity 2, almost no refill
	h := testRouter(t, func(d *httpadapter.RouterDeps) {
		d.RateLimiter = lim
	})
	// Drain tokens
	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodGet, "/v1/status", nil)
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("iter %d status %d", i, rr.Code)
		}
	}
	req := httptest.NewRequest(http.MethodGet, "/v1/status", nil)
	req.Header.Set(middleware.RequestIDHeader, "req_rl_01")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusTooManyRequests {
		t.Fatalf("status %d body %s", rr.Code, rr.Body.String())
	}
	assertProblem(t, rr, "RATE_LIMITED", "req_rl_01")
	if rr.Header().Get("Retry-After") == "" {
		t.Fatal("expected Retry-After")
	}
}

func TestCSRFStubWhenEnabled(t *testing.T) {
	h := testRouter(t, func(d *httpadapter.RouterDeps) {
		d.CSRFSoftDisable = false
		d.SessionCookieName = "fersaku_session"
	})
	// INT-130: stale/unresolved cookie does not enforce CSRF (no SessionMeta).
	// Anonymous recovery paths (login/logout/magic-link) must not be blocked.
	req := httptest.NewRequest(http.MethodPost, "/v1/_scaffold/echo", strings.NewReader(`{"message":"hi"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(middleware.RequestIDHeader, "req_csrf_01")
	req.AddCookie(&http.Cookie{Name: "fersaku_session", Value: "placeholder"})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("stale cookie should not CSRF-block scaffold: status %d body %s", rr.Code, rr.Body.String())
	}

	// No session cookie → CSRF not enforced; scaffold succeeds
	req3 := httptest.NewRequest(http.MethodPost, "/v1/_scaffold/echo", strings.NewReader(`{"message":"hi"}`))
	req3.Header.Set("Content-Type", "application/json")
	req3.Header.Set(middleware.RequestIDHeader, "req_csrf_03")
	rr3 := httptest.NewRecorder()
	h.ServeHTTP(rr3, req3)
	if rr3.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rr3.Code, rr3.Body.String())
	}
}

func assertProblem(t *testing.T, rr *httptest.ResponseRecorder, code, requestID string) {
	t.Helper()
	var pe presenters.ProblemEnvelope
	if err := json.Unmarshal(rr.Body.Bytes(), &pe); err != nil {
		t.Fatalf("json: %v body %s", err, rr.Body.String())
	}
	if pe.Problem.Code != code {
		t.Fatalf("code %q want %q body %s", pe.Problem.Code, code, rr.Body.String())
	}
	if pe.Problem.RequestID != requestID {
		t.Fatalf("problem.requestId %q want %q", pe.Problem.RequestID, requestID)
	}
	if got := rr.Header().Get(middleware.RequestIDHeader); got != requestID {
		t.Fatalf("header X-Request-ID %q want %q", got, requestID)
	}
	if pe.Problem.Message == "" {
		t.Fatal("empty message")
	}
}
