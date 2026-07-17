package application

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/gateway"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/kyc"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
	"github.com/dasepmoch/fersaku-new/backend/internal/security"
)

// KYCService owns live QRIS API KYC workflow (BE-400). Storefront is unaffected.
// Approval enables LIVE capability + AUTHORIZED issuance request; raw key claim is BE-410.
type KYCService struct {
	Store         KYCStore
	Objects       ports.ObjectStore
	BucketPrivate string
	EncryptionKey string
	// LocalScanPass when true (local/test) marks malware scan as PASSED without external scanner.
	LocalScanPass bool
	IDs           ports.IDGenerator
	Clock         ports.Clock
	Log           ports.Logger
}

func (s *KYCService) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now().UTC()
	}
	return time.Now().UTC()
}

func (s *KYCService) newID(prefix string) string {
	id := s.IDs.New()
	if !strings.HasPrefix(id, prefix) {
		id = prefix + id
	}
	return id
}

// ResolveMerchantForUser returns merchantID for owner or active member; cross-tenant → NOT_FOUND.
func (s *KYCService) ResolveMerchantForUser(ctx context.Context, userID, merchantID string) (string, error) {
	if userID == "" {
		return "", apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required")
	}
	if merchantID == "" || merchantID == "me" {
		mid, st, err := s.Store.GetMerchantByOwner(ctx, userID)
		if err != nil {
			if s.Store.IsNotFound(err) {
				return "", apperr.NotFound(apperr.CodeResourceNotFound, "Merchant not found")
			}
			return "", apperr.Internal(apperr.CodeInternalError, "Merchant lookup failed")
		}
		if strings.EqualFold(st, "SUSPENDED") || strings.EqualFold(st, "CLOSED") {
			return "", apperr.Forbidden(apperr.CodeMerchantSuspended, "Merchant is suspended")
		}
		return mid, nil
	}
	// Explicit merchantId: must be active member (non-enumerating 404 on mismatch).
	_, err := s.Store.MerchantMemberActive(ctx, merchantID, userID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return "", apperr.NotFound(apperr.CodeResourceNotFound, "Merchant not found")
		}
		return "", apperr.Internal(apperr.CodeInternalError, "Membership lookup failed")
	}
	return merchantID, nil
}

// GetStatus returns current open case or latest cases + LIVE capability for merchant.
func (s *KYCService) GetStatus(ctx context.Context, userID, merchantID string) (KYCStatusView, error) {
	mid, err := s.ResolveMerchantForUser(ctx, userID, merchantID)
	if err != nil {
		return KYCStatusView{}, err
	}
	cases, err := s.Store.ListCasesByMerchant(ctx, mid, 10)
	if err != nil {
		return KYCStatusView{}, apperr.Internal(apperr.CodeInternalError, "Failed to list KYC cases")
	}
	var open *kyc.Case
	if oc, err := s.Store.GetOpenCaseByMerchant(ctx, mid); err == nil {
		open = &oc
	} else if !s.Store.IsNotFound(err) {
		return KYCStatusView{}, apperr.Internal(apperr.CodeInternalError, "Failed to load open KYC case")
	}
	capStatus := gateway.CapStatusInactive
	if cap, err := s.Store.GetCapability(ctx, mid, gateway.ModeLive, gateway.CapabilityQRISAPI); err == nil {
		capStatus = cap.Status
	} else if !s.Store.IsNotFound(err) {
		return KYCStatusView{}, apperr.Internal(apperr.CodeInternalError, "Capability lookup failed")
	}
	return KYCStatusView{
		MerchantID:        mid,
		LiveCapability:    capStatus,
		OpenCase:          open,
		Cases:             cases,
		RequiredDocuments: kyc.MandatoryDocumentTypes,
	}, nil
}

// KYCStatusView is merchant-facing status.
type KYCStatusView struct {
	MerchantID        string
	LiveCapability    string
	OpenCase          *kyc.Case
	Cases             []kyc.Case
	RequiredDocuments []string
}

// CreateCaseInput is merchant case create/submit payload.
type CreateCaseInput struct {
	LegalName          string
	BusinessName       string
	RegistrationNumber string
	CountryCode        string
	ConsentVersion     string
	// Submit when true transitions DRAFT → SUBMITTED after create (if documents ready later may still be DRAFT).
	Submit bool
}

// CreateCase creates a DRAFT (or SUBMITTED) case. Non-API sellers are never forced here.
func (s *KYCService) CreateCase(ctx context.Context, userID, merchantID string, in CreateCaseInput) (kyc.Case, error) {
	mid, err := s.ResolveMerchantForUser(ctx, userID, merchantID)
	if err != nil {
		return kyc.Case{}, err
	}
	if _, err := s.Store.GetOpenCaseByMerchant(ctx, mid); err == nil {
		return kyc.Case{}, kyc.ErrOpenCaseExists
	} else if !s.Store.IsNotFound(err) {
		return kyc.Case{}, apperr.Internal(apperr.CodeInternalError, "Open case lookup failed")
	}
	legal := strings.TrimSpace(in.LegalName)
	if legal == "" {
		return kyc.Case{}, apperr.Validation(apperr.CodeValidationFailed, "legalName is required")
	}
	consent := strings.TrimSpace(in.ConsentVersion)
	if consent == "" {
		consent = kyc.ConsentVersionV1
	}
	country := strings.TrimSpace(in.CountryCode)
	if country == "" {
		country = "ID"
	}
	now := s.now()
	var storeID *string
	if sid, err := s.Store.GetCanonicalStoreID(ctx, mid); err == nil && sid != "" {
		storeID = &sid
	}
	c := kyc.Case{
		ID:                 s.newID("kyc_"),
		MerchantID:         mid,
		StoreID:            storeID,
		Capability:         kyc.CapabilityQRISAPILive,
		Status:             kyc.StatusDraft,
		Version:            1,
		LegalName:          legal,
		BusinessName:       strings.TrimSpace(in.BusinessName),
		RegistrationNumber: strings.TrimSpace(in.RegistrationNumber),
		CountryCode:        country,
		ConsentVersion:     consent,
		ConsentAcceptedAt:  &now,
		CreatedAt:          now,
		UpdatedAt:          now,
	}
	if err := s.Store.InsertCase(ctx, c); err != nil {
		if s.Store.IsUniqueViolation(err) {
			return kyc.Case{}, kyc.ErrOpenCaseExists
		}
		return kyc.Case{}, apperr.Internal(apperr.CodeInternalError, "Failed to create KYC case")
	}
	// Ensure PENDING_KYC capability row + pending issuance (no live key yet).
	_ = s.ensurePendingCapability(ctx, mid)
	_ = s.ensurePendingIssuance(ctx, mid, userID, c.ID, c.Version)

	if in.Submit {
		return s.submitCase(ctx, userID, c, true)
	}
	return c, nil
}

func (s *KYCService) ensurePendingCapability(ctx context.Context, merchantID string) error {
	now := s.now()
	existing, err := s.Store.GetCapability(ctx, merchantID, gateway.ModeLive, gateway.CapabilityQRISAPI)
	if err == nil && existing.Status == gateway.CapStatusActive {
		return nil // already live
	}
	id := s.newID("cap_")
	if err == nil && existing.ID != "" {
		id = existing.ID
	}
	return s.Store.UpsertCapability(ctx, gateway.Capability{
		ID:          id,
		MerchantID:  merchantID,
		PaymentMode: gateway.ModeLive,
		Capability:  gateway.CapabilityQRISAPI,
		Status:      gateway.CapStatusPendingKYC,
		CreatedAt:   now,
		UpdatedAt:   now,
	})
}

func (s *KYCService) ensurePendingIssuance(ctx context.Context, merchantID, userID, caseID string, version int32) error {
	if _, err := s.Store.GetOutstandingIssuance(ctx, merchantID, gateway.ModeLive); err == nil {
		return nil
	} else if !s.Store.IsNotFound(err) {
		return err
	}
	now := s.now()
	cid := caseID
	v := version
	ir := kyc.IssuanceRequest{
		ID:              s.newID("iss_"),
		MerchantID:      merchantID,
		PaymentMode:     gateway.ModeLive,
		Purpose:         "API_KEY",
		Capability:      gateway.CapabilityQRISAPI,
		Status:          kyc.IssuancePendingKYC,
		KYCCaseID:       &cid,
		KYCVersion:      &v,
		RequesterUserID: &userID,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	return s.Store.InsertIssuanceRequest(ctx, ir)
}

// SubmitCase transitions DRAFT → SUBMITTED (or resubmit path via Resubmit).
func (s *KYCService) SubmitCase(ctx context.Context, userID, merchantID, caseID string) (kyc.Case, error) {
	mid, err := s.ResolveMerchantForUser(ctx, userID, merchantID)
	if err != nil {
		return kyc.Case{}, err
	}
	c, err := s.Store.GetCaseByID(ctx, caseID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return kyc.Case{}, apperr.NotFound(apperr.CodeResourceNotFound, "KYC case not found")
		}
		return kyc.Case{}, apperr.Internal(apperr.CodeInternalError, "Case lookup failed")
	}
	if c.MerchantID != mid {
		return kyc.Case{}, apperr.NotFound(apperr.CodeResourceNotFound, "KYC case not found")
	}
	return s.submitCase(ctx, userID, c, false)
}

func (s *KYCService) submitCase(ctx context.Context, userID string, c kyc.Case, fromCreate bool) (kyc.Case, error) {
	from := c.Status
	if from != kyc.StatusDraft && from != kyc.StatusNeedsClarification {
		return kyc.Case{}, kyc.ErrInvalidTransition
	}
	// Mandatory docs must be READY before SUBMITTED.
	if err := s.requireMandatoryReady(ctx, c.ID); err != nil {
		return kyc.Case{}, err
	}
	if err := kyc.AssertTransition(from, kyc.StatusSubmitted); err != nil {
		return kyc.Case{}, kyc.ErrInvalidTransition
	}
	now := s.now()
	c.Status = kyc.StatusSubmitted
	c.Version++
	c.SubmittedAt = &now
	c.UpdatedAt = now
	if from == kyc.StatusNeedsClarification {
		c.ClarificationReason = ""
	}
	var updated kyc.Case
	err := s.Store.WithTx(ctx, func(ctx context.Context) error {
		var uerr error
		updated, uerr = s.Store.UpdateCaseStatus(ctx, c)
		if uerr != nil {
			return uerr
		}
		return s.Store.InsertTransition(ctx, kyc.Transition{
			ID:          s.newID("kyt_"),
			CaseID:      c.ID,
			FromStatus:  from,
			ToStatus:    kyc.StatusSubmitted,
			ActorUserID: &userID,
			Reason:      "merchant_submit",
			Metadata:    []byte(fmt.Sprintf(`{"fromCreate":%v}`, fromCreate)),
			CreatedAt:   now,
		})
	})
	if err != nil {
		return kyc.Case{}, apperr.Internal(apperr.CodeInternalError, "Failed to submit KYC case")
	}
	return updated, nil
}

func (s *KYCService) requireMandatoryReady(ctx context.Context, caseID string) error {
	for _, t := range kyc.MandatoryDocumentTypes {
		n, err := s.Store.CountReadyDocumentsByType(ctx, caseID, t)
		if err != nil {
			return apperr.Internal(apperr.CodeInternalError, "Document check failed")
		}
		if n < 1 {
			return kyc.ErrDocumentNotReady
		}
	}
	return nil
}

// Resubmit creates versioned SUBMITTED after NEEDS_CLARIFICATION (same case).
func (s *KYCService) Resubmit(ctx context.Context, userID, merchantID, caseID string, in CreateCaseInput) (kyc.Case, error) {
	mid, err := s.ResolveMerchantForUser(ctx, userID, merchantID)
	if err != nil {
		return kyc.Case{}, err
	}
	c, err := s.Store.GetCaseByID(ctx, caseID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return kyc.Case{}, apperr.NotFound(apperr.CodeResourceNotFound, "KYC case not found")
		}
		return kyc.Case{}, apperr.Internal(apperr.CodeInternalError, "Case lookup failed")
	}
	if c.MerchantID != mid {
		return kyc.Case{}, apperr.NotFound(apperr.CodeResourceNotFound, "KYC case not found")
	}
	if c.Status != kyc.StatusNeedsClarification {
		// Terminal: create linked successor DRAFT then submit if requested.
		if kyc.IsTerminal(c.Status) {
			return s.createSuccessor(ctx, userID, mid, c, in)
		}
		return kyc.Case{}, kyc.ErrInvalidTransition
	}
	if legal := strings.TrimSpace(in.LegalName); legal != "" {
		c.LegalName = legal
	}
	if bn := strings.TrimSpace(in.BusinessName); bn != "" {
		c.BusinessName = bn
	}
	if rn := strings.TrimSpace(in.RegistrationNumber); rn != "" {
		c.RegistrationNumber = rn
	}
	return s.submitCase(ctx, userID, c, false)
}

func (s *KYCService) createSuccessor(ctx context.Context, userID, mid string, prev kyc.Case, in CreateCaseInput) (kyc.Case, error) {
	// Ensure no open case.
	if _, err := s.Store.GetOpenCaseByMerchant(ctx, mid); err == nil {
		return kyc.Case{}, kyc.ErrOpenCaseExists
	} else if !s.Store.IsNotFound(err) {
		return kyc.Case{}, apperr.Internal(apperr.CodeInternalError, "Open case lookup failed")
	}
	legal := strings.TrimSpace(in.LegalName)
	if legal == "" {
		legal = prev.LegalName
	}
	now := s.now()
	pred := prev.ID
	c := kyc.Case{
		ID:                 s.newID("kyc_"),
		MerchantID:         mid,
		StoreID:            prev.StoreID,
		Capability:         kyc.CapabilityQRISAPILive,
		Status:             kyc.StatusDraft,
		Version:            1,
		LegalName:          legal,
		BusinessName:       firstNonEmpty(strings.TrimSpace(in.BusinessName), prev.BusinessName),
		RegistrationNumber: firstNonEmpty(strings.TrimSpace(in.RegistrationNumber), prev.RegistrationNumber),
		CountryCode:        firstNonEmpty(strings.TrimSpace(in.CountryCode), prev.CountryCode),
		ConsentVersion:     firstNonEmpty(strings.TrimSpace(in.ConsentVersion), prev.ConsentVersion),
		ConsentAcceptedAt:  &now,
		PredecessorCaseID:  &pred,
		CreatedAt:          now,
		UpdatedAt:          now,
	}
	if err := s.Store.InsertCase(ctx, c); err != nil {
		return kyc.Case{}, apperr.Internal(apperr.CodeInternalError, "Failed to create successor KYC case")
	}
	if in.Submit {
		return s.submitCase(ctx, userID, c, true)
	}
	return c, nil
}

func firstNonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

// GetCase loads a case with ownership check.
func (s *KYCService) GetCase(ctx context.Context, userID, merchantID, caseID string) (kyc.Case, []kyc.Document, error) {
	mid, err := s.ResolveMerchantForUser(ctx, userID, merchantID)
	if err != nil {
		return kyc.Case{}, nil, err
	}
	c, err := s.Store.GetCaseByID(ctx, caseID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return kyc.Case{}, nil, apperr.NotFound(apperr.CodeResourceNotFound, "KYC case not found")
		}
		return kyc.Case{}, nil, apperr.Internal(apperr.CodeInternalError, "Case lookup failed")
	}
	if c.MerchantID != mid {
		return kyc.Case{}, nil, apperr.NotFound(apperr.CodeResourceNotFound, "KYC case not found")
	}
	docs, err := s.Store.ListDocumentsByCase(ctx, caseID)
	if err != nil {
		return kyc.Case{}, nil, apperr.Internal(apperr.CodeInternalError, "Document list failed")
	}
	return c, docs, nil
}

// GetDocumentMeta returns document metadata only (no decrypt stream for merchant).
func (s *KYCService) GetDocumentMeta(ctx context.Context, userID, merchantID, caseID, documentID string) (kyc.Document, error) {
	_, docs, err := s.GetCase(ctx, userID, merchantID, caseID)
	if err != nil {
		return kyc.Document{}, err
	}
	for _, d := range docs {
		if d.ID == documentID {
			// Never expose storage key as reusable URL authority in DTO layer.
			return d, nil
		}
	}
	return kyc.Document{}, apperr.NotFound(apperr.CodeResourceNotFound, "Document not found")
}

// UploadDocument streams multipart body: size/type/checksum → scan → encrypt → private R2.
// Never issues browser-to-R2 presign.
func (s *KYCService) UploadDocument(ctx context.Context, userID, merchantID, caseID, docType, contentType string, body io.Reader) (kyc.Document, error) {
	mid, err := s.ResolveMerchantForUser(ctx, userID, merchantID)
	if err != nil {
		return kyc.Document{}, err
	}
	c, err := s.Store.GetCaseByID(ctx, caseID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return kyc.Document{}, apperr.NotFound(apperr.CodeResourceNotFound, "KYC case not found")
		}
		return kyc.Document{}, apperr.Internal(apperr.CodeInternalError, "Case lookup failed")
	}
	if c.MerchantID != mid {
		return kyc.Document{}, apperr.NotFound(apperr.CodeResourceNotFound, "KYC case not found")
	}
	if c.Status != kyc.StatusDraft && c.Status != kyc.StatusNeedsClarification {
		return kyc.Document{}, kyc.ErrCaseImmutable
	}
	docType = strings.ToUpper(strings.TrimSpace(docType))
	if !kyc.ValidDocumentType(docType) {
		return kyc.Document{}, kyc.ErrDocumentInvalid
	}
	contentType = strings.ToLower(strings.TrimSpace(contentType))
	if contentType == "image/jpg" {
		contentType = "image/jpeg"
	}
	if s.EncryptionKey == "" {
		return kyc.Document{}, apperr.Internal(apperr.CodeInternalError, "KYC encryption key unavailable")
	}
	if s.Objects == nil || !s.Objects.Configured() {
		return kyc.Document{}, apperr.Internal(apperr.CodeInternalError, "Object store unavailable")
	}
	bucket := s.BucketPrivate
	if bucket == "" {
		bucket = "fersaku-private"
	}

	// Bounded stream into memory (max 10MiB + small overhead for type sniff).
	limited := io.LimitReader(body, kyc.MaxDocumentBytes+1)
	plain, err := io.ReadAll(limited)
	if err != nil {
		return kyc.Document{}, apperr.Validation(apperr.CodeValidationFailed, "Failed to read document stream")
	}
	if int64(len(plain)) > kyc.MaxDocumentBytes {
		return kyc.Document{}, apperr.Validation(apperr.CodeValidationFailed, "Document exceeds maximum size")
	}
	if int64(len(plain)) < kyc.MinDocumentBytes {
		return kyc.Document{}, apperr.Validation(apperr.CodeValidationFailed, "Document too small")
	}
	// Prefer magic-byte sniff when client sends octet-stream or empty type.
	if sniffed := sniffContentType(plain); sniffed != "" {
		if contentType == "" || contentType == "application/octet-stream" || !kyc.AllowedContentTypes[contentType] {
			contentType = sniffed
		} else if contentType != sniffed {
			return kyc.Document{}, apperr.Validation(apperr.CodeValidationFailed, "Content type does not match payload")
		}
	}
	if !kyc.AllowedContentTypes[contentType] {
		return kyc.Document{}, apperr.Validation(apperr.CodeValidationFailed, "Unsupported content type for KYC document")
	}
	if !sniffContentOK(contentType, plain) {
		return kyc.Document{}, apperr.Validation(apperr.CodeValidationFailed, "Content type does not match payload")
	}

	// Malware/file validator (local/test: pass; production hook would fail closed).
	scanStatus := kyc.ScanPassed
	scanDetail := "local_pass"
	if !s.LocalScanPass {
		// Minimal heuristic scan: reject EICAR signature and empty-looking PDF shells.
		if bytes.Contains(plain, []byte("EICAR-STANDARD-ANTIVIRUS-TEST-FILE")) {
			return kyc.Document{}, apperr.Validation(apperr.CodeValidationFailed, "Document failed malware scan")
		}
		scanDetail = "heuristic_pass"
	}

	plainLen := int64(len(plain))
	sum := sha256.Sum256(plain)
	checksum := hex.EncodeToString(sum[:])
	kv, cipher, err := security.EncryptAEAD(s.EncryptionKey, plain)
	if err != nil {
		return kyc.Document{}, apperr.Internal(apperr.CodeInternalError, "Document encryption failed")
	}
	for i := range plain {
		plain[i] = 0
	}

	now := s.now()
	docID := s.newID("kyd_")
	existing, _ := s.Store.ListDocumentsByCase(ctx, caseID)
	var ver int32 = 1
	for _, e := range existing {
		if e.DocumentType == docType && e.DocVersion >= ver {
			ver = e.DocVersion + 1
		}
	}
	storageKey := fmt.Sprintf("private-kyc/%s/%s/%s/v%d", mid, caseID, docID, ver)
	if err := s.Objects.PutObjectBytes(ctx, bucket, storageKey, "application/octet-stream", cipher); err != nil {
		return kyc.Document{}, apperr.Internal(apperr.CodeInternalError, "Failed to store encrypted document")
	}

	d := kyc.Document{
		ID:                   docID,
		CaseID:               caseID,
		MerchantID:           mid,
		DocumentType:         docType,
		Status:               kyc.DocStatusReady,
		ContentType:          contentType,
		SizeBytes:            plainLen,
		ChecksumSHA256:       checksum,
		StorageBucket:        bucket,
		StorageKey:           storageKey,
		EncryptionKeyVersion: kv,
		CiphertextSizeBytes:  int64(len(cipher)),
		ScanStatus:           scanStatus,
		ScanDetail:           scanDetail,
		DocVersion:           ver,
		UploadedBy:           &userID,
		ReadyAt:              &now,
		CreatedAt:            now,
		UpdatedAt:            now,
	}
	if err := s.Store.InsertDocument(ctx, d); err != nil {
		_ = s.Objects.DeleteObject(ctx, bucket, storageKey)
		return kyc.Document{}, apperr.Internal(apperr.CodeInternalError, "Failed to persist document metadata")
	}
	return d, nil
}

func sniffContentType(b []byte) string {
	if len(b) < 4 {
		return ""
	}
	if b[0] == 0xFF && b[1] == 0xD8 {
		return "image/jpeg"
	}
	if b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47 {
		return "image/png"
	}
	if bytes.HasPrefix(b, []byte("%PDF")) {
		return "application/pdf"
	}
	return ""
}

func sniffContentOK(contentType string, b []byte) bool {
	return sniffContentType(b) == contentType
}

// ---------- Admin ----------

// AdminListQueue returns cases for review (kyc.review permission at HTTP layer).
func (s *KYCService) AdminListQueue(ctx context.Context, status string, limit int32) ([]kyc.Case, error) {
	var st *string
	if status != "" {
		s2 := strings.ToUpper(strings.TrimSpace(status))
		st = &s2
	}
	list, err := s.Store.ListAdminQueue(ctx, st, limit)
	if err != nil {
		return nil, apperr.Internal(apperr.CodeInternalError, "Failed to list KYC queue")
	}
	return list, nil
}

// AdminGetCase returns case + documents + transitions.
func (s *KYCService) AdminGetCase(ctx context.Context, caseID string) (kyc.Case, []kyc.Document, []kyc.Transition, error) {
	c, err := s.Store.GetCaseByID(ctx, caseID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return kyc.Case{}, nil, nil, apperr.NotFound(apperr.CodeResourceNotFound, "KYC case not found")
		}
		return kyc.Case{}, nil, nil, apperr.Internal(apperr.CodeInternalError, "Case lookup failed")
	}
	docs, err := s.Store.ListDocumentsByCase(ctx, caseID)
	if err != nil {
		return kyc.Case{}, nil, nil, apperr.Internal(apperr.CodeInternalError, "Document list failed")
	}
	tr, err := s.Store.ListTransitionsByCase(ctx, caseID)
	if err != nil {
		return kyc.Case{}, nil, nil, apperr.Internal(apperr.CodeInternalError, "Transition list failed")
	}
	return c, docs, tr, nil
}

// AdminTransition applies approve/reject/clarification/etc.
// APPROVE enables LIVE capability + authorizes pending issuance (no raw key).
func (s *KYCService) AdminTransition(ctx context.Context, caseID, action, reason, actorUserID string) (kyc.Case, error) {
	to, ok := kyc.AdminActionToStatus(strings.ToUpper(strings.TrimSpace(action)))
	if !ok {
		return kyc.Case{}, apperr.Validation(apperr.CodeValidationFailed, "Invalid KYC transition action")
	}
	reason = strings.TrimSpace(reason)
	if kyc.RequiresReason(to) && reason == "" {
		return kyc.Case{}, kyc.ErrReasonRequired
	}

	c, err := s.Store.GetCaseByID(ctx, caseID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return kyc.Case{}, apperr.NotFound(apperr.CodeResourceNotFound, "KYC case not found")
		}
		return kyc.Case{}, apperr.Internal(apperr.CodeInternalError, "Case lookup failed")
	}
	from := c.Status
	needReviewHop := from == kyc.StatusSubmitted && to != kyc.StatusInReview &&
		(to == kyc.StatusApproved || to == kyc.StatusRejected || to == kyc.StatusNeedsClarification || to == kyc.StatusVendorCheck)
	checkFrom := from
	if needReviewHop {
		checkFrom = kyc.StatusInReview
	}
	if !needReviewHop {
		if err := kyc.AssertTransition(from, to); err != nil {
			return kyc.Case{}, kyc.ErrInvalidTransition
		}
	} else if err := kyc.AssertTransition(kyc.StatusInReview, to); err != nil {
		return kyc.Case{}, kyc.ErrInvalidTransition
	}
	_ = checkFrom
	if to == kyc.StatusApproved {
		if err := s.requireMandatoryReady(ctx, c.ID); err != nil {
			return kyc.Case{}, err
		}
	}

	now := s.now()
	var updated kyc.Case
	err = s.Store.WithTx(ctx, func(ctx context.Context) error {
		cur := c
		if needReviewHop {
			cur.Status = kyc.StatusInReview
			cur.Version++
			cur.UpdatedAt = now
			cur.ReviewerUserID = &actorUserID
			cur.ReviewedAt = &now
			hop, uerr := s.Store.UpdateCaseStatus(ctx, cur)
			if uerr != nil {
				return uerr
			}
			if err := s.Store.InsertTransition(ctx, kyc.Transition{
				ID:          s.newID("kyt_"),
				CaseID:      cur.ID,
				FromStatus:  from,
				ToStatus:    kyc.StatusInReview,
				ActorUserID: &actorUserID,
				Reason:      "auto_start_review",
				CreatedAt:   now,
			}); err != nil {
				return err
			}
			cur = hop
			from = kyc.StatusInReview
		}
		cur.Status = to
		cur.Version++
		cur.UpdatedAt = now
		cur.ReviewerUserID = &actorUserID
		cur.ReviewedAt = &now
		switch to {
		case kyc.StatusApproved:
			cur.ApprovedAt = &now
			cur.Reason = reason
		case kyc.StatusRejected:
			cur.RejectedAt = &now
			cur.Reason = reason
		case kyc.StatusNeedsClarification:
			cur.ClarificationReason = reason
			cur.Reason = reason
		case kyc.StatusExpired:
			cur.ExpiresAt = &now
			cur.Reason = reason
		default:
			if reason != "" {
				cur.Reason = reason
			}
		}
		var uerr error
		updated, uerr = s.Store.UpdateCaseStatus(ctx, cur)
		if uerr != nil {
			return uerr
		}
		if err := s.Store.InsertTransition(ctx, kyc.Transition{
			ID:          s.newID("kyt_"),
			CaseID:      cur.ID,
			FromStatus:  from,
			ToStatus:    to,
			ActorUserID: &actorUserID,
			Reason:      reason,
			Metadata:    []byte(fmt.Sprintf(`{"action":%q}`, action)),
			CreatedAt:   now,
		}); err != nil {
			return err
		}
		if to == kyc.StatusApproved {
			return s.onApprove(ctx, updated, actorUserID, now)
		}
		if to == kyc.StatusExpired || to == kyc.StatusRejected {
			return s.onDenyLive(ctx, updated, to, reason, now)
		}
		return nil
	})
	if err != nil {
		if ae, ok := apperr.AsAppError(err); ok {
			return kyc.Case{}, ae
		}
		return kyc.Case{}, apperr.Internal(apperr.CodeInternalError, "KYC transition failed")
	}
	return updated, nil
}

func (s *KYCService) onApprove(ctx context.Context, c kyc.Case, actor string, now time.Time) error {
	// Enable LIVE QRIS_API capability with kyc case/version.
	caseID := c.ID
	ver := c.Version
	capID := s.newID("cap_")
	if existing, err := s.Store.GetCapability(ctx, c.MerchantID, gateway.ModeLive, gateway.CapabilityQRISAPI); err == nil && existing.ID != "" {
		capID = existing.ID
	}
	if err := s.Store.UpsertCapability(ctx, gateway.Capability{
		ID:          capID,
		MerchantID:  c.MerchantID,
		PaymentMode: gateway.ModeLive,
		Capability:  gateway.CapabilityQRISAPI,
		Status:      gateway.CapStatusActive,
		KYCCaseID:   &caseID,
		KYCVersion:  &ver,
		EffectiveAt: &now,
		CreatedAt:   now,
		UpdatedAt:   now,
	}); err != nil {
		return err
	}

	// Authorize outstanding issuance (or create AUTHORIZED). Never return raw key.
	var ir kyc.IssuanceRequest
	existing, err := s.Store.GetOutstandingIssuance(ctx, c.MerchantID, gateway.ModeLive)
	if err != nil {
		if !s.Store.IsNotFound(err) {
			return err
		}
		exp := now.Add(7 * 24 * time.Hour)
		ir = kyc.IssuanceRequest{
			ID:               s.newID("iss_"),
			MerchantID:       c.MerchantID,
			PaymentMode:      gateway.ModeLive,
			Purpose:          "API_KEY",
			Capability:       gateway.CapabilityQRISAPI,
			Status:           kyc.IssuanceAuthorized,
			KYCCaseID:        &caseID,
			KYCVersion:       &ver,
			AuthorizerUserID: &actor,
			Reason:           "kyc_approved",
			AuthorizedAt:     &now,
			ExpiresAt:        &exp,
			CreatedAt:        now,
			UpdatedAt:        now,
		}
		if err := s.Store.InsertIssuanceRequest(ctx, ir); err != nil {
			return err
		}
	} else {
		ir = existing
		exp := now.Add(7 * 24 * time.Hour)
		ir.Status = kyc.IssuanceAuthorized
		ir.KYCCaseID = &caseID
		ir.KYCVersion = &ver
		ir.AuthorizerUserID = &actor
		ir.Reason = "kyc_approved"
		ir.AuthorizedAt = &now
		ir.ExpiresAt = &exp
		ir.UpdatedAt = now
		if err := s.Store.UpdateIssuanceStatus(ctx, ir); err != nil {
			return err
		}
	}

	// Outbox: capability + issuance authorized (claim is BE-410).
	mode := gateway.ModeLive
	payload, _ := json.Marshal(map[string]any{
		"merchantId":   c.MerchantID,
		"caseId":       c.ID,
		"kycVersion":   c.Version,
		"issuanceId":   ir.ID,
		"paymentMode":  mode,
		"capability":   gateway.CapabilityQRISAPI,
		"status":       kyc.IssuanceAuthorized,
		"authorizedAt": now.UTC().Format(time.RFC3339),
	})
	dk := "kyc-approved:" + c.ID + ":" + fmt.Sprintf("%d", c.Version)
	if err := s.Store.InsertOutbox(ctx, s.newID("obx_"), kyc.TopicKYCApproved, payload, &dk, &mode, now); err != nil {
		return err
	}
	dk2 := "issuance-authorized:" + ir.ID
	return s.Store.InsertOutbox(ctx, s.newID("obx_"), kyc.TopicIssuanceAuthorized, payload, &dk2, &mode, now)
}

func (s *KYCService) onDenyLive(ctx context.Context, c kyc.Case, to, reason string, now time.Time) error {
	// Rejected does not revoke an already-active capability from a prior approved case.
	// Expired suspends live capability for this case's capability linkage.
	if to == kyc.StatusExpired {
		existing, err := s.Store.GetCapability(ctx, c.MerchantID, gateway.ModeLive, gateway.CapabilityQRISAPI)
		if err == nil && existing.KYCCaseID != nil && *existing.KYCCaseID == c.ID {
			existing.Status = gateway.CapStatusExpired
			existing.UpdatedAt = now
			_ = s.Store.UpsertCapability(ctx, existing)
		}
		// Expire unclaimed issuance
		if ir, err := s.Store.GetOutstandingIssuance(ctx, c.MerchantID, gateway.ModeLive); err == nil {
			ir.Status = kyc.IssuanceExpired
			ir.UpdatedAt = now
			ir.ExpiresAt = &now
			_ = s.Store.UpdateIssuanceStatus(ctx, ir)
		}
	}
	if to == kyc.StatusRejected {
		// Revoke only PENDING_KYC issuance for this merchant live mode.
		if ir, err := s.Store.GetOutstandingIssuance(ctx, c.MerchantID, gateway.ModeLive); err == nil && ir.Status == kyc.IssuancePendingKYC {
			ir.Status = kyc.IssuanceRevoked
			ir.Reason = reason
			ir.UpdatedAt = now
			ir.RevokedAt = &now
			_ = s.Store.UpdateIssuanceStatus(ctx, ir)
		}
	}
	return nil
}

// DenyLiveKeyCreate is used by BE-410 hook: live key create denied until claim after approval.
// Returns true when merchant may claim (AUTHORIZED issuance exists).
func (s *KYCService) LiveIssuanceAuthorized(ctx context.Context, merchantID string) (bool, kyc.IssuanceRequest, error) {
	ir, err := s.Store.GetOutstandingIssuance(ctx, merchantID, gateway.ModeLive)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return false, kyc.IssuanceRequest{}, nil
		}
		return false, kyc.IssuanceRequest{}, err
	}
	return ir.Status == kyc.IssuanceAuthorized, ir, nil
}
