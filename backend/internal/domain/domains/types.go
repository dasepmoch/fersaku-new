package domains

import "time"

// Domain lifecycle statuses (§5.10 + takeover tombstone).
const (
	StatusPendingDNS = "PENDING_DNS"
	StatusVerifying  = "VERIFYING"
	StatusActive     = "ACTIVE"
	StatusFailed     = "FAILED"
	StatusSuspended  = "SUSPENDED"
	StatusRemoving   = "REMOVING"
	StatusTombstoned = "TOMBSTONED"
)

// TLS/certificate projection statuses.
const (
	TLSNone     = "NONE"
	TLSPending  = "PENDING"
	TLSActive   = "ACTIVE"
	TLSFailed   = "FAILED"
	TLSRemoving = "REMOVING"
	TLSRemoved  = "REMOVED"
)

// DNS verification record name prefix (TXT).
const VerificationNamePrefix = "_fersaku-challenge"

// DefaultTakeoverCooldown is how long a tombstone holds the hostname after removal.
const DefaultTakeoverCooldown = 24 * time.Hour

// RevalidationGrace is how long ACTIVE may fail revalidation before SUSPENDED.
const RevalidationGrace = 72 * time.Hour

// RevalidationInterval is the default next_check cadence for ACTIVE domains.
const RevalidationInterval = 6 * time.Hour

// Domain is a store custom-domain claim row.
type Domain struct {
	ID                    string
	StoreID               string
	MerchantID            string
	HostnameNormalized    string
	HostnameDisplay       string
	Status                string
	VerificationTokenHash string
	ExpectedDNSName       string
	ExpectedDNSValue      string
	Version               int32
	TLSStatus             string
	FailureCode           *string
	LastCheckedAt         *time.Time
	NextCheckAt           *time.Time
	VerifiedAt            *time.Time
	EdgeProvisionedAt     *time.Time
	EdgeRemovedAt         *time.Time
	CooldownUntil         *time.Time
	SuspendedAt           *time.Time
	RemovingAt            *time.Time
	TombstonedAt          *time.Time
	CreatedAt             time.Time
	UpdatedAt             time.Time
}

// ClaimsHostname reports whether the status still occupies the global hostname claim.
func ClaimsHostname(status string) bool {
	switch status {
	case StatusPendingDNS, StatusVerifying, StatusActive, StatusFailed,
		StatusSuspended, StatusRemoving, StatusTombstoned:
		return true
	default:
		return false
	}
}

// IsRoutable is true only for ACTIVE domains with ready TLS.
func IsRoutable(d Domain) bool {
	return d.Status == StatusActive && d.TLSStatus == TLSActive
}

// ExpectedTXTName returns the FQDN for the verification TXT record.
func ExpectedTXTName(hostnameNormalized string) string {
	return VerificationNamePrefix + "." + hostnameNormalized
}
