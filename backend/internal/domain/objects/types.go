// Package objects owns object_ref lifecycle types and key policy (BE-220).
// KYC documents never use the browser-presigned path here (BE-400).
package objects

import "time"

// Status is object_refs.status.
type Status string

const (
	StatusUploading Status = "UPLOADING"
	StatusScanning  Status = "SCANNING"
	StatusReady     Status = "READY"
	StatusRejected  Status = "REJECTED"
	StatusExpired   Status = "EXPIRED"
)

// Purpose classifies non-KYC upload intents.
type Purpose string

const (
	PurposeProductFile  Purpose = "PRODUCT_FILE"
	PurposePublicAsset  Purpose = "PUBLIC_ASSET"
	PurposeProfileAsset Purpose = "PROFILE_ASSET"
	PurposeInvoiceInput Purpose = "INVOICE_INPUT"
)

// Visibility selects public vs private bucket.
type Visibility string

const (
	VisibilityPrivate Visibility = "PRIVATE"
	VisibilityPublic  Visibility = "PUBLIC"
)

// RetentionClass is policy metadata (Bucket Lock applies only to AUDIT_LOCKED prefixes).
type RetentionClass string

const (
	RetentionStandard      RetentionClass = "STANDARD"
	RetentionProduct       RetentionClass = "PRODUCT"
	RetentionAuditLocked   RetentionClass = "AUDIT_LOCKED"
	RetentionKYCCiphertext RetentionClass = "KYC_CIPHERTEXT"
)

// ObjectRef is the authoritative DB row for a stored object.
type ObjectRef struct {
	ID                     string
	Bucket                 string
	ObjectKey              string
	Purpose                Purpose
	Visibility             Visibility
	ContentType            string
	ExpectedSizeBytes      int64
	ActualSizeBytes        *int64
	ChecksumSHA256         *string
	ExpectedChecksumSHA256 *string
	EncryptionKeyVersion   *string
	RetentionClass         RetentionClass
	OwnerMerchantID        string
	OwnerStoreID           string
	OwnerUserID            *string
	Status                 Status
	UploadExpiresAt        time.Time
	MultipartUploadID      *string
	MultipartAbortedAt     *time.Time
	ScanStatus             *string
	ScanVerdict            *string
	ScanVersion            *string
	ScanAt                 *time.Time
	ScanAttempts           int32
	ScanErrorClass         *string
	ScanNextRetryAt        *time.Time
	LastVerifiedAt         *time.Time
	RejectedReason         *string
	CreatedAt              time.Time
	UpdatedAt              time.Time
}

// Object scan_status values (evidence lifecycle; free-form in DB historically).
const (
	ScanStatusPending    = "PENDING"
	ScanStatusInProgress = "IN_PROGRESS"
	ScanStatusComplete   = "COMPLETE"
	ScanStatusFailed     = "FAILED"
	ScanStatusSkipped    = "SKIPPED"
)

// Default malware scan policy.
const (
	DefaultScanMaxAttempts = 5
	DefaultScanTimeout     = 60 * time.Second
	DefaultScanBackoff     = 15 * time.Second
)

// DeliveryGrant is a short-lived buyer/owner download authorization stub (BE-235 expands).
type DeliveryGrant struct {
	ID            string
	ObjectID      string
	StoreID       string
	GranteeUserID string
	Purpose       string
	ExpiresAt     time.Time
	RevokedAt     *time.Time
	MaxUses       int
	UseCount      int
	CreatedAt     time.Time
}

// Limits for non-KYC uploads (launch defaults).
const (
	MaxUploadBytesProduct   int64 = 100 * 1024 * 1024 // 100 MiB
	MaxUploadBytesPublic    int64 = 10 * 1024 * 1024  // 10 MiB
	MaxUploadBytesProfile   int64 = 5 * 1024 * 1024   // 5 MiB
	MaxUploadBytesInvoice   int64 = 20 * 1024 * 1024  // 20 MiB
	DefaultPresignPutTTL          = 15 * time.Minute
	DefaultPresignGetTTL          = 5 * time.Minute
	DefaultUploadIntentTTL        = 24 * time.Hour
	DefaultDeliveryGrantTTL       = 1 * time.Hour
	// Soft merchant quota (optional); 0 means unlimited.
	DefaultMerchantSoftQuotaBytes int64 = 5 * 1024 * 1024 * 1024 // 5 GiB
)
