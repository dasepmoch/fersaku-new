package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres/gen"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/catalog"
)

// CatalogRepo is the Postgres adapter for BE-210 catalog/storefront.
type CatalogRepo struct {
	pool *pgxpool.Pool
	q    *gen.Queries
	tx   pgx.Tx
}

func NewCatalogRepo(pool *pgxpool.Pool) *CatalogRepo {
	return &CatalogRepo{pool: pool, q: gen.New(pool)}
}

func (r *CatalogRepo) queries() *gen.Queries {
	if r.tx != nil {
		return r.q.WithTx(r.tx)
	}
	return r.q
}

func (r *CatalogRepo) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	if r.tx != nil {
		return fn(ctx)
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("catalog: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	prev := r.tx
	r.tx = tx
	defer func() { r.tx = prev }()
	if err := fn(ctx); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("catalog: commit: %w", err)
	}
	return nil
}

func (r *CatalogRepo) IsNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func (r *CatalogRepo) IsUniqueViolation(err error) bool {
	var pe *pgconn.PgError
	return errors.As(err, &pe) && pe.Code == "23505"
}

func (r *CatalogRepo) GetStoreByID(ctx context.Context, storeID string) (application.CatalogStoreRow, error) {
	row, err := r.queries().CatalogGetStoreByID(ctx, storeID)
	if err != nil {
		return application.CatalogStoreRow{}, err
	}
	return mapCatalogStore(row.ID, row.MerchantID, row.Slug, row.Name, row.Bio, row.Address, row.AccentColor,
		row.Status, row.IsCanonical, row.StorefrontRevision, row.PublishedRevision, row.PublishedRevisionID,
		row.CreatedAt, row.UpdatedAt), nil
}

func (r *CatalogRepo) GetStoreBySlug(ctx context.Context, slug string) (application.CatalogStoreRow, error) {
	row, err := r.queries().CatalogGetStoreBySlug(ctx, slug)
	if err != nil {
		return application.CatalogStoreRow{}, err
	}
	return mapCatalogStore(row.ID, row.MerchantID, row.Slug, row.Name, row.Bio, row.Address, row.AccentColor,
		row.Status, row.IsCanonical, row.StorefrontRevision, row.PublishedRevision, row.PublishedRevisionID,
		row.CreatedAt, row.UpdatedAt), nil
}

func mapCatalogStore(
	id, merchantID, slug, name, bio, address, accent, status string,
	isCanonical bool, storefrontRev, publishedRev int64, publishedRevID *string,
	createdAt, updatedAt time.Time,
) application.CatalogStoreRow {
	return application.CatalogStoreRow{
		ID:                  id,
		MerchantID:          merchantID,
		Slug:                slug,
		Name:                name,
		Bio:                 bio,
		Address:             address,
		AccentColor:         accent,
		Status:              status,
		IsCanonical:         isCanonical,
		StorefrontRevision:  storefrontRev,
		PublishedRevision:   publishedRev,
		PublishedRevisionID: publishedRevID,
		CreatedAt:           createdAt,
		UpdatedAt:           updatedAt,
	}
}

func (r *CatalogRepo) UserCanAccessStore(ctx context.Context, userID, storeID string) (bool, error) {
	return r.queries().CatalogUserCanAccessStore(ctx, gen.CatalogUserCanAccessStoreParams{
		ID:     storeID,
		UserID: userID,
	})
}

func (r *CatalogRepo) UserIsPlatformAdmin(ctx context.Context, userID string) (bool, error) {
	return r.queries().CatalogUserIsPlatformAdmin(ctx, userID)
}

func (r *CatalogRepo) UpdateStorePublishedRevision(ctx context.Context, storeID string, publishedRevision int64, publishedRevisionID *string, storefrontRevision int64, updatedAt time.Time) error {
	return r.queries().CatalogUpdateStorePublishedRevision(ctx, gen.CatalogUpdateStorePublishedRevisionParams{
		ID:                  storeID,
		PublishedRevision:   publishedRevision,
		PublishedRevisionID: publishedRevisionID,
		StorefrontRevision:  storefrontRevision,
		UpdatedAt:           updatedAt,
	})
}

func (r *CatalogRepo) InsertProduct(ctx context.Context, p catalog.Product) error {
	inc, err := json.Marshal(p.Includes)
	if err != nil {
		return err
	}
	if p.Includes == nil {
		inc = []byte("[]")
	}
	return r.queries().InsertProduct(ctx, gen.InsertProductParams{
		ID:              p.ID,
		StoreID:         p.StoreID,
		MerchantID:      p.MerchantID,
		Slug:            p.Slug,
		Title:           p.Title,
		Short:           p.Short,
		Description:     p.Description,
		PriceIdr:        p.PriceIDR,
		Type:            string(p.Type),
		Status:          string(p.Status),
		Version:         p.Version,
		Badge:           p.Badge,
		Palette:         p.Palette,
		Glyph:           p.Glyph,
		Includes:        inc,
		AllowPwyt:       p.AllowPWYT,
		MinimumPriceIdr: p.MinimumPriceIDR,
		PublishedAt:     timePtrToPg(p.PublishedAt),
		CreatedAt:       p.CreatedAt,
		UpdatedAt:       p.UpdatedAt,
	})
}

func (r *CatalogRepo) UpdateProduct(ctx context.Context, p catalog.Product) error {
	inc, err := json.Marshal(p.Includes)
	if err != nil {
		return err
	}
	if p.Includes == nil {
		inc = []byte("[]")
	}
	return r.queries().UpdateProduct(ctx, gen.UpdateProductParams{
		ID:              p.ID,
		Slug:            p.Slug,
		Title:           p.Title,
		Short:           p.Short,
		Description:     p.Description,
		PriceIdr:        p.PriceIDR,
		Type:            string(p.Type),
		Status:          string(p.Status),
		Version:         p.Version,
		Badge:           p.Badge,
		Palette:         p.Palette,
		Glyph:           p.Glyph,
		Includes:        inc,
		AllowPwyt:       p.AllowPWYT,
		MinimumPriceIdr: p.MinimumPriceIDR,
		PublishedAt:     timePtrToPg(p.PublishedAt),
		UpdatedAt:       p.UpdatedAt,
		StoreID:         p.StoreID,
	})
}

func (r *CatalogRepo) GetProductByID(ctx context.Context, storeID, productID string) (catalog.Product, error) {
	row, err := r.queries().GetProductByID(ctx, gen.GetProductByIDParams{
		StoreID: storeID,
		ID:      productID,
	})
	if err != nil {
		return catalog.Product{}, err
	}
	return mapProduct(row), nil
}

func (r *CatalogRepo) GetProductBySlug(ctx context.Context, storeID, slug string) (catalog.Product, error) {
	row, err := r.queries().GetProductBySlug(ctx, gen.GetProductBySlugParams{
		StoreID: storeID,
		Slug:    slug,
	})
	if err != nil {
		return catalog.Product{}, err
	}
	return mapProduct(row), nil
}

func (r *CatalogRepo) ListProductsByStore(ctx context.Context, storeID string, includeAll bool) ([]catalog.Product, error) {
	_ = includeAll
	rows, err := r.queries().ListProductsByStore(ctx, storeID)
	if err != nil {
		return nil, err
	}
	out := make([]catalog.Product, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapProduct(row))
	}
	return out, nil
}

func (r *CatalogRepo) ListPublishedProductsByStore(ctx context.Context, storeID string) ([]catalog.Product, error) {
	rows, err := r.queries().ListPublishedProductsByStore(ctx, storeID)
	if err != nil {
		return nil, err
	}
	out := make([]catalog.Product, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapProduct(row))
	}
	return out, nil
}

func (r *CatalogRepo) ListFeaturedProducts(ctx context.Context, limit int32) ([]catalog.Product, error) {
	rows, err := r.queries().ListFeaturedProducts(ctx, limit)
	if err != nil {
		return nil, err
	}
	out := make([]catalog.Product, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapProduct(row))
	}
	return out, nil
}

func (r *CatalogRepo) GetPublishedProductByIDOrSlug(ctx context.Context, idOrSlug string) (catalog.Product, error) {
	row, err := r.queries().GetPublishedProductByID(ctx, idOrSlug)
	if err == nil {
		return mapProduct(row), nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return catalog.Product{}, err
	}
	row2, err := r.queries().GetPublishedProductBySlug(ctx, idOrSlug)
	if err != nil {
		return catalog.Product{}, err
	}
	return mapProduct(row2), nil
}

func (r *CatalogRepo) ProductSlugExists(ctx context.Context, storeID, slug string, excludeID string) (bool, error) {
	return r.queries().ProductSlugExists(ctx, gen.ProductSlugExistsParams{
		StoreID: storeID,
		Slug:    slug,
		Column3: excludeID,
	})
}

func (r *CatalogRepo) GetLatestDraftRevision(ctx context.Context, storeID string) (catalog.StorefrontRevision, error) {
	row, err := r.queries().GetLatestDraftRevision(ctx, storeID)
	if err != nil {
		return catalog.StorefrontRevision{}, err
	}
	return mapRevision(row), nil
}

func (r *CatalogRepo) GetPublishedRevision(ctx context.Context, storeID string) (catalog.StorefrontRevision, error) {
	row, err := r.queries().GetPublishedRevision(ctx, storeID)
	if err != nil {
		return catalog.StorefrontRevision{}, err
	}
	return mapRevision(row), nil
}

func (r *CatalogRepo) GetRevisionByNumber(ctx context.Context, storeID string, revision int32) (catalog.StorefrontRevision, error) {
	row, err := r.queries().GetRevisionByNumber(ctx, gen.GetRevisionByNumberParams{
		StoreID:  storeID,
		Revision: revision,
	})
	if err != nil {
		return catalog.StorefrontRevision{}, err
	}
	return mapRevision(row), nil
}

func (r *CatalogRepo) InsertRevision(ctx context.Context, rev catalog.StorefrontRevision) error {
	cfg := rev.Config
	if len(cfg) == 0 {
		cfg = catalog.DefaultStorefrontConfig()
	}
	return r.queries().InsertStorefrontRevision(ctx, gen.InsertStorefrontRevisionParams{
		ID:          rev.ID,
		StoreID:     rev.StoreID,
		Revision:    rev.Revision,
		Status:      string(rev.Status),
		Etag:        rev.ETag,
		Config:      cfg,
		PublishedAt: timePtrToPg(rev.PublishedAt),
		CreatedBy:   rev.CreatedBy,
		CreatedAt:   rev.CreatedAt,
	})
}

func (r *CatalogRepo) UpdateRevisionDraft(ctx context.Context, rev catalog.StorefrontRevision) error {
	return r.queries().UpdateStorefrontRevisionDraft(ctx, gen.UpdateStorefrontRevisionDraftParams{
		ID:     rev.ID,
		Etag:   rev.ETag,
		Config: rev.Config,
	})
}

func (r *CatalogRepo) MarkRevisionPublished(ctx context.Context, id string, publishedAt time.Time) error {
	return r.queries().MarkStorefrontRevisionPublished(ctx, gen.MarkStorefrontRevisionPublishedParams{
		ID:          id,
		PublishedAt: pgtype.Timestamptz{Time: publishedAt, Valid: true},
	})
}

func (r *CatalogRepo) NextRevisionNumber(ctx context.Context, storeID string) (int32, error) {
	return r.queries().NextStorefrontRevisionNumber(ctx, storeID)
}

func mapProduct(row gen.Product) catalog.Product {
	includes := []string{}
	if len(row.Includes) > 0 {
		_ = json.Unmarshal(row.Includes, &includes)
		if includes == nil {
			includes = []string{}
		}
	}
	var pub *time.Time
	if row.PublishedAt.Valid {
		t := row.PublishedAt.Time.UTC()
		pub = &t
	}
	return catalog.Product{
		ID:              row.ID,
		StoreID:         row.StoreID,
		MerchantID:      row.MerchantID,
		Slug:            row.Slug,
		Title:           row.Title,
		Short:           row.Short,
		Description:     row.Description,
		PriceIDR:        row.PriceIdr,
		Type:            catalog.ProductType(row.Type),
		Status:          catalog.ProductStatus(row.Status),
		Version:         row.Version,
		Badge:           row.Badge,
		Palette:         row.Palette,
		Glyph:           row.Glyph,
		Includes:        includes,
		AllowPWYT:       row.AllowPwyt,
		MinimumPriceIDR: row.MinimumPriceIdr,
		PublishedAt:     pub,
		CreatedAt:       row.CreatedAt,
		UpdatedAt:       row.UpdatedAt,
		Sales:           0,
	}
}

func mapRevision(row gen.StorefrontRevision) catalog.StorefrontRevision {
	var pub *time.Time
	if row.PublishedAt.Valid {
		t := row.PublishedAt.Time.UTC()
		pub = &t
	}
	cfg := json.RawMessage(row.Config)
	if len(cfg) == 0 {
		cfg = catalog.DefaultStorefrontConfig()
	}
	return catalog.StorefrontRevision{
		ID:          row.ID,
		StoreID:     row.StoreID,
		Revision:    row.Revision,
		Status:      catalog.RevisionStatus(row.Status),
		ETag:        row.Etag,
		Config:      cfg,
		PublishedAt: pub,
		CreatedBy:   row.CreatedBy,
		CreatedAt:   row.CreatedAt,
	}
}

// Ensure CatalogRepo implements application.CatalogStore.
var _ application.CatalogStore = (*CatalogRepo)(nil)
