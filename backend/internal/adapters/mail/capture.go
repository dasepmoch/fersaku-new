package mail

import (
	"context"
	"sync"

	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// Message is a captured outbound email (tests never log raw tokens from body unless asserted).
type Message struct {
	To      string
	Subject string
	Body    string
}

// Capture stores sent messages in memory for tests.
type Capture struct {
	mu   sync.Mutex
	msgs []Message
}

func NewCapture() *Capture {
	return &Capture{}
}

func (c *Capture) Send(_ context.Context, to, subject, body string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.msgs = append(c.msgs, Message{To: to, Subject: subject, Body: body})
	return nil
}

func (c *Capture) Messages() []Message {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make([]Message, len(c.msgs))
	copy(out, c.msgs)
	return out
}

func (c *Capture) Last() (Message, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.msgs) == 0 {
		return Message{}, false
	}
	return c.msgs[len(c.msgs)-1], true
}

func (c *Capture) Reset() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.msgs = nil
}

var _ ports.Mailer = (*Capture)(nil)
