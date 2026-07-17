// Package mail provides transactional email adapters (noop for scaffold).
package mail

import (
	"context"

	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// Noop discards all send requests. Forbidden on staging/production composition.
type Noop struct{}

func (Noop) Send(_ context.Context, _, _, _ string) error { return nil }

// Kind returns adapter kind for readiness.
func (Noop) Kind() string { return "noop" }

var _ ports.Mailer = Noop{}
