package catalog

import (
	"encoding/json"
	"regexp"
	"strings"
	"unicode/utf8"
)

const (
	// MinimumPaymentIDR is the launch minimum for a priced product (fee policy floor).
	MinimumPaymentIDR int64 = 1000
	// MaximumPaymentIDR is the launch maximum payment amount.
	MaximumPaymentIDR int64 = 100_000_000
	TitleMaxLen             = 200
	ShortMaxLen             = 280
	DescriptionMaxLen       = 20_000
	SlugMaxLen              = 80
	VersionMaxLen           = 64
	BadgeMaxLen             = 64
	PaletteMaxLen           = 64
	GlyphMaxLen             = 16
	IncludesMaxItems        = 32
	IncludeItemMaxLen       = 200
)

var productSlugShape = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)
var multiHyphen = regexp.MustCompile(`-+`)

// NormalizeProductSlug lowercases and maps invalid runes to hyphens.
func NormalizeProductSlug(raw string) string {
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
		case r == '-' || r == '_' || r == ' ':
			b.WriteByte('-')
		default:
			if r > 127 {
				continue
			}
			b.WriteByte('-')
		}
	}
	out := multiHyphen.ReplaceAllString(b.String(), "-")
	return strings.Trim(out, "-")
}

// ValidateProductSlug checks shape/length after normalize.
func ValidateProductSlug(slug string) error {
	if slug == "" || len(slug) > SlugMaxLen {
		return ErrSlugInvalid
	}
	if !productSlugShape.MatchString(slug) {
		return ErrSlugInvalid
	}
	return nil
}

// NormalizeProductType accepts FE lowercase or docs uppercase.
func NormalizeProductType(raw string) (ProductType, error) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "download":
		return TypeDownload, nil
	case "link":
		return TypeLink, nil
	case "code":
		return TypeCode, nil
	default:
		return "", ErrTypeInvalid
	}
}

// NormalizeProductStatus accepts lowercase or uppercase lifecycle values.
func NormalizeProductStatus(raw string) (ProductStatus, error) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "draft":
		return StatusDraft, nil
	case "published":
		return StatusPublished, nil
	case "archived":
		return StatusArchived, nil
	default:
		return "", ErrStatusInvalid
	}
}

// ValidatePriceIDR rejects floats (caller must parse int), negatives, and out-of-range.
// Zero is allowed only when allowPWYT is true (pay-what-you-want base).
func ValidatePriceIDR(price int64, allowPWYT bool) error {
	if price < 0 {
		return ErrPriceInvalid
	}
	if price > MaximumPaymentIDR {
		return ErrPriceInvalid
	}
	if price == 0 {
		if !allowPWYT {
			return ErrPriceInvalid
		}
		return nil
	}
	if price < MinimumPaymentIDR {
		return ErrPriceInvalid
	}
	return nil
}

// ValidateMinimumPriceIDR validates optional PWYT floor.
func ValidateMinimumPriceIDR(min *int64, price int64, allowPWYT bool) error {
	if min == nil {
		return nil
	}
	if *min < 0 || *min > MaximumPaymentIDR {
		return ErrPriceInvalid
	}
	if allowPWYT && *min > 0 && *min < MinimumPaymentIDR {
		return ErrPriceInvalid
	}
	if !allowPWYT && *min > price {
		return ErrPriceInvalid
	}
	return nil
}

// ValidateProductFields validates mutable product content (not status transitions).
func ValidateProductFields(
	title, short, description, version, badge, palette, glyph string,
	includes []string,
	price int64,
	allowPWYT bool,
	minPrice *int64,
	typ ProductType,
) error {
	title = strings.TrimSpace(title)
	if title == "" || utf8.RuneCountInString(title) > TitleMaxLen {
		return ErrTitleInvalid
	}
	if utf8.RuneCountInString(short) > ShortMaxLen {
		return ErrFieldTooLong
	}
	if utf8.RuneCountInString(description) > DescriptionMaxLen {
		return ErrFieldTooLong
	}
	if version != "" && utf8.RuneCountInString(version) > VersionMaxLen {
		return ErrFieldTooLong
	}
	if utf8.RuneCountInString(badge) > BadgeMaxLen ||
		utf8.RuneCountInString(palette) > PaletteMaxLen ||
		utf8.RuneCountInString(glyph) > GlyphMaxLen {
		return ErrFieldTooLong
	}
	if len(includes) > IncludesMaxItems {
		return ErrFieldTooLong
	}
	for _, item := range includes {
		if utf8.RuneCountInString(item) > IncludeItemMaxLen {
			return ErrFieldTooLong
		}
	}
	switch typ {
	case TypeDownload, TypeLink, TypeCode:
	default:
		return ErrTypeInvalid
	}
	if err := ValidatePriceIDR(price, allowPWYT); err != nil {
		return err
	}
	return ValidateMinimumPriceIDR(minPrice, price, allowPWYT)
}

// CanPublish reports whether a product may transition to published.
func CanPublish(p *Product) error {
	if p == nil {
		return ErrNotFound
	}
	if p.Status == StatusArchived {
		return ErrCannotPublish
	}
	if err := ValidateProductFields(
		p.Title, p.Short, p.Description, p.Version, p.Badge, p.Palette, p.Glyph,
		p.Includes, p.PriceIDR, p.AllowPWYT, p.MinimumPriceIDR, p.Type,
	); err != nil {
		return err
	}
	if err := ValidateProductSlug(p.Slug); err != nil {
		return err
	}
	return nil
}

// CanArchive reports whether a product may be archived.
func CanArchive(p *Product) error {
	if p == nil {
		return ErrNotFound
	}
	if p.Status == StatusArchived {
		return nil // idempotent
	}
	return nil
}

// ValidateStorefrontConfig ensures config is a JSON object (not array/null/string).
func ValidateStorefrontConfig(raw json.RawMessage) error {
	if len(raw) == 0 {
		return ErrConfigInvalid
	}
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" {
		return ErrConfigInvalid
	}
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		return ErrConfigInvalid
	}
	obj, ok := v.(map[string]any)
	if !ok {
		return ErrConfigInvalid
	}
	// Bound size roughly via marshaled length (already limited by HTTP body).
	if len(raw) > 256*1024 {
		return ErrConfigInvalid
	}
	_ = obj
	return nil
}

// DefaultStorefrontConfig returns a FE-compatible empty public storefront config shell.
func DefaultStorefrontConfig() json.RawMessage {
	return json.RawMessage(`{
  "preset":"atelier",
  "layout":"grid",
  "font":"editorial",
  "hero":"statement",
  "cards":"soft",
  "texture":"noise",
  "radius":"soft",
  "headerAlign":"left",
  "accent":"",
  "ink":"",
  "canvas":"",
  "tagline":"",
  "announcement":"",
  "featuredProductIds":[],
  "sections":["products","about"],
  "socials":{},
  "trustBadges":[]
}`)
}
