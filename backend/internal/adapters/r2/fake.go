package r2

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// Fake is an in-memory ObjectStore for unit tests. Presign URLs are opaque fakes.
type Fake struct {
	mu      sync.Mutex
	objects map[string]fakeObj // bucket/key
	// FailHead forces HeadObject errors
	FailHead bool
}

type fakeObj struct {
	Body        []byte
	ContentType string
}

// NewFake constructs an empty fake store.
func NewFake() *Fake {
	return &Fake{objects: make(map[string]fakeObj)}
}

func (f *Fake) key(bucket, key string) string {
	return bucket + "\x00" + key
}

// Configured always true.
func (f *Fake) Configured() bool { return true }

// PresignPut returns a deterministic fake URL without secrets that look like real signatures.
func (f *Fake) PresignPut(_ context.Context, in ports.PresignPutInput) (string, time.Time, error) {
	ttl := in.TTL
	if ttl <= 0 {
		ttl = 15 * time.Minute
	}
	// Opaque; tests must not treat path as authority — object_ref id is authority.
	url := fmt.Sprintf("https://fake-r2.local/put/%s/%s?x-fake-presign=1", in.Bucket, in.Key)
	return url, time.Now().UTC().Add(ttl), nil
}

// PresignGet returns a fake download URL.
func (f *Fake) PresignGet(_ context.Context, in ports.PresignGetInput) (string, time.Time, error) {
	ttl := in.TTL
	if ttl <= 0 {
		ttl = 5 * time.Minute
	}
	url := fmt.Sprintf("https://fake-r2.local/get/%s/%s?x-fake-presign=1", in.Bucket, in.Key)
	return url, time.Now().UTC().Add(ttl), nil
}

// HeadObject returns stored metadata.
func (f *Fake) HeadObject(_ context.Context, bucket, key string) (ports.ObjectHead, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.FailHead {
		return ports.ObjectHead{}, fmt.Errorf("fake head failure")
	}
	o, ok := f.objects[f.key(bucket, key)]
	if !ok {
		return ports.ObjectHead{}, ports.ErrObjectNotFound{Bucket: bucket, Key: key}
	}
	return ports.ObjectHead{
		ContentLength: int64(len(o.Body)),
		ContentType:   o.ContentType,
		ETag:          "fake-etag",
	}, nil
}

// DeleteObject removes a key.
func (f *Fake) DeleteObject(_ context.Context, bucket, key string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	delete(f.objects, f.key(bucket, key))
	return nil
}

// PutObjectBytes stores bytes.
func (f *Fake) PutObjectBytes(_ context.Context, bucket, key, contentType string, body []byte) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	cp := make([]byte, len(body))
	copy(cp, body)
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	f.objects[f.key(bucket, key)] = fakeObj{Body: cp, ContentType: contentType}
	return nil
}

// GetObjectBytes returns stored bytes.
func (f *Fake) GetObjectBytes(_ context.Context, bucket, key string) ([]byte, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	o, ok := f.objects[f.key(bucket, key)]
	if !ok {
		return nil, ports.ErrObjectNotFound{Bucket: bucket, Key: key}
	}
	cp := make([]byte, len(o.Body))
	copy(cp, o.Body)
	return cp, nil
}

// Has reports presence (tests).
func (f *Fake) Has(bucket, key string) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	_, ok := f.objects[f.key(bucket, key)]
	return ok
}

// Count returns object count (tests).
func (f *Fake) Count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.objects)
}

// RedactURLForLog strips query string from a URL for safe logging.
func RedactURLForLog(u string) string {
	if i := strings.IndexByte(u, '?'); i >= 0 {
		return u[:i] + "?[redacted]"
	}
	return u
}
