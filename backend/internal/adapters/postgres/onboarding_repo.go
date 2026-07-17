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
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/authz"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/stores"
)

// OnboardingRepo is the Postgres adapter for BE-200 onboarding.
type OnboardingRepo struct {
	pool *pgxpool.Pool
	q    *gen.Queries
	tx   pgx.Tx
}

func NewOnboardingRepo(pool *pgxpool.Pool) *OnboardingRepo {
	return &OnboardingRepo{pool: pool, q: gen.New(pool)}
}

func (r *OnboardingRepo) queries() *gen.Queries {
	if r.tx != nil {
		return r.q.WithTx(r.tx)
	}
	return r.q
}

func (r *OnboardingRepo) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	if r.tx != nil {
		return fn(ctx)
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("onboarding: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	prev := r.tx
	r.tx = tx
	defer func() { r.tx = prev }()
	if err := fn(ctx); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("onboarding: commit: %w", err)
	}
	return nil
}

func (r *OnboardingRepo) IsNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func (r *OnboardingRepo) IsUniqueViolation(err error) bool {
	var pe *pgconn.PgError
	return errors.As(err, &pe) && pe.Code == "23505"
}

func (r *OnboardingRepo) IsCheckViolation(err error) bool {
	var pe *pgconn.PgError
	if errors.As(err, &pe) {
		return pe.Code == "23514" || pe.Code == "P0001" || pe.Code == "check_violation"
	}
	// PL/pgSQL RAISE with ERRCODE check_violation
	return errors.As(err, &pe) && pe.Code == "23514"
}

func (r *OnboardingRepo) GetMerchantByOwner(ctx context.Context, ownerUserID string) (stores.Merchant, error) {
	row, err := r.queries().GetMerchantByOwner(ctx, ownerUserID)
	if err != nil {
		return stores.Merchant{}, err
	}
	return mapOnboardingMerchantFrom(
		row.ID, row.OwnerUserID, row.DisplayName, row.Status, row.LegalName, row.BusinessType,
		row.OnboardingState, row.OnboardingStep, row.OnboardingCompletedAt, row.OnboardingProgress,
		row.CreatedAt, row.UpdatedAt,
	), nil
}

func (r *OnboardingRepo) GetMerchantByID(ctx context.Context, id string) (stores.Merchant, error) {
	row, err := r.queries().GetMerchantByID(ctx, id)
	if err != nil {
		return stores.Merchant{}, err
	}
	return mapOnboardingMerchantFrom(
		row.ID, row.OwnerUserID, row.DisplayName, row.Status, row.LegalName, row.BusinessType,
		row.OnboardingState, row.OnboardingStep, row.OnboardingCompletedAt, row.OnboardingProgress,
		row.CreatedAt, row.UpdatedAt,
	), nil
}

func (r *OnboardingRepo) InsertMerchant(ctx context.Context, m stores.Merchant) error {
	prog := m.OnboardingProgress
	if len(prog) == 0 {
		prog = json.RawMessage(`{}`)
	}
	err := r.queries().InsertMerchant(ctx, gen.InsertMerchantParams{
		ID:                    m.ID,
		OwnerUserID:           m.OwnerUserID,
		DisplayName:           m.DisplayName,
		Status:                m.Status,
		LegalName:             m.LegalName,
		BusinessType:          m.BusinessType,
		OnboardingState:       string(m.OnboardingState),
		OnboardingStep:        string(m.OnboardingStep),
		OnboardingCompletedAt: timePtrToPg(m.OnboardingCompletedAt),
		OnboardingProgress:    []byte(prog),
		CreatedAt:             m.CreatedAt,
		UpdatedAt:             m.UpdatedAt,
	})
	if err != nil {
		return fmt.Errorf("onboarding: insert merchant: %w", err)
	}
	return nil
}

func (r *OnboardingRepo) UpdateMerchantOnboarding(ctx context.Context, m stores.Merchant) error {
	prog := m.OnboardingProgress
	if len(prog) == 0 {
		prog = json.RawMessage(`{}`)
	}
	err := r.queries().UpdateMerchantOnboarding(ctx, gen.UpdateMerchantOnboardingParams{
		ID:                    m.ID,
		DisplayName:           m.DisplayName,
		LegalName:             m.LegalName,
		BusinessType:          m.BusinessType,
		OnboardingState:       string(m.OnboardingState),
		OnboardingStep:        string(m.OnboardingStep),
		OnboardingCompletedAt: timePtrToPg(m.OnboardingCompletedAt),
		OnboardingProgress:    []byte(prog),
		UpdatedAt:             m.UpdatedAt,
	})
	if err != nil {
		return fmt.Errorf("onboarding: update merchant: %w", err)
	}
	return nil
}

func (r *OnboardingRepo) InsertMerchantMember(ctx context.Context, merchantID, userID, role, status string, createdAt time.Time) error {
	err := r.queries().InsertMerchantMember(ctx, gen.InsertMerchantMemberParams{
		MerchantID:     merchantID,
		UserID:         userID,
		RoleInMerchant: role,
		Status:         status,
		CreatedAt:      createdAt,
	})
	if err != nil {
		return fmt.Errorf("onboarding: insert member: %w", err)
	}
	return nil
}

func (r *OnboardingRepo) GetCanonicalStoreForMerchant(ctx context.Context, merchantID string) (stores.Store, error) {
	row, err := r.queries().GetCanonicalStoreForMerchant(ctx, merchantID)
	if err != nil {
		return stores.Store{}, err
	}
	return mapOnboardingStoreFrom(
		row.ID, row.MerchantID, row.Slug, row.Name, row.Status, row.IsCanonical,
		row.Bio, row.Address, row.AccentColor, row.OnboardingState, row.OnboardingStep,
		row.OnboardingCompletedAt, row.OnboardingProgress, row.StorefrontRevision, row.PublishedRevision,
		row.CreatedAt, row.UpdatedAt,
	), nil
}

func (r *OnboardingRepo) GetStoreByID(ctx context.Context, id string) (stores.Store, error) {
	row, err := r.queries().GetStoreByID(ctx, id)
	if err != nil {
		return stores.Store{}, err
	}
	return mapOnboardingStoreFrom(
		row.ID, row.MerchantID, row.Slug, row.Name, row.Status, row.IsCanonical,
		row.Bio, row.Address, row.AccentColor, row.OnboardingState, row.OnboardingStep,
		row.OnboardingCompletedAt, row.OnboardingProgress, row.StorefrontRevision, row.PublishedRevision,
		row.CreatedAt, row.UpdatedAt,
	), nil
}

func (r *OnboardingRepo) GetStoreBySlug(ctx context.Context, slug string) (stores.Store, error) {
	row, err := r.queries().GetStoreBySlug(ctx, slug)
	if err != nil {
		return stores.Store{}, err
	}
	return mapOnboardingStoreFrom(
		row.ID, row.MerchantID, row.Slug, row.Name, row.Status, row.IsCanonical,
		row.Bio, row.Address, row.AccentColor, row.OnboardingState, row.OnboardingStep,
		row.OnboardingCompletedAt, row.OnboardingProgress, row.StorefrontRevision, row.PublishedRevision,
		row.CreatedAt, row.UpdatedAt,
	), nil
}

func (r *OnboardingRepo) InsertStore(ctx context.Context, s stores.Store) error {
	prog := s.OnboardingProgress
	if len(prog) == 0 {
		prog = json.RawMessage(`{}`)
	}
	err := r.queries().InsertStore(ctx, gen.InsertStoreParams{
		ID:                    s.ID,
		MerchantID:            s.MerchantID,
		Slug:                  s.Slug,
		Name:                  s.Name,
		Status:                s.Status,
		IsCanonical:           s.IsCanonical,
		Bio:                   s.Bio,
		Address:               s.Address,
		AccentColor:           s.AccentColor,
		OnboardingState:       string(s.OnboardingState),
		OnboardingStep:        string(s.OnboardingStep),
		OnboardingCompletedAt: timePtrToPg(s.OnboardingCompletedAt),
		OnboardingProgress:    []byte(prog),
		StorefrontRevision:    s.StorefrontRevision,
		PublishedRevision:     s.PublishedRevision,
		CreatedAt:             s.CreatedAt,
		UpdatedAt:             s.UpdatedAt,
	})
	if err != nil {
		return fmt.Errorf("onboarding: insert store: %w", err)
	}
	return nil
}

func (r *OnboardingRepo) UpdateStoreOnboarding(ctx context.Context, s stores.Store) error {
	prog := s.OnboardingProgress
	if len(prog) == 0 {
		prog = json.RawMessage(`{}`)
	}
	err := r.queries().UpdateStoreOnboarding(ctx, gen.UpdateStoreOnboardingParams{
		ID:                    s.ID,
		Slug:                  s.Slug,
		Name:                  s.Name,
		Bio:                   s.Bio,
		Address:               s.Address,
		AccentColor:           s.AccentColor,
		OnboardingState:       string(s.OnboardingState),
		OnboardingStep:        string(s.OnboardingStep),
		OnboardingCompletedAt: timePtrToPg(s.OnboardingCompletedAt),
		OnboardingProgress:    []byte(prog),
		UpdatedAt:             s.UpdatedAt,
		MerchantID:            s.MerchantID,
	})
	if err != nil {
		return fmt.Errorf("onboarding: update store: %w", err)
	}
	return nil
}

func (r *OnboardingRepo) SlugExists(ctx context.Context, slug string) (bool, error) {
	ok, err := r.queries().SlugExists(ctx, slug)
	if err != nil {
		return false, fmt.Errorf("onboarding: slug exists: %w", err)
	}
	return ok, nil
}

func (r *OnboardingRepo) SlugExistsExcludingStore(ctx context.Context, slug, storeID string) (bool, error) {
	ok, err := r.queries().SlugExistsExcludingStore(ctx, gen.SlugExistsExcludingStoreParams{
		Slug: slug,
		ID:   storeID,
	})
	if err != nil {
		return false, fmt.Errorf("onboarding: slug exists excl: %w", err)
	}
	return ok, nil
}

func (r *OnboardingRepo) CountActiveStoresForMerchant(ctx context.Context, merchantID string) (int64, error) {
	n, err := r.queries().CountActiveStoresForMerchant(ctx, merchantID)
	if err != nil {
		return 0, fmt.Errorf("onboarding: count stores: %w", err)
	}
	return n, nil
}

func (r *OnboardingRepo) DeleteStore(ctx context.Context, storeID, merchantID string) error {
	_, err := r.queries().DeleteStoreByID(ctx, gen.DeleteStoreByIDParams{
		ID:         storeID,
		MerchantID: merchantID,
	})
	if err != nil {
		return fmt.Errorf("onboarding: delete store: %w", err)
	}
	return nil
}

func (r *OnboardingRepo) ListMerchantsMissingCanonicalStore(ctx context.Context) ([]stores.Merchant, error) {
	rows, err := r.queries().ListMerchantsMissingCanonicalStore(ctx)
	if err != nil {
		return nil, fmt.Errorf("onboarding: orphan scan: %w", err)
	}
	out := make([]stores.Merchant, 0, len(rows))
	for _, row := range rows {
		out = append(out, stores.Merchant{
			ID:          row.ID,
			OwnerUserID: row.OwnerUserID,
			DisplayName: row.DisplayName,
			Status:      row.Status,
			CreatedAt:   row.CreatedAt,
			UpdatedAt:   row.UpdatedAt,
		})
	}
	return out, nil
}

func (r *OnboardingRepo) AssignSellerOwnerRole(ctx context.Context, userID string, now time.Time) error {
	roleID, err := r.queries().GetRoleIDByCode(ctx, authz.RoleSellerOwner)
	if err != nil {
		return fmt.Errorf("onboarding: seller role: %w", err)
	}
	return r.queries().AssignUserRole(ctx, gen.AssignUserRoleParams{
		UserID:     userID,
		RoleID:     roleID,
		AssignedAt: now,
		AssignedBy: nil,
	})
}

func mapOnboardingMerchantFrom(
	id, ownerUserID, displayName, status, legalName, businessType, onboardingState, onboardingStep string,
	completedAt pgtype.Timestamptz, progress []byte, createdAt, updatedAt time.Time,
) stores.Merchant {
	return stores.Merchant{
		ID:                    id,
		OwnerUserID:           ownerUserID,
		DisplayName:           displayName,
		LegalName:             legalName,
		BusinessType:          businessType,
		Status:                status,
		OnboardingState:       stores.OnboardingState(onboardingState),
		OnboardingStep:        stores.OnboardingState(onboardingStep),
		OnboardingCompletedAt: pgToTimePtr(completedAt),
		OnboardingProgress:    json.RawMessage(progress),
		CreatedAt:             createdAt,
		UpdatedAt:             updatedAt,
	}
}

func mapOnboardingStoreFrom(
	id, merchantID, slug, name, status string, isCanonical bool,
	bio, address, accentColor, onboardingState, onboardingStep string,
	completedAt pgtype.Timestamptz, progress []byte,
	storefrontRevision, publishedRevision int64,
	createdAt, updatedAt time.Time,
) stores.Store {
	return stores.Store{
		ID:                    id,
		MerchantID:            merchantID,
		Slug:                  slug,
		Name:                  name,
		Bio:                   bio,
		Address:               address,
		AccentColor:           accentColor,
		Status:                status,
		IsCanonical:           isCanonical,
		OnboardingState:       stores.OnboardingState(onboardingState),
		OnboardingStep:        stores.OnboardingState(onboardingStep),
		OnboardingCompletedAt: pgToTimePtr(completedAt),
		OnboardingProgress:    json.RawMessage(progress),
		StorefrontRevision:    storefrontRevision,
		PublishedRevision:     publishedRevision,
		CreatedAt:             createdAt,
		UpdatedAt:             updatedAt,
	}
}
