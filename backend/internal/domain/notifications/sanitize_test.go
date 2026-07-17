package notifications_test

import (
	"testing"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/notifications"
)

func TestSanitizeCTAPath(t *testing.T) {
	ok := []string{
		"",
		"/dashboard",
		"/dashboard/settings",
		"/buyer/orders/abc",
		"/admin/kyc?caseId=1",
	}
	for _, s := range ok {
		got, err := notifications.SanitizeCTAPath(s)
		if err != nil {
			t.Fatalf("%q: %v", s, err)
		}
		if s != "" && got == "" {
			t.Fatalf("%q emptied", s)
		}
	}
	bad := []string{
		"https://evil.example/phish",
		"http://evil.example",
		"//evil.example/x",
		"javascript:alert(1)",
		"JAVASCRIPT:alert(1)",
		"data:text/html,hi",
		"/\\evil",
		"dashboard/no-slash",
		"  javascript:void(0)  ",
	}
	for _, s := range bad {
		if _, err := notifications.SanitizeCTAPath(s); err == nil {
			t.Fatalf("expected reject %q", s)
		}
	}
}

func TestMandatoryPrefsAlwaysDeliver(t *testing.T) {
	prefs := []auth.NotificationPref{
		{EventCode: auth.EventSecurityAlert, Channel: auth.ChannelEmail, Enabled: false},
		{EventCode: auth.EventSecurityAlert, Channel: auth.ChannelInApp, Enabled: false},
	}
	if !notifications.ShouldCreateInbox(auth.EventSecurityAlert, prefs) {
		t.Fatal("mandatory IN_APP must deliver despite opt-out")
	}
	if !notifications.ShouldSendEmail(auth.EventSecurityAlert, prefs) {
		t.Fatal("mandatory EMAIL must deliver despite opt-out")
	}
}

func TestOptionalMarketingRespectsOptOut(t *testing.T) {
	prefs := []auth.NotificationPref{
		{EventCode: auth.EventMarketingNewsletter, Channel: auth.ChannelEmail, Enabled: false},
	}
	if notifications.ShouldSendEmail(auth.EventMarketingNewsletter, prefs) {
		t.Fatal("marketing must respect opt-out")
	}
	// Marketing has no IN_APP in schema.
	if notifications.ShouldCreateInbox(auth.EventMarketingNewsletter, prefs) {
		t.Fatal("marketing should not create inbox")
	}
}

func TestDedupeKey(t *testing.T) {
	k := notifications.DedupeKey("u1", auth.EventPaymentReceipt, "v1")
	if k != "u1|PAYMENT_RECEIPT|v1" {
		t.Fatalf("got %q", k)
	}
}
