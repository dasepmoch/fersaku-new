package handlers

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/decode"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/objects"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// ObjectsHandler serves BE-220 non-KYC object upload/download.
type ObjectsHandler struct {
	Svc *application.ObjectService
}

type createUploadBody struct {
	Purpose                string `json:"purpose"`
	ContentType            string `json:"contentType"`
	SizeBytes              int64  `json:"sizeBytes"`
	ExpectedChecksumSHA256 string `json:"expectedChecksumSha256"`
}

type completeUploadBody struct {
	ChecksumSHA256 string `json:"checksumSha256"`
}

// CreateUpload POST /v1/stores/{storeId}/objects/uploads
func (h *ObjectsHandler) CreateUpload(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Objects unavailable"))
		return
	}
	var body createUploadBody
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	storeID := chi.URLParam(r, "storeId")
	res, err := h.Svc.CreateUploadIntent(r.Context(), p.SubjectID, storeID, application.CreateUploadInput{
		Purpose:                body.Purpose,
		ContentType:            body.ContentType,
		SizeBytes:              body.SizeBytes,
		ExpectedChecksumSHA256: body.ExpectedChecksumSHA256,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	// Response includes short-lived uploadURL once; never log it. no-store.
	w.Header().Set("Cache-Control", "private, no-store")
	presenters.WriteData(w, r, http.StatusCreated, map[string]any{
		"object":        objectMetaDTO(res.Object),
		"uploadUrl":     res.UploadURL,
		"uploadExpires": res.UploadExpires.UTC().Format(time.RFC3339Nano),
		"method":        "PUT",
	})
}

// CompleteUpload POST /v1/stores/{storeId}/objects/{objectId}/complete
func (h *ObjectsHandler) CompleteUpload(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Objects unavailable"))
		return
	}
	var body completeUploadBody
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	storeID := chi.URLParam(r, "storeId")
	objectID := chi.URLParam(r, "objectId")
	ref, err := h.Svc.CompleteUpload(r.Context(), p.SubjectID, storeID, objectID, body.ChecksumSHA256)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	presenters.WriteData(w, r, http.StatusOK, objectMetaDTO(ref))
}

// GetMetadata GET /v1/stores/{storeId}/objects/{objectId}
func (h *ObjectsHandler) GetMetadata(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Objects unavailable"))
		return
	}
	storeID := chi.URLParam(r, "storeId")
	objectID := chi.URLParam(r, "objectId")
	ref, err := h.Svc.GetObjectMetadata(r.Context(), p.SubjectID, storeID, objectID)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	presenters.WriteData(w, r, http.StatusOK, objectMetaDTO(ref))
}

// GetDownloadURL GET /v1/stores/{storeId}/objects/{objectId}/download-url
func (h *ObjectsHandler) GetDownloadURL(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Objects unavailable"))
		return
	}
	storeID := chi.URLParam(r, "storeId")
	objectID := chi.URLParam(r, "objectId")
	res, err := h.Svc.GetDownloadURL(r.Context(), p.SubjectID, storeID, objectID)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"objectId":     res.ObjectID,
		"downloadUrl":  res.DownloadURL,
		"expiresAt":    res.ExpiresAt.UTC().Format(time.RFC3339Nano),
		"contentType":  res.ContentType,
		"sizeBytes":    res.SizeBytes,
		"cacheControl": res.CacheControl,
	})
}

// CreateDeliveryGrant POST /v1/stores/{storeId}/objects/{objectId}/delivery-grants (stub)
func (h *ObjectsHandler) CreateDeliveryGrant(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Objects unavailable"))
		return
	}
	var body struct {
		GranteeUserID string `json:"granteeUserId"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	storeID := chi.URLParam(r, "storeId")
	objectID := chi.URLParam(r, "objectId")
	g, err := h.Svc.CreateDeliveryGrantStub(r.Context(), p.SubjectID, storeID, objectID, body.GranteeUserID)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusCreated, map[string]any{
		"id":            g.ID,
		"objectId":      g.ObjectID,
		"storeId":       g.StoreID,
		"granteeUserId": g.GranteeUserID,
		"purpose":       g.Purpose,
		"expiresAt":     g.ExpiresAt.UTC().Format(time.RFC3339Nano),
		"maxUses":       g.MaxUses,
	})
}

// objectMetaDTO never returns raw R2 key as a reusable authority field.
// Internal storage key is omitted from public DTO per §4.4 / §10.
func objectMetaDTO(o objects.ObjectRef) map[string]any {
	m := map[string]any{
		"id":                o.ID,
		"purpose":           string(o.Purpose),
		"visibility":        string(o.Visibility),
		"contentType":       o.ContentType,
		"expectedSizeBytes": o.ExpectedSizeBytes,
		"status":            string(o.Status),
		"retentionClass":    string(o.RetentionClass),
		"storeId":           o.OwnerStoreID,
		"merchantId":        o.OwnerMerchantID,
		"uploadExpiresAt":   o.UploadExpiresAt.UTC().Format(time.RFC3339Nano),
		"createdAt":         o.CreatedAt.UTC().Format(time.RFC3339Nano),
		"updatedAt":         o.UpdatedAt.UTC().Format(time.RFC3339Nano),
	}
	if o.ActualSizeBytes != nil {
		m["sizeBytes"] = *o.ActualSizeBytes
	}
	if o.ChecksumSHA256 != nil {
		m["checksumSha256"] = *o.ChecksumSHA256
	}
	if o.LastVerifiedAt != nil {
		m["lastVerifiedAt"] = o.LastVerifiedAt.UTC().Format(time.RFC3339Nano)
	}
	if o.ScanVerdict != nil {
		m["scanVerdict"] = *o.ScanVerdict
	}
	if o.RejectedReason != nil {
		m["rejectedReason"] = *o.RejectedReason
	}
	// Deliberately omit: bucket, objectKey, multipartUploadId, raw storage endpoint.
	return m
}
