package application

import (
	"context"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/admin"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
)

// ImpersonationStore is the persistence port for BE-520 impersonation.
type ImpersonationStore interface {
	WithTx(ctx context.Context, fn func(ctx context.Context) error) error
	IsNotFound(err error) bool

	InsertSession(ctx context.Context, s admin.ImpersonationSession) error
	GetByID(ctx context.Context, id string) (admin.ImpersonationSession, error)
	GetByDerivedSessionID(ctx context.Context, derivedSessionID string) (admin.ImpersonationSession, error)
	GetByTokenHash(ctx context.Context, tokenHash string) (admin.ImpersonationSession, error)
	GetActiveByActor(ctx context.Context, actorAdminID string, now time.Time) (admin.ImpersonationSession, error)
	EndSession(ctx context.Context, id, status string, endedAt time.Time, endedBy *string, endReason string) (int64, error)
	MarkExpired(ctx context.Context, id string, now time.Time) (int64, error)

	IsAdminUser(ctx context.Context, userID string) (bool, error)
	GetMerchantOwner(ctx context.Context, merchantID string) (string, error)
	GetUser(ctx context.Context, userID string) (auth.User, error)
	GetStoreOwnerUserID(ctx context.Context, storeID string) (string, error)

	InsertAudit(ctx context.Context, a AdminOpsAuditInsert) error
}
