package middleware

import (
	"net/http"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

type statusRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusRecorder) Write(b []byte) (int, error) {
	if s.status == 0 {
		s.status = http.StatusOK
	}
	n, err := s.ResponseWriter.Write(b)
	s.bytes += n
	return n, err
}

// Logging logs method, path, status, duration, request_id, trace_id, and client IP.
// Does not log bodies, cookies, Authorization, or secrets.
// Field conventions: backend/docs/observability-log-fields.md (BE-600).
func Logging(log ports.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			rec := &statusRecorder{ResponseWriter: w, status: 0}
			next.ServeHTTP(rec, r)
			if rec.status == 0 {
				rec.status = http.StatusOK
			}
			if log == nil {
				return
			}
			log.Info("http_request",
				"method", r.Method,
				"path", r.URL.Path,
				"status", rec.status,
				"bytes", rec.bytes,
				"latency_ms", time.Since(start).Milliseconds(),
				"request_id", reqctx.RequestID(r.Context()),
				"trace_id", reqctx.TraceID(r.Context()),
				"client_ip", reqctx.ClientIP(r.Context()),
			)
		})
	}
}
