package jobs

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/notifications"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// NotificationWorker processes notification.dispatch and email.send from outbox_events.
// Invoked by tests and the worker process; does not roll back business rows on channel failure.
type NotificationWorker struct {
	Pool *pgxpool.Pool
	Svc  *application.NotificationService
	Log  ports.Logger
	// Owner identifies this worker lease.
	Owner string
	// MaxAttempts before dead-letter.
	MaxAttempts int
}

// ProcessReady claims and processes up to limit ready outbox rows for notification topics.
// Returns the number of events processed (success or terminal failure).
func (w *NotificationWorker) ProcessReady(ctx context.Context, limit int) (int, error) {
	if w.Pool == nil || w.Svc == nil {
		return 0, fmt.Errorf("notification worker: pool and service required")
	}
	if limit <= 0 {
		limit = 10
	}
	if w.MaxAttempts <= 0 {
		w.MaxAttempts = 8
	}
	owner := w.Owner
	if owner == "" {
		owner = "notification-worker"
	}
	now := time.Now().UTC()
	rows, err := w.Pool.Query(ctx, `
		SELECT id, topic, payload, attempts
		FROM outbox_events
		WHERE status IN ('pending', 'failed')
		  AND available_at <= $1
		  AND topic = ANY($2)
		ORDER BY available_at ASC, id ASC
		LIMIT $3
		FOR UPDATE SKIP LOCKED`,
		now,
		[]string{notifications.TopicNotificationDispatch, notifications.TopicEmailSend},
		limit,
	)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	type item struct {
		id       string
		topic    string
		payload  []byte
		attempts int32
	}
	var items []item
	for rows.Next() {
		var it item
		if err := rows.Scan(&it.id, &it.topic, &it.payload, &it.attempts); err != nil {
			return 0, err
		}
		items = append(items, it)
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}

	// Note: FOR UPDATE without holding TX won't hold locks after query ends on pgx default.
	// For foundation/tests we mark processing then handle; production will use leased TX.
	processed := 0
	for _, it := range items {
		leaseUntil := time.Now().UTC().Add(2 * time.Minute)
		tag, err := w.Pool.Exec(ctx, `
			UPDATE outbox_events
			SET status = 'processing',
			    lease_owner = $2,
			    lease_until = $3,
			    attempts = attempts + 1
			WHERE id = $1
			  AND status IN ('pending', 'failed')`,
			it.id, owner, leaseUntil,
		)
		if err != nil || tag.RowsAffected() == 0 {
			continue
		}
		handleErr := w.Svc.ProcessOutboxEvent(ctx, it.topic, it.payload)
		if handleErr == nil {
			_, _ = w.Pool.Exec(ctx, `
				UPDATE outbox_events
				SET status = 'completed',
				    processed_at = now(),
				    lease_owner = NULL,
				    lease_until = NULL,
				    last_error = NULL
				WHERE id = $1`, it.id)
			processed++
			continue
		}
		// Channel failure: leave inbox intact; schedule retry or dead.
		attempts := int(it.attempts) + 1
		status := "failed"
		available := time.Now().UTC().Add(backoff(attempts))
		lastErr := "handler_error"
		if attempts >= w.MaxAttempts {
			status = "dead"
		}
		_, _ = w.Pool.Exec(ctx, `
			UPDATE outbox_events
			SET status = $2,
			    available_at = $3,
			    lease_owner = NULL,
			    lease_until = NULL,
			    last_error = $4
			WHERE id = $1`, it.id, status, available, lastErr)
		if w.Log != nil {
			w.Log.Warn("outbox handler failed", "id", it.id, "topic", it.topic, "err", handleErr.Error())
		}
		processed++
	}
	return processed, nil
}

// ProcessEventByID processes a single outbox row by id (test helper; idempotent).
func (w *NotificationWorker) ProcessEventByID(ctx context.Context, id string) error {
	var topic string
	var payload []byte
	err := w.Pool.QueryRow(ctx, `
		SELECT topic, payload FROM outbox_events WHERE id = $1`, id).Scan(&topic, &payload)
	if err != nil {
		return err
	}
	return w.Svc.ProcessOutboxEvent(ctx, topic, payload)
}

// ProcessPayload is a direct handler entry (no outbox row) for unit-style tests.
func (w *NotificationWorker) ProcessPayload(ctx context.Context, topic string, payload any) error {
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return w.Svc.ProcessOutboxEvent(ctx, topic, raw)
}

func backoff(attempts int) time.Duration {
	if attempts < 1 {
		attempts = 1
	}
	// 2s, 4s, 8s ... cap 5m
	shift := attempts
	if shift > 8 {
		shift = 8
	}
	d := time.Duration(1<<shift) * time.Second
	if d > 5*time.Minute {
		return 5 * time.Minute
	}
	return d
}
