// Package authz owns RBAC permission codes, system roles, and tenant policy (BE-130).
package authz

// Stable permission codes (registry source of truth for seeds + matrix).
const (
	PermAdminPing                    = "admin.ping"
	PermAdminDashboardRead           = "admin.dashboard.read"
	PermMerchantsRead                = "merchants.read"
	PermMerchantsWrite               = "merchants.write"
	PermBuyersRead                   = "buyers.read"
	PermOrdersRead                   = "orders.read"
	PermPaymentsRead                 = "payments.read"
	PermKYCReview                    = "kyc.review"
	PermWithdrawalsReview            = "withdrawals.review"
	PermImpersonationStart           = "impersonation.start"
	PermImpersonationSupportWrite    = "impersonation.support_write"
	PermProviderCallbacksReplay      = "provider_callbacks.replay"
	PermSellerWebhookDeliveriesRetry = "seller_webhook_deliveries.retry"
	PermWebhooksRead                 = "webhooks.read"
	PermRolesRead                    = "roles.read"
	PermRolesWrite                   = "roles.write"
	PermRolesAssign                  = "roles.assign"
	PermUsersRead                    = "users.read"
	PermFulfillmentForce             = "fulfillment.force"
	PermFulfillmentRead              = "fulfillment.read"
	PermInventoryReveal              = "inventory.reveal"
	PermInventoryRead                = "inventory.read"
	PermReviewsRead                  = "reviews.read"
	PermReviewsModerate              = "reviews.moderate"
	PermCampaignsPublish             = "campaigns.publish"
	PermPlatformEmergency            = "platform.emergency"
	PermPlatformFeesPreview          = "platform.fees.preview"
	PermAuditRead                    = "audit.read"
	PermSellerStoreRead              = "seller.store.read"
	PermSellerStoreWrite             = "seller.store.write"
	PermBuyerPurchasesRead           = "buyer.purchases.read"
	PermInvitationsStaff             = "invitations.staff"
	PermInvitationsMerchant          = "invitations.merchant"
)

// System role codes (immutable; is_system=true in DB).
const (
	RoleSuperAdmin   = "SUPER_ADMIN"
	RoleAdminSupport = "ADMIN_SUPPORT"
	RoleAdminFinance = "ADMIN_FINANCE"
	RoleSellerOwner  = "SELLER_OWNER"
	RoleBuyer        = "BUYER"
)

// SystemRoleIDs are stable primary keys used by migration seed.
const (
	RoleIDSuperAdmin   = "role_super_admin"
	RoleIDAdminSupport = "role_admin_support"
	RoleIDAdminFinance = "role_admin_finance"
	RoleIDSellerOwner  = "role_seller_owner"
	RoleIDBuyer        = "role_buyer"
)

// MerchantMemberRole is membership within a merchant tenant.
type MerchantMemberRole string

const (
	MemberOwner MerchantMemberRole = "OWNER"
	MemberStaff MerchantMemberRole = "STAFF"
)

// MerchantMemberStatus is membership lifecycle.
type MerchantMemberStatus string

const (
	MemberActive    MerchantMemberStatus = "ACTIVE"
	MemberInvited   MerchantMemberStatus = "INVITED"
	MemberSuspended MerchantMemberStatus = "SUSPENDED"
	MemberRemoved   MerchantMemberStatus = "REMOVED"
)

// MerchantStatus is merchant lifecycle.
type MerchantStatus string

const (
	MerchantActive    MerchantStatus = "ACTIVE"
	MerchantSuspended MerchantStatus = "SUSPENDED"
	MerchantClosed    MerchantStatus = "CLOSED"
)

// StoreStatus is store lifecycle.
type StoreStatus string

const (
	StoreActive    StoreStatus = "ACTIVE"
	StoreSuspended StoreStatus = "SUSPENDED"
	StoreArchived  StoreStatus = "ARCHIVED"
)

// AllPermissionCodes returns the launch permission registry (order stable for tests).
func AllPermissionCodes() []string {
	return []string{
		PermAdminPing,
		PermAdminDashboardRead,
		PermMerchantsRead,
		PermMerchantsWrite,
		PermBuyersRead,
		PermOrdersRead,
		PermPaymentsRead,
		PermKYCReview,
		PermWithdrawalsReview,
		PermImpersonationStart,
		PermImpersonationSupportWrite,
		PermProviderCallbacksReplay,
		PermSellerWebhookDeliveriesRetry,
		PermWebhooksRead,
		PermRolesRead,
		PermRolesWrite,
		PermRolesAssign,
		PermUsersRead,
		PermFulfillmentForce,
		PermFulfillmentRead,
		PermInventoryReveal,
		PermInventoryRead,
		PermReviewsRead,
		PermReviewsModerate,
		PermCampaignsPublish,
		PermPlatformEmergency,
		PermPlatformFeesPreview,
		PermAuditRead,
		PermSellerStoreRead,
		PermSellerStoreWrite,
		PermBuyerPurchasesRead,
		PermInvitationsStaff,
		PermInvitationsMerchant,
	}
}

// SystemRoleCodes returns immutable system role codes.
func SystemRoleCodes() []string {
	return []string{
		RoleSuperAdmin,
		RoleAdminSupport,
		RoleAdminFinance,
		RoleSellerOwner,
		RoleBuyer,
	}
}

// IsSystemRole reports whether code is a seeded system role.
func IsSystemRole(code string) bool {
	switch code {
	case RoleSuperAdmin, RoleAdminSupport, RoleAdminFinance, RoleSellerOwner, RoleBuyer:
		return true
	default:
		return false
	}
}

// HasPermission reports whether set contains code (deny by default).
func HasPermission(set map[string]struct{}, code string) bool {
	if set == nil || code == "" {
		return false
	}
	_, ok := set[code]
	return ok
}

// PermissionSet builds a set from a slice.
func PermissionSet(codes []string) map[string]struct{} {
	out := make(map[string]struct{}, len(codes))
	for _, c := range codes {
		if c != "" {
			out[c] = struct{}{}
		}
	}
	return out
}
