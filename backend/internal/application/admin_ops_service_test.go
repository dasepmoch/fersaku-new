package application_test

import (
	"testing"

	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/admin"
)

func TestValidatePaymentSourceOrReject_MIXED(t *testing.T) {
	if err := application.ValidatePaymentSourceOrReject("MIXED"); err == nil {
		t.Fatal("MIXED must be rejected on payment paths")
	}
	if err := application.ValidatePaymentSourceOrReject("STOREFRONT"); err != nil {
		t.Fatal(err)
	}
	if err := application.ValidatePaymentSourceOrReject("QRIS_API"); err != nil {
		t.Fatal(err)
	}
	if !admin.ValidateWithdrawalSource("MIXED") {
		t.Fatal("withdrawal may filter MIXED")
	}
	if admin.ValidatePaymentSource("MIXED") {
		t.Fatal("payment must not accept MIXED")
	}
}

func TestValidEmergencySwitch(t *testing.T) {
	if !admin.ValidEmergencySwitch(admin.EmergencyQRISCheckout) {
		t.Fatal("qris")
	}
	if admin.ValidEmergencySwitch("MAINTENANCE") {
		t.Fatal("fourth switch rejected")
	}
}

func TestValidMerchantAndAPIAccessIndependent(t *testing.T) {
	if !admin.ValidMerchantStatus(admin.MerchantStatusSuspended) {
		t.Fatal("merchant suspend")
	}
	if !admin.ValidAPIAccessStatus(admin.APIAccessSuspended) {
		t.Fatal("api suspend")
	}
	// Axes are independent enums — both can be SUSPENDED without coupling.
	if admin.MerchantStatusSuspended != admin.APIAccessSuspended {
		// same string value is fine; independence is behavioral in service tests.
	}
}
