package analytics

import (
	"testing"
	"time"
)

func TestStripSensitiveQueryKeys(t *testing.T) {
	d := StripAndNormalizeDimensions(
		"https://shop.example/p/x?utm_source=google&token=secret123&email=a@b.com&utm_medium=cpc",
		"https://user:pass@evil.com/path?key=1",
		"", "", "", "", "",
	)
	if d.LandingPath != "/p/x" {
		t.Fatalf("path %q", d.LandingPath)
	}
	if d.UTMSource != "google" || d.UTMMedium != "cpc" {
		t.Fatalf("utm %q %q", d.UTMSource, d.UTMMedium)
	}
	// Referrer origin only — no userinfo/path/query
	if d.ReferrerOrigin != "https://evil.com" {
		t.Fatalf("origin %q", d.ReferrerOrigin)
	}
	if d.Channel != ChannelPaid {
		t.Fatalf("channel %q", d.Channel)
	}
	if d.IsDirect {
		t.Fatal("expected non-direct")
	}
}

func TestStripNeverStoresFullURLOrEmailUTM(t *testing.T) {
	d := StripAndNormalizeDimensions(
		"/landing?utm_source=buyer@mail.com&password=x",
		"not-a-url",
		"ok", "email", "camp", "", "",
	)
	if d.UTMSource != "ok" {
		// explicit param wins; email-like stripped when from query only — explicit ok kept if no @
		t.Fatalf("utm source %q", d.UTMSource)
	}
	d2 := StripAndNormalizeDimensions("/x", "", "buyer@mail.com", "email", "c", "", "")
	if d2.UTMSource != "" {
		t.Fatalf("email utm should strip got %q", d2.UTMSource)
	}
	if d.ReferrerOrigin != "" {
		t.Fatalf("opaque referrer must not store raw: %q", d.ReferrerOrigin)
	}
}

func TestClassifyDirect(t *testing.T) {
	d := StripAndNormalizeDimensions("/home", "", "", "", "", "", "")
	if d.Channel != ChannelDirect || !d.IsDirect {
		t.Fatalf("%+v", d)
	}
}

func TestSelectLastNonDirectWindowAndTieBreak(t *testing.T) {
	checkout := time.Date(2026, 7, 17, 12, 0, 0, 0, time.UTC)
	e1 := Event{ID: "e1", OccurredAt: checkout.Add(-10 * 24 * time.Hour), IsDirect: false}
	e2 := Event{ID: "e2", OccurredAt: checkout.Add(-5 * 24 * time.Hour), IsDirect: false}
	e3 := Event{ID: "e3", OccurredAt: checkout.Add(-5 * 24 * time.Hour), IsDirect: false} // same time, higher id
	eOld := Event{ID: "eold", OccurredAt: checkout.Add(-40 * 24 * time.Hour), IsDirect: false}
	eBot := Event{ID: "ebot", OccurredAt: checkout.Add(-1 * time.Hour), IsDirect: false, IsBot: true}
	eDirect := Event{ID: "edir", OccurredAt: checkout.Add(-1 * time.Hour), IsDirect: true}

	best := SelectLastNonDirect([]Event{e1, e2, e3, eOld, eBot, eDirect}, checkout, 30)
	if best == nil || best.ID != "e3" {
		t.Fatalf("want e3 got %+v", best)
	}
}

func TestEscapeCSVCell(t *testing.T) {
	if EscapeCSVCell("=cmd") != "'=cmd" {
		t.Fatal(EscapeCSVCell("=cmd"))
	}
	if EscapeCSVCell("+1") != "'+1" {
		t.Fatal(EscapeCSVCell("+1"))
	}
	if EscapeCSVCell("normal") != "normal" {
		t.Fatal(EscapeCSVCell("normal"))
	}
	if EscapeCSVCell("a\nb") != "a b" {
		t.Fatal(EscapeCSVCell("a\nb"))
	}
}

func TestIsBotUserAgent(t *testing.T) {
	if !IsBotUserAgent("Googlebot/2.1") {
		t.Fatal("bot")
	}
	if IsBotUserAgent("Mozilla/5.0 Chrome/120") {
		t.Fatal("human")
	}
}
