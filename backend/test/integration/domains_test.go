//go:build integration

package integration_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	dnsadapter "github.com/dasepmoch/fersaku-new/backend/internal/adapters/dns"
	edgeadapter "github.com/dasepmoch/fersaku-new/backend/internal/adapters/edge"
	httpadapter "github.com/dasepmoch/fersaku-new/backend/internal/adapters/http"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/mail"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/observability"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/config"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/domains"
)

func newDomainStack(t *testing.T) (
	http.Handler,
	*application.DomainService,
	*dnsadapter.Fake,
	*edgeadapter.Fake,
	*mail.Capture,
) {
	t.Helper()
	_ = databaseURL(t)
	runMigrate(t, "up")
	pool := openPool(t)
	ids := observability.NewULIDGenerator()
	capture := mail.NewCapture()
	dnsFake := dnsadapter.NewFake()
	edgeFake := edgeadapter.NewFake()
	authzSvc := &application.AuthzService{
		Store: postgres.NewAuthzRepo(pool.Pool()),
		IDs:   ids,
		Clock: observability.SystemClock{},
		Log:   observability.NewSlogLogger("error", "test"),
	}
	authSvc := &application.AuthService{
		Store: postgres.IdentityStore{Repo: postgres.NewIdentityRepo(pool.Pool())},
		IDs:   ids,
		Clock: observability.SystemClock{},
		Mail:  capture,
		Log:   observability.NewSlogLogger("error", "test"),
		Config: application.AuthConfig{
			SessionCookieName: "fersaku_session",
			TokenHashSecret:   "test-session-secret-not-for-prod",
		},
		Authz: authzSvc,
	}
	onboard := &application.OnboardingService{
		Store: postgres.NewOnboardingRepo(pool.Pool()),
		IDs:   ids,
		Clock: observability.SystemClock{},
		Log:   observability.NewSlogLogger("error", "test"),
	}
	domainSvc := &application.DomainService{
		Store:            postgres.NewDomainRepo(pool.Pool()),
		DNS:              dnsFake,
		Edge:             edgeFake,
		IDs:              ids,
		Clock:            observability.SystemClock{},
		Log:              observability.NewSlogLogger("error", "test"),
		TokenSecret:      "test-session-secret-not-for-prod",
		TakeoverCooldown: 50 * time.Millisecond,
	}
	h := httpadapter.NewRouterWith(httpadapter.RouterDeps{
		Log:               observability.NewSlogLogger("error", "test"),
		IDs:               ids,
		Service:           "fersaku-api",
		Version:           "0.0.0-test",
		AppEnv:            config.EnvTest,
		Ready:             func() bool { return true },
		StartedAt:         time.Now().UTC(),
		SessionCookieName: "fersaku_session",
		CSRFSoftDisable:   true,
		AuthService:       authSvc,
		AuthzService:      authzSvc,
		OnboardingService: onboard,
		DomainService:     domainSvc,
		RateLimiter:       nil,
		RequestTimeout:    30 * time.Second,
	})
	return h, domainSvc, dnsFake, edgeFake, capture
}

func createDomainHTTP(t *testing.T, h http.Handler, cookie *http.Cookie, storeID, hostname string) (domainID, token string, version int32) {
	t.Helper()
	rr := jsonPOST(t, h, "/v1/stores/"+storeID+"/domains", map[string]any{
		"hostname": hostname,
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusCreated {
		t.Fatalf("create domain %d %s", rr.Code, rr.Body.String())
	}
	var env struct {
		Data map[string]any `json:"data"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &env); err != nil {
		t.Fatal(err)
	}
	domainID, _ = env.Data["id"].(string)
	token, _ = env.Data["verificationToken"].(string)
	if domainID == "" || token == "" {
		t.Fatalf("missing id/token: %+v", env.Data)
	}
	if v, ok := env.Data["version"].(float64); ok {
		version = int32(v)
	}
	return domainID, token, version
}

func domainJSONDELETE(t *testing.T, h http.Handler, path string, cookies []*http.Cookie) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodDelete, path, nil)
	for _, c := range cookies {
		req.AddCookie(c)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func TestDomain_ConcurrentClaimSameHostname(t *testing.T) {
	h, _, _, _, capture := newDomainStack(t)
	cookieA, storeA, _ := onboardSellerStore(t, h, capture)
	cookieB, storeB, _ := onboardSellerStore(t, h, capture)

	host := fmt.Sprintf("race-%d.example.com", time.Now().UnixNano())
	type pair struct {
		cookie  *http.Cookie
		storeID string
	}
	pairs := []pair{{cookieA, storeA}, {cookieB, storeB}}
	var wg sync.WaitGroup
	var wins atomic.Int32
	var fails atomic.Int32
	for _, p := range pairs {
		wg.Add(1)
		go func(cookie *http.Cookie, storeID string) {
			defer wg.Done()
			rr := jsonPOST(t, h, "/v1/stores/"+storeID+"/domains", map[string]any{
				"hostname": host,
			}, []*http.Cookie{cookie})
			if rr.Code == http.StatusCreated {
				wins.Add(1)
			} else {
				fails.Add(1)
			}
		}(p.cookie, p.storeID)
	}
	wg.Wait()
	if wins.Load() != 1 || fails.Load() != 1 {
		t.Fatalf("expected exactly one winner: wins=%d fails=%d", wins.Load(), fails.Load())
	}
}

func TestDomain_StaleTokenCannotActivate(t *testing.T) {
	h, _, dnsFake, _, capture := newDomainStack(t)
	cookie, storeID, _ := onboardSellerStore(t, h, capture)
	host := fmt.Sprintf("stale-%d.example.com", time.Now().UnixNano())
	domainID, token, ver := createDomainHTTP(t, h, cookie, storeID, host)

	dnsFake.SetTXT(domains.ExpectedTXTName(host), token)
	rr := jsonPOST(t, h, "/v1/stores/"+storeID+"/domains/"+domainID+"/verify", map[string]any{
		"verificationToken": "fdv_stale_or_wrong_token_value",
		"expectedVersion":   ver,
	}, []*http.Cookie{cookie})
	if rr.Code == http.StatusOK {
		var env struct {
			Data map[string]any `json:"data"`
		}
		_ = json.Unmarshal(rr.Body.Bytes(), &env)
		if env.Data["status"] == domains.StatusActive {
			t.Fatal("stale token must not activate")
		}
	}
	rr = jsonGET(t, h, "/v1/public/host-resolve?host="+host, nil)
	if rr.Code == http.StatusOK {
		t.Fatalf("host should not resolve before active: %s", rr.Body.String())
	}
}

func TestDomain_HostResolvesOnlyActiveStore(t *testing.T) {
	h, _, dnsFake, edgeFake, capture := newDomainStack(t)
	cookie, storeID, slug := onboardSellerStore(t, h, capture)
	host := fmt.Sprintf("active-%d.example.com", time.Now().UnixNano())
	domainID, token, ver := createDomainHTTP(t, h, cookie, storeID, host)
	dnsFake.SetTXT(domains.ExpectedTXTName(host), token)

	rr := jsonPOST(t, h, "/v1/stores/"+storeID+"/domains/"+domainID+"/verify", map[string]any{
		"verificationToken": token,
		"expectedVersion":   ver,
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("verify %d %s", rr.Code, rr.Body.String())
	}
	var env struct {
		Data map[string]any `json:"data"`
	}
	_ = json.Unmarshal(rr.Body.Bytes(), &env)
	if env.Data["status"] != domains.StatusActive {
		t.Fatalf("want ACTIVE got %v", env.Data["status"])
	}
	if !edgeFake.IsPresent(host) {
		t.Fatal("edge routing should be present")
	}

	rr = jsonGET(t, h, "/v1/public/host-resolve?host="+host, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("resolve %d %s", rr.Code, rr.Body.String())
	}
	_ = json.Unmarshal(rr.Body.Bytes(), &env)
	if env.Data["storeId"] != storeID {
		t.Fatalf("storeId %v want %s", env.Data["storeId"], storeID)
	}
	if env.Data["slug"] != slug {
		t.Fatalf("slug %v want %s", env.Data["slug"], slug)
	}

	rr = jsonGET(t, h, "/v1/public/host-resolve?host=unknown-"+host, nil)
	if rr.Code == http.StatusOK {
		t.Fatal("unknown host must not resolve")
	}
}

func TestDomain_DeleteRemovesRoutingBeforeCooldownReuse(t *testing.T) {
	h, domainSvc, dnsFake, edgeFake, capture := newDomainStack(t)
	cookie, storeID, _ := onboardSellerStore(t, h, capture)
	host := fmt.Sprintf("del-%d.example.com", time.Now().UnixNano())
	domainID, token, ver := createDomainHTTP(t, h, cookie, storeID, host)
	dnsFake.SetTXT(domains.ExpectedTXTName(host), token)
	rr := jsonPOST(t, h, "/v1/stores/"+storeID+"/domains/"+domainID+"/verify", map[string]any{
		"verificationToken": token,
		"expectedVersion":   ver,
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("verify %d %s", rr.Code, rr.Body.String())
	}

	rr = domainJSONDELETE(t, h, "/v1/stores/"+storeID+"/domains/"+domainID, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("delete %d %s", rr.Code, rr.Body.String())
	}
	if edgeFake.IsPresent(host) {
		t.Fatal("edge routing must be removed before cooldown")
	}
	rr = jsonGET(t, h, "/v1/public/host-resolve?host="+host, nil)
	if rr.Code == http.StatusOK {
		t.Fatal("tombstoned host must not resolve")
	}
	rr = jsonPOST(t, h, "/v1/stores/"+storeID+"/domains", map[string]any{
		"hostname": host,
	}, []*http.Cookie{cookie})
	if rr.Code == http.StatusCreated {
		t.Fatal("must not reclaim during cooldown")
	}
	time.Sleep(80 * time.Millisecond)
	if _, err := domainSvc.RevalidateDue(context.Background(), 50); err != nil {
		t.Fatal(err)
	}
	rr = jsonPOST(t, h, "/v1/stores/"+storeID+"/domains", map[string]any{
		"hostname": host,
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusCreated {
		t.Fatalf("reclaim after cooldown %d %s", rr.Code, rr.Body.String())
	}
}

func TestDomain_InvalidHostnamesRejected(t *testing.T) {
	h, _, _, _, capture := newDomainStack(t)
	cookie, storeID, _ := onboardSellerStore(t, h, capture)
	bad := []string{
		"1.2.3.4",
		"*.example.com",
		"localhost",
		"com",
		"http://shop.example.com",
		"api.fersaku.com",
		"foo.local",
	}
	for _, host := range bad {
		rr := jsonPOST(t, h, "/v1/stores/"+storeID+"/domains", map[string]any{
			"hostname": host,
		}, []*http.Cookie{cookie})
		if rr.Code == http.StatusCreated {
			t.Fatalf("expected reject for %q got %d", host, rr.Code)
		}
	}
}

func TestDomain_HappyPathListAndRevalidate(t *testing.T) {
	h, domainSvc, dnsFake, _, capture := newDomainStack(t)
	cookie, storeID, _ := onboardSellerStore(t, h, capture)
	host := fmt.Sprintf("list-%d.example.com", time.Now().UnixNano())
	domainID, token, ver := createDomainHTTP(t, h, cookie, storeID, host)
	dnsFake.SetTXT(domains.ExpectedTXTName(host), token)
	rr := jsonPOST(t, h, "/v1/stores/"+storeID+"/domains/"+domainID+"/verify", map[string]any{
		"verificationToken": token,
		"expectedVersion":   ver,
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("verify %d %s", rr.Code, rr.Body.String())
	}
	rr = jsonGET(t, h, "/v1/stores/"+storeID+"/domains", []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("list %d %s", rr.Code, rr.Body.String())
	}
	if _, err := domainSvc.RevalidateDue(context.Background(), 50); err != nil {
		t.Fatal(err)
	}
	rr = jsonGET(t, h, "/v1/stores/"+storeID+"/domains/"+domainID, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatal(rr.Body.String())
	}
	var env struct {
		Data map[string]any `json:"data"`
	}
	_ = json.Unmarshal(rr.Body.Bytes(), &env)
	if env.Data["status"] != domains.StatusActive {
		t.Fatalf("want ACTIVE after revalidate, got %v", env.Data["status"])
	}
}

// keep bytes import used if needed for future body deletes
var _ = bytes.NewReader
