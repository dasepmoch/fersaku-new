package redis

import (
	"context"
	"fmt"
	"time"

	goredis "github.com/redis/go-redis/v9"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/middleware"
)

// ClassTokenBucketLimiter is a multi-class Redis fixed-window limiter.
// Keys: rl:{class}:{identity} — never raw user headers.
type ClassTokenBucketLimiter struct {
	rdb     *goredis.Client
	prefix  string
	budgets map[middleware.RouteClass]middleware.ClassBudget
	// OnBackendError is invoked when Redis fails (optional alert hook).
	OnBackendError func()
}

// NewClassTokenBucketLimiter builds a Redis multi-class limiter.
func NewClassTokenBucketLimiter(c *Client, budgets map[middleware.RouteClass]middleware.ClassBudget) *ClassTokenBucketLimiter {
	if budgets == nil {
		budgets = middleware.DefaultClassBudgets()
	}
	var rdb *goredis.Client
	if c != nil {
		rdb = c.RDB()
	}
	return &ClassTokenBucketLimiter{
		rdb:     rdb,
		prefix:  "rl:",
		budgets: budgets,
	}
}

// AllowClass implements middleware.ClassLimiter.
func (l *ClassTokenBucketLimiter) AllowClass(class middleware.RouteClass, key string) (bool, int, time.Duration, bool) {
	bgt, ok := l.budgets[class]
	if !ok {
		bgt = l.budgets[middleware.RouteClassDefault]
	}
	if bgt.Capacity < 1 {
		bgt.Capacity = 1
	}
	window := bgt.Window
	if window <= 0 {
		window = time.Minute
	}

	if l == nil || l.rdb == nil {
		if l != nil && l.OnBackendError != nil {
			l.OnBackendError()
		}
		if !bgt.OnErrorDeny {
			// Health/metrics: allow probe traffic during Redis outage.
			return true, bgt.Capacity, 0, true
		}
		return false, 0, time.Second, true
	}
	if key == "" {
		key = "unknown"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	rk := fmt.Sprintf("%s%s:%s", l.prefix, class, key)
	n, err := l.rdb.Incr(ctx, rk).Result()
	if err != nil {
		if l.OnBackendError != nil {
			l.OnBackendError()
		}
		if !bgt.OnErrorDeny {
			return true, bgt.Capacity, 0, true
		}
		return false, 0, time.Second, true
	}
	if n == 1 {
		_ = l.rdb.Expire(ctx, rk, window).Err()
	}
	if n > int64(bgt.Capacity) {
		ttl, _ := l.rdb.TTL(ctx, rk).Result()
		if ttl < 0 {
			ttl = window
		}
		return false, 0, ttl, false
	}
	remaining := int(int64(bgt.Capacity) - n)
	if remaining < 0 {
		remaining = 0
	}
	return true, remaining, 0, false
}

// Allow implements middleware.Limiter (default class only).
func (l *ClassTokenBucketLimiter) Allow(key string) (bool, int, time.Duration) {
	ok, rem, retry, _ := l.AllowClass(middleware.RouteClassDefault, key)
	return ok, rem, retry
}

// String for diagnostics.
func (l *ClassTokenBucketLimiter) String() string {
	return fmt.Sprintf("redis-class-token-bucket(classes=%d)", len(l.budgets))
}
