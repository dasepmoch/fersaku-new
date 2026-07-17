package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres/gen"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/notifications"
	"github.com/dasepmoch/fersaku-new/backend/internal/platform/cursor"
)

// NotificationRepo is the Postgres adapter for BE-140.
type NotificationRepo struct {
	pool *pgxpool.Pool
	q    *gen.Queries
	// tx is set when running inside WithTx.
	tx pgx.Tx
}

func NewNotificationRepo(pool *pgxpool.Pool) *NotificationRepo {
	return &NotificationRepo{pool: pool, q: gen.New(pool)}
}

func (r *NotificationRepo) queries() *gen.Queries {
	if r.tx != nil {
		return r.q.WithTx(r.tx)
	}
	return r.q
}

func (r *NotificationRepo) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	if r.tx != nil {
		return fn(ctx)
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("notification: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	nested := &NotificationRepo{pool: r.pool, q: r.q, tx: tx}
	// Store the nested repo on context so service uses same TX... 
	// Actually service holds Store interface pointing to r. We need to swap.
	// Pattern: mutate r.tx for duration (not concurrent-safe; ok for request scope).
	prev := r.tx
	r.tx = tx
	defer func() { r.tx = prev }()
	if err := fn(ctx); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("notification: commit: %w", err)
	}
	_ = nested
	return nil
}

func (r *NotificationRepo) InsertNotification(ctx context.Context, n notifications.Notification) (notifications.Notification, bool, error) {
	var tenantType, tenantID *string
	if n.TenantType != "" {
		tenantType = &n.TenantType
		tenantID = &n.TenantID
	}
	row, err := r.queries().InsertNotification(ctx, gen.InsertNotificationParams{
		ID:              n.ID,
		RecipientUserID: n.RecipientUserID,
		TenantType:      tenantType,
		TenantID:        tenantID,
		Surface:         string(n.Surface),
		EventCode:       string(n.EventCode),
		Title:           n.Title,
		Body:            n.Body,
		CtaPath:         n.CTAPath,
		ContentVersion:  n.ContentVersion,
		Priority:        string(n.Priority),
		RetentionClass:  string(n.RetentionClass),
		CreatedAt:       n.CreatedAt,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// ON CONFLICT DO NOTHING → fetch existing
			existing, gerr := r.GetNotificationByDedupe(ctx, n.RecipientUserID, n.EventCode, n.ContentVersion)
			if gerr != nil {
				return notifications.Notification{}, false, gerr
			}
			return existing, false, nil
		}
		return notifications.Notification{}, false, fmt.Errorf("notification: insert: %w", err)
	}
	return mapNotification(row), true, nil
}

func (r *NotificationRepo) GetNotificationByDedupe(ctx context.Context, recipientUserID string, event auth.NotificationEventCode, contentVersion string) (notifications.Notification, error) {
	row, err := r.queries().GetNotificationByDedupe(ctx, gen.GetNotificationByDedupeParams{
		RecipientUserID: recipientUserID,
		EventCode:       string(event),
		ContentVersion:  contentVersion,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return notifications.Notification{}, pgx.ErrNoRows
		}
		return notifications.Notification{}, err
	}
	return mapNotification(row), nil
}

func (r *NotificationRepo) GetNotificationForRecipient(ctx context.Context, id, recipientUserID string) (notifications.Notification, error) {
	row, err := r.queries().GetNotificationForRecipient(ctx, gen.GetNotificationForRecipientParams{
		ID:              id,
		RecipientUserID: recipientUserID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return notifications.Notification{}, pgx.ErrNoRows
		}
		return notifications.Notification{}, err
	}
	return mapNotification(row), nil
}

func (r *NotificationRepo) ListNotifications(ctx context.Context, recipientUserID string, unreadOnly bool, after *cursor.Key, limit int32) ([]notifications.Notification, error) {
	params := gen.ListNotificationsParams{
		RecipientUserID: recipientUserID,
		UnreadOnly:      unreadOnly,
		PageLimit:       limit,
	}
	if after != nil {
		params.CursorCreatedAt = pgtype.Timestamptz{Time: after.CreatedAt.UTC(), Valid: true}
		params.CursorID = &after.ID
	}
	rows, err := r.queries().ListNotifications(ctx, params)
	if err != nil {
		return nil, err
	}
	out := make([]notifications.Notification, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapNotification(row))
	}
	return out, nil
}

func (r *NotificationRepo) MarkRead(ctx context.Context, id, recipientUserID string, now time.Time) (notifications.Notification, error) {
	row, err := r.queries().MarkNotificationRead(ctx, gen.MarkNotificationReadParams{
		NowTs:           now,
		ID:              id,
		RecipientUserID: recipientUserID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return notifications.Notification{}, pgx.ErrNoRows
		}
		return notifications.Notification{}, err
	}
	return mapNotification(row), nil
}

func (r *NotificationRepo) MarkAllRead(ctx context.Context, recipientUserID string, now time.Time) (int64, error) {
	return r.queries().MarkAllNotificationsRead(ctx, gen.MarkAllNotificationsReadParams{
		NowTs:           now,
		RecipientUserID: recipientUserID,
	})
}

func (r *NotificationRepo) CountUnread(ctx context.Context, recipientUserID string) (int64, error) {
	return r.queries().CountUnreadNotifications(ctx, recipientUserID)
}

func (r *NotificationRepo) UpsertDeliveryAttempt(ctx context.Context, a notifications.DeliveryAttempt) (notifications.DeliveryAttempt, error) {
	var outboxID *string
	if a.OutboxID != nil {
		outboxID = a.OutboxID
	}
	var lastErr *string
	if a.LastError != "" {
		lastErr = &a.LastError
	}
	var provider *string
	if a.ProviderRef != "" {
		provider = &a.ProviderRef
	}
	var completed pgtype.Timestamptz
	if a.CompletedAt != nil {
		completed = pgtype.Timestamptz{Time: a.CompletedAt.UTC(), Valid: true}
	}
	row, err := r.queries().InsertDeliveryAttempt(ctx, gen.InsertDeliveryAttemptParams{
		ID:             a.ID,
		NotificationID: a.NotificationID,
		OutboxID:       outboxID,
		Channel:        string(a.Channel),
		Status:         string(a.Status),
		Attempts:       int32(a.Attempts),
		LastError:      lastErr,
		ProviderRef:    provider,
		CreatedAt:      a.CreatedAt,
		UpdatedAt:      a.UpdatedAt,
		CompletedAt:    completed,
	})
	if err != nil {
		return notifications.DeliveryAttempt{}, err
	}
	return mapDelivery(row), nil
}

func (r *NotificationRepo) GetDeliveryAttempt(ctx context.Context, notificationID string, channel auth.NotificationChannel) (notifications.DeliveryAttempt, error) {
	row, err := r.queries().GetDeliveryAttempt(ctx, gen.GetDeliveryAttemptParams{
		NotificationID: notificationID,
		Channel:        string(channel),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return notifications.DeliveryAttempt{}, pgx.ErrNoRows
		}
		return notifications.DeliveryAttempt{}, err
	}
	return mapDelivery(row), nil
}

func (r *NotificationRepo) UpdateDeliveryAttempt(ctx context.Context, a notifications.DeliveryAttempt) (notifications.DeliveryAttempt, error) {
	var lastErr *string
	if a.LastError != "" {
		lastErr = &a.LastError
	}
	var provider *string
	if a.ProviderRef != "" {
		provider = &a.ProviderRef
	}
	var completed pgtype.Timestamptz
	if a.CompletedAt != nil {
		completed = pgtype.Timestamptz{Time: a.CompletedAt.UTC(), Valid: true}
	}
	row, err := r.queries().UpdateDeliveryAttempt(ctx, gen.UpdateDeliveryAttemptParams{
		NotificationID: a.NotificationID,
		Channel:        string(a.Channel),
		Status:         string(a.Status),
		Attempts:       int32(a.Attempts),
		LastError:      lastErr,
		ProviderRef:    provider,
		OutboxID:       a.OutboxID,
		UpdatedAt:      a.UpdatedAt,
		CompletedAt:    completed,
	})
	if err != nil {
		return notifications.DeliveryAttempt{}, err
	}
	return mapDelivery(row), nil
}

func (r *NotificationRepo) IsEmailSuppressed(ctx context.Context, userID, emailNorm string) (bool, error) {
	var uid, em *string
	if userID != "" {
		uid = &userID
	}
	if emailNorm != "" {
		em = &emailNorm
	}
	return r.queries().IsEmailSuppressed(ctx, gen.IsEmailSuppressedParams{
		UserID:          uid,
		EmailNormalized: em,
	})
}

func (r *NotificationRepo) InsertOutbox(ctx context.Context, id, topic string, payload []byte, dedupeKey *string, availableAt time.Time) error {
	if payload == nil {
		payload = []byte(`{}`)
	}
	if r.tx != nil {
		_, err := r.tx.Exec(ctx, `
			INSERT INTO outbox_events (
				id, topic, payload, status, attempts, available_at, created_at, dedupe_key
			) VALUES ($1, $2, $3::jsonb, 'pending', 0, $4, now(), $5)
			ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
			id, topic, payload, availableAt, dedupeKey,
		)
		if err != nil {
			return fmt.Errorf("notification: insert outbox: %w", err)
		}
		return nil
	}
	_, err := r.pool.Exec(ctx, `
		INSERT INTO outbox_events (
			id, topic, payload, status, attempts, available_at, created_at, dedupe_key
		) VALUES ($1, $2, $3::jsonb, 'pending', 0, $4, now(), $5)
		ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
		id, topic, payload, availableAt, dedupeKey,
	)
	if err != nil {
		return fmt.Errorf("notification: insert outbox: %w", err)
	}
	return nil
}

func (r *NotificationRepo) ListNotificationPrefs(ctx context.Context, userID string) ([]auth.NotificationPref, error) {
	rows, err := r.queries().ListNotificationPrefs(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := make([]auth.NotificationPref, 0, len(rows))
	for _, row := range rows {
		out = append(out, auth.NotificationPref{
			EventCode: auth.NotificationEventCode(row.EventCode),
			Channel:   auth.NotificationChannel(row.Channel),
			Enabled:   row.Enabled,
			Mandatory: auth.IsMandatoryEvent(auth.NotificationEventCode(row.EventCode)),
			UpdatedAt: row.UpdatedAt,
		})
	}
	return out, nil
}

func (r *NotificationRepo) IsNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func mapNotification(row gen.Notification) notifications.Notification {
	n := notifications.Notification{
		ID:              row.ID,
		RecipientUserID: row.RecipientUserID,
		Surface:         notifications.Surface(row.Surface),
		EventCode:       auth.NotificationEventCode(row.EventCode),
		Title:           row.Title,
		Body:            row.Body,
		CTAPath:         row.CtaPath,
		ContentVersion:  row.ContentVersion,
		Priority:        notifications.Priority(row.Priority),
		RetentionClass:  notifications.RetentionClass(row.RetentionClass),
		CreatedAt:       row.CreatedAt.UTC(),
	}
	if row.TenantType != nil {
		n.TenantType = *row.TenantType
	}
	if row.TenantID != nil {
		n.TenantID = *row.TenantID
	}
	if row.ReadAt.Valid {
		t := row.ReadAt.Time.UTC()
		n.ReadAt = &t
	}
	return n
}

func mapDelivery(row gen.NotificationDeliveryAttempt) notifications.DeliveryAttempt {
	a := notifications.DeliveryAttempt{
		ID:             row.ID,
		NotificationID: row.NotificationID,
		OutboxID:       row.OutboxID,
		Channel:        auth.NotificationChannel(row.Channel),
		Status:         notifications.DeliveryStatus(row.Status),
		Attempts:       int(row.Attempts),
		CreatedAt:      row.CreatedAt.UTC(),
		UpdatedAt:      row.UpdatedAt.UTC(),
	}
	if row.LastError != nil {
		a.LastError = *row.LastError
	}
	if row.ProviderRef != nil {
		a.ProviderRef = *row.ProviderRef
	}
	if row.CompletedAt.Valid {
		t := row.CompletedAt.Time.UTC()
		a.CompletedAt = &t
	}
	return a
}

// IsPGUnique reports PostgreSQL unique_violation (23505).
func IsPGUnique(err error) bool {
	var pe *pgconn.PgError
	return errors.As(err, &pe) && pe.Code == "23505"
}

var _ application.NotificationStore = (*NotificationRepo)(nil)

func init() {
	application.SetUniqueViolationChecker(IsPGUnique)
}
