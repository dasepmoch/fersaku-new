package application_test

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/objects"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

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

var _ ports.ObjectStore = (*fakeS3)(nil)
