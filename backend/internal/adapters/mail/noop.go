// Package mail provides transactional email adapters (noop for scaffold).
package mail

import (
	"context"

	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// Noop discards all send requests.
type Noop struct{}

func (Noop) Send(_ context.Context, _, _, _ string) error { return nil }

var _ ports.Mailer = Noop{}
