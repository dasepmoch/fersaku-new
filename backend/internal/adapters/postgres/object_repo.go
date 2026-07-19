package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres/gen"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/objects"
)

// ObjectRepo is the Postgres adapter for BE-220 object_refs.
type ObjectRepo struct {
	pool *pgxpool.Pool
	q    *gen.Queries
	tx   pgx.Tx
}

func NewObjectRepo(pool *pgxpool.Pool) *ObjectRepo {
	return &ObjectRepo{pool: pool, q: gen.New(pool)}
}

func (r *ObjectRepo) queries() *gen.Queries {
	if r.tx != nil {
		return r.q.WithTx(r.tx)
	}
	return r.q
}

func (r *ObjectRepo) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	if r.tx != nil {
		return fn(ctx)
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("objects: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	prev := r.tx
	r.tx = tx
	defer func() { r.tx = prev }()
	if err := fn(ctx); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("objects: commit: %w", err)
	}
	return nil
}

func (r *ObjectRepo) IsNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func (r *ObjectRepo) InsertObject(ctx context.Context, o objects.ObjectRef) error {
	return r.queries().ObjectInsert(ctx, gen.ObjectInsertParams{
		ID:                     o.ID,
		Bucket:                 o.Bucket,
		ObjectKey:              o.ObjectKey,
		Purpose:                string(o.Purpose),
		Visibility:             string(o.Visibility),
		ContentType:            o.ContentType,
		ExpectedSizeBytes:      o.ExpectedSizeBytes,
		ExpectedChecksumSha256: o.ExpectedChecksumSHA256,
		EncryptionKeyVersion:   o.EncryptionKeyVersion,
		RetentionClass:         string(o.RetentionClass),
		OwnerMerchantID:        o.OwnerMerchantID,
		OwnerStoreID:           o.OwnerStoreID,
		OwnerUserID:            o.OwnerUserID,
		Status:                 string(o.Status),
		UploadExpiresAt:        o.UploadExpiresAt,
		CreatedAt:              o.CreatedAt,
		UpdatedAt:              o.UpdatedAt,
	})
}

// objectRow is the common scan projection used by sqlc object queries.
type objectRow struct {
	ID                     string
	Bucket                 string
	ObjectKey              string
	Purpose                string
	Visibility             string
	ContentType            string
	ExpectedSizeBytes      int64
	ActualSizeBytes        *int64
	ChecksumSha256         *string
	ExpectedChecksumSha256 *string
	EncryptionKeyVersion   *string
	RetentionClass         string
	OwnerMerchantID        string
	OwnerStoreID           string
	OwnerUserID            *string
	Status                 string
	UploadExpiresAt        time.Time
	MultipartUploadID      *string
	MultipartAbortedAt     pgtype.Timestamptz
	ScanStatus             *string
	ScanVerdict            *string
	ScanVersion            *string
	ScanAt                 pgtype.Timestamptz
	LastVerifiedAt         pgtype.Timestamptz
	RejectedReason         *string
	ScanAttempts           int32
	ScanErrorClass         *string
	ScanNextRetryAt        pgtype.Timestamptz
	CreatedAt              time.Time
	UpdatedAt              time.Time
}

func mapObjectRow(row objectRow) objects.ObjectRef {
	return objects.ObjectRef{
		ID:                     row.ID,
		Bucket:                 row.Bucket,
		ObjectKey:              row.ObjectKey,
		Purpose:                objects.Purpose(row.Purpose),
		Visibility:             objects.Visibility(row.Visibility),
		ContentType:            row.ContentType,
		ExpectedSizeBytes:      row.ExpectedSizeBytes,
		ActualSizeBytes:        row.ActualSizeBytes,
		ChecksumSHA256:         row.ChecksumSha256,
		ExpectedChecksumSHA256: row.ExpectedChecksumSha256,
		EncryptionKeyVersion:   row.EncryptionKeyVersion,
		RetentionClass:         objects.RetentionClass(row.RetentionClass),
		OwnerMerchantID:        row.OwnerMerchantID,
		OwnerStoreID:           row.OwnerStoreID,
		OwnerUserID:            row.OwnerUserID,
		Status:                 objects.Status(row.Status),
		UploadExpiresAt:        row.UploadExpiresAt,
		MultipartUploadID:      row.MultipartUploadID,
		MultipartAbortedAt:     pgToTimePtr(row.MultipartAbortedAt),
		ScanStatus:             row.ScanStatus,
		ScanVerdict:            row.ScanVerdict,
		ScanVersion:            row.ScanVersion,
		ScanAt:                 pgToTimePtr(row.ScanAt),
		ScanAttempts:           row.ScanAttempts,
		ScanErrorClass:         row.ScanErrorClass,
		ScanNextRetryAt:        pgToTimePtr(row.ScanNextRetryAt),
		LastVerifiedAt:         pgToTimePtr(row.LastVerifiedAt),
		RejectedReason:         row.RejectedReason,
		CreatedAt:              row.CreatedAt,
		UpdatedAt:              row.UpdatedAt,
	}
}

func fromGetByID(row gen.ObjectGetByIDRow) objectRow {
	return objectRow{
		ID: row.ID, Bucket: row.Bucket, ObjectKey: row.ObjectKey, Purpose: row.Purpose,
		Visibility: row.Visibility, ContentType: row.ContentType, ExpectedSizeBytes: row.ExpectedSizeBytes,
		ActualSizeBytes: row.ActualSizeBytes, ChecksumSha256: row.ChecksumSha256,
		ExpectedChecksumSha256: row.ExpectedChecksumSha256, EncryptionKeyVersion: row.EncryptionKeyVersion,
		RetentionClass: row.RetentionClass, OwnerMerchantID: row.OwnerMerchantID, OwnerStoreID: row.OwnerStoreID,
		OwnerUserID: row.OwnerUserID, Status: row.Status, UploadExpiresAt: row.UploadExpiresAt,
		MultipartUploadID: row.MultipartUploadID, MultipartAbortedAt: row.MultipartAbortedAt,
		ScanStatus: row.ScanStatus, ScanVerdict: row.ScanVerdict, ScanVersion: row.ScanVersion,
		ScanAt: row.ScanAt, LastVerifiedAt: row.LastVerifiedAt, RejectedReason: row.RejectedReason,
		ScanAttempts: row.ScanAttempts, ScanErrorClass: row.ScanErrorClass, ScanNextRetryAt: row.ScanNextRetryAt,
		CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
	}
}

func fromGetByIDForStore(row gen.ObjectGetByIDForStoreRow) objectRow {
	return objectRow{
		ID: row.ID, Bucket: row.Bucket, ObjectKey: row.ObjectKey, Purpose: row.Purpose,
		Visibility: row.Visibility, ContentType: row.ContentType, ExpectedSizeBytes: row.ExpectedSizeBytes,
		ActualSizeBytes: row.ActualSizeBytes, ChecksumSha256: row.ChecksumSha256,
		ExpectedChecksumSha256: row.ExpectedChecksumSha256, EncryptionKeyVersion: row.EncryptionKeyVersion,
		RetentionClass: row.RetentionClass, OwnerMerchantID: row.OwnerMerchantID, OwnerStoreID: row.OwnerStoreID,
		OwnerUserID: row.OwnerUserID, Status: row.Status, UploadExpiresAt: row.UploadExpiresAt,
		MultipartUploadID: row.MultipartUploadID, MultipartAbortedAt: row.MultipartAbortedAt,
		ScanStatus: row.ScanStatus, ScanVerdict: row.ScanVerdict, ScanVersion: row.ScanVersion,
		ScanAt: row.ScanAt, LastVerifiedAt: row.LastVerifiedAt, RejectedReason: row.RejectedReason,
		ScanAttempts: row.ScanAttempts, ScanErrorClass: row.ScanErrorClass, ScanNextRetryAt: row.ScanNextRetryAt,
		CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
	}
}

func fromListExpired(row gen.ObjectListExpiredUploadingRow) objectRow {
	return objectRow{
		ID: row.ID, Bucket: row.Bucket, ObjectKey: row.ObjectKey, Purpose: row.Purpose,
		Visibility: row.Visibility, ContentType: row.ContentType, ExpectedSizeBytes: row.ExpectedSizeBytes,
		ActualSizeBytes: row.ActualSizeBytes, ChecksumSha256: row.ChecksumSha256,
		ExpectedChecksumSha256: row.ExpectedChecksumSha256, EncryptionKeyVersion: row.EncryptionKeyVersion,
		RetentionClass: row.RetentionClass, OwnerMerchantID: row.OwnerMerchantID, OwnerStoreID: row.OwnerStoreID,
		OwnerUserID: row.OwnerUserID, Status: row.Status, UploadExpiresAt: row.UploadExpiresAt,
		MultipartUploadID: row.MultipartUploadID, MultipartAbortedAt: row.MultipartAbortedAt,
		ScanStatus: row.ScanStatus, ScanVerdict: row.ScanVerdict, ScanVersion: row.ScanVersion,
		ScanAt: row.ScanAt, LastVerifiedAt: row.LastVerifiedAt, RejectedReason: row.RejectedReason,
		ScanAttempts: row.ScanAttempts, ScanErrorClass: row.ScanErrorClass, ScanNextRetryAt: row.ScanNextRetryAt,
		CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
	}
}

func fromListPending(row gen.ObjectListPendingScanRow) objectRow {
	return objectRow{
		ID: row.ID, Bucket: row.Bucket, ObjectKey: row.ObjectKey, Purpose: row.Purpose,
		Visibility: row.Visibility, ContentType: row.ContentType, ExpectedSizeBytes: row.ExpectedSizeBytes,
		ActualSizeBytes: row.ActualSizeBytes, ChecksumSha256: row.ChecksumSha256,
		ExpectedChecksumSha256: row.ExpectedChecksumSha256, EncryptionKeyVersion: row.EncryptionKeyVersion,
		RetentionClass: row.RetentionClass, OwnerMerchantID: row.OwnerMerchantID, OwnerStoreID: row.OwnerStoreID,
		OwnerUserID: row.OwnerUserID, Status: row.Status, UploadExpiresAt: row.UploadExpiresAt,
		MultipartUploadID: row.MultipartUploadID, MultipartAbortedAt: row.MultipartAbortedAt,
		ScanStatus: row.ScanStatus, ScanVerdict: row.ScanVerdict, ScanVersion: row.ScanVersion,
		ScanAt: row.ScanAt, LastVerifiedAt: row.LastVerifiedAt, RejectedReason: row.RejectedReason,
		ScanAttempts: row.ScanAttempts, ScanErrorClass: row.ScanErrorClass, ScanNextRetryAt: row.ScanNextRetryAt,
		CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
	}
}

func (r *ObjectRepo) GetObjectByID(ctx context.Context, id string) (objects.ObjectRef, error) {
	row, err := r.queries().ObjectGetByID(ctx, id)
	if err != nil {
		return objects.ObjectRef{}, err
	}
	return mapObjectRow(fromGetByID(row)), nil
}

func (r *ObjectRepo) GetObjectByIDForStore(ctx context.Context, id, storeID string) (objects.ObjectRef, error) {
	row, err := r.queries().ObjectGetByIDForStore(ctx, gen.ObjectGetByIDForStoreParams{
		ID:           id,
		OwnerStoreID: storeID,
	})
	if err != nil {
		return objects.ObjectRef{}, err
	}
	return mapObjectRow(fromGetByIDForStore(row)), nil
}

func (r *ObjectRepo) UpdateObjectComplete(
	ctx context.Context,
	id string,
	status objects.Status,
	actualSize int64,
	checksum, contentType string,
	scanStatus, scanVerdict, scanVersion *string,
	scanAt, verifiedAt *time.Time,
	rejectedReason *string,
	updatedAt time.Time,
) error {
	var sizePtr *int64
	if actualSize > 0 {
		sizePtr = &actualSize
	}
	var checksumPtr *string
	if checksum != "" {
		checksumPtr = &checksum
	}
	return r.queries().ObjectUpdateComplete(ctx, gen.ObjectUpdateCompleteParams{
		ID:              id,
		Status:          string(status),
		ActualSizeBytes: sizePtr,
		ChecksumSha256:  checksumPtr,
		Column5:         contentType,
		ScanStatus:      scanStatus,
		ScanVerdict:     scanVerdict,
		ScanVersion:     scanVersion,
		ScanAt:          timePtrToPg(scanAt),
		LastVerifiedAt:  timePtrToPg(verifiedAt),
		RejectedReason:  rejectedReason,
		UpdatedAt:       updatedAt,
	})
}

func (r *ObjectRepo) UpdateObjectScanMeta(
	ctx context.Context,
	id string,
	status objects.Status,
	scanStatus, scanVerdict, scanVersion *string,
	scanAt *time.Time,
	scanAttempts int32,
	scanErrorClass *string,
	scanNextRetryAt *time.Time,
	rejectedReason *string,
	verifiedAt *time.Time,
	updatedAt time.Time,
	allowedFrom []objects.Status,
) (bool, error) {
	from := make([]string, 0, len(allowedFrom))
	for _, s := range allowedFrom {
		from = append(from, string(s))
	}
	n, err := r.queries().ObjectUpdateScanMeta(ctx, gen.ObjectUpdateScanMetaParams{
		ID:              id,
		Status:          string(status),
		ScanStatus:      scanStatus,
		ScanVerdict:     scanVerdict,
		ScanVersion:     scanVersion,
		ScanAt:          timePtrToPg(scanAt),
		ScanAttempts:    scanAttempts,
		ScanErrorClass:  scanErrorClass,
		ScanNextRetryAt: timePtrToPg(scanNextRetryAt),
		RejectedReason:  rejectedReason,
		LastVerifiedAt:  timePtrToPg(verifiedAt),
		UpdatedAt:       updatedAt,
		Column13:        from,
	})
	return n > 0, err
}

func (r *ObjectRepo) MarkObjectExpired(ctx context.Context, id string, updatedAt time.Time) error {
	return r.queries().ObjectMarkExpired(ctx, gen.ObjectMarkExpiredParams{
		ID:        id,
		UpdatedAt: updatedAt,
	})
}

func (r *ObjectRepo) ListExpiredUploading(ctx context.Context, before time.Time, limit int32) ([]objects.ObjectRef, error) {
	rows, err := r.queries().ObjectListExpiredUploading(ctx, gen.ObjectListExpiredUploadingParams{
		UploadExpiresAt: before,
		Limit:           limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]objects.ObjectRef, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapObjectRow(fromListExpired(row)))
	}
	return out, nil
}

func (r *ObjectRepo) ListPendingScan(ctx context.Context, now time.Time, limit int32) ([]objects.ObjectRef, error) {
	rows, err := r.queries().ObjectListPendingScan(ctx, gen.ObjectListPendingScanParams{
		ScanNextRetryAt: timePtrToPg(&now),
		Limit:           limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]objects.ObjectRef, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapObjectRow(fromListPending(row)))
	}
	return out, nil
}

func (r *ObjectRepo) CountScanning(ctx context.Context) (int64, error) {
	return r.queries().ObjectCountScanning(ctx)
}

func (r *ObjectRepo) GetStoreByID(ctx context.Context, storeID string) (application.ObjectStoreRow, error) {
	row, err := r.queries().ObjectGetStoreByID(ctx, storeID)
	if err != nil {
		return application.ObjectStoreRow{}, err
	}
	return application.ObjectStoreRow{
		ID:         row.ID,
		MerchantID: row.MerchantID,
		Slug:       row.Slug,
		Name:       row.Name,
		Status:     row.Status,
	}, nil
}

func (r *ObjectRepo) UserCanAccessStore(ctx context.Context, userID, storeID string) (bool, error) {
	return r.queries().ObjectUserCanAccessStore(ctx, gen.ObjectUserCanAccessStoreParams{
		ID:     storeID,
		UserID: userID,
	})
}

func (r *ObjectRepo) UserIsPlatformAdmin(ctx context.Context, userID string) (bool, error) {
	return r.queries().ObjectUserIsPlatformAdmin(ctx, userID)
}

func (r *ObjectRepo) GetQuota(ctx context.Context, merchantID string) (readyBytes, objectCount int64, err error) {
	row, err := r.queries().ObjectQuotaGet(ctx, merchantID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, 0, nil
		}
		return 0, 0, err
	}
	return row.ReadyBytes, row.ObjectCount, nil
}

func (r *ObjectRepo) AddQuota(ctx context.Context, merchantID string, addBytes int64, at time.Time) error {
	return r.queries().ObjectQuotaUpsertAdd(ctx, gen.ObjectQuotaUpsertAddParams{
		MerchantID: merchantID,
		ReadyBytes: addBytes,
		UpdatedAt:  at,
	})
}

func (r *ObjectRepo) InsertGrant(ctx context.Context, g objects.DeliveryGrant) error {
	return r.queries().ObjectGrantInsert(ctx, gen.ObjectGrantInsertParams{
		ID:            g.ID,
		ObjectID:      g.ObjectID,
		StoreID:       g.StoreID,
		GranteeUserID: g.GranteeUserID,
		Purpose:       g.Purpose,
		ExpiresAt:     g.ExpiresAt,
		MaxUses:       int32(g.MaxUses),
		CreatedAt:     g.CreatedAt,
	})
}

func (r *ObjectRepo) GetActiveGrant(ctx context.Context, objectID, granteeUserID string, now time.Time) (objects.DeliveryGrant, error) {
	row, err := r.queries().ObjectGrantGetActive(ctx, gen.ObjectGrantGetActiveParams{
		ObjectID:      objectID,
		GranteeUserID: granteeUserID,
		ExpiresAt:     now,
	})
	if err != nil {
		return objects.DeliveryGrant{}, err
	}
	return objects.DeliveryGrant{
		ID:            row.ID,
		ObjectID:      row.ObjectID,
		StoreID:       row.StoreID,
		GranteeUserID: row.GranteeUserID,
		Purpose:       row.Purpose,
		ExpiresAt:     row.ExpiresAt,
		RevokedAt:     pgToTimePtr(row.RevokedAt),
		MaxUses:       int(row.MaxUses),
		UseCount:      int(row.UseCount),
		CreatedAt:     row.CreatedAt,
	}, nil
}

func (r *ObjectRepo) IncrementGrantUse(ctx context.Context, grantID string) error {
	return r.queries().ObjectGrantIncrementUse(ctx, grantID)
}
