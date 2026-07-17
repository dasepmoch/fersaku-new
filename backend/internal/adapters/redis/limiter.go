package redis

import (
	"context"
	"fmt"
	"time"

	goredis "github.com/redis/go-redis/v9"
)

// TokenBucketLimiter is a distributed fixed-window-ish token bucket using Redis INCR+EXPIRE.
// Suitable as multi-instance production authority for IP rate limits.
type TokenBucketLimiter struct {
	rdb      *goredis.Client
	prefix   string
	capacity int64
	// window is the refill window (tokens reset each window).
	window time.Duration
}

// NewTokenBucketLimiter builds a Redis-backed limiter.
// capacity tokens per window (e.g. 120 per minute).
func NewTokenBucketLimiter(c *Client, capacity int, window time.Duration) *TokenBucketLimiter {
	if capacity < 1 {
		capacity = 1
	}
	if window <= 0 {
		window = time.Minute
	}
	var rdb *goredis.Client
	if c != nil {
		rdb = c.RDB()
	}
	return &TokenBucketLimiter{
		rdb:      rdb,
		prefix:   "rl:ip:",
		capacity: int64(capacity),
		window:   window,
	}
}

// Allow implements middleware.Limiter.
func (l *TokenBucketLimiter) Allow(key string) (bool, int, time.Duration) {
	if l == nil || l.rdb == nil {
		// Fail closed in production wiring — composition must not install nil Redis limiter.
		return false, 0, time.Second
	}
	if key == "" {
		key = "unknown"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	rk := l.prefix + key
	// INCR + set TTL on first hit.
	n, err := l.rdb.Incr(ctx, rk).Result()
	if err != nil {
		// On Redis error: fail closed (deny) to protect live surfaces.
		return false, 0, time.Second
	}
	if n == 1 {
		_ = l.rdb.Expire(ctx, rk, l.window).Err()
	}
	if n > l.capacity {
		ttl, _ := l.rdb.TTL(ctx, rk).Result()
		if ttl < 0 {
			ttl = l.window
		}
		return false, 0, ttl
	}
	remaining := int(l.capacity - n)
	if remaining < 0 {
		remaining = 0
	}
	return true, remaining, 0
}

// String for diagnostics (no secrets).
func (l *TokenBucketLimiter) String() string {
	return fmt.Sprintf("redis-token-bucket(cap=%d,window=%s)", l.capacity, l.window)
}
