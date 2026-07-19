package jobs

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/webhooks"
	"github.com/dasepmoch/fersaku-new/backend/internal/platform/metrics"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// WebhookWorker processes seller_webhook.deliver outbox rows (BE-420).
// Outbound-only; never replays inbound provider callbacks.
type WebhookWorker struct {
	Pool        *pgxpool.Pool
	Svc         *application.WebhookService
	Log         ports.Logger
	Owner       string
	MaxAttempts int
}

// ProcessReady claims and processes ready seller_webhook.deliver jobs.
func (w *WebhookWorker) ProcessReady(ctx context.Context, limit int) (int, error) {
	if w.Pool == nil || w.Svc == nil {
		return 0, fmt.Errorf("webhook worker: pool and service required")
	}
	if limit <= 0 {
		limit = 10
	}
	if w.MaxAttempts <= 0 {
		w.MaxAttempts = 12
	}
	owner := w.Owner
	if owner == "" {
		owner = "seller-webhook-worker"
	}
	now := time.Now().UTC()
	rows, err := w.Pool.Query(ctx, `
		SELECT id, topic, payload, attempts
		FROM outbox_events
		WHERE status IN ('pending', 'failed')
		  AND available_at <= $1
		  AND topic = $2
		ORDER BY available_at ASC, id ASC
		LIMIT $3
		FOR UPDATE SKIP LOCKED`,
		now, webhooks.TopicDeliver, limit,
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
		handleErr := w.handle(ctx, it.payload)
		if handleErr == nil {
			_, _ = w.Pool.Exec(ctx, `
				UPDATE outbox_events
				SET status = 'completed',
				    processed_at = now(),
				    lease_owner = NULL,
				    lease_until = NULL,
				    last_error = NULL
				WHERE id = $1`, it.id)
			metrics.Global.IncWebhook("success")
			processed++
			continue
		}
		attempts := int(it.attempts) + 1
		status := "failed"
		available := time.Now().UTC().Add(backoff(attempts))
		lastErr := "handler_error"
		if attempts >= w.MaxAttempts {
			status = "dead"
			metrics.Global.IncWebhook("dead_letter")
		} else {
			metrics.Global.IncWebhook("retry")
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
			w.Log.Warn("seller webhook outbox failed", "id", it.id, "err", handleErr.Error())
		}
		processed++
	}
	return processed, nil
}

func (w *WebhookWorker) handle(ctx context.Context, payload []byte) error {
	var p webhooks.OutboxDeliverPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return err
	}
	if p.DeliveryID == "" {
		return fmt.Errorf("missing deliveryId")
	}
	return w.Svc.ProcessDelivery(ctx, p.DeliveryID)
}
