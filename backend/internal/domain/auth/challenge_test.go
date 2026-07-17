package auth_test

import (
	"testing"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
)

func TestChallengeCanConsume(t *testing.T) {
	now := time.Date(2026, 7, 17, 12, 0, 0, 0, time.UTC)
	ch := auth.Challenge{
		ExpiresAt:   now.Add(time.Minute),
		MaxAttempts: 5,
	}
	res := ch.CanConsume(now)
	if res.Expired || res.AlreadyConsumed || res.AttemptsExceeded {
		t.Fatalf("should be consumable %#v", res)
	}

	consumed := now
	ch.ConsumedAt = &consumed
	res = ch.CanConsume(now)
	if !res.AlreadyConsumed {
		t.Fatal("expected already consumed")
	}

	ch.ConsumedAt = nil
	ch.ExpiresAt = now.Add(-time.Second)
	res = ch.CanConsume(now)
	if !res.Expired {
		t.Fatal("expected expired")
	}

	ch.ExpiresAt = now.Add(time.Minute)
	ch.Attempts = 5
	res = ch.CanConsume(now)
	if !res.AttemptsExceeded {
		t.Fatal("expected attempts exceeded")
	}
}
