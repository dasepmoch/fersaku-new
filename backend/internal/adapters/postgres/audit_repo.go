package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres/gen"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/admin"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/audit"
)

type auditTxKey struct{}

// AuditRepo implements application.AuditStore via append_audit_event SECURITY DEFINER.
type AuditRepo struct {
	pool *pgxpool.Pool
	q    *gen.Queries
}

// NewAuditRepo constructs an AuditRepo.
func NewAuditRepo(pool *pgxpool.Pool) *AuditRepo {
	return &AuditRepo{pool: pool, q: gen.New(pool)}
}

func (r *AuditRepo) queries(ctx context.Context) *gen.Queries {
	if tx, ok := ctx.Value(auditTxKey{}).(pgx.Tx); ok && tx != nil {
		return r.q.WithTx(tx)
	}
	return r.q
}

func (r *AuditRepo) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	if _, ok := ctx.Value(auditTxKey{}).(pgx.Tx); ok {
		return fn(ctx)
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("audit: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	txCtx := context.WithValue(ctx, auditTxKey{}, tx)
	if err := fn(txCtx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *AuditRepo) IsNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func (r *AuditRepo) Append(ctx context.Context, p application.AuditAppendParams) (application.AuditAppendResult, error) {
	if tx, ok := ctx.Value(auditTxKey{}).(pgx.Tx); ok && tx != nil {
		return callAppendOnTx(ctx, tx, p)
	}
	// Also honor admin_ops / impersonation tx keys so same-TX mutations work.
	if tx, ok := ctx.Value(adminOpsTxKey{}).(pgx.Tx); ok && tx != nil {
		return callAppendOnTx(ctx, tx, p)
	}
	if tx, ok := ctx.Value(impTxKey{}).(pgx.Tx); ok && tx != nil {
		return callAppendOnTx(ctx, tx, p)
	}
	if tx, ok := ctx.Value(credentialTxKey{}).(pgx.Tx); ok && tx != nil {
		return callAppendOnTx(ctx, tx, p)
	}
	return callAppendOnPool(ctx, r.pool, p)
}

func (r *AuditRepo) GetByID(ctx context.Context, id string) (audit.ChainEvent, error) {
	row, err := r.queries(ctx).GetAuditEventByID(ctx, id)
	if err != nil {
		return audit.ChainEvent{}, err
	}
	return mapGenAuditEvent(row), nil
}

func (r *AuditRepo) Search(ctx context.Context, f application.AuditSearchFilter) ([]audit.ChainEvent, error) {
	scope := f.ChainScope
	if scope == "" {
		scope = audit.DefaultChainScope
	}
	rows, err := r.queries(ctx).ListAuditEvents(ctx, gen.ListAuditEventsParams{
		ChainScope:   scope,
		Action:       f.Action,
		ResourceType: f.ResourceType,
		ResourceID:   f.ResourceID,
		ActorUserID:  f.ActorUserID,
		FromAt:       auditToTS(f.From),
		ToAt:         auditToTS(f.To),
		CursorAt:     auditToTS(f.CursorAt),
		CursorSeq:    f.CursorSeq,
		LimitCount:   f.Limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]audit.ChainEvent, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapGenAuditEvent(row))
	}
	return out, nil
}

func (r *AuditRepo) StreamFrom(ctx context.Context, chainScope string, fromSeq int64, limit int32) ([]audit.ChainEvent, error) {
	rows, err := r.queries(ctx).StreamAuditEventsFromSeq(ctx, gen.StreamAuditEventsFromSeqParams{
		ChainScope: chainScope,
		SequenceNo: fromSeq,
		Limit:      limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]audit.ChainEvent, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapGenAuditEvent(row))
	}
	return out, nil
}

func (r *AuditRepo) GetHead(ctx context.Context, chainScope string) (int64, []byte, error) {
	row, err := r.queries(ctx).GetAuditChainHead(ctx, chainScope)
	if err != nil {
		return 0, nil, err
	}
	return row.HeadSequence, row.HeadHash, nil
}

func (r *AuditRepo) CreateCheckpoint(ctx context.Context, cp audit.Checkpoint) error {
	if tx, ok := ctx.Value(auditTxKey{}).(pgx.Tx); ok && tx != nil {
		return callCheckpointOnTx(ctx, tx, cp.ID, cp.ChainScope, cp.SequenceNo, cp.HeadHash, cp.CanonicalVersion, cp.Signature, cp.KeyID, cp.SignedAt, cp.LockedUntil)
	}
	return callCheckpointOnPool(ctx, r.pool, cp.ID, cp.ChainScope, cp.SequenceNo, cp.HeadHash, cp.CanonicalVersion, cp.Signature, cp.KeyID, cp.SignedAt, cp.LockedUntil)
}

func (r *AuditRepo) LatestCheckpoint(ctx context.Context, chainScope string) (audit.Checkpoint, error) {
	row, err := r.queries(ctx).GetLatestAuditCheckpoint(ctx, chainScope)
	if err != nil {
		return audit.Checkpoint{}, err
	}
	return audit.Checkpoint{
		ID:               row.ID,
		ChainScope:       row.ChainScope,
		SequenceNo:       row.SequenceNo,
		HeadHash:         row.HeadHash,
		CanonicalVersion: row.CanonicalVersion,
		Signature:        row.Signature,
		KeyID:            row.KeyID,
		SignedAt:         row.SignedAt,
		LockedUntil:      row.LockedUntil,
		CreatedAt:        row.CreatedAt,
	}, nil
}

func (r *AuditRepo) Count(ctx context.Context, chainScope string) (int64, error) {
	return r.queries(ctx).CountAuditEvents(ctx, chainScope)
}

func (r *AuditRepo) MinMaxSeq(ctx context.Context, chainScope string) (int64, int64, error) {
	row, err := r.queries(ctx).MinMaxAuditSequence(ctx, chainScope)
	if err != nil {
		return 0, 0, err
	}
	return row.MinSeq, row.MaxSeq, nil
}

func (r *AuditRepo) InsertExport(ctx context.Context, e admin.AuditExport, filterJSON []byte, now time.Time) error {
	if len(filterJSON) == 0 {
		filterJSON = []byte("{}")
	}
	return r.queries(ctx).InsertAuditExportJob(ctx, gen.InsertAuditExportJobParams{
		ID:              e.ID,
		Status:          e.Status,
		FilterJson:      filterJSON,
		RedactionPolicy: e.RedactionPolicy,
		RequesterID:     e.RequesterID,
		Reason:          e.Reason,
		CreatedAt:       now,
		UpdatedAt:       now,
	})
}

func (r *AuditRepo) GetExport(ctx context.Context, id string) (admin.AuditExport, error) {
	row, err := r.queries(ctx).GetAuditExportJob(ctx, id)
	if err != nil {
		return admin.AuditExport{}, err
	}
	e := admin.AuditExport{
		ID:              row.ID,
		Status:          row.Status,
		RedactionPolicy: row.RedactionPolicy,
		RequesterID:     row.RequesterID,
		Reason:          row.Reason,
		RowCount:        row.RowCount,
		ErrorMessage:    row.ErrorMessage,
		CreatedAt:       row.CreatedAt,
	}
	if row.ExpiresAt.Valid {
		t := row.ExpiresAt.Time
		e.ExpiresAt = &t
	}
	if row.CompletedAt.Valid {
		t := row.CompletedAt.Time
		e.CompletedAt = &t
	}
	return e, nil
}

func (r *AuditRepo) CompleteExport(ctx context.Context, id, status string, rowCount *int64, completedAt, expiresAt *time.Time, errMsg *string) error {
	var ca, ea pgtype.Timestamptz
	if completedAt != nil {
		ca = pgtype.Timestamptz{Time: *completedAt, Valid: true}
	}
	if expiresAt != nil {
		ea = pgtype.Timestamptz{Time: *expiresAt, Valid: true}
	}
	return r.queries(ctx).CompleteAuditExportJob(ctx, gen.CompleteAuditExportJobParams{
		ID:           id,
		Status:       status,
		RowCount:     rowCount,
		CompletedAt:  ca,
		ExpiresAt:    ea,
		ErrorMessage: errMsg,
	})
}

func mapGenAuditEvent(row gen.AuditEvent) audit.ChainEvent {
	var meta map[string]any
	if len(row.MetadataJson) > 0 {
		_ = json.Unmarshal(row.MetadataJson, &meta)
	}
	var jcs map[string]any
	if len(row.JcsPayload) > 0 {
		_ = json.Unmarshal(row.JcsPayload, &jcs)
		if meta == nil {
			meta = jcs
		}
	}
	rowHash := row.RowHash
	if len(rowHash) == 0 {
		rowHash = row.PayloadHash
	}
	scope := row.ChainScope
	if scope == "" {
		scope = audit.DefaultChainScope
	}
	ver := row.CanonicalVersion
	if ver == "" {
		ver = audit.CanonicalVersionLaunch
	}
	return audit.ChainEvent{
		ID:               row.ID,
		ChainScope:       scope,
		SequenceNo:       row.SequenceNo,
		PrevHash:         row.PrevHash,
		RowHash:          rowHash,
		CanonicalVersion: ver,
		CanonicalPayload: row.CanonicalPayload,
		JCSPayload:       jcs,
		ActorUserID:      row.ActorUserID,
		Action:           row.Action,
		ResourceType:     row.ResourceType,
		ResourceID:       row.ResourceID,
		Reason:           row.Reason,
		RequestID:        row.RequestID,
		MerchantID:       row.MerchantID,
		Metadata:         meta,
		CreatedAt:        row.CreatedAt,
	}
}

func auditToTS(t *time.Time) pgtype.Timestamptz {
	if t == nil {
		return pgtype.Timestamptz{}
	}
	return pgtype.Timestamptz{Time: *t, Valid: true}
}
