package admin

import (
	"strings"
	"time"
)

// Impersonation scopes (ADR-0004 / §11.5). No PRIVILEGED/FULL.
const (
	ImpersonationScopeReadOnly     = "READ_ONLY"
	ImpersonationScopeSupportWrite = "SUPPORT_WRITE"
)

// Impersonation lifecycle statuses (§5.6).
const (
	ImpersonationStatusActive     = "ACTIVE"
	ImpersonationStatusExpired    = "EXPIRED"
	ImpersonationStatusTerminated = "TERMINATED"
	ImpersonationStatusRevoked    = "REVOKED"
)

// Impersonation audit actions.
const (
	ActionImpersonationStart        = "impersonation.start"
	ActionImpersonationTerminate    = "impersonation.terminate"
	ActionImpersonationSupportWrite = "impersonation.support_write"
)

// Allowed TTLs in minutes.
var ImpersonationTTLs = []int{15, 30, 60}

// ValidImpersonationScope rejects unknown and full-like scopes.
func ValidImpersonationScope(scope string) bool {
	switch strings.ToUpper(strings.TrimSpace(scope)) {
	case ImpersonationScopeReadOnly, ImpersonationScopeSupportWrite:
		return true
	default:
		return false
	}
}

// NormalizeImpersonationScope uppercases a valid scope.
func NormalizeImpersonationScope(scope string) string {
	return strings.ToUpper(strings.TrimSpace(scope))
}

// ValidImpersonationTTL reports whether minutes is 15|30|60.
func ValidImpersonationTTL(minutes int) bool {
	for _, t := range ImpersonationTTLs {
		if t == minutes {
			return true
		}
	}
	return false
}

// IsPrivilegedLikeScope detects forbidden scope strings for validation errors.
func IsPrivilegedLikeScope(scope string) bool {
	s := strings.ToUpper(strings.TrimSpace(scope))
	switch s {
	case "PRIVILEGED", "FULL", "FULL_ACCESS", "ADMIN", "UNRESTRICTED", "WRITE_ALL":
		return true
	default:
		return false
	}
}

// ImpersonationSession is the durable impersonation row.
type ImpersonationSession struct {
	ID                string     `json:"id"`
	ActorAdminID      string     `json:"actorAdminId"`
	TargetUserID      string     `json:"targetUserId"`
	TargetMerchantID  *string    `json:"targetMerchantId,omitempty"`
	Scope             string     `json:"scope"`
	Status            string     `json:"status"`
	Reason            string     `json:"reason"`
	Ticket            string     `json:"ticket,omitempty"`
	MFAAt             time.Time  `json:"mfaAt"`
	OriginalSessionID string     `json:"originalSessionId"`
	DerivedSessionID  string     `json:"derivedSessionId"`
	SessionTokenHash  string     `json:"-"`
	ExpiresAt         time.Time  `json:"expiresAt"`
	EndedAt           *time.Time `json:"endedAt,omitempty"`
	EndedBy           *string    `json:"endedBy,omitempty"`
	EndReason         *string    `json:"endReason,omitempty"`
	CreatedAt         time.Time  `json:"createdAt"`
	UpdatedAt         time.Time  `json:"updatedAt"`
}

// Active reports whether the session is still usable at now.
func (s ImpersonationSession) Active(now time.Time) bool {
	if s.Status != ImpersonationStatusActive {
		return false
	}
	if s.EndedAt != nil {
		return false
	}
	return s.ExpiresAt.After(now)
}

// ImpersonationBanner is the server-derived banner DTO for the client.
type ImpersonationBanner struct {
	SessionID    string    `json:"sessionId"`
	ActorAdminID string    `json:"actorAdminId"`
	TargetUserID string    `json:"targetUserId"`
	TargetName   string    `json:"targetName"`
	TargetEmail  string    `json:"targetEmail,omitempty"`
	Scope        string    `json:"scope"`
	Reason       string    `json:"reason"`
	Ticket       string    `json:"ticket,omitempty"`
	StartedAt    time.Time `json:"startedAt"`
	ExpiresAt    time.Time `json:"expiresAt"`
	TTLMinutes   int       `json:"ttlMinutes"`
}
