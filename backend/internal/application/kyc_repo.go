package application

import (
	"context"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/gateway"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/kyc"
)

// KYCStore is persistence for BE-400 KYC live API workflow.
type KYCStore interface {
	WithTx(ctx context.Context, fn func(ctx context.Context) error) error

	InsertCase(ctx context.Context, c kyc.Case) error
	GetCaseByID(ctx context.Context, id string) (kyc.Case, error)
	GetOpenCaseByMerchant(ctx context.Context, merchantID string) (kyc.Case, error)
	ListCasesByMerchant(ctx context.Context, merchantID string, limit int32) ([]kyc.Case, error)
	ListAdminQueue(ctx context.Context, status *string, limit int32) ([]kyc.Case, error)
	UpdateCaseStatus(ctx context.Context, c kyc.Case) (kyc.Case, error)

	InsertDocument(ctx context.Context, d kyc.Document) error
	GetDocumentByID(ctx context.Context, id string) (kyc.Document, error)
	ListDocumentsByCase(ctx context.Context, caseID string) ([]kyc.Document, error)
	UpdateDocument(ctx context.Context, d kyc.Document) error
	CountReadyDocumentsByType(ctx context.Context, caseID, docType string) (int64, error)

	InsertTransition(ctx context.Context, t kyc.Transition) error
	ListTransitionsByCase(ctx context.Context, caseID string) ([]kyc.Transition, error)

	InsertIssuanceRequest(ctx context.Context, r kyc.IssuanceRequest) error
	GetOutstandingIssuance(ctx context.Context, merchantID, mode string) (kyc.IssuanceRequest, error)
	GetIssuanceByID(ctx context.Context, id string) (kyc.IssuanceRequest, error)
	UpdateIssuanceStatus(ctx context.Context, r kyc.IssuanceRequest) error

	// Capability gate for LIVE QRIS_API (shared table with gateway).
	GetCapability(ctx context.Context, merchantID, mode, capability string) (gateway.Capability, error)
	UpsertCapability(ctx context.Context, c gateway.Capability) error

	GetMerchantOwnerUserID(ctx context.Context, merchantID string) (string, error)
	GetMerchantByOwner(ctx context.Context, ownerUserID string) (merchantID, status string, err error)
	GetCanonicalStoreID(ctx context.Context, merchantID string) (string, error)
	MerchantMemberActive(ctx context.Context, merchantID, userID string) (role string, err error)

	InsertOutbox(ctx context.Context, id, topic string, payload []byte, dedupeKey *string, paymentMode *string, availableAt time.Time) error

	IsNotFound(err error) bool
	IsUniqueViolation(err error) bool
}
