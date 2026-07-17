package observability

import "time"

// SystemClock is the production clock using time.Now (UTC).
type SystemClock struct{}

func (SystemClock) Now() time.Time { return time.Now().UTC() }

// FixedClock is for tests.
type FixedClock struct {
	T time.Time
}

func (c FixedClock) Now() time.Time { return c.T }
