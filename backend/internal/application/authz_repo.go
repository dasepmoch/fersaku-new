package application

import (
	"context"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/authz"
)

// UserRoleDetail is a user_roles join row for list DTOs.
type UserRoleDetail struct {
	UserID     string
	RoleID     string
	RoleCode   string
	RoleName   string
	IsSystem   bool
	AssignedAt time.Time
	AssignedBy *string
}

// AuthzStore is the persistence port for RBAC/tenant (BE-130/BE-135).
type AuthzStore interface {
	ListPermissionCodesForUser(ctx context.Context, userID string) ([]string, error)
	ListRoleCodesForUser(ctx context.Context, userID string) ([]string, error)
	UserHasPermission(ctx context.Context, userID, permissionCode string) (bool, error)
	AssignUserRole(ctx context.Context, userID, roleID string, assignedAt time.Time, assignedBy *string) error
	GetRoleByCode(ctx context.Context, code string) (authz.Role, error)
	GetRoleByID(ctx context.Context, id string) (authz.Role, error)
	GetUserIDByEmailNormalized(ctx context.Context, emailNorm string) (string, error)

	ListAllPermissions(ctx context.Context) ([]authz.Permission, error)
	ListRoles(ctx context.Context, includeArchived bool) ([]authz.Role, error)
	InsertRole(ctx context.Context, r authz.Role) error
	UpdateRoleOptimistic(ctx context.Context, id string, expectedVersion int64, name, description string, now time.Time) (authz.Role, error)
	ArchiveRoleOptimistic(ctx context.Context, id string, expectedVersion int64, now time.Time) (authz.Role, error)
	ReplaceRolePermissions(ctx context.Context, roleID string, codes []string) error
	ListPermissionCodesForRole(ctx context.Context, roleID string) ([]string, error)
	CountRoleAssignments(ctx context.Context, roleID string) (int64, error)

	ListUserRoles(ctx context.Context, userID string) ([]UserRoleDetail, error)
	RemoveUserRole(ctx context.Context, userID, roleID string) (int64, error)
	CountUsersWithRoleCode(ctx context.Context, roleCode string) (int64, error)
	CountUsersWithRoleCodeExcluding(ctx context.Context, roleCode, excludeUserID string) (int64, error)

	InsertStaffInvitation(ctx context.Context, inv authz.StaffInvitation) error
	GetStaffInvitationByID(ctx context.Context, id string) (authz.StaffInvitation, error)
	GetStaffInvitationByTokenHash(ctx context.Context, hash string) (authz.StaffInvitation, error)
	GetStaffInvitationByIdempotency(ctx context.Context, inviterID, key string) (authz.StaffInvitation, error)
	ListStaffInvitations(ctx context.Context, limit int32) ([]authz.StaffInvitation, error)
	RevokeStaffInvitation(ctx context.Context, id string, now time.Time, revokedBy string) (authz.StaffInvitation, error)
	AcceptStaffInvitation(ctx context.Context, id string, now time.Time, userID string) (authz.StaffInvitation, error)

	InsertMerchantInvitation(ctx context.Context, inv authz.MerchantInvitation) error
	GetMerchantInvitationByID(ctx context.Context, id string) (authz.MerchantInvitation, error)
	GetMerchantInvitationByTokenHash(ctx context.Context, hash string) (authz.MerchantInvitation, error)
	GetMerchantInvitationByIdempotency(ctx context.Context, inviterID, key string) (authz.MerchantInvitation, error)
	ListMerchantInvitations(ctx context.Context, limit int32) ([]authz.MerchantInvitation, error)
	RevokeMerchantInvitation(ctx context.Context, id string, now time.Time, revokedBy string) (authz.MerchantInvitation, error)
	AcceptMerchantInvitation(ctx context.Context, id string, now time.Time, userID string) (authz.MerchantInvitation, error)

	GetUserByID(ctx context.Context, id string) (auth.User, error)
	InsertAuditNote(ctx context.Context, id string, payloadHash []byte, now time.Time) error

	InsertMerchant(ctx context.Context, m authz.Merchant) error
	GetMerchantByID(ctx context.Context, id string) (authz.Merchant, error)
	GetMerchantByOwner(ctx context.Context, ownerUserID string) (authz.Merchant, error)
	InsertMerchantMember(ctx context.Context, m authz.MerchantMember) error
	GetActiveMerchantMember(ctx context.Context, merchantID, userID string) (authz.MerchantMember, error)
	ListActiveMerchantMemberships(ctx context.Context, userID string) ([]authz.MerchantMember, error)

	InsertStore(ctx context.Context, s authz.Store) error
	GetStoreByID(ctx context.Context, id string) (authz.Store, error)
	GetCanonicalStoreForMerchant(ctx context.Context, merchantID string) (authz.Store, error)
	// INT-150
	ListStoresForMerchant(ctx context.Context, merchantID string) ([]authz.Store, error)
	GetSellerPreferredStoreID(ctx context.Context, userID string) (string, error) // empty if none
	UpsertSellerPreferredStore(ctx context.Context, userID, storeID string, at time.Time) error

	IsNotFound(err error) bool
}
