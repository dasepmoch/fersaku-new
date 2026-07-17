package auth

import (
	"strings"
	"time"
	"unicode/utf8"
)

// Email change request lifecycle status.
type EmailChangeStatus string

const (
	EmailChangePending   EmailChangeStatus = "PENDING"
	EmailChangeCompleted EmailChangeStatus = "COMPLETED"
	EmailChangeCancelled EmailChangeStatus = "CANCELLED"
	EmailChangeExpired   EmailChangeStatus = "EXPIRED"
)

// Profile is the account profile aggregate (optimistic version).
type Profile struct {
	UserID      string
	DisplayName string
	Phone       string
	Locale      string
	Timezone    string
	AvatarRef   string
	Version     int64
	UpdatedAt   time.Time
	// Denormalized identity fields for GET responses (not stored on profile row).
	Email         string
	EmailVerified bool
	MFAEnabled    bool
	Status        UserStatus
	Name          string
}

// EmailChangeRequest binds dual proofs to one pending address change.
type EmailChangeRequest struct {
	ID                     string
	UserID                 string
	NewEmailNormalized     string
	NewEmailDisplay        string
	CurrentProofChallengeID string
	NewProofChallengeID    string
	CurrentConfirmedAt     *time.Time
	NewConfirmedAt         *time.Time
	Status                 EmailChangeStatus
	CreatedAt              time.Time
	CompletedAt            *time.Time
}

// NotificationChannel is a delivery channel in the closed matrix.
type NotificationChannel string

const (
	ChannelEmail NotificationChannel = "EMAIL"
	ChannelInApp NotificationChannel = "IN_APP"
)

// NotificationEventCode is a closed event code for preferences.
type NotificationEventCode string

const (
	EventSecurityAlert       NotificationEventCode = "SECURITY_ALERT"
	EventPaymentReceipt      NotificationEventCode = "PAYMENT_RECEIPT"
	EventKYCUpdate           NotificationEventCode = "KYC_UPDATE"
	EventWithdrawalUpdate    NotificationEventCode = "WITHDRAWAL_UPDATE"
	EventMarketingNewsletter NotificationEventCode = "MARKETING_NEWSLETTER"
)

// NotificationPref is one cell in the closed event/channel matrix.
type NotificationPref struct {
	EventCode NotificationEventCode
	Channel   NotificationChannel
	Enabled   bool
	Mandatory bool
	UpdatedAt time.Time
}

// NotificationEventDef describes a closed-schema event and its default channels.
type NotificationEventDef struct {
	Code      NotificationEventCode
	Mandatory bool
	Channels  []NotificationChannel
}

// ClosedNotificationSchema is the approved event/channel matrix (BE-125).
// Mandatory security/transactional events cannot be opted out.
var ClosedNotificationSchema = []NotificationEventDef{
	{Code: EventSecurityAlert, Mandatory: true, Channels: []NotificationChannel{ChannelEmail, ChannelInApp}},
	{Code: EventPaymentReceipt, Mandatory: true, Channels: []NotificationChannel{ChannelEmail, ChannelInApp}},
	{Code: EventKYCUpdate, Mandatory: true, Channels: []NotificationChannel{ChannelEmail, ChannelInApp}},
	{Code: EventWithdrawalUpdate, Mandatory: true, Channels: []NotificationChannel{ChannelEmail, ChannelInApp}},
	{Code: EventMarketingNewsletter, Mandatory: false, Channels: []NotificationChannel{ChannelEmail}},
}

// IsMandatoryEvent reports whether the event cannot be disabled.
func IsMandatoryEvent(code NotificationEventCode) bool {
	for _, d := range ClosedNotificationSchema {
		if d.Code == code {
			return d.Mandatory
		}
	}
	return false
}

// ValidNotificationEvent reports closed-schema membership.
func ValidNotificationEvent(code string) bool {
	switch NotificationEventCode(code) {
	case EventSecurityAlert, EventPaymentReceipt, EventKYCUpdate, EventWithdrawalUpdate, EventMarketingNewsletter:
		return true
	default:
		return false
	}
}

// ValidNotificationChannel reports closed-schema membership.
func ValidNotificationChannel(ch string) bool {
	switch NotificationChannel(ch) {
	case ChannelEmail, ChannelInApp:
		return true
	default:
		return false
	}
}

// AllowedChannelForEvent reports whether the channel is in the schema for the event.
func AllowedChannelForEvent(event NotificationEventCode, ch NotificationChannel) bool {
	for _, d := range ClosedNotificationSchema {
		if d.Code != event {
			continue
		}
		for _, c := range d.Channels {
			if c == ch {
				return true
			}
		}
	}
	return false
}

// DefaultNotificationPrefs returns the full matrix with mandatory defaults enabled.
func DefaultNotificationPrefs(now time.Time) []NotificationPref {
	out := make([]NotificationPref, 0, 12)
	for _, d := range ClosedNotificationSchema {
		for _, ch := range d.Channels {
			enabled := true
			if !d.Mandatory && d.Code == EventMarketingNewsletter {
				enabled = false // marketing opt-in default off
			}
			out = append(out, NotificationPref{
				EventCode: d.Code,
				Channel:   ch,
				Enabled:   enabled,
				Mandatory: d.Mandatory,
				UpdatedAt: now,
			})
		}
	}
	return out
}

// ValidateProfilePatch normalizes and validates profile mutation fields.
// Empty pointer means "leave unchanged".
func ValidateProfilePatch(displayName, phone, locale, timezone, avatarRef *string) (dn, ph, loc, tz, av string, err error) {
	if displayName != nil {
		dn = strings.TrimSpace(*displayName)
		if utf8.RuneCountInString(dn) > 120 {
			return "", "", "", "", "", ErrValidation
		}
	}
	if phone != nil {
		ph = strings.TrimSpace(*phone)
		if utf8.RuneCountInString(ph) > 32 {
			return "", "", "", "", "", ErrValidation
		}
		// Allow empty; otherwise basic phone chars.
		for _, r := range ph {
			if (r >= '0' && r <= '9') || r == '+' || r == '-' || r == ' ' || r == '(' || r == ')' {
				continue
			}
			return "", "", "", "", "", ErrValidation
		}
	}
	if locale != nil {
		loc = strings.TrimSpace(*locale)
		if loc == "" || utf8.RuneCountInString(loc) > 32 {
			return "", "", "", "", "", ErrValidation
		}
	}
	if timezone != nil {
		tz = strings.TrimSpace(*timezone)
		if tz == "" || utf8.RuneCountInString(tz) > 64 {
			return "", "", "", "", "", ErrValidation
		}
	}
	if avatarRef != nil {
		av = strings.TrimSpace(*avatarRef)
		if utf8.RuneCountInString(av) > 256 {
			return "", "", "", "", "", ErrValidation
		}
	}
	return dn, ph, loc, tz, av, nil
}

// NormalizeDisplayName trims and clamps display name for create defaults.
func NormalizeDisplayName(name string) string {
	n := strings.TrimSpace(name)
	if utf8.RuneCountInString(n) > 120 {
		// rune-safe truncate
		r := []rune(n)
		n = string(r[:120])
	}
	return n
}
