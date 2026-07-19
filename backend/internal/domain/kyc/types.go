package kyc

import "time"

// Case statuses (§5.4).
const (
	StatusDraft              = "DRAFT"
	StatusSubmitted          = "SUBMITTED"
	StatusInReview           = "IN_REVIEW"
	StatusVendorCheck        = "VENDOR_CHECK"
	StatusNeedsClarification = "NEEDS_CLARIFICATION"
	StatusApproved           = "APPROVED"
	StatusRejected           = "REJECTED"
	StatusExpired            = "EXPIRED"
)

// Capability code for live QRIS API KYC cases.
const CapabilityQRISAPILive = "QRIS_API_LIVE"

// Document types (closed set for launch).
const (
	DocIDFront         = "ID_FRONT"
	DocIDBack          = "ID_BACK"
	DocSelfie          = "SELFIE"
	DocBusinessLicense = "BUSINESS_LICENSE"
	DocTaxID           = "TAX_ID"
	DocOther           = "OTHER"
)

// Document processing statuses.
const (
	DocStatusPending    = "PENDING"
	DocStatusUploading  = "UPLOADING"
	DocStatusScanning   = "SCANNING"
	DocStatusEncrypting = "ENCRYPTING"
	DocStatusReady      = "READY"
	DocStatusFailed     = "FAILED"
	DocStatusRejected   = "REJECTED"
)

// Scan statuses.
const (
	ScanPending = "PENDING"
	ScanPassed  = "PASSED"
	ScanFailed  = "FAILED"
	ScanSkipped = "SKIPPED"
)

// Issuance request statuses (authorize on approve; claim is BE-410).
const (
	IssuancePendingKYC = "PENDING_KYC"
	IssuanceAuthorized = "AUTHORIZED"
	IssuanceClaimed    = "CLAIMED"
	IssuanceExpired    = "EXPIRED"
	IssuanceRevoked    = "REVOKED"
)

// Admin transition actions.
const (
	ActionStartReview  = "START_REVIEW"
	ActionVendorCheck  = "VENDOR_CHECK"
	ActionNeedsClarify = "NEEDS_CLARIFICATION"
	ActionApprove      = "APPROVE"
	ActionReject       = "REJECT"
	ActionExpire       = "EXPIRE"
)

// Upload bounds.
const (
	MaxDocumentBytes = 10 * 1024 * 1024 // 10 MiB
	MinDocumentBytes = 100
	ConsentVersionV1 = "KYC_CONSENT_V1"
)

// Mandatory document types for APPROVED.
var MandatoryDocumentTypes = []string{DocIDFront, DocSelfie}

// AllowedContentTypes for KYC document streams.
var AllowedContentTypes = map[string]bool{
	"image/jpeg":      true,
	"image/jpg":       true,
	"image/png":       true,
	"application/pdf": true,
}

// Case is a merchant KYC submission for live QRIS API.
type Case struct {
	ID                  string
	MerchantID          string
	StoreID             *string
	Capability          string
	Status              string
	Version             int32
	LegalName           string
	BusinessName        string
	RegistrationNumber  string
	CountryCode         string
	ConsentVersion      string
	ConsentAcceptedAt   *time.Time
	ReviewerUserID      *string
	VendorRef           string
	Reason              string
	ClarificationReason string
	PredecessorCaseID   *string
	SubmittedAt         *time.Time
	ReviewedAt          *time.Time
	ApprovedAt          *time.Time
	RejectedAt          *time.Time
	ExpiresAt           *time.Time
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

// Document metadata (ciphertext only in private R2).
type Document struct {
	ID                   string
	CaseID               string
	MerchantID           string
	DocumentType         string
	Status               string
	ContentType          string
	SizeBytes            int64
	ChecksumSHA256       string
	StorageBucket        string
	StorageKey           string
	EncryptionKeyVersion string
	CiphertextSizeBytes  int64
	ScanStatus           string
	ScanDetail           string
	DocVersion           int32
	UploadedBy           *string
	ReadyAt              *time.Time
	CreatedAt            time.Time
	UpdatedAt            time.Time
}

// Transition is an immutable audit row.
type Transition struct {
	ID          string
	CaseID      string
	FromStatus  string
	ToStatus    string
	ActorUserID *string
	Reason      string
	Metadata    []byte
	CreatedAt   time.Time
}

// IssuanceRequest authorizes pending live key claim (BE-410 consumes claim).
type IssuanceRequest struct {
	ID               string
	MerchantID       string
	PaymentMode      string
	Purpose          string
	Capability       string
	Status           string
	KYCCaseID        *string
	KYCVersion       *int32
	RequesterUserID  *string
	AuthorizerUserID *string
	Reason           string
	AuthorizedAt     *time.Time
	ClaimedAt        *time.Time
	ExpiresAt        *time.Time
	RevokedAt        *time.Time
	CreatedAt        time.Time
	UpdatedAt        time.Time
	// BE-410 claim fields (hash only; raw claim token never stored).
	ClaimTokenHash         *string
	ClaimExpiresAt         *time.Time
	ClaimRecipientUserID   *string
	ClaimAttempts          int32
	ClaimConsumedAt        *time.Time
	MFABindingSessionID    *string
	ExpectedPredecessorKey *string
	ExpectedVersion        *int32
	RequestVersion         int32
	IdempotencyKeyHash     *string
	ResultingAPIKeyID      *string
}

// Outbox topics.
const (
	TopicKYCApproved        = "kyc.approved"
	TopicIssuanceAuthorized = "credential.issuance.authorized"
	TopicDocumentProcess    = "kyc_document.process"
)
