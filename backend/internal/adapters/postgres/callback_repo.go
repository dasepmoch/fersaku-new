package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres/gen"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/orders"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/payments"
)

type callbackTxKey struct{}

// CallbackRepo is the Postgres adapter for BE-330.
type CallbackRepo struct {
	pool *pgxpool.Pool
	q    *gen.Queries
}

func NewCallbackRepo(pool *pgxpool.Pool) *CallbackRepo {
	return &CallbackRepo{pool: pool, q: gen.New(pool)}
}

func (r *CallbackRepo) queries(ctx context.Context) *gen.Queries {
	if tx, ok := ctx.Value(callbackTxKey{}).(pgx.Tx); ok && tx != nil {
		return r.q.WithTx(tx)
	}
	return r.q
}

func (r *CallbackRepo) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	if _, ok := ctx.Value(callbackTxKey{}).(pgx.Tx); ok {
		return fn(ctx)
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("callback: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	txCtx := context.WithValue(ctx, callbackTxKey{}, tx)
	if err := fn(txCtx); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("callback: commit: %w", err)
	}
	return nil
}

func (r *CallbackRepo) IsNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func (r *CallbackRepo) IsUniqueViolation(err error) bool {
	var pe *pgconn.PgError
	return errors.As(err, &pe) && pe.Code == "23505"
}

func (r *CallbackRepo) InsertRejection(ctx context.Context, rej payments.CallbackRejection) error {
	return r.queries(ctx).CallbackInsertRejection(ctx, gen.CallbackInsertRejectionParams{
		ID:           rej.ID,
		Provider:     rej.Provider,
		AccountScope: rej.AccountScope,
		PaymentMode:  rej.PaymentMode,
		Reason:       rej.Reason,
		HttpStatus:   rej.HTTPStatus,
		ContentType:  rej.ContentType,
		BodyBytes:    rej.BodyBytes,
		BodyDigest:   rej.BodyDigest,
		ClientIp:     rej.ClientIP,
		RequestID:    rej.RequestID,
		ReceivedAt:   rej.ReceivedAt,
		CreatedAt:    rej.CreatedAt,
	})
}

func (r *CallbackRepo) InsertProviderEvent(ctx context.Context, e payments.ProviderEvent) (payments.ProviderEvent, bool, error) {
	row, err := r.queries(ctx).CallbackInsertProviderEvent(ctx, gen.CallbackInsertProviderEventParams{
		CallbackID:        e.CallbackID,
		Provider:          e.Provider,
		AccountScope:      e.AccountScope,
		PaymentMode:       e.PaymentMode,
		ProviderEventID:   e.ProviderEventID,
		ReceivedAt:        e.ReceivedAt,
		NormalizedType:    e.NormalizedType,
		ProcessingState:   e.ProcessingState,
		FailureCode:       e.FailureCode,
		AttemptCount:      e.AttemptCount,
		PaymentIntentID:   e.PaymentIntentID,
		PayloadDigest:     e.PayloadDigest,
		EncryptedPayload:  e.EncryptedPayload,
		RawEventType:      e.RawEventType,
		ProviderReference: e.ProviderReference,
		ExternalID:        e.ExternalID,
		AmountIdr:         e.AmountIDR,
		Currency:          e.Currency,
		CreatedAt:         e.CreatedAt,
		UpdatedAt:         e.UpdatedAt,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return payments.ProviderEvent{}, false, nil
		}
		return payments.ProviderEvent{}, false, err
	}
	return mapProviderEvent(row), true, nil
}

func (r *CallbackRepo) GetProviderEventByCanonical(ctx context.Context, provider, accountScope, paymentMode, eventID string) (payments.ProviderEvent, error) {
	row, err := r.queries(ctx).CallbackGetProviderEventByCanonical(ctx, gen.CallbackGetProviderEventByCanonicalParams{
		Provider:        provider,
		AccountScope:    accountScope,
		PaymentMode:     paymentMode,
		ProviderEventID: eventID,
	})
	if err != nil {
		return payments.ProviderEvent{}, err
	}
	return mapProviderEventFromGet(row), nil
}

func (r *CallbackRepo) GetProviderEventByID(ctx context.Context, callbackID string) (payments.ProviderEvent, error) {
	row, err := r.queries(ctx).CallbackGetProviderEventByID(ctx, callbackID)
	if err != nil {
		return payments.ProviderEvent{}, err
	}
	return mapProviderEventFromGetByID(row), nil
}

func (r *CallbackRepo) LockProviderEvent(ctx context.Context, callbackID string) (payments.ProviderEvent, error) {
	row, err := r.queries(ctx).CallbackLockProviderEvent(ctx, callbackID)
	if err != nil {
		return payments.ProviderEvent{}, err
	}
	return mapProviderEventFromLock(row), nil
}

func (r *CallbackRepo) UpdateProviderEventState(ctx context.Context, callbackID, state string, patch application.CallbackEventPatch, now time.Time) (payments.ProviderEvent, error) {
	params := gen.CallbackUpdateProviderEventStateParams{
		CallbackID:       callbackID,
		ProcessingState:  state,
		UpdatedAt:        now,
		FailureCode:      patch.FailureCode,
		AttemptCount:     patch.AttemptCount,
		LeaseOwner:       patch.LeaseOwner,
		PaymentIntentID:  patch.PaymentIntentID,
		NormalizedType:   patch.NormalizedType,
		MismatchCode:     patch.MismatchCode,
		AlertCode:        patch.AlertCode,
		QuarantineReason: patch.QuarantineReason,
		ReplayCount:      patch.ReplayCount,
		LastReplayReason: patch.LastReplayReason,
	}
	if patch.LeaseUntil != nil {
		params.LeaseUntil = timePtrToPg(patch.LeaseUntil)
	}
	if patch.NextRetryAt != nil {
		params.NextRetryAt = timePtrToPg(patch.NextRetryAt)
	}
	if patch.ProcessedAt != nil {
		params.ProcessedAt = timePtrToPg(patch.ProcessedAt)
	}
	if patch.LastReplayAt != nil {
		params.LastReplayAt = timePtrToPg(patch.LastReplayAt)
	}
	if patch.ClearLease {
		params.LeaseOwner = nil
		params.LeaseUntil = pgtype.Timestamptz{}
	}
	row, err := r.queries(ctx).CallbackUpdateProviderEventState(ctx, params)
	if err != nil {
		return payments.ProviderEvent{}, err
	}
	return mapProviderEventFromUpdate(row), nil
}

func (r *CallbackRepo) ListProviderEventsReady(ctx context.Context, now time.Time, limit int32) ([]payments.ProviderEvent, error) {
	rows, err := r.queries(ctx).CallbackListProviderEventsReady(ctx, gen.CallbackListProviderEventsReadyParams{
		NextRetryAt: timePtrToPg(&now),
		Limit:       limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]payments.ProviderEvent, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapProviderEventFromList(row))
	}
	return out, nil
}

func (r *CallbackRepo) ListAdminProviderEvents(ctx context.Context, limit int32) ([]payments.ProviderEvent, error) {
	rows, err := r.queries(ctx).CallbackListAdminProviderEvents(ctx, limit)
	if err != nil {
		return nil, err
	}
	out := make([]payments.ProviderEvent, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapProviderEventFromAdmin(row))
	}
	return out, nil
}

func (r *CallbackRepo) GetPaymentIntentByProviderRefForUpdate(ctx context.Context, provider, accountScope, paymentMode, providerRef string) (payments.Intent, error) {
	row, err := r.queries(ctx).CallbackGetPaymentIntentByProviderRefForUpdate(ctx, gen.CallbackGetPaymentIntentByProviderRefForUpdateParams{
		Provider:          provider,
		AccountScope:      accountScope,
		PaymentMode:       paymentMode,
		ProviderReference: &providerRef,
	})
	if err != nil {
		return payments.Intent{}, err
	}
	return mapCallbackPaymentIntentRef(row), nil
}

func (r *CallbackRepo) GetPaymentIntentByExternalIDForUpdate(ctx context.Context, paymentMode, externalID string) (payments.Intent, error) {
	row, err := r.queries(ctx).CallbackGetPaymentIntentByExternalIDForUpdate(ctx, gen.CallbackGetPaymentIntentByExternalIDForUpdateParams{
		PaymentMode: paymentMode,
		ExternalID:  externalID,
	})
	if err != nil {
		return payments.Intent{}, err
	}
	return mapCallbackPaymentIntentExt(row), nil
}

func (r *CallbackRepo) GetPaymentIntentByIDForUpdate(ctx context.Context, id string) (payments.Intent, error) {
	row, err := r.queries(ctx).CallbackGetPaymentIntentByIDForUpdate(ctx, id)
	if err != nil {
		return payments.Intent{}, err
	}
	return mapCallbackPaymentIntentID(row), nil
}

func (r *CallbackRepo) GetPaymentIntentByID(ctx context.Context, id string) (payments.Intent, error) {
	// Reuse checkout query
	row, err := r.queries(ctx).CheckoutGetPaymentIntentByID(ctx, id)
	if err != nil {
		return payments.Intent{}, err
	}
	return mapCheckoutPaymentIntent(row), nil
}

func (r *CallbackRepo) MarkPaymentPaid(ctx context.Context, id string, paidLate bool, precedingStatus string, now time.Time) (payments.Intent, error) {
	row, err := r.queries(ctx).CallbackMarkPaymentPaid(ctx, gen.CallbackMarkPaymentPaidParams{
		ID:              id,
		PaidLate:        paidLate,
		PrecedingStatus: &precedingStatus,
		UpdatedAt:       now,
	})
	if err != nil {
		return payments.Intent{}, err
	}
	return mapCallbackPaymentIntentPaid(row), nil
}

func (r *CallbackRepo) MarkPaymentTerminal(ctx context.Context, id, toStatus string, preceding *string, now time.Time) (payments.Intent, error) {
	row, err := r.queries(ctx).CallbackMarkPaymentTerminal(ctx, gen.CallbackMarkPaymentTerminalParams{
		ID:              id,
		Status:          toStatus,
		UpdatedAt:       now,
		PrecedingStatus: preceding,
	})
	if err != nil {
		return payments.Intent{}, err
	}
	return mapCallbackPaymentIntentTerm(row), nil
}

func (r *CallbackRepo) SetFinancialState(ctx context.Context, id, state string, now time.Time) error {
	return r.queries(ctx).CallbackSetFinancialState(ctx, gen.CallbackSetFinancialStateParams{
		ID:                     id,
		ProviderFinancialState: state,
		UpdatedAt:              now,
	})
}

func (r *CallbackRepo) MarkOrderPaid(ctx context.Context, orderID string, now time.Time) error {
	return r.queries(ctx).CallbackMarkOrderPaid(ctx, gen.CallbackMarkOrderPaidParams{
		ID:        orderID,
		UpdatedAt: now,
	})
}

func (r *CallbackRepo) MarkOrderTerminal(ctx context.Context, orderID, paymentStatus, orderStatus string, now time.Time) error {
	return r.queries(ctx).CallbackMarkOrderTerminal(ctx, gen.CallbackMarkOrderTerminalParams{
		ID:            orderID,
		PaymentStatus: paymentStatus,
		OrderStatus:   orderStatus,
		UpdatedAt:     now,
	})
}

func (r *CallbackRepo) GetOrderByID(ctx context.Context, id string) (application.CheckoutOrder, error) {
	row, err := r.queries(ctx).CallbackGetOrderByID(ctx, id)
	if err != nil {
		return application.CheckoutOrder{}, err
	}
	return mapCallbackOrder(row), nil
}

func (r *CallbackRepo) ListOrderItems(ctx context.Context, orderID string) ([]orders.OrderItem, error) {
	rows, err := r.queries(ctx).DeliveryListOrderItems(ctx, orderID)
	if err != nil {
		return nil, err
	}
	out := make([]orders.OrderItem, 0, len(rows))
	for _, row := range rows {
		out = append(out, orders.OrderItem{
			ID:                    row.ID,
			OrderID:               row.OrderID,
			StoreID:               row.StoreID,
			MerchantID:            row.MerchantID,
			ProductID:             row.ProductID,
			ProductVersion:        row.ProductVersion,
			ProductTitle:          row.ProductTitle,
			ProductType:           row.ProductType,
			UnitPriceIDR:          row.UnitPriceIdr,
			Quantity:              row.Quantity,
			LineSubtotalIDR:       row.LineSubtotalIdr,
			DiscountAllocationIDR: row.DiscountAllocationIdr,
			LineTotalIDR:          row.LineTotalIdr,
			DeliveryKind:          row.DeliveryKind,
			StockReservationID:    row.StockReservationID,
			StockItemID:           row.StockItemID,
			ObjectID:              row.ObjectID,
			CreatedAt:             row.CreatedAt,
		})
	}
	return out, nil
}

func (r *CallbackRepo) InsertSettlement(ctx context.Context, s payments.Settlement) (payments.Settlement, bool, error) {
	row, err := r.queries(ctx).CallbackInsertSettlement(ctx, gen.CallbackInsertSettlementParams{
		ID:                s.ID,
		PaymentIntentID:   s.PaymentIntentID,
		OrderID:           s.OrderID,
		MerchantID:        s.MerchantID,
		StoreID:           s.StoreID,
		PaymentMode:       s.PaymentMode,
		Source:            s.Source,
		Provider:          s.Provider,
		AccountScope:      s.AccountScope,
		ProviderReference: s.ProviderReference,
		ProviderEventID:   s.ProviderEventID,
		JournalReference:  s.JournalReference,
		GrossIdr:          s.GrossIDR,
		FeeIdr:            s.FeeIDR,
		MerchantNetIdr:    s.MerchantNetIDR,
		Currency:          s.Currency,
		PaidLate:          s.PaidLate,
		PrecedingStatus:   s.PrecedingStatus,
		Status:            s.Status,
		PostedAt:          s.PostedAt,
		CreatedAt:         s.CreatedAt,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return payments.Settlement{}, false, nil
		}
		return payments.Settlement{}, false, err
	}
	return mapSettlement(row), true, nil
}

func (r *CallbackRepo) GetSettlementByIntent(ctx context.Context, paymentIntentID string) (payments.Settlement, error) {
	row, err := r.queries(ctx).CallbackGetSettlementByIntent(ctx, paymentIntentID)
	if err != nil {
		return payments.Settlement{}, err
	}
	return mapSettlementGet(row), nil
}

func (r *CallbackRepo) InsertOutbox(ctx context.Context, id, topic string, payload []byte, dedupeKey *string, paymentMode *string, availableAt time.Time) error {
	return r.queries(ctx).CallbackInsertOutbox(ctx, gen.CallbackInsertOutboxParams{
		ID:          id,
		Topic:       topic,
		Payload:     payload,
		AvailableAt: availableAt,
		DedupeKey:   dedupeKey,
		PaymentMode: paymentMode,
	})
}

func (r *CallbackRepo) CountSettlementsByIntent(ctx context.Context, paymentIntentID string) (int64, error) {
	return r.queries(ctx).CallbackCountSettlementsByIntent(ctx, paymentIntentID)
}

func (r *CallbackRepo) CountProviderEventsByCanonical(ctx context.Context, provider, accountScope, paymentMode, eventID string) (int64, error) {
	return r.queries(ctx).CallbackCountProviderEventsByCanonical(ctx, gen.CallbackCountProviderEventsByCanonicalParams{
		Provider:        provider,
		AccountScope:    accountScope,
		PaymentMode:     paymentMode,
		ProviderEventID: eventID,
	})
}

func (r *CallbackRepo) CountRejections(ctx context.Context, reason string) (int64, error) {
	return r.queries(ctx).CallbackCountRejections(ctx, reason)
}

// --- mappers (sqlc generates distinct row types per query) ---

func mapProviderEvent(row gen.CallbackInsertProviderEventRow) payments.ProviderEvent {
	return payments.ProviderEvent{
		CallbackID:        row.CallbackID,
		Provider:          row.Provider,
		AccountScope:      row.AccountScope,
		PaymentMode:       row.PaymentMode,
		ProviderEventID:   row.ProviderEventID,
		ReceivedAt:        row.ReceivedAt,
		NormalizedType:    row.NormalizedType,
		ProcessingState:   row.ProcessingState,
		FailureCode:       row.FailureCode,
		AttemptCount:      row.AttemptCount,
		LeaseOwner:        row.LeaseOwner,
		LeaseUntil:        pgTimePtr(row.LeaseUntil),
		NextRetryAt:       pgTimePtr(row.NextRetryAt),
		ProcessedAt:       pgTimePtr(row.ProcessedAt),
		PaymentIntentID:   row.PaymentIntentID,
		PayloadDigest:     row.PayloadDigest,
		EncryptedPayload:  row.EncryptedPayload,
		RawEventType:      row.RawEventType,
		ProviderReference: row.ProviderReference,
		ExternalID:        row.ExternalID,
		AmountIDR:         row.AmountIdr,
		Currency:          row.Currency,
		MismatchCode:      row.MismatchCode,
		AlertCode:         row.AlertCode,
		ReplayCount:       row.ReplayCount,
		LastReplayAt:      pgTimePtr(row.LastReplayAt),
		LastReplayReason:  row.LastReplayReason,
		QuarantineReason:  row.QuarantineReason,
		CreatedAt:         row.CreatedAt,
		UpdatedAt:         row.UpdatedAt,
	}
}

func mapProviderEventFromGet(row gen.CallbackGetProviderEventByCanonicalRow) payments.ProviderEvent {
	return payments.ProviderEvent{
		CallbackID: row.CallbackID, Provider: row.Provider, AccountScope: row.AccountScope,
		PaymentMode: row.PaymentMode, ProviderEventID: row.ProviderEventID, ReceivedAt: row.ReceivedAt,
		NormalizedType: row.NormalizedType, ProcessingState: row.ProcessingState, FailureCode: row.FailureCode,
		AttemptCount: row.AttemptCount, LeaseOwner: row.LeaseOwner, LeaseUntil: pgTimePtr(row.LeaseUntil),
		NextRetryAt: pgTimePtr(row.NextRetryAt), ProcessedAt: pgTimePtr(row.ProcessedAt),
		PaymentIntentID: row.PaymentIntentID, PayloadDigest: row.PayloadDigest, EncryptedPayload: row.EncryptedPayload,
		RawEventType: row.RawEventType, ProviderReference: row.ProviderReference, ExternalID: row.ExternalID,
		AmountIDR: row.AmountIdr, Currency: row.Currency, MismatchCode: row.MismatchCode, AlertCode: row.AlertCode,
		ReplayCount: row.ReplayCount, LastReplayAt: pgTimePtr(row.LastReplayAt), LastReplayReason: row.LastReplayReason,
		QuarantineReason: row.QuarantineReason, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
	}
}

func mapProviderEventFromGetByID(row gen.CallbackGetProviderEventByIDRow) payments.ProviderEvent {
	return payments.ProviderEvent{
		CallbackID: row.CallbackID, Provider: row.Provider, AccountScope: row.AccountScope,
		PaymentMode: row.PaymentMode, ProviderEventID: row.ProviderEventID, ReceivedAt: row.ReceivedAt,
		NormalizedType: row.NormalizedType, ProcessingState: row.ProcessingState, FailureCode: row.FailureCode,
		AttemptCount: row.AttemptCount, LeaseOwner: row.LeaseOwner, LeaseUntil: pgTimePtr(row.LeaseUntil),
		NextRetryAt: pgTimePtr(row.NextRetryAt), ProcessedAt: pgTimePtr(row.ProcessedAt),
		PaymentIntentID: row.PaymentIntentID, PayloadDigest: row.PayloadDigest, EncryptedPayload: row.EncryptedPayload,
		RawEventType: row.RawEventType, ProviderReference: row.ProviderReference, ExternalID: row.ExternalID,
		AmountIDR: row.AmountIdr, Currency: row.Currency, MismatchCode: row.MismatchCode, AlertCode: row.AlertCode,
		ReplayCount: row.ReplayCount, LastReplayAt: pgTimePtr(row.LastReplayAt), LastReplayReason: row.LastReplayReason,
		QuarantineReason: row.QuarantineReason, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
	}
}

func mapProviderEventFromLock(row gen.CallbackLockProviderEventRow) payments.ProviderEvent {
	return payments.ProviderEvent{
		CallbackID: row.CallbackID, Provider: row.Provider, AccountScope: row.AccountScope,
		PaymentMode: row.PaymentMode, ProviderEventID: row.ProviderEventID, ReceivedAt: row.ReceivedAt,
		NormalizedType: row.NormalizedType, ProcessingState: row.ProcessingState, FailureCode: row.FailureCode,
		AttemptCount: row.AttemptCount, LeaseOwner: row.LeaseOwner, LeaseUntil: pgTimePtr(row.LeaseUntil),
		NextRetryAt: pgTimePtr(row.NextRetryAt), ProcessedAt: pgTimePtr(row.ProcessedAt),
		PaymentIntentID: row.PaymentIntentID, PayloadDigest: row.PayloadDigest, EncryptedPayload: row.EncryptedPayload,
		RawEventType: row.RawEventType, ProviderReference: row.ProviderReference, ExternalID: row.ExternalID,
		AmountIDR: row.AmountIdr, Currency: row.Currency, MismatchCode: row.MismatchCode, AlertCode: row.AlertCode,
		ReplayCount: row.ReplayCount, LastReplayAt: pgTimePtr(row.LastReplayAt), LastReplayReason: row.LastReplayReason,
		QuarantineReason: row.QuarantineReason, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
	}
}

func mapProviderEventFromUpdate(row gen.CallbackUpdateProviderEventStateRow) payments.ProviderEvent {
	return payments.ProviderEvent{
		CallbackID: row.CallbackID, Provider: row.Provider, AccountScope: row.AccountScope,
		PaymentMode: row.PaymentMode, ProviderEventID: row.ProviderEventID, ReceivedAt: row.ReceivedAt,
		NormalizedType: row.NormalizedType, ProcessingState: row.ProcessingState, FailureCode: row.FailureCode,
		AttemptCount: row.AttemptCount, LeaseOwner: row.LeaseOwner, LeaseUntil: pgTimePtr(row.LeaseUntil),
		NextRetryAt: pgTimePtr(row.NextRetryAt), ProcessedAt: pgTimePtr(row.ProcessedAt),
		PaymentIntentID: row.PaymentIntentID, PayloadDigest: row.PayloadDigest, EncryptedPayload: row.EncryptedPayload,
		RawEventType: row.RawEventType, ProviderReference: row.ProviderReference, ExternalID: row.ExternalID,
		AmountIDR: row.AmountIdr, Currency: row.Currency, MismatchCode: row.MismatchCode, AlertCode: row.AlertCode,
		ReplayCount: row.ReplayCount, LastReplayAt: pgTimePtr(row.LastReplayAt), LastReplayReason: row.LastReplayReason,
		QuarantineReason: row.QuarantineReason, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
	}
}

func mapProviderEventFromList(row gen.CallbackListProviderEventsReadyRow) payments.ProviderEvent {
	return payments.ProviderEvent{
		CallbackID: row.CallbackID, Provider: row.Provider, AccountScope: row.AccountScope,
		PaymentMode: row.PaymentMode, ProviderEventID: row.ProviderEventID, ReceivedAt: row.ReceivedAt,
		NormalizedType: row.NormalizedType, ProcessingState: row.ProcessingState, FailureCode: row.FailureCode,
		AttemptCount: row.AttemptCount, LeaseOwner: row.LeaseOwner, LeaseUntil: pgTimePtr(row.LeaseUntil),
		NextRetryAt: pgTimePtr(row.NextRetryAt), ProcessedAt: pgTimePtr(row.ProcessedAt),
		PaymentIntentID: row.PaymentIntentID, PayloadDigest: row.PayloadDigest, EncryptedPayload: row.EncryptedPayload,
		RawEventType: row.RawEventType, ProviderReference: row.ProviderReference, ExternalID: row.ExternalID,
		AmountIDR: row.AmountIdr, Currency: row.Currency, MismatchCode: row.MismatchCode, AlertCode: row.AlertCode,
		ReplayCount: row.ReplayCount, LastReplayAt: pgTimePtr(row.LastReplayAt), LastReplayReason: row.LastReplayReason,
		QuarantineReason: row.QuarantineReason, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
	}
}

func mapProviderEventFromAdmin(row gen.CallbackListAdminProviderEventsRow) payments.ProviderEvent {
	return payments.ProviderEvent{
		CallbackID: row.CallbackID, Provider: row.Provider, AccountScope: row.AccountScope,
		PaymentMode: row.PaymentMode, ProviderEventID: row.ProviderEventID, ReceivedAt: row.ReceivedAt,
		NormalizedType: row.NormalizedType, ProcessingState: row.ProcessingState, FailureCode: row.FailureCode,
		AttemptCount: row.AttemptCount, LeaseOwner: row.LeaseOwner, LeaseUntil: pgTimePtr(row.LeaseUntil),
		NextRetryAt: pgTimePtr(row.NextRetryAt), ProcessedAt: pgTimePtr(row.ProcessedAt),
		PaymentIntentID: row.PaymentIntentID, PayloadDigest: row.PayloadDigest, EncryptedPayload: row.EncryptedPayload,
		RawEventType: row.RawEventType, ProviderReference: row.ProviderReference, ExternalID: row.ExternalID,
		AmountIDR: row.AmountIdr, Currency: row.Currency, MismatchCode: row.MismatchCode, AlertCode: row.AlertCode,
		ReplayCount: row.ReplayCount, LastReplayAt: pgTimePtr(row.LastReplayAt), LastReplayReason: row.LastReplayReason,
		QuarantineReason: row.QuarantineReason, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
	}
}

func mapIntentCore(
	id, orderID, storeID, merchantID, paymentMode, source, provider, accountScope string,
	providerReference *string, externalID string, amountIdr int64, currency string,
	feeSnapshotID, couponReservationID, stockReservationID *string,
	status, providerFinancialState string,
	qrString, qrImageURL *string, expiresAt time.Time,
	cancelRequestedAt, expireRequestedAt pgtype.Timestamptz,
	cancelReason, expireReason, unknownOperation *string,
	lookupScheduledAt pgtype.Timestamptz, lookupAttempts int32,
	paidLate bool, precedingStatus, buyerUserID *string, buyerEmail string,
	buyerSessionID, publicTokenHash *string, idempotencyKeyHash, requestHash string,
	productSnapshot, priceSnapshot []byte, version int32, createdAt, updatedAt time.Time,
) payments.Intent {
	return payments.Intent{
		ID: id, OrderID: orderID, StoreID: storeID, MerchantID: merchantID,
		PaymentMode: paymentMode, Source: source, Provider: provider, AccountScope: accountScope,
		ProviderReference: providerReference, ExternalID: externalID, AmountIDR: amountIdr, Currency: currency,
		FeeSnapshotID: feeSnapshotID, CouponReservationID: couponReservationID, StockReservationID: stockReservationID,
		Status: status, ProviderFinancialState: providerFinancialState, QRString: qrString, QRImageURL: qrImageURL,
		ExpiresAt: expiresAt, CancelRequestedAt: pgTimePtr(cancelRequestedAt), ExpireRequestedAt: pgTimePtr(expireRequestedAt),
		CancelReason: cancelReason, ExpireReason: expireReason, UnknownOperation: unknownOperation,
		LookupScheduledAt: pgTimePtr(lookupScheduledAt), LookupAttempts: lookupAttempts, PaidLate: paidLate,
		PrecedingStatus: precedingStatus, BuyerUserID: buyerUserID, BuyerEmail: buyerEmail,
		BuyerSessionID: buyerSessionID, PublicTokenHash: publicTokenHash,
		IdempotencyKeyHash: idempotencyKeyHash, RequestHash: requestHash,
		ProductSnapshot: productSnapshot, PriceSnapshot: priceSnapshot,
		Version: version, CreatedAt: createdAt, UpdatedAt: updatedAt,
	}
}

func mapCallbackPaymentIntentRef(row gen.CallbackGetPaymentIntentByProviderRefForUpdateRow) payments.Intent {
	return mapIntentCore(row.ID, row.OrderID, row.StoreID, row.MerchantID, row.PaymentMode, row.Source, row.Provider, row.AccountScope,
		row.ProviderReference, row.ExternalID, row.AmountIdr, row.Currency, row.FeeSnapshotID, row.CouponReservationID, row.StockReservationID,
		row.Status, row.ProviderFinancialState, row.QrString, row.QrImageUrl, row.ExpiresAt, row.CancelRequestedAt, row.ExpireRequestedAt,
		row.CancelReason, row.ExpireReason, row.UnknownOperation, row.LookupScheduledAt, row.LookupAttempts, row.PaidLate, row.PrecedingStatus,
		row.BuyerUserID, row.BuyerEmail, row.BuyerSessionID, row.PublicTokenHash, row.IdempotencyKeyHash, row.RequestHash,
		row.ProductSnapshot, row.PriceSnapshot, row.Version, row.CreatedAt, row.UpdatedAt)
}

func mapCallbackPaymentIntentExt(row gen.CallbackGetPaymentIntentByExternalIDForUpdateRow) payments.Intent {
	return mapIntentCore(row.ID, row.OrderID, row.StoreID, row.MerchantID, row.PaymentMode, row.Source, row.Provider, row.AccountScope,
		row.ProviderReference, row.ExternalID, row.AmountIdr, row.Currency, row.FeeSnapshotID, row.CouponReservationID, row.StockReservationID,
		row.Status, row.ProviderFinancialState, row.QrString, row.QrImageUrl, row.ExpiresAt, row.CancelRequestedAt, row.ExpireRequestedAt,
		row.CancelReason, row.ExpireReason, row.UnknownOperation, row.LookupScheduledAt, row.LookupAttempts, row.PaidLate, row.PrecedingStatus,
		row.BuyerUserID, row.BuyerEmail, row.BuyerSessionID, row.PublicTokenHash, row.IdempotencyKeyHash, row.RequestHash,
		row.ProductSnapshot, row.PriceSnapshot, row.Version, row.CreatedAt, row.UpdatedAt)
}

func mapCallbackPaymentIntentID(row gen.CallbackGetPaymentIntentByIDForUpdateRow) payments.Intent {
	return mapIntentCore(row.ID, row.OrderID, row.StoreID, row.MerchantID, row.PaymentMode, row.Source, row.Provider, row.AccountScope,
		row.ProviderReference, row.ExternalID, row.AmountIdr, row.Currency, row.FeeSnapshotID, row.CouponReservationID, row.StockReservationID,
		row.Status, row.ProviderFinancialState, row.QrString, row.QrImageUrl, row.ExpiresAt, row.CancelRequestedAt, row.ExpireRequestedAt,
		row.CancelReason, row.ExpireReason, row.UnknownOperation, row.LookupScheduledAt, row.LookupAttempts, row.PaidLate, row.PrecedingStatus,
		row.BuyerUserID, row.BuyerEmail, row.BuyerSessionID, row.PublicTokenHash, row.IdempotencyKeyHash, row.RequestHash,
		row.ProductSnapshot, row.PriceSnapshot, row.Version, row.CreatedAt, row.UpdatedAt)
}

func mapCallbackPaymentIntentPaid(row gen.CallbackMarkPaymentPaidRow) payments.Intent {
	return mapIntentCore(row.ID, row.OrderID, row.StoreID, row.MerchantID, row.PaymentMode, row.Source, row.Provider, row.AccountScope,
		row.ProviderReference, row.ExternalID, row.AmountIdr, row.Currency, row.FeeSnapshotID, row.CouponReservationID, row.StockReservationID,
		row.Status, row.ProviderFinancialState, row.QrString, row.QrImageUrl, row.ExpiresAt, row.CancelRequestedAt, row.ExpireRequestedAt,
		row.CancelReason, row.ExpireReason, row.UnknownOperation, row.LookupScheduledAt, row.LookupAttempts, row.PaidLate, row.PrecedingStatus,
		row.BuyerUserID, row.BuyerEmail, row.BuyerSessionID, row.PublicTokenHash, row.IdempotencyKeyHash, row.RequestHash,
		row.ProductSnapshot, row.PriceSnapshot, row.Version, row.CreatedAt, row.UpdatedAt)
}

func mapCallbackPaymentIntentTerm(row gen.CallbackMarkPaymentTerminalRow) payments.Intent {
	return mapIntentCore(row.ID, row.OrderID, row.StoreID, row.MerchantID, row.PaymentMode, row.Source, row.Provider, row.AccountScope,
		row.ProviderReference, row.ExternalID, row.AmountIdr, row.Currency, row.FeeSnapshotID, row.CouponReservationID, row.StockReservationID,
		row.Status, row.ProviderFinancialState, row.QrString, row.QrImageUrl, row.ExpiresAt, row.CancelRequestedAt, row.ExpireRequestedAt,
		row.CancelReason, row.ExpireReason, row.UnknownOperation, row.LookupScheduledAt, row.LookupAttempts, row.PaidLate, row.PrecedingStatus,
		row.BuyerUserID, row.BuyerEmail, row.BuyerSessionID, row.PublicTokenHash, row.IdempotencyKeyHash, row.RequestHash,
		row.ProductSnapshot, row.PriceSnapshot, row.Version, row.CreatedAt, row.UpdatedAt)
}

func mapCallbackOrder(row gen.CallbackGetOrderByIDRow) application.CheckoutOrder {
	o := application.CheckoutOrder{
		Order: orders.Order{
			ID: row.ID, OrderNumber: row.OrderNumber, StoreID: row.StoreID, MerchantID: row.MerchantID,
			BuyerUserID: row.BuyerUserID, BuyerEmail: row.BuyerEmail, BuyerName: row.BuyerName,
			PaymentStatus: row.PaymentStatus, Source: row.Source, Currency: row.Currency,
			SubtotalIDR: row.SubtotalIdr, DiscountIDR: row.DiscountIdr, TipIDR: row.TipIdr,
			FeeIDR: row.FeeIdr, GrossIDR: row.GrossIdr, MerchantNetIDR: row.MerchantNetIdr,
			CouponCode: row.CouponCode, CouponVersion: row.CouponVersion,
			CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
		},
		OrderStatus: row.OrderStatus, PaymentMode: row.PaymentMode,
		FeeSnapshotID: row.FeeSnapshotID, CouponReservationID: row.CouponReservationID,
		PublicTokenHash: row.PublicTokenHash, BuyerSessionID: row.BuyerSessionID,
		IdempotencyKeyHash: row.IdempotencyKeyHash,
	}
	if row.PaidAt.Valid {
		t := row.PaidAt.Time
		o.PaidAt = &t
	}
	if row.ExpiresAt.Valid {
		t := row.ExpiresAt.Time
		o.ExpiresAt = &t
	}
	return o
}

func mapSettlement(row gen.CallbackInsertSettlementRow) payments.Settlement {
	return payments.Settlement{
		ID: row.ID, PaymentIntentID: row.PaymentIntentID, OrderID: row.OrderID, MerchantID: row.MerchantID,
		StoreID: row.StoreID, PaymentMode: row.PaymentMode, Source: row.Source, Provider: row.Provider,
		AccountScope: row.AccountScope, ProviderReference: row.ProviderReference, ProviderEventID: row.ProviderEventID,
		JournalReference: row.JournalReference, GrossIDR: row.GrossIdr, FeeIDR: row.FeeIdr, MerchantNetIDR: row.MerchantNetIdr,
		Currency: row.Currency, PaidLate: row.PaidLate, PrecedingStatus: row.PrecedingStatus, Status: row.Status,
		PostedAt: row.PostedAt, CreatedAt: row.CreatedAt,
	}
}

func mapSettlementGet(row gen.CallbackGetSettlementByIntentRow) payments.Settlement {
	return payments.Settlement{
		ID: row.ID, PaymentIntentID: row.PaymentIntentID, OrderID: row.OrderID, MerchantID: row.MerchantID,
		StoreID: row.StoreID, PaymentMode: row.PaymentMode, Source: row.Source, Provider: row.Provider,
		AccountScope: row.AccountScope, ProviderReference: row.ProviderReference, ProviderEventID: row.ProviderEventID,
		JournalReference: row.JournalReference, GrossIDR: row.GrossIdr, FeeIDR: row.FeeIdr, MerchantNetIDR: row.MerchantNetIdr,
		Currency: row.Currency, PaidLate: row.PaidLate, PrecedingStatus: row.PrecedingStatus, Status: row.Status,
		PostedAt: row.PostedAt, CreatedAt: row.CreatedAt,
	}
}
