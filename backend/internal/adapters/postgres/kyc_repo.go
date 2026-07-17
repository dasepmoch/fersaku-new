package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres/gen"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/gateway"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/kyc"
)

type kycTxKey struct{}

// KYCRepo is the Postgres adapter for BE-400.
type KYCRepo struct {
	pool *pgxpool.Pool
	q    *gen.Queries
}

// NewKYCRepo constructs a KYC repository.
func NewKYCRepo(pool *pgxpool.Pool) *KYCRepo {
	return &KYCRepo{pool: pool, q: gen.New(pool)}
}

func (r *KYCRepo) queries(ctx context.Context) *gen.Queries {
	if tx, ok := ctx.Value(kycTxKey{}).(pgx.Tx); ok && tx != nil {
		return r.q.WithTx(tx)
	}
	return r.q
}

func (r *KYCRepo) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	if _, ok := ctx.Value(kycTxKey{}).(pgx.Tx); ok {
		return fn(ctx)
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("kyc: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	txCtx := context.WithValue(ctx, kycTxKey{}, tx)
	if err := fn(txCtx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *KYCRepo) IsNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func (r *KYCRepo) IsUniqueViolation(err error) bool {
	var pe *pgconn.PgError
	return errors.As(err, &pe) && pe.Code == "23505"
}

func mapCase(row gen.KycCase) kyc.Case {
	c := kyc.Case{
		ID:                  row.ID,
		MerchantID:          row.MerchantID,
		StoreID:             row.StoreID,
		Capability:          row.Capability,
		Status:              row.Status,
		Version:             row.Version,
		LegalName:           row.LegalName,
		BusinessName:        row.BusinessName,
		RegistrationNumber:  row.RegistrationNumber,
		CountryCode:         row.CountryCode,
		ConsentVersion:      row.ConsentVersion,
		ReviewerUserID:      row.ReviewerUserID,
		VendorRef:           row.VendorRef,
		Reason:              row.Reason,
		ClarificationReason: row.ClarificationReason,
		PredecessorCaseID:   row.PredecessorCaseID,
		CreatedAt:           row.CreatedAt,
		UpdatedAt:           row.UpdatedAt,
	}
	if row.ConsentAcceptedAt.Valid {
		t := row.ConsentAcceptedAt.Time
		c.ConsentAcceptedAt = &t
	}
	if row.SubmittedAt.Valid {
		t := row.SubmittedAt.Time
		c.SubmittedAt = &t
	}
	if row.ReviewedAt.Valid {
		t := row.ReviewedAt.Time
		c.ReviewedAt = &t
	}
	if row.ApprovedAt.Valid {
		t := row.ApprovedAt.Time
		c.ApprovedAt = &t
	}
	if row.RejectedAt.Valid {
		t := row.RejectedAt.Time
		c.RejectedAt = &t
	}
	if row.ExpiresAt.Valid {
		t := row.ExpiresAt.Time
		c.ExpiresAt = &t
	}
	return c
}

func mapDoc(row gen.KycDocument) kyc.Document {
	d := kyc.Document{
		ID:                   row.ID,
		CaseID:               row.CaseID,
		MerchantID:           row.MerchantID,
		DocumentType:         row.DocumentType,
		Status:               row.Status,
		ContentType:          row.ContentType,
		SizeBytes:            row.SizeBytes,
		ChecksumSHA256:       row.ChecksumSha256,
		StorageBucket:        row.StorageBucket,
		StorageKey:           row.StorageKey,
		EncryptionKeyVersion: row.EncryptionKeyVersion,
		CiphertextSizeBytes:  row.CiphertextSizeBytes,
		ScanStatus:           row.ScanStatus,
		ScanDetail:           row.ScanDetail,
		DocVersion:           row.DocVersion,
		UploadedBy:           row.UploadedBy,
		CreatedAt:            row.CreatedAt,
		UpdatedAt:            row.UpdatedAt,
	}
	if row.ReadyAt.Valid {
		t := row.ReadyAt.Time
		d.ReadyAt = &t
	}
	return d
}

func mapIssuance(row gen.ApiCredentialIssuanceRequest) kyc.IssuanceRequest {
	ir := kyc.IssuanceRequest{
		ID:                     row.ID,
		MerchantID:             row.MerchantID,
		PaymentMode:            row.PaymentMode,
		Purpose:                row.Purpose,
		Capability:             row.Capability,
		Status:                 row.Status,
		KYCCaseID:              row.KycCaseID,
		KYCVersion:             row.KycVersion,
		RequesterUserID:        row.RequesterUserID,
		AuthorizerUserID:       row.AuthorizerUserID,
		Reason:                 row.Reason,
		CreatedAt:              row.CreatedAt,
		UpdatedAt:              row.UpdatedAt,
		ClaimTokenHash:         row.ClaimTokenHash,
		ClaimRecipientUserID:   row.ClaimRecipientUserID,
		ClaimAttempts:          row.ClaimAttempts,
		MFABindingSessionID:    row.MfaBindingSessionID,
		ExpectedPredecessorKey: row.ExpectedPredecessorKeyID,
		ExpectedVersion:        row.ExpectedVersion,
		RequestVersion:         row.RequestVersion,
		IdempotencyKeyHash:     row.IdempotencyKeyHash,
		ResultingAPIKeyID:      row.ResultingApiKeyID,
	}
	if row.AuthorizedAt.Valid {
		t := row.AuthorizedAt.Time
		ir.AuthorizedAt = &t
	}
	if row.ClaimedAt.Valid {
		t := row.ClaimedAt.Time
		ir.ClaimedAt = &t
	}
	if row.ExpiresAt.Valid {
		t := row.ExpiresAt.Time
		ir.ExpiresAt = &t
	}
	if row.RevokedAt.Valid {
		t := row.RevokedAt.Time
		ir.RevokedAt = &t
	}
	if row.ClaimExpiresAt.Valid {
		t := row.ClaimExpiresAt.Time
		ir.ClaimExpiresAt = &t
	}
	if row.ClaimConsumedAt.Valid {
		t := row.ClaimConsumedAt.Time
		ir.ClaimConsumedAt = &t
	}
	return ir
}

func (r *KYCRepo) InsertCase(ctx context.Context, c kyc.Case) error {
	return r.queries(ctx).KYCInsertCase(ctx, gen.KYCInsertCaseParams{
		ID:                  c.ID,
		MerchantID:          c.MerchantID,
		StoreID:             c.StoreID,
		Capability:          c.Capability,
		Status:              c.Status,
		Version:             c.Version,
		LegalName:           c.LegalName,
		BusinessName:        c.BusinessName,
		RegistrationNumber:  c.RegistrationNumber,
		CountryCode:         c.CountryCode,
		ConsentVersion:      c.ConsentVersion,
		ConsentAcceptedAt:   timePtrToPg(c.ConsentAcceptedAt),
		Reason:              c.Reason,
		ClarificationReason: c.ClarificationReason,
		PredecessorCaseID:   c.PredecessorCaseID,
		CreatedAt:           c.CreatedAt,
		UpdatedAt:           c.UpdatedAt,
	})
}

func (r *KYCRepo) GetCaseByID(ctx context.Context, id string) (kyc.Case, error) {
	row, err := r.queries(ctx).KYCGetCaseByID(ctx, id)
	if err != nil {
		return kyc.Case{}, err
	}
	return mapCase(row), nil
}

func (r *KYCRepo) GetOpenCaseByMerchant(ctx context.Context, merchantID string) (kyc.Case, error) {
	row, err := r.queries(ctx).KYCGetOpenCaseByMerchant(ctx, merchantID)
	if err != nil {
		return kyc.Case{}, err
	}
	return mapCase(row), nil
}

func (r *KYCRepo) ListCasesByMerchant(ctx context.Context, merchantID string, limit int32) ([]kyc.Case, error) {
	if limit <= 0 {
		limit = 20
	}
	rows, err := r.queries(ctx).KYCListCasesByMerchant(ctx, gen.KYCListCasesByMerchantParams{
		MerchantID: merchantID,
		Limit:      limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]kyc.Case, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapCase(row))
	}
	return out, nil
}

func (r *KYCRepo) ListAdminQueue(ctx context.Context, status *string, limit int32) ([]kyc.Case, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := r.queries(ctx).KYCListAdminQueue(ctx, gen.KYCListAdminQueueParams{
		Status: status,
		Lim:    limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]kyc.Case, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapCase(row))
	}
	return out, nil
}

func (r *KYCRepo) UpdateCaseStatus(ctx context.Context, c kyc.Case) (kyc.Case, error) {
	row, err := r.queries(ctx).KYCUpdateCaseStatus(ctx, gen.KYCUpdateCaseStatusParams{
		ID:                  c.ID,
		Status:              c.Status,
		Version:             c.Version,
		Reason:              c.Reason,
		ClarificationReason: c.ClarificationReason,
		ReviewerUserID:      c.ReviewerUserID,
		VendorRef:           c.VendorRef,
		SubmittedAt:         timePtrToPg(c.SubmittedAt),
		ReviewedAt:          timePtrToPg(c.ReviewedAt),
		ApprovedAt:          timePtrToPg(c.ApprovedAt),
		RejectedAt:          timePtrToPg(c.RejectedAt),
		ExpiresAt:           timePtrToPg(c.ExpiresAt),
		LegalName:           c.LegalName,
		BusinessName:        c.BusinessName,
		RegistrationNumber:  c.RegistrationNumber,
		ConsentVersion:      c.ConsentVersion,
		ConsentAcceptedAt:   timePtrToPg(c.ConsentAcceptedAt),
		UpdatedAt:           c.UpdatedAt,
	})
	if err != nil {
		return kyc.Case{}, err
	}
	return mapCase(row), nil
}

func (r *KYCRepo) InsertDocument(ctx context.Context, d kyc.Document) error {
	return r.queries(ctx).KYCInsertDocument(ctx, gen.KYCInsertDocumentParams{
		ID:                   d.ID,
		CaseID:               d.CaseID,
		MerchantID:           d.MerchantID,
		DocumentType:         d.DocumentType,
		Status:               d.Status,
		ContentType:          d.ContentType,
		SizeBytes:            d.SizeBytes,
		ChecksumSha256:       d.ChecksumSHA256,
		StorageBucket:        d.StorageBucket,
		StorageKey:           d.StorageKey,
		EncryptionKeyVersion: d.EncryptionKeyVersion,
		CiphertextSizeBytes:  d.CiphertextSizeBytes,
		ScanStatus:           d.ScanStatus,
		ScanDetail:           d.ScanDetail,
		DocVersion:           d.DocVersion,
		UploadedBy:           d.UploadedBy,
		ReadyAt:              timePtrToPg(d.ReadyAt),
		CreatedAt:            d.CreatedAt,
		UpdatedAt:            d.UpdatedAt,
	})
}

func (r *KYCRepo) GetDocumentByID(ctx context.Context, id string) (kyc.Document, error) {
	row, err := r.queries(ctx).KYCGetDocumentByID(ctx, id)
	if err != nil {
		return kyc.Document{}, err
	}
	return mapDoc(row), nil
}

func (r *KYCRepo) ListDocumentsByCase(ctx context.Context, caseID string) ([]kyc.Document, error) {
	rows, err := r.queries(ctx).KYCListDocumentsByCase(ctx, caseID)
	if err != nil {
		return nil, err
	}
	out := make([]kyc.Document, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapDoc(row))
	}
	return out, nil
}

func (r *KYCRepo) UpdateDocument(ctx context.Context, d kyc.Document) error {
	return r.queries(ctx).KYCUpdateDocument(ctx, gen.KYCUpdateDocumentParams{
		ID:                   d.ID,
		Status:               d.Status,
		ContentType:          d.ContentType,
		SizeBytes:            d.SizeBytes,
		ChecksumSha256:       d.ChecksumSHA256,
		StorageBucket:        d.StorageBucket,
		StorageKey:           d.StorageKey,
		EncryptionKeyVersion: d.EncryptionKeyVersion,
		CiphertextSizeBytes:  d.CiphertextSizeBytes,
		ScanStatus:           d.ScanStatus,
		ScanDetail:           d.ScanDetail,
		ReadyAt:              timePtrToPg(d.ReadyAt),
		UpdatedAt:            d.UpdatedAt,
	})
}

func (r *KYCRepo) CountReadyDocumentsByType(ctx context.Context, caseID, docType string) (int64, error) {
	return r.queries(ctx).KYCCountReadyDocumentsByType(ctx, gen.KYCCountReadyDocumentsByTypeParams{
		CaseID:       caseID,
		DocumentType: docType,
	})
}

func (r *KYCRepo) InsertTransition(ctx context.Context, t kyc.Transition) error {
	meta := t.Metadata
	if len(meta) == 0 {
		meta = []byte("{}")
	}
	return r.queries(ctx).KYCInsertTransition(ctx, gen.KYCInsertTransitionParams{
		ID:          t.ID,
		CaseID:      t.CaseID,
		FromStatus:  t.FromStatus,
		ToStatus:    t.ToStatus,
		ActorUserID: t.ActorUserID,
		Reason:      t.Reason,
		Metadata:    meta,
		CreatedAt:   t.CreatedAt,
	})
}

func (r *KYCRepo) ListTransitionsByCase(ctx context.Context, caseID string) ([]kyc.Transition, error) {
	rows, err := r.queries(ctx).KYCListTransitionsByCase(ctx, caseID)
	if err != nil {
		return nil, err
	}
	out := make([]kyc.Transition, 0, len(rows))
	for _, row := range rows {
		out = append(out, kyc.Transition{
			ID:          row.ID,
			CaseID:      row.CaseID,
			FromStatus:  row.FromStatus,
			ToStatus:    row.ToStatus,
			ActorUserID: row.ActorUserID,
			Reason:      row.Reason,
			Metadata:    row.Metadata,
			CreatedAt:   row.CreatedAt,
		})
	}
	return out, nil
}

func (r *KYCRepo) InsertIssuanceRequest(ctx context.Context, ir kyc.IssuanceRequest) error {
	return r.queries(ctx).KYCInsertIssuanceRequest(ctx, gen.KYCInsertIssuanceRequestParams{
		ID:               ir.ID,
		MerchantID:       ir.MerchantID,
		PaymentMode:      ir.PaymentMode,
		Purpose:          ir.Purpose,
		Capability:       ir.Capability,
		Status:           ir.Status,
		KycCaseID:        ir.KYCCaseID,
		KycVersion:       ir.KYCVersion,
		RequesterUserID:  ir.RequesterUserID,
		AuthorizerUserID: ir.AuthorizerUserID,
		Reason:           ir.Reason,
		AuthorizedAt:     timePtrToPg(ir.AuthorizedAt),
		ExpiresAt:        timePtrToPg(ir.ExpiresAt),
		CreatedAt:        ir.CreatedAt,
		UpdatedAt:        ir.UpdatedAt,
	})
}

func (r *KYCRepo) GetOutstandingIssuance(ctx context.Context, merchantID, mode string) (kyc.IssuanceRequest, error) {
	row, err := r.queries(ctx).KYCGetOutstandingIssuance(ctx, gen.KYCGetOutstandingIssuanceParams{
		MerchantID:  merchantID,
		PaymentMode: mode,
	})
	if err != nil {
		return kyc.IssuanceRequest{}, err
	}
	return mapIssuance(row), nil
}

func (r *KYCRepo) GetIssuanceByID(ctx context.Context, id string) (kyc.IssuanceRequest, error) {
	row, err := r.queries(ctx).KYCGetIssuanceByID(ctx, id)
	if err != nil {
		return kyc.IssuanceRequest{}, err
	}
	return mapIssuance(row), nil
}

func (r *KYCRepo) UpdateIssuanceStatus(ctx context.Context, ir kyc.IssuanceRequest) error {
	return r.queries(ctx).KYCUpdateIssuanceStatus(ctx, gen.KYCUpdateIssuanceStatusParams{
		ID:               ir.ID,
		Status:           ir.Status,
		KycCaseID:        ir.KYCCaseID,
		KycVersion:       ir.KYCVersion,
		AuthorizerUserID: ir.AuthorizerUserID,
		Reason:           ir.Reason,
		AuthorizedAt:     timePtrToPg(ir.AuthorizedAt),
		ExpiresAt:        timePtrToPg(ir.ExpiresAt),
		RevokedAt:        timePtrToPg(ir.RevokedAt),
		UpdatedAt:        ir.UpdatedAt,
	})
}

func (r *KYCRepo) GetCapability(ctx context.Context, merchantID, mode, capability string) (gateway.Capability, error) {
	row, err := r.queries(ctx).GatewayGetCapability(ctx, gen.GatewayGetCapabilityParams{
		MerchantID:  merchantID,
		PaymentMode: mode,
		Capability:  capability,
	})
	if err != nil {
		return gateway.Capability{}, err
	}
	c := gateway.Capability{
		ID:          row.ID,
		MerchantID:  row.MerchantID,
		PaymentMode: row.PaymentMode,
		Capability:  row.Capability,
		Status:      row.Status,
		KYCCaseID:   row.KycCaseID,
		KYCVersion:  row.KycVersion,
		CreatedAt:   row.CreatedAt,
		UpdatedAt:   row.UpdatedAt,
	}
	if row.EffectiveAt.Valid {
		t := row.EffectiveAt.Time
		c.EffectiveAt = &t
	}
	if row.ExpiresAt.Valid {
		t := row.ExpiresAt.Time
		c.ExpiresAt = &t
	}
	return c, nil
}

func (r *KYCRepo) UpsertCapability(ctx context.Context, c gateway.Capability) error {
	return r.queries(ctx).GatewayUpsertCapability(ctx, gen.GatewayUpsertCapabilityParams{
		ID:          c.ID,
		MerchantID:  c.MerchantID,
		PaymentMode: c.PaymentMode,
		Capability:  c.Capability,
		Status:      c.Status,
		KycCaseID:   c.KYCCaseID,
		KycVersion:  c.KYCVersion,
		EffectiveAt: timePtrToPg(c.EffectiveAt),
		CreatedAt:   c.CreatedAt,
		UpdatedAt:   c.UpdatedAt,
	})
}

func (r *KYCRepo) GetMerchantOwnerUserID(ctx context.Context, merchantID string) (string, error) {
	return r.queries(ctx).KYCGetMerchantOwnerUserID(ctx, merchantID)
}

func (r *KYCRepo) GetMerchantByOwner(ctx context.Context, ownerUserID string) (string, string, error) {
	row, err := r.queries(ctx).KYCGetMerchantByOwner(ctx, ownerUserID)
	if err != nil {
		return "", "", err
	}
	return row.ID, row.Status, nil
}

func (r *KYCRepo) GetCanonicalStoreID(ctx context.Context, merchantID string) (string, error) {
	return r.queries(ctx).KYCGetCanonicalStoreID(ctx, merchantID)
}

func (r *KYCRepo) MerchantMemberActive(ctx context.Context, merchantID, userID string) (string, error) {
	return r.queries(ctx).KYCMerchantMemberActive(ctx, gen.KYCMerchantMemberActiveParams{
		MerchantID: merchantID,
		UserID:     userID,
	})
}

func (r *KYCRepo) InsertOutbox(ctx context.Context, id, topic string, payload []byte, dedupeKey *string, paymentMode *string, availableAt time.Time) error {
	if len(payload) == 0 {
		payload = []byte("{}")
	}
	// Ensure valid JSON
	if !json.Valid(payload) {
		payload = []byte("{}")
	}
	return r.queries(ctx).KYCInsertOutbox(ctx, gen.KYCInsertOutboxParams{
		ID:          id,
		Topic:       topic,
		Payload:     payload,
		AvailableAt: availableAt,
		DedupeKey:   dedupeKey,
		PaymentMode: paymentMode,
	})
}

// ensure pgtype import used when building without timePtrToPg from identity.
var _ = pgtype.Timestamptz{}
