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
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/credentials"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/gateway"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/kyc"
)

type credentialTxKey struct{}

// CredentialRepo is Postgres adapter for BE-410.
type CredentialRepo struct {
	pool *pgxpool.Pool
	q    *gen.Queries
}

func NewCredentialRepo(pool *pgxpool.Pool) *CredentialRepo {
	return &CredentialRepo{pool: pool, q: gen.New(pool)}
}

func (r *CredentialRepo) queries(ctx context.Context) *gen.Queries {
	if tx, ok := ctx.Value(credentialTxKey{}).(pgx.Tx); ok && tx != nil {
		return r.q.WithTx(tx)
	}
	return r.q
}

func (r *CredentialRepo) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	if _, ok := ctx.Value(credentialTxKey{}).(pgx.Tx); ok {
		return fn(ctx)
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("credential: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	txCtx := context.WithValue(ctx, credentialTxKey{}, tx)
	if err := fn(txCtx); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("credential: commit: %w", err)
	}
	return nil
}

func (r *CredentialRepo) IsNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func (r *CredentialRepo) IsUniqueViolation(err error) bool {
	var pe *pgconn.PgError
	return errors.As(err, &pe) && pe.Code == "23505"
}

func mapMerchantAPIKey(row gen.MerchantApiKey) gateway.APIKey {
	k := gateway.APIKey{
		ID:                row.ID,
		MerchantID:        row.MerchantID,
		KeyPrefix:         row.KeyPrefix,
		KeyHash:           row.KeyHash,
		PaymentMode:       row.PaymentMode,
		Status:            row.Status,
		Name:              row.Name,
		CreatedAt:         row.CreatedAt,
		UpdatedAt:         row.UpdatedAt,
		KeyVersion:        row.KeyVersion,
		IssuanceRequestID: row.IssuanceRequestID,
		Fingerprint:       row.Fingerprint,
	}
	if row.LastUsedAt.Valid {
		t := row.LastUsedAt.Time
		k.LastUsedAt = &t
	}
	if row.RevokedAt.Valid {
		t := row.RevokedAt.Time
		k.RevokedAt = &t
	}
	if row.ExpiresAt.Valid {
		t := row.ExpiresAt.Time
		k.ExpiresAt = &t
	}
	return k
}

func mapCredIssuance(row gen.ApiCredentialIssuanceRequest) kyc.IssuanceRequest {
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

func (r *CredentialRepo) ListAPIKeysByMerchant(ctx context.Context, merchantID string, limit int32) ([]gateway.APIKey, error) {
	rows, err := r.queries(ctx).CredListAPIKeysByMerchant(ctx, gen.CredListAPIKeysByMerchantParams{
		MerchantID: merchantID, Limit: limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]gateway.APIKey, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapMerchantAPIKey(row))
	}
	return out, nil
}

func (r *CredentialRepo) GetAPIKeyByID(ctx context.Context, id string) (gateway.APIKey, error) {
	row, err := r.queries(ctx).CredGetAPIKeyByID(ctx, id)
	if err != nil {
		return gateway.APIKey{}, err
	}
	return mapMerchantAPIKey(row), nil
}

func (r *CredentialRepo) GetActiveAPIKey(ctx context.Context, merchantID string) (gateway.APIKey, error) {
	row, err := r.queries(ctx).CredGetActiveAPIKey(ctx, merchantID)
	if err != nil {
		return gateway.APIKey{}, err
	}
	return mapMerchantAPIKey(row), nil
}

func (r *CredentialRepo) InsertAPIKey(ctx context.Context, k gateway.APIKey) error {
	return r.queries(ctx).CredInsertAPIKey(ctx, gen.CredInsertAPIKeyParams{
		ID: k.ID, MerchantID: k.MerchantID, KeyPrefix: k.KeyPrefix, KeyHash: k.KeyHash,
		PaymentMode: k.PaymentMode, Status: k.Status, Name: k.Name, KeyVersion: k.KeyVersion,
		IssuanceRequestID: k.IssuanceRequestID, Fingerprint: k.Fingerprint,
		CreatedAt: k.CreatedAt, UpdatedAt: k.UpdatedAt,
	})
}

func (r *CredentialRepo) RevokeAPIKey(ctx context.Context, id string, at time.Time) error {
	return r.queries(ctx).CredRevokeAPIKey(ctx, gen.CredRevokeAPIKeyParams{
		ID: id, RevokedAt: pgtype.Timestamptz{Time: at, Valid: true},
	})
}

func (r *CredentialRepo) SuspendAPIKey(ctx context.Context, id string, at time.Time) error {
	return r.queries(ctx).CredSuspendAPIKey(ctx, gen.CredSuspendAPIKeyParams{ID: id, UpdatedAt: at})
}

func (r *CredentialRepo) ReactivateAPIKey(ctx context.Context, id string, at time.Time) error {
	return r.queries(ctx).CredReactivateAPIKey(ctx, gen.CredReactivateAPIKeyParams{ID: id, UpdatedAt: at})
}

func (r *CredentialRepo) RevokeAllActiveKeys(ctx context.Context, merchantID string, at time.Time) error {
	return r.queries(ctx).CredRevokeAllActiveKeys(ctx, gen.CredRevokeAllActiveKeysParams{
		MerchantID: merchantID, RevokedAt: pgtype.Timestamptz{Time: at, Valid: true},
	})
}

func (r *CredentialRepo) InsertIssuance(ctx context.Context, ir kyc.IssuanceRequest) error {
	reqVer := ir.RequestVersion
	if reqVer < 1 {
		reqVer = 1
	}
	return r.queries(ctx).CredInsertIssuance(ctx, gen.CredInsertIssuanceParams{
		ID: ir.ID, MerchantID: ir.MerchantID, PaymentMode: ir.PaymentMode, Purpose: ir.Purpose,
		Capability: ir.Capability, Status: ir.Status, KycCaseID: ir.KYCCaseID, KycVersion: ir.KYCVersion,
		RequesterUserID: ir.RequesterUserID, AuthorizerUserID: ir.AuthorizerUserID, Reason: ir.Reason,
		AuthorizedAt:             optionalTz(ir.AuthorizedAt),
		ExpiresAt:                optionalTz(ir.ExpiresAt),
		ClaimTokenHash:           ir.ClaimTokenHash,
		ClaimExpiresAt:           optionalTz(ir.ClaimExpiresAt),
		ClaimRecipientUserID:     ir.ClaimRecipientUserID,
		ClaimAttempts:            ir.ClaimAttempts,
		MfaBindingSessionID:      ir.MFABindingSessionID,
		ExpectedPredecessorKeyID: ir.ExpectedPredecessorKey,
		ExpectedVersion:          ir.ExpectedVersion,
		RequestVersion:           reqVer,
		IdempotencyKeyHash:       ir.IdempotencyKeyHash,
		CreatedAt:                ir.CreatedAt,
		UpdatedAt:                ir.UpdatedAt,
	})
}

func optionalTz(t *time.Time) pgtype.Timestamptz {
	if t == nil {
		return pgtype.Timestamptz{}
	}
	return pgtype.Timestamptz{Time: *t, Valid: true}
}

func (r *CredentialRepo) GetIssuanceByID(ctx context.Context, id string) (kyc.IssuanceRequest, error) {
	row, err := r.queries(ctx).CredGetIssuanceByID(ctx, id)
	if err != nil {
		return kyc.IssuanceRequest{}, err
	}
	return mapCredIssuance(row), nil
}

func (r *CredentialRepo) GetIssuanceByClaimHash(ctx context.Context, hash string) (kyc.IssuanceRequest, error) {
	row, err := r.queries(ctx).CredGetIssuanceByClaimHash(ctx, &hash)
	if err != nil {
		return kyc.IssuanceRequest{}, err
	}
	return mapCredIssuance(row), nil
}

func (r *CredentialRepo) GetOutstandingIssuance(ctx context.Context, merchantID, mode string) (kyc.IssuanceRequest, error) {
	row, err := r.queries(ctx).CredGetOutstandingIssuance(ctx, gen.CredGetOutstandingIssuanceParams{
		MerchantID: merchantID, PaymentMode: mode,
	})
	if err != nil {
		return kyc.IssuanceRequest{}, err
	}
	return mapCredIssuance(row), nil
}

func (r *CredentialRepo) ListIssuancesByMerchant(ctx context.Context, merchantID string, limit int32) ([]kyc.IssuanceRequest, error) {
	rows, err := r.queries(ctx).CredListIssuancesByMerchant(ctx, gen.CredListIssuancesByMerchantParams{
		MerchantID: merchantID, Limit: limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]kyc.IssuanceRequest, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapCredIssuance(row))
	}
	return out, nil
}

func (r *CredentialRepo) MarkIssuanceClaimed(ctx context.Context, id string, at time.Time, apiKeyID string) error {
	return r.queries(ctx).CredMarkIssuanceClaimed(ctx, gen.CredMarkIssuanceClaimedParams{
		ID: id, ClaimedAt: pgtype.Timestamptz{Time: at, Valid: true}, ResultingApiKeyID: &apiKeyID,
	})
}

func (r *CredentialRepo) UpdateIssuanceClaimToken(ctx context.Context, p application.UpdateIssuanceClaimParams) error {
	var hash *string
	if p.ClaimTokenHash != "" {
		hash = &p.ClaimTokenHash
	}
	var recip *string
	if p.ClaimRecipientUserID != "" {
		recip = &p.ClaimRecipientUserID
	}
	return r.queries(ctx).CredUpdateIssuanceClaimToken(ctx, gen.CredUpdateIssuanceClaimTokenParams{
		ID:                   p.ID,
		ClaimTokenHash:       hash,
		ClaimExpiresAt:       optionalTzTime(p.ClaimExpiresAt),
		ClaimRecipientUserID: recip,
		MfaBindingSessionID:  p.MFABindingSessionID,
		Column6:              p.Status,
		UpdatedAt:            p.UpdatedAt,
		AuthorizerUserID:     p.AuthorizerUserID,
		AuthorizedAt:         optionalTz(p.AuthorizedAt),
		ExpiresAt:            optionalTz(p.ExpiresAt),
		Reason:               p.Reason,
	})
}

func optionalTzTime(t time.Time) pgtype.Timestamptz {
	if t.IsZero() {
		return pgtype.Timestamptz{}
	}
	return pgtype.Timestamptz{Time: t, Valid: true}
}

func (r *CredentialRepo) RevokeIssuance(ctx context.Context, id string, at time.Time, reason string) error {
	return r.queries(ctx).CredRevokeIssuance(ctx, gen.CredRevokeIssuanceParams{
		ID: id, RevokedAt: pgtype.Timestamptz{Time: at, Valid: true}, Column3: reason,
	})
}

func (r *CredentialRepo) BumpClaimAttempts(ctx context.Context, id string, at time.Time) error {
	return r.queries(ctx).CredBumpClaimAttempts(ctx, gen.CredBumpClaimAttemptsParams{ID: id, UpdatedAt: at})
}

func (r *CredentialRepo) InsertSecretClaim(ctx context.Context, c credentials.SecretClaim) error {
	return r.queries(ctx).CredInsertSecretClaim(ctx, gen.CredInsertSecretClaimParams{
		ID: c.ID, Kind: c.Kind, ResourceType: c.ResourceType, ResourceID: c.ResourceID,
		ResourceVersion: c.ResourceVersion, MerchantID: c.MerchantID, RecipientUserID: c.RecipientUserID,
		ClaimTokenHash: c.ClaimTokenHash, Status: c.Status, Attempts: c.Attempts, MaxAttempts: c.MaxAttempts,
		ExpiresAt: c.ExpiresAt, MfaBindingSessionID: c.MFABindingSessionID, IssuanceRequestID: c.IssuanceRequestID,
		CreatedAt: c.CreatedAt, UpdatedAt: c.UpdatedAt,
	})
}

func (r *CredentialRepo) GetSecretClaimByHash(ctx context.Context, hash string) (credentials.SecretClaim, error) {
	row, err := r.queries(ctx).CredGetSecretClaimByHash(ctx, hash)
	if err != nil {
		return credentials.SecretClaim{}, err
	}
	c := credentials.SecretClaim{
		ID: row.ID, Kind: row.Kind, ResourceType: row.ResourceType, ResourceID: row.ResourceID,
		ResourceVersion: row.ResourceVersion, MerchantID: row.MerchantID, RecipientUserID: row.RecipientUserID,
		ClaimTokenHash: row.ClaimTokenHash, Status: row.Status, Attempts: row.Attempts, MaxAttempts: row.MaxAttempts,
		ExpiresAt: row.ExpiresAt, MFABindingSessionID: row.MfaBindingSessionID, IssuanceRequestID: row.IssuanceRequestID,
		CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
	}
	if row.ConsumedAt.Valid {
		t := row.ConsumedAt.Time
		c.ConsumedAt = &t
	}
	return c, nil
}

func (r *CredentialRepo) ConsumeSecretClaim(ctx context.Context, id string, at time.Time) error {
	return r.queries(ctx).CredConsumeSecretClaim(ctx, gen.CredConsumeSecretClaimParams{
		ID: id, ConsumedAt: pgtype.Timestamptz{Time: at, Valid: true},
	})
}

func (r *CredentialRepo) RevokeSecretClaimsForIssuance(ctx context.Context, issuanceID string, at time.Time) error {
	return r.queries(ctx).CredRevokeSecretClaimsForIssuance(ctx, gen.CredRevokeSecretClaimsForIssuanceParams{
		IssuanceRequestID: &issuanceID, UpdatedAt: at,
	})
}

func (r *CredentialRepo) GetCapability(ctx context.Context, merchantID, mode, capability string) (gateway.Capability, error) {
	row, err := r.queries(ctx).CredGetCapability(ctx, gen.CredGetCapabilityParams{
		MerchantID: merchantID, PaymentMode: mode, Capability: capability,
	})
	if err != nil {
		return gateway.Capability{}, err
	}
	c := gateway.Capability{
		ID: row.ID, MerchantID: row.MerchantID, PaymentMode: row.PaymentMode,
		Capability: row.Capability, Status: row.Status, KYCCaseID: row.KycCaseID, KYCVersion: row.KycVersion,
		CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
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

func (r *CredentialRepo) GetMerchantOwner(ctx context.Context, merchantID string) (string, string, error) {
	row, err := r.queries(ctx).CredGetMerchantOwner(ctx, merchantID)
	if err != nil {
		return "", "", err
	}
	return row.OwnerUserID, row.Status, nil
}

func (r *CredentialRepo) GetMerchantByOwner(ctx context.Context, ownerUserID string) (string, string, error) {
	row, err := r.queries(ctx).CredGetMerchantByOwner(ctx, ownerUserID)
	if err != nil {
		return "", "", err
	}
	return row.ID, row.Status, nil
}

func (r *CredentialRepo) MerchantMemberActive(ctx context.Context, merchantID, userID string) (string, error) {
	return r.queries(ctx).CredMerchantMemberActive(ctx, gen.CredMerchantMemberActiveParams{
		MerchantID: merchantID, UserID: userID,
	})
}

func (r *CredentialRepo) GetStoreMerchant(ctx context.Context, storeID string) (string, string, error) {
	row, err := r.queries(ctx).CredGetStoreMerchant(ctx, storeID)
	if err != nil {
		return "", "", err
	}
	return row.MerchantID, row.Status, nil
}

func (r *CredentialRepo) InsertOutbox(ctx context.Context, id, topic string, payload []byte, dedupeKey *string, paymentMode *string, availableAt time.Time) error {
	return r.queries(ctx).CredInsertOutbox(ctx, gen.CredInsertOutboxParams{
		ID: id, Topic: topic, Payload: payload, AvailableAt: availableAt, DedupeKey: dedupeKey, PaymentMode: paymentMode,
	})
}

func (r *CredentialRepo) InsertAudit(ctx context.Context, id string, payloadHash []byte, at time.Time) error {
	canonical := []byte(fmt.Sprintf(`{"action":"credentials.note","legacyPayloadHash":"%x"}`, payloadHash))
	p := application.AuditAppendParams{
		ID:               id,
		ChainScope:       "default",
		CanonicalVersion: "JCS-1",
		CanonicalPayload: canonical,
		Action:           "credentials.note",
		ResourceType:     "credential",
		CreatedAt:        at,
		MetadataJSON:     []byte("{}"),
	}
	if tx, ok := ctx.Value(credentialTxKey{}).(pgx.Tx); ok && tx != nil {
		_, err := callAppendOnTx(ctx, tx, p)
		return err
	}
	_, err := callAppendOnPool(ctx, r.pool, p)
	return err
}

func mapIdempotency(row gen.IdempotencyRecord) application.IdempotencyRecord {
	rec := application.IdempotencyRecord{
		ID: row.ID, SubjectType: row.SubjectType, SubjectID: row.SubjectID, Operation: row.Operation,
		PaymentMode: row.PaymentMode, KeyHash: row.KeyHash, RequestHash: row.RequestHash, Status: row.Status,
		ResourceType: row.ResourceType, ResourceID: row.ResourceID,
		ResponseStatus: row.ResponseStatus, ResponseBody: row.ResponseBody, RequestID: row.RequestID,
		ExpiresAt: row.ExpiresAt,
	}
	if row.LeaseExpiresAt.Valid {
		t := row.LeaseExpiresAt.Time
		rec.LeaseExpiresAt = &t
	}
	return rec
}

func (r *CredentialRepo) TryInsertIdempotency(ctx context.Context, rec application.IdempotencyRecord) (application.IdempotencyRecord, bool, error) {
	row, err := r.queries(ctx).CredTryInsertIdempotency(ctx, gen.CredTryInsertIdempotencyParams{
		ID: rec.ID, SubjectType: rec.SubjectType, SubjectID: rec.SubjectID, Operation: rec.Operation,
		PaymentMode: rec.PaymentMode, KeyHash: rec.KeyHash, RequestHash: rec.RequestHash, Status: rec.Status,
		ResourceType: rec.ResourceType, ResourceID: rec.ResourceID,
		ResponseStatus: rec.ResponseStatus, ResponseBody: rec.ResponseBody, RequestID: rec.RequestID,
		LeaseExpiresAt: optionalTz(rec.LeaseExpiresAt), ExpiresAt: rec.ExpiresAt,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			got, gerr := r.GetIdempotency(ctx, rec.SubjectType, rec.SubjectID, rec.Operation, rec.PaymentMode, rec.KeyHash)
			return got, false, gerr
		}
		return application.IdempotencyRecord{}, false, err
	}
	return mapIdempotency(row), true, nil
}

func (r *CredentialRepo) GetIdempotency(ctx context.Context, subjectType, subjectID, operation string, paymentMode *string, keyHash string) (application.IdempotencyRecord, error) {
	row, err := r.queries(ctx).CredGetIdempotency(ctx, gen.CredGetIdempotencyParams{
		SubjectType: subjectType, SubjectID: subjectID, Operation: operation,
		PaymentMode: paymentMode, KeyHash: keyHash,
	})
	if err != nil {
		return application.IdempotencyRecord{}, err
	}
	return mapIdempotency(row), nil
}

func (r *CredentialRepo) CompleteIdempotency(ctx context.Context, id, status string, resourceType, resourceID *string, responseStatus int32, body json.RawMessage) (application.IdempotencyRecord, error) {
	row, err := r.queries(ctx).CredCompleteIdempotency(ctx, gen.CredCompleteIdempotencyParams{
		ID: id, Status: status, ResourceType: resourceType, ResourceID: resourceID,
		ResponseStatus: &responseStatus, ResponseBody: body,
	})
	if err != nil {
		return application.IdempotencyRecord{}, err
	}
	return mapIdempotency(row), nil
}
