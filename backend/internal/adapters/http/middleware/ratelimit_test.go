package middleware_test

import (
	"testing"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/middleware"
)

func TestTokenBucket(t *testing.T) {
	l := middleware.NewTokenBucketLimiter(3, 1000) // fast refill for later
	for i := 0; i < 3; i++ {
		ok, _, _ := l.Allow("ip1")
		if !ok {
			t.Fatalf("iter %d denied", i)
		}
	}
	ok, _, retry := l.Allow("ip1")
	if ok {
		t.Fatal("expected deny")
	}
	if retry <= 0 {
		t.Fatal("expected retry")
	}
	// Other key independent
	ok2, _, _ := l.Allow("ip2")
	if !ok2 {
		t.Fatal("other key")
	}
	time.Sleep(5 * time.Millisecond)
	ok3, _, _ := l.Allow("ip1")
	if !ok3 {
		t.Fatal("expected refill")
	}
}
