package application

import (
	"context"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/analytics"
)

// AnalyticsStore is persistence for BE-360 attribution analytics.
type AnalyticsStore interface {
	WithTx(ctx context.Context, fn func(ctx context.Context) error) error

	GetActivePolicy(ctx context.Context) (analytics.CollectionPolicy, error)
	GetStore(ctx context.Context, storeID string) (storeIDOut, merchantID, name, status string, err error)

	UpsertSession(ctx context.Context, s analytics.Session) (analytics.Session, error)
	GetSessionByHash(ctx context.Context, storeID, sessionHash string) (analytics.Session, error)

	InsertEvent(ctx context.Context, e analytics.Event) (analytics.Event, error)
	ListNonDirectEvents(ctx context.Context, storeID, visitorHash string, from, to time.Time) ([]analytics.Event, error)

	InsertOrderSnapshot(ctx context.Context, snap analytics.OrderSnapshot) (analytics.OrderSnapshot, bool, error)
	GetOrderSnapshot(ctx context.Context, orderID string) (analytics.OrderSnapshot, error)
	GetOrderSnapshotByIntent(ctx context.Context, intentID string) (analytics.OrderSnapshot, error)
	MarkConverted(ctx context.Context, orderID string, at time.Time, paidLate bool, grossIDR int64) (analytics.OrderSnapshot, error)
	CountConverted(ctx context.Context, orderID string) (int64, error)

	DeleteDailyRange(ctx context.Context, storeID string, fromDay, toDay time.Time, tz, aggVersion string) error
	UpsertDaily(ctx context.Context, row analytics.DailyAggregate) (analytics.DailyAggregate, error)
	ListDaily(ctx context.Context, storeID string, fromDay, toDay time.Time, tz, aggVersion string, channel *string, cursorDay *time.Time, cursorID *string, limit int32) ([]analytics.DailyAggregate, error)
	SumDaily(ctx context.Context, storeID string, fromDay, toDay time.Time, tz, aggVersion string) (sessions, pageViews, checkouts, orders, gross int64, err error)
	SumByChannel(ctx context.Context, storeID string, fromDay, toDay time.Time, tz, aggVersion string) ([]analytics.ChannelBreakdown, error)

	// Rebuild source queries
	CountSessionsByDayChannel(ctx context.Context, storeID, tz string, fromDay, toDay time.Time) ([]DayChannelCount, error)
	CountEventsByDayChannel(ctx context.Context, storeID, tz string, fromDay, toDay time.Time) ([]DayChannelEventCount, error)
	CountConversionsByDayChannel(ctx context.Context, storeID, tz string, fromDay, toDay time.Time) ([]DayChannelConversion, error)

	DeleteEventsBefore(ctx context.Context, cutoff time.Time) (int64, error)
	AnonymizeSessionsBefore(ctx context.Context, cutoff time.Time) (int64, error)
	InsertRetentionRun(ctx context.Context, id, policyVersionID string, cutoff time.Time, eventsDeleted, sessionsAnon int64, status string, started, finished time.Time) error

	IsNotFound(err error) bool
	IsUniqueViolation(err error) bool
}

// DayChannelCount is rebuild intermediate.
type DayChannelCount struct {
	Day      time.Time
	Channel  string
	Sessions int64
}

// DayChannelEventCount is rebuild intermediate.
type DayChannelEventCount struct {
	Day       time.Time
	Channel   string
	EventType string
	Count     int64
}

// DayChannelConversion is rebuild intermediate.
type DayChannelConversion struct {
	Day       time.Time
	Channel   string
	ProductID string
	Orders    int64
	GrossIDR  int64
}
