package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// Limiter is the rate-limit interface (in-memory now; Redis later).
type Limiter interface {
	// Allow reports whether key may proceed. remaining is tokens left after the take.
	Allow(key string) (allowed bool, remaining int, retryAfter time.Duration)
}

// TokenBucketLimiter is an in-memory per-key token bucket for local/dev.
// Not suitable as a multi-instance production authority — swap for Redis later.
type TokenBucketLimiter struct {
	mu       sync.Mutex
	rate     float64 // tokens per second
	capacity float64
	buckets  map[string]*bucket
}

type bucket struct {
	tokens float64
	last   time.Time
}

// NewTokenBucketLimiter builds a limiter with the given capacity and refill rate (tokens/sec).
func NewTokenBucketLimiter(capacity int, refillPerSecond float64) *TokenBucketLimiter {
	if capacity < 1 {
		capacity = 1
	}
	if refillPerSecond <= 0 {
		refillPerSecond = 1
	}
	return &TokenBucketLimiter{
		rate:     refillPerSecond,
		capacity: float64(capacity),
		buckets:  make(map[string]*bucket),
	}
}

// Allow implements Limiter.
func (l *TokenBucketLimiter) Allow(key string) (bool, int, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	b, ok := l.buckets[key]
	if !ok {
		b = &bucket{tokens: l.capacity, last: now}
		l.buckets[key] = b
	}
	elapsed := now.Sub(b.last).Seconds()
	if elapsed > 0 {
		b.tokens += elapsed * l.rate
		if b.tokens > l.capacity {
			b.tokens = l.capacity
		}
		b.last = now
	}
	if b.tokens < 1 {
		need := 1 - b.tokens
		retry := time.Duration(need/l.rate*float64(time.Second)) + time.Millisecond
		return false, 0, retry
	}
	b.tokens--
	return true, int(b.tokens), 0
}

// RateLimit applies Limiter using client IP as the key.
// On deny: 429 + RATE_LIMITED problem + Retry-After seconds.
// If lim is nil, the middleware is a no-op.
func RateLimit(lim Limiter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if lim == nil {
				next.ServeHTTP(w, r)
				return
			}
			key := reqctx.ClientIP(r.Context())
			if key == "" {
				key = r.RemoteAddr
			}
			ok, _, retry := lim.Allow(key)
			if !ok {
				if retry > 0 {
					sec := int(retry.Seconds())
					if sec < 1 {
						sec = 1
					}
					w.Header().Set("Retry-After", itoa(sec))
				}
				presenters.WriteProblem(w, r, http.StatusTooManyRequests,
					apperr.CodeRateLimited, "Too many requests", nil)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var buf [12]byte
	i := len(buf)
	neg := n < 0
	if neg {
		n = -n
	}
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
