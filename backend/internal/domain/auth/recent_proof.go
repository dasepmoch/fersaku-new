package auth

import (
	"strings"
	"time"
)

// Recent MFA proof purposes (INT-140). Opaque proof is never a TOTP/seed.
const (
	ProofPurposeInventoryReveal   = "inventory.reveal"
	ProofPurposeCredentialsRotate = "credentials.rotate"
	ProofPurposeBankChange        = "bank.change"
	ProofPurposeWithdrawalCreate  = "withdrawal.create"
	ProofPurposeAdminCommand      = "admin.command"
	ProofPurposeKYCDocumentView   = "kyc.document.view"
)

// RecentProofTTL is the maximum lifetime of a minted step-up proof.
const RecentProofTTL = 5 * time.Minute

// RecentProofFactor records which factor was used to mint the proof.
type RecentProofFactor string

const (
	ProofFactorTOTP     RecentProofFactor = "totp"
	ProofFactorRecovery RecentProofFactor = "recovery"
	ProofFactorPassword RecentProofFactor = "password"
)

// ValidProofPurpose reports whether purpose is an allowed step-up scope.
func ValidProofPurpose(purpose string) bool {
	switch strings.TrimSpace(purpose) {
	case ProofPurposeInventoryReveal,
		ProofPurposeCredentialsRotate,
		ProofPurposeBankChange,
		ProofPurposeWithdrawalCreate,
		ProofPurposeAdminCommand,
		ProofPurposeKYCDocumentView:
		return true
	default:
		return false
	}
}

// RecentMFAProof is a server-side row; only ProofHash is stored at rest.
type RecentMFAProof struct {
	ID         string
	UserID     string
	SessionID  string
	Purpose    string
	ProofHash  string
	Factor     RecentProofFactor
	ExpiresAt  time.Time
	ConsumedAt *time.Time
	CreatedAt  time.Time
}

// IsUsable reports whether the proof can still be consumed at now.
func (p RecentMFAProof) IsUsable(now time.Time) bool {
	if p.ConsumedAt != nil {
		return false
	}
	return p.ExpiresAt.After(now)
}
