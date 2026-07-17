package application

import (
	"context"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/domains"
)

// DomainStoreRow is store ownership context for domain claims.
type DomainStoreRow struct {
	ID         string
	MerchantID string
	Slug       string
	Name       string
	Status     string
}

// DomainStore is the persistence port for BE-240.
type DomainStore interface {
	WithTx(ctx context.Context, fn func(ctx context.Context) error) error

	GetStore(ctx context.Context, storeID string) (DomainStoreRow, error)
	UserCanAccessStore(ctx context.Context, userID, storeID string) (bool, error)
	UserIsPlatformAdmin(ctx context.Context, userID string) (bool, error)

	InsertDomain(ctx context.Context, d domains.Domain) error
	GetDomainByID(ctx context.Context, id string) (domains.Domain, error)
	GetDomainByIDForStore(ctx context.Context, id, storeID string) (domains.Domain, error)
	GetClaimByHostname(ctx context.Context, hostnameNormalized string) (domains.Domain, error)
	GetActiveByHostname(ctx context.Context, hostnameNormalized string) (domains.Domain, error)
	ListByStore(ctx context.Context, storeID string) ([]domains.Domain, error)
	// UpdateCAS increments version when expectedVersion matches; returns new row.
	UpdateCAS(ctx context.Context, expectedVersion int32, d domains.Domain) (domains.Domain, error)
	ListDueForRevalidation(ctx context.Context, now time.Time, limit int32) ([]domains.Domain, error)
	ListExpiredTombstones(ctx context.Context, now time.Time, limit int32) ([]domains.Domain, error)
	HardDeleteTombstone(ctx context.Context, id string) error

	InsertOutbox(ctx context.Context, id, topic string, payload []byte, dedupeKey *string, availableAt time.Time) error

	IsNotFound(err error) bool
	IsUniqueViolation(err error) bool
}
