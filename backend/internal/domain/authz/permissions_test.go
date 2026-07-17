package authz_test

import (
	"testing"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/authz"
)

func TestHasPermissionDenyByDefault(t *testing.T) {
	if authz.HasPermission(nil, authz.PermAdminPing) {
		t.Fatal("nil set must deny")
	}
	if authz.HasPermission(map[string]struct{}{}, authz.PermAdminPing) {
		t.Fatal("empty set must deny")
	}
	set := authz.PermissionSet([]string{authz.PermMerchantsRead})
	if !authz.HasPermission(set, authz.PermMerchantsRead) {
		t.Fatal("expected grant")
	}
	if authz.HasPermission(set, authz.PermKYCReview) {
		t.Fatal("expected deny for ungranted")
	}
}

func TestSystemRoleImmutableFlag(t *testing.T) {
	for _, code := range authz.SystemRoleCodes() {
		if !authz.IsSystemRole(code) {
			t.Fatalf("%s should be system", code)
		}
	}
	if authz.IsSystemRole("CUSTOM_SUPPORT") {
		t.Fatal("custom role must not be system")
	}
	role := authz.Role{Code: authz.RoleSuperAdmin, IsSystem: true}
	if err := authz.RequireSystemRoleImmutable(role); err == nil {
		t.Fatal("expected immutable error")
	}
	custom := authz.Role{Code: "CUSTOM_OPS", IsSystem: false}
	if err := authz.RequireSystemRoleImmutable(custom); err != nil {
		t.Fatalf("custom role should be mutable for BE-135: %v", err)
	}
}

func TestBuyerOwnsResource(t *testing.T) {
	if err := authz.BuyerOwnsResource("u1", "u1"); err != nil {
		t.Fatal(err)
	}
	if err := authz.BuyerOwnsResource("u1", "u2"); err == nil {
		t.Fatal("expected cross-tenant deny")
	}
}

func TestAllPermissionCodesNonEmpty(t *testing.T) {
	codes := authz.AllPermissionCodes()
	if len(codes) < 10 {
		t.Fatalf("expected launch permission set, got %d", len(codes))
	}
	seen := map[string]struct{}{}
	for _, c := range codes {
		if c == "" {
			t.Fatal("empty permission code")
		}
		if _, ok := seen[c]; ok {
			t.Fatalf("duplicate %s", c)
		}
		seen[c] = struct{}{}
	}
}
