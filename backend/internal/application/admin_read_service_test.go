package application

import (
	"testing"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/admin"
)

func TestClampLimit(t *testing.T) {
	t.Parallel()
	if got := clampLimit(0, false); got != admin.DefaultListLimit {
		t.Fatalf("default: %d", got)
	}
	if got := clampLimit(1000, false); got != admin.MaxListLimit {
		t.Fatalf("max list: %d", got)
	}
	if got := clampLimit(1000, true); got != admin.ExportMaxLimit {
		t.Fatalf("export max: %d", got)
	}
	if got := clampLimit(10, false); got != 10 {
		t.Fatalf("passthrough: %d", got)
	}
}

func TestPaymentSourceValidation(t *testing.T) {
	t.Parallel()
	s := &AdminReadService{}
	_, _, _, err := s.ListPayments(t.Context(), admin.ListFilter{Source: "MIXED"})
	if err == nil {
		t.Fatal("expected MIXED rejected on payments")
	}
	_, _, _, err = s.ListWithdrawals(t.Context(), admin.ListFilter{Source: "MIXED"})
	// store nil → internal unavailable before source check? Source check first.
	// With nil store, ListWithdrawals returns internal after source validation.
	if err == nil {
		t.Fatal("expected error (nil store after source ok)")
	}
}

func TestInitialsFromName(t *testing.T) {
	t.Parallel()
	if got := InitialsFromName("Nadia Putri"); got != "NP" {
		t.Fatalf("got %q", got)
	}
	if got := InitialsFromName(""); got != "?" {
		t.Fatalf("empty: %q", got)
	}
}

func TestRedactSchemaPreview(t *testing.T) {
	t.Parallel()
	if got := redactSchemaPreview("email | password"); got != "email | password" {
		t.Fatalf("keys: %q", got)
	}
	if got := redactSchemaPreview("email=secret|password=x"); got != "email | password" {
		t.Fatalf("values stripped: %q", got)
	}
}

func TestMapWithdrawalStatusFilter(t *testing.T) {
	t.Parallel()
	if got := mapWithdrawalStatusFilter("Pending"); got != "REQUESTED" {
		t.Fatalf("pending: %q", got)
	}
	if got := mapWithdrawalStatusFilter("On hold"); got != "HELD" {
		t.Fatalf("hold: %q", got)
	}
	if got := mapWithdrawalStatusFilter(""); got != "" {
		t.Fatalf("empty: %q", got)
	}
}
