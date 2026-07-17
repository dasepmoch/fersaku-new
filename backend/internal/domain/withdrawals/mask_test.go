package withdrawals_test

import (
	"testing"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/withdrawals"
)

func TestMaskAccountNumber(t *testing.T) {
	if got := withdrawals.MaskAccountNumber("1234567890"); got != "****7890" {
		t.Fatalf("got %s", got)
	}
	if !withdrawals.ValidAccountNumber("12345678") {
		t.Fatal("valid")
	}
	if withdrawals.ValidAccountNumber("123") {
		t.Fatal("too short")
	}
}

func TestCanTransition(t *testing.T) {
	if !withdrawals.CanTransition(withdrawals.StatusApproved, withdrawals.StatusProcessing) {
		t.Fatal("approved->processing")
	}
	if withdrawals.CanTransition(withdrawals.StatusCompleted, withdrawals.StatusFailed) {
		t.Fatal("completed is terminal")
	}
	if !withdrawals.CanTransition(withdrawals.StatusFailed, withdrawals.StatusCompleted) {
		t.Fatal("late success allowed")
	}
}
