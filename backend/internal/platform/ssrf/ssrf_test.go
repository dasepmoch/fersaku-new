package ssrf

import (
	"context"
	"testing"
	"time"
)

func TestValidateHTTPSURL_PrivateIPLiteral(t *testing.T) {
	cases := []string{
		"https://127.0.0.1/hook",
		"https://10.0.0.1/hook",
		"https://192.168.1.1/hook",
		"https://169.254.169.254/latest/meta-data",
		"https://localhost/hook",
		"http://example.com/hook",
		"https://user:pass@example.com/hook",
	}
	for _, c := range cases {
		if _, err := ValidateHTTPSURL(c); err == nil {
			t.Fatalf("expected reject for %s", c)
		}
	}
}

func TestValidateHTTPSURL_OK(t *testing.T) {
	u, err := ValidateHTTPSURL("https://hooks.merchant.example/fsk")
	if err != nil {
		t.Fatal(err)
	}
	if u.Hostname() != "hooks.merchant.example" {
		t.Fatalf("host %s", u.Hostname())
	}
}

func TestResolveAndValidate_PrivateIP(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_, _, err := ResolveAndValidate(ctx, "https://127.0.0.1/hook")
	if !IsPrivate(err) {
		t.Fatalf("expected private, got %v", err)
	}
}
