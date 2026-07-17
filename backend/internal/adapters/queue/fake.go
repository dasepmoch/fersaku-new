// Package queue provides async job queue adapters (fake for BE-001).
package queue

import (
	"context"
	"sync"

	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// Fake is an in-memory no-op queue suitable for local boot and tests.
type Fake struct {
	mu     sync.Mutex
	jobs   []enqueued
	closed bool
}

type enqueued struct {
	JobType string
	Payload []byte
}

// NewFake returns a ready fake queue.
func NewFake() *Fake {
	return &Fake{}
}

func (f *Fake) Enqueue(_ context.Context, jobType string, payload []byte) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.closed {
		return portsClosedErr
	}
	cp := make([]byte, len(payload))
	copy(cp, payload)
	f.jobs = append(f.jobs, enqueued{JobType: jobType, Payload: cp})
	return nil
}

func (f *Fake) Close() error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.closed = true
	return nil
}

// Len returns buffered job count (tests).
func (f *Fake) Len() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.jobs)
}

var portsClosedErr = errClosed{}

type errClosed struct{}

func (errClosed) Error() string { return "queue: closed" }

var _ ports.Queue = (*Fake)(nil)
