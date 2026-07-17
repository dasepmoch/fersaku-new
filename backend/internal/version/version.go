// Package version holds build-time service version metadata (no secrets).
package version

// Version is the service version string exposed on GET /v1/status.
// Override at link time: -ldflags "-X github.com/dasepmoch/fersaku-new/backend/internal/version.Version=1.2.3"
var Version = "0.0.0-dev"
