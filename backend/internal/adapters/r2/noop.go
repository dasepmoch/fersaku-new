// Package r2 provides Cloudflare R2 / S3-compatible object storage adapters.
package r2

import (
	"context"
	"fmt"
	"io"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// Noop is a placeholder when R2 is not configured (unit tests without storage).
type Noop struct{}

// Ready always returns true for scaffold health.
func (Noop) Ready() bool { return true }

// Configured is false.
func (Noop) Configured() bool { return false }

// PresignPut fails closed.
func (Noop) PresignPut(context.Context, ports.PresignPutInput) (string, time.Time, error) {
	return "", time.Time{}, fmt.Errorf("r2: object storage not configured")
}

// PresignGet fails closed.
func (Noop) PresignGet(context.Context, ports.PresignGetInput) (string, time.Time, error) {
	return "", time.Time{}, fmt.Errorf("r2: object storage not configured")
}

// HeadObject fails closed.
func (Noop) HeadObject(context.Context, string, string) (ports.ObjectHead, error) {
	return ports.ObjectHead{}, fmt.Errorf("r2: object storage not configured")
}

// DeleteObject fails closed.
func (Noop) DeleteObject(context.Context, string, string) error {
	return fmt.Errorf("r2: object storage not configured")
}

// PutObjectBytes fails closed.
func (Noop) PutObjectBytes(context.Context, string, string, string, []byte) error {
	return fmt.Errorf("r2: object storage not configured")
}

// GetObjectBytes fails closed.
func (Noop) GetObjectBytes(context.Context, string, string) ([]byte, error) {
	return nil, fmt.Errorf("r2: object storage not configured")
}

// GetObjectStream fails closed.
func (Noop) GetObjectStream(context.Context, string, string, int64) (io.ReadCloser, ports.ObjectHead, error) {
	return nil, ports.ObjectHead{}, fmt.Errorf("r2: object storage not configured")
}
