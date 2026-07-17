package dnsadapter

import (
	"context"
	"strings"
	"sync"

	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// Fake is an in-memory DNS TXT adapter for tests (no shell dig).
type Fake struct {
	mu      sync.RWMutex
	records map[string][]string // name (lower) -> TXT values
	// FailNext when >0 causes next LookupTXT to error.
	FailNext int
	// CallCount increments per LookupTXT.
	CallCount int
}

// NewFake returns an empty fake DNS adapter.
func NewFake() *Fake {
	return &Fake{records: make(map[string][]string)}
}

var _ ports.DNSLookup = (*Fake)(nil)

// SetTXT replaces TXT records for name (case-insensitive).
func (f *Fake) SetTXT(name string, values ...string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	key := strings.ToLower(strings.TrimSuffix(strings.TrimSpace(name), "."))
	cp := make([]string, len(values))
	copy(cp, values)
	f.records[key] = cp
}

// ClearTXT removes records for name.
func (f *Fake) ClearTXT(name string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	key := strings.ToLower(strings.TrimSuffix(strings.TrimSpace(name), "."))
	delete(f.records, key)
}

// LookupTXT implements ports.DNSLookup.
func (f *Fake) LookupTXT(ctx context.Context, name string) ([]string, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.CallCount++
	if f.FailNext > 0 {
		f.FailNext--
		return nil, context.DeadlineExceeded
	}
	key := strings.ToLower(strings.TrimSuffix(strings.TrimSpace(name), "."))
	vals := f.records[key]
	if vals == nil {
		return []string{}, nil
	}
	out := make([]string, len(vals))
	copy(out, vals)
	return out, nil
}
