package analytics

import (
	"net/url"
	"strings"
	"time"
	"unicode"
)

// SensitiveQueryKeys are stripped from landing/referrer URLs before any persistence.
// Never store email, tokens, API keys, payment data as analytics dimensions.
var SensitiveQueryKeys = map[string]struct{}{
	"token": {}, "access_token": {}, "refresh_token": {}, "id_token": {},
	"session": {}, "sessionid": {}, "session_id": {}, "sid": {},
	"password": {}, "passwd": {}, "pwd": {}, "secret": {}, "api_key": {}, "apikey": {},
	"key": {}, "auth": {}, "authorization": {}, "bearer": {},
	"email": {}, "e-mail": {}, "mail": {}, "phone": {}, "tel": {},
	"card": {}, "cvv": {}, "cvc": {}, "pan": {}, "account": {}, "iban": {},
	"otp": {}, "code": {}, "pin": {}, "ssn": {}, "nik": {},
	"signature": {}, "sig": {}, "hmac": {}, "x-api-key": {},
	"client_secret": {}, "private_key": {}, "csrf": {}, "csrf_token": {},
	"jwt": {}, "cookie": {}, "set-cookie": {},
	"payment": {}, "payment_token": {}, "card_number": {}, "account_number": {},
	"buyer_email": {}, "buyerEmail": {}, "user_email": {},
}

const (
	maxPathLen   = 512
	maxOriginLen = 255
	maxUTMLen    = 128
)

// StripAndNormalizeDimensions sanitizes landing/referrer/UTM into bounded dimensions.
// Never stores full arbitrary URLs.
func StripAndNormalizeDimensions(
	landingURL, referrerURL string,
	utmSource, utmMedium, utmCampaign, utmContent, utmTerm string,
) Dimensions {
	path, fromLanding := extractPathAndUTM(landingURL)
	origin := extractOrigin(referrerURL)

	src := firstNonEmpty(boundUTM(utmSource), boundUTM(fromLanding["utm_source"]))
	med := firstNonEmpty(boundUTM(utmMedium), boundUTM(fromLanding["utm_medium"]))
	camp := firstNonEmpty(boundUTM(utmCampaign), boundUTM(fromLanding["utm_campaign"]))
	cont := firstNonEmpty(boundUTM(utmContent), boundUTM(fromLanding["utm_content"]))
	term := firstNonEmpty(boundUTM(utmTerm), boundUTM(fromLanding["utm_term"]))

	ch, isDirect := ClassifyChannel(src, med, camp, origin)
	return Dimensions{
		LandingPath:    path,
		ReferrerOrigin: origin,
		UTMSource:      src,
		UTMMedium:      med,
		UTMCampaign:    camp,
		UTMContent:     cont,
		UTMTerm:        term,
		Channel:        ch,
		IsDirect:       isDirect,
	}
}

func extractPathAndUTM(raw string) (path string, utm map[string]string) {
	utm = map[string]string{}
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "/", utm
	}
	// Allow path-only or full URL.
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme == "" && u.Host == "" && !strings.HasPrefix(raw, "/")) {
		// Treat as opaque path; drop query if present by hand.
		if i := strings.IndexAny(raw, "?#"); i >= 0 {
			raw = raw[:i]
		}
		return boundPath(raw), utm
	}
	if u.Path == "" {
		path = "/"
	} else {
		path = boundPath(u.Path)
	}
	// Only allowlisted UTM keys from query; strip secrets.
	for k, vs := range u.Query() {
		lk := strings.ToLower(strings.TrimSpace(k))
		if _, sens := SensitiveQueryKeys[lk]; sens {
			continue
		}
		if strings.HasPrefix(lk, "utm_") && len(vs) > 0 {
			utm[lk] = boundUTM(vs[0])
		}
	}
	return path, utm
}

func extractOrigin(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		// Not a full URL — do not store raw string (may contain secrets).
		return ""
	}
	// Origin only: scheme + host (no userinfo, path, query).
	scheme := strings.ToLower(u.Scheme)
	if scheme != "http" && scheme != "https" {
		return ""
	}
	host := strings.ToLower(u.Hostname())
	if host == "" {
		return ""
	}
	origin := scheme + "://" + host
	if u.Port() != "" && u.Port() != "80" && u.Port() != "443" {
		origin += ":" + u.Port()
	}
	return boundOrigin(origin)
}

// ClassifyChannel maps UTM/referrer to a closed channel enum.
// Last-non-direct: non-empty UTM or external referrer is non-direct.
func ClassifyChannel(utmSource, utmMedium, utmCampaign, referrerOrigin string) (channel string, isDirect bool) {
	src := strings.ToLower(strings.TrimSpace(utmSource))
	med := strings.ToLower(strings.TrimSpace(utmMedium))
	camp := strings.ToLower(strings.TrimSpace(utmCampaign))
	ref := strings.ToLower(strings.TrimSpace(referrerOrigin))

	if src != "" || med != "" || camp != "" {
		switch {
		case med == "cpc" || med == "ppc" || med == "paid" || med == "paidsearch" || strings.Contains(med, "paid"):
			return ChannelPaid, false
		case med == "email" || src == "email" || med == "newsletter":
			return ChannelEmail, false
		case med == "social" || src == "facebook" || src == "instagram" || src == "twitter" ||
			src == "tiktok" || src == "linkedin" || src == "youtube" || med == "social-network":
			return ChannelSocial, false
		case med == "organic" || med == "seo":
			return ChannelOrganic, false
		default:
			return ChannelUTM, false
		}
	}
	if ref != "" {
		// Search engines → organic
		if strings.Contains(ref, "google.") || strings.Contains(ref, "bing.") ||
			strings.Contains(ref, "yahoo.") || strings.Contains(ref, "duckduckgo.") {
			return ChannelOrganic, false
		}
		if strings.Contains(ref, "facebook.") || strings.Contains(ref, "instagram.") ||
			strings.Contains(ref, "twitter.") || strings.Contains(ref, "t.co") ||
			strings.Contains(ref, "tiktok.") || strings.Contains(ref, "linkedin.") {
			return ChannelSocial, false
		}
		return ChannelReferral, false
	}
	return ChannelDirect, true
}

// IsBotUserAgent is a minimal launch bot filter (policy bot_filter_enabled).
func IsBotUserAgent(ua string) bool {
	ua = strings.ToLower(strings.TrimSpace(ua))
	if ua == "" {
		return false
	}
	bots := []string{
		"bot", "spider", "crawler", "slurp", "facebookexternalhit",
		"preview", "headless", "phantom", "selenium", "curl/", "wget/",
		"python-requests", "go-http-client", "httpclient", "scrapy",
	}
	for _, b := range bots {
		if strings.Contains(ua, b) {
			return true
		}
	}
	return false
}

// SelectLastNonDirect picks the most recent non-direct event within window.
// Deterministic tie-breaker: max(occurred_at), then max(id).
// events must be sorted by occurred_at DESC, id DESC (or any order; we scan).
func SelectLastNonDirect(events []Event, checkoutAt time.Time, windowDays int) *Event {
	if windowDays <= 0 {
		windowDays = LastNonDirectWindowDays
	}
	cutoff := checkoutAt.AddDate(0, 0, -windowDays)
	var best *Event
	for i := range events {
		e := &events[i]
		if e.IsBot || e.IsDirect {
			continue
		}
		if e.OccurredAt.After(checkoutAt) {
			continue
		}
		if e.OccurredAt.Before(cutoff) {
			continue
		}
		if best == nil {
			best = e
			continue
		}
		if e.OccurredAt.After(best.OccurredAt) {
			best = e
			continue
		}
		if e.OccurredAt.Equal(best.OccurredAt) && e.ID > best.ID {
			best = e
		}
	}
	return best
}

// EscapeCSVCell formula-escapes leading = + - @ and control chars for safe CSV.
func EscapeCSVCell(s string) string {
	if s == "" {
		return s
	}
	// Strip CR/LF/tab
	s = strings.Map(func(r rune) rune {
		if r == '\n' || r == '\r' || r == '\t' {
			return ' '
		}
		if r < 32 || !unicode.IsPrint(r) && r != ' ' {
			return -1
		}
		return r
	}, s)
	if len(s) == 0 {
		return s
	}
	switch s[0] {
	case '=', '+', '-', '@', '\t', '\r':
		return "'" + s
	}
	// Also escape if starts with unicode formula-like
	if strings.HasPrefix(s, "\u0009") || strings.HasPrefix(s, "\u000D") {
		return "'" + s
	}
	return s
}

// ValidChannel reports closed channel enum (including all).
func ValidChannel(ch string) bool {
	switch ch {
	case ChannelAll, ChannelDirect, ChannelOrganic, ChannelReferral,
		ChannelUTM, ChannelSocial, ChannelEmail, ChannelPaid, ChannelOther:
		return true
	default:
		return false
	}
}

// ValidTimezone allows launch reporting TZs only.
func ValidTimezone(tz string) bool {
	switch tz {
	case "", DefaultTimezone, "UTC", "Asia/Makassar", "Asia/Jayapura":
		return true
	default:
		return false
	}
}

func boundPath(p string) string {
	p = strings.TrimSpace(p)
	if p == "" {
		return "/"
	}
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	// Drop any residual query/fragment
	if i := strings.IndexAny(p, "?#"); i >= 0 {
		p = p[:i]
	}
	if len(p) > maxPathLen {
		p = p[:maxPathLen]
	}
	return p
}

func boundOrigin(o string) string {
	o = strings.TrimSpace(o)
	if len(o) > maxOriginLen {
		o = o[:maxOriginLen]
	}
	return o
}

func boundUTM(s string) string {
	s = strings.TrimSpace(s)
	// Reject if looks like email or token-ish
	if strings.Contains(s, "@") {
		return ""
	}
	if len(s) > maxUTMLen {
		s = s[:maxUTMLen]
	}
	// No control chars
	s = strings.Map(func(r rune) rune {
		if r < 32 {
			return -1
		}
		return r
	}, s)
	return s
}

func firstNonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}
