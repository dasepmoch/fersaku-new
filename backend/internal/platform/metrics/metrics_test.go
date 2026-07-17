package metrics_test

import (
	"strings"
	"testing"

	"github.com/dasepmoch/fersaku-new/backend/internal/platform/metrics"
)

func TestPrometheusTextContainsFamilies(t *testing.T) {
	m := metrics.NewMetrics()
	m.IncHTTP("GET", "/health/live", "200", 3)
	m.IncPaymentPaid()
	m.IncCallback("accepted")
	m.IncWebhook("success")
	m.IncAuditChain("ok")
	body := m.PrometheusText()
	for _, want := range []string{
		"fersaku_http_requests_total",
		"fersaku_payment_paid_total",
		"fersaku_callback_processed_total",
		"fersaku_webhook_delivery_total",
		"fersaku_audit_chain_status_total",
		"fersaku_outbox_pending",
		"text/plain", // not in body — skip
	} {
		if want == "text/plain" {
			continue
		}
		if !strings.Contains(body, want) {
			t.Fatalf("missing %q in:\n%s", want, body)
		}
	}
	if !strings.Contains(body, `method="GET"`) {
		t.Fatal("expected method label")
	}
}
