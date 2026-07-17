package authz

import (
	"sort"
	"strings"

	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// NonDelegablePermissions cannot be granted via custom roles/assignments even if held.
// Super-admin system role still carries them; they are not copyable into custom roles.
func NonDelegablePermissions() map[string]struct{} {
	return map[string]struct{}{
		PermPlatformEmergency:         {},
		PermImpersonationSupportWrite: {},
	}
}

// IsDelegable reports whether a permission may be granted by an actor who holds it.
func IsDelegable(code string) bool {
	if code == "" {
		return false
	}
	_, blocked := NonDelegablePermissions()[code]
	return !blocked
}

// FilterDelegable returns codes the actor may grant (held ∩ delegable ∩ known registry).
func FilterDelegable(actorHeld []string) map[string]struct{} {
	registry := PermissionSet(AllPermissionCodes())
	out := make(map[string]struct{})
	for _, c := range actorHeld {
		if !IsDelegable(c) {
			continue
		}
		if _, ok := registry[c]; !ok {
			continue
		}
		out[c] = struct{}{}
	}
	return out
}

// ValidatePermissionGrant returns FORBIDDEN if any requested code is outside grantable.
func ValidatePermissionGrant(grantable map[string]struct{}, requested []string) error {
	if grantable == nil {
		grantable = map[string]struct{}{}
	}
	for _, c := range requested {
		c = strings.TrimSpace(c)
		if c == "" {
			return apperr.Validation(apperr.CodeValidationFailed, "Empty permission code")
		}
		if !IsKnownPermission(c) {
			return apperr.Validation(apperr.CodeValidationFailed, "Unknown permission code")
		}
		if !IsDelegable(c) {
			return ErrForbidden("Permission is not delegable")
		}
		if _, ok := grantable[c]; !ok {
			return ErrForbidden("Cannot grant unheld permission")
		}
	}
	return nil
}

// IsKnownPermission reports whether code is in the launch registry.
func IsKnownPermission(code string) bool {
	for _, c := range AllPermissionCodes() {
		if c == code {
			return true
		}
	}
	// invitations.* added in BE-135 migration; keep registry list authoritative via AllPermissionCodes.
	return false
}

// NormalizePermissionList dedupes and sorts permission codes.
func NormalizePermissionList(codes []string) []string {
	set := PermissionSet(codes)
	out := make([]string, 0, len(set))
	for c := range set {
		if c != "" {
			out = append(out, c)
		}
	}
	sort.Strings(out)
	return out
}

// PermissionSubset reports whether every code in subset is present in superset.
func PermissionSubset(subset, superset []string) bool {
	s := PermissionSet(superset)
	for _, c := range subset {
		if _, ok := s[c]; !ok {
			return false
		}
	}
	return true
}

// CanAssignRolePermissions checks anti-escalation for assigning a role whose effective perms are rolePerms.
func CanAssignRolePermissions(actorHeld, rolePerms []string) error {
	grantable := FilterDelegable(actorHeld)
	return ValidatePermissionGrant(grantable, rolePerms)
}

// RequireNotLastProtectedAdmin returns error when removing SUPER_ADMIN would leave zero holders.
func RequireNotLastProtectedAdmin(roleCode string, remainingSuperAdmins int64) error {
	if roleCode != RoleSuperAdmin {
		return nil
	}
	if remainingSuperAdmins <= 0 {
		return ErrForbidden("Cannot remove the last protected administrator")
	}
	return nil
}

// RoleCodeValid validates custom role code shape (not a system role code).
func RoleCodeValid(code string) bool {
	code = strings.TrimSpace(code)
	if code == "" || len(code) > 64 {
		return false
	}
	if IsSystemRole(code) {
		return false
	}
	for _, r := range code {
		if (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' || r == '-' {
			continue
		}
		return false
	}
	return true
}

// StaffRoleRequiresMFA reports whether accepting a staff role needs MFA before privileged activation.
func StaffRoleRequiresMFA(permissionCodes []string) bool {
	for _, c := range permissionCodes {
		switch {
		case c == PermAdminPing,
			c == PermRolesRead, c == PermRolesWrite, c == PermRolesAssign,
			c == PermMerchantsWrite, c == PermKYCReview, c == PermWithdrawalsReview,
			c == PermImpersonationStart, c == PermPlatformEmergency,
			c == PermCampaignsPublish, c == PermAuditRead,
			strings.HasPrefix(c, "invitations."):
			return true
		}
	}
	return false
}
