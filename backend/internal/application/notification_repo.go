package application

import (
	"context"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/notifications"
	"github.com/dasepmoch/fersaku-new/backend/internal/platform/cursor"
)

// NotificationStore is the persistence port for BE-140.
type NotificationStore interface {
	WithTx(ctx context.Context, fn func(ctx context.Context) error) error

	// InsertNotification inserts or returns existing on dedupe conflict.
	// inserted=false means the row already existed (dedupe hit).
	InsertNotification(ctx context.Context, n notifications.Notification) (row notifications.Notification, inserted bool, err error)
	GetNotificationByDedupe(ctx context.Context, recipientUserID string, event auth.NotificationEventCode, contentVersion string) (notifications.Notification, error)
	GetNotificationForRecipient(ctx context.Context, id, recipientUserID string) (notifications.Notification, error)
	ListNotifications(ctx context.Context, recipientUserID string, unreadOnly bool, after *cursor.Key, limit int32) ([]notifications.Notification, error)
	MarkRead(ctx context.Context, id, recipientUserID string, now time.Time) (notifications.Notification, error)
	MarkAllRead(ctx context.Context, recipientUserID string, now time.Time) (int64, error)
	CountUnread(ctx context.Context, recipientUserID string) (int64, error)

	UpsertDeliveryAttempt(ctx context.Context, a notifications.DeliveryAttempt) (notifications.DeliveryAttempt, error)
	GetDeliveryAttempt(ctx context.Context, notificationID string, channel auth.NotificationChannel) (notifications.DeliveryAttempt, error)
	UpdateDeliveryAttempt(ctx context.Context, a notifications.DeliveryAttempt) (notifications.DeliveryAttempt, error)

	IsEmailSuppressed(ctx context.Context, userID, emailNorm string) (bool, error)

	// OutboxInsert inserts a durable outbox row (same TX when inside WithTx).
	InsertOutbox(ctx context.Context, id, topic string, payload []byte, dedupeKey *string, availableAt time.Time) error

	// Prefs for channel policy (reuse BE-125 table).
	ListNotificationPrefs(ctx context.Context, userID string) ([]auth.NotificationPref, error)

	IsNotFound(err error) bool
}
