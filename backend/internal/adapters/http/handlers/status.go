package handlers

import (
	"net/http"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/config"
)

// StatusDeps are dependencies for GET /v1/status.
type StatusDeps struct {
	Service   string
	Version   string
	AppEnv    config.Env
	StartedAt time.Time
}

// StatusResponse is the public status payload (no secrets).
type StatusResponse struct {
	Service string `json:"service"`
	Version string `json:"version"`
	AppEnv  string `json:"appEnv"`
	// UptimeSeconds is process uptime; safe operational signal.
	UptimeSeconds int64 `json:"uptimeSeconds"`
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
	presenters.WriteData(w, r, http.StatusOK, StatusResponse{
		Service:       d.Service,
		Version:       version,
		AppEnv:        string(d.AppEnv),
		UptimeSeconds: uptime,
	})
}
