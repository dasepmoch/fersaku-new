package kyc

import "testing"

func TestCanTransition_Matrix(t *testing.T) {
	cases := []struct {
		from, to string
		ok       bool
	}{
		{StatusDraft, StatusSubmitted, true},
		{StatusDraft, StatusApproved, false},
		{StatusSubmitted, StatusInReview, true},
		{StatusInReview, StatusApproved, true},
		{StatusInReview, StatusRejected, true},
		{StatusInReview, StatusNeedsClarification, true},
		{StatusNeedsClarification, StatusSubmitted, true},
		{StatusNeedsClarification, StatusApproved, false},
		{StatusApproved, StatusExpired, true},
		{StatusRejected, StatusSubmitted, false},
		{StatusExpired, StatusDraft, false},
	}
	for _, tc := range cases {
		if got := CanTransition(tc.from, tc.to); got != tc.ok {
			t.Fatalf("%s -> %s: got %v want %v", tc.from, tc.to, got, tc.ok)
		}
	}
}

func TestRequiresReason(t *testing.T) {
	if !RequiresReason(StatusRejected) || !RequiresReason(StatusNeedsClarification) {
		t.Fatal("reject/clarify require reason")
	}
	if RequiresReason(StatusApproved) {
		t.Fatal("approve does not require reason")
	}
}
