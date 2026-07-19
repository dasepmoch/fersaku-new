package handlers

import (
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/decode"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/kyc"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// KYCHandler serves merchant KYC submission + admin review (BE-400).
type KYCHandler struct {
	Svc *application.KYCService
}

func (h *KYCHandler) actorID(r *http.Request) (string, bool) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok || p.SubjectID == "" {
		return "", false
	}
	return p.SubjectID, true
}

// GetStatus GET /v1/me/kyc or /v1/merchants/{merchantId}/kyc
func (h *KYCHandler) GetStatus(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.actorID(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "KYC unavailable"))
		return
	}
	merchantID := chi.URLParam(r, "merchantId")
	if merchantID == "" {
		merchantID = "me"
	}
	view, err := h.Svc.GetStatus(r.Context(), userID, merchantID)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	cases := make([]map[string]any, 0, len(view.Cases))
	for _, c := range view.Cases {
		cases = append(cases, caseDTO(c))
	}
	var open any
	if view.OpenCase != nil {
		open = caseDTO(*view.OpenCase)
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"merchantId":        view.MerchantID,
		"liveCapability":    view.LiveCapability,
		"openCase":          open,
		"cases":             cases,
		"requiredDocuments": view.RequiredDocuments,
		// Explicit: storefront sellers are never forced through this path.
		"requiredFor": "LIVE_QRIS_API_ONLY",
	})
}

// CreateCase POST /v1/me/kyc/cases or /v1/merchants/{merchantId}/kyc/cases
func (h *KYCHandler) CreateCase(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.actorID(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "KYC unavailable"))
		return
	}
	var body struct {
		LegalName          string `json:"legalName"`
		BusinessName       string `json:"businessName"`
		RegistrationNumber string `json:"registrationNumber"`
		CountryCode        string `json:"countryCode"`
		ConsentVersion     string `json:"consentVersion"`
		Submit             bool   `json:"submit"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	merchantID := chi.URLParam(r, "merchantId")
	if merchantID == "" {
		merchantID = "me"
	}
	c, err := h.Svc.CreateCase(r.Context(), userID, merchantID, application.CreateCaseInput{
		LegalName:          body.LegalName,
		BusinessName:       body.BusinessName,
		RegistrationNumber: body.RegistrationNumber,
		CountryCode:        body.CountryCode,
		ConsentVersion:     body.ConsentVersion,
		Submit:             body.Submit,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusCreated, caseDTO(c))
}

// SubmitCase POST .../cases/{caseId}/submit
func (h *KYCHandler) SubmitCase(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.actorID(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "KYC unavailable"))
		return
	}
	merchantID := chi.URLParam(r, "merchantId")
	if merchantID == "" {
		merchantID = "me"
	}
	c, err := h.Svc.SubmitCase(r.Context(), userID, merchantID, chi.URLParam(r, "caseId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, caseDTO(c))
}

// Resubmit POST .../cases/{caseId}/resubmit
func (h *KYCHandler) Resubmit(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.actorID(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "KYC unavailable"))
		return
	}
	var body struct {
		LegalName          string `json:"legalName"`
		BusinessName       string `json:"businessName"`
		RegistrationNumber string `json:"registrationNumber"`
		CountryCode        string `json:"countryCode"`
		ConsentVersion     string `json:"consentVersion"`
		Submit             bool   `json:"submit"`
	}
	// Empty body allowed.
	_ = decode.DecodeJSON(r, &body)
	if !body.Submit {
		body.Submit = true
	}
	merchantID := chi.URLParam(r, "merchantId")
	if merchantID == "" {
		merchantID = "me"
	}
	c, err := h.Svc.Resubmit(r.Context(), userID, merchantID, chi.URLParam(r, "caseId"), application.CreateCaseInput{
		LegalName:          body.LegalName,
		BusinessName:       body.BusinessName,
		RegistrationNumber: body.RegistrationNumber,
		CountryCode:        body.CountryCode,
		ConsentVersion:     body.ConsentVersion,
		Submit:             body.Submit,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, caseDTO(c))
}

// GetCase GET .../cases/{caseId}
func (h *KYCHandler) GetCase(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.actorID(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "KYC unavailable"))
		return
	}
	merchantID := chi.URLParam(r, "merchantId")
	if merchantID == "" {
		merchantID = "me"
	}
	c, docs, err := h.Svc.GetCase(r.Context(), userID, merchantID, chi.URLParam(r, "caseId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	items := make([]map[string]any, 0, len(docs))
	for _, d := range docs {
		items = append(items, documentDTO(d))
	}
	out := caseDTO(c)
	out["documents"] = items
	presenters.WriteData(w, r, http.StatusOK, out)
}

// UploadDocument POST .../cases/{caseId}/documents (multipart, server-mediated)
func (h *KYCHandler) UploadDocument(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.actorID(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "KYC unavailable"))
		return
	}
	// Bound request body (multipart overhead + 10MiB).
	r.Body = http.MaxBytesReader(w, r.Body, kyc.MaxDocumentBytes+1<<20)
	if err := r.ParseMultipartForm(kyc.MaxDocumentBytes + 1<<20); err != nil {
		presenters.WriteAppError(w, r, apperr.Validation(apperr.CodeValidationFailed, "Invalid multipart upload"))
		return
	}
	docType := r.FormValue("documentType")
	if docType == "" {
		docType = r.FormValue("type")
	}
	file, hdr, err := r.FormFile("file")
	if err != nil {
		file, hdr, err = r.FormFile("document")
	}
	if err != nil {
		presenters.WriteAppError(w, r, apperr.Validation(apperr.CodeValidationFailed, "file is required"))
		return
	}
	defer file.Close()
	ct := hdr.Header.Get("Content-Type")
	if ct == "" || ct == "application/octet-stream" {
		ct = r.FormValue("contentType")
	}
	if ct == "" {
		ct = "application/octet-stream"
	}
	// Stream through service (no presign).
	merchantID := chi.URLParam(r, "merchantId")
	if merchantID == "" {
		merchantID = "me"
	}
	// Drain into service with limited reader already applied by MaxBytesReader.
	d, err := h.Svc.UploadDocument(r.Context(), userID, merchantID, chi.URLParam(r, "caseId"), docType, ct, io.LimitReader(file, kyc.MaxDocumentBytes+1))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	presenters.WriteData(w, r, http.StatusCreated, documentDTO(d))
}

// GetDocument GET .../documents/{documentId} metadata only
func (h *KYCHandler) GetDocument(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.actorID(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "KYC unavailable"))
		return
	}
	merchantID := chi.URLParam(r, "merchantId")
	if merchantID == "" {
		merchantID = "me"
	}
	d, err := h.Svc.GetDocumentMeta(r.Context(), userID, merchantID, chi.URLParam(r, "caseId"), chi.URLParam(r, "documentId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	presenters.WriteData(w, r, http.StatusOK, documentDTO(d))
}

// RejectKYCPresign explicitly rejects any KYC browser-to-R2 presign attempt.
func RejectKYCPresign(w http.ResponseWriter, r *http.Request) {
	presenters.WriteAppError(w, r, kyc.ErrPresignForbidden)
}

// AdminList GET /v1/admin/kyc
func (h *KYCHandler) AdminList(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.actorID(r); !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "KYC unavailable"))
		return
	}
	status := r.URL.Query().Get("status")
	limit := int32(50)
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 200 {
			limit = int32(n)
		}
	}
	list, err := h.Svc.AdminListQueue(r.Context(), status, limit)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	// Optional ageMinutes filter: 30 | 120 (queue SLA).
	minAge := 0
	switch strings.TrimSpace(r.URL.Query().Get("age")) {
	case "30m", "30":
		minAge = 30
	case "2h", "120m", "120":
		minAge = 120
	}
	items := make([]map[string]any, 0, len(list))
	for _, c := range list {
		dto := caseDTO(c)
		// Queue age SLA signal without PII (ageMinutes + queueAgeSeconds for FE).
		if c.SubmittedAt != nil {
			secs := int64(time.Since(*c.SubmittedAt).Seconds())
			mins := int(secs / 60)
			if minAge > 0 && mins < minAge {
				continue
			}
			dto["queueAgeSeconds"] = secs
			dto["ageMinutes"] = mins
		} else if minAge > 0 {
			continue
		}
		// rejectionReason alias for FE KYC queue (stored in reason on reject).
		if c.Reason != "" {
			dto["rejectionReason"] = c.Reason
		}
		items = append(items, dto)
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"items": items})
}

// AdminGet GET /v1/admin/kyc/{caseId}
func (h *KYCHandler) AdminGet(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.actorID(r); !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "KYC unavailable"))
		return
	}
	c, docs, tr, err := h.Svc.AdminGetCase(r.Context(), chi.URLParam(r, "caseId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	docItems := make([]map[string]any, 0, len(docs))
	for _, d := range docs {
		docItems = append(docItems, documentDTO(d))
	}
	trItems := make([]map[string]any, 0, len(tr))
	for _, t := range tr {
		trItems = append(trItems, map[string]any{
			"id":         t.ID,
			"fromStatus": t.FromStatus,
			"toStatus":   t.ToStatus,
			"reason":     t.Reason,
			"createdAt":  t.CreatedAt.UTC().Format(time.RFC3339),
		})
	}
	out := caseDTO(c)
	out["documents"] = docItems
	out["transitions"] = trItems
	// No raw R2 key / decrypt stream URL in list DTO.
	presenters.WriteData(w, r, http.StatusOK, out)
}

// AdminTransition POST /v1/admin/kyc/{caseId}/transition
func (h *KYCHandler) AdminTransition(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.actorID(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "KYC unavailable"))
		return
	}
	var body struct {
		Action string `json:"action"`
		Reason string `json:"reason"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	// Also accept status as alias for action.
	if body.Action == "" {
		// try alternate field names via raw parse already done
	}
	c, err := h.Svc.AdminTransition(r.Context(), chi.URLParam(r, "caseId"), body.Action, body.Reason, userID)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, caseDTO(c))
}

// AdminDocumentContent GET /v1/admin/kyc/{caseId}/documents/{documentId}/content
// Server-mediated decrypt stream: permission + recent MFA at router; no-store; never raw R2 URL.
func (h *KYCHandler) AdminDocumentContent(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.actorID(r)
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "KYC unavailable"))
		return
	}
	reason := strings.TrimSpace(r.Header.Get("X-Audit-Reason"))
	if reason == "" {
		reason = strings.TrimSpace(r.URL.Query().Get("reason"))
	}
	// Recent MFA already validated + consumed by RequireRecentMFAProof middleware.
	content, err := h.Svc.AdminOpenDocumentContent(
		r.Context(),
		chi.URLParam(r, "caseId"),
		chi.URLParam(r, "documentId"),
		userID,
		reason,
	)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	// Bound response; zero plaintext after write via defer.
	plain := content.Plaintext
	defer func() {
		for i := range plain {
			plain[i] = 0
		}
	}()

	w.Header().Set("Cache-Control", "no-store, private")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
	w.Header().Set("Content-Type", content.ContentType)
	// Safe disposition: inline for images/pdf viewer; filename is opaque document id only.
	w.Header().Set(
		"Content-Disposition",
		`inline; filename="kyc-`+content.DocumentID+`"`,
	)
	w.Header().Set("Content-Length", strconv.FormatInt(content.SizeBytes, 10))
	// Extra identifiers for FE (never PII payload).
	w.Header().Set("X-KYC-Document-Id", content.DocumentID)
	w.Header().Set("X-KYC-Document-Type", content.DocType)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(plain)
}

func caseDTO(c kyc.Case) map[string]any {
	m := map[string]any{
		"id":                  c.ID,
		"merchantId":          c.MerchantID,
		"capability":          c.Capability,
		"status":              c.Status,
		"version":             c.Version,
		"legalName":           c.LegalName,
		"businessName":        c.BusinessName,
		"registrationNumber":  c.RegistrationNumber,
		"countryCode":         c.CountryCode,
		"consentVersion":      c.ConsentVersion,
		"reason":              c.Reason,
		"clarificationReason": c.ClarificationReason,
		"createdAt":           c.CreatedAt.UTC().Format(time.RFC3339),
		"updatedAt":           c.UpdatedAt.UTC().Format(time.RFC3339),
	}
	if c.StoreID != nil {
		m["storeId"] = *c.StoreID
	}
	if c.PredecessorCaseID != nil {
		m["predecessorCaseId"] = *c.PredecessorCaseID
	}
	if c.SubmittedAt != nil {
		m["submittedAt"] = c.SubmittedAt.UTC().Format(time.RFC3339)
	}
	if c.ApprovedAt != nil {
		m["approvedAt"] = c.ApprovedAt.UTC().Format(time.RFC3339)
	}
	if c.RejectedAt != nil {
		m["rejectedAt"] = c.RejectedAt.UTC().Format(time.RFC3339)
	}
	if c.ReviewedAt != nil {
		m["reviewedAt"] = c.ReviewedAt.UTC().Format(time.RFC3339)
	}
	return m
}

func documentDTO(d kyc.Document) map[string]any {
	// Metadata only: never raw storage key as reusable URL, never plaintext.
	m := map[string]any{
		"id":                   d.ID,
		"caseId":               d.CaseID,
		"documentType":         d.DocumentType,
		"status":               d.Status,
		"contentType":          d.ContentType,
		"sizeBytes":            d.SizeBytes,
		"checksumSha256":       d.ChecksumSHA256,
		"encryptionKeyVersion": d.EncryptionKeyVersion,
		"ciphertextSizeBytes":  d.CiphertextSizeBytes,
		"scanStatus":           d.ScanStatus,
		"docVersion":           d.DocVersion,
		"createdAt":            d.CreatedAt.UTC().Format(time.RFC3339),
		"updatedAt":            d.UpdatedAt.UTC().Format(time.RFC3339),
		// Explicit contract: no presigned URL field.
		"uploadMode": "SERVER_MEDIATED",
	}
	if d.ReadyAt != nil {
		m["readyAt"] = d.ReadyAt.UTC().Format(time.RFC3339)
	}
	return m
}

// ensure strings import used
var _ = strings.TrimSpace
