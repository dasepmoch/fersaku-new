package redis_test

import (
	"testing"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/middleware"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/redis"
)

func TestClassTokenBucket_NilClientFailClosed(t *testing.T) {
	var called bool
	lim := redis.NewClassTokenBucketLimiter(nil, map[middleware.RouteClass]middleware.ClassBudget{
		middleware.RouteClassMutation: {Capacity: 10, Window: time.Minute, OnErrorDeny: true},
		middleware.RouteClassHealth:   {Capacity: 10, Window: time.Minute, OnErrorDeny: false},
	})
	lim.OnBackendError = func() { called = true }

	ok, _, _, errB := lim.AllowClass(middleware.RouteClassMutation, "ip:1.1.1.1")
	if ok || !errB || !called {
		t.Fatalf("mutation fail-closed: ok=%v errB=%v called=%v", ok, errB, called)
	}

	called = false
	okH, _, _, errH := lim.AllowClass(middleware.RouteClassHealth, "ip:1.1.1.1")
	if !okH || !errH || !called {
		t.Fatalf("health allow+alert: ok=%v errB=%v called=%v", okH, errH, called)
	}
}

func TestClassTokenBucket_AllowImplementsLimiter(t *testing.T) {
	lim := redis.NewClassTokenBucketLimiter(nil, nil)
	// Default class fails closed without redis.
	ok, _, _ := lim.Allow("ip:x")
	if ok {
		t.Fatal("expected deny")
	}
}
