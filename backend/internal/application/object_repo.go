package application

import (
	"context"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/objects"
)

// ObjectStore is the persistence port for BE-220 object_refs.
type ObjectStore interface {
	WithTx(ctx context.Context, fn func(ctx context.Context) error) error

	InsertObject(ctx context.Context, o objects.ObjectRef) error
	GetObjectByID(ctx context.Context, id string) (objects.ObjectRef, error)
	GetObjectByIDForStore(ctx context.Context, id, storeID string) (objects.ObjectRef, error)
	UpdateObjectComplete(ctx context.Context, id string, status objects.Status, actualSize int64, checksum, contentType string, scanStatus, scanVerdict, scanVersion *string, scanAt, verifiedAt *time.Time, rejectedReason *string, updatedAt time.Time) error
	// UpdateObjectScanMeta transitions scan fields while status is in allowedFrom (CAS).
	// Returns true when a row was updated (caller won the race).
	UpdateObjectScanMeta(ctx context.Context, id string, status objects.Status, scanStatus, scanVerdict, scanVersion *string, scanAt *time.Time, scanAttempts int32, scanErrorClass *string, scanNextRetryAt *time.Time, rejectedReason *string, verifiedAt *time.Time, updatedAt time.Time, allowedFrom []objects.Status) (updated bool, err error)
	MarkObjectExpired(ctx context.Context, id string, updatedAt time.Time) error
	ListExpiredUploading(ctx context.Context, before time.Time, limit int32) ([]objects.ObjectRef, error)
	// ListPendingScan returns SCANNING objects due for (re)scan.
	ListPendingScan(ctx context.Context, now time.Time, limit int32) ([]objects.ObjectRef, error)
	// CountScanning returns quarantine backlog size.
	CountScanning(ctx context.Context) (int64, error)

	GetStoreByID(ctx context.Context, storeID string) (ObjectStoreRow, error)
	UserCanAccessStore(ctx context.Context, userID, storeID string) (bool, error)
	UserIsPlatformAdmin(ctx context.Context, userID string) (bool, error)

	GetQuota(ctx context.Context, merchantID string) (readyBytes, objectCount int64, err error)
	AddQuota(ctx context.Context, merchantID string, addBytes int64, at time.Time) error

	InsertGrant(ctx context.Context, g objects.DeliveryGrant) error
	GetActiveGrant(ctx context.Context, objectID, granteeUserID string, now time.Time) (objects.DeliveryGrant, error)
	IncrementGrantUse(ctx context.Context, grantID string) error

	IsNotFound(err error) bool
}

// ObjectStoreRow is the store slice needed by objects.
type ObjectStoreRow struct {
	ID         string
	MerchantID string
	Slug       string
	Name       string
	Status     string
}
