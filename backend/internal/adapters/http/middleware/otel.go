package middleware

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	"github.com/dasepmoch/fersaku-new/backend/internal/platform/telemetry"
)

// OTEL records a server span for each request when a telemetry provider is configured.
// Must run after Trace so request_id/trace_id are available. Attributes are low-cardinality only.
func OTEL(p *telemetry.Provider) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if p == nil {
				p = telemetry.GlobalProvider()
			}
			if p == nil {
				next.ServeHTTP(w, r)
				return
			}

			ctx := r.Context()
			// Prefer W3C parent from Trace middleware context.
			if tp := reqctx.Traceparent(ctx); tp != "" {
				if sc, ok := telemetry.ExtractW3C(tp); ok {
					// Continue trace: parent span id is remote parent.
					ctx = telemetry.ContextWithSpan(ctx, telemetry.SpanContext{
						TraceID: sc.TraceID,
						// Leave SpanID empty so StartSpan creates a child with this as parent via TraceID only.
						// We set parent by placing remote as parent: inject parent span id into context.
						SpanID:  sc.SpanID,
						Sampled: sc.Sampled || p.EndpointConfigured(),
					})
				}
			}
			// If Trace middleware set a derived trace id, align when no parent span id.
			if telemetry.SpanFromContext(ctx).TraceID == "" {
				if tid := reqctx.TraceID(ctx); tid != "" {
					ctx = telemetry.ContextWithSpan(ctx, telemetry.SpanContext{
						TraceID: tid,
						Sampled: true,
					})
				}
			}

			route := ""
			if rctx := chi.RouteContext(r.Context()); rctx != nil {
				route = rctx.RoutePattern()
			}
			if route == "" {
				route = collapsePath(r.URL.Path)
			}

			attrs := map[string]string{
				"http.method": r.Method,
				"http.route":  route,
			}
			if rid := reqctx.RequestID(ctx); rid != "" {
				attrs["request_id"] = rid
			}
			if rc := reqctx.RouteClass(ctx); rc != "" {
				attrs["route_class"] = rc
			}

			start := time.Now()
			ctx, end := p.StartSpan(ctx, "http.server", telemetry.SpanKindServer, attrs)
			// Publish child span ids on response for operators (Trace middleware may have set parent).
			if sc := telemetry.SpanFromContext(ctx); sc.TraceID != "" {
				if tp := telemetry.InjectW3C(sc); tp != "" {
					w.Header().Set(TraceparentHeader, tp)
					w.Header().Set(TraceIDHeader, sc.TraceID)
				}
			}
			rec := &statusRecorder{ResponseWriter: w, status: 0}
			next.ServeHTTP(rec, r.WithContext(ctx))
			if rec.status == 0 {
				rec.status = http.StatusOK
			}
			status := StatusOKFromHTTP(rec.status)
			extra := map[string]string{
				"http.status_code": strconv.Itoa(rec.status),
			}
			if rec.status >= 500 {
				extra["error.class"] = "http_5xx"
			} else if rec.status >= 400 {
				extra["error.class"] = "http_4xx"
			}
			_ = start
			end(status, "", extra)
		})
	}
}

// StatusOKFromHTTP maps HTTP status to span status.
func StatusOKFromHTTP(code int) telemetry.SpanStatus {
	if code >= 500 {
		return telemetry.StatusError
	}
	return telemetry.StatusOK
}
