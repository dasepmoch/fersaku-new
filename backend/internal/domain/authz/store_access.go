package authz

// INT-150 — tenant/store access model.
//
// Schema today: merchant_members.role_in_merchant ∈ {OWNER, STAFF} only.
// Global seller permissions (seller.store.read / seller.store.write) are surface
// grants on the SELLER_OWNER system role; they do NOT authorize every store.
//
// Store access requires:
//  1. Active merchant membership for the store's merchant, AND
//  2. (for HTTP routes) the matching global seller permission when middleware
//     enforces it — membership alone is never cross-tenant.
//
// Capability mapping (membership role → store-scoped capabilities):
//
//	OWNER → store.read, store.write  (full tenant ops on all merchant stores)
//	STAFF → store.read, store.write  (same store surface; staff cannot reassign
//	         OWNER or close merchant — those are separate membership mutations)
//
// Finer member-read vs member-write is intentionally not invented here: production
// schema cannot enforce it until a dedicated capability migration lands.
// Admin bypass uses platform roles (SUPER_ADMIN / ADMIN_SUPPORT) on audited paths
// only — never global seller permissions.

// StoreCapability is a store-scoped capability code returned in seller bootstrap.
type StoreCapability string

const (
	StoreCapRead  StoreCapability = "store.read"
	StoreCapWrite StoreCapability = "store.write"
)

// CapabilitiesForMemberRole maps OWNER|STAFF → stable capability set.
func CapabilitiesForMemberRole(role MerchantMemberRole) []StoreCapability {
	switch role {
	case MemberOwner, MemberStaff:
		return []StoreCapability{StoreCapRead, StoreCapWrite}
	default:
		return nil
	}
}

// MemberRoleAllowsWrite reports whether membership may perform write ops on the store.
func MemberRoleAllowsWrite(role MerchantMemberRole) bool {
	for _, c := range CapabilitiesForMemberRole(role) {
		if c == StoreCapWrite {
			return true
		}
	}
	return false
}

// MemberRoleAllowsRead reports whether membership may read the store.
func MemberRoleAllowsRead(role MerchantMemberRole) bool {
	for _, c := range CapabilitiesForMemberRole(role) {
		if c == StoreCapRead {
			return true
		}
	}
	return false
}

// StoreAccess is the resolved guard result for a store-scoped use case.
type StoreAccess struct {
	Store      Store
	Scope      TenantScope
	Capabilities []StoreCapability
}

// RequireStoreCapability returns NOT_FOUND when capability missing (no existence leak
// for capability probes on foreign stores — caller already resolved membership).
// When capability is absent on an owned store, prefer FORBIDDEN.
func RequireStoreCapability(access StoreAccess, cap StoreCapability) error {
	for _, c := range access.Capabilities {
		if c == cap {
			return nil
		}
	}
	return ErrForbidden("Missing required store capability")
}
