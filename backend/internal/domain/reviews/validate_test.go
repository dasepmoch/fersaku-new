package reviews

import "testing"

func TestValidateCreate(t *testing.T) {
	if _, _, err := ValidateCreate(0, "t", "b"); err == nil {
		t.Fatal("rating 0 should fail")
	}
	if _, _, err := ValidateCreate(6, "t", "b"); err == nil {
		t.Fatal("rating 6 should fail")
	}
	if _, _, err := ValidateCreate(5, "", ""); err == nil {
		t.Fatal("empty content should fail")
	}
	title, body, err := ValidateCreate(5, "  hi ", " body ")
	if err != nil {
		t.Fatal(err)
	}
	if title != "hi" || body != "body" {
		t.Fatalf("got %q %q", title, body)
	}
}
