// Package ports defines small infrastructure interfaces consumed by application
// and domain orchestration. Adapters implement these; domain never imports adapters.
package ports

import (
	"context"
	"time"
)

// Clock provides the current time. Injected so tests stay deterministic.
type Clock interface {
	Now() time.Time
}

// IDGenerator produces opaque public identifiers.
// Implementation choice (BE-001): ULID (Crockford base32, time-sortable, 26 chars).
// Prefer ULID over UUID v4 for natural sort by creation time without extra columns.
type IDGenerator interface {
	New() string
}

// Level is a structured log severity.
type Level string

const (
	LevelDebug Level = "debug"
	LevelInfo  Level = "info"
	LevelWarn  Level = "warn"
	LevelError Level = "error"
)

// Logger is a structured logger port (implemented with log/slog).
type Logger interface {
	Debug(msg string, attrs ...any)
	Info(msg string, attrs ...any)
	Warn(msg string, attrs ...any)
	Error(msg string, attrs ...any)
	With(attrs ...any) Logger
	WithRequestID(requestID string) Logger
}

// Queue is a minimal async job enqueue port (fake for BE-001 boot).
type Queue interface {
	// Enqueue schedules work; fake adapter may no-op or buffer in memory.
	Enqueue(ctx context.Context, jobType string, payload []byte) error
	// Close releases resources.
	Close() error
}

// Mailer sends transactional email (noop for scaffold).
type Mailer interface {
	Send(ctx context.Context, to, subject, body string) error
}
