// Package r2 provides Cloudflare R2 / S3-compatible object storage adapters (BE-220).
// Local uses MinIO; production uses R2 with the same interface. Presigned URLs are
// short-lived secrets and must never be logged in full.
package r2

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"

	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// Config for S3-compatible client (MinIO or R2).
type Config struct {
	Endpoint        string
	Region          string
	AccessKeyID     string
	SecretAccessKey string
	ForcePathStyle  bool
}

// Client implements ports.ObjectStore against S3 API.
type Client struct {
	s3     *s3.Client
	presign *s3.PresignClient
}

// NewClient builds a real S3 client. endpoint may be empty for AWS; for MinIO/R2 set path-style.
func NewClient(cfg Config) (*Client, error) {
	if strings.TrimSpace(cfg.AccessKeyID) == "" || strings.TrimSpace(cfg.SecretAccessKey) == "" {
		return nil, fmt.Errorf("r2: access key and secret are required")
	}
	region := cfg.Region
	if region == "" {
		region = "auto"
	}
	resolver := aws.EndpointResolverWithOptionsFunc(func(service, region string, _ ...interface{}) (aws.Endpoint, error) {
		if cfg.Endpoint == "" {
			return aws.Endpoint{}, &aws.EndpointNotFoundError{}
		}
		return aws.Endpoint{
			URL:               cfg.Endpoint,
			HostnameImmutable: true,
			SigningRegion:     region,
		}, nil
	})
	awsCfg := aws.Config{
		Region:                      region,
		Credentials:                 credentials.NewStaticCredentialsProvider(cfg.AccessKeyID, cfg.SecretAccessKey, ""),
		EndpointResolverWithOptions: resolver,
	}
	s3c := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.UsePathStyle = cfg.ForcePathStyle || isPathStyleEndpoint(cfg.Endpoint)
	})
	return &Client{s3: s3c, presign: s3.NewPresignClient(s3c)}, nil
}

func isPathStyleEndpoint(endpoint string) bool {
	e := strings.ToLower(endpoint)
	return strings.Contains(e, "localhost") ||
		strings.Contains(e, "127.0.0.1") ||
		strings.Contains(e, "minio") ||
		strings.HasPrefix(e, "http://")
}

// Configured always true for a successfully constructed Client.
func (c *Client) Configured() bool { return c != nil && c.s3 != nil }

// PresignPut issues a short-lived PUT. Never log the returned URL.
func (c *Client) PresignPut(ctx context.Context, in ports.PresignPutInput) (string, time.Time, error) {
	if !c.Configured() {
		return "", time.Time{}, fmt.Errorf("r2: not configured")
	}
	ttl := in.TTL
	if ttl <= 0 {
		ttl = 15 * time.Minute
	}
	if ttl > time.Hour {
		ttl = time.Hour
	}
	input := &s3.PutObjectInput{
		Bucket:      aws.String(in.Bucket),
		Key:         aws.String(in.Key),
		ContentType: aws.String(in.ContentType),
	}
	if in.ContentLength > 0 {
		input.ContentLength = aws.Int64(in.ContentLength)
	}
	out, err := c.presign.PresignPutObject(ctx, input, s3.WithPresignExpires(ttl))
	if err != nil {
		return "", time.Time{}, fmt.Errorf("r2: presign put: %w", err)
	}
	return out.URL, time.Now().UTC().Add(ttl), nil
}

// PresignGet issues a short-lived GET. Never log the returned URL.
func (c *Client) PresignGet(ctx context.Context, in ports.PresignGetInput) (string, time.Time, error) {
	if !c.Configured() {
		return "", time.Time{}, fmt.Errorf("r2: not configured")
	}
	ttl := in.TTL
	if ttl <= 0 {
		ttl = 5 * time.Minute
	}
	if ttl > 30*time.Minute {
		ttl = 30 * time.Minute
	}
	out, err := c.presign.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(in.Bucket),
		Key:    aws.String(in.Key),
	}, s3.WithPresignExpires(ttl))
	if err != nil {
		return "", time.Time{}, fmt.Errorf("r2: presign get: %w", err)
	}
	return out.URL, time.Now().UTC().Add(ttl), nil
}

// HeadObject stats the object.
func (c *Client) HeadObject(ctx context.Context, bucket, key string) (ports.ObjectHead, error) {
	if !c.Configured() {
		return ports.ObjectHead{}, fmt.Errorf("r2: not configured")
	}
	out, err := c.s3.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		if isNotFound(err) {
			return ports.ObjectHead{}, ports.ErrObjectNotFound{Bucket: bucket, Key: key}
		}
		return ports.ObjectHead{}, fmt.Errorf("r2: head: %w", err)
	}
	h := ports.ObjectHead{}
	if out.ContentLength != nil {
		h.ContentLength = *out.ContentLength
	}
	if out.ContentType != nil {
		h.ContentType = *out.ContentType
	}
	if out.ETag != nil {
		h.ETag = strings.Trim(*out.ETag, `"`)
	}
	if out.ChecksumSHA256 != nil {
		h.ChecksumSHA256 = *out.ChecksumSHA256
	}
	return h, nil
}

// DeleteObject removes a key (best-effort cleanup).
func (c *Client) DeleteObject(ctx context.Context, bucket, key string) error {
	if !c.Configured() {
		return fmt.Errorf("r2: not configured")
	}
	_, err := c.s3.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil && !isNotFound(err) {
		return fmt.Errorf("r2: delete: %w", err)
	}
	return nil
}

// PutObjectBytes writes body (integration tests / server-side only).
func (c *Client) PutObjectBytes(ctx context.Context, bucket, key, contentType string, body []byte) error {
	if !c.Configured() {
		return fmt.Errorf("r2: not configured")
	}
	_, err := c.s3.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(bucket),
		Key:           aws.String(key),
		Body:          bytes.NewReader(body),
		ContentType:   aws.String(contentType),
		ContentLength: aws.Int64(int64(len(body))),
	})
	if err != nil {
		return fmt.Errorf("r2: put: %w", err)
	}
	return nil
}

// GetObjectBytes reads object body server-side (KYC decrypt; never log body).
func (c *Client) GetObjectBytes(ctx context.Context, bucket, key string) ([]byte, error) {
	if !c.Configured() {
		return nil, fmt.Errorf("r2: not configured")
	}
	out, err := c.s3.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		if isNotFound(err) {
			return nil, ports.ErrObjectNotFound{Bucket: bucket, Key: key}
		}
		return nil, fmt.Errorf("r2: get: %w", err)
	}
	defer out.Body.Close()
	// Bound KYC ciphertext: plaintext max 10MiB + AEAD overhead headroom.
	limited := io.LimitReader(out.Body, 12*1024*1024+1)
	body, err := io.ReadAll(limited)
	if err != nil {
		return nil, fmt.Errorf("r2: get body: %w", err)
	}
	if len(body) > 12*1024*1024 {
		return nil, fmt.Errorf("r2: object exceeds bound")
	}
	return body, nil
}

func isNotFound(err error) bool {
	var nsk *types.NoSuchKey
	if errors.As(err, &nsk) {
		return true
	}
	var nsb *types.NotFound
	if errors.As(err, &nsb) {
		return true
	}
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		code := apiErr.ErrorCode()
		return code == "NotFound" || code == "NoSuchKey" || code == "404"
	}
	// HTTP status fallback for some MinIO responses
	var re interface{ HTTPStatusCode() int }
	if errors.As(err, &re) && re.HTTPStatusCode() == http.StatusNotFound {
		return true
	}
	return strings.Contains(strings.ToLower(err.Error()), "not found") ||
		strings.Contains(err.Error(), "404")
}

// EnsureNoop implements health Ready for composition root when storage unused.
func EnsureBuckets(ctx context.Context, c *Client, public, private string) error {
	if c == nil || !c.Configured() {
		return nil
	}
	for _, b := range []string{public, private} {
		if b == "" {
			continue
		}
		_, err := c.s3.HeadBucket(ctx, &s3.HeadBucketInput{Bucket: aws.String(b)})
		if err == nil {
			continue
		}
		_, cerr := c.s3.CreateBucket(ctx, &s3.CreateBucketInput{Bucket: aws.String(b)})
		if cerr != nil && !strings.Contains(strings.ToLower(cerr.Error()), "already") {
			// MinIO may race; Head again
			if _, err2 := c.s3.HeadBucket(ctx, &s3.HeadBucketInput{Bucket: aws.String(b)}); err2 != nil {
				return fmt.Errorf("r2: ensure bucket %s: %w", b, cerr)
			}
		}
	}
	return nil
}

// Drain discards body (helper for future stream path).
func Drain(r io.Reader) {
	if r != nil {
		_, _ = io.Copy(io.Discard, r)
	}
}
