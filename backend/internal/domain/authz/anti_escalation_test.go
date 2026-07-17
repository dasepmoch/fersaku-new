package authz_test

import (
	"testing"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/authz"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

func TestCannotGrantUnheldPermission(t *testing.T) {
	held := []string{authz.PermMerchantsRead, authz.PermRolesRead}
	grantable := authz.FilterDelegable(held)
	err := authz.ValidatePermissionGrant(grantable, []string{authz.PermKYCReview})
	if err == nil {
		t.Fatal("expected forbid unheld")
	}
	ae, ok := apperr.AsAppError(err)
	if !ok || ae.Code != apperr.CodeForbidden {
		t.Fatalf("want FORBIDDEN got %#v", err)
	}
}

func TestCanGrantHeldDelegable(t *testing.T) {
	held := []string{authz.PermMerchantsRead, authz.PermRolesWrite}
	grantable := authz.FilterDelegable(held)
	if err := authz.ValidatePermissionGrant(grantable, []string{authz.PermMerchantsRead}); err != nil {
		t.Fatal(err)
	}
}

func TestNonDelegableBlockedEvenIfHeld(t *testing.T) {
	held := []string{authz.PermPlatformEmergency, authz.PermMerchantsRead}
	grantable := authz.FilterDelegable(held)
	if _, ok := grantable[authz.PermPlatformEmergency]; ok {
		t.Fatal("platform.emergency must not be delegable")
	}
	err := authz.ValidatePermissionGrant(grantable, []string{authz.PermPlatformEmergency})
	if err == nil {
		t.Fatal("expected non-delegable forbid")
	}
}

func TestLastProtectedAdmin(t *testing.T) {
	if err := authz.RequireNotLastProtectedAdmin(authz.RoleSuperAdmin, 0); err == nil {
		t.Fatal("expected forbid last super admin")
	}
	if err := authz.RequireNotLastProtectedAdmin(authz.RoleSuperAdmin, 1); err != nil {
		t.Fatal(err)
	}
	if err := authz.RequireNotLastProtectedAdmin(authz.RoleAdminSupport, 0); err != nil {
		t.Fatal(err)
	}
}

func TestRoleCodeValid(t *testing.T) {
	if !authz.RoleCodeValid("CUSTOM_OPS") {
		t.Fatal("expected valid")
	}
	if authz.RoleCodeValid(authz.RoleSuperAdmin) {
		t.Fatal("system code invalid for custom")
	}
	if authz.RoleCodeValid("") || authz.RoleCodeValid("bad code") {
		t.Fatal("expected invalid")
	}
}

func TestStaffRoleRequiresMFA(t *testing.T) {
	if !authz.StaffRoleRequiresMFA([]string{authz.PermAdminPing}) {
		t.Fatal("admin.ping should require MFA")
	}
	if authz.StaffRoleRequiresMFA([]string{authz.PermBuyerPurchasesRead}) {
		t.Fatal("buyer-only should not require MFA")
	}
}
