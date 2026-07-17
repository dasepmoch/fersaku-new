package auth_test

import (
	"testing"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
)

func TestDefaultNotificationPrefsMandatoryAlwaysEnabled(t *testing.T) {
	prefs := auth.DefaultNotificationPrefs(time.Now().UTC())
	if len(prefs) == 0 {
		t.Fatal("expected defaults")
	}
	for _, p := range prefs {
		if p.Mandatory && !p.Enabled {
			t.Fatalf("mandatory %s/%s must default enabled", p.EventCode, p.Channel)
		}
		if p.EventCode == auth.EventMarketingNewsletter && p.Enabled {
			t.Fatal("marketing should default off")
		}
	}
}

func TestIsMandatoryEvent(t *testing.T) {
	if !auth.IsMandatoryEvent(auth.EventSecurityAlert) {
		t.Fatal("security mandatory")
	}
	if auth.IsMandatoryEvent(auth.EventMarketingNewsletter) {
		t.Fatal("marketing optional")
	}
}

func TestValidateProfilePatch(t *testing.T) {
	name := "  Ada  "
	loc := "en-US"
	tz := "UTC"
	dn, _, lo, ti, _, err := auth.ValidateProfilePatch(&name, nil, &loc, &tz, nil)
	if err != nil {
		t.Fatal(err)
	}
	if dn != "Ada" || lo != "en-US" || ti != "UTC" {
		t.Fatalf("got %q %q %q", dn, lo, ti)
	}
	bad := "x"
	for i := 0; i < 200; i++ {
		bad += "x"
	}
	if _, _, _, _, _, err := auth.ValidateProfilePatch(&bad, nil, nil, nil, nil); err == nil {
		t.Fatal("expected long name reject")
	}
	phone := "abc"
	if _, _, _, _, _, err := auth.ValidateProfilePatch(nil, &phone, nil, nil, nil); err == nil {
		t.Fatal("expected bad phone reject")
	}
}

func TestAllowedChannelForEvent(t *testing.T) {
	if !auth.AllowedChannelForEvent(auth.EventSecurityAlert, auth.ChannelEmail) {
		t.Fatal("email allowed for security")
	}
	if auth.AllowedChannelForEvent(auth.EventMarketingNewsletter, auth.ChannelInApp) {
		t.Fatal("in-app not allowed for marketing in closed schema")
	}
}
