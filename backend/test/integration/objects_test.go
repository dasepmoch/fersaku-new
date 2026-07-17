//go:build integration

package integration_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	httpadapter "github.com/dasepmoch/fersaku-new/backend/internal/adapters/http"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/mail"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/observability"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/r2"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/config"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

func newObjectsStack(t *testing.T, store ports.ObjectStore) (http.Handler, *application.ObjectService, *mail.Capture, *postgres.Pool) {
	t.Helper()
	_ = databaseURL(t)
	runMigrate(t, "up")
	pool := openPool(t)
	ids := observability.NewULIDGenerator()
	capture := mail.NewCapture()
	log := observability.NewSlogLogger("error", "test")
	clock := observability.SystemClock{}
	authzSvc := &application.AuthzService{
		Store: postgres.NewAuthzRepo(pool.Pool()),
		IDs:   ids,
		Clock: clock,
		Log:   log,
	}
	authSvc := &application.AuthService{
		Store: postgres.IdentityStore{Repo: postgres.NewIdentityRepo(pool.Pool())},
		IDs:   ids,
		Clock: clock,
		Mail:  capture,
		Log:   log,
		Config: application.AuthConfig{
			SessionCookieName: "fersaku_session",
			TokenHashSecret:   "test-session-secret-not-for-prod",
		},
		Authz: authzSvc,
	}
	onboard := &application.OnboardingService{
		Store: postgres.NewOnboardingRepo(pool.Pool()),
		IDs:   ids,
		Clock: clock,
		Log:   log,
	}
	if store == nil {
		store = r2.NewFake()
	}
	objSvc := &application.ObjectService{
		Store:         postgres.NewObjectRepo(pool.Pool()),
		Objects:       store,
		IDs:           ids,
		Clock:         clock,
		Log:           log,
		BucketPublic:  envOr("R2_BUCKET_PUBLIC", "fersaku-public"),
		BucketPrivate: envOr("R2_BUCKET_PRIVATE", "fersaku-private"),
		LocalScanPass: true,
	}
	h := httpadapter.NewRouterWith(httpadapter.RouterDeps{
		Log:               log,
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
		ObjectService:     objSvc,
		RateLimiter:       nil,
		RequestTimeout:    15 * time.Second,
	})
	return h, objSvc, capture, pool
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func sha256Hex(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func TestObjects_CrossTenantDenied(t *testing.T) {
	h, _, capture, _ := newObjectsStack(t, r2.NewFake())
	cookieA, storeA, _ := onboardSellerStore(t, h, capture)
	emailB := fmt.Sprintf("obj-b-%d@example.com", time.Now().UnixNano())
	cookieB := registerVerifyLogin(t, h, capture, emailB, "password123", "SELLER")
	slugB := fmt.Sprintf("objb-%d", time.Now().UnixNano()%1_000_000)
	rr := jsonPOST(t, h, "/v1/onboarding/store", map[string]any{
		"name": "Other Shop",
		"bio":  "Other merchant store for cross-tenant object isolation tests.",
		"slug": slugB,
	}, []*http.Cookie{cookieB})
	if rr.Code != http.StatusOK {
		t.Fatalf("onboard b %d %s", rr.Code, rr.Body.String())
	}
	storeB, _ := envelopeData(t, rr)["storeId"].(string)

	body := []byte("secret-product")
	rr = jsonPOST(t, h, "/v1/stores/"+storeA+"/objects/uploads", map[string]any{
		"purpose":     "PRODUCT_FILE",
		"contentType": "application/zip",
		"sizeBytes":   len(body),
	}, []*http.Cookie{cookieA})
	if rr.Code != http.StatusCreated {
		t.Fatalf("create upload %d %s", rr.Code, rr.Body.String())
	}
	data := envelopeData(t, rr)
	obj, _ := data["object"].(map[string]any)
	objectID, _ := obj["id"].(string)

	// B cannot complete or read under storeB
	rr = jsonPOST(t, h, "/v1/stores/"+storeB+"/objects/"+objectID+"/complete", map[string]any{
		"checksumSha256": sha256Hex(body),
	}, []*http.Cookie{cookieB})
	if rr.Code != http.StatusNotFound {
		t.Fatalf("cross-tenant complete want 404 got %d %s", rr.Code, rr.Body.String())
	}
	req := httptest.NewRequest(http.MethodGet, "/v1/stores/"+storeB+"/objects/"+objectID, nil)
	req.AddCookie(cookieB)
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("cross-tenant get want 404 got %d %s", rr.Code, rr.Body.String())
	}
}

func TestObjects_IncompleteAndChecksum(t *testing.T) {
	fake := r2.NewFake()
	h, svc, capture, _ := newObjectsStack(t, fake)
	cookie, storeID, _ := onboardSellerStore(t, h, capture)
	body := []byte("payload")

	rr := jsonPOST(t, h, "/v1/stores/"+storeID+"/objects/uploads", map[string]any{
		"purpose":     "PRODUCT_FILE",
		"contentType": "application/zip",
		"sizeBytes":   len(body),
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusCreated {
		t.Fatalf("upload intent %d %s", rr.Code, rr.Body.String())
	}
	data := envelopeData(t, rr)
	obj, _ := data["object"].(map[string]any)
	objectID, _ := obj["id"].(string)
	// no put → incomplete
	rr = jsonPOST(t, h, "/v1/stores/"+storeID+"/objects/"+objectID+"/complete", map[string]any{
		"checksumSha256": sha256Hex(body),
	}, []*http.Cookie{cookie})
	if rr.Code == http.StatusOK {
		t.Fatalf("incomplete should not READY: %s", rr.Body.String())
	}

	// new intent with put + wrong checksum
	rr = jsonPOST(t, h, "/v1/stores/"+storeID+"/objects/uploads", map[string]any{
		"purpose":                "PRODUCT_FILE",
		"contentType":            "application/zip",
		"sizeBytes":              len(body),
		"expectedChecksumSha256": sha256Hex(body),
	}, []*http.Cookie{cookie})
	if rr.Code != http.StatusCreated {
		t.Fatalf("upload2 %d %s", rr.Code, rr.Body.String())
	}
	data = envelopeData(t, rr)
	obj, _ = data["object"].(map[string]any)
	objectID, _ = obj["id"].(string)
	// put via service store keys — load metadata from DB via svc for key
	meta, err := svc.GetObjectMetadata(context.Background(), principalUserID(t, h, cookie), storeID, objectID)
	if err != nil {
		// use complete path with fake put needing key — GetObjectMetadata needs user; use cookie session
		t.Log("metadata via principal may fail if subject mismatch; putting via list from fake after create")
	}
	// Re-create using application layer for controlled put
	_ = meta
	// Use fake put with key from create response omitted — re-fetch via complete after Put using known prefix is hard.
	// Call CreateUploadIntent through service again with known user from onboarding:
	// Instead: put all objects that fake doesn't have — complete will HEAD.
	// Get object_key from postgres:
	// Simpler: use ObjectService directly for this unit-integration hybrid.
	userID := principalUserID(t, h, cookie)
	res, err := svc.CreateUploadIntent(context.Background(), userID, storeID, application.CreateUploadInput{
		Purpose: "PRODUCT_FILE", ContentType: "application/zip", SizeBytes: int64(len(body)),
		ExpectedChecksumSHA256: sha256Hex(body),
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := fake.PutObjectBytes(context.Background(), res.Object.Bucket, res.Object.ObjectKey, "application/zip", body); err != nil {
		t.Fatal(err)
	}
	_, err = svc.CompleteUpload(context.Background(), userID, storeID, res.Object.ID, sha256Hex([]byte("wrong!")))
	if err == nil {
		t.Fatal("checksum mismatch expected")
	}
}

func principalUserID(t *testing.T, h http.Handler, cookie *http.Cookie) string {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/v1/auth/session", nil)
	req.AddCookie(cookie)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("session %d %s", rr.Code, rr.Body.String())
	}
	data := envelopeData(t, rr)
	if id, ok := data["userId"].(string); ok && id != "" {
		return id
	}
	b, _ := json.Marshal(data)
	t.Fatalf("cannot find userId in session: %s", b)
	return ""
}

func TestObjects_PresignCompleteHappy_MinIO(t *testing.T) {
	endpoint := envOr("R2_ENDPOINT", "http://127.0.0.1:9000")
	access := envOr("R2_ACCESS_KEY_ID", "minioadmin")
	secret := envOr("R2_SECRET_ACCESS_KEY", "minioadmin")
	client, err := r2.NewClient(r2.Config{
		Endpoint:        endpoint,
		Region:          "auto",
		AccessKeyID:     access,
		SecretAccessKey: secret,
		ForcePathStyle:  true,
	})
	if err != nil {
		t.Skipf("minio client: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pub := envOr("R2_BUCKET_PUBLIC", "fersaku-public")
	priv := envOr("R2_BUCKET_PRIVATE", "fersaku-private")
	if err := r2.EnsureBuckets(ctx, client, pub, priv); err != nil {
		t.Skipf("minio buckets: %v", err)
	}
	// probe
	if err := client.PutObjectBytes(ctx, priv, "be220-probe/"+fmt.Sprint(time.Now().UnixNano()), "text/plain", []byte("ok")); err != nil {
		t.Skipf("minio put probe: %v", err)
	}

	h, svc, capture, _ := newObjectsStack(t, client)
	cookie, storeID, _ := onboardSellerStore(t, h, capture)
	userID := principalUserID(t, h, cookie)
	body := []byte("minio-happy-path-bytes")
	res, err := svc.CreateUploadIntent(context.Background(), userID, storeID, application.CreateUploadInput{
		Purpose: "PRODUCT_FILE", ContentType: "application/zip", SizeBytes: int64(len(body)),
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.UploadURL == "" {
		t.Fatal("empty presign")
	}
	// Upload via presigned PUT
	req, err := http.NewRequest(http.MethodPut, res.UploadURL, bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/zip")
	req.ContentLength = int64(len(body))
	httpResp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("presign put: %v", err)
	}
	defer httpResp.Body.Close()
	io.Copy(io.Discard, httpResp.Body)
	if httpResp.StatusCode >= 300 {
		t.Fatalf("presign put status %d", httpResp.StatusCode)
	}
	out, err := svc.CompleteUpload(context.Background(), userID, storeID, res.Object.ID, sha256Hex(body))
	if err != nil {
		t.Fatalf("complete: %v", err)
	}
	if string(out.Status) != "READY" {
		t.Fatalf("status=%s", out.Status)
	}
	// HTTP metadata must not expose raw key
	req2 := httptest.NewRequest(http.MethodGet, "/v1/stores/"+storeID+"/objects/"+res.Object.ID, nil)
	req2.AddCookie(cookie)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req2)
	if rr.Code != http.StatusOK {
		t.Fatalf("metadata %d %s", rr.Code, rr.Body.String())
	}
	if bytes.Contains(rr.Body.Bytes(), []byte("objectKey")) || bytes.Contains(rr.Body.Bytes(), []byte("object_key")) {
		t.Fatal("DTO must not expose raw object key")
	}
	// download url
	req3 := httptest.NewRequest(http.MethodGet, "/v1/stores/"+storeID+"/objects/"+res.Object.ID+"/download-url", nil)
	req3.AddCookie(cookie)
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, req3)
	if rr.Code != http.StatusOK {
		t.Fatalf("download-url %d %s", rr.Code, rr.Body.String())
	}
	if rr.Header().Get("Cache-Control") != "private, no-store" {
		t.Fatalf("Cache-Control=%q", rr.Header().Get("Cache-Control"))
	}
	dl := envelopeData(t, rr)
	if _, ok := dl["downloadUrl"].(string); !ok {
		t.Fatalf("missing downloadUrl: %v", dl)
	}
}
