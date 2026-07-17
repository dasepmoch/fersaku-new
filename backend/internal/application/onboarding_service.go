package application

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/authz"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/stores"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// OnboardingService implements mandatory merchant/store onboarding (BE-200).
type OnboardingService struct {
	Store OnboardingStore
	IDs   ports.IDGenerator
	Clock ports.Clock
	Log   ports.Logger
}

func (s *OnboardingService) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now().UTC()
	}
	return time.Now().UTC()
}

func emptyProgress() json.RawMessage {
	return json.RawMessage(`{}`)
}

// GetProgress returns onboarding status for the authenticated user.
func (s *OnboardingService) GetProgress(ctx context.Context, userID string) (stores.Progress, error) {
	if userID == "" {
		return stores.Progress{}, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required")
	}
	m, err := s.Store.GetMerchantByOwner(ctx, userID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return stores.Progress{
				State:           stores.StateNotStarted,
				Step:            stores.StateNotStarted,
				Completed:       false,
				ProductOptional: true,
				Progress:        emptyProgress(),
			}, nil
		}
		return stores.Progress{}, apperr.Internal(apperr.CodeInternalError, "Onboarding lookup failed")
	}
	st, err := s.Store.GetCanonicalStoreForMerchant(ctx, m.ID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			// Orphan merchant integrity signal — still return merchant without store.
			return stores.Progress{
				State:           m.OnboardingState,
				Step:            m.OnboardingStep,
				Completed:       m.OnboardingState == stores.StateComplete,
				CompletedAt:     m.OnboardingCompletedAt,
				MerchantID:      m.ID,
				CanComplete:     false,
				ProductOptional: true,
				Progress:        coalesceJSON(m.OnboardingProgress),
			}, nil
		}
		return stores.Progress{}, apperr.Internal(apperr.CodeInternalError, "Store lookup failed")
	}
	return projectProgress(m, &st), nil
}

// CreateStoreInput is POST /v1/onboarding/store body.
type CreateStoreInput struct {
	Name        string
	Bio         string
	Slug        string
	Address     string
	AccentColor string
}

// CreateStore transactionally creates merchant + OWNER + canonical store (idempotent).
func (s *OnboardingService) CreateStore(ctx context.Context, userID string, in CreateStoreInput) (stores.Progress, error) {
	if userID == "" {
		return stores.Progress{}, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required")
	}
	name := strings.TrimSpace(in.Name)
	bio := strings.TrimSpace(in.Bio)
	if name == "" {
		return stores.Progress{}, apperr.Validation(apperr.CodeValidationFailed, "Store name is required")
	}

	// Idempotent re-entry: return existing merchant/canonical store.
	existing, err := s.Store.GetMerchantByOwner(ctx, userID)
	if err == nil {
		st, stErr := s.Store.GetCanonicalStoreForMerchant(ctx, existing.ID)
		if stErr == nil {
			return projectProgress(existing, &st), nil
		}
		if !s.Store.IsNotFound(stErr) {
			return stores.Progress{}, apperr.Internal(apperr.CodeInternalError, "Store lookup failed")
		}
		// Merchant without store is integrity violation; repair by creating store below.
	} else if !s.Store.IsNotFound(err) {
		return stores.Progress{}, apperr.Internal(apperr.CodeInternalError, "Merchant lookup failed")
	}

	slug, err := s.resolveCreateSlug(ctx, in.Slug, name, "")
	if err != nil {
		return stores.Progress{}, err
	}

	now := s.now()
	merchantID := s.IDs.New()
	storeID := s.IDs.New()
	state := stores.StateIdentity
	if stores.HasIdentity(name, bio) {
		if ValidateSlugOk(slug) {
			state = stores.StateVisual
		} else {
			state = stores.StateSlug
		}
	}
	prog := emptyProgress()
	m := stores.Merchant{
		ID:                 merchantID,
		OwnerUserID:        userID,
		DisplayName:        name,
		Status:             string(authz.MerchantActive),
		OnboardingState:    state,
		OnboardingStep:     state,
		OnboardingProgress: prog,
		CreatedAt:          now,
		UpdatedAt:          now,
	}
	st := stores.Store{
		ID:                 storeID,
		MerchantID:         merchantID,
		Slug:               slug,
		Name:               name,
		Bio:                bio,
		Address:            strings.TrimSpace(in.Address),
		AccentColor:        strings.TrimSpace(in.AccentColor),
		Status:             string(authz.StoreActive),
		IsCanonical:        true,
		OnboardingState:    state,
		OnboardingStep:     state,
		OnboardingProgress: prog,
		CreatedAt:          now,
		UpdatedAt:          now,
	}
	st.OnboardingState = stores.AdvanceState(&st)
	st.OnboardingStep = st.OnboardingState
	m.OnboardingState = st.OnboardingState
	m.OnboardingStep = st.OnboardingStep

	err = s.Store.WithTx(ctx, func(ctx context.Context) error {
		// Re-check owner inside TX for races.
		if existM, e := s.Store.GetMerchantByOwner(ctx, userID); e == nil {
			if existSt, e2 := s.Store.GetCanonicalStoreForMerchant(ctx, existM.ID); e2 == nil {
				m = existM
				st = existSt
				return nil
			}
		}
		if e := s.Store.InsertMerchant(ctx, m); e != nil {
			if s.Store.IsUniqueViolation(e) {
				// Concurrent create: reload
				existM, e2 := s.Store.GetMerchantByOwner(ctx, userID)
				if e2 != nil {
					return e
				}
				existSt, e3 := s.Store.GetCanonicalStoreForMerchant(ctx, existM.ID)
				if e3 != nil {
					return e
				}
				m, st = existM, existSt
				return nil
			}
			return e
		}
		if e := s.Store.InsertMerchantMember(ctx, merchantID, userID, string(authz.MemberOwner), string(authz.MemberActive), now); e != nil {
			return e
		}
		if e := s.Store.InsertStore(ctx, st); e != nil {
			if s.Store.IsUniqueViolation(e) {
				return stores.ErrSlugTaken
			}
			return e
		}
		if e := s.Store.AssignSellerOwnerRole(ctx, userID, now); e != nil {
			return e
		}
		return nil
	})
	if err != nil {
		if ae, ok := apperr.AsAppError(err); ok {
			return stores.Progress{}, ae
		}
		return stores.Progress{}, apperr.Internal(apperr.CodeInternalError, "Create store failed")
	}
	return projectProgress(m, &st), nil
}

// PatchStoreInput is PATCH /v1/onboarding/store body (all optional).
type PatchStoreInput struct {
	Name        *string
	Bio         *string
	Slug        *string
	Address     *string
	AccentColor *string
	Step        *string // optional explicit wizard step
}

// PatchStore updates identity/slug/visual fields and advances progress.
func (s *OnboardingService) PatchStore(ctx context.Context, userID string, in PatchStoreInput) (stores.Progress, error) {
	if userID == "" {
		return stores.Progress{}, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required")
	}
	m, st, err := s.requireMerchantStore(ctx, userID)
	if err != nil {
		return stores.Progress{}, err
	}
	if m.OnboardingState == stores.StateComplete {
		// Allow cosmetic patches after complete but keep state COMPLETE.
	}

	if in.Name != nil {
		st.Name = strings.TrimSpace(*in.Name)
		m.DisplayName = st.Name
	}
	if in.Bio != nil {
		st.Bio = strings.TrimSpace(*in.Bio)
	}
	if in.Address != nil {
		st.Address = strings.TrimSpace(*in.Address)
	}
	if in.AccentColor != nil {
		st.AccentColor = strings.TrimSpace(*in.AccentColor)
	}
	if in.Slug != nil {
		slug, err := stores.NormalizeAndValidateSlug(*in.Slug)
		if err != nil {
			return stores.Progress{}, err
		}
		taken, err := s.Store.SlugExistsExcludingStore(ctx, slug, st.ID)
		if err != nil {
			return stores.Progress{}, apperr.Internal(apperr.CodeInternalError, "Slug check failed")
		}
		if taken {
			return stores.Progress{}, stores.ErrSlugTaken
		}
		st.Slug = slug
	}

	if m.OnboardingState != stores.StateComplete {
		next := stores.AdvanceState(&st)
		if in.Step != nil {
			if step, ok := parseStep(*in.Step); ok {
				// Never go backward past filled requirements; allow forward to product optional.
				if stepRank(step) >= stepRank(next) {
					next = step
				}
			}
		}
		// Never mark COMPLETE via patch — only Complete().
		if next == stores.StateComplete {
			next = stores.StateProductOptional
		}
		st.OnboardingState = next
		st.OnboardingStep = next
		m.OnboardingState = next
		m.OnboardingStep = next
	}

	now := s.now()
	st.UpdatedAt = now
	m.UpdatedAt = now
	err = s.Store.WithTx(ctx, func(ctx context.Context) error {
		if e := s.Store.UpdateStoreOnboarding(ctx, st); e != nil {
			if s.Store.IsUniqueViolation(e) {
				return stores.ErrSlugTaken
			}
			return e
		}
		return s.Store.UpdateMerchantOnboarding(ctx, m)
	})
	if err != nil {
		if ae, ok := apperr.AsAppError(err); ok {
			return stores.Progress{}, ae
		}
		return stores.Progress{}, apperr.Internal(apperr.CodeInternalError, "Update store failed")
	}
	return projectProgress(m, &st), nil
}

// Complete finishes onboarding without requiring a product (product optional).
func (s *OnboardingService) Complete(ctx context.Context, userID string, skipProduct bool) (stores.Progress, error) {
	if userID == "" {
		return stores.Progress{}, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required")
	}
	_ = skipProduct // product always optional for BE-200
	m, st, err := s.requireMerchantStore(ctx, userID)
	if err != nil {
		return stores.Progress{}, err
	}
	if m.OnboardingState == stores.StateComplete {
		return projectProgress(m, &st), nil // idempotent
	}
	if !stores.CanCompleteOnboarding(&st) {
		if st.ID == "" {
			return stores.Progress{}, stores.ErrStoreRequired
		}
		if !stores.HasIdentity(st.Name, st.Bio) {
			return stores.Progress{}, stores.ErrIdentityRequired
		}
		if err := stores.ValidateNormalizedSlug(st.Slug); err != nil {
			return stores.Progress{}, stores.ErrSlugRequired
		}
		return stores.Progress{}, stores.ErrStoreRequired
	}
	now := s.now()
	m.OnboardingState = stores.StateComplete
	m.OnboardingStep = stores.StateComplete
	m.OnboardingCompletedAt = &now
	m.UpdatedAt = now
	st.OnboardingState = stores.StateComplete
	st.OnboardingStep = stores.StateComplete
	st.OnboardingCompletedAt = &now
	st.UpdatedAt = now

	err = s.Store.WithTx(ctx, func(ctx context.Context) error {
		if e := s.Store.UpdateStoreOnboarding(ctx, st); e != nil {
			return e
		}
		return s.Store.UpdateMerchantOnboarding(ctx, m)
	})
	if err != nil {
		return stores.Progress{}, apperr.Internal(apperr.CodeInternalError, "Complete onboarding failed")
	}
	return projectProgress(m, &st), nil
}

// SlugAvailability reports whether a slug can be claimed.
func (s *OnboardingService) SlugAvailability(ctx context.Context, userID, raw string) (normalized string, available bool, err error) {
	slug, err := stores.NormalizeAndValidateSlug(raw)
	if err != nil {
		// Invalid/reserved → not available (with normalized form when possible)
		return stores.NormalizeSlug(raw), false, nil
	}
	var exclude string
	if userID != "" {
		if m, e := s.Store.GetMerchantByOwner(ctx, userID); e == nil {
			if st, e2 := s.Store.GetCanonicalStoreForMerchant(ctx, m.ID); e2 == nil {
				exclude = st.ID
			}
		}
	}
	var taken bool
	if exclude != "" {
		taken, err = s.Store.SlugExistsExcludingStore(ctx, slug, exclude)
	} else {
		taken, err = s.Store.SlugExists(ctx, slug)
	}
	if err != nil {
		return slug, false, apperr.Internal(apperr.CodeInternalError, "Slug check failed")
	}
	return slug, !taken, nil
}

// ScanOrphanMerchants returns merchants without a usable canonical store (integrity).
func (s *OnboardingService) ScanOrphanMerchants(ctx context.Context) ([]stores.Merchant, error) {
	rows, err := s.Store.ListMerchantsMissingCanonicalStore(ctx)
	if err != nil {
		return nil, apperr.Internal(apperr.CodeInternalError, "Orphan scan failed")
	}
	return rows, nil
}

// DeleteStore enforces no last-store deletion (for integrity tests / future admin).
func (s *OnboardingService) DeleteStore(ctx context.Context, userID, storeID string) error {
	m, st, err := s.requireMerchantStore(ctx, userID)
	if err != nil {
		return err
	}
	if st.ID != storeID {
		// Cross-tenant / wrong store
		other, e := s.Store.GetStoreByID(ctx, storeID)
		if e != nil || other.MerchantID != m.ID {
			return authz.DenyCrossTenant()
		}
		st = other
	}
	n, err := s.Store.CountActiveStoresForMerchant(ctx, m.ID)
	if err != nil {
		return apperr.Internal(apperr.CodeInternalError, "Store count failed")
	}
	if n <= 1 || st.IsCanonical {
		return stores.ErrCannotDeleteLast
	}
	if err := s.Store.DeleteStore(ctx, storeID, m.ID); err != nil {
		if s.Store.IsCheckViolation(err) {
			return stores.ErrCannotDeleteLast
		}
		return apperr.Internal(apperr.CodeInternalError, "Delete store failed")
	}
	return nil
}

func (s *OnboardingService) requireMerchantStore(ctx context.Context, userID string) (stores.Merchant, stores.Store, error) {
	m, err := s.Store.GetMerchantByOwner(ctx, userID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return stores.Merchant{}, stores.Store{}, stores.ErrStoreRequired
		}
		return stores.Merchant{}, stores.Store{}, apperr.Internal(apperr.CodeInternalError, "Merchant lookup failed")
	}
	st, err := s.Store.GetCanonicalStoreForMerchant(ctx, m.ID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return m, stores.Store{}, stores.ErrStoreRequired
		}
		return stores.Merchant{}, stores.Store{}, apperr.Internal(apperr.CodeInternalError, "Store lookup failed")
	}
	return m, st, nil
}

func (s *OnboardingService) resolveCreateSlug(ctx context.Context, raw, name, excludeStoreID string) (string, error) {
	candidate := strings.TrimSpace(raw)
	if candidate == "" {
		candidate = name
	}
	slug, err := stores.NormalizeAndValidateSlug(candidate)
	if err != nil {
		// Provisional unique slug from name fragments + random suffix
		base := stores.NormalizeSlug(name)
		if base == "" || len(base) < stores.SlugMinLen {
			base = "store"
		}
		if len(base) > 40 {
			base = base[:40]
		}
		suffix := strings.ToLower(s.IDs.New())
		if len(suffix) > 8 {
			suffix = suffix[len(suffix)-8:]
		}
		// ULID is Crockford base32: [0-9a-z]
		slug = stores.NormalizeSlug(base + "-" + suffix)
		if err2 := stores.ValidateNormalizedSlug(slug); err2 != nil {
			slug = "store-" + suffix
			if err3 := stores.ValidateNormalizedSlug(slug); err3 != nil {
				return "", stores.ErrSlugInvalid
			}
		}
	}
	var taken bool
	var checkErr error
	if excludeStoreID != "" {
		taken, checkErr = s.Store.SlugExistsExcludingStore(ctx, slug, excludeStoreID)
	} else {
		taken, checkErr = s.Store.SlugExists(ctx, slug)
	}
	if checkErr != nil {
		return "", apperr.Internal(apperr.CodeInternalError, "Slug check failed")
	}
	if taken {
		if strings.TrimSpace(raw) != "" {
			return "", stores.ErrSlugTaken
		}
		// Auto slug collision: append more entropy
		suffix := strings.ToLower(s.IDs.New())
		if len(suffix) > 10 {
			suffix = suffix[len(suffix)-10:]
		}
		slug = stores.NormalizeSlug(slug + "-" + suffix)
		if len(slug) > stores.SlugMaxLen {
			slug = slug[:stores.SlugMaxLen]
			slug = strings.Trim(slug, "-")
		}
		taken, checkErr = s.Store.SlugExists(ctx, slug)
		if checkErr != nil {
			return "", apperr.Internal(apperr.CodeInternalError, "Slug check failed")
		}
		if taken {
			return "", stores.ErrSlugTaken
		}
	}
	return slug, nil
}

func projectProgress(m stores.Merchant, st *stores.Store) stores.Progress {
	p := stores.Progress{
		State:           m.OnboardingState,
		Step:            m.OnboardingStep,
		Completed:       m.OnboardingState == stores.StateComplete,
		CompletedAt:     m.OnboardingCompletedAt,
		MerchantID:      m.ID,
		ProductOptional: true,
		Progress:        coalesceJSON(m.OnboardingProgress),
		CanComplete:     stores.CanCompleteOnboarding(st) && m.OnboardingState != stores.StateComplete,
	}
	if m.OnboardingState == stores.StateComplete {
		p.CanComplete = false
	}
	if st != nil {
		p.StoreID = st.ID
		p.Store = &stores.StoreSummary{
			ID:          st.ID,
			MerchantID:  st.MerchantID,
			Slug:        st.Slug,
			Name:        st.Name,
			Bio:         st.Bio,
			Address:     st.Address,
			AccentColor: st.AccentColor,
			Status:      st.Status,
			Canonical:   st.IsCanonical,
		}
		if st.OnboardingState != "" {
			p.State = st.OnboardingState
			p.Step = st.OnboardingStep
		}
	}
	return p
}

func coalesceJSON(b json.RawMessage) json.RawMessage {
	if len(b) == 0 {
		return emptyProgress()
	}
	return b
}

func ValidateSlugOk(slug string) bool {
	return stores.ValidateNormalizedSlug(slug) == nil
}

func parseStep(s string) (stores.OnboardingState, bool) {
	switch stores.OnboardingState(strings.ToUpper(strings.TrimSpace(s))) {
	case stores.StateNotStarted, stores.StateIdentity, stores.StateSlug, stores.StateVisual, stores.StateProductOptional, stores.StateComplete:
		return stores.OnboardingState(strings.ToUpper(strings.TrimSpace(s))), true
	default:
		return "", false
	}
}

func stepRank(s stores.OnboardingState) int {
	switch s {
	case stores.StateNotStarted:
		return 0
	case stores.StateIdentity:
		return 1
	case stores.StateSlug:
		return 2
	case stores.StateVisual:
		return 3
	case stores.StateProductOptional:
		return 4
	case stores.StateComplete:
		return 5
	default:
		return 0
	}
}
