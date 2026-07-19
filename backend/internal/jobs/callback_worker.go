package jobs

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/payments"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// CallbackWorker processes provider_callback.process outbox rows.
type CallbackWorker struct {
	Pool  *pgxpool.Pool
	Svc   *application.CallbackService
	Log   ports.Logger
	Owner string
}

// ProcessReady claims and processes ready callback outbox events.
func (w *CallbackWorker) ProcessReady(ctx context.Context, limit int) (int, error) {
	if w.Pool == nil || w.Svc == nil {
		return 0, fmt.Errorf("callback worker: pool and service required")
	}
	if limit <= 0 {
		limit = 10
	}
	owner := w.Owner
	if owner == "" {
		owner = "callback-worker"
	}
	now := time.Now().UTC()
	rows, err := w.Pool.Query(ctx, `
		SELECT id, topic, payload, attempts
		FROM outbox_events
		WHERE status IN ('pending', 'failed')
		  AND available_at <= $1
		  AND topic = $2
		ORDER BY available_at ASC, id ASC
		LIMIT $3`,
		now, payments.TopicProviderCallbackProcess, limit,
	)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	type item struct {
		id      string
		payload []byte
	}
	var items []item
	for rows.Next() {
		var it item
		var topic string
		var attempts int32
		if err := rows.Scan(&it.id, &topic, &it.payload, &attempts); err != nil {
			return 0, err
		}
		items = append(items, it)
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}

	processed := 0
	for _, it := range items {
		leaseUntil := time.Now().UTC().Add(2 * time.Minute)
		tag, err := w.Pool.Exec(ctx, `
			UPDATE outbox_events
			SET status = 'processing', lease_owner = $2, lease_until = $3, attempts = attempts + 1
			WHERE id = $1 AND status IN ('pending', 'failed')`,
			it.id, owner, leaseUntil,
		)
		if err != nil || tag.RowsAffected() == 0 {
			continue
		}
		var payload struct {
			CallbackID string `json:"callbackId"`
		}
		_ = json.Unmarshal(it.payload, &payload)
		handleErr := error(nil)
		if payload.CallbackID != "" {
			handleErr = w.Svc.ProcessEvent(ctx, payload.CallbackID)
		}
		if handleErr == nil {
			_, _ = w.Pool.Exec(ctx, `
				UPDATE outbox_events
				SET status = 'completed', processed_at = now(), lease_owner = NULL, lease_until = NULL, last_error = NULL
				WHERE id = $1`, it.id)
		} else {
			_, _ = w.Pool.Exec(ctx, `
				UPDATE outbox_events
				SET status = 'failed', available_at = $2, lease_owner = NULL, lease_until = NULL, last_error = $3
				WHERE id = $1`, it.id, time.Now().UTC().Add(30*time.Second), "process_failed")
			if w.Log != nil {
				w.Log.Warn("callback outbox failed", "id", it.id, "err", handleErr.Error())
			}
		}
		processed++
	}
	return processed, nil
}
