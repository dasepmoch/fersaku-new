package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres/gen"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/admin"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
)

type impTxKey struct{}

// ImpersonationRepo is the Postgres adapter for BE-520 impersonation.
type ImpersonationRepo struct {
	pool *pgxpool.Pool
	q    *gen.Queries
}

func NewImpersonationRepo(pool *pgxpool.Pool) *ImpersonationRepo {
	return &ImpersonationRepo{pool: pool, q: gen.New(pool)}
}

func (r *ImpersonationRepo) queries(ctx context.Context) *gen.Queries {
	if tx, ok := ctx.Value(impTxKey{}).(pgx.Tx); ok && tx != nil {
		return r.q.WithTx(tx)
	}
	return r.q
}

func (r *ImpersonationRepo) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	if _, ok := ctx.Value(impTxKey{}).(pgx.Tx); ok {
		return fn(ctx)
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("impersonation: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	txCtx := context.WithValue(ctx, impTxKey{}, tx)
	if err := fn(txCtx); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("impersonation: commit: %w", err)
	}
	return nil
}

func (r *ImpersonationRepo) IsNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func impTS(t time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: t.UTC(), Valid: true}
}

func impTSPtr(t pgtype.Timestamptz) *time.Time {
	if !t.Valid {
		return nil
	}
	v := t.Time.UTC()
	return &v
}

func impMapSession(row gen.ImpersonationSession) admin.ImpersonationSession {
	return admin.ImpersonationSession{
		ID:                row.ID,
		ActorAdminID:      row.ActorAdminID,
		TargetUserID:      row.TargetUserID,
		TargetMerchantID:  row.TargetMerchantID,
		Scope:             row.Scope,
		Status:            row.Status,
		Reason:            row.Reason,
		Ticket:            row.Ticket,
		MFAAt:             row.MfaAt,
		OriginalSessionID: row.OriginalSessionID,
		DerivedSessionID:  row.DerivedSessionID,
		SessionTokenHash:  row.SessionTokenHash,
		ExpiresAt:         row.ExpiresAt,
		EndedAt:           impTSPtr(row.EndedAt),
		EndedBy:           row.EndedBy,
		EndReason:         row.EndReason,
		CreatedAt:         row.CreatedAt,
		UpdatedAt:         row.UpdatedAt,
	}
}

func (r *ImpersonationRepo) InsertSession(ctx context.Context, s admin.ImpersonationSession) error {
	var endedAt pgtype.Timestamptz
	if s.EndedAt != nil {
		endedAt = impTS(*s.EndedAt)
	}
	return r.queries(ctx).ImpInsertSession(ctx, gen.ImpInsertSessionParams{
		ID:                s.ID,
		ActorAdminID:      s.ActorAdminID,
		TargetUserID:      s.TargetUserID,
		TargetMerchantID:  s.TargetMerchantID,
		Scope:             s.Scope,
		Status:            s.Status,
		Reason:            s.Reason,
		Ticket:            s.Ticket,
		MfaAt:             s.MFAAt,
		OriginalSessionID: s.OriginalSessionID,
		DerivedSessionID:  s.DerivedSessionID,
		SessionTokenHash:  s.SessionTokenHash,
		ExpiresAt:         s.ExpiresAt,
		EndedAt:           endedAt,
		EndedBy:           s.EndedBy,
		EndReason:         s.EndReason,
		CreatedAt:         s.CreatedAt,
		UpdatedAt:         s.UpdatedAt,
	})
}

func (r *ImpersonationRepo) GetByID(ctx context.Context, id string) (admin.ImpersonationSession, error) {
	row, err := r.queries(ctx).ImpGetByID(ctx, id)
	if err != nil {
		return admin.ImpersonationSession{}, err
	}
	return impMapSession(row), nil
}

func (r *ImpersonationRepo) GetByDerivedSessionID(ctx context.Context, derivedSessionID string) (admin.ImpersonationSession, error) {
	row, err := r.queries(ctx).ImpGetByDerivedSessionID(ctx, derivedSessionID)
	if err != nil {
		return admin.ImpersonationSession{}, err
	}
	return impMapSession(row), nil
}

func (r *ImpersonationRepo) GetByTokenHash(ctx context.Context, tokenHash string) (admin.ImpersonationSession, error) {
	row, err := r.queries(ctx).ImpGetByTokenHash(ctx, tokenHash)
	if err != nil {
		return admin.ImpersonationSession{}, err
	}
	return impMapSession(row), nil
}

func (r *ImpersonationRepo) GetActiveByActor(ctx context.Context, actorAdminID string, now time.Time) (admin.ImpersonationSession, error) {
	row, err := r.queries(ctx).ImpGetActiveByActor(ctx, gen.ImpGetActiveByActorParams{
		ActorAdminID: actorAdminID,
		ExpiresAt:    now,
	})
	if err != nil {
		return admin.ImpersonationSession{}, err
	}
	return impMapSession(row), nil
}

func (r *ImpersonationRepo) EndSession(ctx context.Context, id, status string, endedAt time.Time, endedBy *string, endReason string) (int64, error) {
	return r.queries(ctx).ImpEndSession(ctx, gen.ImpEndSessionParams{
		ID:        id,
		Status:    status,
		EndedAt:   impTS(endedAt),
		EndedBy:   endedBy,
		EndReason: &endReason,
	})
}

func (r *ImpersonationRepo) MarkExpired(ctx context.Context, id string, now time.Time) (int64, error) {
	return r.queries(ctx).ImpMarkExpired(ctx, gen.ImpMarkExpiredParams{
		ID:      id,
		EndedAt: impTS(now),
	})
}

func (r *ImpersonationRepo) IsAdminUser(ctx context.Context, userID string) (bool, error) {
	return r.queries(ctx).ImpIsAdminUser(ctx, userID)
}

func (r *ImpersonationRepo) GetMerchantOwner(ctx context.Context, merchantID string) (string, error) {
	return r.queries(ctx).ImpGetMerchantOwner(ctx, merchantID)
}

func (r *ImpersonationRepo) GetUser(ctx context.Context, userID string) (auth.User, error) {
	row, err := r.queries(ctx).ImpGetUser(ctx, userID)
	if err != nil {
		return auth.User{}, err
	}
	u := auth.User{
		ID:              row.ID,
		EmailNormalized: row.EmailNormalized,
		EmailDisplay:    row.EmailDisplay,
		Name:            row.Name,
		Status:          auth.UserStatus(row.Status),
		MFAEnabled:      row.MfaEnabled,
		CreatedAt:       row.CreatedAt,
		UpdatedAt:       row.UpdatedAt,
	}
	if row.PasswordHash != nil {
		u.PasswordHash = *row.PasswordHash
	}
	if row.EmailVerifiedAt.Valid {
		t := row.EmailVerifiedAt.Time.UTC()
		u.EmailVerifiedAt = &t
	}
	if row.LastLoginAt.Valid {
		t := row.LastLoginAt.Time.UTC()
		u.LastLoginAt = &t
	}
	return u, nil
}

func (r *ImpersonationRepo) GetStoreOwnerUserID(ctx context.Context, storeID string) (string, error) {
	return r.queries(ctx).ImpGetStoreOwnerUserID(ctx, storeID)
}

func (r *ImpersonationRepo) InsertAudit(ctx context.Context, a application.AdminOpsAuditInsert) error {
	meta := a.MetadataJSON
	if len(meta) == 0 {
		meta = []byte("{}")
	}
	payload := a.PayloadHash
	if len(a.CanonicalPayload) > 0 {
		payload = a.CanonicalPayload
	}
	if len(payload) == 0 {
		payload = []byte("{}")
	}
	p := application.AuditAppendParams{
		ID:               a.ID,
		ChainScope:       "default",
		CanonicalVersion: "JCS-1",
		CanonicalPayload: payload,
		ActorUserID:      derefStr(a.ActorUserID),
		Action:           derefStr(a.Action),
		ResourceType:     derefStr(a.ResourceType),
		ResourceID:       derefStr(a.ResourceID),
		Reason:           derefStr(a.Reason),
		RequestID:        derefStr(a.RequestID),
		MerchantID:       derefStr(a.MerchantID),
		MetadataJSON:     meta,
		CreatedAt:        a.CreatedAt,
	}
	if tx, ok := ctx.Value(impTxKey{}).(pgx.Tx); ok && tx != nil {
		_, err := callAppendOnTx(ctx, tx, p)
		return err
	}
	_, err := callAppendOnPool(ctx, r.pool, p)
	return err
}
