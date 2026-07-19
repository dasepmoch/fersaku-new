package middleware

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
	"github.com/dasepmoch/fersaku-new/backend/internal/platform/metrics"
)

// ClassBudget defines capacity/window for one route class.
type ClassBudget struct {
	Capacity int
	// Window is used by fixed-window Redis limiter; in-memory uses refill = Capacity/Window seconds.
	Window time.Duration
	// OnErrorDeny when true (default for money/auth) denies on backend errors.
	// Health may allow on error so probes are not locked by Redis outage.
	OnErrorDeny bool
}

// DefaultClassBudgets returns production-oriented per-class budgets.
// Values are requests per window (default window 1 minute).
func DefaultClassBudgets() map[RouteClass]ClassBudget {
	min := time.Minute
	return map[RouteClass]ClassBudget{
		RouteClassHealth:   {Capacity: 600, Window: min, OnErrorDeny: false},
		RouteClassPublic:   {Capacity: 240, Window: min, OnErrorDeny: true},
		RouteClassAuth:     {Capacity: 30, Window: min, OnErrorDeny: true},
		RouteClassMutation: {Capacity: 60, Window: min, OnErrorDeny: true},
		RouteClassAdmin:    {Capacity: 120, Window: min, OnErrorDeny: true},
		RouteClassCallback: {Capacity: 300, Window: min, OnErrorDeny: true},
		RouteClassGateway:  {Capacity: 120, Window: min, OnErrorDeny: true},
		RouteClassDefault:  {Capacity: 120, Window: min, OnErrorDeny: true},
	}
}

// ClassLimiter decides allow/deny for a route class + identity key.
type ClassLimiter interface {
	// AllowClass reports whether key may proceed for class.
	// errBackend is true when the backing store failed (for metrics/alerts).
	AllowClass(class RouteClass, key string) (allowed bool, remaining int, retryAfter time.Duration, errBackend bool)
}

// MemoryClassLimiter is process-local multi-class token buckets (local/test).
type MemoryClassLimiter struct {
	mu      sync.Mutex
	budgets map[RouteClass]ClassBudget
	// buckets keyed by class+"\x00"+identity
	buckets map[string]*bucket
}

// NewMemoryClassLimiter builds in-memory class limiter.
func NewMemoryClassLimiter(budgets map[RouteClass]ClassBudget) *MemoryClassLimiter {
	if budgets == nil {
		budgets = DefaultClassBudgets()
	}
	return &MemoryClassLimiter{
		budgets: budgets,
		buckets: make(map[string]*bucket),
	}
}

// AllowClass implements ClassLimiter.
func (l *MemoryClassLimiter) AllowClass(class RouteClass, key string) (bool, int, time.Duration, bool) {
	if l == nil {
		return false, 0, time.Second, true
	}
	bgt, ok := l.budgets[class]
	if !ok {
		bgt = l.budgets[RouteClassDefault]
	}
	if bgt.Capacity < 1 {
		bgt.Capacity = 1
	}
	window := bgt.Window
	if window <= 0 {
		window = time.Minute
	}
	rate := float64(bgt.Capacity) / window.Seconds()
	if rate <= 0 {
		rate = 1
	}
	if key == "" {
		key = "unknown"
	}
	bk := string(class) + "\x00" + key

	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	b, ok := l.buckets[bk]
	if !ok {
		b = &bucket{tokens: float64(bgt.Capacity), last: now}
		l.buckets[bk] = b
	}
	elapsed := now.Sub(b.last).Seconds()
	if elapsed > 0 {
		b.tokens += elapsed * rate
		if b.tokens > float64(bgt.Capacity) {
			b.tokens = float64(bgt.Capacity)
		}
		b.last = now
	}
	if b.tokens < 1 {
		need := 1 - b.tokens
		retry := time.Duration(need/rate*float64(time.Second)) + time.Millisecond
		return false, 0, retry, false
	}
	b.tokens--
	return true, int(b.tokens), 0, false
}

// Allow implements Limiter for backward compatibility (single default class).
func (l *MemoryClassLimiter) Allow(key string) (bool, int, time.Duration) {
	ok, rem, retry, _ := l.AllowClass(RouteClassDefault, key)
	return ok, rem, retry
}

// ClassLimiterErrors tracks backend failures for readiness/alerts (process-local).
type ClassLimiterErrors struct {
	n atomic.Uint64
}

// Inc records a backend error.
func (e *ClassLimiterErrors) Inc() {
	if e != nil {
		e.n.Add(1)
	}
}

// Count returns total backend errors since process start.
func (e *ClassLimiterErrors) Count() uint64 {
	if e == nil {
		return 0
	}
	return e.n.Load()
}

// RateLimitByClass applies per-route-class budgets using resolved client IP
// (and optional subject scope when authenticated). Never uses raw user headers as key.
// Health class is exempt from deny when backend errors if budget.OnErrorDeny is false.
func RateLimitByClass(lim ClassLimiter, errors *ClassLimiterErrors) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if lim == nil {
				next.ServeHTTP(w, r)
				return
			}
			class := ClassifyRequest(r)
			key := rateLimitIdentity(r)
			ok, _, retry, errBackend := lim.AllowClass(class, key)
			if errBackend {
				if errors != nil {
					errors.Inc()
				}
				metrics.Global.IncRedisFailure()
			}
			if !ok {
				if retry > 0 {
					sec := int(retry.Seconds())
					if sec < 1 {
						sec = 1
					}
					w.Header().Set("Retry-After", itoa(sec))
				}
				// Bounded identity for logs/metrics (not PII, not raw header).
				presenters.WriteProblem(w, r, http.StatusTooManyRequests,
					apperr.CodeRateLimited, "Too many requests", map[string]any{
						"routeClass": string(class),
						"identity":   BoundIdentity(key),
					})
				return
			}
			// Stash class for logging middleware consumers.
			ctx := reqctx.WithRouteClass(r.Context(), string(class))
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// rateLimitIdentity builds key from trusted client IP + optional subject (not email).
func rateLimitIdentity(r *http.Request) string {
	ip := reqctx.ClientIP(r.Context())
	if ip == "" {
		// Fallback to peer only — never X-Forwarded-For raw.
		host := r.RemoteAddr
		if i := strings.LastIndex(host, ":"); i > 0 {
			// strip port if present (IPv4 host:port)
			if !strings.Contains(host, "]") {
				host = host[:i]
			}
		}
		ip = host
	}
	if p, ok := reqctx.PrincipalFrom(r.Context()); ok && p.SubjectID != "" {
		return "ip:" + ip + "|sub:" + p.SubjectID
	}
	if g, ok := reqctx.GatewayAuthFrom(r.Context()); ok && g.MerchantID != "" {
		return "ip:" + ip + "|m:" + g.MerchantID
	}
	return "ip:" + ip
}

// BoundIdentity returns a short non-PII label for logs/metrics (hash of key).
func BoundIdentity(key string) string {
	if key == "" {
		return "unknown"
	}
	sum := sha256.Sum256([]byte(key))
	return "h:" + hex.EncodeToString(sum[:8])
}

// FormatClassBudgetsDiag returns safe diagnostics for status/logs.
func FormatClassBudgetsDiag(budgets map[RouteClass]ClassBudget) map[string]string {
	out := make(map[string]string, len(budgets))
	for k, v := range budgets {
		out[string(k)] = fmt.Sprintf("%d/%s", v.Capacity, v.Window)
	}
	return out
}
