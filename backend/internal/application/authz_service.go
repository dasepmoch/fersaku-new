package application

import (
	"context"
	"strings"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/authz"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// AuthzService enforces RBAC and tenant membership (BE-130/BE-135).
type AuthzService struct {
	Store    AuthzStore
	IDs      ports.IDGenerator
	Clock    ports.Clock
	Log      ports.Logger
	Mail     ports.Mailer
	Sessions SessionRevoker
}

func (s *AuthzService) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now().UTC()
	}
	return time.Now().UTC()
}

// LoadPermissions returns effective permission codes for a user (deny-by-default empty).
func (s *AuthzService) LoadPermissions(ctx context.Context, userID string) ([]string, error) {
	if userID == "" {
		return nil, nil
	}
	codes, err := s.Store.ListPermissionCodesForUser(ctx, userID)
	if err != nil {
		return nil, apperr.Internal(apperr.CodeInternalError, "Failed to load permissions")
	}
	return codes, nil
}

// HasPermission reports whether user has permission code.
func (s *AuthzService) HasPermission(ctx context.Context, userID, code string) (bool, error) {
	if userID == "" || code == "" {
		return false, nil
	}
	ok, err := s.Store.UserHasPermission(ctx, userID, code)
	if err != nil {
		return false, apperr.Internal(apperr.CodeInternalError, "Permission check failed")
	}
	return ok, nil
}

// RequirePermission returns FORBIDDEN when the user lacks code.
func (s *AuthzService) RequirePermission(ctx context.Context, userID, code string) error {
	ok, err := s.HasPermission(ctx, userID, code)
	if err != nil {
		return err
	}
	if !ok {
		return authz.DenyMissingPermission(code)
	}
	return nil
}

// RequirePermissionFromSet checks an in-memory cache (session principal).
func RequirePermissionFromSet(set map[string]struct{}, code string) error {
	if !authz.HasPermission(set, code) {
		return authz.DenyMissingPermission(code)
	}
	return nil
}

// AssignSystemRole attaches a seeded system role by code.
func (s *AuthzService) AssignSystemRole(ctx context.Context, userID, roleCode string, assignedBy *string) error {
	if userID == "" || roleCode == "" {
		return apperr.Validation(apperr.CodeValidationFailed, "Invalid role assignment")
	}
	if !authz.IsSystemRole(roleCode) {
		return apperr.Validation(apperr.CodeValidationFailed, "Unknown system role")
	}
	role, err := s.Store.GetRoleByCode(ctx, roleCode)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return apperr.NotFound(apperr.CodeResourceNotFound, "Role not found")
		}
		return apperr.Internal(apperr.CodeInternalError, "Role lookup failed")
	}
	return s.Store.AssignUserRole(ctx, userID, role.ID, s.now(), assignedBy)
}

// BootstrapAdminByEmail assigns SUPER_ADMIN when the user exists (idempotent).
// Used by seed script with BOOTSTRAP_ADMIN_EMAIL. Does not create users.
func (s *AuthzService) BootstrapAdminByEmail(ctx context.Context, email string) (string, error) {
	emailNorm := auth.NormalizeEmail(email)
	if emailNorm == "" {
		return "", apperr.Validation(apperr.CodeValidationFailed, "Invalid email")
	}
	userID, err := s.Store.GetUserIDByEmailNormalized(ctx, emailNorm)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return "", apperr.NotFound(apperr.CodeResourceNotFound, "Bootstrap admin user not found")
		}
		return "", apperr.Internal(apperr.CodeInternalError, "Bootstrap admin lookup failed")
	}
	if err := s.AssignSystemRole(ctx, userID, authz.RoleSuperAdmin, nil); err != nil {
		return "", err
	}
	return userID, nil
}

// RequireMerchantMember ensures active membership; returns scope or NOT_FOUND (cross-tenant).
func (s *AuthzService) RequireMerchantMember(ctx context.Context, userID, merchantID string) (authz.TenantScope, error) {
	if userID == "" || merchantID == "" {
		return authz.TenantScope{}, authz.DenyCrossTenant()
	}
	m, err := s.Store.GetMerchantByID(ctx, merchantID)
	if err != nil {
		return authz.TenantScope{}, authz.DenyCrossTenant()
	}
	mem, err := s.Store.GetActiveMerchantMember(ctx, m.ID, userID)
	if err != nil {
		return authz.TenantScope{}, authz.DenyCrossTenant()
	}
	return authz.TenantScope{
		MerchantID: m.ID,
		MemberRole: mem.RoleInMerchant,
	}, nil
}

// ResolveStoreMerchant loads store and verifies the user is an active merchant member.
// Cross-tenant store IDs return NOT_FOUND.
func (s *AuthzService) ResolveStoreMerchant(ctx context.Context, userID, storeID string) (authz.Store, authz.TenantScope, error) {
	if userID == "" || storeID == "" {
		return authz.Store{}, authz.TenantScope{}, authz.DenyCrossTenant()
	}
	st, err := s.Store.GetStoreByID(ctx, storeID)
	if err != nil {
		return authz.Store{}, authz.TenantScope{}, authz.DenyCrossTenant()
	}
	scope, err := s.RequireMerchantMember(ctx, userID, st.MerchantID)
	if err != nil {
		return authz.Store{}, authz.TenantScope{}, err
	}
	scope.StoreID = st.ID
	return st, scope, nil
}

// RequireBuyerOwnsResource enforces buyer ownership with NOT_FOUND on mismatch.
func RequireBuyerOwnsResource(principalUserID, resourceOwnerUserID string) error {
	return authz.BuyerOwnsResource(principalUserID, resourceOwnerUserID)
}

// GetSellerMerchant returns the primary active membership merchant for a seller.
// Primary = earliest active membership (stable ORDER BY created_at ASC from store).
// No membership → FORBIDDEN (known action, no tenant enumeration).
func (s *AuthzService) GetSellerMerchant(ctx context.Context, userID string) (authz.Merchant, authz.MerchantMember, error) {
	if userID == "" {
		return authz.Merchant{}, authz.MerchantMember{}, authz.DenyCrossTenant()
	}
	members, err := s.Store.ListActiveMerchantMemberships(ctx, userID)
	if err != nil {
		return authz.Merchant{}, authz.MerchantMember{}, apperr.Internal(apperr.CodeInternalError, "Membership lookup failed")
	}
	if len(members) == 0 {
		return authz.Merchant{}, authz.MerchantMember{}, authz.ErrForbidden("Seller merchant membership required")
	}
	// Deterministic: earliest membership (repo orders created_at ASC).
	mem := members[0]
	for _, candidate := range members[1:] {
		if candidate.CreatedAt.Before(mem.CreatedAt) {
			mem = candidate
		} else if candidate.CreatedAt.Equal(mem.CreatedAt) && candidate.MerchantID < mem.MerchantID {
			mem = candidate
		}
	}
	m, err := s.Store.GetMerchantByID(ctx, mem.MerchantID)
	if err != nil {
		return authz.Merchant{}, authz.MerchantMember{}, authz.DenyCrossTenant()
	}
	return m, mem, nil
}

// StoreAccessGuard is the central store-scoped authorization helper (INT-150).
// Foreign / non-member store IDs → RESOURCE_NOT_FOUND.
// write=true also requires store.write capability for the membership role.
func (s *AuthzService) StoreAccessGuard(ctx context.Context, userID, storeID string, write bool) (authz.StoreAccess, error) {
	if userID == "" || storeID == "" {
		return authz.StoreAccess{}, authz.DenyCrossTenant()
	}
	st, scope, err := s.ResolveStoreMerchant(ctx, userID, storeID)
	if err != nil {
		return authz.StoreAccess{}, err
	}
	caps := authz.CapabilitiesForMemberRole(scope.MemberRole)
	access := authz.StoreAccess{
		Store:        st,
		Scope:        scope,
		Capabilities: caps,
	}
	if write {
		if err := authz.RequireStoreCapability(access, authz.StoreCapWrite); err != nil {
			return authz.StoreAccess{}, err
		}
	} else {
		if err := authz.RequireStoreCapability(access, authz.StoreCapRead); err != nil {
			return authz.StoreAccess{}, err
		}
	}
	return access, nil
}

// SellerMembershipDTO is one merchant membership for bootstrap.
type SellerMembershipDTO struct {
	MerchantID     string
	DisplayName    string
	MerchantStatus string
	RoleInMerchant string
	Capabilities   []string
	StoreIDs       []string
}

// SellerStoreDTO is a store the seller may access.
type SellerStoreDTO struct {
	StoreID    string
	MerchantID string
	Slug       string
	Name       string
	Status     string
	Canonical  bool
}

// SellerBootstrap is GET /v1/seller/me/merchant extended payload (INT-150 / SEL-100).
type SellerBootstrap struct {
	MerchantID           string
	DisplayName          string
	Status               string
	RoleInMerchant       string
	OwnerUserID          string
	Memberships          []SellerMembershipDTO
	Stores               []SellerStoreDTO
	CanonicalStoreID     string
	CurrentStoreID       string
	Capabilities         []string
	OnboardingState      string
	OnboardingCompleted  bool
}

// GetSellerBootstrap returns merchant, memberships, stores, and server-selected current store.
// Selection: valid preferred store if member-owned → else canonical → else first stable store ID.
func (s *AuthzService) GetSellerBootstrap(ctx context.Context, userID string) (SellerBootstrap, error) {
	m, mem, err := s.GetSellerMerchant(ctx, userID)
	if err != nil {
		return SellerBootstrap{}, err
	}
	members, err := s.Store.ListActiveMerchantMemberships(ctx, userID)
	if err != nil {
		return SellerBootstrap{}, apperr.Internal(apperr.CodeInternalError, "Membership lookup failed")
	}

	// Collect stores across all memberships (stable order per merchant).
	allowed := map[string]authz.Store{}
	var storeOrder []string
	memberships := make([]SellerMembershipDTO, 0, len(members))
	for _, mm := range members {
		merch, mErr := s.Store.GetMerchantByID(ctx, mm.MerchantID)
		if mErr != nil {
			continue
		}
		stores, sErr := s.Store.ListStoresForMerchant(ctx, mm.MerchantID)
		if sErr != nil {
			return SellerBootstrap{}, apperr.Internal(apperr.CodeInternalError, "Store list failed")
		}
		caps := authz.CapabilitiesForMemberRole(mm.RoleInMerchant)
		capStrs := make([]string, 0, len(caps))
		for _, c := range caps {
			capStrs = append(capStrs, string(c))
		}
		ids := make([]string, 0, len(stores))
		for _, st := range stores {
			ids = append(ids, st.ID)
			if _, ok := allowed[st.ID]; !ok {
				allowed[st.ID] = st
				storeOrder = append(storeOrder, st.ID)
			}
		}
		memberships = append(memberships, SellerMembershipDTO{
			MerchantID:     merch.ID,
			DisplayName:    merch.DisplayName,
			MerchantStatus: string(merch.Status),
			RoleInMerchant: string(mm.RoleInMerchant),
			Capabilities:   capStrs,
			StoreIDs:       ids,
		})
	}

	// Canonical for primary merchant.
	canonicalID := ""
	if can, cErr := s.Store.GetCanonicalStoreForMerchant(ctx, m.ID); cErr == nil {
		canonicalID = can.ID
	} else {
		// Fallback: first store of primary merchant by stable order.
		for _, sid := range storeOrder {
			st := allowed[sid]
			if st.MerchantID == m.ID {
				canonicalID = st.ID
				break
			}
		}
	}

	// Preferred store (server-stored); invalid → canonical.
	preferred, _ := s.Store.GetSellerPreferredStoreID(ctx, userID)
	currentID := selectCurrentStoreID(preferred, canonicalID, allowed, storeOrder)

	primaryCaps := authz.CapabilitiesForMemberRole(mem.RoleInMerchant)
	primaryCapStrs := make([]string, 0, len(primaryCaps))
	for _, c := range primaryCaps {
		primaryCapStrs = append(primaryCapStrs, string(c))
	}

	storeDTOs := make([]SellerStoreDTO, 0, len(storeOrder))
	for _, sid := range storeOrder {
		st := allowed[sid]
		storeDTOs = append(storeDTOs, SellerStoreDTO{
			StoreID:    st.ID,
			MerchantID: st.MerchantID,
			Slug:       st.Slug,
			Name:       st.Name,
			Status:     string(st.Status),
			Canonical:  st.IsCanonical,
		})
	}

	onboardingState := strings.TrimSpace(m.OnboardingState)
	if onboardingState == "" {
		onboardingState = "NOT_STARTED"
	}
	// Complete only when server state is COMPLETE and a membership store exists.
	onboardingCompleted := onboardingState == "COMPLETE" && currentID != ""

	return SellerBootstrap{
		MerchantID:          m.ID,
		DisplayName:         m.DisplayName,
		Status:              string(m.Status),
		RoleInMerchant:      string(mem.RoleInMerchant),
		OwnerUserID:         m.OwnerUserID,
		Memberships:         memberships,
		Stores:              storeDTOs,
		CanonicalStoreID:    canonicalID,
		CurrentStoreID:      currentID,
		Capabilities:        primaryCapStrs,
		OnboardingState:     onboardingState,
		OnboardingCompleted: onboardingCompleted,
	}, nil
}

// selectCurrentStoreID: preferred if allowed → canonical if allowed → first stable allowed.
func selectCurrentStoreID(preferred, canonical string, allowed map[string]authz.Store, order []string) string {
	if preferred != "" {
		if _, ok := allowed[preferred]; ok {
			return preferred
		}
	}
	if canonical != "" {
		if _, ok := allowed[canonical]; ok {
			return canonical
		}
	}
	if len(order) > 0 {
		return order[0]
	}
	return ""
}

// SetSellerPreferredStore validates membership and persists preferred store (optional switch API).
func (s *AuthzService) SetSellerPreferredStore(ctx context.Context, userID, storeID string) error {
	if _, err := s.StoreAccessGuard(ctx, userID, storeID, false); err != nil {
		return err
	}
	return s.Store.UpsertSellerPreferredStore(ctx, userID, storeID, s.now())
}

// CreateMerchantWithCanonicalStore creates merchant + OWNER membership + canonical store (test/onboarding helper).
// Prefer OnboardingService.CreateStore for product onboarding paths (BE-200).
func (s *AuthzService) CreateMerchantWithCanonicalStore(ctx context.Context, ownerUserID, displayName, slug, storeName string) (authz.Merchant, authz.Store, error) {
	if ownerUserID == "" || strings.TrimSpace(slug) == "" {
		return authz.Merchant{}, authz.Store{}, apperr.Validation(apperr.CodeValidationFailed, "Invalid merchant payload")
	}
	// Normalize slug for BE-200 stores_slug_format_check.
	normSlug := strings.ToLower(strings.TrimSpace(slug))
	normSlug = strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			return r
		case r == '-' || r == '_' || r == ' ':
			return '-'
		default:
			return -1
		}
	}, normSlug)
	for strings.Contains(normSlug, "--") {
		normSlug = strings.ReplaceAll(normSlug, "--", "-")
	}
	normSlug = strings.Trim(normSlug, "-")
	if len(normSlug) < 3 {
		normSlug = "store-" + strings.ToLower(s.IDs.New())
		if len(normSlug) > 40 {
			normSlug = normSlug[:40]
		}
		normSlug = strings.Trim(normSlug, "-")
	}
	now := s.now()
	merchantID := s.IDs.New()
	storeID := s.IDs.New()
	m := authz.Merchant{
		ID:          merchantID,
		OwnerUserID: ownerUserID,
		DisplayName: strings.TrimSpace(displayName),
		Status:      authz.MerchantActive,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	mem := authz.MerchantMember{
		MerchantID:     merchantID,
		UserID:         ownerUserID,
		RoleInMerchant: authz.MemberOwner,
		Status:         authz.MemberActive,
		CreatedAt:      now,
	}
	st := authz.Store{
		ID:          storeID,
		MerchantID:  merchantID,
		Slug:        normSlug,
		Name:        strings.TrimSpace(storeName),
		Status:      authz.StoreActive,
		IsCanonical: true,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := s.Store.InsertMerchant(ctx, m); err != nil {
		return authz.Merchant{}, authz.Store{}, apperr.Internal(apperr.CodeInternalError, "Create merchant failed")
	}
	if err := s.Store.InsertMerchantMember(ctx, mem); err != nil {
		return authz.Merchant{}, authz.Store{}, apperr.Internal(apperr.CodeInternalError, "Create membership failed")
	}
	if err := s.Store.InsertStore(ctx, st); err != nil {
		return authz.Merchant{}, authz.Store{}, apperr.Internal(apperr.CodeInternalError, "Create store failed")
	}
	// Ensure seller system role for surface permissions.
	_ = s.AssignSystemRole(ctx, ownerUserID, authz.RoleSellerOwner, nil)
	return m, st, nil
}

// RequireScopedMerchantList rejects unscoped admin lists without merchants.read.
func (s *AuthzService) RequireScopedMerchantList(ctx context.Context, userID string) error {
	return s.RequirePermission(ctx, userID, authz.PermMerchantsRead)
}
