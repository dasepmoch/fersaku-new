package edgeadapter

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/domains"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// Fake is an in-memory edge/TLS provisioner (idempotent).
type Fake struct {
	mu    sync.Mutex
	hosts map[string]hostState // hostname -> state
	// FailProvision when true returns error on ProvisionHost.
	FailProvision bool
	// FailRemove when true returns error on RemoveHost.
	FailRemove bool
	// StaleRejectVersion when >0 rejects provision/remove with lower DomainVersion.
	// (Tests use explicit version checks via domain service; fake always accepts.)
	ProvisionCalls int
	RemoveCalls    int
}

type hostState struct {
	StoreID       string
	DomainID      string
	DomainVersion int32
	TLSStatus     string
	IdemKeys      map[string]struct{}
	Present       bool
	ProvisionedAt time.Time
	RemovedAt     time.Time
}

// NewFake returns an empty edge fake.
func NewFake() *Fake {
	return &Fake{hosts: make(map[string]hostState)}
}

var _ ports.EdgeProvisioner = (*Fake)(nil)

func (f *Fake) key(hostname string) string {
	return strings.ToLower(strings.TrimSpace(hostname))
}

// ProvisionHost implements ports.EdgeProvisioner.
func (f *Fake) ProvisionHost(ctx context.Context, in ports.EdgeProvisionInput) (ports.EdgeProvisionResult, error) {
	if err := ctx.Err(); err != nil {
		return ports.EdgeProvisionResult{}, err
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.ProvisionCalls++
	if f.FailProvision {
		return ports.EdgeProvisionResult{}, fmt.Errorf("edge: provision failed")
	}
	k := f.key(in.Hostname)
	st, ok := f.hosts[k]
	if !ok {
		st = hostState{IdemKeys: make(map[string]struct{})}
	}
	if st.IdemKeys == nil {
		st.IdemKeys = make(map[string]struct{})
	}
	// Idempotent replay of same key.
	if _, seen := st.IdemKeys[in.IdempotencyKey]; seen && st.Present {
		return ports.EdgeProvisionResult{
			TLSStatus:     st.TLSStatus,
			CertificateID: "cert_" + k,
			ProvisionedAt: st.ProvisionedAt,
		}, nil
	}
	// Stale version: if a newer provision already applied, reject lower version.
	if st.Present && st.DomainVersion > in.DomainVersion {
		return ports.EdgeProvisionResult{}, fmt.Errorf("edge: stale domain version")
	}
	now := time.Now().UTC()
	st.StoreID = in.StoreID
	st.DomainID = in.DomainID
	st.DomainVersion = in.DomainVersion
	st.TLSStatus = domains.TLSActive
	st.Present = true
	st.ProvisionedAt = now
	st.IdemKeys[in.IdempotencyKey] = struct{}{}
	f.hosts[k] = st
	return ports.EdgeProvisionResult{
		TLSStatus:     domains.TLSActive,
		CertificateID: "cert_" + k,
		ProvisionedAt: now,
	}, nil
}

// RemoveHost implements ports.EdgeProvisioner.
func (f *Fake) RemoveHost(ctx context.Context, in ports.EdgeRemoveInput) (ports.EdgeRemoveResult, error) {
	if err := ctx.Err(); err != nil {
		return ports.EdgeRemoveResult{}, err
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.RemoveCalls++
	if f.FailRemove {
		return ports.EdgeRemoveResult{}, fmt.Errorf("edge: remove failed")
	}
	k := f.key(in.Hostname)
	st, ok := f.hosts[k]
	if !ok {
		st = hostState{IdemKeys: make(map[string]struct{})}
	}
	if st.IdemKeys == nil {
		st.IdemKeys = make(map[string]struct{})
	}
	if _, seen := st.IdemKeys[in.IdempotencyKey]; seen && !st.Present {
		return ports.EdgeRemoveResult{TLSStatus: domains.TLSRemoved, RemovedAt: st.RemovedAt}, nil
	}
	// Stale: do not remove a newer provision with older version key.
	if st.Present && st.DomainVersion > in.DomainVersion {
		return ports.EdgeRemoveResult{}, fmt.Errorf("edge: stale domain version on remove")
	}
	now := time.Now().UTC()
	st.Present = false
	st.TLSStatus = domains.TLSRemoved
	st.RemovedAt = now
	st.IdemKeys[in.IdempotencyKey] = struct{}{}
	f.hosts[k] = st
	return ports.EdgeRemoveResult{TLSStatus: domains.TLSRemoved, RemovedAt: now}, nil
}

// Status implements ports.EdgeProvisioner.
func (f *Fake) Status(ctx context.Context, hostname string) (ports.EdgeStatus, error) {
	if err := ctx.Err(); err != nil {
		return ports.EdgeStatus{}, err
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	st, ok := f.hosts[f.key(hostname)]
	if !ok {
		return ports.EdgeStatus{Hostname: hostname, TLSStatus: domains.TLSNone, Present: false}, nil
	}
	return ports.EdgeStatus{Hostname: hostname, TLSStatus: st.TLSStatus, Present: st.Present}, nil
}

// IsPresent reports whether routing is currently installed.
func (f *Fake) IsPresent(hostname string) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	st, ok := f.hosts[f.key(hostname)]
	return ok && st.Present
}
