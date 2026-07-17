package application

import (
	"context"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/stores"
)

// OnboardingStore is the persistence port for BE-200 merchant/store onboarding.
type OnboardingStore interface {
	WithTx(ctx context.Context, fn func(ctx context.Context) error) error

	GetMerchantByOwner(ctx context.Context, ownerUserID string) (stores.Merchant, error)
	GetMerchantByID(ctx context.Context, id string) (stores.Merchant, error)
	InsertMerchant(ctx context.Context, m stores.Merchant) error
	UpdateMerchantOnboarding(ctx context.Context, m stores.Merchant) error

	InsertMerchantMember(ctx context.Context, merchantID, userID, role, status string, createdAt time.Time) error

	GetCanonicalStoreForMerchant(ctx context.Context, merchantID string) (stores.Store, error)
	GetStoreByID(ctx context.Context, id string) (stores.Store, error)
	GetStoreBySlug(ctx context.Context, slug string) (stores.Store, error)
	InsertStore(ctx context.Context, s stores.Store) error
	UpdateStoreOnboarding(ctx context.Context, s stores.Store) error

	SlugExists(ctx context.Context, slug string) (bool, error)
	SlugExistsExcludingStore(ctx context.Context, slug, storeID string) (bool, error)

	CountActiveStoresForMerchant(ctx context.Context, merchantID string) (int64, error)
	DeleteStore(ctx context.Context, storeID, merchantID string) error

	ListMerchantsMissingCanonicalStore(ctx context.Context) ([]stores.Merchant, error)

	AssignSellerOwnerRole(ctx context.Context, userID string, now time.Time) error

	IsNotFound(err error) bool
	IsUniqueViolation(err error) bool
	IsCheckViolation(err error) bool
}
