package application_test

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"sync"
	"testing"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/objects"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// testScanner is an in-package malware scanner stub (no adapter import — architecture boundary).
type testScanner struct {
	mu           sync.Mutex
	Next         ports.ScanVerdict
	ForceTimeout bool
	ForceError   string
	Unconfigured bool
	CallCount    int
}

func (t *testScanner) Configured() bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	return !t.Unconfigured
}
func (t *testScanner) Ready(context.Context) error {
	if !t.Configured() {
		return errors.New("unconfigured")
	}
	return nil
}
func (t *testScanner) Scan(ctx context.Context, in ports.ScanInput) (ports.ScanResult, error) {
	t.mu.Lock()
	t.CallCount++
	next := t.Next
	to := t.ForceTimeout
	fe := t.ForceError
	t.Next = ""
	t.ForceTimeout = false
	t.ForceError = ""
	unc := t.Unconfigured
	t.mu.Unlock()
	if unc {
		return ports.ScanResult{Verdict: ports.ScanVerdictError, Engine: "test", Version: "v1", ErrorClass: "not_configured"}, errors.New("unconfigured")
	}
	if to {
		return ports.ScanResult{Verdict: ports.ScanVerdictTimeout, Engine: "test", Version: "v1", ErrorClass: "timeout"}, context.DeadlineExceeded
	}
	if fe != "" {
		return ports.ScanResult{Verdict: ports.ScanVerdictError, Engine: "test", Version: "v1", ErrorClass: fe}, errors.New(fe)
	}
	body, _ := io.ReadAll(in.Reader)
	if next != "" {
		r := ports.ScanResult{Verdict: next, Engine: "test", Version: "v1"}
		if next == ports.ScanVerdictInfected {
			r.Signature = "TEST"
		}
		return r, nil
	}
	if bytes.Contains(body, []byte("EICAR-STANDARD-ANTIVIRUS-TEST-FILE")) {
		return ports.ScanResult{Verdict: ports.ScanVerdictInfected, Engine: "test", Version: "v1", Signature: "EICAR"}, nil
	}
	return ports.ScanResult{Verdict: ports.ScanVerdictClean, Engine: "test", Version: "v1"}, nil
}

var _ ports.MalwareScanner = (*testScanner)(nil)

type memObjectStore struct {
	mu     sync.Mutex
	byID   map[string]objects.ObjectRef
	grants map[string]objects.DeliveryGrant
	quota  map[string]int64
	stores map[string]application.ObjectStoreRow
	access map[string]bool // userID|storeID
	admins map[string]bool
}

func newMemObjectStore() *memObjectStore {
	return &memObjectStore{
		byID:   make(map[string]objects.ObjectRef),
		grants: make(map[string]objects.DeliveryGrant),
		quota:  make(map[string]int64),
		stores: map[string]application.ObjectStoreRow{
			"store_a": {ID: "store_a", MerchantID: "merch_a", Slug: "a", Name: "A", Status: "ACTIVE"},
			"store_b": {ID: "store_b", MerchantID: "merch_b", Slug: "b", Name: "B", Status: "ACTIVE"},
		},
		access: map[string]bool{
			"user_a|store_a": true,
			"user_b|store_b": true,
		},
		admins: map[string]bool{},
	}
}

func (m *memObjectStore) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	return fn(ctx)
}
func (m *memObjectStore) InsertObject(_ context.Context, o objects.ObjectRef) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.byID[o.ID] = o
	return nil
}
func (m *memObjectStore) GetObjectByID(_ context.Context, id string) (objects.ObjectRef, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	o, ok := m.byID[id]
	if !ok {
		return objects.ObjectRef{}, errObjNF
	}
	return o, nil
}
func (m *memObjectStore) GetObjectByIDForStore(_ context.Context, id, storeID string) (objects.ObjectRef, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	o, ok := m.byID[id]
	if !ok || o.OwnerStoreID != storeID {
		return objects.ObjectRef{}, errObjNF
	}
	return o, nil
}
func (m *memObjectStore) UpdateObjectComplete(_ context.Context, id string, status objects.Status, actualSize int64, checksum, contentType string, scanStatus, scanVerdict, scanVersion *string, scanAt, verifiedAt *time.Time, rejectedReason *string, updatedAt time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	o, ok := m.byID[id]
	if !ok {
		return errObjNF
	}
	o.Status = status
	if actualSize > 0 {
		o.ActualSizeBytes = &actualSize
	}
	if checksum != "" {
		o.ChecksumSHA256 = &checksum
	}
	if contentType != "" {
		o.ContentType = contentType
	}
	o.ScanStatus = scanStatus
	o.ScanVerdict = scanVerdict
	o.ScanVersion = scanVersion
	o.ScanAt = scanAt
	o.LastVerifiedAt = verifiedAt
	o.RejectedReason = rejectedReason
	o.UpdatedAt = updatedAt
	m.byID[id] = o
	return nil
}
func (m *memObjectStore) UpdateObjectScanMeta(_ context.Context, id string, status objects.Status, scanStatus, scanVerdict, scanVersion *string, scanAt *time.Time, scanAttempts int32, scanErrorClass *string, scanNextRetryAt *time.Time, rejectedReason *string, verifiedAt *time.Time, updatedAt time.Time, allowedFrom []objects.Status) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	o, ok := m.byID[id]
	if !ok {
		return false, errObjNF
	}
	allowed := false
	for _, s := range allowedFrom {
		if o.Status == s {
			allowed = true
			break
		}
	}
	if !allowed {
		return false, nil // CAS miss — no-op
	}
	o.Status = status
	o.ScanStatus = scanStatus
	o.ScanVerdict = scanVerdict
	o.ScanVersion = scanVersion
	o.ScanAt = scanAt
	o.ScanAttempts = scanAttempts
	o.ScanErrorClass = scanErrorClass
	o.ScanNextRetryAt = scanNextRetryAt
	o.RejectedReason = rejectedReason
	o.LastVerifiedAt = verifiedAt
	o.UpdatedAt = updatedAt
	m.byID[id] = o
	return true, nil
}
func (m *memObjectStore) ListPendingScan(_ context.Context, now time.Time, limit int32) ([]objects.ObjectRef, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []objects.ObjectRef
	for _, o := range m.byID {
		if o.Status != objects.StatusScanning {
			continue
		}
		if o.ScanNextRetryAt != nil && o.ScanNextRetryAt.After(now) {
			continue
		}
		out = append(out, o)
		if int32(len(out)) >= limit {
			break
		}
	}
	return out, nil
}
func (m *memObjectStore) CountScanning(_ context.Context) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var n int64
	for _, o := range m.byID {
		if o.Status == objects.StatusScanning {
			n++
		}
	}
	return n, nil
}
func (m *memObjectStore) MarkObjectExpired(_ context.Context, id string, updatedAt time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	o, ok := m.byID[id]
	if !ok {
		return errObjNF
	}
	o.Status = objects.StatusExpired
	o.UpdatedAt = updatedAt
	m.byID[id] = o
	return nil
}
func (m *memObjectStore) ListExpiredUploading(_ context.Context, before time.Time, limit int32) ([]objects.ObjectRef, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []objects.ObjectRef
	for _, o := range m.byID {
		if o.Status == objects.StatusUploading && o.UploadExpiresAt.Before(before) {
			out = append(out, o)
			if int32(len(out)) >= limit {
				break
			}
		}
	}
	return out, nil
}
func (m *memObjectStore) GetStoreByID(_ context.Context, storeID string) (application.ObjectStoreRow, error) {
	s, ok := m.stores[storeID]
	if !ok {
		return application.ObjectStoreRow{}, errObjNF
	}
	return s, nil
}
func (m *memObjectStore) UserCanAccessStore(_ context.Context, userID, storeID string) (bool, error) {
	return m.access[userID+"|"+storeID], nil
}
func (m *memObjectStore) UserIsPlatformAdmin(_ context.Context, userID string) (bool, error) {
	return m.admins[userID], nil
}
func (m *memObjectStore) GetQuota(_ context.Context, merchantID string) (int64, int64, error) {
	return m.quota[merchantID], 0, nil
}
func (m *memObjectStore) AddQuota(_ context.Context, merchantID string, addBytes int64, _ time.Time) error {
	m.quota[merchantID] += addBytes
	return nil
}
func (m *memObjectStore) InsertGrant(_ context.Context, g objects.DeliveryGrant) error {
	m.grants[g.ID] = g
	return nil
}
func (m *memObjectStore) GetActiveGrant(_ context.Context, objectID, granteeUserID string, now time.Time) (objects.DeliveryGrant, error) {
	for _, g := range m.grants {
		if g.ObjectID == objectID && g.GranteeUserID == granteeUserID && g.RevokedAt == nil && g.ExpiresAt.After(now) && g.UseCount < g.MaxUses {
			return g, nil
		}
	}
	return objects.DeliveryGrant{}, errObjNF
}
func (m *memObjectStore) IncrementGrantUse(_ context.Context, grantID string) error {
	g := m.grants[grantID]
	g.UseCount++
	m.grants[grantID] = g
	return nil
}
func (m *memObjectStore) IsNotFound(err error) bool { return errors.Is(err, errObjNF) }

var errObjNF = errors.New("not found")

// fakeS3 implements ports.ObjectStore without importing adapters (architecture boundary).
type fakeS3 struct {
	mu      sync.Mutex
	objects map[string]struct {
		body []byte
		ct   string
	}
}

func newFakeS3() *fakeS3 {
	return &fakeS3{objects: make(map[string]struct {
		body []byte
		ct   string
	})}
}

func (f *fakeS3) k(b, key string) string { return b + "\x00" + key }
func (f *fakeS3) Configured() bool       { return true }
func (f *fakeS3) PresignPut(_ context.Context, in ports.PresignPutInput) (string, time.Time, error) {
	return fmt.Sprintf("https://fake-r2.local/put/%s/%s?x-fake=1", in.Bucket, in.Key), time.Now().UTC().Add(15 * time.Minute), nil
}
func (f *fakeS3) PresignGet(_ context.Context, in ports.PresignGetInput) (string, time.Time, error) {
	return fmt.Sprintf("https://fake-r2.local/get/%s/%s?x-fake=1", in.Bucket, in.Key), time.Now().UTC().Add(5 * time.Minute), nil
}
func (f *fakeS3) HeadObject(_ context.Context, bucket, key string) (ports.ObjectHead, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	o, ok := f.objects[f.k(bucket, key)]
	if !ok {
		return ports.ObjectHead{}, ports.ErrObjectNotFound{Bucket: bucket, Key: key}
	}
	return ports.ObjectHead{ContentLength: int64(len(o.body)), ContentType: o.ct}, nil
}
func (f *fakeS3) DeleteObject(_ context.Context, bucket, key string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	delete(f.objects, f.k(bucket, key))
	return nil
}
func (f *fakeS3) GetObjectBytes(_ context.Context, bucket, key string) ([]byte, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	o, ok := f.objects[f.k(bucket, key)]
	if !ok {
		return nil, ports.ErrObjectNotFound{Bucket: bucket, Key: key}
	}
	cp := make([]byte, len(o.body))
	copy(cp, o.body)
	return cp, nil
}

func (f *fakeS3) GetObjectStream(_ context.Context, bucket, key string, maxBytes int64) (io.ReadCloser, ports.ObjectHead, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	o, ok := f.objects[f.k(bucket, key)]
	if !ok {
		return nil, ports.ObjectHead{}, ports.ErrObjectNotFound{Bucket: bucket, Key: key}
	}
	if maxBytes <= 0 {
		maxBytes = 100 * 1024 * 1024
	}
	if int64(len(o.body)) > maxBytes {
		return nil, ports.ObjectHead{}, fmt.Errorf("object exceeds bound")
	}
	cp := make([]byte, len(o.body))
	copy(cp, o.body)
	return io.NopCloser(bytes.NewReader(cp)), ports.ObjectHead{
		ContentLength: int64(len(cp)),
		ContentType:   o.ct,
	}, nil
}

func (f *fakeS3) PutObjectBytes(_ context.Context, bucket, key, contentType string, body []byte) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	cp := make([]byte, len(body))
	copy(cp, body)
	f.objects[f.k(bucket, key)] = struct {
		body []byte
		ct   string
	}{body: cp, ct: contentType}
	return nil
}

type objIDs struct{ n int }

func (f *objIDs) New() string {
	f.n++
	return fmt.Sprintf("obj_%d", f.n)
}

type objClock struct{ t time.Time }

func (c objClock) Now() time.Time { return c.t }

func TestCreateUpload_RejectsKYC(t *testing.T) {
	mem := newMemObjectStore()
	fake := newFakeS3()
	svc := &application.ObjectService{
		Store: mem, Objects: fake, IDs: &objIDs{}, Clock: objClock{t: time.Now().UTC()},
		BucketPublic: "pub", BucketPrivate: "priv", LocalScanPass: true,
	}
	_, err := svc.CreateUploadIntent(context.Background(), "user_a", "store_a", application.CreateUploadInput{
		Purpose: "KYC_DOCUMENT", ContentType: "image/png", SizeBytes: 100,
	})
	if err == nil {
		t.Fatal("expected KYC reject")
	}
}

func TestComplete_IncompleteUploadRejected(t *testing.T) {
	mem := newMemObjectStore()
	fake := newFakeS3()
	svc := &application.ObjectService{
		Store: mem, Objects: fake, IDs: &objIDs{}, Clock: objClock{t: time.Now().UTC()},
		BucketPublic: "pub", BucketPrivate: "priv", LocalScanPass: true,
	}
	res, err := svc.CreateUploadIntent(context.Background(), "user_a", "store_a", application.CreateUploadInput{
		Purpose: "PRODUCT_FILE", ContentType: "application/zip", SizeBytes: 4,
	})
	if err != nil {
		t.Fatal(err)
	}
	_, err = svc.CompleteUpload(context.Background(), "user_a", "store_a", res.Object.ID, objects.SHA256Hex([]byte("test")))
	if err == nil {
		t.Fatal("expected incomplete reject")
	}
	ref, _ := mem.GetObjectByID(context.Background(), res.Object.ID)
	if ref.Status != objects.StatusRejected {
		t.Fatalf("status=%s", ref.Status)
	}
}

func TestComplete_ChecksumMismatchRejected(t *testing.T) {
	mem := newMemObjectStore()
	fake := newFakeS3()
	svc := &application.ObjectService{
		Store: mem, Objects: fake, IDs: &objIDs{}, Clock: objClock{t: time.Now().UTC()},
		BucketPublic: "pub", BucketPrivate: "priv", LocalScanPass: true,
	}
	body := []byte("abcd")
	sum := objects.SHA256Hex(body)
	res, err := svc.CreateUploadIntent(context.Background(), "user_a", "store_a", application.CreateUploadInput{
		Purpose: "PRODUCT_FILE", ContentType: "application/zip", SizeBytes: int64(len(body)),
		ExpectedChecksumSHA256: sum,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := fake.PutObjectBytes(context.Background(), res.Object.Bucket, res.Object.ObjectKey, "application/zip", body); err != nil {
		t.Fatal(err)
	}
	_, err = svc.CompleteUpload(context.Background(), "user_a", "store_a", res.Object.ID, objects.SHA256Hex([]byte("xxxx")))
	if err == nil {
		t.Fatal("expected checksum mismatch")
	}
}

func TestCrossTenant_AccessDenied(t *testing.T) {
	mem := newMemObjectStore()
	fake := newFakeS3()
	svc := &application.ObjectService{
		Store: mem, Objects: fake, IDs: &objIDs{}, Clock: objClock{t: time.Now().UTC()},
		BucketPublic: "pub", BucketPrivate: "priv", LocalScanPass: true,
	}
	body := []byte("data")
	res, err := svc.CreateUploadIntent(context.Background(), "user_a", "store_a", application.CreateUploadInput{
		Purpose: "PRODUCT_FILE", ContentType: "application/zip", SizeBytes: int64(len(body)),
	})
	if err != nil {
		t.Fatal(err)
	}
	_ = fake.PutObjectBytes(context.Background(), res.Object.Bucket, res.Object.ObjectKey, "application/zip", body)
	_, err = svc.CompleteUpload(context.Background(), "user_a", "store_a", res.Object.ID, objects.SHA256Hex(body))
	if err != nil {
		t.Fatal(err)
	}
	_, err = svc.GetObjectMetadata(context.Background(), "user_b", "store_b", res.Object.ID)
	if err == nil {
		t.Fatal("cross-tenant should fail")
	}
	_, err = svc.GetDownloadURL(context.Background(), "user_b", "store_b", res.Object.ID)
	if err == nil {
		t.Fatal("cross-tenant download should fail")
	}
	_, err = svc.GetObjectMetadata(context.Background(), "user_b", "store_a", res.Object.ID)
	if err == nil {
		t.Fatal("non-member should fail")
	}
}

func TestPresignCompleteHappyPath(t *testing.T) {
	mem := newMemObjectStore()
	fake := newFakeS3()
	svc := &application.ObjectService{
		Store: mem, Objects: fake, IDs: &objIDs{}, Clock: objClock{t: time.Now().UTC()},
		BucketPublic: "pub", BucketPrivate: "priv", LocalScanPass: true,
	}
	body := []byte("hello")
	res, err := svc.CreateUploadIntent(context.Background(), "user_a", "store_a", application.CreateUploadInput{
		Purpose: "PUBLIC_ASSET", ContentType: "image/png", SizeBytes: int64(len(body)),
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.UploadURL == "" {
		t.Fatal("missing upload url")
	}
	if res.Object.Bucket != "pub" {
		t.Fatalf("public bucket expected, got %s", res.Object.Bucket)
	}
	_ = fake.PutObjectBytes(context.Background(), res.Object.Bucket, res.Object.ObjectKey, "image/png", body)
	out, err := svc.CompleteUpload(context.Background(), "user_a", "store_a", res.Object.ID, objects.SHA256Hex(body))
	if err != nil {
		t.Fatal(err)
	}
	if out.Status != objects.StatusReady {
		t.Fatalf("status=%s", out.Status)
	}
	dl, err := svc.GetDownloadURL(context.Background(), "user_a", "store_a", res.Object.ID)
	if err != nil {
		t.Fatal(err)
	}
	if dl.DownloadURL == "" || dl.CacheControl != "private, no-store" {
		t.Fatalf("bad download result: %+v", dl)
	}
}

func TestComplete_ScannerCleanReady(t *testing.T) {
	mem := newMemObjectStore()
	fake := newFakeS3()
	sc := &testScanner{}
	svc := &application.ObjectService{
		Store: mem, Objects: fake, Scanner: sc, IDs: &objIDs{}, Clock: objClock{t: time.Now().UTC()},
		BucketPublic: "pub", BucketPrivate: "priv",
	}
	body := []byte("clean-bytes")
	res, err := svc.CreateUploadIntent(context.Background(), "user_a", "store_a", application.CreateUploadInput{
		Purpose: "PRODUCT_FILE", ContentType: "application/zip", SizeBytes: int64(len(body)),
	})
	if err != nil {
		t.Fatal(err)
	}
	_ = fake.PutObjectBytes(context.Background(), res.Object.Bucket, res.Object.ObjectKey, "application/zip", body)
	out, err := svc.CompleteUpload(context.Background(), "user_a", "store_a", res.Object.ID, objects.SHA256Hex(body))
	if err != nil {
		t.Fatal(err)
	}
	if out.Status != objects.StatusReady {
		t.Fatalf("status=%s", out.Status)
	}
	if out.ScanVerdict == nil || *out.ScanVerdict != "CLEAN" {
		t.Fatalf("scan verdict=%v", out.ScanVerdict)
	}
	if out.ScanVersion == nil || *out.ScanVersion == "" {
		t.Fatal("expected scan version evidence")
	}
	// idempotent complete
	out2, err := svc.CompleteUpload(context.Background(), "user_a", "store_a", res.Object.ID, objects.SHA256Hex(body))
	if err != nil {
		t.Fatal(err)
	}
	if out2.Status != objects.StatusReady {
		t.Fatalf("idempotent status=%s", out2.Status)
	}
}

func TestComplete_EICARInfectedRejected(t *testing.T) {
	mem := newMemObjectStore()
	fake := newFakeS3()
	sc := &testScanner{}
	svc := &application.ObjectService{
		Store: mem, Objects: fake, Scanner: sc, IDs: &objIDs{}, Clock: objClock{t: time.Now().UTC()},
		BucketPublic: "pub", BucketPrivate: "priv",
	}
	body := []byte(`X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*`)
	res, err := svc.CreateUploadIntent(context.Background(), "user_a", "store_a", application.CreateUploadInput{
		Purpose: "PRODUCT_FILE", ContentType: "application/zip", SizeBytes: int64(len(body)),
	})
	if err != nil {
		t.Fatal(err)
	}
	_ = fake.PutObjectBytes(context.Background(), res.Object.Bucket, res.Object.ObjectKey, "application/zip", body)
	out, err := svc.CompleteUpload(context.Background(), "user_a", "store_a", res.Object.ID, objects.SHA256Hex(body))
	if err == nil {
		t.Fatal("expected infected error")
	}
	if out.Status != objects.StatusRejected {
		t.Fatalf("status=%s", out.Status)
	}
	if out.ScanVerdict == nil || *out.ScanVerdict != "INFECTED" {
		t.Fatalf("verdict=%v", out.ScanVerdict)
	}
	// blob deleted (containment)
	if fake.Has(res.Object.Bucket, res.Object.ObjectKey) {
		t.Fatal("infected object should be deleted")
	}
}

func TestComplete_TimeoutStaysQuarantine(t *testing.T) {
	mem := newMemObjectStore()
	fake := newFakeS3()
	sc := &testScanner{ForceTimeout: true}
	svc := &application.ObjectService{
		Store: mem, Objects: fake, Scanner: sc, IDs: &objIDs{}, Clock: objClock{t: time.Now().UTC()},
		BucketPublic: "pub", BucketPrivate: "priv",
	}
	body := []byte("slow")
	res, err := svc.CreateUploadIntent(context.Background(), "user_a", "store_a", application.CreateUploadInput{
		Purpose: "PRODUCT_FILE", ContentType: "application/zip", SizeBytes: int64(len(body)),
	})
	if err != nil {
		t.Fatal(err)
	}
	_ = fake.PutObjectBytes(context.Background(), res.Object.Bucket, res.Object.ObjectKey, "application/zip", body)
	out, err := svc.CompleteUpload(context.Background(), "user_a", "store_a", res.Object.ID, objects.SHA256Hex(body))
	if err != nil {
		t.Fatal(err) // quarantine path returns object without hard error
	}
	if out.Status != objects.StatusScanning {
		t.Fatalf("status=%s want SCANNING", out.Status)
	}
}

func TestComplete_ScannerUnavailableQuarantine(t *testing.T) {
	mem := newMemObjectStore()
	fake := newFakeS3()
	svc := &application.ObjectService{
		Store: mem, Objects: fake, IDs: &objIDs{}, Clock: objClock{t: time.Now().UTC()},
		BucketPublic: "pub", BucketPrivate: "priv", LocalScanPass: false,
	}
	body := []byte("data")
	res, err := svc.CreateUploadIntent(context.Background(), "user_a", "store_a", application.CreateUploadInput{
		Purpose: "PRODUCT_FILE", ContentType: "application/zip", SizeBytes: int64(len(body)),
	})
	if err != nil {
		t.Fatal(err)
	}
	_ = fake.PutObjectBytes(context.Background(), res.Object.Bucket, res.Object.ObjectKey, "application/zip", body)
	out, err := svc.CompleteUpload(context.Background(), "user_a", "store_a", res.Object.ID, objects.SHA256Hex(body))
	if err != nil {
		// may return quarantine object with nil err or scanning state
		_ = err
	}
	if out.ID == "" {
		ref, _ := mem.GetObjectByID(context.Background(), res.Object.ID)
		out = ref
	}
	if out.Status == objects.StatusReady {
		t.Fatal("must not READY without scanner")
	}
	if out.Status != objects.StatusScanning {
		t.Fatalf("status=%s want SCANNING", out.Status)
	}
}

func TestProcessPendingScans_IdempotentReady(t *testing.T) {
	mem := newMemObjectStore()
	fake := newFakeS3()
	sc := &testScanner{}
	base := time.Date(2026, 7, 20, 12, 0, 0, 0, time.UTC)
	clk := &objClock{t: base}
	svc := &application.ObjectService{
		Store: mem, Objects: fake, Scanner: sc, IDs: &objIDs{}, Clock: clk,
		BucketPublic: "pub", BucketPrivate: "priv",
	}
	body := []byte("retry-me")
	res, err := svc.CreateUploadIntent(context.Background(), "user_a", "store_a", application.CreateUploadInput{
		Purpose: "PRODUCT_FILE", ContentType: "application/zip", SizeBytes: int64(len(body)),
	})
	if err != nil {
		t.Fatal(err)
	}
	_ = fake.PutObjectBytes(context.Background(), res.Object.Bucket, res.Object.ObjectKey, "application/zip", body)
	// force quarantine first
	sc.ForceTimeout = true
	out, _ := svc.CompleteUpload(context.Background(), "user_a", "store_a", res.Object.ID, objects.SHA256Hex(body))
	if out.Status != objects.StatusScanning {
		t.Fatalf("want SCANNING got %s", out.Status)
	}
	// advance clock past backoff so ListPendingScan picks it up
	clk.t = base.Add(2 * time.Minute)
	n, err := svc.ProcessPendingScans(context.Background(), 10)
	if err != nil {
		t.Fatal(err)
	}
	if n < 1 {
		t.Fatalf("processed=%d", n)
	}
	ref, _ := mem.GetObjectByID(context.Background(), res.Object.ID)
	if ref.Status != objects.StatusReady {
		t.Fatalf("status=%s", ref.Status)
	}
	q1 := mem.quota["merch_a"]
	// duplicate job must not double quota
	_, _ = svc.ProcessPendingScans(context.Background(), 10)
	if mem.quota["merch_a"] != q1 {
		t.Fatalf("quota double-counted: %d -> %d", q1, mem.quota["merch_a"])
	}
}

func (f *fakeS3) Has(bucket, key string) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	_, ok := f.objects[f.k(bucket, key)]
	return ok
}

var _ ports.ObjectStore = (*fakeS3)(nil)
