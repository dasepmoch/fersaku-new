// Package telemetry provides process-local distributed tracing with optional OTLP export.
//
// Design goals (GAP-07):
//   - Wire HTTP/DB/provider/outbox/job spans with sampling, batch, queue, and bounded shutdown flush.
//   - Exporter outage and flush must never block money mutations indefinitely.
//   - Low-cardinality attributes only: service, env, release, route template, status, error class.
//   - No secrets, PII, raw payment/KYC payloads, emails, headers, or account numbers.
//
// When OTEL_EXPORTER_OTLP_ENDPOINT is empty the provider still records spans to an
// in-process sink (tests/diagnostics). Live collector export is optional.
package telemetry

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Resource identifies the process in traces (bounded labels only).
type Resource struct {
	Service string
	Env     string
	Release string
}

// Config configures the process tracer.
type Config struct {
	Resource Resource
	// Endpoint is OTLP/HTTP base (host:port or URL). Empty → no remote export.
	Endpoint string
	// SampleRatio in [0,1]. Default 1.0 when unset and endpoint empty; 0.1 when endpoint set.
	SampleRatio float64
	// ExportTimeout bounds a single export attempt (default 2s).
	ExportTimeout time.Duration
	// BatchMax is max spans per export batch (default 64).
	BatchMax int
	// QueueMax is the in-memory export queue depth (default 1024). Drop oldest on overflow.
	QueueMax int
	// FlushTimeout bounds Shutdown (default 3s). Never wait longer.
	FlushTimeout time.Duration
	// BatchInterval is max wait before flushing a partial batch (default 200ms).
	BatchInterval time.Duration
	// HTTPClient optional; defaults to a short-timeout client.
	HTTPClient *http.Client
}

// SpanKind classifies the span.
type SpanKind string

const (
	SpanKindInternal SpanKind = "internal"
	SpanKindServer   SpanKind = "server"
	SpanKindClient   SpanKind = "client"
	SpanKindProducer SpanKind = "producer"
	SpanKindConsumer SpanKind = "consumer"
)

// SpanStatus is the span outcome.
type SpanStatus string

const (
	StatusUnset SpanStatus = "unset"
	StatusOK    SpanStatus = "ok"
	StatusError SpanStatus = "error"
)

// Span is a finished or in-flight span snapshot (safe attributes only).
type Span struct {
	TraceID      string            `json:"traceId"`
	SpanID       string            `json:"spanId"`
	ParentSpanID string            `json:"parentSpanId,omitempty"`
	Name         string            `json:"name"`
	Kind         SpanKind          `json:"kind"`
	StartUnixNs  int64             `json:"startTimeUnixNano"`
	EndUnixNs    int64             `json:"endTimeUnixNano,omitempty"`
	Status       SpanStatus        `json:"status"`
	StatusMsg    string            `json:"statusMessage,omitempty"`
	Attrs        map[string]string `json:"attributes,omitempty"`
	Service      string            `json:"service"`
	Env          string            `json:"env"`
	Release      string            `json:"release,omitempty"`
	Sampled      bool              `json:"sampled"`
}

// Exporter ships finished spans. Implementations must not block callers for long.
type Exporter interface {
	Export(ctx context.Context, spans []Span) error
	Shutdown(ctx context.Context) error
}

// SinkExporter stores spans in memory (tests / local diagnostics).
type SinkExporter struct {
	mu    sync.Mutex
	spans []Span
}

// Export appends spans to the sink.
func (s *SinkExporter) Export(_ context.Context, spans []Span) error {
	if s == nil {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.spans = append(s.spans, spans...)
	return nil
}

// Shutdown is a no-op.
func (s *SinkExporter) Shutdown(context.Context) error { return nil }

// Spans returns a copy of recorded spans.
func (s *SinkExporter) Spans() []Span {
	if s == nil {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]Span, len(s.spans))
	copy(out, s.spans)
	return out
}

// Reset clears the sink.
func (s *SinkExporter) Reset() {
	if s == nil {
		return
	}
	s.mu.Lock()
	s.spans = nil
	s.mu.Unlock()
}

// MultiExporter fans out to multiple exporters; errors are best-effort logged via last error.
type MultiExporter struct {
	exporters []Exporter
}

// Export calls each exporter; returns first error but continues.
func (m *MultiExporter) Export(ctx context.Context, spans []Span) error {
	var first error
	for _, e := range m.exporters {
		if e == nil {
			continue
		}
		if err := e.Export(ctx, spans); err != nil && first == nil {
			first = err
		}
	}
	return first
}

// Shutdown shuts down each exporter.
func (m *MultiExporter) Shutdown(ctx context.Context) error {
	var first error
	for _, e := range m.exporters {
		if e == nil {
			continue
		}
		if err := e.Shutdown(ctx); err != nil && first == nil {
			first = err
		}
	}
	return first
}

// OTLPExporter posts a minimal OTLP/HTTP JSON payload. Failures are non-fatal to callers
// (batcher drops / retries within queue bounds only).
type OTLPExporter struct {
	endpoint string
	client   *http.Client
	path     string
}

// NewOTLPExporter builds an OTLP/HTTP exporter. endpoint may be host:port or full URL.
func NewOTLPExporter(endpoint string, client *http.Client) *OTLPExporter {
	ep := strings.TrimSpace(endpoint)
	path := "/v1/traces"
	if strings.HasPrefix(ep, "http://") || strings.HasPrefix(ep, "https://") {
		// If path already present keep host as-is; export URL = endpoint + path when no path.
		if u := strings.TrimRight(ep, "/"); strings.Contains(strings.TrimPrefix(strings.TrimPrefix(u, "http://"), "https://"), "/") {
			// full URL with path — use as-is
			return &OTLPExporter{endpoint: u, client: client, path: ""}
		}
		return &OTLPExporter{endpoint: strings.TrimRight(ep, "/"), client: client, path: path}
	}
	return &OTLPExporter{endpoint: "http://" + ep, client: client, path: path}
}

type otlpPayload struct {
	ResourceSpans []otlpResourceSpans `json:"resourceSpans"`
}

type otlpResourceSpans struct {
	Resource   otlpResource    `json:"resource"`
	ScopeSpans []otlpScopeSpan `json:"scopeSpans"`
}

type otlpResource struct {
	Attributes []otlpKV `json:"attributes"`
}

type otlpScopeSpan struct {
	Scope otlpScope  `json:"scope"`
	Spans []otlpSpan `json:"spans"`
}

type otlpScope struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

type otlpSpan struct {
	TraceID           string   `json:"traceId"`
	SpanID            string   `json:"spanId"`
	ParentSpanID      string   `json:"parentSpanId,omitempty"`
	Name              string   `json:"name"`
	Kind              int      `json:"kind"`
	StartTimeUnixNano string   `json:"startTimeUnixNano"`
	EndTimeUnixNano   string   `json:"endTimeUnixNano"`
	Attributes        []otlpKV `json:"attributes,omitempty"`
	Status            struct {
		Code    int    `json:"code"`
		Message string `json:"message,omitempty"`
	} `json:"status"`
}

type otlpKV struct {
	Key   string     `json:"key"`
	Value otlpAnyVal `json:"value"`
}

type otlpAnyVal struct {
	StringValue string `json:"stringValue,omitempty"`
}

func spanKindOTLP(k SpanKind) int {
	switch k {
	case SpanKindServer:
		return 2
	case SpanKindClient:
		return 3
	case SpanKindProducer:
		return 4
	case SpanKindConsumer:
		return 5
	default:
		return 1 // internal
	}
}

func statusCodeOTLP(s SpanStatus) int {
	switch s {
	case StatusOK:
		return 1
	case StatusError:
		return 2
	default:
		return 0
	}
}

// Export encodes spans as OTLP/HTTP JSON. Context timeout must be short.
func (o *OTLPExporter) Export(ctx context.Context, spans []Span) error {
	if o == nil || len(spans) == 0 {
		return nil
	}
	// Group by service/env/release (usually one process).
	byRes := map[string][]Span{}
	for _, sp := range spans {
		key := sp.Service + "|" + sp.Env + "|" + sp.Release
		byRes[key] = append(byRes[key], sp)
	}
	var resourceSpans []otlpResourceSpans
	for _, group := range byRes {
		first := group[0]
		attrs := []otlpKV{
			{Key: "service.name", Value: otlpAnyVal{StringValue: first.Service}},
			{Key: "deployment.environment", Value: otlpAnyVal{StringValue: first.Env}},
		}
		if first.Release != "" {
			attrs = append(attrs, otlpKV{Key: "service.version", Value: otlpAnyVal{StringValue: first.Release}})
		}
		otlpSpans := make([]otlpSpan, 0, len(group))
		for _, sp := range group {
			os := otlpSpan{
				TraceID:           sp.TraceID,
				SpanID:            sp.SpanID,
				ParentSpanID:      sp.ParentSpanID,
				Name:              sp.Name,
				Kind:              spanKindOTLP(sp.Kind),
				StartTimeUnixNano: fmt.Sprintf("%d", sp.StartUnixNs),
				EndTimeUnixNano:   fmt.Sprintf("%d", sp.EndUnixNs),
			}
			os.Status.Code = statusCodeOTLP(sp.Status)
			os.Status.Message = sp.StatusMsg
			for k, v := range sp.Attrs {
				if k == "" || v == "" {
					continue
				}
				os.Attributes = append(os.Attributes, otlpKV{Key: k, Value: otlpAnyVal{StringValue: v}})
			}
			otlpSpans = append(otlpSpans, os)
		}
		resourceSpans = append(resourceSpans, otlpResourceSpans{
			Resource: otlpResource{Attributes: attrs},
			ScopeSpans: []otlpScopeSpan{{
				Scope: otlpScope{Name: "fersaku/platform/telemetry", Version: "1"},
				Spans: otlpSpans,
			}},
		})
	}
	body, err := json.Marshal(otlpPayload{ResourceSpans: resourceSpans})
	if err != nil {
		return err
	}
	url := o.endpoint
	if o.path != "" {
		url = strings.TrimRight(o.endpoint, "/") + o.path
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, strings.NewReader(string(body)))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	client := o.client
	if client == nil {
		client = &http.Client{Timeout: 2 * time.Second}
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("otlp export status %d", resp.StatusCode)
	}
	return nil
}

// Shutdown is a no-op for HTTP exporter.
func (o *OTLPExporter) Shutdown(context.Context) error { return nil }

// Provider is the process tracer.
type Provider struct {
	cfg      Config
	exporter    Exporter
	sink     *SinkExporter // always present for diagnostics when multi
	queue    chan Span
	stopCh   chan struct{}
	wg       sync.WaitGroup
	started  atomic.Bool
	dropped  atomic.Uint64
	exported atomic.Uint64
	errors   atomic.Uint64
	mu       sync.Mutex
	closed   bool
}

type spanCtxKey struct{}

// SpanContext holds active span identity for propagation.
type SpanContext struct {
	TraceID      string
	SpanID       string
	ParentSpanID string
	Sampled      bool
}

// Global is set by app composition; nil-safe helpers use no-op when unset.
var global atomic.Pointer[Provider]

// SetGlobal installs the process provider (composition root only).
func SetGlobal(p *Provider) {
	global.Store(p)
}

// GlobalProvider returns the process provider or nil.
func GlobalProvider() *Provider {
	return global.Load()
}

// New creates a Provider. Call Start to begin the export loop.
func New(cfg Config) *Provider {
	if cfg.ExportTimeout <= 0 {
		cfg.ExportTimeout = 2 * time.Second
	}
	if cfg.FlushTimeout <= 0 {
		cfg.FlushTimeout = 3 * time.Second
	}
	if cfg.BatchMax <= 0 {
		cfg.BatchMax = 64
	}
	if cfg.QueueMax <= 0 {
		cfg.QueueMax = 1024
	}
	if cfg.BatchInterval <= 0 {
		cfg.BatchInterval = 200 * time.Millisecond
	}
	if cfg.SampleRatio < 0 {
		cfg.SampleRatio = 0
	}
	if cfg.SampleRatio > 1 {
		cfg.SampleRatio = 1
	}
	if cfg.SampleRatio == 0 && cfg.Endpoint == "" {
		// Local/dev default: record everything to sink.
		cfg.SampleRatio = 1
	}
	if cfg.SampleRatio == 0 && cfg.Endpoint != "" {
		cfg.SampleRatio = 0.1
	}
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = &http.Client{Timeout: cfg.ExportTimeout}
	}
	if cfg.Resource.Service == "" {
		cfg.Resource.Service = "fersaku"
	}
	if cfg.Resource.Env == "" {
		cfg.Resource.Env = "local"
	}

	sink := &SinkExporter{}
	var exp Exporter = sink
	if ep := strings.TrimSpace(cfg.Endpoint); ep != "" {
		exp = &MultiExporter{exporters: []Exporter{sink, NewOTLPExporter(ep, cfg.HTTPClient)}}
	}

	return &Provider{
		cfg:    cfg,
		exporter: exp,
		sink:   sink,
		queue:  make(chan Span, cfg.QueueMax),
		stopCh: make(chan struct{}),
	}
}

// Sink returns the in-process span sink (always available).
func (p *Provider) Sink() *SinkExporter {
	if p == nil {
		return nil
	}
	return p.sink
}

// Start begins the background batcher. Idempotent.
func (p *Provider) Start() {
	if p == nil {
		return
	}
	if !p.started.CompareAndSwap(false, true) {
		return
	}
	p.wg.Add(1)
	go p.loop()
}

// Stats returns export counters for diagnostics/metrics.
func (p *Provider) Stats() (exported, dropped, errors uint64) {
	if p == nil {
		return 0, 0, 0
	}
	return p.exported.Load(), p.dropped.Load(), p.errors.Load()
}

// EndpointConfigured reports whether a remote OTLP endpoint is set.
func (p *Provider) EndpointConfigured() bool {
	if p == nil {
		return false
	}
	return strings.TrimSpace(p.cfg.Endpoint) != ""
}

// Shutdown flushes the queue with a hard timeout then stops the loop.
// Never blocks longer than FlushTimeout. Safe to call multiple times.
func (p *Provider) Shutdown(ctx context.Context) error {
	if p == nil {
		return nil
	}
	p.mu.Lock()
	if p.closed {
		p.mu.Unlock()
		return nil
	}
	p.closed = true
	p.mu.Unlock()

	// Bound flush independently of parent ctx so money-path close cannot hang.
	flushTO := p.cfg.FlushTimeout
	if flushTO <= 0 {
		flushTO = 3 * time.Second
	}
	if dl, ok := ctx.Deadline(); ok {
		if rem := time.Until(dl); rem > 0 && rem < flushTO {
			flushTO = rem
		}
	}
	flushCtx, cancel := context.WithTimeout(context.Background(), flushTO)
	defer cancel()

	// Signal stop; loop drains remaining queue then exits.
	close(p.stopCh)
	done := make(chan struct{})
	go func() {
		p.wg.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-flushCtx.Done():
		// Timed out: abandon in-flight export; do not block process exit.
	}
	_ = p.exporter.Shutdown(flushCtx)
	return nil
}

func (p *Provider) loop() {
	defer p.wg.Done()
	batch := make([]Span, 0, p.cfg.BatchMax)
	ticker := time.NewTicker(p.cfg.BatchInterval)
	defer ticker.Stop()

	flush := func() {
		if len(batch) == 0 {
			return
		}
		toSend := batch
		batch = make([]Span, 0, p.cfg.BatchMax)
		ctx, cancel := context.WithTimeout(context.Background(), p.cfg.ExportTimeout)
		err := p.exporter.Export(ctx, toSend)
		cancel()
		if err != nil {
			p.errors.Add(1)
			return
		}
		p.exported.Add(uint64(len(toSend)))
	}

	for {
		select {
		case sp, ok := <-p.queue:
			if !ok {
				flush()
				return
			}
			batch = append(batch, sp)
			if len(batch) >= p.cfg.BatchMax {
				flush()
			}
		case <-ticker.C:
			flush()
		case <-p.stopCh:
			// Drain queue non-blocking with short deadline.
			deadline := time.After(p.cfg.FlushTimeout)
		drain:
			for {
				select {
				case sp, ok := <-p.queue:
					if !ok {
						break drain
					}
					batch = append(batch, sp)
					if len(batch) >= p.cfg.BatchMax {
						flush()
					}
				case <-deadline:
					break drain
				default:
					// empty
					if len(batch) > 0 {
						flush()
					}
					return
				}
			}
			flush()
			return
		}
	}
}

func (p *Provider) enqueue(sp Span) {
	if p == nil || !sp.Sampled {
		return
	}
	p.mu.Lock()
	closed := p.closed
	p.mu.Unlock()
	if closed {
		return
	}
	select {
	case p.queue <- sp:
	default:
		// Queue full: drop oldest strategy — try pop one then push; else drop new.
		select {
		case <-p.queue:
			p.dropped.Add(1)
		default:
		}
		select {
		case p.queue <- sp:
		default:
			p.dropped.Add(1)
		}
	}
}

// shouldSample decides recording based on ratio (deterministic on trace id nibble).
func (p *Provider) shouldSample(traceID string) bool {
	if p == nil {
		return false
	}
	r := p.cfg.SampleRatio
	if r >= 1 {
		return true
	}
	if r <= 0 {
		return false
	}
	// Use first 8 hex chars as uint for stable sampling.
	hexish := traceID
	if len(hexish) > 8 {
		hexish = hexish[:8]
	}
	var n uint64
	for _, c := range hexish {
		n <<= 4
		switch {
		case c >= '0' && c <= '9':
			n |= uint64(c - '0')
		case c >= 'a' && c <= 'f':
			n |= uint64(c - 'a' + 10)
		case c >= 'A' && c <= 'F':
			n |= uint64(c - 'A' + 10)
		}
	}
	threshold := uint64(r * float64(^uint64(0)>>32))
	return (n & 0xffffffff) < threshold
}

// StartSpan begins a child span from ctx. Returns ctx with span and an end function.
// End is safe to call once; attributes must be low-cardinality.
func (p *Provider) StartSpan(ctx context.Context, name string, kind SpanKind, attrs map[string]string) (context.Context, func(status SpanStatus, statusMsg string, extra map[string]string)) {
	noopEnd := func(SpanStatus, string, map[string]string) {}
	if p == nil || name == "" {
		return ctx, noopEnd
	}
	parent := SpanFromContext(ctx)
	traceID := parent.TraceID
	parentID := parent.SpanID
	sampled := parent.Sampled
	if traceID == "" {
		traceID = newTraceID()
		sampled = p.shouldSample(traceID)
	} else if !parent.Sampled {
		// Parent said not sampled — stay unsampled.
		sampled = false
	}
	spanID := newSpanID()
	start := time.Now().UTC()
	sc := SpanContext{TraceID: traceID, SpanID: spanID, ParentSpanID: parentID, Sampled: sampled}
	ctx = ContextWithSpan(ctx, sc)

	ended := atomic.Bool{}
	return ctx, func(status SpanStatus, statusMsg string, extra map[string]string) {
		if !ended.CompareAndSwap(false, true) {
			return
		}
		if !sampled {
			return
		}
		end := time.Now().UTC()
		if status == "" {
			status = StatusOK
		}
		merged := sanitizeAttrs(attrs)
		for k, v := range sanitizeAttrs(extra) {
			merged[k] = v
		}
		sp := Span{
			TraceID:      traceID,
			SpanID:       spanID,
			ParentSpanID: parentID,
			Name:         name,
			Kind:         kind,
			StartUnixNs:  start.UnixNano(),
			EndUnixNs:    end.UnixNano(),
			Status:       status,
			StatusMsg:    truncate(statusMsg, 128),
			Attrs:        merged,
			Service:      p.cfg.Resource.Service,
			Env:          p.cfg.Resource.Env,
			Release:      p.cfg.Resource.Release,
			Sampled:      true,
		}
		p.enqueue(sp)
	}
}

// ContextWithSpan attaches span context.
func ContextWithSpan(ctx context.Context, sc SpanContext) context.Context {
	return context.WithValue(ctx, spanCtxKey{}, sc)
}

// SpanFromContext returns the active span context or zero.
func SpanFromContext(ctx context.Context) SpanContext {
	if ctx == nil {
		return SpanContext{}
	}
	sc, _ := ctx.Value(spanCtxKey{}).(SpanContext)
	return sc
}

// InjectW3C returns a traceparent header value for sc.
func InjectW3C(sc SpanContext) string {
	if sc.TraceID == "" || sc.SpanID == "" {
		return ""
	}
	flags := "00"
	if sc.Sampled {
		flags = "01"
	}
	return "00-" + sc.TraceID + "-" + sc.SpanID + "-" + flags
}

// ExtractW3C parses a traceparent header into SpanContext.
func ExtractW3C(tp string) (SpanContext, bool) {
	tp = strings.TrimSpace(tp)
	parts := strings.Split(tp, "-")
	if len(parts) != 4 {
		return SpanContext{}, false
	}
	if len(parts[0]) != 2 || len(parts[1]) != 32 || len(parts[2]) != 16 || len(parts[3]) != 2 {
		return SpanContext{}, false
	}
	if parts[1] == "00000000000000000000000000000000" || parts[2] == "0000000000000000" {
		return SpanContext{}, false
	}
	// W3C: flags bit 0 is sampled
	sampled := len(parts[3]) == 2 && parts[3][1] == '1'
	return SpanContext{
		TraceID: strings.ToLower(parts[1]),
		SpanID:  strings.ToLower(parts[2]),
		Sampled: sampled,
	}, true
}

// StartSpanGlobal uses the process global provider (no-op end if unset).
func StartSpanGlobal(ctx context.Context, name string, kind SpanKind, attrs map[string]string) (context.Context, func(status SpanStatus, statusMsg string, extra map[string]string)) {
	return GlobalProvider().StartSpan(ctx, name, kind, attrs)
}

func newTraceID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	// Reject all-zero
	allZero := true
	for _, v := range b {
		if v != 0 {
			allZero = false
			break
		}
	}
	if allZero {
		b[0] = 1
	}
	return hex.EncodeToString(b[:])
}

func newSpanID() string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	allZero := true
	for _, v := range b {
		if v != 0 {
			allZero = false
			break
		}
	}
	if allZero {
		b[0] = 1
	}
	return hex.EncodeToString(b[:])
}

// Allowed attribute keys (low-cardinality). Others are dropped.
var allowedAttrKeys = map[string]struct{}{
	"http.method":        {},
	"http.route":         {},
	"http.status_code":   {},
	"error.class":        {},
	"rpc.system":         {},
	"db.system":          {},
	"db.operation":       {},
	"messaging.system":   {},
	"messaging.operation": {},
	"job.name":           {},
	"job.result":         {},
	"provider":           {},
	"provider.operation": {},
	"provider.result":    {},
	"component":          {},
	"request_id":         {},
	"service":            {},
	"env":                {},
	"release":            {},
	"route_class":        {},
	"span.kind":          {},
}

func sanitizeAttrs(in map[string]string) map[string]string {
	if len(in) == 0 {
		return nil
	}
	out := make(map[string]string, len(in))
	for k, v := range in {
		k = strings.TrimSpace(k)
		if k == "" {
			continue
		}
		if _, ok := allowedAttrKeys[k]; !ok {
			continue
		}
		v = truncate(strings.TrimSpace(v), 128)
		if v == "" {
			continue
		}
		// Never allow values that look like emails or long secrets.
		if strings.Contains(v, "@") || len(v) > 128 {
			continue
		}
		out[k] = v
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func truncate(s string, n int) string {
	if n <= 0 || len(s) <= n {
		return s
	}
	return s[:n]
}
