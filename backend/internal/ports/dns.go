package ports

import (
	"context"
	"time"
)

// DNSLookup is a bounded DNS TXT resolver for domain verification.
// Implementations must never shell-execute dig/nslookup or URL-fetch DNS text.
type DNSLookup interface {
	// LookupTXT returns TXT records for name. Callers enforce answer limits.
	// Empty slice with nil error means no records (not NXDOMAIN distinction required).
	LookupTXT(ctx context.Context, name string) ([]string, error)
}

// DNSLookupConfig bounds resolver behavior.
type DNSLookupConfig struct {
	Timeout    time.Duration // default 3s
	MaxAnswers int           // default 16
	MaxDepth   int           // CNAME follow depth; default 3
}

// DefaultDNSLookupConfig returns production-safe bounds.
func DefaultDNSLookupConfig() DNSLookupConfig {
	return DNSLookupConfig{
		Timeout:    3 * time.Second,
		MaxAnswers: 16,
		MaxDepth:   3,
	}
}
