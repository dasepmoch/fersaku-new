package payments

import "fmt"

// Transition applies an allowed status edge. Returns error on illegal transition.
// PAID late recovery from unpaid terminal is handled separately (BE-330).
func Transition(from, to string) error {
	if from == to {
		return nil
	}
	if !allowed(from, to) {
		return fmt.Errorf("%w: %s -> %s", ErrInvalidTransition, from, to)
	}
	return nil
}

func allowed(from, to string) bool {
	switch from {
	case StatusRequiresPayment:
		return to == StatusPending || to == StatusPaid || to == StatusFailed ||
			to == StatusExpirePending || to == StatusCancelPending || to == StatusUnknownOutcome
	case StatusPending:
		return to == StatusPaid || to == StatusFailed || to == StatusCancelPending ||
			to == StatusExpirePending || to == StatusUnknownOutcome
	case StatusCancelPending:
		return to == StatusCancelled || to == StatusUnknownOutcome || to == StatusPaid
	case StatusExpirePending:
		return to == StatusExpired || to == StatusUnknownOutcome || to == StatusPaid
	case StatusUnknownOutcome:
		return to == StatusPending || to == StatusPaid || to == StatusFailed ||
			to == StatusCancelled || to == StatusExpired
	case StatusFailed, StatusCancelled, StatusExpired:
		// Only verified late PAID (BE-330) — not exposed here as generic transition.
		return to == StatusPaid
	case StatusPaid:
		return false
	default:
		return false
	}
}

// MapProviderStatus maps adapter provider status to local intent status evidence.
func MapProviderStatus(providerStatus string) string {
	switch providerStatus {
	case "PENDING", "ACTIVE", "REQUIRES_ACTION":
		return StatusPending
	case "PAID", "SUCCEEDED", "COMPLETED":
		return StatusPaid
	case "EXPIRED":
		return StatusExpired
	case "CANCELLED", "CANCELED", "VOIDED":
		return StatusCancelled
	case "FAILED":
		return StatusFailed
	default:
		return StatusUnknownOutcome
	}
}
