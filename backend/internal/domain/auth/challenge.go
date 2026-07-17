package auth

import "time"

// ChallengeConsumeResult is the outcome of atomic consume.
type ChallengeConsumeResult struct {
	Challenge Challenge
	// AlreadyConsumed is true when the row was already used (replay).
	AlreadyConsumed bool
	// Expired is true when past expires_at.
	Expired bool
	// AttemptsExceeded when attempts >= max_attempts before consume.
	AttemptsExceeded bool
	// NotFound when no matching purpose+hash.
	NotFound bool
}

// CanConsume reports whether a loaded challenge may still be consumed at now.
func (c Challenge) CanConsume(now time.Time) ChallengeConsumeResult {
	res := ChallengeConsumeResult{Challenge: c}
	if c.ConsumedAt != nil {
		res.AlreadyConsumed = true
		return res
	}
	if !c.ExpiresAt.After(now) {
		res.Expired = true
		return res
	}
	if c.Attempts >= c.MaxAttempts {
		res.AttemptsExceeded = true
		return res
	}
	return res
}
