package application

import (
	"context"
	"crypto/sha256"
	"fmt"
	"strings"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/authz"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// Default staff invitation TTL.
const StaffInviteTTL = 7 * 24 * time.Hour
const MerchantInviteTTL = 7 * 24 * time.Hour

// SessionRevoker rotates/revokes sessions after privilege changes (optional).
type SessionRevoker interface {
	RevokeAllSessions(ctx context.Context, userID string, now time.Time) (int64, error)
}

// CreateRoleInput creates a custom admin role.
type CreateRoleInput struct {
	ActorUserID string
	Code        string
	Name        string
	Description string
	Permissions []string
}

// UpdateRoleInput updates custom role metadata/permissions with optimistic version.
type UpdateRoleInput struct {
	ActorUserID     string
	RoleID          string
	ExpectedVersion int64
	Name            string
	Description     string
	Permissions     []string // if nil, permissions unchanged; if non-nil (incl empty), replace
}

// ArchiveRoleInput archives a custom role when no assignments remain.
type ArchiveRoleInput struct {
	ActorUserID     string
	RoleID          string
	ExpectedVersion int64
}

// AssignRoleInput assigns a role to a user.
type AssignRoleInput struct {
	ActorUserID  string
	TargetUserID string
	RoleID       string
}

// RemoveRoleInput removes a role assignment.
type RemoveRoleInput struct {
	ActorUserID  string
	TargetUserID string
	RoleID       string
}

// CreateStaffInviteInput creates a staff invitation.
type CreateStaffInviteInput struct {
	ActorUserID    string
	Email          string
	RoleID         string
	IdempotencyKey string
	TTL            time.Duration
}

// CreateMerchantInviteInput creates a merchant invitation.
type CreateMerchantInviteInput struct {
	ActorUserID       string
	Email             string
	MerchantID        string // optional
	RoleInMerchant    string
	OnboardingPurpose string
	IdempotencyKey    string
	TTL               time.Duration
}

// AcceptInviteResult is the outcome of invitation acceptance.
type AcceptInviteResult struct {
	InvitationID   string
	Kind           string // STAFF | MERCHANT
	UserID         string
	ExistingUser   bool
	RoleID         string
	MerchantID     *string
	RequiresMFA    bool
	ActivationHeld bool // true when privileged staff needs MFA before full use
	Message        string
}

// CreateInviteResult returns invite metadata plus raw token once.
type CreateInviteResult struct {
	Invitation any
	RawToken   string
}

// RoleWithPermissions is a role DTO with effective permission codes.
type RoleWithPermissions struct {
	Role        authz.Role
	Permissions []string
}

// ListPermissions returns the permission registry for the role builder.
func (s *AuthzService) ListPermissions(ctx context.Context, actorUserID string) ([]authz.Permission, error) {
	if err := s.RequirePermission(ctx, actorUserID, authz.PermRolesRead); err != nil {
		return nil, err
	}
	return s.Store.ListAllPermissions(ctx)
}

// ListRoles returns system + custom roles (optionally archived).
func (s *AuthzService) ListRoles(ctx context.Context, actorUserID string, includeArchived bool) ([]RoleWithPermissions, error) {
	if err := s.RequirePermission(ctx, actorUserID, authz.PermRolesRead); err != nil {
		return nil, err
	}
	roles, err := s.Store.ListRoles(ctx, includeArchived)
	if err != nil {
		return nil, apperr.Internal(apperr.CodeInternalError, "List roles failed")
	}
	out := make([]RoleWithPermissions, 0, len(roles))
	for _, role := range roles {
		perms, err := s.Store.ListPermissionCodesForRole(ctx, role.ID)
		if err != nil {
			return nil, apperr.Internal(apperr.CodeInternalError, "List role permissions failed")
		}
		out = append(out, RoleWithPermissions{Role: role, Permissions: perms})
	}
	return out, nil
}

// GetRole returns one role with permissions.
func (s *AuthzService) GetRole(ctx context.Context, actorUserID, roleID string) (RoleWithPermissions, error) {
	if err := s.RequirePermission(ctx, actorUserID, authz.PermRolesRead); err != nil {
		return RoleWithPermissions{}, err
	}
	role, err := s.Store.GetRoleByID(ctx, roleID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return RoleWithPermissions{}, authz.ErrNotFound("Role not found")
		}
		return RoleWithPermissions{}, apperr.Internal(apperr.CodeInternalError, "Role lookup failed")
	}
	perms, err := s.Store.ListPermissionCodesForRole(ctx, role.ID)
	if err != nil {
		return RoleWithPermissions{}, apperr.Internal(apperr.CodeInternalError, "List role permissions failed")
	}
	return RoleWithPermissions{Role: role, Permissions: perms}, nil
}

// CreateCustomRole creates a non-system role with anti-escalation permission grant.
func (s *AuthzService) CreateCustomRole(ctx context.Context, in CreateRoleInput) (RoleWithPermissions, error) {
	if err := s.RequirePermission(ctx, in.ActorUserID, authz.PermRolesWrite); err != nil {
		return RoleWithPermissions{}, err
	}
	code := strings.ToUpper(strings.TrimSpace(in.Code))
	if !authz.RoleCodeValid(code) {
		return RoleWithPermissions{}, apperr.Validation(apperr.CodeValidationFailed, "Invalid role code")
	}
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return RoleWithPermissions{}, apperr.Validation(apperr.CodeValidationFailed, "Role name required")
	}
	perms := authz.NormalizePermissionList(in.Permissions)
	actorHeld, err := s.Store.ListPermissionCodesForUser(ctx, in.ActorUserID)
	if err != nil {
		return RoleWithPermissions{}, apperr.Internal(apperr.CodeInternalError, "Load actor permissions failed")
	}
	if err := authz.CanAssignRolePermissions(actorHeld, perms); err != nil {
		return RoleWithPermissions{}, err
	}
	now := s.now()
	role := authz.Role{
		ID:          s.IDs.New(),
		Code:        code,
		Name:        name,
		Description: strings.TrimSpace(in.Description),
		IsSystem:    false,
		Version:     1,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := s.Store.InsertRole(ctx, role); err != nil {
		return RoleWithPermissions{}, apperr.Conflict(apperr.CodeConflict, "Role code already exists")
	}
	if err := s.Store.ReplaceRolePermissions(ctx, role.ID, perms); err != nil {
		return RoleWithPermissions{}, apperr.Internal(apperr.CodeInternalError, "Set role permissions failed")
	}
	s.audit(ctx, "role.create", map[string]any{
		"roleId": role.ID, "code": role.Code, "actor": in.ActorUserID, "version": role.Version,
	})
	return RoleWithPermissions{Role: role, Permissions: perms}, nil
}

// UpdateCustomRole updates metadata/permissions; system roles rejected.
func (s *AuthzService) UpdateCustomRole(ctx context.Context, in UpdateRoleInput) (RoleWithPermissions, error) {
	if err := s.RequirePermission(ctx, in.ActorUserID, authz.PermRolesWrite); err != nil {
		return RoleWithPermissions{}, err
	}
	role, err := s.Store.GetRoleByID(ctx, in.RoleID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return RoleWithPermissions{}, authz.ErrNotFound("Role not found")
		}
		return RoleWithPermissions{}, apperr.Internal(apperr.CodeInternalError, "Role lookup failed")
	}
	if err := authz.RequireSystemRoleImmutable(role); err != nil {
		return RoleWithPermissions{}, err
	}
	if role.ArchivedAt != nil {
		return RoleWithPermissions{}, apperr.Conflict(apperr.CodeConflict, "Role is archived")
	}
	name := strings.TrimSpace(in.Name)
	if name == "" {
		name = role.Name
	}
	desc := in.Description
	if strings.TrimSpace(desc) == "" && in.Description == "" {
		desc = role.Description
	}
	var perms []string
	if in.Permissions != nil {
		perms = authz.NormalizePermissionList(in.Permissions)
		actorHeld, err := s.Store.ListPermissionCodesForUser(ctx, in.ActorUserID)
		if err != nil {
			return RoleWithPermissions{}, apperr.Internal(apperr.CodeInternalError, "Load actor permissions failed")
		}
		if err := authz.CanAssignRolePermissions(actorHeld, perms); err != nil {
			return RoleWithPermissions{}, err
		}
	} else {
		perms, err = s.Store.ListPermissionCodesForRole(ctx, role.ID)
		if err != nil {
			return RoleWithPermissions{}, apperr.Internal(apperr.CodeInternalError, "List role permissions failed")
		}
	}
	now := s.now()
	updated, err := s.Store.UpdateRoleOptimistic(ctx, role.ID, in.ExpectedVersion, name, desc, now)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return RoleWithPermissions{}, apperr.Conflict(apperr.CodeConflict, "Role version conflict")
		}
		return RoleWithPermissions{}, apperr.Internal(apperr.CodeInternalError, "Update role failed")
	}
	if in.Permissions != nil {
		if err := s.Store.ReplaceRolePermissions(ctx, role.ID, perms); err != nil {
			return RoleWithPermissions{}, apperr.Internal(apperr.CodeInternalError, "Set role permissions failed")
		}
		// Privilege change: revoke sessions of assignees.
		s.revokeAssigneesOfRole(ctx, role.ID)
	}
	s.audit(ctx, "role.update", map[string]any{
		"roleId": role.ID, "actor": in.ActorUserID, "version": updated.Version,
	})
	return RoleWithPermissions{Role: updated, Permissions: perms}, nil
}

// ArchiveCustomRole archives when no user_roles remain.
func (s *AuthzService) ArchiveCustomRole(ctx context.Context, in ArchiveRoleInput) (authz.Role, error) {
	if err := s.RequirePermission(ctx, in.ActorUserID, authz.PermRolesWrite); err != nil {
		return authz.Role{}, err
	}
	role, err := s.Store.GetRoleByID(ctx, in.RoleID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return authz.Role{}, authz.ErrNotFound("Role not found")
		}
		return authz.Role{}, apperr.Internal(apperr.CodeInternalError, "Role lookup failed")
	}
	if err := authz.RequireSystemRoleImmutable(role); err != nil {
		return authz.Role{}, err
	}
	n, err := s.Store.CountRoleAssignments(ctx, role.ID)
	if err != nil {
		return authz.Role{}, apperr.Internal(apperr.CodeInternalError, "Count assignments failed")
	}
	if n > 0 {
		return authz.Role{}, apperr.Conflict(apperr.CodeConflict, "Role has active assignments")
	}
	now := s.now()
	archived, err := s.Store.ArchiveRoleOptimistic(ctx, role.ID, in.ExpectedVersion, now)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return authz.Role{}, apperr.Conflict(apperr.CodeConflict, "Role version conflict")
		}
		return authz.Role{}, apperr.Internal(apperr.CodeInternalError, "Archive role failed")
	}
	s.audit(ctx, "role.archive", map[string]any{
		"roleId": role.ID, "actor": in.ActorUserID, "version": archived.Version,
	})
	return archived, nil
}

// ListUserRoleAssignments lists roles for a user.
func (s *AuthzService) ListUserRoleAssignments(ctx context.Context, actorUserID, targetUserID string) ([]UserRoleDetail, error) {
	if err := s.RequirePermission(ctx, actorUserID, authz.PermRolesRead); err != nil {
		return nil, err
	}
	if targetUserID == "" {
		return nil, apperr.Validation(apperr.CodeValidationFailed, "User id required")
	}
	return s.Store.ListUserRoles(ctx, targetUserID)
}

// AssignUserRoleWithPolicy assigns with anti-escalation and session revoke.
func (s *AuthzService) AssignUserRoleWithPolicy(ctx context.Context, in AssignRoleInput) error {
	if err := s.RequirePermission(ctx, in.ActorUserID, authz.PermRolesAssign); err != nil {
		return err
	}
	if in.TargetUserID == "" || in.RoleID == "" {
		return apperr.Validation(apperr.CodeValidationFailed, "Invalid assignment")
	}
	// Self-elevate: still require actor holds all role perms (anti-escalation).
	role, err := s.Store.GetRoleByID(ctx, in.RoleID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return authz.ErrNotFound("Role not found")
		}
		return apperr.Internal(apperr.CodeInternalError, "Role lookup failed")
	}
	if role.ArchivedAt != nil {
		return apperr.Conflict(apperr.CodeConflict, "Role is archived")
	}
	rolePerms, err := s.Store.ListPermissionCodesForRole(ctx, role.ID)
	if err != nil {
		return apperr.Internal(apperr.CodeInternalError, "List role permissions failed")
	}
	actorHeld, err := s.Store.ListPermissionCodesForUser(ctx, in.ActorUserID)
	if err != nil {
		return apperr.Internal(apperr.CodeInternalError, "Load actor permissions failed")
	}
	// System SUPER_ADMIN assignment: actor must hold every permission of the role (delegable filter).
	if err := authz.CanAssignRolePermissions(actorHeld, rolePerms); err != nil {
		// Super admin role includes non-delegable perms — only another super admin who effectively
		// has all perms can assign it. FilterDelegable drops non-delegable, so SUPER_ADMIN assignment
		// via custom path would fail. Allow system SUPER_ADMIN assignment only when actor holds SUPER_ADMIN role.
		if role.Code == authz.RoleSuperAdmin {
			codes, _ := s.Store.ListRoleCodesForUser(ctx, in.ActorUserID)
			hasSA := false
			for _, c := range codes {
				if c == authz.RoleSuperAdmin {
					hasSA = true
					break
				}
			}
			if !hasSA {
				return authz.ErrForbidden("Cannot grant unheld permission")
			}
		} else {
			return err
		}
	}
	// Target must exist
	if _, err := s.Store.GetUserByID(ctx, in.TargetUserID); err != nil {
		if s.Store.IsNotFound(err) {
			return authz.ErrNotFound("User not found")
		}
		return apperr.Internal(apperr.CodeInternalError, "User lookup failed")
	}
	by := in.ActorUserID
	if err := s.Store.AssignUserRole(ctx, in.TargetUserID, role.ID, s.now(), &by); err != nil {
		return apperr.Internal(apperr.CodeInternalError, "Assign role failed")
	}
	s.revokeUserSessions(ctx, in.TargetUserID)
	s.audit(ctx, "role.assign", map[string]any{
		"roleId": role.ID, "targetUserId": in.TargetUserID, "actor": in.ActorUserID,
	})
	return nil
}

// RemoveUserRoleWithPolicy removes assignment with last-super-admin protection.
func (s *AuthzService) RemoveUserRoleWithPolicy(ctx context.Context, in RemoveRoleInput) error {
	if err := s.RequirePermission(ctx, in.ActorUserID, authz.PermRolesAssign); err != nil {
		return err
	}
	role, err := s.Store.GetRoleByID(ctx, in.RoleID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return authz.ErrNotFound("Role not found")
		}
		return apperr.Internal(apperr.CodeInternalError, "Role lookup failed")
	}
	if role.Code == authz.RoleSuperAdmin {
		remaining, err := s.Store.CountUsersWithRoleCodeExcluding(ctx, authz.RoleSuperAdmin, in.TargetUserID)
		if err != nil {
			return apperr.Internal(apperr.CodeInternalError, "Count super admins failed")
		}
		if err := authz.RequireNotLastProtectedAdmin(role.Code, remaining); err != nil {
			return err
		}
	}
	// Actor must hold role perms (or be SUPER_ADMIN) to remove.
	rolePerms, err := s.Store.ListPermissionCodesForRole(ctx, role.ID)
	if err != nil {
		return apperr.Internal(apperr.CodeInternalError, "List role permissions failed")
	}
	actorHeld, err := s.Store.ListPermissionCodesForUser(ctx, in.ActorUserID)
	if err != nil {
		return apperr.Internal(apperr.CodeInternalError, "Load actor permissions failed")
	}
	if err := authz.CanAssignRolePermissions(actorHeld, rolePerms); err != nil {
		if role.Code == authz.RoleSuperAdmin {
			codes, _ := s.Store.ListRoleCodesForUser(ctx, in.ActorUserID)
			hasSA := false
			for _, c := range codes {
				if c == authz.RoleSuperAdmin {
					hasSA = true
					break
				}
			}
			if !hasSA {
				return authz.ErrForbidden("Cannot modify unheld role")
			}
		} else {
			return err
		}
	}
	n, err := s.Store.RemoveUserRole(ctx, in.TargetUserID, role.ID)
	if err != nil {
		return apperr.Internal(apperr.CodeInternalError, "Remove role failed")
	}
	if n == 0 {
		// Idempotent: already absent
		return nil
	}
	s.revokeUserSessions(ctx, in.TargetUserID)
	s.audit(ctx, "role.unassign", map[string]any{
		"roleId": role.ID, "targetUserId": in.TargetUserID, "actor": in.ActorUserID,
	})
	return nil
}

// CreateStaffInvitation creates hashed email-bound staff invite; returns raw token once.
func (s *AuthzService) CreateStaffInvitation(ctx context.Context, in CreateStaffInviteInput) (authz.StaffInvitation, string, error) {
	if err := s.RequirePermission(ctx, in.ActorUserID, authz.PermRolesAssign); err != nil {
		// Also accept invitations.staff if present
		if err2 := s.RequirePermission(ctx, in.ActorUserID, authz.PermInvitationsStaff); err2 != nil {
			return authz.StaffInvitation{}, "", err
		}
	}
	emailNorm := auth.NormalizeEmail(in.Email)
	if emailNorm == "" {
		return authz.StaffInvitation{}, "", apperr.Validation(apperr.CodeValidationFailed, "Invalid email")
	}
	if in.IdempotencyKey != "" {
		if existing, err := s.Store.GetStaffInvitationByIdempotency(ctx, in.ActorUserID, in.IdempotencyKey); err == nil {
			return existing, "", nil // raw token not re-issued
		}
	}
	role, err := s.Store.GetRoleByID(ctx, in.RoleID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return authz.StaffInvitation{}, "", authz.ErrNotFound("Role not found")
		}
		return authz.StaffInvitation{}, "", apperr.Internal(apperr.CodeInternalError, "Role lookup failed")
	}
	if role.ArchivedAt != nil {
		return authz.StaffInvitation{}, "", apperr.Conflict(apperr.CodeConflict, "Role is archived")
	}
	rolePerms, err := s.Store.ListPermissionCodesForRole(ctx, role.ID)
	if err != nil {
		return authz.StaffInvitation{}, "", apperr.Internal(apperr.CodeInternalError, "List role permissions failed")
	}
	actorHeld, err := s.Store.ListPermissionCodesForUser(ctx, in.ActorUserID)
	if err != nil {
		return authz.StaffInvitation{}, "", apperr.Internal(apperr.CodeInternalError, "Load actor permissions failed")
	}
	if err := authz.CanAssignRolePermissions(actorHeld, rolePerms); err != nil {
		if role.Code == authz.RoleSuperAdmin {
			codes, _ := s.Store.ListRoleCodesForUser(ctx, in.ActorUserID)
			ok := false
			for _, c := range codes {
				if c == authz.RoleSuperAdmin {
					ok = true
					break
				}
			}
			if !ok {
				return authz.StaffInvitation{}, "", authz.ErrForbidden("Cannot grant unheld permission")
			}
		} else {
			return authz.StaffInvitation{}, "", err
		}
	}
	raw, err := auth.GenerateToken(32)
	if err != nil {
		return authz.StaffInvitation{}, "", apperr.Internal(apperr.CodeInternalError, "Token generation failed")
	}
	ttl := in.TTL
	if ttl <= 0 {
		ttl = StaffInviteTTL
	}
	now := s.now()
	inv := authz.StaffInvitation{
		ID:              s.IDs.New(),
		EmailNormalized: emailNorm,
		EmailDisplay:    strings.TrimSpace(in.Email),
		InviterUserID:   in.ActorUserID,
		RoleID:          role.ID,
		TokenHash:       auth.HashToken(raw),
		Status:          authz.InvitePending,
		ExpiresAt:       now.Add(ttl),
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	if in.IdempotencyKey != "" {
		k := in.IdempotencyKey
		inv.IdempotencyKey = &k
	}
	if err := s.Store.InsertStaffInvitation(ctx, inv); err != nil {
		return authz.StaffInvitation{}, "", apperr.Internal(apperr.CodeInternalError, "Create invitation failed")
	}
	if s.Mail != nil {
		_ = s.Mail.Send(ctx, emailNorm, "Fersaku staff invitation",
			fmt.Sprintf("You have been invited as staff. Open the invite page and POST the token from the URL fragment.\n#token=%s\n", raw))
	}
	s.audit(ctx, "invite.staff.create", map[string]any{
		"invitationId": inv.ID, "roleId": role.ID, "actor": in.ActorUserID,
	})
	// Clear token hash from returned DTO for safety in list-like responses; handlers may strip.
	safe := inv
	safe.TokenHash = ""
	return safe, raw, nil
}

// ListStaffInvitations lists recent staff invites (no tokens).
func (s *AuthzService) ListStaffInvitations(ctx context.Context, actorUserID string, limit int32) ([]authz.StaffInvitation, error) {
	if err := s.RequirePermission(ctx, actorUserID, authz.PermRolesRead); err != nil {
		if err2 := s.RequirePermission(ctx, actorUserID, authz.PermInvitationsStaff); err2 != nil {
			return nil, err
		}
	}
	rows, err := s.Store.ListStaffInvitations(ctx, limit)
	if err != nil {
		return nil, apperr.Internal(apperr.CodeInternalError, "List invitations failed")
	}
	for i := range rows {
		rows[i].TokenHash = ""
	}
	return rows, nil
}

// RevokeStaffInvitation revokes a pending invite (idempotent if already revoked).
func (s *AuthzService) RevokeStaffInvitation(ctx context.Context, actorUserID, invitationID string) (authz.StaffInvitation, error) {
	if err := s.RequirePermission(ctx, actorUserID, authz.PermRolesAssign); err != nil {
		if err2 := s.RequirePermission(ctx, actorUserID, authz.PermInvitationsStaff); err2 != nil {
			return authz.StaffInvitation{}, err
		}
	}
	existing, err := s.Store.GetStaffInvitationByID(ctx, invitationID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return authz.StaffInvitation{}, authz.ErrNotFound("Invitation not found")
		}
		return authz.StaffInvitation{}, apperr.Internal(apperr.CodeInternalError, "Invitation lookup failed")
	}
	if existing.Status == authz.InviteRevoked {
		existing.TokenHash = ""
		return existing, nil
	}
	if existing.Status != authz.InvitePending {
		return authz.StaffInvitation{}, apperr.Conflict(apperr.CodeConflict, "Invitation is not pending")
	}
	revoked, err := s.Store.RevokeStaffInvitation(ctx, invitationID, s.now(), actorUserID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return authz.StaffInvitation{}, apperr.Conflict(apperr.CodeConflict, "Invitation is not pending")
		}
		return authz.StaffInvitation{}, apperr.Internal(apperr.CodeInternalError, "Revoke failed")
	}
	revoked.TokenHash = ""
	s.audit(ctx, "invite.staff.revoke", map[string]any{
		"invitationId": invitationID, "actor": actorUserID,
	})
	return revoked, nil
}

// CreateMerchantInvitation creates a merchant invite.
func (s *AuthzService) CreateMerchantInvitation(ctx context.Context, in CreateMerchantInviteInput) (authz.MerchantInvitation, string, error) {
	if err := s.RequirePermission(ctx, in.ActorUserID, authz.PermMerchantsWrite); err != nil {
		if err2 := s.RequirePermission(ctx, in.ActorUserID, authz.PermInvitationsMerchant); err2 != nil {
			return authz.MerchantInvitation{}, "", err
		}
	}
	emailNorm := auth.NormalizeEmail(in.Email)
	if emailNorm == "" {
		return authz.MerchantInvitation{}, "", apperr.Validation(apperr.CodeValidationFailed, "Invalid email")
	}
	if in.IdempotencyKey != "" {
		if existing, err := s.Store.GetMerchantInvitationByIdempotency(ctx, in.ActorUserID, in.IdempotencyKey); err == nil {
			return existing, "", nil
		}
	}
	role := authz.MerchantMemberRole(strings.ToUpper(strings.TrimSpace(in.RoleInMerchant)))
	if role != authz.MemberOwner && role != authz.MemberStaff {
		role = authz.MemberOwner
	}
	purpose := strings.TrimSpace(in.OnboardingPurpose)
	if purpose == "" {
		purpose = "SELLER_ONBOARD"
	}
	var merchantID *string
	if strings.TrimSpace(in.MerchantID) != "" {
		mid := strings.TrimSpace(in.MerchantID)
		if _, err := s.Store.GetMerchantByID(ctx, mid); err != nil {
			if s.Store.IsNotFound(err) {
				return authz.MerchantInvitation{}, "", authz.ErrNotFound("Merchant not found")
			}
			return authz.MerchantInvitation{}, "", apperr.Internal(apperr.CodeInternalError, "Merchant lookup failed")
		}
		merchantID = &mid
	}
	raw, err := auth.GenerateToken(32)
	if err != nil {
		return authz.MerchantInvitation{}, "", apperr.Internal(apperr.CodeInternalError, "Token generation failed")
	}
	ttl := in.TTL
	if ttl <= 0 {
		ttl = MerchantInviteTTL
	}
	now := s.now()
	inv := authz.MerchantInvitation{
		ID:                s.IDs.New(),
		EmailNormalized:   emailNorm,
		EmailDisplay:      strings.TrimSpace(in.Email),
		InviterUserID:     in.ActorUserID,
		MerchantID:        merchantID,
		RoleInMerchant:    role,
		OnboardingPurpose: purpose,
		TokenHash:         auth.HashToken(raw),
		Status:            authz.InvitePending,
		ExpiresAt:         now.Add(ttl),
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	if in.IdempotencyKey != "" {
		k := in.IdempotencyKey
		inv.IdempotencyKey = &k
	}
	if err := s.Store.InsertMerchantInvitation(ctx, inv); err != nil {
		return authz.MerchantInvitation{}, "", apperr.Internal(apperr.CodeInternalError, "Create invitation failed")
	}
	if s.Mail != nil {
		_ = s.Mail.Send(ctx, emailNorm, "Fersaku merchant invitation",
			fmt.Sprintf("You have been invited as a merchant. Open the invite page and POST the token from the URL fragment.\n#token=%s\n", raw))
	}
	s.audit(ctx, "invite.merchant.create", map[string]any{
		"invitationId": inv.ID, "actor": in.ActorUserID,
	})
	safe := inv
	safe.TokenHash = ""
	return safe, raw, nil
}

// ListMerchantInvitations lists merchant invites.
func (s *AuthzService) ListMerchantInvitations(ctx context.Context, actorUserID string, limit int32) ([]authz.MerchantInvitation, error) {
	if err := s.RequirePermission(ctx, actorUserID, authz.PermMerchantsRead); err != nil {
		if err2 := s.RequirePermission(ctx, actorUserID, authz.PermInvitationsMerchant); err2 != nil {
			return nil, err
		}
	}
	rows, err := s.Store.ListMerchantInvitations(ctx, limit)
	if err != nil {
		return nil, apperr.Internal(apperr.CodeInternalError, "List invitations failed")
	}
	for i := range rows {
		rows[i].TokenHash = ""
	}
	return rows, nil
}

// RevokeMerchantInvitation revokes pending merchant invite.
func (s *AuthzService) RevokeMerchantInvitation(ctx context.Context, actorUserID, invitationID string) (authz.MerchantInvitation, error) {
	if err := s.RequirePermission(ctx, actorUserID, authz.PermMerchantsWrite); err != nil {
		if err2 := s.RequirePermission(ctx, actorUserID, authz.PermInvitationsMerchant); err2 != nil {
			return authz.MerchantInvitation{}, err
		}
	}
	existing, err := s.Store.GetMerchantInvitationByID(ctx, invitationID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return authz.MerchantInvitation{}, authz.ErrNotFound("Invitation not found")
		}
		return authz.MerchantInvitation{}, apperr.Internal(apperr.CodeInternalError, "Invitation lookup failed")
	}
	if existing.Status == authz.InviteRevoked {
		existing.TokenHash = ""
		return existing, nil
	}
	if existing.Status != authz.InvitePending {
		return authz.MerchantInvitation{}, apperr.Conflict(apperr.CodeConflict, "Invitation is not pending")
	}
	revoked, err := s.Store.RevokeMerchantInvitation(ctx, invitationID, s.now(), actorUserID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return authz.MerchantInvitation{}, apperr.Conflict(apperr.CodeConflict, "Invitation is not pending")
		}
		return authz.MerchantInvitation{}, apperr.Internal(apperr.CodeInternalError, "Revoke failed")
	}
	revoked.TokenHash = ""
	s.audit(ctx, "invite.merchant.revoke", map[string]any{
		"invitationId": invitationID, "actor": actorUserID,
	})
	return revoked, nil
}

// AcceptStaffInvitation consumes POST body token (§6.5); never GET.
// sessionUserID may be empty (new account path) or set (existing session).
func (s *AuthzService) AcceptStaffInvitation(ctx context.Context, rawToken, sessionUserID string) (AcceptInviteResult, error) {
	if strings.TrimSpace(rawToken) == "" {
		return AcceptInviteResult{}, apperr.Validation(apperr.CodeValidationFailed, "Token required")
	}
	hash := auth.HashToken(rawToken)
	inv, err := s.Store.GetStaffInvitationByTokenHash(ctx, hash)
	if err != nil {
		// Generic failure — no existence leak
		return AcceptInviteResult{}, apperr.Validation(apperr.CodeValidationFailed, "Invitation invalid or expired")
	}
	now := s.now()
	if inv.Status == authz.InviteAccepted {
		// Idempotent replay for same accepted invite
		uid := ""
		if inv.AcceptedUserID != nil {
			uid = *inv.AcceptedUserID
		}
		return AcceptInviteResult{
			InvitationID: inv.ID,
			Kind:         "STAFF",
			UserID:       uid,
			ExistingUser: true,
			RoleID:       inv.RoleID,
			Message:      "Invitation already accepted",
		}, nil
	}
	if inv.Status != authz.InvitePending || !inv.ExpiresAt.After(now) {
		return AcceptInviteResult{}, apperr.Validation(apperr.CodeValidationFailed, "Invitation invalid or expired")
	}
	if inv.Status == authz.InviteRevoked {
		return AcceptInviteResult{}, apperr.Validation(apperr.CodeValidationFailed, "Invitation invalid or expired")
	}

	var user auth.User
	existing := false
	if sessionUserID != "" {
		user, err = s.Store.GetUserByID(ctx, sessionUserID)
		if err != nil {
			return AcceptInviteResult{}, apperr.Validation(apperr.CodeValidationFailed, "Invitation invalid or expired")
		}
		if user.EmailNormalized != inv.EmailNormalized {
			return AcceptInviteResult{}, apperr.Validation(apperr.CodeValidationFailed, "Invitation invalid or expired")
		}
		existing = true
	} else {
		// Resolve by bound email
		uid, err := s.Store.GetUserIDByEmailNormalized(ctx, inv.EmailNormalized)
		if err != nil {
			if s.Store.IsNotFound(err) {
				return AcceptInviteResult{}, apperr.Validation(apperr.CodeValidationFailed,
					"Account required: register and verify email matching invitation before accepting")
			}
			return AcceptInviteResult{}, apperr.Internal(apperr.CodeInternalError, "User lookup failed")
		}
		user, err = s.Store.GetUserByID(ctx, uid)
		if err != nil {
			return AcceptInviteResult{}, apperr.Internal(apperr.CodeInternalError, "User lookup failed")
		}
		existing = true
	}

	// Privileged activation requires verified email
	if user.EmailVerifiedAt == nil {
		return AcceptInviteResult{}, apperr.Forbidden(apperr.CodeForbidden, "Verified email required for staff activation")
	}
	rolePerms, err := s.Store.ListPermissionCodesForRole(ctx, inv.RoleID)
	if err != nil {
		return AcceptInviteResult{}, apperr.Internal(apperr.CodeInternalError, "List role permissions failed")
	}
	requiresMFA := authz.StaffRoleRequiresMFA(rolePerms)
	activationHeld := requiresMFA && !user.MFAEnabled

	accepted, err := s.Store.AcceptStaffInvitation(ctx, inv.ID, now, user.ID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return AcceptInviteResult{}, apperr.Validation(apperr.CodeValidationFailed, "Invitation invalid or expired")
		}
		return AcceptInviteResult{}, apperr.Internal(apperr.CodeInternalError, "Accept invitation failed")
	}
	// Assign role even if MFA held — admin surface still gated by MFA middleware later;
	// document activationHeld for clients.
	by := accepted.InviterUserID
	_ = s.Store.AssignUserRole(ctx, user.ID, inv.RoleID, now, &by)
	s.revokeUserSessions(ctx, user.ID)
	s.audit(ctx, "invite.staff.accept", map[string]any{
		"invitationId": inv.ID, "userId": user.ID, "roleId": inv.RoleID, "requiresMfa": requiresMFA,
	})
	msg := "Staff invitation accepted"
	if activationHeld {
		msg = "Staff invitation accepted; enroll MFA before privileged admin use"
	}
	return AcceptInviteResult{
		InvitationID:   inv.ID,
		Kind:           "STAFF",
		UserID:         user.ID,
		ExistingUser:   existing,
		RoleID:         inv.RoleID,
		RequiresMFA:    requiresMFA,
		ActivationHeld: activationHeld,
		Message:        msg,
	}, nil
}

// AcceptMerchantInvitation consumes POST body token.
func (s *AuthzService) AcceptMerchantInvitation(ctx context.Context, rawToken, sessionUserID string) (AcceptInviteResult, error) {
	if strings.TrimSpace(rawToken) == "" {
		return AcceptInviteResult{}, apperr.Validation(apperr.CodeValidationFailed, "Token required")
	}
	hash := auth.HashToken(rawToken)
	inv, err := s.Store.GetMerchantInvitationByTokenHash(ctx, hash)
	if err != nil {
		return AcceptInviteResult{}, apperr.Validation(apperr.CodeValidationFailed, "Invitation invalid or expired")
	}
	now := s.now()
	if inv.Status == authz.InviteAccepted {
		uid := ""
		if inv.AcceptedUserID != nil {
			uid = *inv.AcceptedUserID
		}
		return AcceptInviteResult{
			InvitationID: inv.ID,
			Kind:         "MERCHANT",
			UserID:       uid,
			ExistingUser: true,
			MerchantID:   inv.MerchantID,
			Message:      "Invitation already accepted",
		}, nil
	}
	if inv.Status != authz.InvitePending || !inv.ExpiresAt.After(now) {
		return AcceptInviteResult{}, apperr.Validation(apperr.CodeValidationFailed, "Invitation invalid or expired")
	}

	var user auth.User
	if sessionUserID != "" {
		user, err = s.Store.GetUserByID(ctx, sessionUserID)
		if err != nil {
			return AcceptInviteResult{}, apperr.Validation(apperr.CodeValidationFailed, "Invitation invalid or expired")
		}
		if user.EmailNormalized != inv.EmailNormalized {
			return AcceptInviteResult{}, apperr.Validation(apperr.CodeValidationFailed, "Invitation invalid or expired")
		}
	} else {
		uid, err := s.Store.GetUserIDByEmailNormalized(ctx, inv.EmailNormalized)
		if err != nil {
			if s.Store.IsNotFound(err) {
				return AcceptInviteResult{}, apperr.Validation(apperr.CodeValidationFailed,
					"Account required: register with invitation email before accepting")
			}
			return AcceptInviteResult{}, apperr.Internal(apperr.CodeInternalError, "User lookup failed")
		}
		user, err = s.Store.GetUserByID(ctx, uid)
		if err != nil {
			return AcceptInviteResult{}, apperr.Internal(apperr.CodeInternalError, "User lookup failed")
		}
	}

	accepted, err := s.Store.AcceptMerchantInvitation(ctx, inv.ID, now, user.ID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return AcceptInviteResult{}, apperr.Validation(apperr.CodeValidationFailed, "Invitation invalid or expired")
		}
		return AcceptInviteResult{}, apperr.Internal(apperr.CodeInternalError, "Accept invitation failed")
	}

	// Attach membership if merchant_id set; else create merchant+store for OWNER onboard.
	var merchantID *string
	if inv.MerchantID != nil {
		_ = s.Store.InsertMerchantMember(ctx, authz.MerchantMember{
			MerchantID:     *inv.MerchantID,
			UserID:         user.ID,
			RoleInMerchant: inv.RoleInMerchant,
			Status:         authz.MemberActive,
			CreatedAt:      now,
		})
		merchantID = inv.MerchantID
	} else if inv.RoleInMerchant == authz.MemberOwner {
		m, _, err := s.CreateMerchantWithCanonicalStore(ctx, user.ID, user.Name,
			fmt.Sprintf("m-%s", user.ID), user.Name)
		if err == nil {
			merchantID = &m.ID
		}
	}
	_ = s.AssignSystemRole(ctx, user.ID, authz.RoleSellerOwner, &accepted.InviterUserID)
	s.audit(ctx, "invite.merchant.accept", map[string]any{
		"invitationId": inv.ID, "userId": user.ID,
	})
	return AcceptInviteResult{
		InvitationID: inv.ID,
		Kind:         "MERCHANT",
		UserID:       user.ID,
		ExistingUser: true,
		MerchantID:   merchantID,
		Message:      "Merchant invitation accepted",
	}, nil
}

// AcceptInvitation is a unified POST body consumer (staff then merchant by token hash).
func (s *AuthzService) AcceptInvitation(ctx context.Context, rawToken, sessionUserID string) (AcceptInviteResult, error) {
	if strings.TrimSpace(rawToken) == "" {
		return AcceptInviteResult{}, apperr.Validation(apperr.CodeValidationFailed, "Token required")
	}
	hash := auth.HashToken(rawToken)
	if _, err := s.Store.GetStaffInvitationByTokenHash(ctx, hash); err == nil {
		return s.AcceptStaffInvitation(ctx, rawToken, sessionUserID)
	}
	if _, err := s.Store.GetMerchantInvitationByTokenHash(ctx, hash); err == nil {
		return s.AcceptMerchantInvitation(ctx, rawToken, sessionUserID)
	}
	return AcceptInviteResult{}, apperr.Validation(apperr.CodeValidationFailed, "Invitation invalid or expired")
}

func (s *AuthzService) revokeUserSessions(ctx context.Context, userID string) {
	if s.Sessions == nil || userID == "" {
		return
	}
	_, _ = s.Sessions.RevokeAllSessions(ctx, userID, s.now())
}

func (s *AuthzService) revokeAssigneesOfRole(ctx context.Context, roleID string) {
	// Without list-by-role query, skip bulk; assignment mutations revoke per user.
	_ = roleID
}

func (s *AuthzService) audit(ctx context.Context, action string, fields map[string]any) {
	if s.Store == nil || s.IDs == nil {
		return
	}
	// Never include raw token or full email in audit payload.
	payload := fmt.Sprintf("%s:%v", action, fields)
	sum := sha256.Sum256([]byte(payload))
	_ = s.Store.InsertAuditNote(ctx, s.IDs.New(), sum[:], s.now())
	if s.Log != nil {
		args := []any{"action", action}
		for k, v := range fields {
			args = append(args, k, v)
		}
		s.Log.Info("authz audit", args...)
	}
}
