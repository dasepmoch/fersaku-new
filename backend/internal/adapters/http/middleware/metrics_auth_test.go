package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/middleware"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
)

func TestMetricsAccessOpen(t *testing.T) {
	h := middleware.MetricsAccess(middleware.MetricsAccessConfig{Open: true}, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	if rr.Code != 200 {
		t.Fatalf("status %d", rr.Code)
	}
}

func TestMetricsAccessBearer(t *testing.T) {
	h := middleware.MetricsAccess(middleware.MetricsAccessConfig{BearerToken: "secret-scrape"}, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("want 401 got %d", rr.Code)
	}
	rr2 := httptest.NewRecorder()
	req2 := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	req2.Header.Set("Authorization", "Bearer secret-scrape")
	h.ServeHTTP(rr2, req2)
	if rr2.Code != 200 {
		t.Fatalf("want 200 got %d body %s", rr2.Code, rr2.Body.String())
	}
}

func TestMetricsAccessCIDR(t *testing.T) {
	nets, err := middleware.ParseCIDRList("127.0.0.1/32,10.0.0.0/8")
	if err != nil {
		t.Fatal(err)
	}
	h := middleware.MetricsAccess(middleware.MetricsAccessConfig{AllowCIDRs: nets}, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	// Denied remote
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	req.RemoteAddr = "203.0.113.9:1234"
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("want 403 got %d", rr.Code)
	}
	// Allowed
	rr2 := httptest.NewRecorder()
	req2 := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	req2.RemoteAddr = "10.1.2.3:9999"
	req2 = req2.WithContext(reqctx.WithClientIP(req2.Context(), "10.1.2.3"))
	h.ServeHTTP(rr2, req2)
	if rr2.Code != 200 {
		t.Fatalf("want 200 got %d", rr2.Code)
	}
}

func TestMetricsAccessFailClosed(t *testing.T) {
	h := middleware.MetricsAccess(middleware.MetricsAccessConfig{}, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	if rr.Code != http.StatusForbidden {
		t.Fatalf("want 403 got %d", rr.Code)
	}
}
