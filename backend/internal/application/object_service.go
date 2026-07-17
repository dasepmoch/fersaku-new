package application

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/objects"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// ObjectService implements non-KYC upload intent/complete/download (BE-220).
// KYC must never call CreateUploadIntent with KYC purpose — ParsePurpose rejects it.
type ObjectService struct {
	Store         ObjectStore
	Objects       ports.ObjectStore
	IDs           ports.IDGenerator
	Clock         ports.Clock
	Log           ports.Logger
	BucketPublic  string
	BucketPrivate string
	// MerchantSoftQuotaBytes is optional soft limit; 0 = unlimited.
	MerchantSoftQuotaBytes int64
	// LocalScanPass: when true (local/test), skip external malware scanner and mark CLEAN.
	// Production scanners land later; incomplete scan must not silently READY without this flag.
	LocalScanPass bool
}

func (s *ObjectService) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now().UTC()
	}
	return time.Now().UTC()
}

func (s *ObjectService) requireStoreAccess(ctx context.Context, userID, storeID string) (ObjectStoreRow, error) {
	if userID == "" {
		return ObjectStoreRow{}, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required")
	}
	if storeID == "" {
		return ObjectStoreRow{}, objects.ErrNotFound
	}
	st, err := s.Store.GetStoreByID(ctx, storeID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return ObjectStoreRow{}, objects.ErrNotFound
		}
		return ObjectStoreRow{}, apperr.Internal(apperr.CodeInternalError, "Store lookup failed")
	}
	admin, err := s.Store.UserIsPlatformAdmin(ctx, userID)
	if err != nil {
		return ObjectStoreRow{}, apperr.Internal(apperr.CodeInternalError, "Authorization check failed")
	}
	if admin {
		return st, nil
	}
	ok, err := s.Store.UserCanAccessStore(ctx, userID, storeID)
	if err != nil {
		return ObjectStoreRow{}, apperr.Internal(apperr.CodeInternalError, "Authorization check failed")
	}
	if !ok {
		return ObjectStoreRow{}, objects.ErrNotFound
	}
	return st, nil
}

// CreateUploadInput is POST .../objects/uploads.
type CreateUploadInput struct {
	Purpose     string
	ContentType string
	SizeBytes   int64
	// ExpectedChecksumSHA256 optional client-declared checksum (verified on complete).
	ExpectedChecksumSHA256 string
}

// CreateUploadResult is returned once; uploadURL is a short-lived secret capability.
type CreateUploadResult struct {
	Object        objects.ObjectRef
	UploadURL     string
	UploadExpires time.Time
}

// CreateUploadIntent inserts UPLOADING object_ref and returns presigned PUT (non-KYC only).
func (s *ObjectService) CreateUploadIntent(ctx context.Context, userID, storeID string, in CreateUploadInput) (CreateUploadResult, error) {
	if s.Objects == nil || !s.Objects.Configured() {
		return CreateUploadResult{}, apperr.Internal(apperr.CodeInternalError, "Object storage unavailable")
	}
	st, err := s.requireStoreAccess(ctx, userID, storeID)
	if err != nil {
		return CreateUploadResult{}, err
	}
	purpose, err := objects.ParsePurpose(in.Purpose)
	if err != nil {
		return CreateUploadResult{}, err
	}
	ct := objects.NormalizeContentType(in.ContentType)
	if !objects.AllowedContentType(purpose, ct) {
		return CreateUploadResult{}, apperr.Validation(apperr.CodeValidationFailed, "Content type not allowed for purpose")
	}
	maxB := objects.MaxBytesForPurpose(purpose)
	if in.SizeBytes <= 0 || in.SizeBytes > maxB {
		return CreateUploadResult{}, apperr.Validation(apperr.CodeValidationFailed, "Invalid upload size")
	}
	var expectedChecksum *string
	if strings.TrimSpace(in.ExpectedChecksumSHA256) != "" {
		h, err := objects.ValidateChecksumHex(in.ExpectedChecksumSHA256)
		if err != nil {
			return CreateUploadResult{}, err
		}
		expectedChecksum = &h
	}
	// Soft quota check before intent.
	quota := s.MerchantSoftQuotaBytes
	if quota <= 0 {
		quota = objects.DefaultMerchantSoftQuotaBytes
	}
	if quota > 0 {
		ready, _, qerr := s.Store.GetQuota(ctx, st.MerchantID)
		if qerr == nil && ready+in.SizeBytes > quota {
			return CreateUploadResult{}, objects.ErrQuotaExceeded
		}
	}

	now := s.now()
	objectID := s.IDs.New()
	key, err := objects.BuildObjectKey(purpose, st.MerchantID, storeID, objectID)
	if err != nil {
		return CreateUploadResult{}, apperr.Validation(apperr.CodeValidationFailed, "Invalid object key")
	}
	vis := objects.VisibilityForPurpose(purpose)
	bucket := s.BucketPrivate
	if vis == objects.VisibilityPublic {
		bucket = s.BucketPublic
	}
	if bucket == "" {
		return CreateUploadResult{}, apperr.Internal(apperr.CodeInternalError, "Object bucket not configured")
	}
	ownerUID := userID
	ref := objects.ObjectRef{
		ID:                     objectID,
		Bucket:                 bucket,
		ObjectKey:              key,
		Purpose:                purpose,
		Visibility:             vis,
		ContentType:            ct,
		ExpectedSizeBytes:      in.SizeBytes,
		ExpectedChecksumSHA256: expectedChecksum,
		RetentionClass:         objects.RetentionForPurpose(purpose),
		OwnerMerchantID:        st.MerchantID,
		OwnerStoreID:           storeID,
		OwnerUserID:            &ownerUID,
		Status:                 objects.StatusUploading,
		UploadExpiresAt:        now.Add(objects.DefaultUploadIntentTTL),
		CreatedAt:              now,
		UpdatedAt:              now,
	}
	if err := s.Store.InsertObject(ctx, ref); err != nil {
		return CreateUploadResult{}, apperr.Internal(apperr.CodeInternalError, "Failed to create upload intent")
	}
	url, exp, err := s.Objects.PresignPut(ctx, ports.PresignPutInput{
		Bucket:        bucket,
		Key:           key,
		ContentType:   ct,
		ContentLength: in.SizeBytes,
		TTL:           objects.DefaultPresignPutTTL,
	})
	if err != nil {
		if s.Log != nil {
			s.Log.Error("presign put failed", "object_id", objectID, "err", err.Error())
		}
		return CreateUploadResult{}, apperr.Internal(apperr.CodeInternalError, "Failed to create upload URL")
	}
	// Never log full URL.
	if s.Log != nil {
		s.Log.Info("upload intent created", "object_id", objectID, "store_id", storeID, "purpose", string(purpose))
	}
	return CreateUploadResult{Object: ref, UploadURL: url, UploadExpires: exp}, nil
}

// CompleteUpload verifies HEAD/checksum and transitions to READY or REJECTED.
func (s *ObjectService) CompleteUpload(ctx context.Context, userID, storeID, objectID string, clientChecksum string) (objects.ObjectRef, error) {
	if s.Objects == nil || !s.Objects.Configured() {
		return objects.ObjectRef{}, apperr.Internal(apperr.CodeInternalError, "Object storage unavailable")
	}
	if _, err := s.requireStoreAccess(ctx, userID, storeID); err != nil {
		return objects.ObjectRef{}, err
	}
	ref, err := s.Store.GetObjectByIDForStore(ctx, objectID, storeID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return objects.ObjectRef{}, objects.ErrNotFound
		}
		return objects.ObjectRef{}, apperr.Internal(apperr.CodeInternalError, "Object lookup failed")
	}
	if ref.Status != objects.StatusUploading {
		if ref.Status == objects.StatusReady {
			return ref, nil // idempotent complete
		}
		return objects.ObjectRef{}, objects.ErrInvalidState
	}
	now := s.now()
	if !ref.UploadExpiresAt.IsZero() && now.After(ref.UploadExpiresAt) {
		_ = s.Store.MarkObjectExpired(ctx, ref.ID, now)
		_ = s.Objects.DeleteObject(ctx, ref.Bucket, ref.ObjectKey)
		return objects.ObjectRef{}, objects.ErrUploadExpired
	}

	head, err := s.Objects.HeadObject(ctx, ref.Bucket, ref.ObjectKey)
	if err != nil {
		var nf ports.ErrObjectNotFound
		if errors.As(err, &nf) {
			reason := "object missing at complete"
			_ = s.reject(ctx, ref.ID, reason, now)
			return objects.ObjectRef{}, objects.ErrUploadIncomplete
		}
		return objects.ObjectRef{}, apperr.Internal(apperr.CodeInternalError, "Object verification failed")
	}
	if head.ContentLength != ref.ExpectedSizeBytes {
		reason := "size mismatch"
		_ = s.reject(ctx, ref.ID, reason, now)
		return objects.ObjectRef{}, objects.ErrSizeMismatch
	}
	// Content-Type from storage is authoritative over browser when present.
	if head.ContentType != "" {
		norm := objects.NormalizeContentType(head.ContentType)
		if !objects.AllowedContentType(ref.Purpose, norm) {
			reason := "content type rejected"
			_ = s.reject(ctx, ref.ID, reason, now)
			return objects.ObjectRef{}, objects.ErrContentTypeMismatch
		}
		ref.ContentType = norm
	}

	checksum := strings.ToLower(strings.TrimSpace(clientChecksum))
	if checksum == "" && ref.ExpectedChecksumSHA256 != nil {
		checksum = *ref.ExpectedChecksumSHA256
	}
	if checksum != "" {
		h, err := objects.ValidateChecksumHex(checksum)
		if err != nil {
			return objects.ObjectRef{}, err
		}
		checksum = h
		if ref.ExpectedChecksumSHA256 != nil && *ref.ExpectedChecksumSHA256 != checksum {
			reason := "checksum mismatch"
			_ = s.reject(ctx, ref.ID, reason, now)
			return objects.ObjectRef{}, objects.ErrChecksumMismatch
		}
	} else {
		// Require checksum for complete (authoritative integrity).
		return objects.ObjectRef{}, apperr.Validation(apperr.CodeValidationFailed, "Checksum is required to complete upload")
	}

	// Scan gate: local pass for minio/dev; production must set scanner (later).
	scanStatus := "SKIPPED"
	scanVerdict := "CLEAN"
	scanVersion := "local-pass-v1"
	if !s.LocalScanPass {
		// Without scanner, quarantine as SCANNING then reject READY transition.
		// Launch policy: LocalScanPass must be true for local; staging/prod wire scanner later.
		// Fail closed: do not mark READY without scan pass flag.
		reason := "malware scan unavailable"
		_ = s.reject(ctx, ref.ID, reason, now)
		return objects.ObjectRef{}, apperr.Internal(apperr.CodeInternalError, "Malware scan unavailable")
	}
	scanAt := now
	status := objects.StatusReady
	if err := s.Store.UpdateObjectComplete(ctx, ref.ID, status, head.ContentLength, checksum, ref.ContentType,
		&scanStatus, &scanVerdict, &scanVersion, &scanAt, &now, nil, now); err != nil {
		return objects.ObjectRef{}, apperr.Internal(apperr.CodeInternalError, "Failed to finalize object")
	}
	_ = s.Store.AddQuota(ctx, ref.OwnerMerchantID, head.ContentLength, now)

	out, err := s.Store.GetObjectByIDForStore(ctx, objectID, storeID)
	if err != nil {
		return objects.ObjectRef{}, apperr.Internal(apperr.CodeInternalError, "Object reload failed")
	}
	if s.Log != nil {
		s.Log.Info("upload completed", "object_id", objectID, "status", string(out.Status))
	}
	return out, nil
}

func (s *ObjectService) reject(ctx context.Context, id, reason string, now time.Time) error {
	return s.Store.UpdateObjectComplete(ctx, id, objects.StatusRejected, 0, "", "", nil, nil, nil, nil, nil, &reason, now)
}

// GetObjectMetadata returns metadata without raw key as authority field for clients.
func (s *ObjectService) GetObjectMetadata(ctx context.Context, userID, storeID, objectID string) (objects.ObjectRef, error) {
	if _, err := s.requireStoreAccess(ctx, userID, storeID); err != nil {
		return objects.ObjectRef{}, err
	}
	ref, err := s.Store.GetObjectByIDForStore(ctx, objectID, storeID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return objects.ObjectRef{}, objects.ErrNotFound
		}
		return objects.ObjectRef{}, apperr.Internal(apperr.CodeInternalError, "Object lookup failed")
	}
	return ref, nil
}

// DownloadURLResult is a short-lived GET capability.
type DownloadURLResult struct {
	ObjectID      string
	DownloadURL   string
	ExpiresAt     time.Time
	ContentType   string
	SizeBytes     *int64
	CacheControl  string
}

// GetDownloadURL returns short-lived GET for owner or active delivery grant holder.
func (s *ObjectService) GetDownloadURL(ctx context.Context, userID, storeID, objectID string) (DownloadURLResult, error) {
	if s.Objects == nil || !s.Objects.Configured() {
		return DownloadURLResult{}, apperr.Internal(apperr.CodeInternalError, "Object storage unavailable")
	}
	if userID == "" {
		return DownloadURLResult{}, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required")
	}
	// Load by store first (cross-tenant → not found).
	ref, err := s.Store.GetObjectByIDForStore(ctx, objectID, storeID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return DownloadURLResult{}, objects.ErrNotFound
		}
		return DownloadURLResult{}, apperr.Internal(apperr.CodeInternalError, "Object lookup failed")
	}
	if ref.Status != objects.StatusReady {
		return DownloadURLResult{}, objects.ErrNotReady
	}

	allowed := false
	// Owner / store member / admin
	if st, err := s.requireStoreAccess(ctx, userID, storeID); err == nil && st.ID != "" {
		allowed = true
	}
	// Delivery grant stub
	if !allowed {
		g, gerr := s.Store.GetActiveGrant(ctx, objectID, userID, s.now())
		if gerr == nil && g.ID != "" {
			allowed = true
			_ = s.Store.IncrementGrantUse(ctx, g.ID)
		}
	}
	if !allowed {
		// Cross-tenant / no grant → not found
		return DownloadURLResult{}, objects.ErrNotFound
	}

	url, exp, err := s.Objects.PresignGet(ctx, ports.PresignGetInput{
		Bucket: ref.Bucket,
		Key:    ref.ObjectKey,
		TTL:    objects.DefaultPresignGetTTL,
	})
	if err != nil {
		return DownloadURLResult{}, apperr.Internal(apperr.CodeInternalError, "Failed to create download URL")
	}
	if s.Log != nil {
		s.Log.Info("download url issued", "object_id", objectID, "user_id", userID)
	}
	return DownloadURLResult{
		ObjectID:     objectID,
		DownloadURL:  url,
		ExpiresAt:    exp,
		ContentType:  ref.ContentType,
		SizeBytes:    ref.ActualSizeBytes,
		CacheControl: "private, no-store",
	}, nil
}

// CreateDeliveryGrantStub issues a buyer grant for READY object (BE-235 expands).
func (s *ObjectService) CreateDeliveryGrantStub(ctx context.Context, actorUserID, storeID, objectID, granteeUserID string) (objects.DeliveryGrant, error) {
	if _, err := s.requireStoreAccess(ctx, actorUserID, storeID); err != nil {
		return objects.DeliveryGrant{}, err
	}
	if granteeUserID == "" {
		return objects.DeliveryGrant{}, apperr.Validation(apperr.CodeValidationFailed, "granteeUserId is required")
	}
	ref, err := s.Store.GetObjectByIDForStore(ctx, objectID, storeID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return objects.DeliveryGrant{}, objects.ErrNotFound
		}
		return objects.DeliveryGrant{}, apperr.Internal(apperr.CodeInternalError, "Object lookup failed")
	}
	if ref.Status != objects.StatusReady {
		return objects.DeliveryGrant{}, objects.ErrNotReady
	}
	now := s.now()
	g := objects.DeliveryGrant{
		ID:            s.IDs.New(),
		ObjectID:      objectID,
		StoreID:       storeID,
		GranteeUserID: granteeUserID,
		Purpose:       "BUYER_DELIVERY",
		ExpiresAt:     now.Add(objects.DefaultDeliveryGrantTTL),
		MaxUses:       10,
		UseCount:      0,
		CreatedAt:     now,
	}
	if err := s.Store.InsertGrant(ctx, g); err != nil {
		return objects.DeliveryGrant{}, apperr.Internal(apperr.CodeInternalError, "Failed to create delivery grant")
	}
	return g, nil
}

// CleanupExpiredUploads aborts/deletes expired UPLOADING objects.
func (s *ObjectService) CleanupExpiredUploads(ctx context.Context, limit int32) (int, error) {
	if limit <= 0 {
		limit = 50
	}
	now := s.now()
	list, err := s.Store.ListExpiredUploading(ctx, now, limit)
	if err != nil {
		return 0, err
	}
	n := 0
	for _, ref := range list {
		if s.Objects != nil && s.Objects.Configured() {
			_ = s.Objects.DeleteObject(ctx, ref.Bucket, ref.ObjectKey)
		}
		if err := s.Store.MarkObjectExpired(ctx, ref.ID, now); err != nil {
			continue
		}
		n++
	}
	if s.Log != nil && n > 0 {
		s.Log.Info("expired uploads cleaned", "count", n)
	}
	return n, nil
}
