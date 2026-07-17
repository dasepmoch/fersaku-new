package application

import (
	"context"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/platform"
)

// FeeStore is the persistence port for fee policies and snapshots (BE-300).
// Application/admin must never mutate fee_policies rows; only migrate seeds them.
type FeeStore interface {
	GetActivePolicy(ctx context.Context, at time.Time) (platform.FeePolicy, error)
	GetPolicyByVersion(ctx context.Context, versionID string) (platform.FeePolicy, error)
	// InsertSnapshot is append-only for payment/withdrawal create (BE-310+).
	InsertSnapshot(ctx context.Context, snap platform.FeeSnapshot) (platform.FeeSnapshot, error)
	GetSnapshotByID(ctx context.Context, id string) (platform.FeeSnapshot, error)
	IsNotFound(err error) bool
}
