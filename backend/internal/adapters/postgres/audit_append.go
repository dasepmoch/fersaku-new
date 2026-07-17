package postgres

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/audit"
)

func callAppendOnTx(ctx context.Context, tx pgx.Tx, p application.AuditAppendParams) (application.AuditAppendResult, error) {
	return scanAppend(tx.QueryRow(ctx, appendSQL, appendArgs(p)...))
}

func callAppendOnPool(ctx context.Context, pool *pgxpool.Pool, p application.AuditAppendParams) (application.AuditAppendResult, error) {
	return scanAppend(pool.QueryRow(ctx, appendSQL, appendArgs(p)...))
}

const appendSQL = `
SELECT out_id, out_sequence_no, out_prev_hash, out_row_hash, out_chain_scope, out_created_at
FROM append_audit_event(
	$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13
)`

func appendArgs(p application.AuditAppendParams) []any {
	scope := p.ChainScope
	if scope == "" {
		scope = audit.DefaultChainScope
	}
	ver := p.CanonicalVersion
	if ver == "" {
		ver = audit.CanonicalVersionLaunch
	}
	meta := p.MetadataJSON
	if len(meta) == 0 {
		meta = []byte("{}")
	}
	created := p.CreatedAt
	if created.IsZero() {
		created = time.Now().UTC()
	}
	return []any{
		p.ID, scope, ver, p.CanonicalPayload,
		p.ActorUserID, p.Action, p.ResourceType, p.ResourceID,
		p.Reason, p.RequestID, p.MerchantID, meta, created,
	}
}

func scanAppend(row pgx.Row) (application.AuditAppendResult, error) {
	var out application.AuditAppendResult
	err := row.Scan(&out.ID, &out.SequenceNo, &out.PrevHash, &out.RowHash, &out.ChainScope, &out.CreatedAt)
	if err != nil {
		return application.AuditAppendResult{}, fmt.Errorf("append_audit_event: %w", err)
	}
	return out, nil
}

func callCheckpointOnPool(ctx context.Context, pool *pgxpool.Pool, id, scope string, seq int64, headHash []byte, ver string, sig []byte, keyID string, signedAt, lockedUntil time.Time) error {
	_, err := pool.Exec(ctx, checkpointSQL, id, scope, seq, headHash, ver, sig, keyID, signedAt, lockedUntil)
	if err != nil {
		return fmt.Errorf("insert_audit_checkpoint: %w", err)
	}
	return nil
}

func callCheckpointOnTx(ctx context.Context, tx pgx.Tx, id, scope string, seq int64, headHash []byte, ver string, sig []byte, keyID string, signedAt, lockedUntil time.Time) error {
	_, err := tx.Exec(ctx, checkpointSQL, id, scope, seq, headHash, ver, sig, keyID, signedAt, lockedUntil)
	if err != nil {
		return fmt.Errorf("insert_audit_checkpoint: %w", err)
	}
	return nil
}

const checkpointSQL = `SELECT insert_audit_checkpoint($1, $2, $3, $4, $5, $6, $7, $8, $9)`
