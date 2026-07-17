package payments

import "testing"

func TestTransitionAllowed(t *testing.T) {
	if err := Transition(StatusRequiresPayment, StatusPending); err != nil {
		t.Fatal(err)
	}
	if err := Transition(StatusPending, StatusExpirePending); err != nil {
		t.Fatal(err)
	}
	if err := Transition(StatusExpirePending, StatusExpired); err != nil {
		t.Fatal(err)
	}
	if err := Transition(StatusPending, StatusPaid); err != nil {
		t.Fatal(err)
	}
	if err := Transition(StatusPaid, StatusExpired); err == nil {
		t.Fatal("paid cannot expire")
	}
	if err := Transition(StatusExpired, StatusPaid); err != nil {
		t.Fatal("late paid from expired must be allowed")
	}
}

func TestMapProviderStatus(t *testing.T) {
	if MapProviderStatus("PAID") != StatusPaid {
		t.Fatal()
	}
	if MapProviderStatus("EXPIRED") != StatusExpired {
		t.Fatal()
	}
	if MapProviderStatus("PENDING") != StatusPending {
		t.Fatal()
	}
}
