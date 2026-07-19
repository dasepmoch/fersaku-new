package authz

import "time"

// Role is an RBAC role aggregate (system or custom).
type Role struct {
	ID          string
	Code        string
	Name        string
	Description string
	IsSystem    bool
	Version     int64
	ArchivedAt  *time.Time
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// Permission is a stable capability code.
type Permission struct {
	Code        string
	Description string
	Category    string
	CreatedAt   time.Time
}

// UserRole is a global role assignment (platform-level, not merchant membership).
type UserRole struct {
	UserID     string
	RoleID     string
	AssignedAt time.Time
	AssignedBy *string
}

// Merchant is a minimal tenant root (BE-130; full onboarding in BE-200).
type Merchant struct {
	ID              string
	OwnerUserID     string
	DisplayName     string
	Status          MerchantStatus
	OnboardingState string // NOT_STARTED|IDENTITY|SLUG|VISUAL|PRODUCT_OPTIONAL|COMPLETE
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// MerchantMember links a user to a merchant with OWNER|STAFF.
type MerchantMember struct {
	MerchantID     string
	UserID         string
	RoleInMerchant MerchantMemberRole
	Status         MerchantMemberStatus
	CreatedAt      time.Time
}

// Store is a merchant-owned storefront anchor.
type Store struct {
	ID          string
	MerchantID  string
	Slug        string
	Name        string
	Status      StoreStatus
	IsCanonical bool
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// TenantScope captures resolved ownership for a request.
type TenantScope struct {
	MerchantID string
	StoreID    string
	MemberRole MerchantMemberRole
}

// InvitationStatus is staff/merchant invitation lifecycle.
type InvitationStatus string

const (
	InvitePending  InvitationStatus = "PENDING"
	InviteAccepted InvitationStatus = "ACCEPTED"
	InviteRevoked  InvitationStatus = "REVOKED"
	InviteExpired  InvitationStatus = "EXPIRED"
)

// StaffInvitation is a platform staff invite (raw token never stored).
type StaffInvitation struct {
	ID              string
	EmailNormalized string
	EmailDisplay    string
	InviterUserID   string
	RoleID          string
	TokenHash       string
	Status          InvitationStatus
	ExpiresAt       time.Time
	AcceptedAt      *time.Time
	AcceptedUserID  *string
	RevokedAt       *time.Time
	RevokedBy       *string
	IdempotencyKey  *string
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// MerchantInvitation invites a seller/staff to a merchant tenant.
type MerchantInvitation struct {
	ID                string
	EmailNormalized   string
	EmailDisplay      string
	InviterUserID     string
	MerchantID        *string
	RoleInMerchant    MerchantMemberRole
	OnboardingPurpose string
	TokenHash         string
	Status            InvitationStatus
	ExpiresAt         time.Time
	AcceptedAt        *time.Time
	AcceptedUserID    *string
	RevokedAt         *time.Time
	RevokedBy         *string
	IdempotencyKey    *string
	CreatedAt         time.Time
	UpdatedAt         time.Time
}
