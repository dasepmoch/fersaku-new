//go:build integration

package integration_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	httpadapter "github.com/dasepmoch/fersaku-new/backend/internal/adapters/http"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/mail"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/observability"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/config"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/webhooks"
	"github.com/dasepmoch/fersaku-new/backend/internal/jobs"
)

type captureRT struct {
	status  int
	bodies  [][]byte
	headers []http.Header
	urls    []string
}

func (c *captureRT) RoundTrip(req *http.Request) (*http.Response, error) {
	b, _ := io.ReadAll(req.Body)
	_ = req.Body.Close()
	c.bodies = append(c.bodies, b)
	h := req.Header.Clone()
	c.headers = append(c.headers, h)
	c.urls = append(c.urls, req.URL.String())
	st := c.status
	if st == 0 {
		st = 200
	}
	return &http.Response{
		StatusCode: st,
		Body:       io.NopCloser(bytes.NewReader([]byte(`{"ok":true}`))),
		Header:     make(http.Header),
		Request:    req,
	}, nil
}

func newWebhookStack(t *testing.T) (
	http.Handler,
	*application.WebhookService,
	*mail.Capture,
	*captureRT,
) {
	t.Helper()
	_ = databaseURL(t)
	runMigrate(t, "up")
	pool := openPool(t)
	ids := observability.NewULIDGenerator()
	capture := mail.NewCapture()
	rt := &captureRT{status: 200}
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
	whSvc := &application.WebhookService{
		Store:           postgres.NewWebhookRepo(pool.Pool()),
		Auth:            authSvc,
		IDs:             ids,
		Clock:           observability.SystemClock{},
		Log:             observability.NewSlogLogger("error", "test"),
		EncryptionKey:   "test-kyc-encryption-key-32bytes!!",
		ClaimHashSecret: "test-session-secret-not-for-prod",
		// Skip DNS for public hostnames in CI; private IP still rejected by ValidateHTTPSURL.
		SkipDNS: true,
		HTTPClient: &http.Client{
			Transport: rt,
			Timeout:   5 * time.Second,
		},
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
		WebhookService:    whSvc,
		RateLimiter:       nil,
		RequestTimeout:    30 * time.Second,
	})
	return h, whSvc, capture, rt
}

func whJSON(t *testing.T, h http.Handler, method, path string, cookie *http.Cookie, body any) *httptest.ResponseRecorder {
	t.Helper()
	var rdr io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rdr = bytes.NewReader(b)
	}
	req := httptest.NewRequest(method, path, rdr)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if cookie != nil {
		req.AddCookie(cookie)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func TestWebhooks_PrivateNetworkTargetRejected(t *testing.T) {
	h, _, capture, _ := newWebhookStack(t)
	sellerCookie, storeID, _ := onboardSellerStore(t, h, capture)

	for _, u := range []string{
		"https://127.0.0.1/hook",
		"https://10.0.0.5/cb",
		"https://192.168.1.10/w",
		"https://169.254.169.254/latest/meta-data",
		"https://localhost/hook",
		"http://hooks.example.com/x",
	} {
		rr := whJSON(t, h, http.MethodPost, "/v1/stores/"+storeID+"/webhooks", sellerCookie, map[string]any{
			"url":         u,
			"paymentMode": "SANDBOX",
		})
		if rr.Code == http.StatusCreated {
			t.Fatalf("expected reject for %s got %d %s", u, rr.Code, rr.Body.String())
		}
		if rr.Code != http.StatusBadRequest && rr.Code != http.StatusUnprocessableEntity {
			// Validation maps to 400 typically
			if rr.Code < 400 || rr.Code >= 500 {
				t.Fatalf("unexpected status for %s: %d %s", u, rr.Code, rr.Body.String())
			}
		}
	}
}

func TestWebhooks_RetryPreservesEventAndSignatureSemantics(t *testing.T) {
	h, whSvc, capture, rt := newWebhookStack(t)
	sellerCookie, storeID, _ := onboardSellerStore(t, h, capture)

	// Create endpoint (public hostname, SkipDNS)
	rr := whJSON(t, h, http.MethodPost, "/v1/stores/"+storeID+"/webhooks", sellerCookie, map[string]any{
		"url":            "https://hooks.merchant.example/fsk",
		"paymentMode":    "SANDBOX",
		"eventAllowlist": []string{"payment.paid", "webhook.test"},
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("create %d %s", rr.Code, rr.Body.String())
	}
	var env map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &env)
	data := env["data"].(map[string]any)
	claimTok := data["claimToken"].(string)
	ep := data["endpoint"].(map[string]any)
	epID := ep["id"].(string)

	// Claim secret → ACTIVE
	rrClaim := whJSON(t, h, http.MethodPost,
		"/v1/stores/"+storeID+"/webhooks/"+epID+"/secret-claims/x/exchange",
		sellerCookie, map[string]any{"token": claimTok})
	if rrClaim.Code != http.StatusOK {
		t.Fatalf("claim %d %s", rrClaim.Code, rrClaim.Body.String())
	}
	var envC map[string]any
	_ = json.Unmarshal(rrClaim.Body.Bytes(), &envC)
	rawSecret := envC["data"].(map[string]any)["signingSecret"].(string)
	if !strings.HasPrefix(rawSecret, "whsec_") {
		t.Fatalf("secret prefix: %s", rawSecret)
	}

	// First attempt fails → retry
	rt.status = 500
	rrTest := whJSON(t, h, http.MethodPost, "/v1/stores/"+storeID+"/webhooks/"+epID+"/test", sellerCookie, map[string]any{})
	if rrTest.Code != http.StatusAccepted {
		t.Fatalf("test event %d %s", rrTest.Code, rrTest.Body.String())
	}
	var envT map[string]any
	_ = json.Unmarshal(rrTest.Body.Bytes(), &envT)
	deliveryID := envT["data"].(map[string]any)["deliveryId"].(string)
	eventID := envT["data"].(map[string]any)["eventId"].(string)
	payloadHash := envT["data"].(map[string]any)["payloadHash"].(string)

	// Process first attempt (500)
	if err := whSvc.ProcessDelivery(t.Context(), deliveryID); err != nil {
		t.Fatalf("process1: %v", err)
	}
	if len(rt.bodies) != 1 {
		t.Fatalf("expected 1 attempt body, got %d", len(rt.bodies))
	}
	body1 := append([]byte(nil), rt.bodies[0]...)
	sig1 := rt.headers[0].Get(webhooks.HeaderSignature)
	ts1 := rt.headers[0].Get(webhooks.HeaderTimestamp)
	eid1 := rt.headers[0].Get(webhooks.HeaderEventID)
	if eid1 != eventID {
		t.Fatalf("event id header %s want %s", eid1, eventID)
	}
	// Verify signature matches body+event+ts
	want1 := webhooks.SignPayload(rawSecret, mustUnix(ts1), eventID, body1)
	if sig1 != want1 {
		t.Fatalf("sig mismatch attempt1")
	}

	// Retry: same body/event, fresh timestamp/signature
	time.Sleep(1100 * time.Millisecond) // ensure unix second changes
	rt.status = 200
	if err := whSvc.ProcessDelivery(t.Context(), deliveryID); err != nil {
		t.Fatalf("process2: %v", err)
	}
	if len(rt.bodies) != 2 {
		t.Fatalf("expected 2 attempt bodies, got %d", len(rt.bodies))
	}
	body2 := rt.bodies[1]
	if !bytes.Equal(body1, body2) {
		t.Fatal("retry must preserve exact payload body")
	}
	if rt.headers[1].Get(webhooks.HeaderEventID) != eventID {
		t.Fatal("retry must preserve event id")
	}
	sig2 := rt.headers[1].Get(webhooks.HeaderSignature)
	ts2 := rt.headers[1].Get(webhooks.HeaderTimestamp)
	if ts2 == ts1 {
		t.Fatal("retry must use fresh timestamp")
	}
	if sig2 == sig1 {
		t.Fatal("retry must use fresh signature")
	}
	want2 := webhooks.SignPayload(rawSecret, mustUnix(ts2), eventID, body2)
	if sig2 != want2 {
		t.Fatalf("sig mismatch attempt2")
	}
	// payload hash on delivery row unchanged
	pool := openPool(t)
	var hashDB, status string
	_ = pool.Pool().QueryRow(t.Context(),
		`SELECT payload_hash, status FROM webhook_deliveries WHERE id=$1`, deliveryID).Scan(&hashDB, &status)
	if hashDB != payloadHash {
		t.Fatal("payload hash must be immutable")
	}
	if status != webhooks.DeliveryDelivered {
		t.Fatalf("status %s", status)
	}

	// Worker path also processes outbox
	w := &jobs.WebhookWorker{Pool: pool.Pool(), Svc: whSvc, Log: observability.NewSlogLogger("error", "test")}
	_, _ = w.ProcessReady(t.Context(), 10)
}

func TestWebhooks_InboundProviderIDsRejectedOnOutboundAdmin(t *testing.T) {
	h, whSvc, capture, _ := newWebhookStack(t)
	// Bootstrap admin with seller_webhook_deliveries.retry
	sellerCookie, storeID, _ := onboardSellerStore(t, h, capture)
	// Create+claim endpoint so we have a real delivery id too
	rr := whJSON(t, h, http.MethodPost, "/v1/stores/"+storeID+"/webhooks", sellerCookie, map[string]any{
		"url": "https://hooks.merchant.example/fsk", "paymentMode": "SANDBOX",
	})
	var env map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &env)
	data := env["data"].(map[string]any)
	claimTok := data["claimToken"].(string)
	epID := data["endpoint"].(map[string]any)["id"].(string)
	_ = whJSON(t, h, http.MethodPost, "/v1/stores/"+storeID+"/webhooks/"+epID+"/secret-claims/x/exchange",
		sellerCookie, map[string]any{"token": claimTok})

	// Direct service rejects provider-shaped IDs
	for _, bad := range []string{"ppe_abc123", "pcb_xyz", "xendit_evt_1", "provider_cb_9"} {
		_, err := whSvc.GetAdminDelivery(t.Context(), bad)
		if err == nil {
			t.Fatalf("expected reject for %s", bad)
		}
		_, err = whSvc.AdminRetry(t.Context(), bad, "admin", "test")
		if err == nil {
			t.Fatalf("expected retry reject for %s", bad)
		}
	}

	// Seed SUPER_ADMIN for HTTP admin path
	pool := openPool(t)
	var userID string
	_ = pool.Pool().QueryRow(t.Context(), `
		SELECT u.id FROM users u
		JOIN merchant_members mm ON mm.user_id = u.id
		JOIN stores s ON s.merchant_id = mm.merchant_id
		WHERE s.id = $1 LIMIT 1`, storeID).Scan(&userID)
	_, _ = pool.Pool().Exec(t.Context(), `
		INSERT INTO user_roles (user_id, role_id, created_at)
		VALUES ($1, 'role_super_admin', now())
		ON CONFLICT DO NOTHING`, userID)

	// Re-login to refresh permissions on session
	// Principal permissions may be cached at login — use service path for certainty above.
	// HTTP retry with bad id should 404
	rrBad := whJSON(t, h, http.MethodPost, "/v1/admin/seller-webhook-deliveries/ppe_inbound_id/retry",
		sellerCookie, map[string]any{"reason": "nope"})
	if rrBad.Code == http.StatusOK {
		t.Fatalf("inbound id must not succeed on outbound retry: %d %s", rrBad.Code, rrBad.Body.String())
	}
}

func mustUnix(s string) int64 {
	var n int64
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0
		}
		n = n*10 + int64(c-'0')
	}
	return n
}
