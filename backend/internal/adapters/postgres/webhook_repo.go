package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres/gen"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/credentials"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/webhooks"
)

type webhookTxKey struct{}

// WebhookRepo is Postgres adapter for BE-420.
type WebhookRepo struct {
	pool *pgxpool.Pool
	q    *gen.Queries
}

func NewWebhookRepo(pool *pgxpool.Pool) *WebhookRepo {
	return &WebhookRepo{pool: pool, q: gen.New(pool)}
}

func (r *WebhookRepo) queries(ctx context.Context) *gen.Queries {
	if tx, ok := ctx.Value(webhookTxKey{}).(pgx.Tx); ok && tx != nil {
		return r.q.WithTx(tx)
	}
	return r.q
}

func (r *WebhookRepo) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	txCtx := context.WithValue(ctx, webhookTxKey{}, tx)
	if err := fn(txCtx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *WebhookRepo) IsNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func (r *WebhookRepo) IsUniqueViolation(err error) bool {
	var pe *pgconn.PgError
	return errors.As(err, &pe) && pe.Code == "23505"
}

func tsPtr(t *time.Time) pgtype.Timestamptz {
	if t == nil {
		return pgtype.Timestamptz{}
	}
	return pgtype.Timestamptz{Time: t.UTC(), Valid: true}
}

func fromTS(t pgtype.Timestamptz) *time.Time {
	if !t.Valid {
		return nil
	}
	tt := t.Time.UTC()
	return &tt
}

func int4Ptr(v *int32) pgtype.Int4 {
	if v == nil {
		return pgtype.Int4{}
	}
	return pgtype.Int4{Int32: *v, Valid: true}
}

func fromInt4(v pgtype.Int4) *int32 {
	if !v.Valid {
		return nil
	}
	x := v.Int32
	return &x
}

func allowlistJSON(list []string) []byte {
	if list == nil {
		list = []string{}
	}
	b, _ := json.Marshal(list)
	return b
}

func parseAllowlist(raw []byte) []string {
	if len(raw) == 0 {
		return nil
	}
	var out []string
	_ = json.Unmarshal(raw, &out)
	return out
}

func mapEndpoint(row gen.WhGetEndpointRow) webhooks.Endpoint {
	return webhooks.Endpoint{
		ID:                     row.ID,
		MerchantID:             row.MerchantID,
		StoreID:                row.StoreID,
		PaymentMode:            row.PaymentMode,
		URL:                    row.Url,
		URLHost:                row.UrlHost,
		Status:                 row.Status,
		ConfigVersion:          row.ConfigVersion,
		EventAllowlist:         parseAllowlist(row.EventAllowlist),
		CurrentSecretVersion:   row.CurrentSecretVersion,
		PreviousSecretVersion:  row.PreviousSecretVersion,
		SecretOverlapExpiresAt: fromTS(row.SecretOverlapExpiresAt),
		FailureCount:           row.FailureCount,
		LastSuccessAt:          fromTS(row.LastSuccessAt),
		LastFailureAt:          fromTS(row.LastFailureAt),
		DisabledAt:             fromTS(row.DisabledAt),
		DisabledReason:         row.DisabledReason,
		CreatedAt:              row.CreatedAt.UTC(),
		UpdatedAt:              row.UpdatedAt.UTC(),
	}
}

func mapEndpointList(row gen.WhListEndpointsByMerchantRow) webhooks.Endpoint {
	return webhooks.Endpoint{
		ID:                     row.ID,
		MerchantID:             row.MerchantID,
		StoreID:                row.StoreID,
		PaymentMode:            row.PaymentMode,
		URL:                    row.Url,
		URLHost:                row.UrlHost,
		Status:                 row.Status,
		ConfigVersion:          row.ConfigVersion,
		EventAllowlist:         parseAllowlist(row.EventAllowlist),
		CurrentSecretVersion:   row.CurrentSecretVersion,
		PreviousSecretVersion:  row.PreviousSecretVersion,
		SecretOverlapExpiresAt: fromTS(row.SecretOverlapExpiresAt),
		FailureCount:           row.FailureCount,
		LastSuccessAt:          fromTS(row.LastSuccessAt),
		LastFailureAt:          fromTS(row.LastFailureAt),
		DisabledAt:             fromTS(row.DisabledAt),
		DisabledReason:         row.DisabledReason,
		CreatedAt:              row.CreatedAt.UTC(),
		UpdatedAt:              row.UpdatedAt.UTC(),
	}
}

func mapSecret(row gen.WhGetActiveSecretRow) webhooks.SecretVersion {
	return webhooks.SecretVersion{
		ID:               row.ID,
		EndpointID:       row.EndpointID,
		MerchantID:       row.MerchantID,
		Version:          row.Version,
		Status:           row.Status,
		SecretCiphertext: row.SecretCiphertext,
		SecretKeyVersion: row.SecretKeyVersion,
		Fingerprint:      row.Fingerprint,
		ActivatedAt:      fromTS(row.ActivatedAt),
		SupersededAt:     fromTS(row.SupersededAt),
		OverlapExpiresAt: fromTS(row.OverlapExpiresAt),
		CreatedAt:        row.CreatedAt.UTC(),
		UpdatedAt:        row.UpdatedAt.UTC(),
	}
}

func mapSecretVer(row gen.WhGetSecretVersionRow) webhooks.SecretVersion {
	return webhooks.SecretVersion{
		ID:               row.ID,
		EndpointID:       row.EndpointID,
		MerchantID:       row.MerchantID,
		Version:          row.Version,
		Status:           row.Status,
		SecretCiphertext: row.SecretCiphertext,
		SecretKeyVersion: row.SecretKeyVersion,
		Fingerprint:      row.Fingerprint,
		ActivatedAt:      fromTS(row.ActivatedAt),
		SupersededAt:     fromTS(row.SupersededAt),
		OverlapExpiresAt: fromTS(row.OverlapExpiresAt),
		CreatedAt:        row.CreatedAt.UTC(),
		UpdatedAt:        row.UpdatedAt.UTC(),
	}
}

func mapSecretList(row gen.WhListSecretVersionsRow) webhooks.SecretVersion {
	return webhooks.SecretVersion{
		ID:               row.ID,
		EndpointID:       row.EndpointID,
		MerchantID:       row.MerchantID,
		Version:          row.Version,
		Status:           row.Status,
		SecretCiphertext: row.SecretCiphertext,
		SecretKeyVersion: row.SecretKeyVersion,
		Fingerprint:      row.Fingerprint,
		ActivatedAt:      fromTS(row.ActivatedAt),
		SupersededAt:     fromTS(row.SupersededAt),
		OverlapExpiresAt: fromTS(row.OverlapExpiresAt),
		CreatedAt:        row.CreatedAt.UTC(),
		UpdatedAt:        row.UpdatedAt.UTC(),
	}
}

func mapWebhookDelivery(d gen.WebhookDelivery) webhooks.Delivery {
	return webhooks.Delivery{
		ID:               d.ID,
		EndpointID:       d.EndpointID,
		MerchantID:       d.MerchantID,
		StoreID:          d.StoreID,
		PaymentMode:      d.PaymentMode,
		EventID:          d.EventID,
		EventType:        d.EventType,
		PayloadVersion:   d.PayloadVersion,
		PayloadBody:      d.PayloadBody,
		PayloadHash:      d.PayloadHash,
		SourceKind:       d.SourceKind,
		PaymentIntentID:  d.PaymentIntentID,
		OrderID:          d.OrderID,
		WithdrawalID:     d.WithdrawalID,
		IsTest:           d.IsTest,
		Status:           d.Status,
		AttemptCount:     d.AttemptCount,
		MaxAttempts:      d.MaxAttempts,
		NextRetryAt:      fromTS(d.NextRetryAt),
		LastHTTPStatus:   d.LastHttpStatus,
		LastLatencyMs:    d.LastLatencyMs,
		LastErrorClass:   d.LastErrorClass,
		DeadLetterReason: d.DeadLetterReason,
		DeliveredAt:      fromTS(d.DeliveredAt),
		CancelledAt:      fromTS(d.CancelledAt),
		CreatedAt:        d.CreatedAt.UTC(),
		UpdatedAt:        d.UpdatedAt.UTC(),
	}
}

func (r *WebhookRepo) InsertEndpoint(ctx context.Context, e webhooks.Endpoint) error {
	return r.queries(ctx).WhInsertEndpoint(ctx, gen.WhInsertEndpointParams{
		ID:                     e.ID,
		MerchantID:             e.MerchantID,
		StoreID:                e.StoreID,
		PaymentMode:            e.PaymentMode,
		Url:                    e.URL,
		UrlHost:                e.URLHost,
		Status:                 e.Status,
		ConfigVersion:          e.ConfigVersion,
		EventAllowlist:         allowlistJSON(e.EventAllowlist),
		CurrentSecretVersion:   e.CurrentSecretVersion,
		PreviousSecretVersion:  e.PreviousSecretVersion,
		SecretOverlapExpiresAt: tsPtr(e.SecretOverlapExpiresAt),
		FailureCount:           e.FailureCount,
		CreatedAt:              e.CreatedAt,
		UpdatedAt:              e.UpdatedAt,
	})
}

func (r *WebhookRepo) GetEndpoint(ctx context.Context, id string) (webhooks.Endpoint, error) {
	row, err := r.queries(ctx).WhGetEndpoint(ctx, id)
	if err != nil {
		return webhooks.Endpoint{}, err
	}
	return mapEndpoint(row), nil
}

func (r *WebhookRepo) ListEndpointsByMerchant(ctx context.Context, merchantID string, limit int32) ([]webhooks.Endpoint, error) {
	rows, err := r.queries(ctx).WhListEndpointsByMerchant(ctx, gen.WhListEndpointsByMerchantParams{
		MerchantID: merchantID,
		Limit:      limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]webhooks.Endpoint, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapEndpointList(row))
	}
	return out, nil
}

func (r *WebhookRepo) UpdateEndpoint(ctx context.Context, e webhooks.Endpoint) error {
	return r.queries(ctx).WhUpdateEndpoint(ctx, gen.WhUpdateEndpointParams{
		ID:                     e.ID,
		Url:                    e.URL,
		UrlHost:                e.URLHost,
		Status:                 e.Status,
		ConfigVersion:          e.ConfigVersion,
		EventAllowlist:         allowlistJSON(e.EventAllowlist),
		CurrentSecretVersion:   e.CurrentSecretVersion,
		PreviousSecretVersion:  e.PreviousSecretVersion,
		SecretOverlapExpiresAt: tsPtr(e.SecretOverlapExpiresAt),
		FailureCount:           e.FailureCount,
		LastSuccessAt:          tsPtr(e.LastSuccessAt),
		LastFailureAt:          tsPtr(e.LastFailureAt),
		DisabledAt:             tsPtr(e.DisabledAt),
		DisabledReason:         e.DisabledReason,
		UpdatedAt:              e.UpdatedAt,
	})
}

func (r *WebhookRepo) InsertSecretVersion(ctx context.Context, v webhooks.SecretVersion) error {
	return r.queries(ctx).WhInsertSecretVersion(ctx, gen.WhInsertSecretVersionParams{
		ID:               v.ID,
		EndpointID:       v.EndpointID,
		MerchantID:       v.MerchantID,
		Version:          v.Version,
		Status:           v.Status,
		SecretCiphertext: v.SecretCiphertext,
		SecretKeyVersion: v.SecretKeyVersion,
		Fingerprint:      v.Fingerprint,
		ActivatedAt:      tsPtr(v.ActivatedAt),
		SupersededAt:     tsPtr(v.SupersededAt),
		OverlapExpiresAt: tsPtr(v.OverlapExpiresAt),
		CreatedAt:        v.CreatedAt,
		UpdatedAt:        v.UpdatedAt,
	})
}

func (r *WebhookRepo) GetSecretVersion(ctx context.Context, endpointID string, version int32) (webhooks.SecretVersion, error) {
	row, err := r.queries(ctx).WhGetSecretVersion(ctx, gen.WhGetSecretVersionParams{
		EndpointID: endpointID,
		Version:    version,
	})
	if err != nil {
		return webhooks.SecretVersion{}, err
	}
	return mapSecretVer(row), nil
}

func (r *WebhookRepo) GetActiveSecret(ctx context.Context, endpointID string) (webhooks.SecretVersion, error) {
	row, err := r.queries(ctx).WhGetActiveSecret(ctx, endpointID)
	if err != nil {
		return webhooks.SecretVersion{}, err
	}
	return mapSecret(row), nil
}

func (r *WebhookRepo) ListSecretVersions(ctx context.Context, endpointID string) ([]webhooks.SecretVersion, error) {
	rows, err := r.queries(ctx).WhListSecretVersions(ctx, endpointID)
	if err != nil {
		return nil, err
	}
	out := make([]webhooks.SecretVersion, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapSecretList(row))
	}
	return out, nil
}

func (r *WebhookRepo) UpdateSecretVersion(ctx context.Context, v webhooks.SecretVersion) error {
	return r.queries(ctx).WhUpdateSecretVersion(ctx, gen.WhUpdateSecretVersionParams{
		ID:               v.ID,
		Status:           v.Status,
		ActivatedAt:      tsPtr(v.ActivatedAt),
		SupersededAt:     tsPtr(v.SupersededAt),
		OverlapExpiresAt: tsPtr(v.OverlapExpiresAt),
		UpdatedAt:        v.UpdatedAt,
	})
}

func (r *WebhookRepo) InsertDelivery(ctx context.Context, d webhooks.Delivery) error {
	return r.queries(ctx).WhInsertDelivery(ctx, gen.WhInsertDeliveryParams{
		ID:              d.ID,
		EndpointID:      d.EndpointID,
		MerchantID:      d.MerchantID,
		StoreID:         d.StoreID,
		PaymentMode:     d.PaymentMode,
		EventID:         d.EventID,
		EventType:       d.EventType,
		PayloadVersion:  d.PayloadVersion,
		PayloadBody:     d.PayloadBody,
		PayloadHash:     d.PayloadHash,
		SourceKind:      d.SourceKind,
		PaymentIntentID: d.PaymentIntentID,
		OrderID:         d.OrderID,
		WithdrawalID:    d.WithdrawalID,
		IsTest:          d.IsTest,
		Status:          d.Status,
		AttemptCount:    d.AttemptCount,
		MaxAttempts:     d.MaxAttempts,
		NextRetryAt:     tsPtr(d.NextRetryAt),
		CreatedAt:       d.CreatedAt,
		UpdatedAt:       d.UpdatedAt,
	})
}

func (r *WebhookRepo) GetDelivery(ctx context.Context, id string) (webhooks.Delivery, error) {
	row, err := r.queries(ctx).WhGetDelivery(ctx, id)
	if err != nil {
		return webhooks.Delivery{}, err
	}
	return mapWebhookDelivery(row), nil
}

func (r *WebhookRepo) GetDeliveryByEndpointEvent(ctx context.Context, endpointID, eventID string) (webhooks.Delivery, error) {
	row, err := r.queries(ctx).WhGetDeliveryByEndpointEvent(ctx, gen.WhGetDeliveryByEndpointEventParams{
		EndpointID: endpointID,
		EventID:    eventID,
	})
	if err != nil {
		return webhooks.Delivery{}, err
	}
	return mapWebhookDelivery(row), nil
}

func (r *WebhookRepo) UpdateDelivery(ctx context.Context, d webhooks.Delivery) error {
	return r.queries(ctx).WhUpdateDelivery(ctx, gen.WhUpdateDeliveryParams{
		ID:               d.ID,
		Status:           d.Status,
		AttemptCount:     d.AttemptCount,
		NextRetryAt:      tsPtr(d.NextRetryAt),
		LastHttpStatus:   d.LastHTTPStatus,
		LastLatencyMs:    d.LastLatencyMs,
		LastErrorClass:   d.LastErrorClass,
		DeadLetterReason: d.DeadLetterReason,
		DeliveredAt:      tsPtr(d.DeliveredAt),
		CancelledAt:      tsPtr(d.CancelledAt),
		UpdatedAt:        d.UpdatedAt,
	})
}

func (r *WebhookRepo) ListDeliveriesByMerchant(ctx context.Context, merchantID string, status *string, limit int32) ([]webhooks.Delivery, error) {
	st := ""
	if status != nil {
		st = *status
	}
	rows, err := r.queries(ctx).WhListDeliveriesByMerchant(ctx, gen.WhListDeliveriesByMerchantParams{
		MerchantID: merchantID,
		Column2:    st,
		Limit:      limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]webhooks.Delivery, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapWebhookDelivery(row))
	}
	return out, nil
}

func (r *WebhookRepo) ListAdminDeliveries(ctx context.Context, status, merchantID *string, limit int32) ([]webhooks.AdminDeliveryView, error) {
	st, mid := "", ""
	if status != nil {
		st = *status
	}
	if merchantID != nil {
		mid = *merchantID
	}
	rows, err := r.queries(ctx).WhListAdminDeliveries(ctx, gen.WhListAdminDeliveriesParams{
		Column1: st,
		Column2: mid,
		Limit:   limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]webhooks.AdminDeliveryView, 0, len(rows))
	for _, row := range rows {
		v := webhooks.AdminDeliveryView{
			DeliveryID:       row.ID,
			Kind:             "SELLER_DELIVERY",
			EndpointID:       row.EndpointID,
			EndpointHost:     row.UrlHost,
			MerchantID:       row.MerchantID,
			StoreID:          row.StoreID,
			PaymentMode:      row.PaymentMode,
			EventID:          row.EventID,
			EventType:        row.EventType,
			Status:           row.Status,
			AttemptCount:     row.AttemptCount,
			NextRetryAt:      fromTS(row.NextRetryAt),
			LastLatencyMs:    row.LastLatencyMs,
			DeadLetterReason: row.DeadLetterReason,
			IsTest:           row.IsTest,
			CreatedAt:        row.CreatedAt.UTC(),
			UpdatedAt:        row.UpdatedAt.UTC(),
		}
		if row.LastErrorClass != nil {
			v.LastHTTPClass = row.LastErrorClass
		}
		out = append(out, v)
	}
	return out, nil
}

func (r *WebhookRepo) InsertAttempt(ctx context.Context, a webhooks.Attempt) error {
	return r.queries(ctx).WhInsertAttempt(ctx, gen.WhInsertAttemptParams{
		ID:              a.ID,
		DeliveryID:      a.DeliveryID,
		AttemptNo:       a.AttemptNo,
		SignedTimestamp: a.SignedTimestamp,
		SignatureHeader: a.SignatureHeader,
		RequestUrl:      a.RequestURL,
		HttpStatus:      a.HTTPStatus,
		LatencyMs:       a.LatencyMs,
		ErrorClass:      a.ErrorClass,
		ErrorDetail:     a.ErrorDetail,
		ResponseSnippet: a.ResponseSnippet,
		StartedAt:       a.StartedAt,
		FinishedAt:      a.FinishedAt,
	})
}

func (r *WebhookRepo) ListAttempts(ctx context.Context, deliveryID string) ([]webhooks.Attempt, error) {
	rows, err := r.queries(ctx).WhListAttempts(ctx, deliveryID)
	if err != nil {
		return nil, err
	}
	out := make([]webhooks.Attempt, 0, len(rows))
	for _, row := range rows {
		out = append(out, webhooks.Attempt{
			ID:              row.ID,
			DeliveryID:      row.DeliveryID,
			AttemptNo:       row.AttemptNo,
			SignedTimestamp: row.SignedTimestamp,
			SignatureHeader: row.SignatureHeader,
			RequestURL:      row.RequestUrl,
			HTTPStatus:      row.HttpStatus,
			LatencyMs:       row.LatencyMs,
			ErrorClass:      row.ErrorClass,
			ErrorDetail:     row.ErrorDetail,
			ResponseSnippet: row.ResponseSnippet,
			StartedAt:       row.StartedAt.UTC(),
			FinishedAt:      row.FinishedAt.UTC(),
		})
	}
	return out, nil
}

func (r *WebhookRepo) InsertDeadLetter(ctx context.Context, dl webhooks.DeadLetter) error {
	return r.queries(ctx).WhInsertDeadLetter(ctx, gen.WhInsertDeadLetterParams{
		ID:             dl.ID,
		DeliveryID:     dl.DeliveryID,
		EndpointID:     dl.EndpointID,
		MerchantID:     dl.MerchantID,
		EventID:        dl.EventID,
		EventType:      dl.EventType,
		Reason:         dl.Reason,
		LastHttpStatus: dl.LastHTTPStatus,
		AttemptCount:   dl.AttemptCount,
		CreatedAt:      dl.CreatedAt,
	})
}

func (r *WebhookRepo) ResolveDeadLetter(ctx context.Context, deliveryID, resolvedBy, reason string, at time.Time) error {
	return r.queries(ctx).WhResolveDeadLetter(ctx, gen.WhResolveDeadLetterParams{
		DeliveryID:    deliveryID,
		ResolvedAt:    pgtype.Timestamptz{Time: at.UTC(), Valid: true},
		ResolvedBy:    &resolvedBy,
		ResolveReason: &reason,
	})
}

func (r *WebhookRepo) InsertSecretClaim(ctx context.Context, c credentials.SecretClaim) error {
	return r.queries(ctx).WhInsertSecretClaim(ctx, gen.WhInsertSecretClaimParams{
		ID:                  c.ID,
		Kind:                c.Kind,
		ResourceType:        c.ResourceType,
		ResourceID:          c.ResourceID,
		ResourceVersion:     c.ResourceVersion,
		MerchantID:          c.MerchantID,
		RecipientUserID:     c.RecipientUserID,
		ClaimTokenHash:      c.ClaimTokenHash,
		Status:              c.Status,
		Attempts:            c.Attempts,
		MaxAttempts:         c.MaxAttempts,
		ExpiresAt:           c.ExpiresAt,
		MfaBindingSessionID: c.MFABindingSessionID,
		CreatedAt:           c.CreatedAt,
		UpdatedAt:           c.UpdatedAt,
	})
}

func (r *WebhookRepo) GetSecretClaimByHash(ctx context.Context, hash string) (credentials.SecretClaim, error) {
	row, err := r.queries(ctx).WhGetSecretClaimByHash(ctx, hash)
	if err != nil {
		return credentials.SecretClaim{}, err
	}
	return credentials.SecretClaim{
		ID:                  row.ID,
		Kind:                row.Kind,
		ResourceType:        row.ResourceType,
		ResourceID:          row.ResourceID,
		ResourceVersion:     row.ResourceVersion,
		MerchantID:          row.MerchantID,
		RecipientUserID:     row.RecipientUserID,
		ClaimTokenHash:      row.ClaimTokenHash,
		Status:              row.Status,
		Attempts:            row.Attempts,
		MaxAttempts:         row.MaxAttempts,
		ExpiresAt:           row.ExpiresAt.UTC(),
		ConsumedAt:          fromTS(row.ConsumedAt),
		MFABindingSessionID: row.MfaBindingSessionID,
		IssuanceRequestID:   row.IssuanceRequestID,
		CreatedAt:           row.CreatedAt.UTC(),
		UpdatedAt:           row.UpdatedAt.UTC(),
	}, nil
}

func (r *WebhookRepo) ConsumeSecretClaim(ctx context.Context, id string, at time.Time) error {
	return r.queries(ctx).WhConsumeSecretClaim(ctx, gen.WhConsumeSecretClaimParams{
		ID:         id,
		ConsumedAt: pgtype.Timestamptz{Time: at.UTC(), Valid: true},
	})
}

func (r *WebhookRepo) RevokeActiveSecretClaimsForResource(ctx context.Context, kind, resourceType, resourceID string, at time.Time) error {
	return r.queries(ctx).WhRevokeActiveSecretClaimsForResource(ctx, gen.WhRevokeActiveSecretClaimsForResourceParams{
		Kind:         kind,
		ResourceType: resourceType,
		ResourceID:   resourceID,
		UpdatedAt:    at.UTC(),
	})
}

func (r *WebhookRepo) GetStoreMerchant(ctx context.Context, storeID string) (merchantID, status string, err error) {
	row, err := r.queries(ctx).WhGetStoreMerchant(ctx, storeID)
	if err != nil {
		return "", "", err
	}
	return row.MerchantID, row.Status, nil
}

func (r *WebhookRepo) MerchantMemberActive(ctx context.Context, merchantID, userID string) (role string, err error) {
	return r.queries(ctx).WhMerchantMemberActive(ctx, gen.WhMerchantMemberActiveParams{
		MerchantID: merchantID,
		UserID:     userID,
	})
}

func (r *WebhookRepo) GetMerchantByOwner(ctx context.Context, ownerUserID string) (merchantID, status string, err error) {
	row, err := r.queries(ctx).WhGetMerchantByOwner(ctx, ownerUserID)
	if err != nil {
		return "", "", err
	}
	return row.ID, row.Status, nil
}

func (r *WebhookRepo) InsertOutbox(ctx context.Context, id, topic string, payload []byte, dedupeKey *string, paymentMode *string, availableAt time.Time) error {
	return r.queries(ctx).WhInsertOutbox(ctx, gen.WhInsertOutboxParams{
		ID:          id,
		Topic:       topic,
		Payload:     payload,
		AvailableAt: availableAt,
		DedupeKey:   dedupeKey,
		PaymentMode: paymentMode,
	})
}
