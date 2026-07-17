package postgres

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres/gen"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/authz"
)

// AuthzRepo is the Postgres adapter for RBAC/tenant (BE-130/BE-135).
type AuthzRepo struct {
	pool *pgxpool.Pool
	q    *gen.Queries
}

func NewAuthzRepo(pool *pgxpool.Pool) *AuthzRepo {
	return &AuthzRepo{pool: pool, q: gen.New(pool)}
}

func (r *AuthzRepo) IsNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func (r *AuthzRepo) ListPermissionCodesForUser(ctx context.Context, userID string) ([]string, error) {
	rows, err := r.q.ListPermissionCodesForUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("authz: list permissions: %w", err)
	}
	return rows, nil
}

func (r *AuthzRepo) ListRoleCodesForUser(ctx context.Context, userID string) ([]string, error) {
	rows, err := r.q.ListRoleCodesForUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("authz: list roles: %w", err)
	}
	return rows, nil
}

func (r *AuthzRepo) UserHasPermission(ctx context.Context, userID, permissionCode string) (bool, error) {
	ok, err := r.q.UserHasPermission(ctx, gen.UserHasPermissionParams{
		UserID:         userID,
		PermissionCode: permissionCode,
	})
	if err != nil {
		return false, fmt.Errorf("authz: has permission: %w", err)
	}
	return ok, nil
}

func (r *AuthzRepo) AssignUserRole(ctx context.Context, userID, roleID string, assignedAt time.Time, assignedBy *string) error {
	err := r.q.AssignUserRole(ctx, gen.AssignUserRoleParams{
		UserID:     userID,
		RoleID:     roleID,
		AssignedAt: assignedAt,
		AssignedBy: assignedBy,
	})
	if err != nil {
		return fmt.Errorf("authz: assign role: %w", err)
	}
	return nil
}

func (r *AuthzRepo) GetRoleByCode(ctx context.Context, code string) (authz.Role, error) {
	row, err := r.q.GetRoleByCode(ctx, code)
	if err != nil {
		return authz.Role{}, err
	}
	return mapRole(row), nil
}

func (r *AuthzRepo) GetRoleByID(ctx context.Context, id string) (authz.Role, error) {
	row, err := r.q.GetRoleByID(ctx, id)
	if err != nil {
		return authz.Role{}, err
	}
	return mapRole(row), nil
}

func (r *AuthzRepo) GetUserIDByEmailNormalized(ctx context.Context, emailNorm string) (string, error) {
	id, err := r.q.GetUserIDByEmailNormalized(ctx, emailNorm)
	if err != nil {
		return "", err
	}
	return id, nil
}

func (r *AuthzRepo) ListAllPermissions(ctx context.Context) ([]authz.Permission, error) {
	rows, err := r.q.ListAllPermissions(ctx)
	if err != nil {
		return nil, fmt.Errorf("authz: list all permissions: %w", err)
	}
	out := make([]authz.Permission, 0, len(rows))
	for _, row := range rows {
		out = append(out, authz.Permission{
			Code:        row.Code,
			Description: row.Description,
			Category:    row.Category,
			CreatedAt:   row.CreatedAt,
		})
	}
	return out, nil
}

func (r *AuthzRepo) ListRoles(ctx context.Context, includeArchived bool) ([]authz.Role, error) {
	rows, err := r.q.ListRoles(ctx, includeArchived)
	if err != nil {
		return nil, fmt.Errorf("authz: list roles: %w", err)
	}
	out := make([]authz.Role, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapRole(row))
	}
	return out, nil
}

func (r *AuthzRepo) InsertRole(ctx context.Context, role authz.Role) error {
	err := r.q.InsertRole(ctx, gen.InsertRoleParams{
		ID:          role.ID,
		Code:        role.Code,
		Name:        role.Name,
		Description: role.Description,
		CreatedAt:   role.CreatedAt,
	})
	if err != nil {
		return fmt.Errorf("authz: insert role: %w", err)
	}
	return nil
}

func (r *AuthzRepo) UpdateRoleOptimistic(ctx context.Context, id string, expectedVersion int64, name, description string, now time.Time) (authz.Role, error) {
	row, err := r.q.UpdateRoleOptimistic(ctx, gen.UpdateRoleOptimisticParams{
		ID:          id,
		Version:     expectedVersion,
		Name:        name,
		Description: description,
		UpdatedAt:   now,
	})
	if err != nil {
		return authz.Role{}, err
	}
	return mapRole(row), nil
}

func (r *AuthzRepo) ArchiveRoleOptimistic(ctx context.Context, id string, expectedVersion int64, now time.Time) (authz.Role, error) {
	row, err := r.q.ArchiveRoleOptimistic(ctx, gen.ArchiveRoleOptimisticParams{
		ID:         id,
		Version:    expectedVersion,
		ArchivedAt: pgTimestamptz(now),
	})
	if err != nil {
		return authz.Role{}, err
	}
	return mapRole(row), nil
}

func (r *AuthzRepo) ReplaceRolePermissions(ctx context.Context, roleID string, codes []string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("authz: begin replace perms: %w", err)
	}
	defer tx.Rollback(ctx)
	q := r.q.WithTx(tx)
	if err := q.DeleteRolePermissions(ctx, roleID); err != nil {
		return fmt.Errorf("authz: delete role perms: %w", err)
	}
	for _, c := range codes {
		if err := q.InsertRolePermission(ctx, gen.InsertRolePermissionParams{
			RoleID:         roleID,
			PermissionCode: c,
		}); err != nil {
			return fmt.Errorf("authz: insert role perm: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("authz: commit replace perms: %w", err)
	}
	return nil
}

func (r *AuthzRepo) ListPermissionCodesForRole(ctx context.Context, roleID string) ([]string, error) {
	rows, err := r.q.ListPermissionCodesForRole(ctx, roleID)
	if err != nil {
		return nil, fmt.Errorf("authz: list role perms: %w", err)
	}
	return rows, nil
}

func (r *AuthzRepo) CountRoleAssignments(ctx context.Context, roleID string) (int64, error) {
	return r.q.CountRoleAssignments(ctx, roleID)
}

func (r *AuthzRepo) ListUserRoles(ctx context.Context, userID string) ([]application.UserRoleDetail, error) {
	rows, err := r.q.ListUserRoles(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("authz: list user roles: %w", err)
	}
	out := make([]application.UserRoleDetail, 0, len(rows))
	for _, row := range rows {
		out = append(out, application.UserRoleDetail{
			UserID:     row.UserID,
			RoleID:     row.RoleID,
			RoleCode:   row.Code,
			RoleName:   row.Name,
			IsSystem:   row.IsSystem,
			AssignedAt: row.AssignedAt,
			AssignedBy: row.AssignedBy,
		})
	}
	return out, nil
}

func (r *AuthzRepo) RemoveUserRole(ctx context.Context, userID, roleID string) (int64, error) {
	return r.q.RemoveUserRole(ctx, gen.RemoveUserRoleParams{
		UserID: userID,
		RoleID: roleID,
	})
}

func (r *AuthzRepo) CountUsersWithRoleCode(ctx context.Context, roleCode string) (int64, error) {
	return r.q.CountUsersWithRoleCode(ctx, roleCode)
}

func (r *AuthzRepo) CountUsersWithRoleCodeExcluding(ctx context.Context, roleCode, excludeUserID string) (int64, error) {
	return r.q.CountUsersWithRoleCodeExcluding(ctx, gen.CountUsersWithRoleCodeExcludingParams{
		Code:   roleCode,
		UserID: excludeUserID,
	})
}

func (r *AuthzRepo) InsertStaffInvitation(ctx context.Context, inv authz.StaffInvitation) error {
	err := r.q.InsertStaffInvitation(ctx, gen.InsertStaffInvitationParams{
		ID:              inv.ID,
		EmailNormalized: inv.EmailNormalized,
		EmailDisplay:    inv.EmailDisplay,
		InviterUserID:   inv.InviterUserID,
		RoleID:          inv.RoleID,
		TokenHash:       inv.TokenHash,
		Status:          string(inv.Status),
		ExpiresAt:       inv.ExpiresAt,
		AcceptedAt:      timePtrToPg(inv.AcceptedAt),
		AcceptedUserID:  inv.AcceptedUserID,
		RevokedAt:       timePtrToPg(inv.RevokedAt),
		RevokedBy:       inv.RevokedBy,
		IdempotencyKey:  inv.IdempotencyKey,
		CreatedAt:       inv.CreatedAt,
		UpdatedAt:       inv.UpdatedAt,
	})
	if err != nil {
		return fmt.Errorf("authz: insert staff invite: %w", err)
	}
	return nil
}

func (r *AuthzRepo) GetStaffInvitationByID(ctx context.Context, id string) (authz.StaffInvitation, error) {
	row, err := r.q.GetStaffInvitationByID(ctx, id)
	if err != nil {
		return authz.StaffInvitation{}, err
	}
	return mapStaffInvite(row), nil
}

func (r *AuthzRepo) GetStaffInvitationByTokenHash(ctx context.Context, hash string) (authz.StaffInvitation, error) {
	row, err := r.q.GetStaffInvitationByTokenHash(ctx, hash)
	if err != nil {
		return authz.StaffInvitation{}, err
	}
	return mapStaffInvite(row), nil
}

func (r *AuthzRepo) GetStaffInvitationByIdempotency(ctx context.Context, inviterID, key string) (authz.StaffInvitation, error) {
	row, err := r.q.GetStaffInvitationByIdempotency(ctx, gen.GetStaffInvitationByIdempotencyParams{
		InviterUserID:  inviterID,
		IdempotencyKey: &key,
	})
	if err != nil {
		return authz.StaffInvitation{}, err
	}
	return mapStaffInvite(row), nil
}

func (r *AuthzRepo) ListStaffInvitations(ctx context.Context, limit int32) ([]authz.StaffInvitation, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := r.q.ListStaffInvitations(ctx, limit)
	if err != nil {
		return nil, fmt.Errorf("authz: list staff invites: %w", err)
	}
	out := make([]authz.StaffInvitation, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapStaffInvite(row))
	}
	return out, nil
}

func (r *AuthzRepo) RevokeStaffInvitation(ctx context.Context, id string, now time.Time, revokedBy string) (authz.StaffInvitation, error) {
	row, err := r.q.RevokeStaffInvitation(ctx, gen.RevokeStaffInvitationParams{
		ID:        id,
		RevokedAt: pgTimestamptz(now),
		RevokedBy: &revokedBy,
	})
	if err != nil {
		return authz.StaffInvitation{}, err
	}
	return mapStaffInvite(row), nil
}

func (r *AuthzRepo) AcceptStaffInvitation(ctx context.Context, id string, now time.Time, userID string) (authz.StaffInvitation, error) {
	row, err := r.q.AcceptStaffInvitation(ctx, gen.AcceptStaffInvitationParams{
		ID:             id,
		AcceptedAt:     pgTimestamptz(now),
		AcceptedUserID: &userID,
	})
	if err != nil {
		return authz.StaffInvitation{}, err
	}
	return mapStaffInvite(row), nil
}

func (r *AuthzRepo) InsertMerchantInvitation(ctx context.Context, inv authz.MerchantInvitation) error {
	err := r.q.InsertMerchantInvitation(ctx, gen.InsertMerchantInvitationParams{
		ID:                inv.ID,
		EmailNormalized:   inv.EmailNormalized,
		EmailDisplay:      inv.EmailDisplay,
		InviterUserID:     inv.InviterUserID,
		MerchantID:        inv.MerchantID,
		RoleInMerchant:    string(inv.RoleInMerchant),
		OnboardingPurpose: inv.OnboardingPurpose,
		TokenHash:         inv.TokenHash,
		Status:            string(inv.Status),
		ExpiresAt:         inv.ExpiresAt,
		AcceptedAt:        timePtrToPg(inv.AcceptedAt),
		AcceptedUserID:    inv.AcceptedUserID,
		RevokedAt:         timePtrToPg(inv.RevokedAt),
		RevokedBy:         inv.RevokedBy,
		IdempotencyKey:    inv.IdempotencyKey,
		CreatedAt:         inv.CreatedAt,
		UpdatedAt:         inv.UpdatedAt,
	})
	if err != nil {
		return fmt.Errorf("authz: insert merchant invite: %w", err)
	}
	return nil
}

func (r *AuthzRepo) GetMerchantInvitationByID(ctx context.Context, id string) (authz.MerchantInvitation, error) {
	row, err := r.q.GetMerchantInvitationByID(ctx, id)
	if err != nil {
		return authz.MerchantInvitation{}, err
	}
	return mapMerchantInvite(row), nil
}

func (r *AuthzRepo) GetMerchantInvitationByTokenHash(ctx context.Context, hash string) (authz.MerchantInvitation, error) {
	row, err := r.q.GetMerchantInvitationByTokenHash(ctx, hash)
	if err != nil {
		return authz.MerchantInvitation{}, err
	}
	return mapMerchantInvite(row), nil
}

func (r *AuthzRepo) GetMerchantInvitationByIdempotency(ctx context.Context, inviterID, key string) (authz.MerchantInvitation, error) {
	row, err := r.q.GetMerchantInvitationByIdempotency(ctx, gen.GetMerchantInvitationByIdempotencyParams{
		InviterUserID:  inviterID,
		IdempotencyKey: &key,
	})
	if err != nil {
		return authz.MerchantInvitation{}, err
	}
	return mapMerchantInvite(row), nil
}

func (r *AuthzRepo) ListMerchantInvitations(ctx context.Context, limit int32) ([]authz.MerchantInvitation, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := r.q.ListMerchantInvitations(ctx, limit)
	if err != nil {
		return nil, fmt.Errorf("authz: list merchant invites: %w", err)
	}
	out := make([]authz.MerchantInvitation, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapMerchantInvite(row))
	}
	return out, nil
}

func (r *AuthzRepo) RevokeMerchantInvitation(ctx context.Context, id string, now time.Time, revokedBy string) (authz.MerchantInvitation, error) {
	row, err := r.q.RevokeMerchantInvitation(ctx, gen.RevokeMerchantInvitationParams{
		ID:        id,
		RevokedAt: pgTimestamptz(now),
		RevokedBy: &revokedBy,
	})
	if err != nil {
		return authz.MerchantInvitation{}, err
	}
	return mapMerchantInvite(row), nil
}

func (r *AuthzRepo) AcceptMerchantInvitation(ctx context.Context, id string, now time.Time, userID string) (authz.MerchantInvitation, error) {
	row, err := r.q.AcceptMerchantInvitation(ctx, gen.AcceptMerchantInvitationParams{
		ID:             id,
		AcceptedAt:     pgTimestamptz(now),
		AcceptedUserID: &userID,
	})
	if err != nil {
		return authz.MerchantInvitation{}, err
	}
	return mapMerchantInvite(row), nil
}

func (r *AuthzRepo) GetUserByID(ctx context.Context, id string) (auth.User, error) {
	row, err := r.q.GetUserByIDAuthz(ctx, id)
	if err != nil {
		return auth.User{}, err
	}
	u := auth.User{
		ID:              row.ID,
		EmailNormalized: row.EmailNormalized,
		EmailDisplay:    row.EmailDisplay,
		Name:            row.Name,
		Status:          auth.UserStatus(row.Status),
		EmailVerifiedAt: pgToTimePtr(row.EmailVerifiedAt),
		MFAEnabled:      row.MfaEnabled,
		LastLoginAt:     pgToTimePtr(row.LastLoginAt),
		CreatedAt:       row.CreatedAt,
		UpdatedAt:       row.UpdatedAt,
	}
	if row.PasswordHash != nil {
		u.PasswordHash = *row.PasswordHash
	}
	return u, nil
}

func (r *AuthzRepo) InsertAuditNote(ctx context.Context, id string, payloadHash []byte, now time.Time) error {
	// BE-530: append via chain function (legacy callers pass 32-byte hash).
	canonical := []byte(fmt.Sprintf(`{"action":"authz.note","legacyPayloadHash":"%x"}`, payloadHash))
	if len(payloadHash) != 32 {
		sum := sha256.Sum256(payloadHash)
		canonical = []byte(fmt.Sprintf(`{"action":"authz.note","legacyPayloadHash":"%x"}`, sum[:]))
	}
	_, err := callAppendOnPool(ctx, r.pool, application.AuditAppendParams{
		ID:               id,
		ChainScope:       "default",
		CanonicalVersion: "JCS-1",
		CanonicalPayload: canonical,
		Action:           "authz.note",
		ResourceType:     "authz",
		CreatedAt:        now,
		MetadataJSON:     []byte("{}"),
	})
	return err
}

func (r *AuthzRepo) InsertMerchant(ctx context.Context, m authz.Merchant) error {
	err := r.q.InsertMerchant(ctx, gen.InsertMerchantParams{
		ID:                    m.ID,
		OwnerUserID:           m.OwnerUserID,
		DisplayName:           m.DisplayName,
		Status:                string(m.Status),
		LegalName:             "",
		BusinessType:          "",
		OnboardingState:       "NOT_STARTED",
		OnboardingStep:        "NOT_STARTED",
		OnboardingCompletedAt: pgtype.Timestamptz{},
		OnboardingProgress:    []byte(`{}`),
		CreatedAt:             m.CreatedAt,
		UpdatedAt:             m.UpdatedAt,
	})
	if err != nil {
		return fmt.Errorf("authz: insert merchant: %w", err)
	}
	return nil
}

func (r *AuthzRepo) GetMerchantByID(ctx context.Context, id string) (authz.Merchant, error) {
	row, err := r.q.GetMerchantByID(ctx, id)
	if err != nil {
		return authz.Merchant{}, err
	}
	return mapMerchantRow(row.ID, row.OwnerUserID, row.DisplayName, row.Status, row.CreatedAt, row.UpdatedAt), nil
}

func (r *AuthzRepo) GetMerchantByOwner(ctx context.Context, ownerUserID string) (authz.Merchant, error) {
	row, err := r.q.GetMerchantByOwner(ctx, ownerUserID)
	if err != nil {
		return authz.Merchant{}, err
	}
	return mapMerchantRow(row.ID, row.OwnerUserID, row.DisplayName, row.Status, row.CreatedAt, row.UpdatedAt), nil
}

func (r *AuthzRepo) InsertMerchantMember(ctx context.Context, m authz.MerchantMember) error {
	err := r.q.InsertMerchantMember(ctx, gen.InsertMerchantMemberParams{
		MerchantID:     m.MerchantID,
		UserID:         m.UserID,
		RoleInMerchant: string(m.RoleInMerchant),
		Status:         string(m.Status),
		CreatedAt:      m.CreatedAt,
	})
	if err != nil {
		return fmt.Errorf("authz: insert member: %w", err)
	}
	return nil
}

func (r *AuthzRepo) GetActiveMerchantMember(ctx context.Context, merchantID, userID string) (authz.MerchantMember, error) {
	row, err := r.q.GetActiveMerchantMember(ctx, gen.GetActiveMerchantMemberParams{
		MerchantID: merchantID,
		UserID:     userID,
	})
	if err != nil {
		return authz.MerchantMember{}, err
	}
	return mapMember(row), nil
}

func (r *AuthzRepo) ListActiveMerchantMemberships(ctx context.Context, userID string) ([]authz.MerchantMember, error) {
	rows, err := r.q.ListActiveMerchantMemberships(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("authz: list memberships: %w", err)
	}
	out := make([]authz.MerchantMember, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapMember(row))
	}
	return out, nil
}

func (r *AuthzRepo) InsertStore(ctx context.Context, s authz.Store) error {
	err := r.q.InsertStore(ctx, gen.InsertStoreParams{
		ID:                    s.ID,
		MerchantID:            s.MerchantID,
		Slug:                  s.Slug,
		Name:                  s.Name,
		Status:                string(s.Status),
		IsCanonical:           s.IsCanonical,
		Bio:                   "",
		Address:               "",
		AccentColor:           "",
		OnboardingState:       "NOT_STARTED",
		OnboardingStep:        "NOT_STARTED",
		OnboardingCompletedAt: pgtype.Timestamptz{},
		OnboardingProgress:    []byte(`{}`),
		StorefrontRevision:    0,
		PublishedRevision:     0,
		CreatedAt:             s.CreatedAt,
		UpdatedAt:             s.UpdatedAt,
	})
	if err != nil {
		return fmt.Errorf("authz: insert store: %w", err)
	}
	return nil
}

func (r *AuthzRepo) GetStoreByID(ctx context.Context, id string) (authz.Store, error) {
	row, err := r.q.GetStoreByID(ctx, id)
	if err != nil {
		return authz.Store{}, err
	}
	return mapStoreRow(row.ID, row.MerchantID, row.Slug, row.Name, row.Status, row.IsCanonical, row.CreatedAt, row.UpdatedAt), nil
}

func (r *AuthzRepo) GetCanonicalStoreForMerchant(ctx context.Context, merchantID string) (authz.Store, error) {
	row, err := r.q.GetCanonicalStoreForMerchant(ctx, merchantID)
	if err != nil {
		return authz.Store{}, err
	}
	return mapStoreRow(row.ID, row.MerchantID, row.Slug, row.Name, row.Status, row.IsCanonical, row.CreatedAt, row.UpdatedAt), nil
}

func mapRole(row gen.Role) authz.Role {
	return authz.Role{
		ID:          row.ID,
		Code:        row.Code,
		Name:        row.Name,
		Description: row.Description,
		IsSystem:    row.IsSystem,
		Version:     row.Version,
		ArchivedAt:  pgToTimePtr(row.ArchivedAt),
		CreatedAt:   row.CreatedAt,
		UpdatedAt:   row.UpdatedAt,
	}
}

func mapMerchantRow(id, ownerUserID, displayName, status string, createdAt, updatedAt time.Time) authz.Merchant {
	return authz.Merchant{
		ID:          id,
		OwnerUserID: ownerUserID,
		DisplayName: displayName,
		Status:      authz.MerchantStatus(status),
		CreatedAt:   createdAt,
		UpdatedAt:   updatedAt,
	}
}

func mapMember(row gen.MerchantMember) authz.MerchantMember {
	return authz.MerchantMember{
		MerchantID:     row.MerchantID,
		UserID:         row.UserID,
		RoleInMerchant: authz.MerchantMemberRole(row.RoleInMerchant),
		Status:         authz.MerchantMemberStatus(row.Status),
		CreatedAt:      row.CreatedAt,
	}
}

func mapStoreRow(id, merchantID, slug, name, status string, isCanonical bool, createdAt, updatedAt time.Time) authz.Store {
	return authz.Store{
		ID:          id,
		MerchantID:  merchantID,
		Slug:        slug,
		Name:        name,
		Status:      authz.StoreStatus(status),
		IsCanonical: isCanonical,
		CreatedAt:   createdAt,
		UpdatedAt:   updatedAt,
	}
}

func mapStaffInvite(row gen.StaffInvitation) authz.StaffInvitation {
	return authz.StaffInvitation{
		ID:              row.ID,
		EmailNormalized: row.EmailNormalized,
		EmailDisplay:    row.EmailDisplay,
		InviterUserID:   row.InviterUserID,
		RoleID:          row.RoleID,
		TokenHash:       row.TokenHash,
		Status:          authz.InvitationStatus(row.Status),
		ExpiresAt:       row.ExpiresAt,
		AcceptedAt:      pgToTimePtr(row.AcceptedAt),
		AcceptedUserID:  row.AcceptedUserID,
		RevokedAt:       pgToTimePtr(row.RevokedAt),
		RevokedBy:       row.RevokedBy,
		IdempotencyKey:  row.IdempotencyKey,
		CreatedAt:       row.CreatedAt,
		UpdatedAt:       row.UpdatedAt,
	}
}

func mapMerchantInvite(row gen.MerchantInvitation) authz.MerchantInvitation {
	return authz.MerchantInvitation{
		ID:                row.ID,
		EmailNormalized:   row.EmailNormalized,
		EmailDisplay:      row.EmailDisplay,
		InviterUserID:     row.InviterUserID,
		MerchantID:        row.MerchantID,
		RoleInMerchant:    authz.MerchantMemberRole(row.RoleInMerchant),
		OnboardingPurpose: row.OnboardingPurpose,
		TokenHash:         row.TokenHash,
		Status:            authz.InvitationStatus(row.Status),
		ExpiresAt:         row.ExpiresAt,
		AcceptedAt:        pgToTimePtr(row.AcceptedAt),
		AcceptedUserID:    row.AcceptedUserID,
		RevokedAt:         pgToTimePtr(row.RevokedAt),
		RevokedBy:         row.RevokedBy,
		IdempotencyKey:    row.IdempotencyKey,
		CreatedAt:         row.CreatedAt,
		UpdatedAt:         row.UpdatedAt,
	}
}
