package notifications

import (
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
)

// Surface is the product shell that owns the inbox view.
type Surface string

const (
	SurfaceSeller Surface = "SELLER"
	SurfaceBuyer  Surface = "BUYER"
	SurfaceAdmin  Surface = "ADMIN"
)

// Priority is closed priority for inbox rendering.
type Priority string

const (
	PriorityInfo       Priority = "INFO"
	PriorityWarning    Priority = "WARNING"
	PriorityCritical   Priority = "CRITICAL"
	PriorityCompliance Priority = "COMPLIANCE"
)

// RetentionClass drives retention policy labels (actual purge is later).
type RetentionClass string

const (
	RetentionStandard   RetentionClass = "STANDARD"
	RetentionSecurity   RetentionClass = "SECURITY"
	RetentionCompliance RetentionClass = "COMPLIANCE"
)

// DeliveryStatus is channel delivery attempt state.
type DeliveryStatus string

const (
	DeliveryPending    DeliveryStatus = "PENDING"
	DeliveryProcessing DeliveryStatus = "PROCESSING"
	DeliverySent       DeliveryStatus = "SENT"
	DeliveryFailed     DeliveryStatus = "FAILED"
	DeliverySuppressed DeliveryStatus = "SUPPRESSED"
	DeliverySkipped    DeliveryStatus = "SKIPPED"
)

// Notification is one in-app inbox row (recipient-scoped).
type Notification struct {
	ID              string
	RecipientUserID string
	TenantType      string
	TenantID        string
	Surface         Surface
	EventCode       auth.NotificationEventCode
	Title           string
	Body            string
	CTAPath         string
	ContentVersion  string
	Priority        Priority
	RetentionClass  RetentionClass
	ReadAt          *time.Time
	CreatedAt       time.Time
}

// DeliveryAttempt records one channel attempt for a notification.
type DeliveryAttempt struct {
	ID             string
	NotificationID string
	OutboxID       *string
	Channel        auth.NotificationChannel
	Status         DeliveryStatus
	Attempts       int
	LastError      string
	ProviderRef    string
	CreatedAt      time.Time
	UpdatedAt      time.Time
	CompletedAt    *time.Time
}

// Suppression blocks a channel for a user/email (not mandatory inbox).
type Suppression struct {
	ID              string
	UserID          string
	EmailNormalized string
	Channel         auth.NotificationChannel
	Reason          string
	EventCode       string
	CreatedAt       time.Time
	ExpiresAt       *time.Time
}

// CreateInput is the command to create/dispatch a notification.
type CreateInput struct {
	RecipientUserID string
	TenantType      string
	TenantID        string
	Surface         Surface
	EventCode       auth.NotificationEventCode
	Title           string
	Body            string
	CTAPath         string
	ContentVersion  string
	Priority        Priority
	RetentionClass  RetentionClass
	// RecipientEmail when set enables email channel outbox (async).
	RecipientEmail string
}

// Outbox topics (reused outbox_events).
const (
	TopicNotificationDispatch = "notification.dispatch"
	TopicEmailSend            = "email.send"
)

// Max content bounds (server-side).
const (
	MaxTitleRunes = 200
	MaxBodyRunes  = 2000
	MaxCTARunes   = 512
)

// DefaultPageSize for inbox list.
const DefaultPageSize = 20

// MaxPageSize for inbox list.
const MaxPageSize = 50
