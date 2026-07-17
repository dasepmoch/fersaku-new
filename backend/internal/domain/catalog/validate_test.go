package catalog_test

import (
	"testing"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/catalog"
)

func TestValidatePriceIDR(t *testing.T) {
	if err := catalog.ValidatePriceIDR(-1, false); err == nil {
		t.Fatal("negative rejected")
	}
	if err := catalog.ValidatePriceIDR(0, false); err == nil {
		t.Fatal("zero without pwyt rejected")
	}
	if err := catalog.ValidatePriceIDR(0, true); err != nil {
		t.Fatalf("zero pwyt ok: %v", err)
	}
	if err := catalog.ValidatePriceIDR(999, false); err == nil {
		t.Fatal("below min rejected")
	}
	if err := catalog.ValidatePriceIDR(1000, false); err != nil {
		t.Fatalf("min ok: %v", err)
	}
	if err := catalog.ValidatePriceIDR(100_000_001, false); err == nil {
		t.Fatal("above max rejected")
	}
}

func TestNormalizeProductType(t *testing.T) {
	for _, in := range []string{"download", "DOWNLOAD", "Download"} {
		got, err := catalog.NormalizeProductType(in)
		if err != nil || got != catalog.TypeDownload {
			t.Fatalf("%q -> %q %v", in, got, err)
		}
	}
	if _, err := catalog.NormalizeProductType("service"); err == nil {
		t.Fatal("invalid type")
	}
}

func TestProductSlug(t *testing.T) {
	s := catalog.NormalizeProductSlug(" Hello World!! ")
	if s != "hello-world" {
		t.Fatalf("got %q", s)
	}
	if err := catalog.ValidateProductSlug(s); err != nil {
		t.Fatal(err)
	}
	if err := catalog.ValidateProductSlug(""); err == nil {
		t.Fatal("empty invalid")
	}
}

func TestCanPublish(t *testing.T) {
	p := &catalog.Product{
		Slug:     "demo-pack",
		Title:    "Demo Pack",
		PriceIDR: 50_000,
		Type:     catalog.TypeDownload,
		Status:   catalog.StatusDraft,
	}
	if err := catalog.CanPublish(p); err != nil {
		t.Fatal(err)
	}
	p.Status = catalog.StatusArchived
	if err := catalog.CanPublish(p); err == nil {
		t.Fatal("archived cannot publish")
	}
}

func TestValidateStorefrontConfig(t *testing.T) {
	if err := catalog.ValidateStorefrontConfig([]byte(`{"layout":"grid"}`)); err != nil {
		t.Fatal(err)
	}
	if err := catalog.ValidateStorefrontConfig([]byte(`[]`)); err == nil {
		t.Fatal("array invalid")
	}
	if err := catalog.ValidateStorefrontConfig([]byte(`null`)); err == nil {
		t.Fatal("null invalid")
	}
}
