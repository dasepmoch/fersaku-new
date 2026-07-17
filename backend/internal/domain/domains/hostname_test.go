package domains

import "testing"

func TestNormalizeHostname_Valid(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"Shop.Example.COM", "shop.example.com"},
		{"shop.example.com.", "shop.example.com"},
		{"my-store.example.co.id", "my-store.example.co.id"},
	}
	for _, tc := range cases {
		n, d, err := NormalizeHostname(tc.in)
		if err != nil {
			t.Fatalf("%q: %v", tc.in, err)
		}
		if n != tc.want {
			t.Fatalf("%q: got %q want %q", tc.in, n, tc.want)
		}
		if d == "" {
			t.Fatalf("%q: empty display", tc.in)
		}
	}
}

func TestNormalizeHostname_Reject(t *testing.T) {
	bad := []string{
		"",
		"*",
		"*.example.com",
		"1.2.3.4",
		"::1",
		"[::1]",
		"localhost",
		"com",
		"co.id",
		"example",
		"http://shop.example.com",
		"shop.example.com/path",
		"user@shop.example.com",
		"shop.example.com:443",
		"api.fersaku.com",
		"foo.fersaku.com",
		"foo.localhost",
		"foo.local",
		"-bad.example.com",
		"bad-.example.com",
		"a..b.example.com",
	}
	for _, in := range bad {
		if _, _, err := NormalizeHostname(in); err == nil {
			t.Fatalf("expected reject for %q", in)
		}
	}
}

func TestNormalizeRequestHost_StripsPort(t *testing.T) {
	n, err := NormalizeRequestHost("Shop.Example.COM:8443")
	if err != nil {
		t.Fatal(err)
	}
	if n != "shop.example.com" {
		t.Fatalf("got %q", n)
	}
}
