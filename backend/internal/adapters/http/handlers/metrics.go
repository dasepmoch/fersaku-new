package handlers

import (
	"net/http"

	"github.com/dasepmoch/fersaku-new/backend/internal/platform/metrics"
)

// MetricsDeps serves GET /metrics (Prometheus text exposition).
// Public scrape endpoint by design for local/staging; production should
// restrict via network policy / ingress (see runbooks).
type MetricsDeps struct {
	Registry *metrics.Metrics
}

// Metrics handles GET /metrics — Prometheus text/plain; version=0.0.4.
func (d MetricsDeps) Metrics(w http.ResponseWriter, r *http.Request) {
	reg := d.Registry
	if reg == nil {
		reg = metrics.Global
	}
	body := reg.PrometheusText()
	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(body))
}
