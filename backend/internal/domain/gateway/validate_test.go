package gateway

import (
	"encoding/json"
	"testing"
)

func TestNormalizeOrigin_HTTPSOnlyNoFetch(t *testing.T) {
	o, ok := NormalizeOrigin("https://merchant.example/success?x=1")
	if !ok || o != "https://merchant.example" {
		t.Fatalf("got %q ok=%v", o, ok)
	}
	if _, ok := NormalizeOrigin("http://merchant.example"); ok {
		t.Fatal("http rejected")
	}
	if _, ok := NormalizeOrigin("https://user:pass@merchant.example"); ok {
		t.Fatal("userinfo rejected")
	}
	if _, ok := NormalizeOrigin("//merchant.example"); ok {
		t.Fatal("scheme-relative rejected")
	}
}

func TestValidateMetadata_BoundsAndURLStringNotSpecial(t *testing.T) {
	// URL-looking string is allowed as opaque data (never fetched).
	raw, _ := json.Marshal(map[string]any{
		"callback": "https://evil.example/steal",
		"nested":   map[string]any{"a": "b"},
	})
	if err := ValidateMetadata(raw); err != nil {
		t.Fatal(err)
	}
	huge := make(map[string]any)
	for i := 0; i < 60; i++ {
		huge[string(rune('a'+i%26))+string(rune('0'+i))] = "x"
	}
	raw2, _ := json.Marshal(huge)
	if err := ValidateMetadata(raw2); err == nil {
		t.Fatal("expected key bound error")
	}
}

func TestSanitizeMerchantReference(t *testing.T) {
	if _, ok := SanitizeMerchantReference(""); ok {
		t.Fatal("empty")
	}
	if _, ok := SanitizeMerchantReference("inv\x00"); ok {
		t.Fatal("control")
	}
	r, ok := SanitizeMerchantReference("invoice-2026-0001")
	if !ok || r != "invoice-2026-0001" {
		t.Fatalf("%q %v", r, ok)
	}
}
