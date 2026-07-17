package stores

import (
	"regexp"
	"strings"
	"unicode"
)

const (
	SlugMinLen = 3
	SlugMaxLen = 63
)

// ReservedSlugs cannot be claimed as storefront addresses.
var ReservedSlugs = map[string]struct{}{
	"admin": {}, "api": {}, "www": {}, "fersaku": {}, "app": {},
	"dashboard": {}, "seller": {}, "buyer": {}, "support": {}, "help": {},
	"static": {}, "assets": {}, "null": {}, "undefined": {}, "me": {},
	"status": {}, "health": {}, "v1": {}, "login": {}, "register": {},
	"onboarding": {}, "stores": {}, "store": {}, "public": {},
}

var multiHyphen = regexp.MustCompile(`-+`)
var slugShape = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// NormalizeSlug lowercases, maps invalid runes to '-', collapses hyphens,
// and trims leading/trailing hyphens. Empty after normalize is returned as "".
func NormalizeSlug(raw string) string {
	s := strings.ToLower(strings.TrimSpace(raw))
	if s == "" {
		return ""
	}
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == '-' || r == '_' || r == ' ' || unicode.IsSpace(r):
			b.WriteByte('-')
		default:
			// drop other punctuation/unicode; FE also strips non [a-z0-9-]
			if r > 127 {
				continue
			}
			b.WriteByte('-')
		}
	}
	out := multiHyphen.ReplaceAllString(b.String(), "-")
	out = strings.Trim(out, "-")
	return out
}

// ValidateNormalizedSlug checks length, shape, and reserved list.
// Input must already be NormalizeSlug output.
func ValidateNormalizedSlug(slug string) error {
	if slug == "" {
		return ErrSlugInvalid
	}
	if len(slug) < SlugMinLen || len(slug) > SlugMaxLen {
		return ErrSlugInvalid
	}
	if !slugShape.MatchString(slug) {
		return ErrSlugInvalid
	}
	if _, reserved := ReservedSlugs[slug]; reserved {
		return ErrSlugReserved
	}
	return nil
}

// NormalizeAndValidateSlug is the single entry for reservation checks.
func NormalizeAndValidateSlug(raw string) (string, error) {
	slug := NormalizeSlug(raw)
	if err := ValidateNormalizedSlug(slug); err != nil {
		return slug, err
	}
	return slug, nil
}
