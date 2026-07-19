package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/middleware"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
)

func TestTrustedProxy_DirectClientIgnoresXFF(t *testing.T) {
	h := middleware.TrustedProxy(middleware.TrustedProxyConfig{})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := reqctx.ClientIP(r.Context()); got != "203.0.113.10" {
			t.Fatalf("client_ip=%q", got)
		}
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "203.0.113.10:54321"
	req.Header.Set("X-Forwarded-For", "198.51.100.1")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
}

func TestTrustedProxy_TrustedLBUsesLeftmostXFF(t *testing.T) {
	h := middleware.TrustedProxy(middleware.TrustedProxyConfig{
		TrustedProxies: []string{"10.0.0.0/8"},
	})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := reqctx.ClientIP(r.Context()); got != "198.51.100.7" {
			t.Fatalf("client_ip=%q", got)
		}
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.5:443"
	req.Header.Set("X-Forwarded-For", "198.51.100.7, 10.0.0.5")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
}

func TestTrustedProxy_SpoofedXFFFromUntrustedPeer(t *testing.T) {
	h := middleware.TrustedProxy(middleware.TrustedProxyConfig{
		TrustedProxies: []string{"10.0.0.0/8"},
	})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Peer is attacker IP; XFF must be ignored.
		if got := reqctx.ClientIP(r.Context()); got != "203.0.113.99" {
			t.Fatalf("client_ip=%q want peer RemoteAddr", got)
		}
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "203.0.113.99:12345"
	req.Header.Set("X-Forwarded-For", "1.2.3.4")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
}

func TestTrustedProxy_MultiHopXFF(t *testing.T) {
	h := middleware.TrustedProxy(middleware.TrustedProxyConfig{
		TrustedProxies: []string{"10.0.0.0/8"},
	})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := reqctx.ClientIP(r.Context()); got != "198.51.100.1" {
			t.Fatalf("client_ip=%q", got)
		}
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.1.2.3:8443"
	req.Header.Set("X-Forwarded-For", "198.51.100.1, 10.0.0.9, 10.1.2.3")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
}

func TestTrustedProxy_IPv6Trusted(t *testing.T) {
	h := middleware.TrustedProxy(middleware.TrustedProxyConfig{
		TrustedProxies: []string{"2001:db8::/32"},
	})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := reqctx.ClientIP(r.Context()); got != "2001:db8:1::2" {
			t.Fatalf("client_ip=%q", got)
		}
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "[2001:db8::1]:443"
	req.Header.Set("X-Forwarded-For", "2001:db8:1::2")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
}

func TestTrustedProxy_IPv6Direct(t *testing.T) {
	h := middleware.TrustedProxy(middleware.TrustedProxyConfig{})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := reqctx.ClientIP(r.Context()); got != "2001:db8::99" {
			t.Fatalf("client_ip=%q", got)
		}
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "[2001:db8::99]:9999"
	req.Header.Set("X-Forwarded-For", "2001:db8::1")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
}

func TestTrustedProxy_MalformedRemoteAddr(t *testing.T) {
	h := middleware.TrustedProxy(middleware.TrustedProxyConfig{
		TrustedProxies: []string{"10.0.0.0/8"},
	})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Unparseable host → returned as-is; XFF not trusted.
		if got := reqctx.ClientIP(r.Context()); got != "not-an-ip" {
			t.Fatalf("client_ip=%q", got)
		}
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "not-an-ip"
	req.Header.Set("X-Forwarded-For", "1.2.3.4")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
}

func TestTrustedProxy_XRealIPWhenTrusted(t *testing.T) {
	h := middleware.TrustedProxy(middleware.TrustedProxyConfig{
		TrustedProxies: []string{"127.0.0.1/32"},
	})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := reqctx.ClientIP(r.Context()); got != "198.51.100.50" {
			t.Fatalf("client_ip=%q", got)
		}
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "127.0.0.1:1"
	req.Header.Set("X-Real-IP", "198.51.100.50")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
}

func TestTrustedProxy_SingleIPAsCIDR(t *testing.T) {
	h := middleware.TrustedProxy(middleware.TrustedProxyConfig{
		TrustedProxies: []string{"192.0.2.1"},
	})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := reqctx.ClientIP(r.Context()); got != "203.0.113.1" {
			t.Fatalf("client_ip=%q", got)
		}
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "192.0.2.1:80"
	req.Header.Set("X-Forwarded-For", "203.0.113.1")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
}
