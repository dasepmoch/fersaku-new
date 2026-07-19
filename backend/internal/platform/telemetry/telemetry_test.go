package telemetry_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/platform/telemetry"
)

func TestSpanRecordedInSink(t *testing.T) {
	p := telemetry.New(telemetry.Config{
		Resource:    telemetry.Resource{Service: "fersaku-api", Env: "test", Release: "test"},
		SampleRatio: 1,
		BatchMax:    8,
		QueueMax:    64,
	})
	p.Start()
	defer func() { _ = p.Shutdown(context.Background()) }()

	ctx, end := p.StartSpan(context.Background(), "http.server", telemetry.SpanKindServer, map[string]string{
		"http.method": "GET",
		"http.route":  "/health/live",
	})
	sc := telemetry.SpanFromContext(ctx)
	if sc.TraceID == "" || sc.SpanID == "" {
		t.Fatal("expected span context")
	}
	end(telemetry.StatusOK, "", map[string]string{"http.status_code": "200"})

	// Wait for batcher
	deadline := time.Now().Add(2 * time.Second)
	var spans []telemetry.Span
	for time.Now().Before(deadline) {
		spans = p.Sink().Spans()
		if len(spans) > 0 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if len(spans) == 0 {
		t.Fatal("expected span in sink")
	}
	if spans[0].Name != "http.server" {
		t.Fatalf("name %q", spans[0].Name)
	}
	if spans[0].Attrs["http.route"] != "/health/live" {
		t.Fatalf("attrs %+v", spans[0].Attrs)
	}
	// Sensitive keys dropped
	_, end2 := p.StartSpan(context.Background(), "bad", telemetry.SpanKindInternal, map[string]string{
		"email":       "a@b.com",
		"http.method": "POST",
	})
	end2(telemetry.StatusOK, "", nil)
	time.Sleep(300 * time.Millisecond)
	for _, sp := range p.Sink().Spans() {
		if _, ok := sp.Attrs["email"]; ok {
			t.Fatal("email must not appear in span attrs")
		}
	}
}

func TestShutdownDoesNotBlockIndefinitely(t *testing.T) {
	// Exporter that hangs past flush timeout
	hang := &hangExporter{block: make(chan struct{})}
	// Use custom provider via New + replace is hard; instead test flush timeout with full queue + slow OTLP
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(5 * time.Second)
		w.WriteHeader(200)
	}))
	defer srv.Close()

	p := telemetry.New(telemetry.Config{
		Resource:      telemetry.Resource{Service: "t", Env: "test"},
		Endpoint:      srv.URL,
		SampleRatio:   1,
		ExportTimeout: 500 * time.Millisecond,
		FlushTimeout:  400 * time.Millisecond,
		BatchMax:      1,
		BatchInterval: 10 * time.Millisecond,
		QueueMax:      8,
		HTTPClient:    &http.Client{Timeout: 500 * time.Millisecond},
	})
	p.Start()
	_, end := p.StartSpan(context.Background(), "x", telemetry.SpanKindInternal, nil)
	end(telemetry.StatusOK, "", nil)
	time.Sleep(50 * time.Millisecond)

	start := time.Now()
	_ = p.Shutdown(context.Background())
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Fatalf("shutdown blocked too long: %v", elapsed)
	}
	_ = hang // silence if unused in future
}

func TestOTLPExporterPostsJSON(t *testing.T) {
	var gotBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/v1/traces") && r.URL.Path != "/" {
			// accept either
		}
		buf := make([]byte, 4096)
		n, _ := r.Body.Read(buf)
		gotBody = string(buf[:n])
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	exp := telemetry.NewOTLPExporter(srv.URL, srv.Client())
	err := exp.Export(context.Background(), []telemetry.Span{{
		TraceID:     "4bf92f3577b34da6a3ce929d0e0e4736",
		SpanID:      "00f067aa0ba902b7",
		Name:        "http.server",
		Kind:        telemetry.SpanKindServer,
		StartUnixNs: time.Now().UnixNano(),
		EndUnixNs:   time.Now().UnixNano(),
		Status:      telemetry.StatusOK,
		Service:     "fersaku-api",
		Env:         "test",
		Sampled:     true,
		Attrs:       map[string]string{"http.method": "GET", "http.route": "/health/live"},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(gotBody, "resourceSpans") {
		t.Fatalf("body %s", gotBody)
	}
	if strings.Contains(gotBody, "@") {
		t.Fatal("unexpected email-like content")
	}
}

func TestW3CRoundTrip(t *testing.T) {
	sc, ok := telemetry.ExtractW3C("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")
	if !ok || sc.TraceID != "4bf92f3577b34da6a3ce929d0e0e4736" {
		t.Fatalf("%+v ok=%v", sc, ok)
	}
	if !sc.Sampled {
		t.Fatal("expected sampled")
	}
	tp := telemetry.InjectW3C(sc)
	if !strings.Contains(tp, sc.TraceID) {
		t.Fatalf("inject %s", tp)
	}
}

type hangExporter struct {
	block chan struct{}
}

func (h *hangExporter) Export(ctx context.Context, _ []telemetry.Span) error {
	select {
	case <-h.block:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (h *hangExporter) Shutdown(context.Context) error { return nil }
