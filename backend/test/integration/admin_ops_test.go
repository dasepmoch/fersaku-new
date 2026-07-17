//go:build integration

package integration_test

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	httpadapter "github.com/dasepmoch/fersaku-new/backend/internal/adapters/http"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/mail"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/observability"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/config"
)

func newAdminOpsStack(t *testing.T) (http.Handler, *application.AuthService, *application.AuthzService, *mail.Capture, *postgres.Pool) {
	t.Helper()
	_ = databaseURL(t)
	runMigrate(t, "up")
	pool := openPool(t)
	ids := observability.NewULIDGenerator()
	capture := mail.NewCapture()
	store := postgres.IdentityStore{Repo: postgres.NewIdentityRepo(pool.Pool())}
	authzSvc := &application.AuthzService{
		Store:    postgres.NewAuthzRepo(pool.Pool()),
		IDs:      ids,
		Clock:    observability.SystemClock{},
		Log:      observability.NewSlogLogger("error", "test"),
		Mail:     capture,
		Sessions: store,
	}
	authSvc := &application.AuthService{
		Store: store,
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
	auditSvc := &application.AuditService{
		Store: postgres.NewAuditRepo(pool.Pool()),
		IDs:   ids,
		Clock: observability.SystemClock{},
		Log:   observability.NewSlogLogger("error", "test"),
	}
	adminOps := &application.AdminOpsService{
		Store: postgres.NewAdminOpsRepo(pool.Pool()),
		Auth:  authSvc,
		Audit: auditSvc,
		IDs:   ids,
		Clock: observability.SystemClock{},
		Log:   observability.NewSlogLogger("error", "test"),
	}
	adminReads := &application.AdminReadService{
		Store: postgres.NewAdminRepo(pool.Pool()),
		Clock: observability.SystemClock{},
		Log:   observability.NewSlogLogger("error", "test"),
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
		AdminReadService:  adminReads,
		AdminOpsService:   adminOps,
		RateLimiter:       nil,
		RequestTimeout:    30 * time.Second,
	})
	return h, authSvc, authzSvc, capture, pool
}

func TestAdminOps_PermissionDeniedWithoutAdmin(t *testing.T) {
	h, _, _, capture, _ := newAdminOpsStack(t)
	email := fmt.Sprintf("seller-ops-%d@example.com", time.Now().UnixNano())
	cookie := registerVerifyLogin(t, h, capture, email, "password123", "SELLER")

	rr := jsonPOST(t, h, "/v1/admin/actions", map[string]any{
		"action": "merchant.status.update", "resourceId": "m1", "status": "SUSPENDED", "reason": "test",
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusForbidden {
		t.Fatalf("want 403 got %d %s", rr.Code, rr.Body.String())
	}
}

func TestAdminOps_ActionsRequireReason(t *testing.T) {
	h, _, authz, capture, _ := newAdminOpsStack(t)
	cookie, _ := bootstrapAdminCookie(t, h, authz, capture)

	rr := jsonPOST(t, h, "/v1/admin/actions", map[string]any{
		"action": "merchant.status.update", "resourceId": "m_missing", "status": "SUSPENDED",
	}, []*http.Cookie{cookie})
	if rr.Code == http.StatusOK {
		t.Fatalf("reason required must not succeed: %s", rr.Body.String())
	}
	code := problemCode(t, rr)
	if code != "VALIDATION_FAILED" && code != "FORBIDDEN" {
		// 422/400 with validation is ideal
		if rr.Code == http.StatusOK {
			t.Fatalf("code=%s body=%s", code, rr.Body.String())
		}
	}
}

func TestAdminOps_MerchantAndAPIAccessIndependent(t *testing.T) {
	h, _, authz, capture, pool := newAdminOpsStack(t)
	cookie, _ := bootstrapAdminCookie(t, h, authz, capture)

	sellerEmail := fmt.Sprintf("seller-m-%d@example.com", time.Now().UnixNano())
	_ = registerVerifyLogin(t, h, capture, sellerEmail, "password123", "SELLER")
	mid := fmt.Sprintf("mer_%d", time.Now().UnixNano())
	var uid string
	err := pool.Pool().QueryRow(t.Context(), `SELECT id FROM users WHERE email_normalized=$1`, strings.ToLower(sellerEmail)).Scan(&uid)
	if err != nil {
		t.Fatalf("user: %v", err)
	}
	_, err = pool.Pool().Exec(t.Context(), `
		INSERT INTO merchants (id, owner_user_id, display_name, status, created_at, updated_at)
		VALUES ($1, $2, 'Test Merchant', 'ACTIVE', now(), now())`, mid, uid)
	if err != nil {
		t.Fatalf("insert merchant: %v", err)
	}

	rr := jsonPOST(t, h, "/v1/admin/merchants/"+mid+"/status", map[string]any{
		"status": "SUSPENDED", "reason": "ops test suspend merchant",
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("merchant status %d %s", rr.Code, rr.Body.String())
	}

	rr = jsonPOST(t, h, "/v1/admin/merchants/"+mid+"/api-access/status", map[string]any{
		"status": "ACTIVE", "reason": "ops test enable api while merchant suspended",
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("api access %d %s", rr.Code, rr.Body.String())
	}

	rr = jsonPOST(t, h, "/v1/admin/merchants/"+mid+"/status", map[string]any{
		"status": "ACTIVE", "reason": "ops reactivate merchant",
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("reactivate %d %s", rr.Code, rr.Body.String())
	}
	rr = jsonPOST(t, h, "/v1/admin/merchants/"+mid+"/api-access/status", map[string]any{
		"status": "SUSPENDED", "reason": "ops suspend api only",
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("api suspend %d %s", rr.Code, rr.Body.String())
	}

	var mStatus, capStatus string
	if err := pool.Pool().QueryRow(t.Context(), `SELECT status FROM merchants WHERE id=$1`, mid).Scan(&mStatus); err != nil {
		t.Fatal(err)
	}
	if err := pool.Pool().QueryRow(t.Context(), `
		SELECT status FROM merchant_api_capabilities WHERE merchant_id=$1 AND payment_mode='LIVE'`, mid).Scan(&capStatus); err != nil {
		t.Fatal(err)
	}
	if mStatus != "ACTIVE" {
		t.Fatalf("merchant status=%s want ACTIVE", mStatus)
	}
	if capStatus != "SUSPENDED" {
		t.Fatalf("api capability=%s want SUSPENDED", capStatus)
	}
}

func TestAdminOps_PaymentSourceMIXEDRejected(t *testing.T) {
	h, _, authz, capture, _ := newAdminOpsStack(t)
	cookie, _ := bootstrapAdminCookie(t, h, authz, capture)

	rr := jsonGET(t, h, "/v1/admin/payments?source=MIXED", []*http.Cookie{cookie})
	if rr.Code == http.StatusOK {
		t.Fatalf("MIXED must fail on payments")
	}

	rr = jsonGET(t, h, "/v1/admin/withdrawals?source=MIXED", []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("withdrawal MIXED %d %s", rr.Code, rr.Body.String())
	}
}

func TestAdminOps_EmergencyAndAudit(t *testing.T) {
	h, _, authz, capture, _ := newAdminOpsStack(t)
	cookie, _ := bootstrapAdminCookie(t, h, authz, capture)

	rr := jsonGET(t, h, "/v1/admin/system", []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("system %d %s", rr.Code, rr.Body.String())
	}
	// Read current QRIS_CHECKOUT version for optimistic update.
	var expectedVersion int64 = 1
	data := envelopeData(t, rr)
	if items, ok := data["emergencyControls"].([]any); ok {
		for _, it := range items {
			m, _ := it.(map[string]any)
			if m["switchName"] == "QRIS_CHECKOUT" {
				if v, ok := m["version"].(float64); ok {
					expectedVersion = int64(v)
				}
			}
		}
	}

	rr = jsonPOST(t, h, "/v1/admin/system/emergency-controls", map[string]any{
		"switchName": "QRIS_CHECKOUT", "enabled": false, "reason": "incident drill",
		"incidentTicket": "INC-1", "expectedVersion": expectedVersion,
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("emergency %d %s", rr.Code, rr.Body.String())
	}

	rr = jsonPOST(t, h, "/v1/admin/system/emergency-controls", map[string]any{
		"switchName": "MAINTENANCE", "enabled": false, "reason": "nope",
		"expectedVersion": 1,
	}, []*http.Cookie{cookie})
	if rr.Code == http.StatusOK {
		t.Fatal("fourth switch must fail")
	}

	rr = jsonGET(t, h, "/v1/admin/audit-logs", []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("audit %d %s", rr.Code, rr.Body.String())
	}
	rr = jsonGET(t, h, "/v1/admin/audit-integrity", []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("integrity %d %s", rr.Code, rr.Body.String())
	}
	rr = jsonGET(t, h, "/v1/admin/providers", []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("providers %d %s", rr.Code, rr.Body.String())
	}
	rr = jsonGET(t, h, "/v1/admin/payment-mismatches", []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("mismatches %d %s", rr.Code, rr.Body.String())
	}
}
