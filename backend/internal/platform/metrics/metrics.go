// Package metrics is a process-local Prometheus-compatible registry (BE-600).
// Application and jobs may import this package; adapters re-export as needed.
// Label values must be low-cardinality — never emails, order IDs, payment refs, or API keys.
package metrics

import (
	"fmt"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Metrics is a process-local Prometheus-compatible registry.
type Metrics struct {
	mu sync.Mutex

	httpRequests      map[string]*atomic.Uint64
	paymentPaid       atomic.Uint64
	callbackProcessed map[string]*atomic.Uint64
	webhookDelivered  map[string]*atomic.Uint64
	auditChainChecks  map[string]*atomic.Uint64
	malwareScans      map[string]*atomic.Uint64
	malwareQuarantine atomic.Uint64 // backlog gauge source (set, not add)

	httpLatencySum     map[string]*atomic.Uint64
	httpLatencyCount   map[string]*atomic.Uint64
	httpLatencyBuckets map[string]*latencyBuckets

	scrapeGauges func() map[string]float64
}

type latencyBuckets struct {
	counts [11]atomic.Uint64
}

var defaultLatencyBounds = []float64{5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000}

// Global is the default process metrics registry used by HTTP/workers.
var Global = NewMetrics()

// NewMetrics creates an empty registry.
func NewMetrics() *Metrics {
	return &Metrics{
		httpRequests:       make(map[string]*atomic.Uint64),
		callbackProcessed:  make(map[string]*atomic.Uint64),
		webhookDelivered:   make(map[string]*atomic.Uint64),
		auditChainChecks:   make(map[string]*atomic.Uint64),
		malwareScans:       make(map[string]*atomic.Uint64),
		httpLatencySum:     make(map[string]*atomic.Uint64),
		httpLatencyCount:   make(map[string]*atomic.Uint64),
		httpLatencyBuckets: make(map[string]*latencyBuckets),
	}
}

// SetScrapeGauges registers a function invoked on each /metrics scrape.
func (m *Metrics) SetScrapeGauges(fn func() map[string]float64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.scrapeGauges = fn
}

func (m *Metrics) counterGet(store map[string]*atomic.Uint64, key string) *atomic.Uint64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	c, ok := store[key]
	if !ok {
		c = &atomic.Uint64{}
		store[key] = c
	}
	return c
}

// IncHTTP records one finished HTTP request.
func (m *Metrics) IncHTTP(method, route, status string, latencyMs float64) {
	if route == "" {
		route = "unknown"
	}
	if method == "" {
		method = "UNKNOWN"
	}
	if status == "" {
		status = "0"
	}
	key := method + "|" + route + "|" + status
	m.counterGet(m.httpRequests, key).Add(1)

	routeKey := method + "|" + route
	m.mu.Lock()
	sum, ok := m.httpLatencySum[routeKey]
	if !ok {
		sum = &atomic.Uint64{}
		m.httpLatencySum[routeKey] = sum
		m.httpLatencyCount[routeKey] = &atomic.Uint64{}
		m.httpLatencyBuckets[routeKey] = &latencyBuckets{}
	}
	cnt := m.httpLatencyCount[routeKey]
	b := m.httpLatencyBuckets[routeKey]
	m.mu.Unlock()

	ms := uint64(0)
	if latencyMs > 0 {
		ms = uint64(latencyMs)
	}
	sum.Add(ms)
	cnt.Add(1)
	for i, bound := range defaultLatencyBounds {
		if latencyMs <= bound {
			b.counts[i].Add(1)
		}
	}
}

// IncPaymentPaid increments payment paid finalization counter.
func (m *Metrics) IncPaymentPaid() { m.paymentPaid.Add(1) }

// IncCallback records inbound callback processing result.
func (m *Metrics) IncCallback(result string) {
	if result == "" {
		result = "unknown"
	}
	m.counterGet(m.callbackProcessed, result).Add(1)
}

// IncWebhook records outbound seller webhook delivery result.
func (m *Metrics) IncWebhook(result string) {
	if result == "" {
		result = "unknown"
	}
	m.counterGet(m.webhookDelivered, result).Add(1)
}

// IncAuditChain records integrity check result: ok|broken
func (m *Metrics) IncAuditChain(result string) {
	if result == "" {
		result = "unknown"
	}
	m.counterGet(m.auditChainChecks, result).Add(1)
}

// IncMalwareScan records a scan outcome: clean|infected|error|timeout|quarantine|dead_letter
func (m *Metrics) IncMalwareScan(result string) {
	if result == "" {
		result = "unknown"
	}
	m.counterGet(m.malwareScans, result).Add(1)
}

// SetMalwareQuarantineBacklog sets the SCANNING object backlog gauge.
func (m *Metrics) SetMalwareQuarantineBacklog(n float64) {
	if n < 0 {
		n = 0
	}
	m.malwareQuarantine.Store(uint64(n))
}

// WritePrometheus writes Prometheus text exposition format 0.0.4.
func (m *Metrics) WritePrometheus(b *strings.Builder) {
	m.mu.Lock()
	httpKeys := sortedKeys(m.httpRequests)
	cbKeys := sortedKeys(m.callbackProcessed)
	whKeys := sortedKeys(m.webhookDelivered)
	audKeys := sortedKeys(m.auditChainChecks)
	mwKeys := sortedKeys(m.malwareScans)
	latKeys := sortedKeys(m.httpLatencySum)
	scrape := m.scrapeGauges
	m.mu.Unlock()

	b.WriteString("# HELP fersaku_http_requests_total HTTP requests by method, route template, and status code.\n")
	b.WriteString("# TYPE fersaku_http_requests_total counter\n")
	for _, k := range httpKeys {
		parts := strings.SplitN(k, "|", 3)
		if len(parts) != 3 {
			continue
		}
		v := m.counterGet(m.httpRequests, k).Load()
		fmt.Fprintf(b, `fersaku_http_requests_total{method=%q,route=%q,status=%q} %d`+"\n",
			parts[0], parts[1], parts[2], v)
	}

	b.WriteString("# HELP fersaku_http_request_duration_ms HTTP request latency in milliseconds.\n")
	b.WriteString("# TYPE fersaku_http_request_duration_ms histogram\n")
	for _, k := range latKeys {
		parts := strings.SplitN(k, "|", 2)
		if len(parts) != 2 {
			continue
		}
		m.mu.Lock()
		sum := m.httpLatencySum[k]
		cnt := m.httpLatencyCount[k]
		bk := m.httpLatencyBuckets[k]
		m.mu.Unlock()
		if sum == nil || cnt == nil || bk == nil {
			continue
		}
		total := cnt.Load()
		for i, bound := range defaultLatencyBounds {
			fmt.Fprintf(b, `fersaku_http_request_duration_ms_bucket{method=%q,route=%q,le=%q} %d`+"\n",
				parts[0], parts[1], formatLe(bound), bk.counts[i].Load())
		}
		fmt.Fprintf(b, `fersaku_http_request_duration_ms_bucket{method=%q,route=%q,le="+Inf"} %d`+"\n",
			parts[0], parts[1], total)
		fmt.Fprintf(b, `fersaku_http_request_duration_ms_sum{method=%q,route=%q} %d`+"\n",
			parts[0], parts[1], sum.Load())
		fmt.Fprintf(b, `fersaku_http_request_duration_ms_count{method=%q,route=%q} %d`+"\n",
			parts[0], parts[1], total)
	}

	b.WriteString("# HELP fersaku_payment_paid_total Payments finalized to PAID (storefront + gateway).\n")
	b.WriteString("# TYPE fersaku_payment_paid_total counter\n")
	fmt.Fprintf(b, "fersaku_payment_paid_total %d\n", m.paymentPaid.Load())

	b.WriteString("# HELP fersaku_callback_processed_total Inbound Xendit callbacks by result.\n")
	b.WriteString("# TYPE fersaku_callback_processed_total counter\n")
	for _, k := range cbKeys {
		v := m.counterGet(m.callbackProcessed, k).Load()
		fmt.Fprintf(b, `fersaku_callback_processed_total{result=%q} %d`+"\n", k, v)
	}

	b.WriteString("# HELP fersaku_webhook_delivery_total Outbound seller webhook deliveries by result.\n")
	b.WriteString("# TYPE fersaku_webhook_delivery_total counter\n")
	for _, k := range whKeys {
		v := m.counterGet(m.webhookDelivered, k).Load()
		fmt.Fprintf(b, `fersaku_webhook_delivery_total{result=%q} %d`+"\n", k, v)
	}

	b.WriteString("# HELP fersaku_audit_chain_status_total Audit chain integrity checks by result.\n")
	b.WriteString("# TYPE fersaku_audit_chain_status_total counter\n")
	for _, k := range audKeys {
		v := m.counterGet(m.auditChainChecks, k).Load()
		fmt.Fprintf(b, `fersaku_audit_chain_status_total{result=%q} %d`+"\n", k, v)
	}

	b.WriteString("# HELP fersaku_malware_scan_total Malware scan outcomes by result.\n")
	b.WriteString("# TYPE fersaku_malware_scan_total counter\n")
	for _, k := range mwKeys {
		v := m.counterGet(m.malwareScans, k).Load()
		fmt.Fprintf(b, `fersaku_malware_scan_total{result=%q} %d`+"\n", k, v)
	}

	b.WriteString("# HELP fersaku_malware_quarantine_backlog Objects in SCANNING quarantine.\n")
	b.WriteString("# TYPE fersaku_malware_quarantine_backlog gauge\n")
	fmt.Fprintf(b, "fersaku_malware_quarantine_backlog %d\n", m.malwareQuarantine.Load())

	b.WriteString("# HELP fersaku_outbox_pending Gauge of pending/failed outbox rows available for work.\n")
	b.WriteString("# TYPE fersaku_outbox_pending gauge\n")
	b.WriteString("# HELP fersaku_outbox_oldest_age_seconds Age of oldest pending/failed outbox row in seconds.\n")
	b.WriteString("# TYPE fersaku_outbox_oldest_age_seconds gauge\n")
	b.WriteString("# HELP fersaku_audit_chain_head_sequence Current audit chain head sequence (default scope).\n")
	b.WriteString("# TYPE fersaku_audit_chain_head_sequence gauge\n")
	b.WriteString("# HELP fersaku_audit_chain_ok 1 if last integrity signal is healthy, 0 if broken.\n")
	b.WriteString("# TYPE fersaku_audit_chain_ok gauge\n")

	gauges := map[string]float64{
		"fersaku_outbox_pending":            0,
		"fersaku_outbox_oldest_age_seconds": 0,
		"fersaku_audit_chain_head_sequence": 0,
		"fersaku_audit_chain_ok":            1,
	}
	if scrape != nil {
		if g := scrape(); g != nil {
			for k, v := range g {
				gauges[k] = v
			}
		}
	}
	gKeys := make([]string, 0, len(gauges))
	for k := range gauges {
		gKeys = append(gKeys, k)
	}
	sort.Strings(gKeys)
	for _, k := range gKeys {
		fmt.Fprintf(b, "%s %g\n", k, gauges[k])
	}

	b.WriteString("# HELP fersaku_process_start_time_seconds Unix time process metrics registry was created (approx).\n")
	b.WriteString("# TYPE fersaku_process_start_time_seconds gauge\n")
	fmt.Fprintf(b, "fersaku_process_start_time_seconds %d\n", processStart.Unix())
}

var processStart = time.Now().UTC()

func formatLe(v float64) string {
	if v == float64(int64(v)) {
		return fmt.Sprintf("%d", int64(v))
	}
	return fmt.Sprintf("%g", v)
}

func sortedKeys(m map[string]*atomic.Uint64) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// PrometheusText returns the full exposition body.
func (m *Metrics) PrometheusText() string {
	var b strings.Builder
	b.Grow(4096)
	m.WritePrometheus(&b)
	return b.String()
}
