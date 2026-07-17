// Package handlers contains HTTP handlers (transport only; no domain rules).
package handlers

import (
	"net/http"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
)

// HealthDeps are dependencies for health endpoints.
// Health probes intentionally do NOT use the success envelope — they remain
// lightweight for load balancers (status/check/service only).
type HealthDeps struct {
	// ReadyFn reports whether the process can accept traffic.
	ReadyFn func() bool
	// StartedAt is process start time for uptime metadata.
	StartedAt time.Time
	Service   string
}

// Live handles GET /health/live — process is up.
func (d HealthDeps) Live(w http.ResponseWriter, r *http.Request) {
	presenters.WriteRawJSON(w, http.StatusOK, map[string]any{
		"status":  "ok",
		"check":   "live",
		"service": d.Service,
	})
}

// Ready handles GET /health/ready — dependencies allow traffic.
func (d HealthDeps) Ready(w http.ResponseWriter, r *http.Request) {
	ok := true
	if d.ReadyFn != nil {
		ok = d.ReadyFn()
	}
	status := http.StatusOK
	state := "ready"
	if !ok {
		status = http.StatusServiceUnavailable
		state = "not_ready"
	}
	presenters.WriteRawJSON(w, status, map[string]any{
		"status":  state,
		"check":   "ready",
		"service": d.Service,
	})
}
