package application

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/notifications"
	"github.com/dasepmoch/fersaku-new/backend/internal/platform/cursor"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// NotificationService owns inbox + dispatch foundation (BE-140).
type NotificationService struct {
	Store NotificationStore
	IDs   ports.IDGenerator
	Clock ports.Clock
	Mail  ports.Mailer
	Log   ports.Logger
}

// CreateResult is the outcome of CreateAndDispatch.
type CreateResult struct {
	Notification notifications.Notification
	Created      bool // false when dedupe returned existing row
	EmailQueued  bool
	InboxCreated bool
	Skipped      bool // true when prefs suppress all channels
}

// CreateAndDispatch inserts inbox (when allowed) and queues email via outbox atomically.
// Dispatch failures after commit do not roll back the business notification row;
// channel work is async via outbox.
func (s *NotificationService) CreateAndDispatch(ctx context.Context, in notifications.CreateInput) (CreateResult, error) {
	in, err := notifications.ValidateCreate(in)
	if err != nil {
		return CreateResult{}, err
	}
	prefs, err := s.Store.ListNotificationPrefs(ctx, in.RecipientUserID)
	if err != nil {
		return CreateResult{}, fmt.Errorf("notification: prefs: %w", err)
	}
	wantInbox := notifications.ShouldCreateInbox(in.EventCode, prefs)
	wantEmail := notifications.ShouldSendEmail(in.EventCode, prefs) && in.RecipientEmail != ""

	if !wantInbox && !wantEmail {
		return CreateResult{Skipped: true}, nil
	}

	now := s.Clock.Now().UTC()
	var result CreateResult

	err = s.Store.WithTx(ctx, func(ctx context.Context) error {
		if wantInbox {
			n := notifications.Notification{
				ID:              s.IDs.New(),
				RecipientUserID: in.RecipientUserID,
				TenantType:      in.TenantType,
				TenantID:        in.TenantID,
				Surface:         in.Surface,
				EventCode:       in.EventCode,
				Title:           in.Title,
				Body:            in.Body,
				CTAPath:         in.CTAPath,
				ContentVersion:  in.ContentVersion,
				Priority:        in.Priority,
				RetentionClass:  in.RetentionClass,
				CreatedAt:       now,
			}
			row, inserted, insErr := s.Store.InsertNotification(ctx, n)
			if insErr != nil {
				return insErr
			}
			result.Notification = row
			result.Created = inserted
			result.InboxCreated = true

			// IN_APP delivery attempt (terminal SENT for in-app).
			_, _ = s.Store.UpsertDeliveryAttempt(ctx, notifications.DeliveryAttempt{
				ID:             s.IDs.New(),
				NotificationID: row.ID,
				Channel:        auth.ChannelInApp,
				Status:         notifications.DeliverySent,
				Attempts:       1,
				CreatedAt:      now,
				UpdatedAt:      now,
				CompletedAt:    &now,
			})

			if wantEmail {
				if err := s.queueEmailInTx(ctx, row, in, now); err != nil {
					return err
				}
				result.EmailQueued = true
			}

			// notification.dispatch outbox for channel fan-out bookkeeping.
			payload, _ := json.Marshal(map[string]any{
				"notificationId":  row.ID,
				"recipientUserId": row.RecipientUserID,
				"eventCode":       string(row.EventCode),
				"contentVersion":  row.ContentVersion,
				"channels":        channelNames(wantInbox, wantEmail),
			})
			dk := notifications.OutboxDedupeDispatch(row.ID, auth.ChannelInApp, row.ContentVersion)
			if err := s.Store.InsertOutbox(ctx, s.IDs.New(), notifications.TopicNotificationDispatch, payload, &dk, now); err != nil {
				// Unique dedupe on outbox is ok on re-dispatch of existing notification.
				if !isUniqueViolation(err) {
					return err
				}
			}
			return nil
		}

		// Email-only (no inbox schema channel) — still need a stable business ref for email dedupe.
		// Use synthetic notification-less email job keyed by content version.
		if wantEmail {
			businessRef := notifications.DedupeKey(in.RecipientUserID, in.EventCode, in.ContentVersion)
			payload, _ := json.Marshal(map[string]any{
				"template":        string(in.EventCode),
				"to":              in.RecipientEmail,
				"subject":         in.Title,
				"body":            in.Body,
				"businessRef":     businessRef,
				"recipientUserId": in.RecipientUserID,
				"contentVersion":  in.ContentVersion,
				"eventCode":       string(in.EventCode),
			})
			dk := notifications.OutboxDedupeEmail(string(in.EventCode), in.RecipientEmail, businessRef)
			if err := s.Store.InsertOutbox(ctx, s.IDs.New(), notifications.TopicEmailSend, payload, &dk, now); err != nil {
				if !isUniqueViolation(err) {
					return err
				}
			}
			result.EmailQueued = true
			result.Created = true
		}
		return nil
	})
	if err != nil {
		return CreateResult{}, err
	}
	return result, nil
}

func (s *NotificationService) queueEmailInTx(ctx context.Context, row notifications.Notification, in notifications.CreateInput, now time.Time) error {
	suppressed, err := s.Store.IsEmailSuppressed(ctx, in.RecipientUserID, in.RecipientEmail)
	if err != nil {
		return err
	}
	status := notifications.DeliveryPending
	if suppressed {
		status = notifications.DeliverySuppressed
	}
	attemptID := s.IDs.New()
	var oid *string
	if !suppressed {
		outboxID := s.IDs.New()
		payload, _ := json.Marshal(map[string]any{
			"template":        string(row.EventCode),
			"to":              in.RecipientEmail,
			"subject":         row.Title,
			"body":            row.Body,
			"businessRef":     row.ID,
			"notificationId":  row.ID,
			"recipientUserId": row.RecipientUserID,
			"contentVersion":  row.ContentVersion,
			"eventCode":       string(row.EventCode),
			"ctaPath":         row.CTAPath,
		})
		dk := notifications.OutboxDedupeEmail(string(row.EventCode), in.RecipientEmail, row.ID)
		// Insert outbox first so delivery_attempts.outbox_id FK is valid.
		if err := s.Store.InsertOutbox(ctx, outboxID, notifications.TopicEmailSend, payload, &dk, now); err != nil {
			return err
		}
		oid = &outboxID
	}
	_, err = s.Store.UpsertDeliveryAttempt(ctx, notifications.DeliveryAttempt{
		ID:             attemptID,
		NotificationID: row.ID,
		OutboxID:       oid,
		Channel:        auth.ChannelEmail,
		Status:         status,
		Attempts:       0,
		CreatedAt:      now,
		UpdatedAt:      now,
	})
	return err
}

func channelNames(inbox, email bool) []string {
	var ch []string
	if inbox {
		ch = append(ch, string(auth.ChannelInApp))
	}
	if email {
		ch = append(ch, string(auth.ChannelEmail))
	}
	return ch
}

// ListInbox returns recipient-scoped notifications (cursor DESC).
func (s *NotificationService) ListInbox(ctx context.Context, recipientUserID string, unreadOnly bool, cursorStr string, limit int) ([]notifications.Notification, *cursor.Key, bool, error) {
	if recipientUserID == "" {
		return nil, nil, false, auth.ErrUnauthenticated
	}
	if limit <= 0 {
		limit = notifications.DefaultPageSize
	}
	if limit > notifications.MaxPageSize {
		limit = notifications.MaxPageSize
	}
	var after *cursor.Key
	if cursorStr != "" {
		k, err := cursor.Decode(cursorStr)
		if err != nil {
			return nil, nil, false, err
		}
		after = &k
	}
	// Fetch limit+1 for hasMore.
	rows, err := s.Store.ListNotifications(ctx, recipientUserID, unreadOnly, after, int32(limit+1))
	if err != nil {
		return nil, nil, false, err
	}
	hasMore := len(rows) > limit
	if hasMore {
		rows = rows[:limit]
	}
	var next *cursor.Key
	if hasMore && len(rows) > 0 {
		last := rows[len(rows)-1]
		next = &cursor.Key{CreatedAt: last.CreatedAt, ID: last.ID}
	}
	return rows, next, hasMore, nil
}

// MarkRead marks one notification read for the recipient (idempotent).
// Cross-recipient IDs return RESOURCE_NOT_FOUND (non-enumerating).
func (s *NotificationService) MarkRead(ctx context.Context, recipientUserID, notificationID string) (notifications.Notification, error) {
	if recipientUserID == "" {
		return notifications.Notification{}, auth.ErrUnauthenticated
	}
	now := s.Clock.Now().UTC()
	n, err := s.Store.MarkRead(ctx, notificationID, recipientUserID, now)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return notifications.Notification{}, notifications.ErrNotFound
		}
		return notifications.Notification{}, err
	}
	return n, nil
}

// MarkAllRead marks all unread for the recipient.
func (s *NotificationService) MarkAllRead(ctx context.Context, recipientUserID string) (int64, error) {
	if recipientUserID == "" {
		return 0, auth.ErrUnauthenticated
	}
	return s.Store.MarkAllRead(ctx, recipientUserID, s.Clock.Now().UTC())
}

// UnreadCount returns badge count for the recipient.
func (s *NotificationService) UnreadCount(ctx context.Context, recipientUserID string) (int64, error) {
	if recipientUserID == "" {
		return 0, auth.ErrUnauthenticated
	}
	return s.Store.CountUnread(ctx, recipientUserID)
}

// GetForRecipient loads a notification only if owned by recipient.
func (s *NotificationService) GetForRecipient(ctx context.Context, recipientUserID, notificationID string) (notifications.Notification, error) {
	n, err := s.Store.GetNotificationForRecipient(ctx, notificationID, recipientUserID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return notifications.Notification{}, notifications.ErrNotFound
		}
		return notifications.Notification{}, err
	}
	return n, nil
}

// ProcessOutboxEvent handles notification.dispatch and email.send from outbox (worker/tests).
// Idempotent: re-processing completed deliveries is a no-op success.
func (s *NotificationService) ProcessOutboxEvent(ctx context.Context, topic string, payload []byte) error {
	switch topic {
	case notifications.TopicNotificationDispatch:
		return s.processDispatch(ctx, payload)
	case notifications.TopicEmailSend:
		return s.processEmailSend(ctx, payload)
	default:
		return fmt.Errorf("notification: unknown topic %q", topic)
	}
}

func (s *NotificationService) processDispatch(ctx context.Context, payload []byte) error {
	var p struct {
		NotificationID string `json:"notificationId"`
	}
	if err := json.Unmarshal(payload, &p); err != nil {
		return err
	}
	if p.NotificationID == "" {
		return nil
	}
	// Bookkeeping only for foundation; channel work is email.send.
	if s.Log != nil {
		s.Log.Info("notification.dispatch processed", "notificationId", p.NotificationID)
	}
	return nil
}

func (s *NotificationService) processEmailSend(ctx context.Context, payload []byte) error {
	var p struct {
		Template       string `json:"template"`
		To             string `json:"to"`
		Subject        string `json:"subject"`
		Body           string `json:"body"`
		BusinessRef    string `json:"businessRef"`
		NotificationID string `json:"notificationId"`
		ContentVersion string `json:"contentVersion"`
	}
	if err := json.Unmarshal(payload, &p); err != nil {
		return err
	}
	if p.To == "" {
		return nil
	}
	// Idempotent: if already SENT, skip mail.
	if p.NotificationID != "" {
		att, err := s.Store.GetDeliveryAttempt(ctx, p.NotificationID, auth.ChannelEmail)
		if err == nil && att.Status == notifications.DeliverySent {
			return nil
		}
	}
	now := s.Clock.Now().UTC()
	if s.Mail == nil {
		return fmt.Errorf("notification: mailer not configured")
	}
	sendErr := s.Mail.Send(ctx, p.To, p.Subject, p.Body)
	if p.NotificationID != "" {
		status := notifications.DeliverySent
		lastErr := ""
		attempts := 1
		if sendErr != nil {
			status = notifications.DeliveryFailed
			lastErr = "send_failed"
			if existing, e := s.Store.GetDeliveryAttempt(ctx, p.NotificationID, auth.ChannelEmail); e == nil {
				attempts = existing.Attempts + 1
			}
		} else if existing, e := s.Store.GetDeliveryAttempt(ctx, p.NotificationID, auth.ChannelEmail); e == nil {
			attempts = existing.Attempts + 1
		}
		var completed *time.Time
		if status == notifications.DeliverySent {
			completed = &now
		}
		_, _ = s.Store.UpdateDeliveryAttempt(ctx, notifications.DeliveryAttempt{
			NotificationID: p.NotificationID,
			Channel:        auth.ChannelEmail,
			Status:         status,
			Attempts:       attempts,
			LastError:      lastErr,
			UpdatedAt:      now,
			CompletedAt:    completed,
		})
	}
	// Email failure must not delete the inbox notification — return error for outbox retry only.
	return sendErr
}

// isUniqueViolation is set by the postgres adapter via a package-level hook or type assert.
// Default: treat as non-unique (re-raise). The store adapter maps unique errors.
var isUniqueViolation = func(err error) bool {
	return false
}

// SetUniqueViolationChecker allows the postgres adapter to register unique detection.
func SetUniqueViolationChecker(fn func(error) bool) {
	if fn != nil {
		isUniqueViolation = fn
	}
}

// NotificationView is the API DTO for one inbox item.
type NotificationView struct {
	ID             string  `json:"id"`
	EventCode      string  `json:"eventCode"`
	Title          string  `json:"title"`
	Body           string  `json:"body"`
	CTAPath        string  `json:"ctaPath"`
	ContentVersion string  `json:"contentVersion"`
	Priority       string  `json:"priority"`
	Surface        string  `json:"surface"`
	TenantType     string  `json:"tenantType,omitempty"`
	TenantID       string  `json:"tenantId,omitempty"`
	ReadAt         *string `json:"readAt,omitempty"`
	CreatedAt      string  `json:"createdAt"`
	Unread         bool    `json:"unread"`
}

// ToView maps domain notification to API view.
func ToNotificationView(n notifications.Notification) NotificationView {
	v := NotificationView{
		ID:             n.ID,
		EventCode:      string(n.EventCode),
		Title:          n.Title,
		Body:           n.Body,
		CTAPath:        n.CTAPath,
		ContentVersion: n.ContentVersion,
		Priority:       string(n.Priority),
		Surface:        string(n.Surface),
		TenantType:     n.TenantType,
		TenantID:       n.TenantID,
		CreatedAt:      n.CreatedAt.UTC().Format(time.RFC3339),
		Unread:         n.ReadAt == nil,
	}
	if n.ReadAt != nil {
		s := n.ReadAt.UTC().Format(time.RFC3339)
		v.ReadAt = &s
	}
	return v
}
