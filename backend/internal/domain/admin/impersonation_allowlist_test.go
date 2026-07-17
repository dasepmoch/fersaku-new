package admin

import (
	"testing"
)

func TestValidImpersonationScope_OnlyTwo(t *testing.T) {
	if !ValidImpersonationScope("READ_ONLY") || !ValidImpersonationScope("support_write") {
		t.Fatal("expected READ_ONLY and SUPPORT_WRITE valid")
	}
	for _, bad := range []string{"PRIVILEGED", "FULL", "FULL_ACCESS", "ADMIN", "write", ""} {
		if ValidImpersonationScope(bad) {
			t.Fatalf("scope %q must be rejected", bad)
		}
		if bad != "" && !IsPrivilegedLikeScope(bad) && bad != "write" {
			// privileged-like detector for known full values
		}
	}
	if !IsPrivilegedLikeScope("PRIVILEGED") || !IsPrivilegedLikeScope("FULL") {
		t.Fatal("privileged-like detector")
	}
	if !ValidImpersonationTTL(15) || !ValidImpersonationTTL(30) || !ValidImpersonationTTL(60) {
		t.Fatal("TTL 15/30/60")
	}
	if ValidImpersonationTTL(10) || ValidImpersonationTTL(120) {
		t.Fatal("invalid TTL accepted")
	}
}

func TestSupportWriteAllowlist_ExactlyTwoCommands(t *testing.T) {
	if len(SupportWriteAllowlist) != 2 {
		t.Fatalf("allowlist must be exactly 2, got %d", len(SupportWriteAllowlist))
	}
	if MatchSupportWrite("PATCH", "/v1/buyer/profile") == nil {
		t.Fatal("buyer profile allowlisted")
	}
	if MatchSupportWrite("PATCH", "/v1/stores/store_abc") == nil {
		t.Fatal("store presentation allowlisted")
	}
	// Default-deny finance/KYC/credentials/auth/admin/products/inventory/delivery
	denied := []struct{ m, p string }{
		{"POST", "/v1/stores/s1/products"},
		{"PATCH", "/v1/stores/s1/products/p1"},
		{"POST", "/v1/stores/s1/inventory/items/i1/reveal"},
		{"POST", "/v1/stores/s1/orders/o1/delivery/resend"},
		{"POST", "/v1/stores/s1/withdrawals"},
		{"POST", "/v1/stores/s1/api-credential-requests"},
		{"POST", "/v1/kyc/cases"},
		{"POST", "/v1/auth/password/change"},
		{"POST", "/v1/admin/merchants/m1/status"},
		{"POST", "/v1/admin/actions"},
		{"PATCH", "/v1/me/profile"},
		{"PATCH", "/v1/onboarding/store"},
		{"POST", "/v1/checkout/sessions"},
		{"POST", "/v1/gateway/payments"},
	}
	for _, d := range denied {
		if MatchSupportWrite(d.m, d.p) != nil {
			t.Fatalf("must deny %s %s", d.m, d.p)
		}
	}
}

func TestDefaultDenyRegistry_UnknownMutationsDenied(t *testing.T) {
	// Every registry entry that is not one of the two allowlisted routes is denied.
	for _, e := range KnownMutationRegistry {
		allowed := IsAllowlistedMutation(e.Method, concretePath(e.Path))
		wantAllow := (e.Method == "PATCH" && (e.Path == "/v1/buyer/profile" || e.Path == "/v1/stores/{storeId}"))
		if allowed != wantAllow {
			t.Fatalf("%s %s: allow=%v want=%v", e.Method, e.Path, allowed, wantAllow)
		}
	}
	// Newly invented mutation path must be denied until explicitly added to allowlist.
	if IsAllowlistedMutation("POST", "/v1/stores/s1/brand-new-mutation") {
		t.Fatal("unknown mutation must default-deny")
	}
}

func TestValidateSupportWriteFields_RejectUnknown(t *testing.T) {
	cmd := MatchSupportWrite("PATCH", "/v1/buyer/profile")
	if err := ValidateSupportWriteFields(cmd, map[string]any{"displayName": "A"}); err != nil {
		t.Fatal(err)
	}
	if err := ValidateSupportWriteFields(cmd, map[string]any{"displayName": "A", "phone": "1"}); err == nil {
		t.Fatal("phone must be rejected")
	}
	if err := ValidateSupportWriteFields(cmd, map[string]any{"expectedVersion": 1}); err == nil {
		t.Fatal("meta-only body must fail")
	}
	sc := MatchSupportWrite("PATCH", "/v1/stores/x")
	if err := ValidateSupportWriteFields(sc, map[string]any{"name": "N", "price": 1}); err == nil {
		t.Fatal("price field must be rejected")
	}
	if v := PathParamValue(sc, "/v1/stores/store_99"); v != "store_99" {
		t.Fatalf("path param=%q", v)
	}
}

func concretePath(pattern string) string {
	// Substitute {param} for match tests on static registry patterns.
	out := ""
	for i := 0; i < len(pattern); {
		if pattern[i] == '{' {
			j := i
			for j < len(pattern) && pattern[j] != '}' {
				j++
			}
			out += "x"
			if j < len(pattern) {
				i = j + 1
			} else {
				break
			}
			continue
		}
		out += string(pattern[i])
		i++
	}
	return out
}
