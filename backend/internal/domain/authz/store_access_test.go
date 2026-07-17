package authz_test

import (
	"testing"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/authz"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

func TestCapabilitiesForMemberRole(t *testing.T) {
	owner := authz.CapabilitiesForMemberRole(authz.MemberOwner)
	staff := authz.CapabilitiesForMemberRole(authz.MemberStaff)
	if len(owner) != 2 || len(staff) != 2 {
		t.Fatalf("owner=%v staff=%v", owner, staff)
	}
	if !authz.MemberRoleAllowsWrite(authz.MemberOwner) || !authz.MemberRoleAllowsRead(authz.MemberStaff) {
		t.Fatal("owner/staff should allow read+write under frozen schema")
	}
	if len(authz.CapabilitiesForMemberRole(authz.MerchantMemberRole("GHOST"))) != 0 {
		t.Fatal("unknown role has no caps")
	}
}

func TestRequireStoreCapability(t *testing.T) {
	access := authz.StoreAccess{
		Capabilities: authz.CapabilitiesForMemberRole(authz.MemberOwner),
	}
	if err := authz.RequireStoreCapability(access, authz.StoreCapRead); err != nil {
		t.Fatal(err)
	}
	empty := authz.StoreAccess{}
	err := authz.RequireStoreCapability(empty, authz.StoreCapWrite)
	if err == nil {
		t.Fatal("expected forbidden")
	}
	ae, ok := apperr.AsAppError(err)
	if !ok || ae.Code != apperr.CodeForbidden {
		t.Fatalf("got %#v", err)
	}
}
