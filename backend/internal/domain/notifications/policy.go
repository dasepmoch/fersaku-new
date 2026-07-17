package notifications

import (
	"fmt"
	"strings"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
)

// ChannelDecision is whether a channel should deliver for an event given prefs.
type ChannelDecision struct {
	Channel auth.NotificationChannel
	Deliver bool
	Reason  string // "mandatory", "enabled", "disabled", "not_in_schema"
}

// ResolveChannels applies BE-125 mandatory/optional policy.
// Mandatory events always deliver on schema channels (ignore opt-out).
// Optional events respect enabled=false (and default off for marketing).
func ResolveChannels(event auth.NotificationEventCode, prefs []auth.NotificationPref) []ChannelDecision {
	var schemaChannels []auth.NotificationChannel
	mandatory := false
	for _, d := range auth.ClosedNotificationSchema {
		if d.Code == event {
			schemaChannels = d.Channels
			mandatory = d.Mandatory
			break
		}
	}
	if len(schemaChannels) == 0 {
		return nil
	}
	prefMap := make(map[auth.NotificationChannel]bool, len(prefs))
	for _, p := range prefs {
		if p.EventCode == event {
			prefMap[p.Channel] = p.Enabled
		}
	}
	out := make([]ChannelDecision, 0, len(schemaChannels))
	for _, ch := range schemaChannels {
		if mandatory {
			out = append(out, ChannelDecision{Channel: ch, Deliver: true, Reason: "mandatory"})
			continue
		}
		enabled, ok := prefMap[ch]
		if !ok {
			// Missing pref: marketing default off; others default on.
			enabled = event != auth.EventMarketingNewsletter
		}
		if enabled {
			out = append(out, ChannelDecision{Channel: ch, Deliver: true, Reason: "enabled"})
		} else {
			out = append(out, ChannelDecision{Channel: ch, Deliver: false, Reason: "disabled"})
		}
	}
	return out
}

// ShouldCreateInbox is true when IN_APP channel is deliverable for the event.
// Events without IN_APP in schema (e.g. marketing email-only) never create inbox rows.
func ShouldCreateInbox(event auth.NotificationEventCode, prefs []auth.NotificationPref) bool {
	for _, d := range ResolveChannels(event, prefs) {
		if d.Channel == auth.ChannelInApp && d.Deliver {
			return true
		}
	}
	return false
}

// ShouldSendEmail is true when EMAIL channel is deliverable.
func ShouldSendEmail(event auth.NotificationEventCode, prefs []auth.NotificationPref) bool {
	for _, d := range ResolveChannels(event, prefs) {
		if d.Channel == auth.ChannelEmail && d.Deliver {
			return true
		}
	}
	return false
}

// DedupeKey is the logical uniqueness key for inbox rows.
func DedupeKey(recipientUserID string, event auth.NotificationEventCode, contentVersion string) string {
	return fmt.Sprintf("%s|%s|%s", recipientUserID, event, contentVersion)
}

// OutboxDedupeDispatch is outbox dedupe for notification.dispatch.
func OutboxDedupeDispatch(notificationID string, channel auth.NotificationChannel, contentVersion string) string {
	return fmt.Sprintf("notification.dispatch:%s:%s:%s", notificationID, channel, contentVersion)
}

// OutboxDedupeEmail is outbox dedupe for email.send.
func OutboxDedupeEmail(template, recipient, businessRef string) string {
	return fmt.Sprintf("email.send:%s:%s:%s", template, strings.ToLower(recipient), businessRef)
}

// ValidateCreate normalizes and validates CreateInput (does not apply prefs).
func ValidateCreate(in CreateInput) (CreateInput, error) {
	if strings.TrimSpace(in.RecipientUserID) == "" {
		return CreateInput{}, ErrValidation
	}
	if !auth.ValidNotificationEvent(string(in.EventCode)) {
		return CreateInput{}, ErrValidation
	}
	if in.Surface == "" {
		in.Surface = SurfaceSeller
	}
	if !ValidSurface(string(in.Surface)) {
		return CreateInput{}, ErrValidation
	}
	title, err := SanitizeTitle(in.Title)
	if err != nil {
		return CreateInput{}, err
	}
	body, err := SanitizeBody(in.Body)
	if err != nil {
		return CreateInput{}, err
	}
	cta, err := SanitizeCTAPath(in.CTAPath)
	if err != nil {
		return CreateInput{}, err
	}
	cv := strings.TrimSpace(in.ContentVersion)
	if cv == "" {
		return CreateInput{}, ErrValidation
	}
	if in.Priority == "" {
		in.Priority = DefaultPriorityForEvent(in.EventCode)
	}
	switch in.Priority {
	case PriorityInfo, PriorityWarning, PriorityCritical, PriorityCompliance:
	default:
		return CreateInput{}, ErrValidation
	}
	if in.RetentionClass == "" {
		in.RetentionClass = DefaultRetentionForEvent(in.EventCode)
	}
	switch in.RetentionClass {
	case RetentionStandard, RetentionSecurity, RetentionCompliance:
	default:
		return CreateInput{}, ErrValidation
	}
	// Tenant pair consistency.
	tt := strings.TrimSpace(in.TenantType)
	tid := strings.TrimSpace(in.TenantID)
	if (tt == "") != (tid == "") {
		return CreateInput{}, ErrValidation
	}
	in.Title = title
	in.Body = body
	in.CTAPath = cta
	in.ContentVersion = cv
	in.TenantType = tt
	in.TenantID = tid
	in.RecipientEmail = strings.TrimSpace(in.RecipientEmail)
	return in, nil
}
