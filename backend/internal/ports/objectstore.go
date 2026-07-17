package ports

import (
	"context"
	"time"
)

// ObjectHead is metadata returned by HEAD/stat against the object store.
type ObjectHead struct {
	ContentLength int64
	ContentType   string
	ETag          string
	// ChecksumSHA256 is set when the provider returns a content SHA-256 (optional).
	ChecksumSHA256 string
}

// PresignPutInput requests a short-lived upload URL.
type PresignPutInput struct {
	Bucket      string
	Key         string
	ContentType string
	// ContentLength when >0 restricts expected size where supported.
	ContentLength int64
	TTL           time.Duration
}

// PresignGetInput requests a short-lived download URL.
type PresignGetInput struct {
	Bucket string
	Key    string
	TTL    time.Duration
}

// ObjectStore is the S3-compatible storage port (MinIO local / Cloudflare R2 prod).
// Implementations must never log full presigned URLs (query signature is secret).
type ObjectStore interface {
	// Configured reports whether real credentials/endpoint are available.
	Configured() bool
	// PresignPut returns a short-lived PUT URL. Conditional create is enforced at complete via HEAD.
	PresignPut(ctx context.Context, in PresignPutInput) (url string, expiresAt time.Time, err error)
	// PresignGet returns a short-lived GET URL.
	PresignGet(ctx context.Context, in PresignGetInput) (url string, expiresAt time.Time, err error)
	// HeadObject stats an object; returns ErrNotFound when missing.
	HeadObject(ctx context.Context, bucket, key string) (ObjectHead, error)
	// DeleteObject removes an object (cleanup of expired UPLOADING only).
	DeleteObject(ctx context.Context, bucket, key string) error
	// PutObjectBytes writes bytes (test/integration helper; not used for KYC).
	PutObjectBytes(ctx context.Context, bucket, key, contentType string, body []byte) error
}

// ErrObjectNotFound is returned by HeadObject when the key is missing.
type ErrObjectNotFound struct {
	Bucket string
	Key    string
}

func (e ErrObjectNotFound) Error() string {
	return "object not found"
}
