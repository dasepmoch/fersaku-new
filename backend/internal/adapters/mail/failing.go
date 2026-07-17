package mail

import (
	"context"
	"errors"

	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// ErrSendFailed is returned by Failing mailer.
var ErrSendFailed = errors.New("mail: send failed")

// Failing always fails Send (tests email failure does not delete inbox).
type Failing struct{}

func (Failing) Send(_ context.Context, _, _, _ string) error {
	return ErrSendFailed
}

var _ ports.Mailer = Failing{}
