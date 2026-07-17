package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres/gen"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/platform"
)

// FeeRepo is the Postgres adapter for fee_policies / fee_snapshots (BE-300).
// It never updates fee_policies (immutable seed via migration only).
type FeeRepo struct {
	pool *pgxpool.Pool
	q    *gen.Queries
}

func NewFeeRepo(pool *pgxpool.Pool) *FeeRepo {
	return &FeeRepo{pool: pool, q: gen.New(pool)}
}

func (r *FeeRepo) IsNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func (r *FeeRepo) GetActivePolicy(ctx context.Context, at time.Time) (platform.FeePolicy, error) {
	row, err := r.q.FeeGetActivePolicy(ctx, at)
	if err != nil {
		return platform.FeePolicy{}, err
	}
	return mapFeePolicy(row), nil
}

func (r *FeeRepo) GetPolicyByVersion(ctx context.Context, versionID string) (platform.FeePolicy, error) {
	row, err := r.q.FeeGetPolicyByVersion(ctx, versionID)
	if err != nil {
		return platform.FeePolicy{}, err
	}
	return mapFeePolicy(row), nil
}

func (r *FeeRepo) InsertSnapshot(ctx context.Context, snap platform.FeeSnapshot) (platform.FeeSnapshot, error) {
	var src *string
	if snap.Source != "" {
		s := string(snap.Source)
		src = &s
	}
	row, err := r.q.FeeInsertSnapshot(ctx, gen.FeeInsertSnapshotParams{
		ID:                  snap.ID,
		PolicyVersionID:     snap.PolicyVersionID,
		Scope:               snap.Scope,
		Kind:                string(snap.Kind),
		PaymentSource:       src,
		GrossOrAmountIdr:    snap.GrossOrAmountIDR,
		PercentBps:          snap.PercentBps,
		PercentComponentIdr: snap.PercentComponentIDR,
		FixedComponentIdr:   snap.FixedComponentIDR,
		ProviderFeeIdr:      snap.ProviderFeeIDR,
		TotalFeeIdr:         snap.TotalFeeIDR,
		NetIdr:              snap.NetIDR,
		Currency:            snap.Currency,
		Checksum:            snap.Checksum,
		CreatedAt:           snap.CreatedAt,
	})
	if err != nil {
		return platform.FeeSnapshot{}, err
	}
	return mapFeeSnapshot(row), nil
}

func (r *FeeRepo) GetSnapshotByID(ctx context.Context, id string) (platform.FeeSnapshot, error) {
	row, err := r.q.FeeGetSnapshotByID(ctx, id)
	if err != nil {
		return platform.FeeSnapshot{}, err
	}
	return mapFeeSnapshot(row), nil
}

func mapFeePolicy(row gen.FeePolicy) platform.FeePolicy {
	return platform.FeePolicy{
		VersionID:             row.VersionID,
		Scope:                 row.Scope,
		TransactionPercentBps: row.TransactionPercentBps,
		TransactionFixedIDR:   row.TransactionFixedIdr,
		WithdrawalPercentBps:  row.WithdrawalPercentBps,
		MinimumWithdrawalIDR:  row.MinimumWithdrawalIdr,
		MinimumPaymentIDR:     row.MinimumPaymentIdr,
		MaximumPaymentIDR:     row.MaximumPaymentIdr,
		Checksum:              row.Checksum,
		SourceADR:             row.SourceAdr,
		ReleaseReason:         row.ReleaseReason,
		Immutable:             row.Immutable,
		EffectiveFrom:         row.EffectiveFrom,
		EffectiveTo:           timestamptzPtr(row.EffectiveTo),
		CreatedAt:             row.CreatedAt,
	}
}

func mapFeeSnapshot(row gen.FeeSnapshot) platform.FeeSnapshot {
	var src platform.PaymentSource
	if row.PaymentSource != nil {
		src = platform.PaymentSource(*row.PaymentSource)
	}
	return platform.FeeSnapshot{
		ID:                  row.ID,
		PolicyVersionID:     row.PolicyVersionID,
		Scope:               row.Scope,
		Kind:                platform.SnapshotKind(row.Kind),
		Source:              src,
		GrossOrAmountIDR:    row.GrossOrAmountIdr,
		PercentBps:          row.PercentBps,
		PercentComponentIDR: row.PercentComponentIdr,
		FixedComponentIDR:   row.FixedComponentIdr,
		ProviderFeeIDR:      row.ProviderFeeIdr,
		TotalFeeIDR:         row.TotalFeeIdr,
		NetIDR:              row.NetIdr,
		Currency:            row.Currency,
		Checksum:            row.Checksum,
		CreatedAt:           row.CreatedAt,
	}
}

func timestamptzPtr(t pgtype.Timestamptz) *time.Time {
	if !t.Valid {
		return nil
	}
	tt := t.Time.UTC()
	return &tt
}
