package authz

import apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"

// Authorization policy for FORBIDDEN vs NOT_FOUND (BE-130 / §11.4):
//
//   - FORBIDDEN (403): principal is authenticated and the action/route is known,
//     but they lack the required permission, membership, or unscoped list grant.
//     Example: user without merchants.read calling GET /v1/admin/ping.
//
//   - NOT_FOUND (404): principal supplies a resource ID that may belong to another
//     tenant; prefer 404 over existence leak (IDOR). Example: seller A requests
//     store belonging to merchant B; buyer checks resource owned by another user.
//
// Prefer 404 for cross-tenant ID access. Prefer 403 for missing permission on a
// non-enumerating action the principal already addressed (admin matrix).

// ErrForbidden is a standard FORBIDDEN app error.
func ErrForbidden(message string) *apperr.AppError {
	if message == "" {
		message = "Forbidden"
	}
	return apperr.Forbidden(apperr.CodeForbidden, message)
}

// ErrNotFound is a standard RESOURCE_NOT_FOUND app error (cross-tenant safe).
func ErrNotFound(message string) *apperr.AppError {
	if message == "" {
		message = "Resource not found"
	}
	return apperr.NotFound(apperr.CodeResourceNotFound, message)
}

// DenyMissingPermission returns FORBIDDEN when a known permission is absent.
func DenyMissingPermission(code string) *apperr.AppError {
	_ = code
	return ErrForbidden("Missing required permission")
}

// DenyCrossTenant returns NOT_FOUND to avoid existence leak on foreign IDs.
func DenyCrossTenant() *apperr.AppError {
	return ErrNotFound("Resource not found")
}

// DenyUnscopedList returns FORBIDDEN when a list would be unscoped without grant.
func DenyUnscopedList() *apperr.AppError {
	return ErrForbidden("Unscoped list requires permission")
}

// BuyerOwnsResource returns nil when owner matches principal; else NOT_FOUND.
func BuyerOwnsResource(principalUserID, resourceOwnerUserID string) error {
	if principalUserID == "" || resourceOwnerUserID == "" || principalUserID != resourceOwnerUserID {
		return DenyCrossTenant()
	}
	return nil
}

// RequireSystemRoleImmutable returns error if a mutation targets a system role.
func RequireSystemRoleImmutable(role Role) error {
	if role.IsSystem || IsSystemRole(role.Code) {
		return ErrForbidden("System roles are immutable")
	}
	return nil
}
