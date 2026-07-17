package application_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/authz"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

type memAuthz struct {
	perms       map[string][]string
	roles       map[string]authz.Role
	rolePerms   map[string][]string
	userRoles   map[string]map[string]struct{} // userID -> set of roleIDs
	users       map[string]string              // email -> userID
	userByID    map[string]auth.User
	merchants   map[string]authz.Merchant
	members     map[string]authz.MerchantMember
	stores      map[string]authz.Store
	prefs       map[string]string // userID -> preferred store
	staffInv    map[string]authz.StaffInvitation
	merchantInv map[string]authz.MerchantInvitation
	staffByHash map[string]string
	merchByHash map[string]string
	staffIdem   map[string]string
	merchIdem   map[string]string
}

func newMemAuthz() *memAuthz {
	return &memAuthz{
		perms:       map[string][]string{},
		roles:       map[string]authz.Role{},
		rolePerms:   map[string][]string{},
		userRoles:   map[string]map[string]struct{}{},
		users:       map[string]string{},
		userByID:    map[string]auth.User{},
		merchants:   map[string]authz.Merchant{},
		members:     map[string]authz.MerchantMember{},
		stores:      map[string]authz.Store{},
		prefs:       map[string]string{},
		staffInv:    map[string]authz.StaffInvitation{},
		merchantInv: map[string]authz.MerchantInvitation{},
		staffByHash: map[string]string{},
		merchByHash: map[string]string{},
		staffIdem:   map[string]string{},
		merchIdem:   map[string]string{},
	}
}

func (m *memAuthz) key(a, b string) string { return a + "|" + b }

func (m *memAuthz) ListPermissionCodesForUser(_ context.Context, userID string) ([]string, error) {
	return append([]string(nil), m.perms[userID]...), nil
}
func (m *memAuthz) ListRoleCodesForUser(_ context.Context, userID string) ([]string, error) {
	set := m.userRoles[userID]
	var out []string
	for rid := range set {
		if r, ok := m.roles[rid]; ok {
			out = append(out, r.Code)
		}
	}
	return out, nil
}
func (m *memAuthz) UserHasPermission(_ context.Context, userID, permissionCode string) (bool, error) {
	for _, c := range m.perms[userID] {
		if c == permissionCode {
			return true, nil
		}
	}
	return false, nil
}
func (m *memAuthz) AssignUserRole(_ context.Context, userID, roleID string, _ time.Time, _ *string) error {
	if m.userRoles[userID] == nil {
		m.userRoles[userID] = map[string]struct{}{}
	}
	m.userRoles[userID][roleID] = struct{}{}
	// refresh perms from roles
	var all []string
	for rid := range m.userRoles[userID] {
		all = append(all, m.rolePerms[rid]...)
	}
	m.perms[userID] = authz.NormalizePermissionList(all)
	return nil
}
func (m *memAuthz) GetRoleByCode(_ context.Context, code string) (authz.Role, error) {
	for _, r := range m.roles {
		if r.Code == code {
			return r, nil
		}
	}
	return authz.Role{}, errors.New("not found")
}
func (m *memAuthz) GetRoleByID(_ context.Context, id string) (authz.Role, error) {
	r, ok := m.roles[id]
	if !ok {
		return authz.Role{}, errors.New("not found")
	}
	return r, nil
}
func (m *memAuthz) GetUserIDByEmailNormalized(_ context.Context, emailNorm string) (string, error) {
	id, ok := m.users[emailNorm]
	if !ok {
		return "", errors.New("not found")
	}
	return id, nil
}
func (m *memAuthz) ListAllPermissions(_ context.Context) ([]authz.Permission, error) {
	var out []authz.Permission
	for _, c := range authz.AllPermissionCodes() {
		out = append(out, authz.Permission{Code: c})
	}
	return out, nil
}
func (m *memAuthz) ListRoles(_ context.Context, includeArchived bool) ([]authz.Role, error) {
	var out []authz.Role
	for _, r := range m.roles {
		if !includeArchived && r.ArchivedAt != nil {
			continue
		}
		out = append(out, r)
	}
	return out, nil
}
func (m *memAuthz) InsertRole(_ context.Context, r authz.Role) error {
	for _, existing := range m.roles {
		if existing.Code == r.Code {
			return errors.New("conflict")
		}
	}
	m.roles[r.ID] = r
	return nil
}
func (m *memAuthz) UpdateRoleOptimistic(_ context.Context, id string, expectedVersion int64, name, description string, now time.Time) (authz.Role, error) {
	r, ok := m.roles[id]
	if !ok || r.Version != expectedVersion || r.IsSystem || r.ArchivedAt != nil {
		return authz.Role{}, errors.New("not found")
	}
	r.Name = name
	r.Description = description
	r.Version++
	r.UpdatedAt = now
	m.roles[id] = r
	return r, nil
}
func (m *memAuthz) ArchiveRoleOptimistic(_ context.Context, id string, expectedVersion int64, now time.Time) (authz.Role, error) {
	r, ok := m.roles[id]
	if !ok || r.Version != expectedVersion || r.IsSystem || r.ArchivedAt != nil {
		return authz.Role{}, errors.New("not found")
	}
	r.ArchivedAt = &now
	r.Version++
	r.UpdatedAt = now
	m.roles[id] = r
	return r, nil
}
func (m *memAuthz) ReplaceRolePermissions(_ context.Context, roleID string, codes []string) error {
	m.rolePerms[roleID] = append([]string(nil), codes...)
	return nil
}
func (m *memAuthz) ListPermissionCodesForRole(_ context.Context, roleID string) ([]string, error) {
	return append([]string(nil), m.rolePerms[roleID]...), nil
}
func (m *memAuthz) CountRoleAssignments(_ context.Context, roleID string) (int64, error) {
	var n int64
	for _, set := range m.userRoles {
		if _, ok := set[roleID]; ok {
			n++
		}
	}
	return n, nil
}
func (m *memAuthz) ListUserRoles(_ context.Context, userID string) ([]application.UserRoleDetail, error) {
	var out []application.UserRoleDetail
	for rid := range m.userRoles[userID] {
		r := m.roles[rid]
		out = append(out, application.UserRoleDetail{
			UserID: userID, RoleID: rid, RoleCode: r.Code, RoleName: r.Name, IsSystem: r.IsSystem,
		})
	}
	return out, nil
}
func (m *memAuthz) RemoveUserRole(_ context.Context, userID, roleID string) (int64, error) {
	set := m.userRoles[userID]
	if set == nil {
		return 0, nil
	}
	if _, ok := set[roleID]; !ok {
		return 0, nil
	}
	delete(set, roleID)
	var all []string
	for rid := range set {
		all = append(all, m.rolePerms[rid]...)
	}
	m.perms[userID] = authz.NormalizePermissionList(all)
	return 1, nil
}
func (m *memAuthz) CountUsersWithRoleCode(_ context.Context, roleCode string) (int64, error) {
	var n int64
	for _, set := range m.userRoles {
		for rid := range set {
			if m.roles[rid].Code == roleCode {
				n++
				break
			}
		}
	}
	return n, nil
}
func (m *memAuthz) CountUsersWithRoleCodeExcluding(_ context.Context, roleCode, excludeUserID string) (int64, error) {
	var n int64
	for uid, set := range m.userRoles {
		if uid == excludeUserID {
			continue
		}
		for rid := range set {
			if m.roles[rid].Code == roleCode {
				n++
				break
			}
		}
	}
	return n, nil
}
func (m *memAuthz) InsertStaffInvitation(_ context.Context, inv authz.StaffInvitation) error {
	m.staffInv[inv.ID] = inv
	m.staffByHash[inv.TokenHash] = inv.ID
	if inv.IdempotencyKey != nil {
		m.staffIdem[m.key(inv.InviterUserID, *inv.IdempotencyKey)] = inv.ID
	}
	return nil
}
func (m *memAuthz) GetStaffInvitationByID(_ context.Context, id string) (authz.StaffInvitation, error) {
	inv, ok := m.staffInv[id]
	if !ok {
		return authz.StaffInvitation{}, errors.New("not found")
	}
	return inv, nil
}
func (m *memAuthz) GetStaffInvitationByTokenHash(_ context.Context, hash string) (authz.StaffInvitation, error) {
	id, ok := m.staffByHash[hash]
	if !ok {
		return authz.StaffInvitation{}, errors.New("not found")
	}
	return m.staffInv[id], nil
}
func (m *memAuthz) GetStaffInvitationByIdempotency(_ context.Context, inviterID, key string) (authz.StaffInvitation, error) {
	id, ok := m.staffIdem[m.key(inviterID, key)]
	if !ok {
		return authz.StaffInvitation{}, errors.New("not found")
	}
	return m.staffInv[id], nil
}
func (m *memAuthz) ListStaffInvitations(_ context.Context, _ int32) ([]authz.StaffInvitation, error) {
	var out []authz.StaffInvitation
	for _, inv := range m.staffInv {
		out = append(out, inv)
	}
	return out, nil
}
func (m *memAuthz) RevokeStaffInvitation(_ context.Context, id string, now time.Time, revokedBy string) (authz.StaffInvitation, error) {
	inv, ok := m.staffInv[id]
	if !ok || inv.Status != authz.InvitePending {
		return authz.StaffInvitation{}, errors.New("not found")
	}
	inv.Status = authz.InviteRevoked
	inv.RevokedAt = &now
	inv.RevokedBy = &revokedBy
	m.staffInv[id] = inv
	return inv, nil
}
func (m *memAuthz) AcceptStaffInvitation(_ context.Context, id string, now time.Time, userID string) (authz.StaffInvitation, error) {
	inv, ok := m.staffInv[id]
	if !ok || inv.Status != authz.InvitePending || !inv.ExpiresAt.After(now) {
		return authz.StaffInvitation{}, errors.New("not found")
	}
	inv.Status = authz.InviteAccepted
	inv.AcceptedAt = &now
	inv.AcceptedUserID = &userID
	m.staffInv[id] = inv
	return inv, nil
}
func (m *memAuthz) InsertMerchantInvitation(_ context.Context, inv authz.MerchantInvitation) error {
	m.merchantInv[inv.ID] = inv
	m.merchByHash[inv.TokenHash] = inv.ID
	if inv.IdempotencyKey != nil {
		m.merchIdem[m.key(inv.InviterUserID, *inv.IdempotencyKey)] = inv.ID
	}
	return nil
}
func (m *memAuthz) GetMerchantInvitationByID(_ context.Context, id string) (authz.MerchantInvitation, error) {
	inv, ok := m.merchantInv[id]
	if !ok {
		return authz.MerchantInvitation{}, errors.New("not found")
	}
	return inv, nil
}
func (m *memAuthz) GetMerchantInvitationByTokenHash(_ context.Context, hash string) (authz.MerchantInvitation, error) {
	id, ok := m.merchByHash[hash]
	if !ok {
		return authz.MerchantInvitation{}, errors.New("not found")
	}
	return m.merchantInv[id], nil
}
func (m *memAuthz) GetMerchantInvitationByIdempotency(_ context.Context, inviterID, key string) (authz.MerchantInvitation, error) {
	id, ok := m.merchIdem[m.key(inviterID, key)]
	if !ok {
		return authz.MerchantInvitation{}, errors.New("not found")
	}
	return m.merchantInv[id], nil
}
func (m *memAuthz) ListMerchantInvitations(_ context.Context, _ int32) ([]authz.MerchantInvitation, error) {
	var out []authz.MerchantInvitation
	for _, inv := range m.merchantInv {
		out = append(out, inv)
	}
	return out, nil
}
func (m *memAuthz) RevokeMerchantInvitation(_ context.Context, id string, now time.Time, revokedBy string) (authz.MerchantInvitation, error) {
	inv, ok := m.merchantInv[id]
	if !ok || inv.Status != authz.InvitePending {
		return authz.MerchantInvitation{}, errors.New("not found")
	}
	inv.Status = authz.InviteRevoked
	inv.RevokedAt = &now
	inv.RevokedBy = &revokedBy
	m.merchantInv[id] = inv
	return inv, nil
}
func (m *memAuthz) AcceptMerchantInvitation(_ context.Context, id string, now time.Time, userID string) (authz.MerchantInvitation, error) {
	inv, ok := m.merchantInv[id]
	if !ok || inv.Status != authz.InvitePending || !inv.ExpiresAt.After(now) {
		return authz.MerchantInvitation{}, errors.New("not found")
	}
	inv.Status = authz.InviteAccepted
	inv.AcceptedAt = &now
	inv.AcceptedUserID = &userID
	m.merchantInv[id] = inv
	return inv, nil
}
func (m *memAuthz) GetUserByID(_ context.Context, id string) (auth.User, error) {
	u, ok := m.userByID[id]
	if !ok {
		return auth.User{}, errors.New("not found")
	}
	return u, nil
}
func (m *memAuthz) InsertAuditNote(_ context.Context, _ string, _ []byte, _ time.Time) error {
	return nil
}
func (m *memAuthz) InsertMerchant(_ context.Context, mer authz.Merchant) error {
	m.merchants[mer.ID] = mer
	return nil
}
func (m *memAuthz) GetMerchantByID(_ context.Context, id string) (authz.Merchant, error) {
	mer, ok := m.merchants[id]
	if !ok {
		return authz.Merchant{}, errors.New("not found")
	}
	return mer, nil
}
func (m *memAuthz) GetMerchantByOwner(_ context.Context, ownerUserID string) (authz.Merchant, error) {
	for _, mer := range m.merchants {
		if mer.OwnerUserID == ownerUserID {
			return mer, nil
		}
	}
	return authz.Merchant{}, errors.New("not found")
}
func (m *memAuthz) InsertMerchantMember(_ context.Context, mem authz.MerchantMember) error {
	m.members[m.key(mem.MerchantID, mem.UserID)] = mem
	return nil
}
func (m *memAuthz) GetActiveMerchantMember(_ context.Context, merchantID, userID string) (authz.MerchantMember, error) {
	mem, ok := m.members[m.key(merchantID, userID)]
	if !ok || mem.Status != authz.MemberActive {
		return authz.MerchantMember{}, errors.New("not found")
	}
	return mem, nil
}
func (m *memAuthz) ListActiveMerchantMemberships(_ context.Context, userID string) ([]authz.MerchantMember, error) {
	var out []authz.MerchantMember
	for _, mem := range m.members {
		if mem.UserID == userID && mem.Status == authz.MemberActive {
			out = append(out, mem)
		}
	}
	return out, nil
}
func (m *memAuthz) InsertStore(_ context.Context, s authz.Store) error {
	m.stores[s.ID] = s
	return nil
}
func (m *memAuthz) GetStoreByID(_ context.Context, id string) (authz.Store, error) {
	s, ok := m.stores[id]
	if !ok {
		return authz.Store{}, errors.New("not found")
	}
	return s, nil
}
func (m *memAuthz) GetCanonicalStoreForMerchant(_ context.Context, merchantID string) (authz.Store, error) {
	for _, s := range m.stores {
		if s.MerchantID == merchantID && s.IsCanonical {
			return s, nil
		}
	}
	return authz.Store{}, errors.New("not found")
}
func (m *memAuthz) ListStoresForMerchant(_ context.Context, merchantID string) ([]authz.Store, error) {
	var out []authz.Store
	for _, s := range m.stores {
		if s.MerchantID == merchantID && s.Status != authz.StoreArchived {
			out = append(out, s)
		}
	}
	// stable: canonical first, then created_at, then id
	for i := 0; i < len(out); i++ {
		for j := i + 1; j < len(out); j++ {
			a, b := out[i], out[j]
			swap := false
			if a.IsCanonical != b.IsCanonical {
				swap = !a.IsCanonical && b.IsCanonical
			} else if !a.CreatedAt.Equal(b.CreatedAt) {
				swap = a.CreatedAt.After(b.CreatedAt)
			} else {
				swap = a.ID > b.ID
			}
			if swap {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
	return out, nil
}
func (m *memAuthz) GetSellerPreferredStoreID(_ context.Context, userID string) (string, error) {
	if m.prefs == nil {
		return "", nil
	}
	return m.prefs[userID], nil
}
func (m *memAuthz) UpsertSellerPreferredStore(_ context.Context, userID, storeID string, _ time.Time) error {
	if m.prefs == nil {
		m.prefs = map[string]string{}
	}
	m.prefs[userID] = storeID
	return nil
}
func (m *memAuthz) IsNotFound(err error) bool {
	return err != nil && err.Error() == "not found"
}

type fixedClock struct{ t time.Time }

func (c fixedClock) Now() time.Time { return c.t }

type fixedIDs struct{ n int }

func (f *fixedIDs) New() string {
	f.n++
	return "id-" + itoa(f.n)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [12]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}

func TestRequirePermissionFromSet(t *testing.T) {
	set := authz.PermissionSet([]string{authz.PermAdminPing})
	if err := application.RequirePermissionFromSet(set, authz.PermAdminPing); err != nil {
		t.Fatal(err)
	}
	err := application.RequirePermissionFromSet(set, authz.PermKYCReview)
	if err == nil {
		t.Fatal("expected forbidden")
	}
	ae, ok := apperr.AsAppError(err)
	if !ok || ae.Code != apperr.CodeForbidden {
		t.Fatalf("want FORBIDDEN, got %#v", err)
	}
}

func TestHasPermissionAndRequire(t *testing.T) {
	store := newMemAuthz()
	store.perms["u1"] = []string{authz.PermMerchantsRead}
	svc := &application.AuthzService{Store: store, Clock: fixedClock{t: time.Unix(0, 0).UTC()}}
	ok, err := svc.HasPermission(context.Background(), "u1", authz.PermMerchantsRead)
	if err != nil || !ok {
		t.Fatalf("has=%v err=%v", ok, err)
	}
	if err := svc.RequirePermission(context.Background(), "u1", authz.PermAdminPing); err == nil {
		t.Fatal("expected forbidden")
	}
}

func TestCrossTenantStoreAccess(t *testing.T) {
	store := newMemAuthz()
	store.merchants["m1"] = authz.Merchant{ID: "m1", OwnerUserID: "owner1", Status: authz.MerchantActive}
	store.merchants["m2"] = authz.Merchant{ID: "m2", OwnerUserID: "owner2", Status: authz.MerchantActive}
	store.members[store.key("m1", "owner1")] = authz.MerchantMember{
		MerchantID: "m1", UserID: "owner1", RoleInMerchant: authz.MemberOwner, Status: authz.MemberActive,
	}
	store.stores["s2"] = authz.Store{ID: "s2", MerchantID: "m2", Slug: "other", Status: authz.StoreActive}
	svc := &application.AuthzService{Store: store}
	_, _, err := svc.ResolveStoreMerchant(context.Background(), "owner1", "s2")
	if err == nil {
		t.Fatal("expected cross-tenant deny")
	}
	ae, ok := apperr.AsAppError(err)
	if !ok || ae.Code != apperr.CodeResourceNotFound {
		t.Fatalf("want NOT_FOUND, got %#v", err)
	}
	_, gErr := svc.StoreAccessGuard(context.Background(), "owner1", "s2", false)
	if gErr == nil {
		t.Fatal("StoreAccessGuard expected cross-tenant deny")
	}
	ae2, ok := apperr.AsAppError(gErr)
	if !ok || ae2.Code != apperr.CodeResourceNotFound {
		t.Fatalf("guard want NOT_FOUND, got %#v", gErr)
	}
}

func TestSellerBootstrap_SelectionAndMembership(t *testing.T) {
	store := newMemAuthz()
	now := time.Unix(1000, 0).UTC()
	store.merchants["m1"] = authz.Merchant{ID: "m1", OwnerUserID: "u1", DisplayName: "Shop", Status: authz.MerchantActive}
	store.members[store.key("m1", "u1")] = authz.MerchantMember{
		MerchantID: "m1", UserID: "u1", RoleInMerchant: authz.MemberOwner, Status: authz.MemberActive, CreatedAt: now,
	}
	store.stores["s_can"] = authz.Store{
		ID: "s_can", MerchantID: "m1", Slug: "can", Name: "Canonical", Status: authz.StoreActive, IsCanonical: true, CreatedAt: now,
	}
	store.stores["s_alt"] = authz.Store{
		ID: "s_alt", MerchantID: "m1", Slug: "alt", Name: "Alt", Status: authz.StoreActive, IsCanonical: false, CreatedAt: now.Add(time.Hour),
	}
	svc := &application.AuthzService{Store: store, Clock: fixedClock{t: now}}

	// No membership → forbidden
	_, err := svc.GetSellerBootstrap(context.Background(), "nobody")
	if err == nil {
		t.Fatal("expected forbidden without membership")
	}
	ae, _ := apperr.AsAppError(err)
	if ae.Code != apperr.CodeForbidden {
		t.Fatalf("code=%s", ae.Code)
	}

	// Default current = canonical
	boot, err := svc.GetSellerBootstrap(context.Background(), "u1")
	if err != nil {
		t.Fatal(err)
	}
	if boot.CanonicalStoreID != "s_can" || boot.CurrentStoreID != "s_can" {
		t.Fatalf("canonical/current=%s/%s", boot.CanonicalStoreID, boot.CurrentStoreID)
	}
	if len(boot.Memberships) != 1 || len(boot.Stores) != 2 {
		t.Fatalf("memberships=%d stores=%d", len(boot.Memberships), len(boot.Stores))
	}

	// Preferred valid store
	if err := svc.SetSellerPreferredStore(context.Background(), "u1", "s_alt"); err != nil {
		t.Fatal(err)
	}
	boot, err = svc.GetSellerBootstrap(context.Background(), "u1")
	if err != nil {
		t.Fatal(err)
	}
	if boot.CurrentStoreID != "s_alt" {
		t.Fatalf("want preferred s_alt got %s", boot.CurrentStoreID)
	}

	// Preferred foreign store → fall back to canonical (preference ignored)
	store.prefs["u1"] = "s_foreign"
	boot, err = svc.GetSellerBootstrap(context.Background(), "u1")
	if err != nil {
		t.Fatal(err)
	}
	if boot.CurrentStoreID != "s_can" {
		t.Fatalf("invalid preferred should fall back to canonical, got %s", boot.CurrentStoreID)
	}

	// Set preferred foreign via API → NOT_FOUND
	if err := svc.SetSellerPreferredStore(context.Background(), "u1", "s_foreign"); err == nil {
		t.Fatal("expected deny foreign preferred")
	}
}

func TestStoreAccessGuard_MembershipRequired(t *testing.T) {
	store := newMemAuthz()
	store.merchants["m1"] = authz.Merchant{ID: "m1", OwnerUserID: "owner", Status: authz.MerchantActive}
	store.members[store.key("m1", "owner")] = authz.MerchantMember{
		MerchantID: "m1", UserID: "owner", RoleInMerchant: authz.MemberOwner, Status: authz.MemberActive,
	}
	store.stores["s1"] = authz.Store{ID: "s1", MerchantID: "m1", Slug: "s", Status: authz.StoreActive, IsCanonical: true}
	svc := &application.AuthzService{Store: store}

	access, err := svc.StoreAccessGuard(context.Background(), "owner", "s1", true)
	if err != nil {
		t.Fatal(err)
	}
	if access.Store.ID != "s1" || access.Scope.MemberRole != authz.MemberOwner {
		t.Fatalf("access=%+v", access)
	}

	// Non-member → NOT_FOUND
	_, err = svc.StoreAccessGuard(context.Background(), "stranger", "s1", false)
	if err == nil {
		t.Fatal("expected not found")
	}
	ae, _ := apperr.AsAppError(err)
	if ae.Code != apperr.CodeResourceNotFound {
		t.Fatalf("code=%s", ae.Code)
	}
}

func TestBuyerOwnsResourceHelper(t *testing.T) {
	if err := application.RequireBuyerOwnsResource("a", "b"); err == nil {
		t.Fatal("expected deny")
	}
	if err := application.RequireBuyerOwnsResource("a", "a"); err != nil {
		t.Fatal(err)
	}
}

func TestUnscopedListRejected(t *testing.T) {
	store := newMemAuthz()
	svc := &application.AuthzService{Store: store}
	err := svc.RequireScopedMerchantList(context.Background(), "u1")
	if err == nil {
		t.Fatal("expected forbidden")
	}
	ae, _ := apperr.AsAppError(err)
	if ae.Code != apperr.CodeForbidden {
		t.Fatalf("code=%s", ae.Code)
	}
}

func TestCreateCustomRoleAntiEscalation(t *testing.T) {
	store := newMemAuthz()
	store.perms["admin"] = []string{authz.PermRolesWrite, authz.PermMerchantsRead}
	ids := &fixedIDs{}
	svc := &application.AuthzService{
		Store: store,
		IDs:   ids,
		Clock: fixedClock{t: time.Unix(1000, 0).UTC()},
	}
	// Cannot grant unheld KYC
	_, err := svc.CreateCustomRole(context.Background(), application.CreateRoleInput{
		ActorUserID: "admin",
		Code:        "CUSTOM_X",
		Name:        "X",
		Permissions: []string{authz.PermKYCReview},
	})
	if err == nil {
		t.Fatal("expected forbid unheld")
	}
	// Can grant held
	rp, err := svc.CreateCustomRole(context.Background(), application.CreateRoleInput{
		ActorUserID: "admin",
		Code:        "CUSTOM_Y",
		Name:        "Y",
		Permissions: []string{authz.PermMerchantsRead},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(rp.Permissions) != 1 || rp.Permissions[0] != authz.PermMerchantsRead {
		t.Fatalf("perms=%v", rp.Permissions)
	}
}

func TestSystemRoleUpdateRejected(t *testing.T) {
	store := newMemAuthz()
	store.perms["admin"] = []string{authz.PermRolesWrite, authz.PermMerchantsRead}
	store.roles["role_super_admin"] = authz.Role{
		ID: "role_super_admin", Code: authz.RoleSuperAdmin, IsSystem: true, Version: 1, Name: "SA",
	}
	svc := &application.AuthzService{
		Store: store,
		IDs:   &fixedIDs{},
		Clock: fixedClock{t: time.Unix(1000, 0).UTC()},
	}
	_, err := svc.UpdateCustomRole(context.Background(), application.UpdateRoleInput{
		ActorUserID:     "admin",
		RoleID:          "role_super_admin",
		ExpectedVersion: 1,
		Name:            "Hacked",
		Permissions:     []string{authz.PermMerchantsRead},
	})
	if err == nil {
		t.Fatal("expected system immutable")
	}
	ae, _ := apperr.AsAppError(err)
	if ae.Code != apperr.CodeForbidden {
		t.Fatalf("code=%s", ae.Code)
	}
}

func TestCannotRemoveLastSuperAdmin(t *testing.T) {
	store := newMemAuthz()
	store.perms["sa"] = authz.AllPermissionCodes()
	store.roles["role_super_admin"] = authz.Role{
		ID: "role_super_admin", Code: authz.RoleSuperAdmin, IsSystem: true, Version: 1, Name: "SA",
	}
	store.rolePerms["role_super_admin"] = authz.AllPermissionCodes()
	store.userRoles["only"] = map[string]struct{}{"role_super_admin": {}}
	store.userByID["only"] = auth.User{ID: "only"}
	svc := &application.AuthzService{
		Store: store,
		IDs:   &fixedIDs{},
		Clock: fixedClock{t: time.Unix(1000, 0).UTC()},
	}
	err := svc.RemoveUserRoleWithPolicy(context.Background(), application.RemoveRoleInput{
		ActorUserID: "sa", TargetUserID: "only", RoleID: "role_super_admin",
	})
	if err == nil {
		t.Fatal("expected last super admin protect")
	}
}

func TestInviteAcceptOnceAndRevoked(t *testing.T) {
	store := newMemAuthz()
	store.perms["admin"] = authz.AllPermissionCodes()
	store.roles["r1"] = authz.Role{ID: "r1", Code: "CUSTOM_OPS", Name: "Ops", Version: 1}
	store.rolePerms["r1"] = []string{authz.PermMerchantsRead, authz.PermAdminPing}
	now := time.Unix(2000, 0).UTC()
	svc := &application.AuthzService{
		Store: store,
		IDs:   &fixedIDs{},
		Clock: fixedClock{t: now},
	}
	inv, raw, err := svc.CreateStaffInvitation(context.Background(), application.CreateStaffInviteInput{
		ActorUserID: "admin",
		Email:       "staff@example.com",
		RoleID:      "r1",
	})
	if err != nil || raw == "" {
		t.Fatalf("create invite err=%v raw empty=%v", err, raw == "")
	}
	verified := now.Add(-time.Hour)
	store.users["staff@example.com"] = "u-staff"
	store.userByID["u-staff"] = auth.User{
		ID: "u-staff", EmailNormalized: "staff@example.com", EmailVerifiedAt: &verified, MFAEnabled: true,
	}
	res, err := svc.AcceptStaffInvitation(context.Background(), raw, "")
	if err != nil {
		t.Fatal(err)
	}
	if res.UserID != "u-staff" {
		t.Fatalf("user=%s", res.UserID)
	}
	// Replay accepted is idempotent
	res2, err := svc.AcceptStaffInvitation(context.Background(), raw, "")
	if err != nil {
		t.Fatal(err)
	}
	if res2.Message == "" {
		t.Fatal("expected already accepted message")
	}
	// Revoked fail
	inv2, raw2, err := svc.CreateStaffInvitation(context.Background(), application.CreateStaffInviteInput{
		ActorUserID: "admin", Email: "other@example.com", RoleID: "r1",
	})
	if err != nil {
		t.Fatal(err)
	}
	_, _ = svc.RevokeStaffInvitation(context.Background(), "admin", inv2.ID)
	_, err = svc.AcceptStaffInvitation(context.Background(), raw2, "")
	if err == nil {
		t.Fatal("expected revoked fail")
	}
	_ = inv
}
