// Package observability provides logging and metrics adapters (slog for BE-001).
package observability

import (
	"log/slog"
	"os"
	"strings"

	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// SlogLogger wraps slog.Logger as ports.Logger.
type SlogLogger struct {
	l *slog.Logger
}

// NewSlogLogger builds a JSON slog logger at the given level string.
func NewSlogLogger(level string, service string) *SlogLogger {
	var lvl slog.Level
	switch strings.ToLower(level) {
	case "debug":
		lvl = slog.LevelDebug
	case "warn":
		lvl = slog.LevelWarn
	case "error":
		lvl = slog.LevelError
	default:
		lvl = slog.LevelInfo
	}
	h := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: lvl})
	l := slog.New(h).With("service", service)
	return &SlogLogger{l: l}
}

func (s *SlogLogger) Debug(msg string, attrs ...any) { s.l.Debug(msg, attrs...) }
func (s *SlogLogger) Info(msg string, attrs ...any)  { s.l.Info(msg, attrs...) }
func (s *SlogLogger) Warn(msg string, attrs ...any)  { s.l.Warn(msg, attrs...) }
func (s *SlogLogger) Error(msg string, attrs ...any) { s.l.Error(msg, attrs...) }

func (s *SlogLogger) With(attrs ...any) ports.Logger {
	return &SlogLogger{l: s.l.With(attrs...)}
}

func (s *SlogLogger) WithRequestID(requestID string) ports.Logger {
	return s.With("request_id", requestID)
}

var _ ports.Logger = (*SlogLogger)(nil)
