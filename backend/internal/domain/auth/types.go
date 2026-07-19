package auth

import "time"

// Surface is the browser surface bound to a session (ADR-0004).
type Surface string

const (
	SurfaceBuyer  Surface = "BUYER"
	SurfaceSeller Surface = "SELLER"
	SurfaceAdmin  Surface = "ADMIN"
)

func (s Surface) Valid() bool {
	switch s {
	case SurfaceBuyer, SurfaceSeller, SurfaceAdmin:
		return true
	default:
		return false
	}
}

// UserStatus is the account lifecycle status (§5.1).
type UserStatus string

const (
	UserPendingVerification UserStatus = "PENDING_VERIFICATION"
	UserActive              UserStatus = "ACTIVE"
	UserSuspended           UserStatus = "SUSPENDED"
	UserClosed              UserStatus = "CLOSED"
)

// ChallengePurpose binds a one-time bootstrap token (§6.5).
type ChallengePurpose string

const (
	PurposeEmailVerify        ChallengePurpose = "EMAIL_VERIFY"
	PurposePasswordReset      ChallengePurpose = "PASSWORD_RESET"
	PurposeMagicLink          ChallengePurpose = "MAGIC_LINK"
	PurposeMFAEnroll          ChallengePurpose = "MFA_ENROLL"
	PurposeEmailChangeCurrent ChallengePurpose = "EMAIL_CHANGE_CURRENT"
	PurposeEmailChangeNew     ChallengePurpose = "EMAIL_CHANGE_NEW"
)

// User is the identity aggregate root (no password hash in public DTOs).
type User struct {
	ID              string
	EmailNormalized string
	EmailDisplay    string
	PasswordHash    string // empty for magic-link-only buyers
	Name            string
	Status          UserStatus
	EmailVerifiedAt *time.Time
	MFAEnabled      bool
	LastLoginAt     *time.Time
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// Session is a server-side opaque session (token hash only at rest).
type Session struct {
	ID                string
	UserID            string
	Surface           Surface
	TokenHash         string
	ExpiresAt         time.Time
	RevokedAt         *time.Time
	MFAVerifiedAt     *time.Time
	LastSeenAt        time.Time
	AbsoluteExpiresAt time.Time
	IPHash            string
	UAHash            string
	DeviceLabel       string
	CSRFTokenHash     string
	CreatedAt         time.Time
}

// Challenge is a purpose-bound one-time bootstrap token row.
type Challenge struct {
	ID          string
	UserID      *string
	Purpose     ChallengePurpose
	TokenHash   string
	Audience    string
	ExpiresAt   time.Time
	ConsumedAt  *time.Time
	Attempts    int
	MaxAttempts int
	Payload     []byte
	CreatedAt   time.Time
}

// MFAFactor is a TOTP factor (secret stored encrypted/encoded, never logged).
type MFAFactor struct {
	ID          string
	UserID      string
	FactorType  string
	SecretEnc   string
	Label       string
	ConfirmedAt *time.Time
	CreatedAt   time.Time
}

// Principal is the authenticated subject attached to request context.
type Principal struct {
	UserID        string
	SessionID     string
	Surface       Surface
	Email         string
	Name          string
	Status        UserStatus
	MFAEnabled    bool
	MFAVerified   bool
	EmailVerified bool
	// Permissions is the effective permission cache loaded at session resolve (BE-130).
	// Deny by default when empty/nil.
	Permissions []string
	// RoleCodes are assigned system/custom role codes (informational; authorization uses Permissions).
	RoleCodes []string
	// Impersonation fields when the session is a derived support session (BE-520).
	Impersonating       bool
	ImpersonationID     string
	ImpersonationScope  string // READ_ONLY | SUPPORT_WRITE
	ImpersonationActor  string // actor admin user id
	ImpersonationExpiry time.Time
}
