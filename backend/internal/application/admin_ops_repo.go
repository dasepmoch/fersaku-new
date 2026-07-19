package application

import (
	"context"
	"encoding/json"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/admin"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/reviews"
)

// AdminOpsAuditInsert is a reasoned audit row committed via JCS-1 append_audit_event (BE-530).
type AdminOpsAuditInsert struct {
	ID               string
	PayloadHash      []byte // legacy; used as canonical_payload when CanonicalPayload empty
	CanonicalPayload []byte // JCS-1 UTF-8 bytes (preferred)
	CreatedAt        time.Time
	ActorUserID      *string
	Action           *string
	ResourceType     *string
	ResourceID       *string
	Reason           *string
	RequestID        *string
	MerchantID       *string
	MetadataJSON     []byte
}

// AdminOpsMerchant is a merchant row for status mutations.
type AdminOpsMerchant struct {
	ID               string
	OwnerUserID      string
	DisplayName      string
	Status           string
	SuspensionReason *string
	SuspendedAt      *time.Time
	SuspendedBy      *string
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

// AdminOpsCapability is LIVE/SANDBOX QRIS API capability.
type AdminOpsCapability struct {
	ID               string
	MerchantID       string
	PaymentMode      string
	Capability       string
	Status           string
	SuspensionReason *string
	SuspendedBy      *string
}

// AdminOpsAuditFilter bounds audit search.
type AdminOpsAuditFilter struct {
	Action       *string
	ResourceType *string
	ResourceID   *string
	ActorUserID  *string
	From         *time.Time
	To           *time.Time
	CursorAt     *time.Time
	CursorSeq    *int64
	Limit        int32
}

// AdminOpsPaymentIntent is a slim intent for provider verify.
type AdminOpsPaymentIntent struct {
	ID                string
	OrderID           string
	StoreID           string
	MerchantID        string
	PaymentMode       string
	Source            string
	Provider          string
	AccountScope      string
	ProviderReference *string
	ExternalID        string
	AmountIDR         int64
	Status            string
	CreatedAt         time.Time
}

// AdminOpsBuyerUser is a buyer identity for support actions.
type AdminOpsBuyerUser struct {
	ID              string
	EmailDisplay    string
	EmailNormalized string
	Name            string
	Status          string
	EmailVerifiedAt *time.Time
	CreatedAt       time.Time
}

// AdminOpsStore is the persistence port for BE-510 admin operations.
type AdminOpsStore interface {
	WithTx(ctx context.Context, fn func(ctx context.Context) error) error
	IsNotFound(err error) bool

	GetMerchant(ctx context.Context, id string) (AdminOpsMerchant, error)
	UpdateMerchantStatus(ctx context.Context, id, status string, reason *string, suspendedAt *time.Time, suspendedBy *string, now time.Time) (AdminOpsMerchant, error)

	GetCapability(ctx context.Context, merchantID, mode, capability string) (AdminOpsCapability, error)
	UpsertCapabilityAccess(ctx context.Context, c AdminOpsCapability, effectiveAt time.Time, now time.Time) error

	ListEmergency(ctx context.Context) ([]admin.EmergencyControl, error)
	GetEmergency(ctx context.Context, switchName string) (admin.EmergencyControl, error)
	UpdateEmergency(ctx context.Context, switchName string, enabled bool, reason, ticket string, updatedBy string, expectedVersion int64, now time.Time) (admin.EmergencyControl, error)

	InsertAudit(ctx context.Context, a AdminOpsAuditInsert) error
	ListAudit(ctx context.Context, f AdminOpsAuditFilter) ([]admin.AuditEvent, error)
	GetAudit(ctx context.Context, id string) (admin.AuditEvent, error)
	AuditIntegrityMeta(ctx context.Context) (admin.AuditIntegrityMeta, error)

	InsertAuditExport(ctx context.Context, e admin.AuditExport, filterJSON []byte, now time.Time) error
	GetAuditExport(ctx context.Context, id string) (admin.AuditExport, error)
	CompleteAuditExport(ctx context.Context, id, status string, rowCount *int64, completedAt, expiresAt *time.Time, errMsg *string) error

	ListPaymentMismatches(ctx context.Context, limit int32) ([]admin.PaymentMismatch, error)

	GetReview(ctx context.Context, id string) (reviews.Review, error)
	UpdateReviewStatus(ctx context.Context, id, status string, now time.Time) (reviews.Review, error)

	GetBuyerUser(ctx context.Context, id string) (AdminOpsBuyerUser, error)
	GetPaymentIntent(ctx context.Context, id string) (AdminOpsPaymentIntent, error)
}

// Ensure metadata helper is available without import cycles.
func adminOpsMarshalMeta(m map[string]any) []byte {
	if m == nil {
		return []byte("{}")
	}
	b, err := json.Marshal(m)
	if err != nil {
		return []byte("{}")
	}
	return b
}
