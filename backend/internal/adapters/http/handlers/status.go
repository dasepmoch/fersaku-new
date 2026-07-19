package handlers

import (
	"net/http"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/middleware"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/config"
)

// StatusDeps are dependencies for GET /v1/status.
type StatusDeps struct {
	Service   string
	Version   string
	AppEnv    config.Env
	StartedAt time.Time
	// TrustedProxyMode is "direct" or "proxy" (safe diagnostics; no raw headers).
	TrustedProxyMode string
	// TrustedProxyCIDRs are resolved peer CIDRs (safe; no secrets).
	TrustedProxyCIDRs []string
	// RateLimitErrors optional backend error counter for degraded signal.
	RateLimitErrors *middleware.ClassLimiterErrors
}

// StatusResponse is the public status payload (no secrets).
type StatusResponse struct {
	Service string `json:"service"`
	Version string `json:"version"`
	AppEnv  string `json:"appEnv"`
	// UptimeSeconds is process uptime; safe operational signal.
	UptimeSeconds int64 `json:"uptimeSeconds"`
	// TrustedProxy is resolved peer policy (no raw XFF/headers).
	TrustedProxy map[string]any `json:"trustedProxy,omitempty"`
	// RateLimitDegraded is true when Redis/backend limiter errors were observed.
	RateLimitDegraded bool `json:"rateLimitDegraded,omitempty"`
}

// Status handles GET /v1/status — service version and app env, envelope-wrapped.
func (d StatusDeps) Status(w http.ResponseWriter, r *http.Request) {
	version := d.Version
	if version == "" {
		version = "0.0.0-dev"
	}
	var uptime int64
	if !d.StartedAt.IsZero() {
		uptime = int64(time.Since(d.StartedAt).Seconds())
		if uptime < 0 {
			uptime = 0
		}
	}
	mode := d.TrustedProxyMode
	if mode == "" {
		if len(d.TrustedProxyCIDRs) == 0 {
			mode = "direct"
		} else {
			mode = "proxy"
		}
	}
	resp := StatusResponse{
		Service:       d.Service,
		Version:       version,
		AppEnv:        string(d.AppEnv),
		UptimeSeconds: uptime,
		TrustedProxy: map[string]any{
			"mode":       mode,
			"cidrCount":  len(d.TrustedProxyCIDRs),
			"cidrs":      append([]string(nil), d.TrustedProxyCIDRs...),
			"xffTrusted": mode == "proxy" && len(d.TrustedProxyCIDRs) > 0,
		},
	}
	if d.RateLimitErrors != nil && d.RateLimitErrors.Count() > 0 {
		resp.RateLimitDegraded = true
	}
	presenters.WriteData(w, r, http.StatusOK, resp)
}
