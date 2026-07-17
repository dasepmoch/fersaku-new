package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres/gen"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/domains"
)

type domainTxKey struct{}

// DomainRepo is the Postgres adapter for BE-240.
type DomainRepo struct {
	pool *pgxpool.Pool
	q    *gen.Queries
}

func NewDomainRepo(pool *pgxpool.Pool) *DomainRepo {
	return &DomainRepo{pool: pool, q: gen.New(pool)}
}

func (r *DomainRepo) queries(ctx context.Context) *gen.Queries {
	if tx, ok := ctx.Value(domainTxKey{}).(pgx.Tx); ok && tx != nil {
		return r.q.WithTx(tx)
	}
	return r.q
}

func (r *DomainRepo) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	if _, ok := ctx.Value(domainTxKey{}).(pgx.Tx); ok {
		return fn(ctx)
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("domain: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	txCtx := context.WithValue(ctx, domainTxKey{}, tx)
	if err := fn(txCtx); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("domain: commit: %w", err)
	}
	return nil
}

func (r *DomainRepo) IsNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func (r *DomainRepo) IsUniqueViolation(err error) bool {
	var pe *pgconn.PgError
	return errors.As(err, &pe) && pe.Code == "23505"
}

func (r *DomainRepo) GetStore(ctx context.Context, storeID string) (application.DomainStoreRow, error) {
	row, err := r.queries(ctx).DomainGetStoreByID(ctx, storeID)
	if err != nil {
		return application.DomainStoreRow{}, err
	}
	return application.DomainStoreRow{
		ID:         row.ID,
		MerchantID: row.MerchantID,
		Slug:       row.Slug,
		Name:       row.Name,
		Status:     row.Status,
	}, nil
}

func (r *DomainRepo) UserCanAccessStore(ctx context.Context, userID, storeID string) (bool, error) {
	return r.queries(ctx).DomainUserCanAccessStore(ctx, gen.DomainUserCanAccessStoreParams{
		ID:     storeID,
		UserID: userID,
	})
}

func (r *DomainRepo) UserIsPlatformAdmin(ctx context.Context, userID string) (bool, error) {
	return r.queries(ctx).DomainUserIsPlatformAdmin(ctx, userID)
}

func (r *DomainRepo) InsertDomain(ctx context.Context, d domains.Domain) error {
	return r.queries(ctx).DomainInsert(ctx, gen.DomainInsertParams{
		ID:                    d.ID,
		StoreID:               d.StoreID,
		MerchantID:            d.MerchantID,
		HostnameNormalized:    d.HostnameNormalized,
		HostnameDisplay:       d.HostnameDisplay,
		Status:                d.Status,
		VerificationTokenHash: d.VerificationTokenHash,
		ExpectedDnsName:       d.ExpectedDNSName,
		ExpectedDnsValue:      d.ExpectedDNSValue,
		Version:               d.Version,
		TlsStatus:             d.TLSStatus,
		FailureCode:           d.FailureCode,
		LastCheckedAt:         timePtrToPg(d.LastCheckedAt),
		NextCheckAt:           timePtrToPg(d.NextCheckAt),
		VerifiedAt:            timePtrToPg(d.VerifiedAt),
		EdgeProvisionedAt:     timePtrToPg(d.EdgeProvisionedAt),
		EdgeRemovedAt:         timePtrToPg(d.EdgeRemovedAt),
		CooldownUntil:         timePtrToPg(d.CooldownUntil),
		SuspendedAt:           timePtrToPg(d.SuspendedAt),
		RemovingAt:            timePtrToPg(d.RemovingAt),
		TombstonedAt:          timePtrToPg(d.TombstonedAt),
		CreatedAt:             d.CreatedAt,
		UpdatedAt:             d.UpdatedAt,
	})
}

func (r *DomainRepo) GetDomainByID(ctx context.Context, id string) (domains.Domain, error) {
	row, err := r.queries(ctx).DomainGetByID(ctx, id)
	if err != nil {
		return domains.Domain{}, err
	}
	return mapDomainRow(row), nil
}

func (r *DomainRepo) GetDomainByIDForStore(ctx context.Context, id, storeID string) (domains.Domain, error) {
	row, err := r.queries(ctx).DomainGetByIDForStore(ctx, gen.DomainGetByIDForStoreParams{
		ID:      id,
		StoreID: storeID,
	})
	if err != nil {
		return domains.Domain{}, err
	}
	return mapDomainRow(row), nil
}

func (r *DomainRepo) GetClaimByHostname(ctx context.Context, hostnameNormalized string) (domains.Domain, error) {
	row, err := r.queries(ctx).DomainGetClaimByHostname(ctx, hostnameNormalized)
	if err != nil {
		return domains.Domain{}, err
	}
	return mapDomainRow(row), nil
}

func (r *DomainRepo) GetActiveByHostname(ctx context.Context, hostnameNormalized string) (domains.Domain, error) {
	row, err := r.queries(ctx).DomainGetActiveByHostname(ctx, hostnameNormalized)
	if err != nil {
		return domains.Domain{}, err
	}
	return mapDomainRow(row), nil
}

func (r *DomainRepo) ListByStore(ctx context.Context, storeID string) ([]domains.Domain, error) {
	rows, err := r.queries(ctx).DomainListByStore(ctx, storeID)
	if err != nil {
		return nil, err
	}
	out := make([]domains.Domain, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapDomainRow(row))
	}
	return out, nil
}

func (r *DomainRepo) UpdateCAS(ctx context.Context, expectedVersion int32, d domains.Domain) (domains.Domain, error) {
	row, err := r.queries(ctx).DomainUpdateCAS(ctx, gen.DomainUpdateCASParams{
		ID:                    d.ID,
		Version:               expectedVersion,
		Status:                d.Status,
		VerificationTokenHash: d.VerificationTokenHash,
		ExpectedDnsName:       d.ExpectedDNSName,
		ExpectedDnsValue:      d.ExpectedDNSValue,
		TlsStatus:             d.TLSStatus,
		FailureCode:           d.FailureCode,
		LastCheckedAt:         timePtrToPg(d.LastCheckedAt),
		NextCheckAt:           timePtrToPg(d.NextCheckAt),
		VerifiedAt:            timePtrToPg(d.VerifiedAt),
		EdgeProvisionedAt:     timePtrToPg(d.EdgeProvisionedAt),
		EdgeRemovedAt:         timePtrToPg(d.EdgeRemovedAt),
		CooldownUntil:         timePtrToPg(d.CooldownUntil),
		SuspendedAt:           timePtrToPg(d.SuspendedAt),
		RemovingAt:            timePtrToPg(d.RemovingAt),
		TombstonedAt:          timePtrToPg(d.TombstonedAt),
		UpdatedAt:             d.UpdatedAt,
	})
	if err != nil {
		return domains.Domain{}, err
	}
	return mapDomainRow(row), nil
}

func (r *DomainRepo) ListDueForRevalidation(ctx context.Context, now time.Time, limit int32) ([]domains.Domain, error) {
	rows, err := r.queries(ctx).DomainListDueForRevalidation(ctx, gen.DomainListDueForRevalidationParams{
		NextCheckAt: timePtrToPg(&now),
		Limit:       limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]domains.Domain, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapDomainRow(row))
	}
	return out, nil
}

func (r *DomainRepo) ListExpiredTombstones(ctx context.Context, now time.Time, limit int32) ([]domains.Domain, error) {
	rows, err := r.queries(ctx).DomainListExpiredTombstones(ctx, gen.DomainListExpiredTombstonesParams{
		CooldownUntil: timePtrToPg(&now),
		Limit:         limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]domains.Domain, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapDomainRow(row))
	}
	return out, nil
}

func (r *DomainRepo) HardDeleteTombstone(ctx context.Context, id string) error {
	return r.queries(ctx).DomainHardDelete(ctx, id)
}

func (r *DomainRepo) InsertOutbox(ctx context.Context, id, topic string, payload []byte, dedupeKey *string, availableAt time.Time) error {
	if payload == nil {
		payload = []byte(`{}`)
	}
	return r.queries(ctx).DomainInsertOutbox(ctx, gen.DomainInsertOutboxParams{
		ID:          id,
		Topic:       topic,
		Payload:     payload,
		AvailableAt: availableAt,
		DedupeKey:   dedupeKey,
	})
}

func mapDomainRow(row gen.StoreDomain) domains.Domain {
	return domains.Domain{
		ID:                    row.ID,
		StoreID:               row.StoreID,
		MerchantID:            row.MerchantID,
		HostnameNormalized:    row.HostnameNormalized,
		HostnameDisplay:       row.HostnameDisplay,
		Status:                row.Status,
		VerificationTokenHash: row.VerificationTokenHash,
		ExpectedDNSName:       row.ExpectedDnsName,
		ExpectedDNSValue:      row.ExpectedDnsValue,
		Version:               row.Version,
		TLSStatus:             row.TlsStatus,
		FailureCode:           row.FailureCode,
		LastCheckedAt:         pgToTimePtr(row.LastCheckedAt),
		NextCheckAt:           pgToTimePtr(row.NextCheckAt),
		VerifiedAt:            pgToTimePtr(row.VerifiedAt),
		EdgeProvisionedAt:     pgToTimePtr(row.EdgeProvisionedAt),
		EdgeRemovedAt:         pgToTimePtr(row.EdgeRemovedAt),
		CooldownUntil:         pgToTimePtr(row.CooldownUntil),
		SuspendedAt:           pgToTimePtr(row.SuspendedAt),
		RemovingAt:            pgToTimePtr(row.RemovingAt),
		TombstonedAt:          pgToTimePtr(row.TombstonedAt),
		CreatedAt:             row.CreatedAt,
		UpdatedAt:             row.UpdatedAt,
	}
}
