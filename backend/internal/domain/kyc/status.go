package kyc

import "fmt"

// CanTransition reports whether from → to is allowed by §5.4.
func CanTransition(from, to string) bool {
	if from == to {
		return true
	}
	allowed, ok := transitionMatrix[from]
	if !ok {
		return false
	}
	for _, a := range allowed {
		if a == to {
			return true
		}
	}
	return false
}

// transitionMatrix is the closed allowlist (§5.4).
var transitionMatrix = map[string][]string{
	StatusDraft: {
		StatusSubmitted,
	},
	StatusSubmitted: {
		StatusInReview,
	},
	StatusInReview: {
		StatusVendorCheck, StatusNeedsClarification, StatusApproved, StatusRejected,
	},
	StatusVendorCheck: {
		StatusInReview, StatusNeedsClarification, StatusApproved, StatusRejected,
	},
	StatusNeedsClarification: {
		StatusSubmitted, // explicit versioned resubmit
	},
	StatusApproved: {
		StatusExpired,
	},
	StatusRejected: {},
	StatusExpired:  {},
}

// AssertTransition returns an error if the edge is forbidden.
func AssertTransition(from, to string) error {
	if CanTransition(from, to) {
		return nil
	}
	return fmt.Errorf("kyc: invalid transition %s -> %s", from, to)
}

// IsTerminal reports terminal case statuses (resubmission creates successor DRAFT).
func IsTerminal(status string) bool {
	switch status {
	case StatusRejected, StatusExpired:
		return true
	default:
		return false
	}
}

// IsOpen reports non-terminal reviewable statuses for the open-case unique index.
func IsOpen(status string) bool {
	switch status {
	case StatusDraft, StatusSubmitted, StatusInReview, StatusVendorCheck, StatusNeedsClarification:
		return true
	default:
		return false
	}
}

// RequiresReason reports whether the target status mandates a non-empty reason.
func RequiresReason(to string) bool {
	switch to {
	case StatusRejected, StatusNeedsClarification:
		return true
	default:
		return false
	}
}

// AdminActionToStatus maps admin action codes to target status.
func AdminActionToStatus(action string) (string, bool) {
	switch action {
	case ActionStartReview:
		return StatusInReview, true
	case ActionVendorCheck:
		return StatusVendorCheck, true
	case ActionNeedsClarify:
		return StatusNeedsClarification, true
	case ActionApprove:
		return StatusApproved, true
	case ActionReject:
		return StatusRejected, true
	case ActionExpire:
		return StatusExpired, true
	default:
		return "", false
	}
}

// ValidDocumentType reports closed-set document type.
func ValidDocumentType(t string) bool {
	switch t {
	case DocIDFront, DocIDBack, DocSelfie, DocBusinessLicense, DocTaxID, DocOther:
		return true
	default:
		return false
	}
}
