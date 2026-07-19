package application

import (
	"context"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/admin"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/audit"
)

// AuditAppendParams is the input to the SECURITY DEFINER append function.
type AuditAppendParams struct {
	ID               string
	ChainScope       string
	CanonicalVersion string
	CanonicalPayload []byte
	ActorUserID      string
	Action           string
	ResourceType     string
	ResourceID       string
	Reason           string
	RequestID        string
	MerchantID       string
	MetadataJSON     []byte
	CreatedAt        time.Time
}

// AuditAppendResult is the committed chain assignment.
type AuditAppendResult struct {
	ID         string
	SequenceNo int64
	PrevHash   []byte
	RowHash    []byte
	ChainScope string
	CreatedAt  time.Time
}

// AuditSearchFilter bounds audit search.
type AuditSearchFilter struct {
	ChainScope   string
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

// AuditStore is the persistence port for BE-530 audit chain.
type AuditStore interface {
	WithTx(ctx context.Context, fn func(ctx context.Context) error) error
	IsNotFound(err error) bool

	Append(ctx context.Context, p AuditAppendParams) (AuditAppendResult, error)
	GetByID(ctx context.Context, id string) (audit.ChainEvent, error)
	Search(ctx context.Context, f AuditSearchFilter) ([]audit.ChainEvent, error)
	StreamFrom(ctx context.Context, chainScope string, fromSeq int64, limit int32) ([]audit.ChainEvent, error)
	GetHead(ctx context.Context, chainScope string) (seq int64, hash []byte, err error)
	CreateCheckpoint(ctx context.Context, cp audit.Checkpoint) error
	LatestCheckpoint(ctx context.Context, chainScope string) (audit.Checkpoint, error)
	Count(ctx context.Context, chainScope string) (int64, error)
	MinMaxSeq(ctx context.Context, chainScope string) (minSeq, maxSeq int64, err error)

	InsertExport(ctx context.Context, e admin.AuditExport, filterJSON []byte, now time.Time) error
	GetExport(ctx context.Context, id string) (admin.AuditExport, error)
	CompleteExport(ctx context.Context, id, status string, rowCount *int64, completedAt, expiresAt *time.Time, errMsg *string) error
}
