package postgres

import (
	"context"
	"encoding/hex"
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
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/reviews"
)

type adminOpsTxKey struct{}

// AdminOpsRepo is the Postgres adapter for BE-510 admin operations.
type AdminOpsRepo struct {
	pool *pgxpool.Pool
	q    *gen.Queries
}

func NewAdminOpsRepo(pool *pgxpool.Pool) *AdminOpsRepo {
	return &AdminOpsRepo{pool: pool, q: gen.New(pool)}
}

func (r *AdminOpsRepo) queries(ctx context.Context) *gen.Queries {
	if tx, ok := ctx.Value(adminOpsTxKey{}).(pgx.Tx); ok && tx != nil {
		return r.q.WithTx(tx)
	}
	return r.q
}

func (r *AdminOpsRepo) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	if _, ok := ctx.Value(adminOpsTxKey{}).(pgx.Tx); ok {
		return fn(ctx)
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("admin_ops: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	txCtx := context.WithValue(ctx, adminOpsTxKey{}, tx)
	if err := fn(txCtx); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("admin_ops: commit: %w", err)
	}
	return nil
}

func (r *AdminOpsRepo) IsNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func adminOpsTSPtr(t pgtype.Timestamptz) *time.Time {
	if !t.Valid {
		return nil
	}
	v := t.Time.UTC()
	return &v
}

func adminOpsToTS(t *time.Time) pgtype.Timestamptz {
	if t == nil {
		return pgtype.Timestamptz{}
	}
	return pgtype.Timestamptz{Time: t.UTC(), Valid: true}
}

func (r *AdminOpsRepo) GetMerchant(ctx context.Context, id string) (application.AdminOpsMerchant, error) {
	row, err := r.queries(ctx).AdminOpsGetMerchant(ctx, id)
	if err != nil {
		return application.AdminOpsMerchant{}, err
	}
	return application.AdminOpsMerchant{
		ID:               row.ID,
		OwnerUserID:      row.OwnerUserID,
		DisplayName:      row.DisplayName,
		Status:           row.Status,
		SuspensionReason: row.SuspensionReason,
		SuspendedAt:      adminOpsTSPtr(row.SuspendedAt),
		SuspendedBy:      row.SuspendedBy,
		CreatedAt:        row.CreatedAt,
		UpdatedAt:        row.UpdatedAt,
	}, nil
}

func (r *AdminOpsRepo) UpdateMerchantStatus(ctx context.Context, id, status string, reason *string, suspendedAt *time.Time, suspendedBy *string, now time.Time) (application.AdminOpsMerchant, error) {
	row, err := r.queries(ctx).AdminOpsUpdateMerchantStatus(ctx, gen.AdminOpsUpdateMerchantStatusParams{
		ID:               id,
		Status:           status,
		SuspensionReason: reason,
		SuspendedAt:      adminOpsToTS(suspendedAt),
		SuspendedBy:      suspendedBy,
		UpdatedAt:        now,
	})
	if err != nil {
		return application.AdminOpsMerchant{}, err
	}
	return application.AdminOpsMerchant{
		ID:               row.ID,
		OwnerUserID:      row.OwnerUserID,
		DisplayName:      row.DisplayName,
		Status:           row.Status,
		SuspensionReason: row.SuspensionReason,
		SuspendedAt:      adminOpsTSPtr(row.SuspendedAt),
		SuspendedBy:      row.SuspendedBy,
		CreatedAt:        row.CreatedAt,
		UpdatedAt:        row.UpdatedAt,
	}, nil
}

func (r *AdminOpsRepo) GetCapability(ctx context.Context, merchantID, mode, capability string) (application.AdminOpsCapability, error) {
	row, err := r.queries(ctx).AdminOpsGetCapability(ctx, gen.AdminOpsGetCapabilityParams{
		MerchantID:  merchantID,
		PaymentMode: mode,
		Capability:  capability,
	})
	if err != nil {
		return application.AdminOpsCapability{}, err
	}
	return application.AdminOpsCapability{
		ID:               row.ID,
		MerchantID:       row.MerchantID,
		PaymentMode:      row.PaymentMode,
		Capability:       row.Capability,
		Status:           row.Status,
		SuspensionReason: row.SuspensionReason,
		SuspendedBy:      row.SuspendedBy,
	}, nil
}

func (r *AdminOpsRepo) UpsertCapabilityAccess(ctx context.Context, c application.AdminOpsCapability, effectiveAt time.Time, now time.Time) error {
	return r.queries(ctx).AdminOpsUpsertCapabilityAccess(ctx, gen.AdminOpsUpsertCapabilityAccessParams{
		ID:               c.ID,
		MerchantID:       c.MerchantID,
		PaymentMode:      c.PaymentMode,
		Capability:       c.Capability,
		Status:           c.Status,
		SuspensionReason: c.SuspensionReason,
		SuspendedBy:      c.SuspendedBy,
		EffectiveAt:      adminOpsToTS(&effectiveAt),
		CreatedAt:        now,
		UpdatedAt:        now,
	})
}

func (r *AdminOpsRepo) ListEmergency(ctx context.Context) ([]admin.EmergencyControl, error) {
	rows, err := r.queries(ctx).AdminOpsListEmergency(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]admin.EmergencyControl, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapEmergency(row))
	}
	return out, nil
}

func (r *AdminOpsRepo) GetEmergency(ctx context.Context, switchName string) (admin.EmergencyControl, error) {
	row, err := r.queries(ctx).AdminOpsGetEmergency(ctx, switchName)
	if err != nil {
		return admin.EmergencyControl{}, err
	}
	return mapEmergency(row), nil
}

func (r *AdminOpsRepo) UpdateEmergency(ctx context.Context, switchName string, enabled bool, reason, ticket string, updatedBy string, expectedVersion int64, now time.Time) (admin.EmergencyControl, error) {
	row, err := r.queries(ctx).AdminOpsUpdateEmergency(ctx, gen.AdminOpsUpdateEmergencyParams{
		SwitchName:     switchName,
		Enabled:        enabled,
		Reason:         reason,
		IncidentTicket: ticket,
		UpdatedBy:      &updatedBy,
		EffectiveAt:    now,
		Version:        expectedVersion,
	})
	if err != nil {
		return admin.EmergencyControl{}, err
	}
	return mapEmergency(row), nil
}

func mapEmergency(row gen.PlatformEmergencyControl) admin.EmergencyControl {
	return admin.EmergencyControl{
		SwitchName:     row.SwitchName,
		Enabled:        row.Enabled,
		Version:        row.Version,
		Reason:         row.Reason,
		IncidentTicket: row.IncidentTicket,
		UpdatedBy:      row.UpdatedBy,
		EffectiveAt:    row.EffectiveAt,
		UpdatedAt:      row.UpdatedAt,
	}
}

func (r *AdminOpsRepo) InsertAudit(ctx context.Context, a application.AdminOpsAuditInsert) error {
	meta := a.MetadataJSON
	if len(meta) == 0 {
		meta = []byte("{}")
	}
	// BE-530: JCS-1 chain via SECURITY DEFINER append_audit_event.
	// Prefer caller-provided canonical payload; fall back to payload_hash as bytes.
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
	if tx, ok := ctx.Value(adminOpsTxKey{}).(pgx.Tx); ok && tx != nil {
		_, err := callAppendOnTx(ctx, tx, p)
		return err
	}
	_, err := callAppendOnPool(ctx, r.pool, p)
	return err
}

func derefStr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func (r *AdminOpsRepo) ListAudit(ctx context.Context, f application.AdminOpsAuditFilter) ([]admin.AuditEvent, error) {
	rows, err := r.queries(ctx).AdminOpsListAudit(ctx, gen.AdminOpsListAuditParams{
		Action:       f.Action,
		ResourceType: f.ResourceType,
		ResourceID:   f.ResourceID,
		ActorUserID:  f.ActorUserID,
		FromAt:       adminOpsToTS(f.From),
		ToAt:         adminOpsToTS(f.To),
		CursorAt:     adminOpsToTS(f.CursorAt),
		CursorSeq:    f.CursorSeq,
		LimitCount:   f.Limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]admin.AuditEvent, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapAudit(row))
	}
	return out, nil
}

func (r *AdminOpsRepo) GetAudit(ctx context.Context, id string) (admin.AuditEvent, error) {
	row, err := r.queries(ctx).AdminOpsGetAudit(ctx, id)
	if err != nil {
		return admin.AuditEvent{}, err
	}
	return mapAudit(row), nil
}

func mapAudit(row gen.AuditEvent) admin.AuditEvent {
	var meta map[string]any
	if len(row.MetadataJson) > 0 {
		_ = json.Unmarshal(row.MetadataJson, &meta)
	}
	hash := row.PayloadHash
	if len(row.RowHash) == 32 {
		hash = row.RowHash
	}
	return admin.AuditEvent{
		ID:           row.ID,
		SequenceNo:   row.SequenceNo,
		PayloadHash:  hex.EncodeToString(hash),
		CreatedAt:    row.CreatedAt,
		ActorUserID:  row.ActorUserID,
		Action:       row.Action,
		ResourceType: row.ResourceType,
		ResourceID:   row.ResourceID,
		Reason:       row.Reason,
		RequestID:    row.RequestID,
		MerchantID:   row.MerchantID,
		Metadata:     meta,
	}
}

func (r *AdminOpsRepo) AuditIntegrityMeta(ctx context.Context) (admin.AuditIntegrityMeta, error) {
	var eventCount, headSeq, minSeq int64
	var hashHex *string
	var headAt *time.Time
	err := r.pool.QueryRow(ctx, `
		SELECT
			(SELECT COUNT(*)::bigint FROM audit_events WHERE chain_scope = 'default'),
			(SELECT COALESCE(head_sequence, 0)::bigint FROM audit_chain_heads WHERE chain_scope = 'default'),
			(SELECT COALESCE(MIN(sequence_no), 0)::bigint FROM audit_events WHERE chain_scope = 'default'),
			(SELECT encode(head_hash, 'hex') FROM audit_chain_heads WHERE chain_scope = 'default'),
			(SELECT created_at FROM audit_events WHERE chain_scope = 'default' ORDER BY sequence_no DESC LIMIT 1)
	`).Scan(&eventCount, &headSeq, &minSeq, &hashHex, &headAt)
	if err != nil {
		return admin.AuditIntegrityMeta{}, err
	}
	m := admin.AuditIntegrityMeta{
		EventCount:     eventCount,
		HeadSequence:   headSeq,
		MinSequence:    minSeq,
		ChainMode:      "JCS-1",
		VerifierStatus: "OK",
	}
	if hashHex != nil && *hashHex != "" {
		m.HeadPayloadHash = hashHex
	}
	if headAt != nil {
		t := headAt.UTC()
		m.HeadCreatedAt = &t
	}
	return m, nil
}

func (r *AdminOpsRepo) InsertAuditExport(ctx context.Context, e admin.AuditExport, filterJSON []byte, now time.Time) error {
	if len(filterJSON) == 0 {
		filterJSON = []byte("{}")
	}
	return r.queries(ctx).AdminOpsInsertAuditExport(ctx, gen.AdminOpsInsertAuditExportParams{
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

func (r *AdminOpsRepo) GetAuditExport(ctx context.Context, id string) (admin.AuditExport, error) {
	row, err := r.queries(ctx).AdminOpsGetAuditExport(ctx, id)
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

func (r *AdminOpsRepo) CompleteAuditExport(ctx context.Context, id, status string, rowCount *int64, completedAt, expiresAt *time.Time, errMsg *string) error {
	return r.queries(ctx).AdminOpsCompleteAuditExport(ctx, gen.AdminOpsCompleteAuditExportParams{
		ID:           id,
		Status:       status,
		RowCount:     rowCount,
		CompletedAt:  adminOpsToTS(completedAt),
		ExpiresAt:    adminOpsToTS(expiresAt),
		ErrorMessage: errMsg,
	})
}

func (r *AdminOpsRepo) ListPaymentMismatches(ctx context.Context, limit int32) ([]admin.PaymentMismatch, error) {
	rows, err := r.queries(ctx).AdminOpsListPaymentMismatches(ctx, limit)
	if err != nil {
		return nil, err
	}
	out := make([]admin.PaymentMismatch, 0, len(rows))
	for _, row := range rows {
		m := admin.PaymentMismatch{
			ID:              row.EventID,
			LocalStatus:     row.LocalStatus,
			MerchantID:      row.MerchantID,
			OrderID:         row.OrderID,
			Amount:          row.IntentAmountIdr,
			Provider:        "Xendit",
			ProviderStatus:  "PAID",
			ObservedAt:      row.ReceivedAt,
			ReplayCount:     row.ReplayCount,
		}
		if row.PaymentIntentID != nil {
			m.PaymentIntentID = *row.PaymentIntentID
		}
		if row.MerchantName != nil {
			m.Merchant = *row.MerchantName
		}
		if row.ProviderReference != nil {
			m.ProviderReference = *row.ProviderReference
		}
		if row.AmountIdr != nil {
			m.Amount = *row.AmountIdr
		}
		if row.AlertCode != nil {
			m.AlertCode = *row.AlertCode
		}
		if row.MismatchCode != nil {
			m.MismatchCode = *row.MismatchCode
		}
		out = append(out, m)
	}
	return out, nil
}

func (r *AdminOpsRepo) GetReview(ctx context.Context, id string) (reviews.Review, error) {
	row, err := r.queries(ctx).AdminOpsGetReview(ctx, id)
	if err != nil {
		return reviews.Review{}, err
	}
	return mapAdminOpsReview(row), nil
}

func (r *AdminOpsRepo) UpdateReviewStatus(ctx context.Context, id, status string, now time.Time) (reviews.Review, error) {
	row, err := r.queries(ctx).AdminOpsUpdateReviewStatus(ctx, gen.AdminOpsUpdateReviewStatusParams{
		ID:        id,
		Status:    status,
		UpdatedAt: now,
	})
	if err != nil {
		return reviews.Review{}, err
	}
	return mapAdminOpsReview(row), nil
}

func mapAdminOpsReview(row gen.ProductReview) reviews.Review {
	return reviews.Review{
		ID:               row.ID,
		StoreID:          row.StoreID,
		MerchantID:       row.MerchantID,
		ProductID:        row.ProductID,
		OrderID:          row.OrderID,
		OrderItemID:      row.OrderItemID,
		BuyerUserID:      row.BuyerUserID,
		Rating:           int32(row.Rating),
		Title:            row.Title,
		Body:             row.Body,
		Status:           row.Status,
		VerifiedPurchase: row.VerifiedPurchase,
		ContentVersion:   row.ContentVersion,
		CreatedAt:        row.CreatedAt,
		UpdatedAt:        row.UpdatedAt,
	}
}

func (r *AdminOpsRepo) GetBuyerUser(ctx context.Context, id string) (application.AdminOpsBuyerUser, error) {
	row, err := r.queries(ctx).AdminOpsGetBuyerUser(ctx, id)
	if err != nil {
		return application.AdminOpsBuyerUser{}, err
	}
	return application.AdminOpsBuyerUser{
		ID:              row.ID,
		EmailDisplay:    row.EmailDisplay,
		EmailNormalized: row.EmailNormalized,
		Name:            row.Name,
		Status:          row.Status,
		EmailVerifiedAt: adminOpsTSPtr(row.EmailVerifiedAt),
		CreatedAt:       row.CreatedAt,
	}, nil
}

func (r *AdminOpsRepo) GetPaymentIntent(ctx context.Context, id string) (application.AdminOpsPaymentIntent, error) {
	row, err := r.queries(ctx).AdminOpsGetPaymentIntent(ctx, id)
	if err != nil {
		return application.AdminOpsPaymentIntent{}, err
	}
	return application.AdminOpsPaymentIntent{
		ID:                row.ID,
		OrderID:           row.OrderID,
		StoreID:           row.StoreID,
		MerchantID:        row.MerchantID,
		PaymentMode:       row.PaymentMode,
		Source:            row.Source,
		Provider:          row.Provider,
		AccountScope:      row.AccountScope,
		ProviderReference: row.ProviderReference,
		ExternalID:        row.ExternalID,
		AmountIDR:         row.AmountIdr,
		Status:            row.Status,
		CreatedAt:         row.CreatedAt,
	}, nil
}
