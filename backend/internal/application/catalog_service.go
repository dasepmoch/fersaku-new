package application

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/authz"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/catalog"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// CatalogService implements product CRUD/publish and storefront revisions (BE-210).
type CatalogService struct {
	Store CatalogStore
	IDs   ports.IDGenerator
	Clock ports.Clock
	Log   ports.Logger
}

func (s *CatalogService) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now().UTC()
	}
	return time.Now().UTC()
}

// --- authorization helpers ---

func (s *CatalogService) requireStoreAccess(ctx context.Context, userID, storeID string, write bool) (CatalogStoreRow, error) {
	if userID == "" {
		return CatalogStoreRow{}, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required")
	}
	if storeID == "" {
		return CatalogStoreRow{}, catalog.ErrNotFound
	}
	st, err := s.Store.GetStoreByID(ctx, storeID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return CatalogStoreRow{}, catalog.ErrNotFound
		}
		return CatalogStoreRow{}, apperr.Internal(apperr.CodeInternalError, "Store lookup failed")
	}
	admin, err := s.Store.UserIsPlatformAdmin(ctx, userID)
	if err != nil {
		return CatalogStoreRow{}, apperr.Internal(apperr.CodeInternalError, "Authorization check failed")
	}
	if admin {
		return st, nil
	}
	ok, err := s.Store.UserCanAccessStore(ctx, userID, storeID)
	if err != nil {
		return CatalogStoreRow{}, apperr.Internal(apperr.CodeInternalError, "Authorization check failed")
	}
	if !ok {
		// Cross-tenant: not found (no existence leak).
		return CatalogStoreRow{}, catalog.ErrNotFound
	}
	// Seller membership is enough; write vs read both allowed for active members with seller perms
	// (permission middleware also enforces seller.store.read/write).
	_ = write
	return st, nil
}

// --- product inputs ---

// CreateProductInput is POST /v1/stores/{storeId}/products.
type CreateProductInput struct {
	Slug         string
	Title        string
	Short        string
	Description  string
	Price        int64 // whole IDR
	Type         string
	Badge        string
	Palette      string
	Glyph        string
	Includes     []string
	AllowPWYT    bool
	MinimumPrice *int64
	Version      string
}

// PatchProductInput is PATCH product (partial).
type PatchProductInput struct {
	Slug         *string
	Title        *string
	Short        *string
	Description  *string
	Price        *int64
	Type         *string
	Badge        *string
	Palette      *string
	Glyph        *string
	Includes     *[]string
	AllowPWYT    *bool
	MinimumPrice *int64
	ClearMin     bool // when true, clear minimum_price_idr
	Version      *string
}

// ListProducts returns seller-visible products for a store.
func (s *CatalogService) ListProducts(ctx context.Context, userID, storeID string) ([]catalog.Product, error) {
	if _, err := s.requireStoreAccess(ctx, userID, storeID, false); err != nil {
		return nil, err
	}
	items, err := s.Store.ListProductsByStore(ctx, storeID, true)
	if err != nil {
		return nil, apperr.Internal(apperr.CodeInternalError, "List products failed")
	}
	return items, nil
}

// GetProduct returns a product for seller.
func (s *CatalogService) GetProduct(ctx context.Context, userID, storeID, productID string) (catalog.Product, error) {
	if _, err := s.requireStoreAccess(ctx, userID, storeID, false); err != nil {
		return catalog.Product{}, err
	}
	p, err := s.Store.GetProductByID(ctx, storeID, productID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return catalog.Product{}, catalog.ErrNotFound
		}
		return catalog.Product{}, apperr.Internal(apperr.CodeInternalError, "Product lookup failed")
	}
	return p, nil
}

// CreateProduct creates a draft product.
func (s *CatalogService) CreateProduct(ctx context.Context, userID, storeID string, in CreateProductInput) (catalog.Product, error) {
	st, err := s.requireStoreAccess(ctx, userID, storeID, true)
	if err != nil {
		return catalog.Product{}, err
	}
	typ, err := catalog.NormalizeProductType(in.Type)
	if err != nil {
		return catalog.Product{}, err
	}
	slug := catalog.NormalizeProductSlug(in.Slug)
	if slug == "" {
		slug = catalog.NormalizeProductSlug(in.Title)
	}
	if err := catalog.ValidateProductSlug(slug); err != nil {
		return catalog.Product{}, err
	}
	title := strings.TrimSpace(in.Title)
	includes := in.Includes
	if includes == nil {
		includes = []string{}
	}
	version := strings.TrimSpace(in.Version)
	if version == "" {
		version = "1.0.0"
	}
	if err := catalog.ValidateProductFields(
		title, in.Short, in.Description, version, in.Badge, in.Palette, in.Glyph,
		includes, in.Price, in.AllowPWYT, in.MinimumPrice, typ,
	); err != nil {
		return catalog.Product{}, err
	}
	exists, err := s.Store.ProductSlugExists(ctx, storeID, slug, "")
	if err != nil {
		return catalog.Product{}, apperr.Internal(apperr.CodeInternalError, "Slug check failed")
	}
	if exists {
		return catalog.Product{}, catalog.ErrSlugConflict
	}

	now := s.now()
	p := catalog.Product{
		ID:              s.IDs.New(),
		StoreID:         st.ID,
		MerchantID:      st.MerchantID,
		Slug:            slug,
		Title:           title,
		Short:           strings.TrimSpace(in.Short),
		Description:     strings.TrimSpace(in.Description),
		PriceIDR:        in.Price,
		Type:            typ,
		Status:          catalog.StatusDraft,
		Version:         version,
		Badge:           strings.TrimSpace(in.Badge),
		Palette:         strings.TrimSpace(in.Palette),
		Glyph:           strings.TrimSpace(in.Glyph),
		Includes:        includes,
		AllowPWYT:       in.AllowPWYT,
		MinimumPriceIDR: in.MinimumPrice,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	if err := s.Store.InsertProduct(ctx, p); err != nil {
		if s.Store.IsUniqueViolation(err) {
			return catalog.Product{}, catalog.ErrSlugConflict
		}
		return catalog.Product{}, apperr.Internal(apperr.CodeInternalError, "Create product failed")
	}
	return p, nil
}

// PatchProduct updates mutable fields; does not change status (use publish/archive).
func (s *CatalogService) PatchProduct(ctx context.Context, userID, storeID, productID string, in PatchProductInput) (catalog.Product, error) {
	if _, err := s.requireStoreAccess(ctx, userID, storeID, true); err != nil {
		return catalog.Product{}, err
	}
	p, err := s.Store.GetProductByID(ctx, storeID, productID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return catalog.Product{}, catalog.ErrNotFound
		}
		return catalog.Product{}, apperr.Internal(apperr.CodeInternalError, "Product lookup failed")
	}
	if p.Status == catalog.StatusArchived {
		return catalog.Product{}, apperr.Validation(apperr.CodeValidationFailed, "Archived products cannot be edited")
	}

	if in.Slug != nil {
		slug := catalog.NormalizeProductSlug(*in.Slug)
		if err := catalog.ValidateProductSlug(slug); err != nil {
			return catalog.Product{}, err
		}
		if slug != p.Slug {
			exists, err := s.Store.ProductSlugExists(ctx, storeID, slug, p.ID)
			if err != nil {
				return catalog.Product{}, apperr.Internal(apperr.CodeInternalError, "Slug check failed")
			}
			if exists {
				return catalog.Product{}, catalog.ErrSlugConflict
			}
			p.Slug = slug
		}
	}
	if in.Title != nil {
		p.Title = strings.TrimSpace(*in.Title)
	}
	if in.Short != nil {
		p.Short = strings.TrimSpace(*in.Short)
	}
	if in.Description != nil {
		p.Description = strings.TrimSpace(*in.Description)
	}
	if in.Price != nil {
		p.PriceIDR = *in.Price
	}
	if in.Type != nil {
		typ, err := catalog.NormalizeProductType(*in.Type)
		if err != nil {
			return catalog.Product{}, err
		}
		p.Type = typ
	}
	if in.Badge != nil {
		p.Badge = strings.TrimSpace(*in.Badge)
	}
	if in.Palette != nil {
		p.Palette = strings.TrimSpace(*in.Palette)
	}
	if in.Glyph != nil {
		p.Glyph = strings.TrimSpace(*in.Glyph)
	}
	if in.Includes != nil {
		p.Includes = *in.Includes
	}
	if in.AllowPWYT != nil {
		p.AllowPWYT = *in.AllowPWYT
	}
	if in.ClearMin {
		p.MinimumPriceIDR = nil
	} else if in.MinimumPrice != nil {
		p.MinimumPriceIDR = in.MinimumPrice
	}
	if in.Version != nil {
		v := strings.TrimSpace(*in.Version)
		if v != "" {
			p.Version = v
		}
	}

	if err := catalog.ValidateProductFields(
		p.Title, p.Short, p.Description, p.Version, p.Badge, p.Palette, p.Glyph,
		p.Includes, p.PriceIDR, p.AllowPWYT, p.MinimumPriceIDR, p.Type,
	); err != nil {
		return catalog.Product{}, err
	}
	p.UpdatedAt = s.now()
	if err := s.Store.UpdateProduct(ctx, p); err != nil {
		if s.Store.IsUniqueViolation(err) {
			return catalog.Product{}, catalog.ErrSlugConflict
		}
		return catalog.Product{}, apperr.Internal(apperr.CodeInternalError, "Update product failed")
	}
	return p, nil
}

// PublishProduct transitions draft → published.
func (s *CatalogService) PublishProduct(ctx context.Context, userID, storeID, productID string) (catalog.Product, error) {
	if _, err := s.requireStoreAccess(ctx, userID, storeID, true); err != nil {
		return catalog.Product{}, err
	}
	p, err := s.Store.GetProductByID(ctx, storeID, productID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return catalog.Product{}, catalog.ErrNotFound
		}
		return catalog.Product{}, apperr.Internal(apperr.CodeInternalError, "Product lookup failed")
	}
	if err := catalog.CanPublish(&p); err != nil {
		return catalog.Product{}, err
	}
	if p.Status == catalog.StatusPublished {
		return p, nil // idempotent
	}
	now := s.now()
	p.Status = catalog.StatusPublished
	p.PublishedAt = &now
	p.UpdatedAt = now
	if err := s.Store.UpdateProduct(ctx, p); err != nil {
		return catalog.Product{}, apperr.Internal(apperr.CodeInternalError, "Publish product failed")
	}
	return p, nil
}

// ArchiveProduct transitions to archived.
func (s *CatalogService) ArchiveProduct(ctx context.Context, userID, storeID, productID string) (catalog.Product, error) {
	if _, err := s.requireStoreAccess(ctx, userID, storeID, true); err != nil {
		return catalog.Product{}, err
	}
	p, err := s.Store.GetProductByID(ctx, storeID, productID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return catalog.Product{}, catalog.ErrNotFound
		}
		return catalog.Product{}, apperr.Internal(apperr.CodeInternalError, "Product lookup failed")
	}
	if p.Status == catalog.StatusArchived {
		return p, nil
	}
	now := s.now()
	p.Status = catalog.StatusArchived
	p.UpdatedAt = now
	if err := s.Store.UpdateProduct(ctx, p); err != nil {
		return catalog.Product{}, apperr.Internal(apperr.CodeInternalError, "Archive product failed")
	}
	return p, nil
}

// --- public catalog ---

// GetPublicStorefront returns published storefront + published products for a store slug.
func (s *CatalogService) GetPublicStorefront(ctx context.Context, slug string) (catalog.PublicStorefront, error) {
	slug = strings.ToLower(strings.TrimSpace(slug))
	if slug == "" {
		return catalog.PublicStorefront{}, catalog.ErrNotFound
	}
	st, err := s.Store.GetStoreBySlug(ctx, slug)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return catalog.PublicStorefront{}, catalog.ErrNotFound
		}
		return catalog.PublicStorefront{}, apperr.Internal(apperr.CodeInternalError, "Store lookup failed")
	}
	if st.Status == string(authz.StoreArchived) || st.Status == string(authz.StoreSuspended) {
		return catalog.PublicStorefront{}, catalog.ErrNotFound
	}
	products, err := s.Store.ListPublishedProductsByStore(ctx, st.ID)
	if err != nil {
		return catalog.PublicStorefront{}, apperr.Internal(apperr.CodeInternalError, "List products failed")
	}
	for i := range products {
		products[i].StoreSlug = st.Slug
	}
	out := catalog.PublicStorefront{
		Slug:               st.Slug,
		Name:               st.Name,
		Monogram:           monogram(st.Name),
		Bio:                st.Bio,
		Tagline:            "",
		Verified:           false,
		Accent:             st.AccentColor,
		Ink:                "",
		Canvas:             "",
		Preset:             "atelier",
		Layout:             "grid",
		Font:               "editorial",
		Hero:               "statement",
		Cards:              "soft",
		Texture:            "noise",
		Radius:             "soft",
		HeaderAlign:        "left",
		FeaturedProductIDs: []string{},
		Sections:           []string{"products", "about"},
		Socials:            map[string]string{},
		TrustBadges:        []string{},
		Rating:             0,
		ReviewCount:        0,
		Products:           products,
	}
	rev, err := s.Store.GetPublishedRevision(ctx, st.ID)
	if err == nil {
		out.Revision = rev.Revision
		out.ETag = rev.ETag
		mergeConfigIntoPublic(&out, rev.Config)
	} else if !s.Store.IsNotFound(err) {
		return catalog.PublicStorefront{}, apperr.Internal(apperr.CodeInternalError, "Storefront lookup failed")
	}
	return out, nil
}

// ListFeaturedProducts returns recently published products across stores.
func (s *CatalogService) ListFeaturedProducts(ctx context.Context, limit int) ([]catalog.Product, error) {
	if limit <= 0 {
		limit = 6
	}
	if limit > 50 {
		limit = 50
	}
	items, err := s.Store.ListFeaturedProducts(ctx, int32(limit))
	if err != nil {
		return nil, apperr.Internal(apperr.CodeInternalError, "List featured failed")
	}
	return items, nil
}

// GetPublicProduct returns a published product by id or slug (global slug match first product).
// Prefer GetPublicProductForStore when the store slug is known (same product slug across stores).
func (s *CatalogService) GetPublicProduct(ctx context.Context, idOrSlug string) (catalog.Product, error) {
	idOrSlug = strings.TrimSpace(idOrSlug)
	if idOrSlug == "" {
		return catalog.Product{}, catalog.ErrNotFound
	}
	p, err := s.Store.GetPublishedProductByIDOrSlug(ctx, idOrSlug)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return catalog.Product{}, catalog.ErrNotFound
		}
		return catalog.Product{}, apperr.Internal(apperr.CodeInternalError, "Product lookup failed")
	}
	return p, nil
}

// GetPublicProductForStore returns a published product bound to an ACTIVE store slug.
func (s *CatalogService) GetPublicProductForStore(ctx context.Context, storeSlug, productSlug string) (catalog.Product, error) {
	storeSlug = strings.ToLower(strings.TrimSpace(storeSlug))
	productSlug = strings.TrimSpace(productSlug)
	if storeSlug == "" || productSlug == "" {
		return catalog.Product{}, catalog.ErrNotFound
	}
	p, err := s.Store.GetPublishedProductByStoreAndSlug(ctx, storeSlug, productSlug)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return catalog.Product{}, catalog.ErrNotFound
		}
		return catalog.Product{}, apperr.Internal(apperr.CodeInternalError, "Product lookup failed")
	}
	return p, nil
}

// --- storefront studio ---

// GetStorefrontDraft returns the latest draft revision (creates empty draft if none).
func (s *CatalogService) GetStorefrontDraft(ctx context.Context, userID, storeID string) (catalog.StorefrontRevision, error) {
	st, err := s.requireStoreAccess(ctx, userID, storeID, false)
	if err != nil {
		return catalog.StorefrontRevision{}, err
	}
	rev, err := s.Store.GetLatestDraftRevision(ctx, storeID)
	if err == nil {
		return rev, nil
	}
	if !s.Store.IsNotFound(err) {
		return catalog.StorefrontRevision{}, apperr.Internal(apperr.CodeInternalError, "Draft lookup failed")
	}
	// Bootstrap draft from published config or default.
	cfg := catalog.DefaultStorefrontConfig()
	if pub, perr := s.Store.GetPublishedRevision(ctx, storeID); perr == nil {
		cfg = CatalogConfigJSON(pub.Config)
	}
	now := s.now()
	next, err := s.Store.NextRevisionNumber(ctx, storeID)
	if err != nil {
		return catalog.StorefrontRevision{}, apperr.Internal(apperr.CodeInternalError, "Revision allocate failed")
	}
	if next < 1 {
		next = 1
	}
	// Prefer store.storefront_revision + 1 when higher.
	if int64(next) <= st.StorefrontRevision {
		next = int32(st.StorefrontRevision) + 1
	}
	etag := computeETag(cfg, next)
	createdBy := userID
	rev = catalog.StorefrontRevision{
		ID:        s.IDs.New(),
		StoreID:   storeID,
		Revision:  next,
		Status:    catalog.RevisionDraft,
		ETag:      etag,
		Config:    cfg,
		CreatedBy: &createdBy,
		CreatedAt: now,
	}
	if err := s.Store.InsertRevision(ctx, rev); err != nil {
		return catalog.StorefrontRevision{}, apperr.Internal(apperr.CodeInternalError, "Create draft failed")
	}
	_ = s.Store.UpdateStorePublishedRevision(ctx, storeID, st.PublishedRevision, st.PublishedRevisionID, int64(next), now)
	return rev, nil
}

// PutStorefrontDraft replaces draft config; bumps revision and etag.
type PutStorefrontDraftInput struct {
	Config           json.RawMessage
	ExpectedRevision *int32
	ExpectedETag     string
}

// PutStorefrontDraft updates the draft with optional optimistic concurrency.
func (s *CatalogService) PutStorefrontDraft(ctx context.Context, userID, storeID string, in PutStorefrontDraftInput) (catalog.StorefrontRevision, error) {
	st, err := s.requireStoreAccess(ctx, userID, storeID, true)
	if err != nil {
		return catalog.StorefrontRevision{}, err
	}
	if err := catalog.ValidateStorefrontConfig(in.Config); err != nil {
		return catalog.StorefrontRevision{}, err
	}
	rev, err := s.Store.GetLatestDraftRevision(ctx, storeID)
	if err != nil {
		if !s.Store.IsNotFound(err) {
			return catalog.StorefrontRevision{}, apperr.Internal(apperr.CodeInternalError, "Draft lookup failed")
		}
		// Create first draft.
		return s.createDraftWithConfig(ctx, userID, st, in.Config)
	}
	if in.ExpectedRevision != nil && *in.ExpectedRevision != rev.Revision {
		return catalog.StorefrontRevision{}, catalog.ErrRevisionConflict.WithDetails(map[string]any{
			"expectedRevision": *in.ExpectedRevision,
			"currentRevision":  rev.Revision,
			"currentETag":      rev.ETag,
		})
	}
	if in.ExpectedETag != "" && in.ExpectedETag != rev.ETag {
		return catalog.StorefrontRevision{}, catalog.ErrRevisionConflict.WithDetails(map[string]any{
			"expectedETag":    in.ExpectedETag,
			"currentRevision": rev.Revision,
			"currentETag":     rev.ETag,
		})
	}
	// Keep same revision number for draft overwrite; refresh etag from content.
	rev.Config = append(json.RawMessage(nil), in.Config...)
	rev.ETag = computeETag(rev.Config, rev.Revision)
	if err := s.Store.UpdateRevisionDraft(ctx, rev); err != nil {
		return catalog.StorefrontRevision{}, apperr.Internal(apperr.CodeInternalError, "Update draft failed")
	}
	return rev, nil
}

func (s *CatalogService) createDraftWithConfig(ctx context.Context, userID string, st CatalogStoreRow, cfg json.RawMessage) (catalog.StorefrontRevision, error) {
	now := s.now()
	next, err := s.Store.NextRevisionNumber(ctx, st.ID)
	if err != nil {
		return catalog.StorefrontRevision{}, apperr.Internal(apperr.CodeInternalError, "Revision allocate failed")
	}
	if next < 1 {
		next = 1
	}
	if int64(next) <= st.StorefrontRevision {
		next = int32(st.StorefrontRevision) + 1
	}
	createdBy := userID
	rev := catalog.StorefrontRevision{
		ID:        s.IDs.New(),
		StoreID:   st.ID,
		Revision:  next,
		Status:    catalog.RevisionDraft,
		ETag:      computeETag(cfg, next),
		Config:    append(json.RawMessage(nil), cfg...),
		CreatedBy: &createdBy,
		CreatedAt: now,
	}
	if err := s.Store.InsertRevision(ctx, rev); err != nil {
		return catalog.StorefrontRevision{}, apperr.Internal(apperr.CodeInternalError, "Create draft failed")
	}
	_ = s.Store.UpdateStorePublishedRevision(ctx, st.ID, st.PublishedRevision, st.PublishedRevisionID, int64(next), now)
	return rev, nil
}

// PublishStorefrontInput is POST storefront/publish with optimistic concurrency.
type PublishStorefrontInput struct {
	Config           json.RawMessage // optional; if set, becomes published content
	ExpectedRevision *int32
	ExpectedETag     string
	IfMatch          string // HTTP If-Match header value
}

// PublishStorefrontResult is the publish response.
type PublishStorefrontResult struct {
	Accepted bool
	Revision int32
	ETag     string
	StoreID  string
}

// PublishStorefront publishes draft (or body config) when expected revision/ETag matches.
func (s *CatalogService) PublishStorefront(ctx context.Context, userID, storeID string, in PublishStorefrontInput) (PublishStorefrontResult, error) {
	st, err := s.requireStoreAccess(ctx, userID, storeID, true)
	if err != nil {
		return PublishStorefrontResult{}, err
	}

	var draft catalog.StorefrontRevision
	draft, err = s.Store.GetLatestDraftRevision(ctx, storeID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			// Allow publish with config body only.
			if len(in.Config) == 0 {
				return PublishStorefrontResult{}, apperr.Validation(apperr.CodeValidationFailed, "No storefront draft to publish")
			}
			if err := catalog.ValidateStorefrontConfig(in.Config); err != nil {
				return PublishStorefrontResult{}, err
			}
			draft, err = s.createDraftWithConfig(ctx, userID, st, in.Config)
			if err != nil {
				return PublishStorefrontResult{}, err
			}
		} else {
			return PublishStorefrontResult{}, apperr.Internal(apperr.CodeInternalError, "Draft lookup failed")
		}
	} else if len(in.Config) > 0 {
		if err := catalog.ValidateStorefrontConfig(in.Config); err != nil {
			return PublishStorefrontResult{}, err
		}
		draft.Config = append(json.RawMessage(nil), in.Config...)
		draft.ETag = computeETag(draft.Config, draft.Revision)
		if err := s.Store.UpdateRevisionDraft(ctx, draft); err != nil {
			return PublishStorefrontResult{}, apperr.Internal(apperr.CodeInternalError, "Update draft failed")
		}
	}

	// Optimistic concurrency: expected revision / ETag / If-Match.
	expectedRev := in.ExpectedRevision
	expectedETag := strings.TrimSpace(in.ExpectedETag)
	if expectedETag == "" && in.IfMatch != "" {
		expectedETag = strings.Trim(strings.TrimSpace(in.IfMatch), `"`)
	}
	// When client sends expectedRevision, require match.
	if expectedRev != nil && *expectedRev != draft.Revision {
		return PublishStorefrontResult{}, catalog.ErrRevisionConflict.WithDetails(map[string]any{
			"expectedRevision": *expectedRev,
			"currentRevision":  draft.Revision,
			"currentETag":      draft.ETag,
		})
	}
	if expectedETag != "" && expectedETag != draft.ETag {
		return PublishStorefrontResult{}, catalog.ErrRevisionConflict.WithDetails(map[string]any{
			"expectedETag":    expectedETag,
			"currentRevision": draft.Revision,
			"currentETag":     draft.ETag,
		})
	}

	now := s.now()
	var result PublishStorefrontResult
	err = s.Store.WithTx(ctx, func(ctx context.Context) error {
		// Re-read draft inside tx for race safety.
		cur, err := s.Store.GetLatestDraftRevision(ctx, storeID)
		if err != nil {
			return err
		}
		if expectedRev != nil && *expectedRev != cur.Revision {
			return catalog.ErrRevisionConflict.WithDetails(map[string]any{
				"expectedRevision": *expectedRev,
				"currentRevision":  cur.Revision,
				"currentETag":      cur.ETag,
			})
		}
		if expectedETag != "" && expectedETag != cur.ETag {
			return catalog.ErrRevisionConflict.WithDetails(map[string]any{
				"expectedETag":    expectedETag,
				"currentRevision": cur.Revision,
				"currentETag":     cur.ETag,
			})
		}
		if err := s.Store.MarkRevisionPublished(ctx, cur.ID, now); err != nil {
			return err
		}
		pubID := cur.ID
		if err := s.Store.UpdateStorePublishedRevision(ctx, storeID, int64(cur.Revision), &pubID, int64(cur.Revision), now); err != nil {
			return err
		}
		// Next draft shell so subsequent edits don't mutate published row.
		next := cur.Revision + 1
		createdBy := userID
		nextCfg := append(json.RawMessage(nil), cur.Config...)
		nextDraft := catalog.StorefrontRevision{
			ID:        s.IDs.New(),
			StoreID:   storeID,
			Revision:  next,
			Status:    catalog.RevisionDraft,
			ETag:      computeETag(nextCfg, next),
			Config:    nextCfg,
			CreatedBy: &createdBy,
			CreatedAt: now,
		}
		if err := s.Store.InsertRevision(ctx, nextDraft); err != nil {
			return err
		}
		_ = s.Store.UpdateStorePublishedRevision(ctx, storeID, int64(cur.Revision), &pubID, int64(next), now)
		result = PublishStorefrontResult{
			Accepted: true,
			Revision: cur.Revision,
			ETag:     cur.ETag,
			StoreID:  storeID,
		}
		return nil
	})
	if err != nil {
		if ae, ok := apperr.AsAppError(err); ok {
			return PublishStorefrontResult{}, ae
		}
		if s.Store.IsNotFound(err) {
			return PublishStorefrontResult{}, catalog.ErrRevisionConflict
		}
		return PublishStorefrontResult{}, apperr.Internal(apperr.CodeInternalError, "Publish storefront failed")
	}
	return result, nil
}

// GetStorefront returns seller view: draft + published pointers.
func (s *CatalogService) GetStorefront(ctx context.Context, userID, storeID string) (map[string]any, error) {
	st, err := s.requireStoreAccess(ctx, userID, storeID, false)
	if err != nil {
		return nil, err
	}
	draft, err := s.GetStorefrontDraft(ctx, userID, storeID)
	if err != nil {
		return nil, err
	}
	out := map[string]any{
		"storeId":            st.ID,
		"draftRevision":      draft.Revision,
		"draftETag":          draft.ETag,
		"draftConfig":        json.RawMessage(draft.Config),
		"publishedRevision":  st.PublishedRevision,
		"storefrontRevision": st.StorefrontRevision,
	}
	if pub, err := s.Store.GetPublishedRevision(ctx, storeID); err == nil {
		out["publishedETag"] = pub.ETag
		out["publishedConfig"] = json.RawMessage(pub.Config)
		if pub.PublishedAt != nil {
			out["publishedAt"] = pub.PublishedAt.UTC().Format(time.RFC3339)
		}
	}
	return out, nil
}

func computeETag(cfg json.RawMessage, revision int32) string {
	h := sha256.New()
	h.Write(cfg)
	h.Write([]byte("|"))
	h.Write([]byte(strconv.FormatInt(int64(revision), 10)))
	sum := hex.EncodeToString(h.Sum(nil))
	if len(sum) > 32 {
		sum = sum[:32]
	}
	return "W/\"" + sum + "\""
}

func monogram(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return "?"
	}
	parts := strings.Fields(name)
	if len(parts) == 1 {
		r, _ := utf8.DecodeRuneInString(parts[0])
		return strings.ToUpper(string(r))
	}
	r1, _ := utf8.DecodeRuneInString(parts[0])
	r2, _ := utf8.DecodeRuneInString(parts[len(parts)-1])
	return strings.ToUpper(string(r1) + string(r2))
}

func mergeConfigIntoPublic(out *catalog.PublicStorefront, raw json.RawMessage) {
	if len(raw) == 0 {
		return
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		return
	}
	str := func(keys ...string) string {
		for _, k := range keys {
			if v, ok := m[k]; ok {
				if s, ok := v.(string); ok {
					return s
				}
			}
		}
		return ""
	}
	if v := str("tagline"); v != "" {
		out.Tagline = v
	}
	if v := str("accent"); v != "" {
		out.Accent = v
	}
	if v := str("ink"); v != "" {
		out.Ink = v
	}
	if v := str("canvas"); v != "" {
		out.Canvas = v
	}
	if v := str("preset", "template"); v != "" {
		out.Preset = v
	}
	if v := str("layout"); v != "" {
		out.Layout = v
	}
	if v := str("font"); v != "" {
		out.Font = v
	}
	if v := str("hero"); v != "" {
		out.Hero = v
	}
	if v := str("cards"); v != "" {
		out.Cards = v
	}
	if v := str("texture"); v != "" {
		out.Texture = v
	}
	if v := str("radius"); v != "" {
		out.Radius = v
	}
	if v := str("headerAlign", "align"); v != "" {
		out.HeaderAlign = v
	}
	if v := str("announcement"); v != "" {
		out.Announcement = v
	}
	if v := str("name"); v != "" {
		out.Name = v
	}
	if v := str("bio"); v != "" {
		out.Bio = v
	}
	if arr, ok := m["featuredProductIds"].([]any); ok {
		ids := make([]string, 0, len(arr))
		for _, x := range arr {
			if s, ok := x.(string); ok {
				ids = append(ids, s)
			}
		}
		out.FeaturedProductIDs = ids
	} else if arr, ok := m["featuredIds"].([]any); ok {
		ids := make([]string, 0, len(arr))
		for _, x := range arr {
			if s, ok := x.(string); ok {
				ids = append(ids, s)
			}
		}
		out.FeaturedProductIDs = ids
	}
	if arr, ok := m["sections"].([]any); ok {
		secs := make([]string, 0, len(arr))
		for _, x := range arr {
			switch v := x.(type) {
			case string:
				secs = append(secs, v)
			case map[string]any:
				if id, ok := v["id"].(string); ok {
					if vis, ok := v["visible"].(bool); ok && !vis {
						continue
					}
					secs = append(secs, id)
				}
			}
		}
		if len(secs) > 0 {
			out.Sections = secs
		}
	}
	if soc, ok := m["socials"].(map[string]any); ok {
		out.Socials = map[string]string{}
		for k, v := range soc {
			if s, ok := v.(string); ok && s != "" {
				out.Socials[k] = s
			}
		}
	} else {
		// Builder uses flat instagram/website
		out.Socials = map[string]string{}
		if v := str("instagram"); v != "" {
			out.Socials["instagram"] = v
		}
		if v := str("website"); v != "" {
			out.Socials["website"] = v
		}
		if v := str("youtube"); v != "" {
			out.Socials["youtube"] = v
		}
	}
	if arr, ok := m["trustBadges"].([]any); ok {
		badges := make([]string, 0, len(arr))
		for _, x := range arr {
			if s, ok := x.(string); ok {
				badges = append(badges, s)
			}
		}
		out.TrustBadges = badges
	}
}
