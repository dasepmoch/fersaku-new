package catalog

import (
	"encoding/json"
	"time"
)

// ProductType matches frontend CatalogProduct.type (lowercase).
type ProductType string

const (
	TypeDownload ProductType = "download"
	TypeLink     ProductType = "link"
	TypeCode     ProductType = "code"
)

// ProductStatus is product lifecycle (lowercase API contract).
type ProductStatus string

const (
	StatusDraft     ProductStatus = "draft"
	StatusPublished ProductStatus = "published"
	StatusArchived  ProductStatus = "archived"
)

// RevisionStatus is storefront revision lifecycle.
type RevisionStatus string

const (
	RevisionDraft     RevisionStatus = "draft"
	RevisionPublished RevisionStatus = "published"
)

// Product is the catalog aggregate (seller + public projections).
type Product struct {
	ID               string
	StoreID          string
	MerchantID       string
	Slug             string
	Title            string
	Short            string
	Description      string
	PriceIDR         int64
	Type             ProductType
	Status           ProductStatus
	Version          string
	Badge            string
	Palette          string
	Glyph            string
	Includes         []string
	AllowPWYT        bool
	MinimumPriceIDR  *int64
	PublishedAt      *time.Time
	CreatedAt        time.Time
	UpdatedAt        time.Time
	// Sales is a projection stub until orders (always 0 in BE-210).
	Sales int64
}

// StorefrontRevision is an optimistic draft/published storefront config snapshot.
type StorefrontRevision struct {
	ID          string
	StoreID     string
	Revision    int32
	Status      RevisionStatus
	ETag        string
	Config      json.RawMessage
	PublishedAt *time.Time
	CreatedBy   *string
	CreatedAt   time.Time
}

// PublicStorefront is the GET /v1/public/stores/{slug} projection (CatalogProduct-compatible products).
type PublicStorefront struct {
	Slug               string
	Name               string
	Monogram           string
	Bio                string
	Tagline            string
	Verified           bool
	Accent             string
	Ink                string
	Canvas             string
	Preset             string
	Layout             string
	Font               string
	Hero               string
	Cards              string
	Texture            string
	Radius             string
	HeaderAlign        string
	Announcement       string
	FeaturedProductIDs []string
	Sections           []string
	Socials            map[string]string
	TrustBadges        []string
	Rating             float64
	ReviewCount        int64
	Products           []Product
	Revision           int32
	ETag               string
}
