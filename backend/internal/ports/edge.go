package ports

import (
	"context"
	"time"
)

// EdgeProvisioner provisions/deprovisions custom-domain edge routing and TLS.
// All operations are idempotent for the same (hostname, version, op) key.
type EdgeProvisioner interface {
	// ProvisionHost installs routing + certificate for hostname.
	// IdempotencyKey must be stable for retries of the same domain version.
	ProvisionHost(ctx context.Context, in EdgeProvisionInput) (EdgeProvisionResult, error)
	// RemoveHost removes routing/certificate before hostname release.
	RemoveHost(ctx context.Context, in EdgeRemoveInput) (EdgeRemoveResult, error)
	// Status reports current edge/TLS projection (optional; may be synthetic).
	Status(ctx context.Context, hostname string) (EdgeStatus, error)
}

// EdgeProvisionInput is the provision command.
type EdgeProvisionInput struct {
	Hostname       string
	StoreID        string
	MerchantID     string
	DomainID       string
	DomainVersion  int32
	IdempotencyKey string
}

// EdgeProvisionResult is the provision outcome.
type EdgeProvisionResult struct {
	TLSStatus     string // maps to domains.TLS*
	CertificateID string
	ProvisionedAt time.Time
}

// EdgeRemoveInput is the remove command.
type EdgeRemoveInput struct {
	Hostname       string
	DomainID       string
	DomainVersion  int32
	IdempotencyKey string
}

// EdgeRemoveResult is the remove outcome.
type EdgeRemoveResult struct {
	TLSStatus string
	RemovedAt time.Time
}

// EdgeStatus is a read of current edge state.
type EdgeStatus struct {
	Hostname  string
	TLSStatus string
	Present   bool
}
