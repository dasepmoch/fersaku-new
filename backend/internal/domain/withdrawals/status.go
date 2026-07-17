package withdrawals

import "fmt"

// CanTransition reports whether from → to is allowed by §5.5.
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

// transitionMatrix is the closed allowlist (§5.5).
var transitionMatrix = map[string][]string{
	StatusRequested: {
		StatusUnderReview, StatusRejected, StatusCancelled, StatusApproved, // auto-approve path
	},
	StatusUnderReview: {
		StatusApproved, StatusHeld, StatusRejected, StatusCancelled,
	},
	StatusHeld: {
		StatusUnderReview, StatusRejected, StatusCancelled,
	},
	StatusApproved: {
		StatusProcessing, StatusCancelled,
	},
	StatusProcessing: {
		StatusCompleted, StatusFailed, StatusUnknownOutcome,
	},
	StatusUnknownOutcome: {
		StatusProcessing, StatusCompleted, StatusFailed, StatusCancelled,
	},
	// Late verified success after terminal failure/cancel.
	StatusFailed: {
		StatusCompleted,
	},
	StatusCancelled: {
		StatusCompleted,
	},
	StatusCompleted: {},
	StatusRejected:  {},
}

// AssertTransition returns an error if the edge is forbidden.
func AssertTransition(from, to string) error {
	if CanTransition(from, to) {
		return nil
	}
	return fmt.Errorf("withdrawals: invalid transition %s -> %s", from, to)
}

// IsTerminal reports terminal statuses that normally end the flow.
func IsTerminal(status string) bool {
	switch status {
	case StatusCompleted, StatusFailed, StatusRejected, StatusCancelled:
		return true
	default:
		return false
	}
}

// HoldsReserve reports whether funds must remain in WITHDRAWAL_CLEARING.
func HoldsReserve(status string) bool {
	switch status {
	case StatusRequested, StatusUnderReview, StatusApproved, StatusHeld,
		StatusProcessing, StatusUnknownOutcome:
		return true
	default:
		return false
	}
}
