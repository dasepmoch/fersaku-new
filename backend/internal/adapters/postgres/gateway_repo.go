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
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/gateway"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/payments"
)

type gatewayTxKey struct{}

// GatewayRepo is the Postgres adapter for BE-320.
type GatewayRepo struct {
	pool *pgxpool.Pool
	q    *gen.Queries
}

func NewGatewayRepo(pool *pgxpool.Pool) *GatewayRepo {
	return &GatewayRepo{pool: pool, q: gen.New(pool)}
}

func (r *GatewayRepo) queries(ctx context.Context) *gen.Queries {
	if tx, ok := ctx.Value(gatewayTxKey{}).(pgx.Tx); ok && tx != nil {
		return r.q.WithTx(tx)
	}
	return r.q
}

func (r *GatewayRepo) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	if _, ok := ctx.Value(gatewayTxKey{}).(pgx.Tx); ok {
		return fn(ctx)
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("gateway: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	txCtx := context.WithValue(ctx, gatewayTxKey{}, tx)
	if err := fn(txCtx); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("gateway: commit: %w", err)
	}
	return nil
}

func (r *GatewayRepo) IsNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func (r *GatewayRepo) IsUniqueViolation(err error) bool {
	var pe *pgconn.PgError
	return errors.As(err, &pe) && pe.Code == "23505"
}

func (r *GatewayRepo) GetAPIKeyByPrefix(ctx context.Context, prefix string) (gateway.APIKey, error) {
	row, err := r.queries(ctx).GatewayGetAPIKeyByPrefix(ctx, prefix)
	if err != nil {
		return gateway.APIKey{}, err
	}
	k := gateway.APIKey{
		ID:          row.ID,
		MerchantID:  row.MerchantID,
		KeyPrefix:   row.KeyPrefix,
		KeyHash:     row.KeyHash,
		PaymentMode: row.PaymentMode,
		Status:      row.Status,
		Name:        row.Name,
		CreatedAt:   row.CreatedAt,
		UpdatedAt:   row.UpdatedAt,
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
	return k, nil
}

func (r *GatewayRepo) TouchAPIKeyLastUsed(ctx context.Context, id string, at time.Time) error {
	return r.queries(ctx).GatewayTouchAPIKeyLastUsed(ctx, gen.GatewayTouchAPIKeyLastUsedParams{
		ID:         id,
		LastUsedAt: pgtype.Timestamptz{Time: at, Valid: true},
	})
}

func (r *GatewayRepo) InsertAPIKey(ctx context.Context, k gateway.APIKey) error {
	return r.queries(ctx).GatewayInsertAPIKey(ctx, gen.GatewayInsertAPIKeyParams{
		ID:          k.ID,
		MerchantID:  k.MerchantID,
		KeyPrefix:   k.KeyPrefix,
		KeyHash:     k.KeyHash,
		PaymentMode: k.PaymentMode,
		Status:      k.Status,
		Name:        k.Name,
		CreatedAt:   k.CreatedAt,
		UpdatedAt:   k.UpdatedAt,
	})
}

func (r *GatewayRepo) GetCapability(ctx context.Context, merchantID, mode, capability string) (gateway.Capability, error) {
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

func (r *GatewayRepo) UpsertCapability(ctx context.Context, c gateway.Capability) error {
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

func (r *GatewayRepo) GetRedirectOrigin(ctx context.Context, merchantID, mode, origin string) (gateway.RedirectOrigin, error) {
	row, err := r.queries(ctx).GatewayGetRedirectOrigin(ctx, gen.GatewayGetRedirectOriginParams{
		MerchantID:  merchantID,
		PaymentMode: mode,
		Origin:      origin,
	})
	if err != nil {
		return gateway.RedirectOrigin{}, err
	}
	return gateway.RedirectOrigin{
		ID:          row.ID,
		MerchantID:  row.MerchantID,
		PaymentMode: row.PaymentMode,
		Origin:      row.Origin,
		Status:      row.Status,
		CreatedAt:   row.CreatedAt,
	}, nil
}

func (r *GatewayRepo) InsertRedirectOrigin(ctx context.Context, o gateway.RedirectOrigin) error {
	return r.queries(ctx).GatewayInsertRedirectOrigin(ctx, gen.GatewayInsertRedirectOriginParams{
		ID:          o.ID,
		MerchantID:  o.MerchantID,
		PaymentMode: o.PaymentMode,
		Origin:      o.Origin,
		Status:      o.Status,
		CreatedBy:   nil,
		Reason:      "",
		CreatedAt:   o.CreatedAt,
		UpdatedAt:   o.CreatedAt,
	})
}

func (r *GatewayRepo) GetWebhookEndpoint(ctx context.Context, id string) (gateway.WebhookEndpoint, error) {
	row, err := r.queries(ctx).GatewayGetWebhookEndpoint(ctx, id)
	if err != nil {
		return gateway.WebhookEndpoint{}, err
	}
	return gateway.WebhookEndpoint{
		ID:            row.ID,
		MerchantID:    row.MerchantID,
		PaymentMode:   row.PaymentMode,
		URL:           row.Url,
		Status:        row.Status,
		ConfigVersion: row.ConfigVersion,
		CreatedAt:     row.CreatedAt,
		UpdatedAt:     row.UpdatedAt,
	}, nil
}

func (r *GatewayRepo) InsertWebhookEndpoint(ctx context.Context, e gateway.WebhookEndpoint) error {
	return r.queries(ctx).GatewayInsertWebhookEndpoint(ctx, gen.GatewayInsertWebhookEndpointParams{
		ID:            e.ID,
		MerchantID:    e.MerchantID,
		PaymentMode:   e.PaymentMode,
		Url:           e.URL,
		Status:        e.Status,
		ConfigVersion: e.ConfigVersion,
		EventAllowlist: json.RawMessage(`[]`),
		CreatedAt:     e.CreatedAt,
		UpdatedAt:     e.UpdatedAt,
	})
}

func (r *GatewayRepo) GetCanonicalStore(ctx context.Context, merchantID string) (application.CheckoutStoreRow, error) {
	row, err := r.queries(ctx).GatewayGetCanonicalStore(ctx, merchantID)
	if err != nil {
		return application.CheckoutStoreRow{}, err
	}
	return application.CheckoutStoreRow{
		ID:         row.ID,
		Name:       row.Name,
		MerchantID: row.MerchantID,
	}, nil
}

func (r *GatewayRepo) GetMerchantStatus(ctx context.Context, merchantID string) (string, error) {
	row, err := r.queries(ctx).GatewayGetMerchantStatus(ctx, merchantID)
	if err != nil {
		return "", err
	}
	return row.Status, nil
}

func (r *GatewayRepo) InsertOrder(ctx context.Context, o application.CheckoutOrder) error {
	return r.queries(ctx).GatewayInsertOrder(ctx, gen.GatewayInsertOrderParams{
		ID:                 o.ID,
		OrderNumber:        o.OrderNumber,
		StoreID:            o.StoreID,
		MerchantID:         o.MerchantID,
		BuyerUserID:        o.BuyerUserID,
		BuyerEmail:         o.BuyerEmail,
		BuyerName:          o.BuyerName,
		PaymentStatus:      o.PaymentStatus,
		OrderStatus:        o.OrderStatus,
		Source:             o.Source,
		PaymentMode:        o.PaymentMode,
		Currency:           o.Currency,
		SubtotalIdr:        o.SubtotalIDR,
		DiscountIdr:        o.DiscountIDR,
		TipIdr:             o.TipIDR,
		FeeIdr:             o.FeeIDR,
		GrossIdr:           o.GrossIDR,
		MerchantNetIdr:     o.MerchantNetIDR,
		FeeSnapshotID:      o.FeeSnapshotID,
		ExpiresAt:          timePtrToPg(o.ExpiresAt),
		IdempotencyKeyHash: o.IdempotencyKeyHash,
		CreatedAt:          o.CreatedAt,
		UpdatedAt:          o.UpdatedAt,
	})
}

func (r *GatewayRepo) UpdateOrderStatus(ctx context.Context, id, paymentStatus, orderStatus string, now time.Time) error {
	return r.queries(ctx).GatewayUpdateOrderStatus(ctx, gen.GatewayUpdateOrderStatusParams{
		ID:            id,
		PaymentStatus: paymentStatus,
		OrderStatus:   orderStatus,
		UpdatedAt:     now,
	})
}

func (r *GatewayRepo) InsertPaymentIntent(ctx context.Context, pi payments.Intent) error {
	meta := pi.Metadata
	if len(meta) == 0 {
		meta = json.RawMessage(`{}`)
	}
	return r.queries(ctx).GatewayInsertPaymentIntent(ctx, gen.GatewayInsertPaymentIntentParams{
		ID:                     pi.ID,
		OrderID:                pi.OrderID,
		StoreID:                pi.StoreID,
		MerchantID:             pi.MerchantID,
		PaymentMode:            pi.PaymentMode,
		Source:                 pi.Source,
		Provider:               pi.Provider,
		AccountScope:           pi.AccountScope,
		ProviderReference:      pi.ProviderReference,
		ExternalID:             pi.ExternalID,
		AmountIdr:              pi.AmountIDR,
		Currency:               pi.Currency,
		FeeSnapshotID:          pi.FeeSnapshotID,
		CouponReservationID:    pi.CouponReservationID,
		StockReservationID:     pi.StockReservationID,
		Status:                 pi.Status,
		ProviderFinancialState: pi.ProviderFinancialState,
		QrString:               pi.QRString,
		QrImageUrl:             pi.QRImageURL,
		ExpiresAt:              pi.ExpiresAt,
		CancelRequestedAt:      timePtrToPg(pi.CancelRequestedAt),
		ExpireRequestedAt:      timePtrToPg(pi.ExpireRequestedAt),
		CancelReason:           pi.CancelReason,
		ExpireReason:           pi.ExpireReason,
		UnknownOperation:       pi.UnknownOperation,
		LookupScheduledAt:      timePtrToPg(pi.LookupScheduledAt),
		LookupAttempts:         pi.LookupAttempts,
		PaidLate:               pi.PaidLate,
		PrecedingStatus:        pi.PrecedingStatus,
		BuyerUserID:            pi.BuyerUserID,
		BuyerEmail:             pi.BuyerEmail,
		BuyerSessionID:         pi.BuyerSessionID,
		PublicTokenHash:        pi.PublicTokenHash,
		IdempotencyKeyHash:     pi.IdempotencyKeyHash,
		RequestHash:            pi.RequestHash,
		ProductSnapshot:        pi.ProductSnapshot,
		PriceSnapshot:          pi.PriceSnapshot,
		MerchantReference:      pi.MerchantReference,
		Description:            pi.Description,
		SuccessUrl:             pi.SuccessURL,
		FailureUrl:             pi.FailureURL,
		WebhookEndpointID:      pi.WebhookEndpointID,
		WebhookConfigVersion:   pi.WebhookConfigVersion,
		Metadata:               meta,
		Version:                pi.Version,
		CreatedAt:              pi.CreatedAt,
		UpdatedAt:              pi.UpdatedAt,
	})
}

func (r *GatewayRepo) GetPaymentIntentByID(ctx context.Context, id string) (payments.Intent, error) {
	row, err := r.queries(ctx).GatewayGetPaymentIntentByID(ctx, id)
	if err != nil {
		return payments.Intent{}, err
	}
	return mapGatewayPaymentIntent(row), nil
}

func (r *GatewayRepo) GetPaymentIntentByMerchantRef(ctx context.Context, merchantID, mode, ref string) (payments.Intent, error) {
	row, err := r.queries(ctx).GatewayGetPaymentIntentByMerchantRef(ctx, gen.GatewayGetPaymentIntentByMerchantRefParams{
		MerchantID:        merchantID,
		PaymentMode:       mode,
		MerchantReference: &ref,
	})
	if err != nil {
		return payments.Intent{}, err
	}
	return mapGatewayPaymentIntentFromMerchantRef(row), nil
}

func (r *GatewayRepo) GetPaymentIntentByIdempotency(ctx context.Context, merchantID, mode, keyHash string) (payments.Intent, error) {
	row, err := r.queries(ctx).GatewayGetPaymentIntentByIdempotency(ctx, gen.GatewayGetPaymentIntentByIdempotencyParams{
		PaymentMode:        mode,
		IdempotencyKeyHash: keyHash,
		MerchantID:         merchantID,
	})
	if err != nil {
		return payments.Intent{}, err
	}
	return mapGatewayPaymentIntentFromIdem(row), nil
}

func (r *GatewayRepo) UpdatePaymentIntentStatus(ctx context.Context, id, fromStatus, toStatus string, patch application.PaymentIntentPatch, now time.Time) (payments.Intent, error) {
	row, err := r.queries(ctx).GatewayUpdatePaymentIntentStatus(ctx, gen.GatewayUpdatePaymentIntentStatusParams{
		ID:                id,
		Status:            toStatus,
		UpdatedAt:         now,
		ProviderReference: patch.ProviderReference,
		QrString:          patch.QRString,
		QrImageUrl:        patch.QRImageURL,
		CancelRequestedAt: timePtrToPg(patch.CancelRequestedAt),
		CancelReason:      patch.CancelReason,
		UnknownOperation:  patch.UnknownOperation,
		LookupScheduledAt: timePtrToPg(patch.LookupScheduledAt),
		LookupAttempts:    patch.LookupAttempts,
		PrecedingStatus:   patch.PrecedingStatus,
		FromStatus:        fromStatus,
	})
	if err != nil {
		return payments.Intent{}, err
	}
	return mapGatewayPaymentIntentFromUpdate(row), nil
}

func (r *GatewayRepo) ForceUpdatePaymentIntent(ctx context.Context, id, toStatus string, patch application.PaymentIntentPatch, now time.Time) (payments.Intent, error) {
	row, err := r.queries(ctx).GatewayForceUpdatePaymentIntent(ctx, gen.GatewayForceUpdatePaymentIntentParams{
		ID:                id,
		Status:            toStatus,
		UpdatedAt:         now,
		ProviderReference: patch.ProviderReference,
		QrString:          patch.QRString,
		QrImageUrl:        patch.QRImageURL,
		CancelRequestedAt: timePtrToPg(patch.CancelRequestedAt),
		CancelReason:      patch.CancelReason,
		UnknownOperation:  patch.UnknownOperation,
		LookupScheduledAt: timePtrToPg(patch.LookupScheduledAt),
		LookupAttempts:    patch.LookupAttempts,
		PrecedingStatus:   patch.PrecedingStatus,
	})
	if err != nil {
		return payments.Intent{}, err
	}
	return mapGatewayPaymentIntentFromForce(row), nil
}

func (r *GatewayRepo) InsertEvent(ctx context.Context, e gateway.PaymentEvent) error {
	return r.queries(ctx).GatewayInsertEvent(ctx, gen.GatewayInsertEventParams{
		ID:              e.ID,
		MerchantID:      e.MerchantID,
		PaymentMode:     e.PaymentMode,
		PaymentIntentID: e.PaymentIntentID,
		EventType:       e.EventType,
		Payload:         e.Payload,
		CreatedAt:       e.CreatedAt,
	})
}

func (r *GatewayRepo) GetEventByID(ctx context.Context, id string) (gateway.PaymentEvent, error) {
	row, err := r.queries(ctx).GatewayGetEventByID(ctx, id)
	if err != nil {
		return gateway.PaymentEvent{}, err
	}
	return gateway.PaymentEvent{
		ID:              row.ID,
		MerchantID:      row.MerchantID,
		PaymentMode:     row.PaymentMode,
		PaymentIntentID: row.PaymentIntentID,
		EventType:       row.EventType,
		Payload:         row.Payload,
		CreatedAt:       row.CreatedAt,
	}, nil
}

func (r *GatewayRepo) ListEventsByIntent(ctx context.Context, intentID, merchantID string, limit int32) ([]gateway.PaymentEvent, error) {
	rows, err := r.queries(ctx).GatewayListEventsByIntent(ctx, gen.GatewayListEventsByIntentParams{
		PaymentIntentID: intentID,
		MerchantID:      merchantID,
		Limit:           limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]gateway.PaymentEvent, 0, len(rows))
	for _, row := range rows {
		out = append(out, gateway.PaymentEvent{
			ID:              row.ID,
			MerchantID:      row.MerchantID,
			PaymentMode:     row.PaymentMode,
			PaymentIntentID: row.PaymentIntentID,
			EventType:       row.EventType,
			Payload:         row.Payload,
			CreatedAt:       row.CreatedAt,
		})
	}
	return out, nil
}

func (r *GatewayRepo) TryInsertIdempotency(ctx context.Context, rec application.IdempotencyRecord) (application.IdempotencyRecord, bool, error) {
	row, err := r.queries(ctx).GatewayTryInsertIdempotency(ctx, gen.GatewayTryInsertIdempotencyParams{
		ID:             rec.ID,
		SubjectType:    rec.SubjectType,
		SubjectID:      rec.SubjectID,
		Operation:      rec.Operation,
		PaymentMode:    rec.PaymentMode,
		KeyHash:        rec.KeyHash,
		RequestHash:    rec.RequestHash,
		Status:         rec.Status,
		ResourceType:   rec.ResourceType,
		ResourceID:     rec.ResourceID,
		ResponseStatus: rec.ResponseStatus,
		ResponseBody:   rec.ResponseBody,
		RequestID:      rec.RequestID,
		LeaseExpiresAt: timePtrToPg(rec.LeaseExpiresAt),
		ExpiresAt:      rec.ExpiresAt,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return application.IdempotencyRecord{}, false, nil
		}
		return application.IdempotencyRecord{}, false, err
	}
	return mapIdempotencyRecord(row), true, nil
}

func (r *GatewayRepo) GetIdempotency(ctx context.Context, subjectType, subjectID, operation string, paymentMode *string, keyHash string) (application.IdempotencyRecord, error) {
	row, err := r.queries(ctx).GatewayGetIdempotency(ctx, gen.GatewayGetIdempotencyParams{
		SubjectType: subjectType,
		SubjectID:   subjectID,
		Operation:   operation,
		PaymentMode: paymentMode,
		KeyHash:     keyHash,
	})
	if err != nil {
		return application.IdempotencyRecord{}, err
	}
	return mapIdempotencyRecord(row), nil
}

func (r *GatewayRepo) CompleteIdempotency(ctx context.Context, id, status string, resourceType, resourceID *string, responseStatus int32, body json.RawMessage) (application.IdempotencyRecord, error) {
	row, err := r.queries(ctx).GatewayCompleteIdempotency(ctx, gen.GatewayCompleteIdempotencyParams{
		ID:             id,
		Status:         status,
		ResourceType:   resourceType,
		ResourceID:     resourceID,
		ResponseStatus: &responseStatus,
		ResponseBody:   body,
	})
	if err != nil {
		return application.IdempotencyRecord{}, err
	}
	return mapIdempotencyRecord(row), nil
}

func (r *GatewayRepo) InsertOutbox(ctx context.Context, id, topic string, payload []byte, dedupeKey *string, paymentMode *string, availableAt time.Time) error {
	return r.queries(ctx).GatewayInsertOutbox(ctx, gen.GatewayInsertOutboxParams{
		ID:          id,
		Topic:       topic,
		Payload:     payload,
		AvailableAt: availableAt,
		DedupeKey:   dedupeKey,
		PaymentMode: paymentMode,
	})
}

// --- mappers for gateway payment intent row variants ---

func mapGatewayPaymentIntent(row gen.GatewayGetPaymentIntentByIDRow) payments.Intent {
	return payments.Intent{
		ID:                     row.ID,
		OrderID:                row.OrderID,
		StoreID:                row.StoreID,
		MerchantID:             row.MerchantID,
		PaymentMode:            row.PaymentMode,
		Source:                 row.Source,
		Provider:               row.Provider,
		AccountScope:           row.AccountScope,
		ProviderReference:      row.ProviderReference,
		ExternalID:             row.ExternalID,
		AmountIDR:              row.AmountIdr,
		Currency:               row.Currency,
		FeeSnapshotID:          row.FeeSnapshotID,
		CouponReservationID:    row.CouponReservationID,
		StockReservationID:     row.StockReservationID,
		Status:                 row.Status,
		ProviderFinancialState: row.ProviderFinancialState,
		QRString:               row.QrString,
		QRImageURL:             row.QrImageUrl,
		ExpiresAt:              row.ExpiresAt,
		CancelRequestedAt:      pgTimePtr(row.CancelRequestedAt),
		ExpireRequestedAt:      pgTimePtr(row.ExpireRequestedAt),
		CancelReason:           row.CancelReason,
		ExpireReason:           row.ExpireReason,
		UnknownOperation:       row.UnknownOperation,
		LookupScheduledAt:      pgTimePtr(row.LookupScheduledAt),
		LookupAttempts:         row.LookupAttempts,
		PaidLate:               row.PaidLate,
		PrecedingStatus:        row.PrecedingStatus,
		BuyerUserID:            row.BuyerUserID,
		BuyerEmail:             row.BuyerEmail,
		BuyerSessionID:         row.BuyerSessionID,
		PublicTokenHash:        row.PublicTokenHash,
		IdempotencyKeyHash:     row.IdempotencyKeyHash,
		RequestHash:            row.RequestHash,
		ProductSnapshot:        row.ProductSnapshot,
		PriceSnapshot:          row.PriceSnapshot,
		MerchantReference:      row.MerchantReference,
		Description:            row.Description,
		SuccessURL:             row.SuccessUrl,
		FailureURL:             row.FailureUrl,
		WebhookEndpointID:      row.WebhookEndpointID,
		WebhookConfigVersion:   row.WebhookConfigVersion,
		Metadata:               row.Metadata,
		Version:                row.Version,
		CreatedAt:              row.CreatedAt,
		UpdatedAt:              row.UpdatedAt,
	}
}

func mapGatewayPaymentIntentFromMerchantRef(row gen.GatewayGetPaymentIntentByMerchantRefRow) payments.Intent {
	return mapGatewayPaymentIntent(gen.GatewayGetPaymentIntentByIDRow(row))
}

func mapGatewayPaymentIntentFromIdem(row gen.GatewayGetPaymentIntentByIdempotencyRow) payments.Intent {
	return mapGatewayPaymentIntent(gen.GatewayGetPaymentIntentByIDRow(row))
}

func mapGatewayPaymentIntentFromUpdate(row gen.GatewayUpdatePaymentIntentStatusRow) payments.Intent {
	return mapGatewayPaymentIntent(gen.GatewayGetPaymentIntentByIDRow(row))
}

func mapGatewayPaymentIntentFromForce(row gen.GatewayForceUpdatePaymentIntentRow) payments.Intent {
	return mapGatewayPaymentIntent(gen.GatewayGetPaymentIntentByIDRow(row))
}
