package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/middleware"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
)

func TestClassifyRoute(t *testing.T) {
	cases := []struct {
		path string
		want middleware.RouteClass
	}{
		{"/health/live", middleware.RouteClassHealth},
		{"/health/ready", middleware.RouteClassHealth},
		{"/metrics", middleware.RouteClassHealth},
		{"/v1/status", middleware.RouteClassPublic},
		{"/v1/public/stores/acme", middleware.RouteClassPublic},
		{"/v1/auth/login", middleware.RouteClassAuth},
		{"/v1/auth/register", middleware.RouteClassAuth},
		{"/v1/checkout/intents", middleware.RouteClassMutation},
		{"/v1/checkout/quote", middleware.RouteClassMutation},
		{"/v1/admin/overview", middleware.RouteClassAdmin},
		{"/v1/webhooks/duitku", middleware.RouteClassCallback},
		{"/v1/webhooks/xendit/live", middleware.RouteClassCallback},
		{"/v1/gateway/payment-intents", middleware.RouteClassGateway},
		{"/v1/me/profile", middleware.RouteClassDefault},
	}
	for _, tc := range cases {
		if got := middleware.ClassifyRoute(tc.path); got != tc.want {
			t.Fatalf("path %q: got %q want %q", tc.path, got, tc.want)
		}
	}
}

func TestMemoryClassLimiter_SeparateBudgets(t *testing.T) {
	lim := middleware.NewMemoryClassLimiter(map[middleware.RouteClass]middleware.ClassBudget{
		middleware.RouteClassAuth:   {Capacity: 2, Window: time.Minute, OnErrorDeny: true},
		middleware.RouteClassHealth: {Capacity: 2, Window: time.Minute, OnErrorDeny: false},
	})
	// Exhaust auth for ip A
	for i := 0; i < 2; i++ {
		ok, _, _, _ := lim.AllowClass(middleware.RouteClassAuth, "ip:1.1.1.1")
		if !ok {
			t.Fatalf("auth allow %d", i)
		}
	}
	ok, _, retry, _ := lim.AllowClass(middleware.RouteClassAuth, "ip:1.1.1.1")
	if ok || retry <= 0 {
		t.Fatal("expected auth deny with retry")
	}
	// Health for same IP still allowed
	okH, _, _, _ := lim.AllowClass(middleware.RouteClassHealth, "ip:1.1.1.1")
	if !okH {
		t.Fatal("health must not share auth bucket")
	}
	// Different IP independent
	ok2, _, _, _ := lim.AllowClass(middleware.RouteClassAuth, "ip:2.2.2.2")
	if !ok2 {
		t.Fatal("other IP independent")
	}
}

func TestRateLimitByClass_TwoClientsBehindLB(t *testing.T) {
	lim := middleware.NewMemoryClassLimiter(map[middleware.RouteClass]middleware.ClassBudget{
		middleware.RouteClassAuth: {Capacity: 1, Window: time.Minute, OnErrorDeny: true},
	})
	h := middleware.TrustedProxy(middleware.TrustedProxyConfig{
		TrustedProxies: []string{"10.0.0.0/8"},
	})(middleware.RateLimitByClass(lim, nil)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})))

	// Client A via LB
	reqA := httptest.NewRequest(http.MethodPost, "/v1/auth/login", nil)
	reqA.RemoteAddr = "10.0.0.1:443"
	reqA.Header.Set("X-Forwarded-For", "198.51.100.1")
	rrA := httptest.NewRecorder()
	h.ServeHTTP(rrA, reqA)
	if rrA.Code != http.StatusOK {
		t.Fatalf("client A first: %d", rrA.Code)
	}

	// Client B via same LB — must not share bucket
	reqB := httptest.NewRequest(http.MethodPost, "/v1/auth/login", nil)
	reqB.RemoteAddr = "10.0.0.1:443"
	reqB.Header.Set("X-Forwarded-For", "198.51.100.2")
	rrB := httptest.NewRecorder()
	h.ServeHTTP(rrB, reqB)
	if rrB.Code != http.StatusOK {
		t.Fatalf("client B must have own bucket, got %d", rrB.Code)
	}

	// Client A second request → 429
	reqA2 := httptest.NewRequest(http.MethodPost, "/v1/auth/login", nil)
	reqA2.RemoteAddr = "10.0.0.1:443"
	reqA2.Header.Set("X-Forwarded-For", "198.51.100.1")
	rrA2 := httptest.NewRecorder()
	h.ServeHTTP(rrA2, reqA2)
	if rrA2.Code != http.StatusTooManyRequests {
		t.Fatalf("client A second: %d", rrA2.Code)
	}
	if rrA2.Header().Get("Retry-After") == "" {
		t.Fatal("expected Retry-After")
	}
}

func TestRateLimitByClass_SpoofXFFDoesNotChangeIdentity(t *testing.T) {
	lim := middleware.NewMemoryClassLimiter(map[middleware.RouteClass]middleware.ClassBudget{
		middleware.RouteClassAuth: {Capacity: 1, Window: time.Minute, OnErrorDeny: true},
	})
	h := middleware.TrustedProxy(middleware.TrustedProxyConfig{
		TrustedProxies: []string{"10.0.0.0/8"},
	})(middleware.RateLimitByClass(lim, nil)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})))

	// Untrusted peer spoofs XFF — identity is peer IP
	req1 := httptest.NewRequest(http.MethodPost, "/v1/auth/login", nil)
	req1.RemoteAddr = "203.0.113.50:1"
	req1.Header.Set("X-Forwarded-For", "1.1.1.1")
	rr1 := httptest.NewRecorder()
	h.ServeHTTP(rr1, req1)
	if rr1.Code != http.StatusOK {
		t.Fatalf("first: %d", rr1.Code)
	}

	req2 := httptest.NewRequest(http.MethodPost, "/v1/auth/login", nil)
	req2.RemoteAddr = "203.0.113.50:1"
	req2.Header.Set("X-Forwarded-For", "8.8.8.8") // different spoof, same peer
	rr2 := httptest.NewRecorder()
	h.ServeHTTP(rr2, req2)
	if rr2.Code != http.StatusTooManyRequests {
		t.Fatalf("spoof must not change identity: %d", rr2.Code)
	}
}

func TestRateLimitByClass_HealthNotLockedByAuthStorm(t *testing.T) {
	lim := middleware.NewMemoryClassLimiter(map[middleware.RouteClass]middleware.ClassBudget{
		middleware.RouteClassAuth:   {Capacity: 1, Window: time.Minute, OnErrorDeny: true},
		middleware.RouteClassHealth: {Capacity: 10, Window: time.Minute, OnErrorDeny: false},
	})
	h := middleware.RateLimitByClass(lim, nil)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Exhaust auth
	reqAuth := httptest.NewRequest(http.MethodPost, "/v1/auth/login", nil)
	reqAuth = reqAuth.WithContext(reqctx.WithClientIP(reqAuth.Context(), "9.9.9.9"))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, reqAuth)
	rr2 := httptest.NewRecorder()
	h.ServeHTTP(rr2, reqAuth)
	if rr2.Code != http.StatusTooManyRequests {
		t.Fatalf("auth storm expect 429, got %d", rr2.Code)
	}

	reqH := httptest.NewRequest(http.MethodGet, "/health/ready", nil)
	reqH = reqH.WithContext(reqctx.WithClientIP(reqH.Context(), "9.9.9.9"))
	rrH := httptest.NewRecorder()
	h.ServeHTTP(rrH, reqH)
	if rrH.Code != http.StatusOK {
		t.Fatalf("health locked by auth: %d", rrH.Code)
	}
}

func TestBoundIdentity_NoPII(t *testing.T) {
	a := middleware.BoundIdentity("ip:1.2.3.4|sub:user_abc")
	b := middleware.BoundIdentity("ip:1.2.3.4|sub:user_abc")
	if a != b || a == "" || a == "ip:1.2.3.4|sub:user_abc" {
		t.Fatalf("bound=%q", a)
	}
	if len(a) > 20 {
		t.Fatalf("too long: %q", a)
	}
}

func TestRateLimitByClass_CallbackSeparateFromPublic(t *testing.T) {
	lim := middleware.NewMemoryClassLimiter(map[middleware.RouteClass]middleware.ClassBudget{
		middleware.RouteClassCallback: {Capacity: 2, Window: time.Minute, OnErrorDeny: true},
		middleware.RouteClassPublic:   {Capacity: 1, Window: time.Minute, OnErrorDeny: true},
	})
	// Exhaust public
	ok, _, _, _ := lim.AllowClass(middleware.RouteClassPublic, "ip:5.5.5.5")
	if !ok {
		t.Fatal("public first")
	}
	ok, _, _, _ = lim.AllowClass(middleware.RouteClassPublic, "ip:5.5.5.5")
	if ok {
		t.Fatal("public second should deny")
	}
	// Callback still has budget
	ok, _, _, _ = lim.AllowClass(middleware.RouteClassCallback, "ip:5.5.5.5")
	if !ok {
		t.Fatal("callback must not share public bucket")
	}
}
