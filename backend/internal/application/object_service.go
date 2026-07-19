package application

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/objects"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
	"github.com/dasepmoch/fersaku-new/backend/internal/platform/metrics"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// ObjectService implements non-KYC upload intent/complete/download (BE-220).
// KYC must never call CreateUploadIntent with KYC purpose — ParsePurpose rejects it.
type ObjectService struct {
	Store         ObjectStore
	Objects       ports.ObjectStore
	Scanner       ports.MalwareScanner
	IDs           ports.IDGenerator
	Clock         ports.Clock
	Log           ports.Logger
	BucketPublic  string
	BucketPrivate string
	// MerchantSoftQuotaBytes is optional soft limit; 0 = unlimited.
	MerchantSoftQuotaBytes int64
	// LocalScanPass: when true (local/test) and Scanner is nil, use implicit local-pass.
	// Prefer injecting ports.MalwareScanner (localpass adapter) explicitly.
	// Deprecated for production: staging/prod must wire a Configured scanner.
	LocalScanPass bool
	// MaxScanAttempts before dead-letter quarantine (default objects.DefaultScanMaxAttempts).
	MaxScanAttempts int32
	// ScanTimeout bounds a single scan attempt.
	ScanTimeout time.Duration
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

	// Persist size/checksum and move to SCANNING quarantine until CLEAN.
	// Never READY without scan evidence from a configured scanner (or explicit local-pass).
	scanStatus := objects.ScanStatusPending
	if err := s.Store.UpdateObjectComplete(ctx, ref.ID, objects.StatusScanning, head.ContentLength, checksum, ref.ContentType,
		&scanStatus, nil, nil, nil, nil, nil, now); err != nil {
		return objects.ObjectRef{}, apperr.Internal(apperr.CodeInternalError, "Failed to quarantine object for scan")
	}

	// Attempt synchronous scan so happy-path clients get READY without waiting for worker.
	out, err := s.scanObject(ctx, objectID, storeID)
	if err != nil {
		// Quarantine retained; surface SCANNING state for async retry (timeout/error).
		ref2, gerr := s.Store.GetObjectByIDForStore(ctx, objectID, storeID)
		if gerr == nil && ref2.Status == objects.StatusScanning {
			if s.Log != nil {
				s.Log.Info("upload quarantined pending scan", "object_id", objectID, "err", err.Error())
			}
			return ref2, nil
		}
		if gerr == nil {
			return ref2, err
		}
		return objects.ObjectRef{}, err
	}
	if s.Log != nil {
		s.Log.Info("upload completed", "object_id", objectID, "status", string(out.Status))
	}
	return out, nil
}

func (s *ObjectService) maxAttempts() int32 {
	if s.MaxScanAttempts > 0 {
		return s.MaxScanAttempts
	}
	return objects.DefaultScanMaxAttempts
}

func (s *ObjectService) scanTimeout() time.Duration {
	if s.ScanTimeout > 0 {
		return s.ScanTimeout
	}
	return objects.DefaultScanTimeout
}

func (s *ObjectService) scanner() ports.MalwareScanner {
	if s.Scanner != nil {
		return s.Scanner
	}
	return nil
}

// scanObject runs one malware scan attempt for a SCANNING object.
// CLEAN → READY + quota; INFECTED → REJECTED; ERROR/TIMEOUT → retry or dead-letter quarantine.
// Idempotent: READY/REJECTED objects are returned unchanged (no double quota).
func (s *ObjectService) scanObject(ctx context.Context, objectID, storeID string) (objects.ObjectRef, error) {
	ref, err := s.Store.GetObjectByIDForStore(ctx, objectID, storeID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return objects.ObjectRef{}, objects.ErrNotFound
		}
		return objects.ObjectRef{}, apperr.Internal(apperr.CodeInternalError, "Object lookup failed")
	}
	if ref.Status == objects.StatusReady || ref.Status == objects.StatusRejected {
		return ref, nil
	}
	if ref.Status != objects.StatusScanning {
		return objects.ObjectRef{}, objects.ErrInvalidState
	}

	now := s.now()
	sc := s.scanner()
	if sc == nil || !sc.Configured() {
		if s.LocalScanPass {
			return s.finalizeClean(ctx, ref, ports.ScanResult{
				Verdict: ports.ScanVerdictClean,
				Engine:  "localpass",
				Version: "local-pass-v1",
			}, now)
		}
		// Fail-closed quarantine: scanner missing — schedule retry, never READY.
		attempts := ref.ScanAttempts + 1
		errClass := "scanner_unavailable"
		next := now.Add(objects.DefaultScanBackoff * time.Duration(attempts))
		st := objects.ScanStatusFailed
		verdict := string(ports.ScanVerdictError)
		version := "unavailable"
		reason := "malware scan unavailable"
		_, _ = s.Store.UpdateObjectScanMeta(ctx, ref.ID, objects.StatusScanning,
			&st, &verdict, &version, &now, attempts, &errClass, &next, &reason, nil, now,
			[]objects.Status{objects.StatusScanning})
		metrics.Global.IncMalwareScan("error")
		metrics.Global.IncMalwareScan("quarantine")
		return objects.ObjectRef{}, apperr.Internal(apperr.CodeInternalError, "Malware scan unavailable")
	}

	maxB := objects.MaxBytesForPurpose(ref.Purpose)
	if maxB <= 0 {
		maxB = objects.MaxUploadBytesProduct
	}
	rc, _, openErr := s.Objects.GetObjectStream(ctx, ref.Bucket, ref.ObjectKey, maxB)
	if openErr != nil {
		return s.handleScanFailure(ctx, ref, ports.ScanResult{
			Verdict:    ports.ScanVerdictError,
			Engine:     "objectstore",
			Version:    "n/a",
			ErrorClass: "fetch_error",
		}, now, openErr)
	}
	defer rc.Close()

	scanCtx, cancel := context.WithTimeout(ctx, s.scanTimeout())
	defer cancel()
	result, scanErr := sc.Scan(scanCtx, ports.ScanInput{
		Reader:      rc,
		SizeBytes:   derefInt64(ref.ActualSizeBytes, ref.ExpectedSizeBytes),
		ContentType: ref.ContentType,
		MaxBytes:    maxB,
		Timeout:     s.scanTimeout(),
		Purpose:     "object",
	})
	// Never treat spoofed/empty CLEAN without engine/version as success.
	if result.Verdict == ports.ScanVerdictClean {
		if strings.TrimSpace(result.Engine) == "" || strings.TrimSpace(result.Version) == "" {
			result.Verdict = ports.ScanVerdictError
			result.ErrorClass = "invalid_response"
			scanErr = errors.New("malware: missing engine/version on clean verdict")
		}
	}
	if scanErr != nil && result.Verdict == "" {
		if errors.Is(scanErr, context.DeadlineExceeded) || errors.Is(scanCtx.Err(), context.DeadlineExceeded) {
			result.Verdict = ports.ScanVerdictTimeout
			result.ErrorClass = "timeout"
		} else {
			result.Verdict = ports.ScanVerdictError
			if result.ErrorClass == "" {
				result.ErrorClass = "scan_error"
			}
		}
	}
	if result.Verdict == ports.ScanVerdictTimeout || errors.Is(scanCtx.Err(), context.DeadlineExceeded) {
		if result.Verdict != ports.ScanVerdictInfected {
			result.Verdict = ports.ScanVerdictTimeout
			if result.ErrorClass == "" {
				result.ErrorClass = "timeout"
			}
		}
	}

	switch result.Verdict {
	case ports.ScanVerdictClean:
		return s.finalizeClean(ctx, ref, result, now)
	case ports.ScanVerdictInfected:
		return s.finalizeInfected(ctx, ref, result, now)
	default:
		return s.handleScanFailure(ctx, ref, result, now, scanErr)
	}
}

func derefInt64(p *int64, fallback int64) int64 {
	if p != nil {
		return *p
	}
	return fallback
}

func (s *ObjectService) finalizeClean(ctx context.Context, ref objects.ObjectRef, result ports.ScanResult, now time.Time) (objects.ObjectRef, error) {
	// Re-check status to avoid double quota on concurrent workers.
	cur, err := s.Store.GetObjectByID(ctx, ref.ID)
	if err == nil && cur.Status == objects.StatusReady {
		return cur, nil
	}
	st := objects.ScanStatusComplete
	verdict := string(ports.ScanVerdictClean)
	version := result.Engine + ":" + result.Version
	if len(version) > 128 {
		version = version[:128]
	}
	attempts := ref.ScanAttempts + 1
	won, err := s.Store.UpdateObjectScanMeta(ctx, ref.ID, objects.StatusReady,
		&st, &verdict, &version, &now, attempts, nil, nil, nil, &now, now,
		[]objects.Status{objects.StatusScanning})
	if err != nil {
		return objects.ObjectRef{}, apperr.Internal(apperr.CodeInternalError, "Failed to finalize clean scan")
	}
	if won {
		size := derefInt64(ref.ActualSizeBytes, ref.ExpectedSizeBytes)
		_ = s.Store.AddQuota(ctx, ref.OwnerMerchantID, size, now)
		metrics.Global.IncMalwareScan("clean")
	}
	out, err := s.Store.GetObjectByID(ctx, ref.ID)
	if err != nil {
		return objects.ObjectRef{}, apperr.Internal(apperr.CodeInternalError, "Object reload failed")
	}
	return out, nil
}

func (s *ObjectService) finalizeInfected(ctx context.Context, ref objects.ObjectRef, result ports.ScanResult, now time.Time) (objects.ObjectRef, error) {
	st := objects.ScanStatusComplete
	verdict := string(ports.ScanVerdictInfected)
	version := result.Engine + ":" + result.Version
	if len(version) > 128 {
		version = version[:128]
	}
	reason := "malware detected"
	if result.Signature != "" {
		reason = "malware detected: " + result.Signature
		if len(reason) > 200 {
			reason = reason[:200]
		}
	}
	attempts := ref.ScanAttempts + 1
	won, _ := s.Store.UpdateObjectScanMeta(ctx, ref.ID, objects.StatusRejected,
		&st, &verdict, &version, &now, attempts, nil, nil, &reason, nil, now,
		[]objects.Status{objects.StatusScanning})
	// Best-effort delete infected blob (containment).
	if won && s.Objects != nil && s.Objects.Configured() {
		_ = s.Objects.DeleteObject(ctx, ref.Bucket, ref.ObjectKey)
	}
	if won {
		metrics.Global.IncMalwareScan("infected")
	}
	out, _ := s.Store.GetObjectByID(ctx, ref.ID)
	if out.ID == "" {
		out = ref
		out.Status = objects.StatusRejected
	}
	return out, apperr.Validation(apperr.CodeValidationFailed, "Object failed malware scan")
}

func (s *ObjectService) handleScanFailure(ctx context.Context, ref objects.ObjectRef, result ports.ScanResult, now time.Time, scanErr error) (objects.ObjectRef, error) {
	attempts := ref.ScanAttempts + 1
	errClass := result.ErrorClass
	if errClass == "" {
		errClass = "scan_error"
	}
	if result.Verdict == ports.ScanVerdictTimeout {
		errClass = "timeout"
	}
	st := objects.ScanStatusFailed
	verdict := string(result.Verdict)
	if verdict == "" {
		verdict = string(ports.ScanVerdictError)
	}
	version := result.Engine + ":" + result.Version
	if version == ":" || strings.TrimPrefix(version, ":") == result.Version && result.Engine == "" {
		version = "unknown"
	}
	if len(version) > 128 {
		version = version[:128]
	}

	maxA := s.maxAttempts()
	if attempts >= maxA {
		reason := "malware scan failed after retries"
		won, _ := s.Store.UpdateObjectScanMeta(ctx, ref.ID, objects.StatusRejected,
			&st, &verdict, &version, &now, attempts, &errClass, nil, &reason, nil, now,
			[]objects.Status{objects.StatusScanning})
		if won {
			metrics.Global.IncMalwareScan("error")
			metrics.Global.IncMalwareScan("dead_letter")
		}
		out, _ := s.Store.GetObjectByID(ctx, ref.ID)
		if scanErr != nil {
			return out, apperr.Internal(apperr.CodeInternalError, "Malware scan failed")
		}
		return out, apperr.Internal(apperr.CodeInternalError, "Malware scan failed")
	}

	backoff := objects.DefaultScanBackoff * time.Duration(attempts)
	if backoff > 10*time.Minute {
		backoff = 10 * time.Minute
	}
	next := now.Add(backoff)
	reason := "malware scan pending retry"
	won, _ := s.Store.UpdateObjectScanMeta(ctx, ref.ID, objects.StatusScanning,
		&st, &verdict, &version, &now, attempts, &errClass, &next, &reason, nil, now,
		[]objects.Status{objects.StatusScanning})
	if won {
		if result.Verdict == ports.ScanVerdictTimeout {
			metrics.Global.IncMalwareScan("timeout")
		} else {
			metrics.Global.IncMalwareScan("error")
		}
		metrics.Global.IncMalwareScan("quarantine")
	}
	out, _ := s.Store.GetObjectByID(ctx, ref.ID)
	if out.ID == "" {
		out = ref
		out.Status = objects.StatusScanning
	}
	if scanErr != nil {
		return out, scanErr
	}
	return out, apperr.Internal(apperr.CodeInternalError, "Malware scan incomplete")
}

// ProcessPendingScans drains due SCANNING objects (worker job). Idempotent per object.
func (s *ObjectService) ProcessPendingScans(ctx context.Context, limit int32) (int, error) {
	if limit <= 0 {
		limit = 25
	}
	now := s.now()
	list, err := s.Store.ListPendingScan(ctx, now, limit)
	if err != nil {
		return 0, err
	}
	n := 0
	for _, ref := range list {
		_, _ = s.scanObject(ctx, ref.ID, ref.OwnerStoreID)
		n++
	}
	if backlog, cerr := s.Store.CountScanning(ctx); cerr == nil {
		metrics.Global.SetMalwareQuarantineBacklog(float64(backlog))
	}
	return n, nil
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
	ObjectID     string
	DownloadURL  string
	ExpiresAt    time.Time
	ContentType  string
	SizeBytes    *int64
	CacheControl string
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
