package application

import (
	"context"
	"encoding/json"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/catalog"
)

// CatalogStore is the persistence port for BE-210 catalog/storefront.
type CatalogStore interface {
	WithTx(ctx context.Context, fn func(ctx context.Context) error) error

	// Store / merchant access
	GetStoreByID(ctx context.Context, storeID string) (CatalogStoreRow, error)
	GetStoreBySlug(ctx context.Context, slug string) (CatalogStoreRow, error)
	UserCanAccessStore(ctx context.Context, userID, storeID string) (bool, error)
	UserIsPlatformAdmin(ctx context.Context, userID string) (bool, error)
	UpdateStorePublishedRevision(ctx context.Context, storeID string, publishedRevision int64, publishedRevisionID *string, storefrontRevision int64, updatedAt time.Time) error

	// Products
	InsertProduct(ctx context.Context, p catalog.Product) error
	UpdateProduct(ctx context.Context, p catalog.Product) error
	GetProductByID(ctx context.Context, storeID, productID string) (catalog.Product, error)
	GetProductBySlug(ctx context.Context, storeID, slug string) (catalog.Product, error)
	ListProductsByStore(ctx context.Context, storeID string, includeAll bool) ([]catalog.Product, error)
	ListPublishedProductsByStore(ctx context.Context, storeID string) ([]catalog.Product, error)
	ListFeaturedProducts(ctx context.Context, limit int32) ([]catalog.Product, error)
	GetPublishedProductByIDOrSlug(ctx context.Context, idOrSlug string) (catalog.Product, error)
	GetPublishedProductByStoreAndSlug(ctx context.Context, storeSlug, productSlug string) (catalog.Product, error)
	ProductSlugExists(ctx context.Context, storeID, slug string, excludeID string) (bool, error)

	// Storefront revisions
	GetLatestDraftRevision(ctx context.Context, storeID string) (catalog.StorefrontRevision, error)
	GetPublishedRevision(ctx context.Context, storeID string) (catalog.StorefrontRevision, error)
	GetRevisionByNumber(ctx context.Context, storeID string, revision int32) (catalog.StorefrontRevision, error)
	InsertRevision(ctx context.Context, rev catalog.StorefrontRevision) error
	UpdateRevisionDraft(ctx context.Context, rev catalog.StorefrontRevision) error
	MarkRevisionPublished(ctx context.Context, id string, publishedAt time.Time) error
	NextRevisionNumber(ctx context.Context, storeID string) (int32, error)

	IsNotFound(err error) bool
	IsUniqueViolation(err error) bool
}

// CatalogStoreRow is the store slice needed by catalog (avoids circular domain deps).
type CatalogStoreRow struct {
	ID                  string
	MerchantID          string
	Slug                string
	Name                string
	Bio                 string
	Address             string
	AccentColor         string
	Status              string
	IsCanonical         bool
	StorefrontRevision  int64
	PublishedRevision   int64
	PublishedRevisionID *string
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

// CatalogConfigJSON is a helper for empty config.
func CatalogConfigJSON(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 {
		return catalog.DefaultStorefrontConfig()
	}
	return raw
}
